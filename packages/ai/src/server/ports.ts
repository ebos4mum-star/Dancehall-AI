import type { CoachContext, ConsentPurpose, Entitlement, WeekFacts } from '@dancehall/shared';
import type { ConciergeResponse, WeeklyReviewResponse } from '../schemas';

/**
 * Everything the server handlers need from storage. The Supabase implementation (supabase-repo.ts) runs with the SERVICE ROLE inside
 * trusted server code; every method takes the verified userId and must scope every query to it. Nothing here trusts the client.
 */
export interface ServerRepo {
  /** Verifies a bearer token and returns the person it belongs to, or null. */
  authenticate(token: string): Promise<{ userId: string } | null>;
  entitlement(userId: string): Promise<Entitlement>;
  hasConsent(userId: string, purpose: ConsentPurpose): Promise<boolean>;
  coachContext(userId: string, personalized: boolean, now: Date): Promise<CoachContext>;
  weekFacts(userId: string, weekStart: string, now: Date): Promise<WeekFacts>;
  /** Recent messages of a conversation the person OWNS, or null when it does not exist or is not theirs. */
  conversationHistory(
    userId: string,
    conversationId: string,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }> | null>;
  createConversation(userId: string, title: string): Promise<string>;
  appendUserMessage(userId: string, conversationId: string, content: string): Promise<string>;
  appendAssistantMessage(
    userId: string,
    conversationId: string,
    reply: ConciergeResponse & { usedPersonalData: boolean },
    provider: 'mock' | 'live',
  ): Promise<{ messageId: string; actionIds: string[] }>;
  saveWeeklyReview(
    userId: string,
    weekStart: string,
    content: WeeklyReviewResponse,
    provider: 'mock' | 'live',
  ): Promise<string>;
  beginPhotoAnalysis(
    userId: string,
    storagePath: string,
    provider: 'mock' | 'live',
  ): Promise<string>;
  completePhotoAnalysis(id: string, result: unknown): Promise<void>;
  failPhotoAnalysis(id: string): Promise<void>;
  /** Photos past their retention deadline (24 hours after analysis or failed upload, unless saved). */
  expiredPhotos(
    now: Date,
  ): Promise<Array<{ id: string; userId: string; storagePath: string | null }>>;
  markPhotoDeleted(id: string): Promise<void>;
  /** Records the person's request to delete their account. Idempotent while one is open. */
  /** Waiting period before an account is actually deleted. CONFIGURATION (public.app_config), not a finalized policy. */
  deletionGraceDays(): Promise<number>;
  requestAccountDeletion(
    userId: string,
    now: Date,
    graceDays: number,
  ): Promise<{ id: string; scheduledFor: string }>;
  cancelAccountDeletion(userId: string): Promise<boolean>;
}

/** Private bucket holding temporary meal photos. */
export interface PhotoStorage {
  remove(path: string): Promise<void>;
}
