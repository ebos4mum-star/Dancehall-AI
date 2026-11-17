import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, toAppError } from '@dancehall/shared';
import { AiGateway } from './gateway';
import { MockAiProvider } from './provider';
import { handleHttp, type ServerDeps } from './server/handlers';
import { SupabasePhotoStorage, SupabaseServerRepo } from './server/supabase-repo';
import {
  SupabaseBudgetPort,
  SupabaseQuotaPort,
  SupabaseStaffControls,
  SupabaseUsageStore,
  SupabaseUserAiPause,
} from './supabase-ports';

/**
 * The deployable shell around the AI gateway (supabase/functions/ai). Everything that decides whether a request is allowed already lives in the gateway and the handlers (kill switches,
 * safety screen, consent, monthly allowance, budget reservation). This file only decides WHAT the function may serve and refuses to start unless the owner said so explicitly:
 *  - `AI_PROVIDER` must be exactly `mock`. Unset, empty or anything else (including `live`, which is not implemented) serves nothing. The simulated provider is therefore never a default.
 *  - `AI_ROUTES` selects route groups. Default `coach`. `photo` (meal-photo analysis) is a separate opt-in because a simulated analysis of a real photo would be fabricated nutrition.
 *  - The account-deletion routes of the handler are never exposed: deletion goes through the account function and the database.
 * Every reply the gateway stores carries its provider (`mock`), and the app shows a "SIMULATED REPLY" tag on it.
 */
export type AiRouteGroup = 'coach' | 'photo';
export const ROUTES: Readonly<Record<AiRouteGroup, readonly string[]>> = {
  coach: ['/v1/coach/messages', '/v1/coach/weekly-review'],
  photo: ['/v1/food/photo-analysis'],
};
/** Routes the handler knows but this function never serves, whatever the configuration. */
const NEVER = new Set(['/v1/account/deletion', '/v1/account/deletion/cancel']);

export interface AiEdgeConfig {
  provider: 'mock';
  routes: readonly AiRouteGroup[];
}
export type AiEdgeConfigResult =
  | { ok: true; config: AiEdgeConfig }
  | { ok: false; reason: 'provider_not_set' | 'live_provider_not_implemented' | 'bad_routes' };

export function resolveAiEdgeConfig(env: {
  AI_PROVIDER?: string | null;
  AI_ROUTES?: string | null;
}): AiEdgeConfigResult {
  const provider = (env.AI_PROVIDER ?? '').trim();
  if (provider === 'live') return { ok: false, reason: 'live_provider_not_implemented' };
  if (provider !== 'mock') return { ok: false, reason: 'provider_not_set' };
  const raw = (env.AI_ROUTES ?? '').trim() || 'coach';
  const groups = raw.split(',').map((x) => x.trim());
  if (
    !groups.every((g): g is AiRouteGroup => g === 'coach' || g === 'photo') ||
    groups.length === 0
  )
    return { ok: false, reason: 'bad_routes' };
  return { ok: true, config: { provider: 'mock', routes: [...new Set(groups)] } };
}

/** The simulated provider's model names. The gateway refuses to run for a model without a price entry, and these have one (placeholder prices: no money is involved). */
export const AI_EDGE_MODELS = {
  food_photo: 'mock-large',
  concierge_chat: 'mock-small',
  weekly_review: 'mock-small',
} as const;

/** The gateway wired to the database ports. The monthly ceiling, the per-person allowance and the kill switches all live in the database, read on every request. */
export function buildServerDeps(
  db: SupabaseClient,
  now: () => Date = () => new Date(),
): ServerDeps {
  const gateway = new AiGateway(
    new MockAiProvider(),
    new SupabaseUsageStore(db),
    {
      flags: { ai_gateway: true },
      killAll: false,
      killFeatures: {},
      models: AI_EDGE_MODELS as never,
      maxOutputTokens: 800,
      now,
    },
    undefined,
    {
      budget: new SupabaseBudgetPort(db),
      quota: new SupabaseQuotaPort(db),
      staff: new SupabaseStaffControls(db),
      userPause: new SupabaseUserAiPause(db),
    },
  );
  return {
    repo: new SupabaseServerRepo(db),
    gateway,
    photos: new SupabasePhotoStorage(db),
    now,
    provider: 'mock',
  };
}

const MAX_BODY = 8192;
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
const failure = (code: string, message: string, status: number): Response =>
  json(status, { error: { code, message } });

/** The function's own answer when the owner has not configured it: a plain refusal that reveals nothing. */
export const notConfigured = (): Response =>
  failure('feature_disabled', 'This feature is temporarily unavailable.', 503);

/** `/functions/v1/ai/v1/coach/messages` and `/v1/coach/messages` both mean the same route; anything else becomes '' (no route). */
export const routeOf = (url: string): string => {
  const path = new URL(url).pathname.replace(/^.*\/ai(?=\/v1\/)/, '').replace(/\/$/, '');
  return /^\/v1\/[A-Za-z0-9/_-]*$/.test(path) ? path : '';
};

export function createAiEdgeHandler(
  deps: ServerDeps,
  config: AiEdgeConfig,
): (req: Request) => Promise<Response> {
  const served = new Set(config.routes.flatMap((g) => ROUTES[g]));
  const known = new Set(Object.values(ROUTES).flat());
  return async (req) => {
    try {
      if (req.method !== 'POST') return failure('method_not_allowed', 'Not found.', 405);
      const path = routeOf(req.url);
      if (NEVER.has(path) || !(known.has(path) || served.has(path)))
        return failure('not_found', 'Not found.', 404);
      // A route the function knows but was not switched on answers like a feature that is off: the app already words that kindly.
      if (!served.has(path))
        return failure('feature_disabled', 'This feature is temporarily unavailable.', 503);
      if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY)
        return failure('validation_failed', 'That request is too large.', 413);
      const text = await req.text();
      if (text.length > MAX_BODY)
        return failure('validation_failed', 'That request is too large.', 413);
      let body: unknown = {};
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          return failure('validation_failed', 'That request could not be read.', 400);
        }
      }
      const r = await handleHttp(deps, {
        method: 'POST',
        path,
        headers: { authorization: req.headers.get('authorization') ?? undefined },
        body,
      });
      return json(r.status, r.json);
    } catch (e) {
      // Nothing about the failure is returned: a stack, a table name or a query never leaves the function.
      const err = e instanceof AppError ? e : toAppError(e);
      return failure(err.code, err.userMessage, err.httpStatus);
    }
  };
}
