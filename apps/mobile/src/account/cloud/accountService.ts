import {
  answersProof,
  checkQuestionSetup,
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
  recoveryDigest,
  type AnswerProblem,
} from '@dancehall/shared';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Session } from '@/data/types';
import type { VaultStorage } from '../pinVault';
import type { AccountApi, ApiReply } from './accountApi';

/**
 * Creating a cloud account, backing up its Recovery Key, recovering on a new phone, and rotating the key. Everything here is a sequence of small steps whose state is
 * written to the device's secure storage BEFORE the step that depends on it, so an interrupted setup resumes instead of creating a second account or losing the key,
 * and no step reports success until the server has said so. The PIN, the Recovery Key and the answers are never sent to the server in a recoverable form and are
 * never logged: the server gets a digest of the key and a slow-hash proof of the answers (see packages/shared/src/account-core.ts).
 */
export interface SignInPort {
  /** Signs in with the account's device credential (a long random secret, not the PIN) and returns the session. */
  signInWithDevice(identifier: string, secret: string): Promise<Session>;
}

export interface ServiceDeps {
  api: AccountApi;
  /** Secure storage (Keychain/Keystore on a phone). */
  secrets: VaultStorage;
  signIn: SignInPort;
  random: (n: number) => Uint8Array;
  now?: () => number;
  /** Called after a successful sign-in with the account identifier (the local simulation uses it to know which user this device is). */
  afterSignIn?: (identifier: string) => Promise<void>;
  /** scrypt cost override for tests only. */
  kdf?: { N: number; r: number; p: number; dkLen: number };
}

export type Answers = [{ id: string; answer: string }, { id: string; answer: string }];

export type Failure =
  | 'network' // nothing was changed; try again
  | 'unavailable' // the service could not finish; safe to retry
  | 'rate_limited'
  | 'invalid'
  | 'bad_key' // the key as typed is not a valid Recovery Key (checksum)
  | 'failed' // generic: wrong key, wrong answers, expired, locked — deliberately not distinguished
  | 'sign_in_failed'; // the account exists but this phone could not sign in yet; retrying resumes

export type Result<T = object> =
  ({ ok: true } & T) | { ok: false; reason: Failure; problem?: AnswerProblem };

const K_DEVICE = 'dh.device.v1';
const K_SETUP = 'dh.acct.setup.v1';
const K_RECOVER = 'dh.acct.recover.v1';
const K_BACKUP = 'dh.acct.backup.v1';

interface SetupDraft {
  v: 1;
  requestId: string;
  secret: string;
  key: string;
  digest: string;
  salt: string;
  proof: string;
  q1: string;
  q2: string;
  /** new: not yet sent. sent: the server may have created it. provisioned: it has, the phone is not signed in yet. */
  stage: 'new' | 'sent' | 'provisioned';
  identifier?: string;
}
interface RecoverDraft {
  v: 1;
  txId: string;
  completionSecret: string;
  readyAt: number;
  /** Chosen before the final call and kept, so a retry after a lost reply sends the identical request. */
  next?: { key: string; secret: string; digest: string };
}
interface BackupRecord {
  v: 1;
  /** The key is kept here ONLY until the person confirms they have saved it; confirming erases it from this device. */
  key?: string;
  state: 'pending' | 'confirmed';
  confirmedAt?: number;
  rotation?: { key: string; digest: string };
}

const b64url = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function createAccountService(deps: ServiceDeps) {
  const { api, secrets, random } = deps;
  const now = deps.now ?? Date.now;
  const read = async <T>(k: string): Promise<T | null> => {
    try {
      const raw = await secrets.get(k);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };
  const write = (k: string, v: unknown) => secrets.set(k, JSON.stringify(v));
  const newDeviceSecret = () => b64url(random(32)); // 256 bits → 43 URL-safe characters

  const failure = (r: Extract<ApiReply, { ok: false }>): Failure => {
    if (r.error === 'network') return 'network';
    if (r.error === 'rate_limited') return 'rate_limited';
    if (r.error === 'invalid_request') return 'invalid';
    if (r.error === 'recovery_failed') return 'failed';
    if (r.retry || r.status >= 500) return 'unavailable';
    return 'failed';
  };

  async function signInAndStore(identifier: string, secret: string): Promise<boolean> {
    try {
      await deps.signIn.signInWithDevice(identifier, secret);
      await write(K_DEVICE, { v: 1, identifier, secret });
      await deps.afterSignIn?.(identifier);
      return true;
    } catch {
      return false;
    }
  }

  // ----- creating an account ---------------------------------------------------------------------------------------------------------------------------

  /** True when an earlier setup was interrupted after the server may have created the account: it must be resumed, not started again. */
  async function pendingSetup(): Promise<{ stage: SetupDraft['stage'] } | null> {
    const d = await read<SetupDraft>(K_SETUP);
    return d ? { stage: d.stage } : null;
  }

  /**
   * Creates the account: makes the key and device secret on this phone, writes them to secure storage, asks the server to create the account, and signs in. Safe to
   * call again after any failure: the same request id and secret are reused, so the server returns the account it already made.
   */
  async function createAccount(input?: { answers: Answers }): Promise<Result<{ key: string }>> {
    let draft = await read<SetupDraft>(K_SETUP);
    if (!draft || (draft.stage === 'new' && input)) {
      if (!input) return { ok: false, reason: 'invalid' };
      const problem = checkQuestionSetup(input.answers[0], input.answers[1]);
      if (problem) return { ok: false, reason: 'invalid', problem };
      const key = generateRecoveryKey(random);
      const salt = bytesToHex(random(16));
      const proof = await answersProof(input.answers, salt, deps.kdf);
      const [a, b] = [...input.answers].sort((x, y) => (x.id < y.id ? -1 : 1));
      draft = {
        v: 1,
        requestId: bytesToHex(random(16)),
        secret: newDeviceSecret(),
        key,
        digest: recoveryDigest(key),
        salt,
        proof,
        q1: a!.id,
        q2: b!.id,
        stage: 'new',
      };
      await write(K_SETUP, draft); // BEFORE the network call: a crash after this resumes with the same ids
    }
    if (draft.stage !== 'provisioned') {
      await write(K_SETUP, { ...draft, stage: 'sent' });
      const r = await api.call('provision', {
        requestId: draft.requestId,
        deviceSecret: draft.secret,
        digest: draft.digest,
        proof: draft.proof,
        salt: draft.salt,
        q1: draft.q1,
        q2: draft.q2,
      });
      if (!r.ok) {
        if (r.error === 'key_unavailable') {
          // Astronomically unlikely, but handled: make a fresh key and let the caller try again.
          const key = generateRecoveryKey(random);
          await write(K_SETUP, { ...draft, key, digest: recoveryDigest(key), stage: 'sent' });
        }
        return { ok: false, reason: failure(r) };
      }
      draft = { ...draft, stage: 'provisioned', identifier: String(r.identifier) };
      await write(K_SETUP, draft);
    }
    if (!(await signInAndStore(draft.identifier!, draft.secret)))
      return { ok: false, reason: 'sign_in_failed' };
    await write(K_BACKUP, { v: 1, key: draft.key, state: 'pending' } satisfies BackupRecord);
    await secrets.remove(K_SETUP);
    return { ok: true, key: draft.key };
  }

  // ----- the Recovery Key and its backup ---------------------------------------------------------------------------------------------------------------

  async function backupState(): Promise<'none' | 'pending' | 'confirmed'> {
    const b = await read<BackupRecord>(K_BACKUP);
    return b ? b.state : 'none';
  }
  /** The key to show on the backup screen (grouped), only while the person has not yet confirmed saving it. */
  async function pendingKey(): Promise<string | null> {
    const b = await read<BackupRecord>(K_BACKUP);
    return b?.state === 'pending' && b.key ? formatRecoveryKey(b.key) : null;
  }
  /** The person says they saved the key: it is erased from this phone. From now on only they have it. */
  async function confirmBackup(): Promise<void> {
    await write(K_BACKUP, { v: 1, state: 'confirmed', confirmedAt: now() } satisfies BackupRecord);
  }

  async function status(): Promise<
    Result<{
      hasRecovery: boolean;
      questions: [string, string] | null;
      salt: string | null;
      pendingRecovery: { readyAt: number } | null;
    }>
  > {
    const r = await api.call('status');
    if (!r.ok) return { ok: false, reason: failure(r) };
    return {
      ok: true,
      hasRecovery: r.hasRecovery === true,
      questions: (r.questions as [string, string] | null) ?? null,
      salt: (r.salt as string | null) ?? null,
      pendingRecovery: (r.pendingRecovery as { readyAt: number } | null) ?? null,
    };
  }

  /** Replaces the Recovery Key (the old one stops working). Needs the person's answers. The new key is saved to secure storage before the call, so a lost reply cannot lose it. */
  async function rotateKey(answers: Answers): Promise<Result<{ key: string }>> {
    const st = await status();
    if (!st.ok) return st;
    if (!st.questions || !st.salt) return { ok: false, reason: 'failed' };
    const byId = new Map(answers.map((a) => [a.id, a]));
    const ordered = st.questions.map((q) => byId.get(q));
    if (ordered.some((x) => !x)) return { ok: false, reason: 'invalid' };
    const prior = await read<BackupRecord>(K_BACKUP);
    const next =
      prior?.rotation ??
      (() => {
        const key = generateRecoveryKey(random);
        return { key, digest: recoveryDigest(key) };
      })();
    await write(K_BACKUP, {
      ...(prior ?? { v: 1, state: 'confirmed' as const }),
      rotation: next,
    } satisfies BackupRecord);
    const proof = await answersProof(ordered as Answers, st.salt, deps.kdf);
    const r = await api.call('rotate', { proof, newDigest: next.digest });
    if (!r.ok) {
      if (r.error === 'answers_incorrect' || r.status === 403)
        await write(K_BACKUP, {
          ...(prior ?? { v: 1, state: 'confirmed' as const }),
          rotation: undefined,
        });
      return { ok: false, reason: r.error === 'answers_incorrect' ? 'failed' : failure(r) };
    }
    await write(K_BACKUP, { v: 1, key: next.key, state: 'pending' } satisfies BackupRecord);
    return { ok: true, key: next.key };
  }

  // ----- recovery on a new phone -----------------------------------------------------------------------------------------------------------------------

  /** Step 1: the typed Recovery Key. The reply is shaped the same whether or not the key belongs to an account, so this alone reveals nothing. */
  async function recoverBegin(
    typedKey: string,
  ): Promise<Result<{ txId: string; questions: [string, string]; salt: string }>> {
    const key = parseRecoveryKey(typedKey);
    if (!key) return { ok: false, reason: 'bad_key' };
    const r = await api.call('recover/start', { digest: recoveryDigest(key) });
    if (!r.ok) return { ok: false, reason: failure(r) };
    return {
      ok: true,
      txId: String(r.txId),
      questions: r.questions as [string, string],
      salt: String(r.salt),
    };
  }

  /** Step 2: the two answers. A wrong key and a wrong answer look identical (`failed`). Success starts the cooling-off. */
  async function recoverVerify(
    tx: { txId: string; salt: string },
    answers: Answers,
  ): Promise<Result<{ readyAt: number }>> {
    const proof = await answersProof(answers, tx.salt, deps.kdf);
    const completionSecret = bytesToHex(random(32));
    const r = await api.call('recover/verify', { txId: tx.txId, proof, completionSecret });
    if (!r.ok) return { ok: false, reason: failure(r) };
    const readyAt = Number(r.readyAt);
    await write(K_RECOVER, {
      v: 1,
      txId: tx.txId,
      completionSecret,
      readyAt,
    } satisfies RecoverDraft);
    return { ok: true, readyAt };
  }

  async function recoveryInProgress(): Promise<{ readyAt: number } | null> {
    const d = await read<RecoverDraft>(K_RECOVER);
    return d ? { readyAt: d.readyAt } : null;
  }

  /**
   * Step 3, after the cooling-off: makes the new Recovery Key and device secret, tells the server (which replaces the old secret and signs every other device out),
   * then signs this phone in as the SAME account. Returns `waiting` while the cooling-off runs. Safe to repeat after a lost reply.
   */
  async function recoverFinish(): Promise<Result<{ waiting?: { readyAt: number }; key?: string }>> {
    const d = await read<RecoverDraft>(K_RECOVER);
    if (!d) return { ok: false, reason: 'failed' };
    if (now() < d.readyAt) return { ok: true, waiting: { readyAt: d.readyAt } };
    let next = d.next;
    if (!next) {
      const key = generateRecoveryKey(random);
      next = { key, secret: newDeviceSecret(), digest: recoveryDigest(key) };
      await write(K_RECOVER, { ...d, next }); // BEFORE the call
    }
    const r = await api.call('recover/complete', {
      txId: d.txId,
      completionSecret: d.completionSecret,
      deviceSecret: next.secret,
      newDigest: next.digest,
    });
    if (!r.ok) {
      if (r.error === 'cooling_off')
        return { ok: true, waiting: { readyAt: r.readyAt ?? d.readyAt } };
      if (!r.retry && r.error !== 'network') await secrets.remove(K_RECOVER);
      return { ok: false, reason: failure(r) };
    }
    if (!(await signInAndStore(String(r.identifier), next.secret)))
      return { ok: false, reason: 'sign_in_failed' };
    await write(K_BACKUP, { v: 1, key: next.key, state: 'pending' } satisfies BackupRecord);
    await secrets.remove(K_RECOVER);
    return { ok: true, key: next.key };
  }

  async function cancelRecoveryDraft(): Promise<void> {
    await secrets.remove(K_RECOVER);
  }
  /** Signed in: cancels any recovery someone has started on this account (e.g. a thief with the key and answers). */
  async function cancelServerRecovery(): Promise<Result<{ cancelled: number }>> {
    const r = await api.call('recover/cancel');
    return r.ok ? { ok: true, cancelled: Number(r.cancelled) } : { ok: false, reason: failure(r) };
  }

  // ----- the device credential -------------------------------------------------------------------------------------------------------------------------

  /** Signs in again with the stored device credential, e.g. when the session is gone but this phone still holds the credential. */
  async function restoreSession(): Promise<
    'signed_in' | 'no_credential' | 'rejected' | 'unreachable'
  > {
    const c = await read<{ identifier: string; secret: string }>(K_DEVICE);
    if (!c) return 'no_credential';
    try {
      await deps.signIn.signInWithDevice(c.identifier, c.secret);
      await deps.afterSignIn?.(c.identifier);
      return 'signed_in';
    } catch (e) {
      if ((e as { code?: string })?.code !== 'not_authenticated') return 'unreachable';
      // The server refused the credential: it was replaced by a recovery on another phone. This phone is no longer the account's device.
      await secrets.remove(K_DEVICE);
      return 'rejected';
    }
  }
  async function hasDeviceCredential(): Promise<boolean> {
    return (await read(K_DEVICE)) !== null;
  }
  /** Forgets everything this phone holds for the account (sign out of this device). Nothing is deleted from the cloud. */
  async function forgetDevice(): Promise<void> {
    await Promise.all([K_DEVICE, K_SETUP, K_RECOVER, K_BACKUP].map((k) => secrets.remove(k)));
  }

  return {
    pendingSetup,
    createAccount,
    backupState,
    pendingKey,
    confirmBackup,
    status,
    rotateKey,
    recoverBegin,
    recoverVerify,
    recoveryInProgress,
    recoverFinish,
    cancelRecoveryDraft,
    cancelServerRecovery,
    restoreSession,
    hasDeviceCredential,
    forgetDevice,
    kind: api.kind,
  };
}
export type AccountService = ReturnType<typeof createAccountService>;
