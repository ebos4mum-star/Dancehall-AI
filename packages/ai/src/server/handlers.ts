import {
  AppError,
  groundPhotoItems,
  toAppError,
  weekStartOf,
  type ConsentPurpose,
} from '@dancehall/shared';
import type { AiGateway } from '../gateway';
import { buildCoachPrompt, buildReviewPrompt } from '../prompts';
import {
  conciergeResponseSchema,
  foodPhotoResponseSchema,
  weeklyReviewResponseSchema,
} from '../schemas';
import type { PhotoStorage, ServerRepo } from './ports';

export interface ServerDeps {
  repo: ServerRepo;
  gateway: AiGateway;
  photos: PhotoStorage;
  now: () => Date;
  /** 'mock' until a live provider is deliberately enabled by the owner. Stored on every record so the UI can say so. */
  provider: 'mock' | 'live';
}

async function authenticate(deps: ServerDeps, token: string | null | undefined) {
  if (!token) throw new AppError('unauthenticated', 'Please sign in.');
  const who = await deps.repo.authenticate(token);
  if (!who) throw new AppError('unauthenticated', 'Please sign in again.');
  return who.userId;
}
async function requireConsents(deps: ServerDeps, userId: string, purposes: ConsentPurpose[]) {
  for (const p of purposes)
    if (!(await deps.repo.hasConsent(userId, p)))
      throw new AppError(
        'forbidden',
        'This needs your permission first. You can allow it in Privacy settings.',
      );
}

export interface CoachMessageInput {
  token: string | null | undefined;
  conversationId?: string | null;
  text: unknown;
}
/** Coach chat. Needs the health-data consent; the person's records are used only with the separate personalization consent. */
export async function handleCoachMessage(deps: ServerDeps, input: CoachMessageInput) {
  const userId = await authenticate(deps, input.token);
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (text.length < 1 || text.length > 1000)
    throw new AppError('validation_failed', 'Please write between 1 and 1000 characters.');
  await requireConsents(deps, userId, ['health_data_processing']);
  const personalized = await deps.repo.hasConsent(userId, 'ai_coach_personalization');

  let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let conversationId = input.conversationId ?? null;
  if (conversationId) {
    const h = await deps.repo.conversationHistory(userId, conversationId);
    if (!h) throw new AppError('not_found', 'That conversation was not found.'); // also covers someone else's conversation
    history = h;
  } else {
    conversationId = await deps.repo.createConversation(userId, text.slice(0, 40));
  }
  await deps.repo.appendUserMessage(userId, conversationId, text); // the question stays in history even if the reply fails

  const now = deps.now();
  const ctx = await deps.repo.coachContext(userId, personalized, now);
  const { data, outcome } = await deps.gateway.runDetailed({
    userId,
    entitlement: await deps.repo.entitlement(userId),
    feature: 'concierge_chat',
    prompt: buildCoachPrompt(ctx, text, history),
    userText: text,
  });
  const reply = conciergeResponseSchema.parse(data);
  const redirected = outcome === 'risk_referral' || outcome === 'safety_redirect';
  const saved = await deps.repo.appendAssistantMessage(
    userId,
    conversationId,
    {
      ...reply,
      proposedChanges: reply.proposedChanges.slice(0, 5),
      usedPersonalData: personalized && !redirected,
    },
    deps.provider,
  );
  return { conversationId, messageId: saved.messageId, reply, provider: deps.provider };
}

export interface WeeklyReviewInput {
  token: string | null | undefined;
  weekStart?: unknown;
}
/** A weekly review reads the person's records, so it needs BOTH the health-data and personalization consents. */
export async function handleWeeklyReview(deps: ServerDeps, input: WeeklyReviewInput) {
  const userId = await authenticate(deps, input.token);
  await requireConsents(deps, userId, ['health_data_processing', 'ai_coach_personalization']);
  const now = deps.now();
  let week = weekStartOf(now.toISOString().slice(0, 10));
  if (input.weekStart !== undefined) {
    if (
      typeof input.weekStart !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart) ||
      weekStartOf(input.weekStart) !== input.weekStart
    )
      throw new AppError('validation_failed', 'That week is not valid.');
    week = input.weekStart;
  }
  const facts = await deps.repo.weekFacts(userId, week, now);
  const { data } = await deps.gateway.runDetailed({
    userId,
    entitlement: await deps.repo.entitlement(userId),
    feature: 'weekly_review',
    prompt: buildReviewPrompt(facts),
  });
  const content = weeklyReviewResponseSchema.parse(data);
  const id = await deps.repo.saveWeeklyReview(userId, week, content, deps.provider);
  return { id, weekStart: week, content, provider: deps.provider };
}

export interface PhotoInput {
  token: string | null | undefined;
  /** Object path in the private bucket. Must live in the caller's own folder. */
  storagePath: unknown;
  /** Simulation seed (mock provider only). */
  seed?: number;
}
/**
 * Food-photo analysis. Needs health-data AND photo-AI consents. The image is read only from the caller's own folder, is never logged,
 * and the model's output is grounded to reference data (calories never come from the model). Retention: see runPhotoRetention.
 */
export async function handlePhotoAnalysis(deps: ServerDeps, input: PhotoInput) {
  const userId = await authenticate(deps, input.token);
  const path = input.storagePath;
  if (
    typeof path !== 'string' ||
    !path.startsWith(`${userId}/`) ||
    path.includes('..') ||
    path.length > 200
  )
    throw new AppError('forbidden', 'That photo is not yours.');
  await requireConsents(deps, userId, ['health_data_processing', 'ai_processing_of_food_photos']);
  const id = await deps.repo.beginPhotoAnalysis(userId, path, deps.provider);
  try {
    const { data } = await deps.gateway.runDetailed({
      userId,
      entitlement: await deps.repo.entitlement(userId),
      feature: 'food_photo',
      prompt: `mock-seed:${Number.isInteger(input.seed) ? input.seed : 0}`,
      hasImage: true,
    });
    const out = foodPhotoResponseSchema.parse(data);
    const items = groundPhotoItems(out.items);
    await deps.repo.completePhotoAnalysis(id, {
      items,
      notes: out.notes ?? null,
      provider: deps.provider,
    });
    return { analysisId: id, provider: deps.provider, items, notes: out.notes ?? null };
  } catch (e) {
    await deps.repo.failPhotoAnalysis(id); // failed uploads are still deleted within 24 hours (set at upload)
    throw e;
  }
}

/** Scheduled job: deletes expired photo files, then marks them deleted. One failure never blocks the rest. */
export async function runPhotoRetention(deps: Pick<ServerDeps, 'repo' | 'photos' | 'now'>) {
  const due = await deps.repo.expiredPhotos(deps.now());
  let deleted = 0;
  let failed = 0;
  for (const p of due) {
    try {
      if (p.storagePath) await deps.photos.remove(p.storagePath);
      await deps.repo.markPhotoDeleted(p.id); // only after the file is gone
      deleted++;
    } catch {
      failed++; // retried on the next run
    }
  }
  return { deleted, failed };
}

/** Account deletion REQUEST: records it with a configurable, cancellable grace period. Nothing is deleted here; the irreversible purge is a separate trusted job. */
export async function handleAccountDeletionRequest(
  deps: ServerDeps,
  token: string | null | undefined,
) {
  const userId = await authenticate(deps, token);
  const r = await deps.repo.requestAccountDeletion(
    userId,
    deps.now(),
    await deps.repo.deletionGraceDays(),
  );
  return { ...r, status: 'requested' as const, completed: false };
}
export async function handleAccountDeletionCancel(
  deps: ServerDeps,
  token: string | null | undefined,
) {
  const userId = await authenticate(deps, token);
  return { cancelled: await deps.repo.cancelAccountDeletion(userId) };
}

export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
}
export interface HttpResponse {
  status: number;
  json: unknown;
}
const bearer = (h: HttpRequest['headers']) =>
  /^Bearer (.+)$/i.exec(h.authorization ?? '')?.[1] ?? null;

/** Minimal transport-independent router (works behind an Edge Function, Node server or test harness). Errors never leak internals. */
export async function handleHttp(deps: ServerDeps, req: HttpRequest): Promise<HttpResponse> {
  try {
    const token = bearer(req.headers);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (req.method !== 'POST') throw new AppError('not_found', 'Not found.');
    switch (req.path) {
      case '/v1/coach/messages':
        return {
          status: 200,
          json: await handleCoachMessage(deps, {
            token,
            conversationId: typeof b.conversationId === 'string' ? b.conversationId : null,
            text: b.text,
          }),
        };
      case '/v1/coach/weekly-review':
        return {
          status: 200,
          json: await handleWeeklyReview(deps, { token, weekStart: b.weekStart }),
        };
      case '/v1/food/photo-analysis':
        return {
          status: 200,
          json: await handlePhotoAnalysis(deps, {
            token,
            storagePath: b.storagePath,
            seed: typeof b.seed === 'number' ? b.seed : undefined,
          }),
        };
      case '/v1/account/deletion':
        return { status: 202, json: await handleAccountDeletionRequest(deps, token) };
      case '/v1/account/deletion/cancel':
        return { status: 200, json: await handleAccountDeletionCancel(deps, token) };
      default:
        throw new AppError('not_found', 'Not found.');
    }
  } catch (e) {
    const err = toAppError(e);
    return {
      status: err.httpStatus,
      json: { error: { code: err.code, message: err.userMessage } },
    };
  }
}
