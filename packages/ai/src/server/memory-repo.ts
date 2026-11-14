import {
  buildCoachContext,
  FREE_ENTITLEMENT,
  type ConsentPurpose,
  type Entitlement,
  type WeekFacts,
} from '@dancehall/shared';
import type { ServerRepo } from './ports';

/** In-memory ServerRepo for development and tests. Mirrors the ownership rules of the database adapter. */
export class MemoryRepo implements ServerRepo {
  tokens = new Map<string, string>();
  consents = new Map<string, Set<ConsentPurpose>>();
  entitlements = new Map<string, Entitlement>();
  conversations = new Map<
    string,
    {
      userId: string;
      messages: Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        usedPersonalData?: boolean;
      }>;
    }
  >();
  reviews: Array<{ id: string; userId: string; weekStart: string; content: unknown }> = [];
  photos = new Map<
    string,
    { userId: string; path: string | null; status: string; result?: unknown; deleteAfter: Date }
  >();
  deletions = new Map<string, { id: string; scheduledFor: string }>();
  clock: () => Date = () => new Date();
  private n = 0;
  private id = () => `id-${++this.n}`;

  addUser(
    userId: string,
    token: string,
    consents: ConsentPurpose[],
    ent: Entitlement = FREE_ENTITLEMENT,
  ) {
    this.tokens.set(token, userId);
    this.consents.set(userId, new Set(consents));
    this.entitlements.set(userId, ent);
  }
  async authenticate(token: string) {
    const u = this.tokens.get(token);
    return u ? { userId: u } : null;
  }
  async entitlement(userId: string) {
    return this.entitlements.get(userId) ?? FREE_ENTITLEMENT;
  }
  async hasConsent(userId: string, p: ConsentPurpose) {
    return this.consents.get(userId)?.has(p) ?? false;
  }
  async coachContext(_u: string, personalized: boolean, now: Date) {
    return buildCoachContext({ personalized, unitSystem: 'metric', now });
  }
  async weekFacts(_u: string, weekStart: string): Promise<WeekFacts> {
    return {
      weekStart,
      sessions: 3,
      minutes: 80,
      activeDays: 3,
      foodLoggedDays: 4,
      styles: ['afrobeats'],
      lowImpactSessions: 1,
      weightTrend: null,
      activeGoals: 1,
    };
  }
  async conversationHistory(userId: string, id: string) {
    const c = this.conversations.get(id);
    if (!c || c.userId !== userId) return null;
    return c.messages.map((m) => ({ role: m.role, content: m.content }));
  }
  async createConversation(userId: string) {
    const id = this.id();
    this.conversations.set(id, { userId, messages: [] });
    return id;
  }
  async appendUserMessage(userId: string, conversationId: string, content: string) {
    const c = this.conversations.get(conversationId);
    if (!c || c.userId !== userId) throw new Error('not owner');
    const id = this.id();
    c.messages.push({ id, role: 'user', content });
    return id;
  }
  async appendAssistantMessage(
    userId: string,
    conversationId: string,
    reply: { message: string; usedPersonalData: boolean; proposedChanges: unknown[] },
  ) {
    const c = this.conversations.get(conversationId);
    if (!c || c.userId !== userId) throw new Error('not owner');
    const id = this.id();
    c.messages.push({
      id,
      role: 'assistant',
      content: reply.message,
      usedPersonalData: reply.usedPersonalData,
    });
    return { messageId: id, actionIds: reply.proposedChanges.map(() => this.id()) };
  }
  async saveWeeklyReview(userId: string, weekStart: string, content: unknown) {
    this.reviews = this.reviews.filter((r) => !(r.userId === userId && r.weekStart === weekStart));
    const id = this.id();
    this.reviews.push({ id, userId, weekStart, content });
    return id;
  }
  async beginPhotoAnalysis(userId: string, path: string) {
    const id = this.id();
    this.photos.set(id, {
      userId,
      path,
      status: 'uploaded',
      deleteAfter: new Date(this.clock().getTime() + 86_400_000),
    });
    return id;
  }
  async completePhotoAnalysis(id: string, result: unknown) {
    const p = this.photos.get(id)!;
    p.status = 'succeeded';
    p.result = result;
  }
  async failPhotoAnalysis(id: string) {
    this.photos.get(id)!.status = 'failed';
  }
  async expiredPhotos(now: Date) {
    return [...this.photos.entries()]
      .filter(([, p]) => p.status !== 'deleted' && p.deleteAfter <= now)
      .map(([id, p]) => ({ id, userId: p.userId, storagePath: p.path }));
  }
  async markPhotoDeleted(id: string) {
    const p = this.photos.get(id)!;
    p.status = 'deleted';
    p.path = null;
  }
  async requestAccountDeletion(userId: string, now: Date) {
    const open = this.deletions.get(userId);
    if (open) return open;
    const d = {
      id: this.id(),
      scheduledFor: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
    };
    this.deletions.set(userId, d);
    return d;
  }
  async cancelAccountDeletion(userId: string) {
    return this.deletions.delete(userId);
  }
}
