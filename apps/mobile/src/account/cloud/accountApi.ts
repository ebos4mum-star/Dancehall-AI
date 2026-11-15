import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MemoryAccountDb,
  createAccountCore,
  type AccountCore,
  type AuthAdmin,
  type MemorySnapshot,
} from '@dancehall/shared';

/** What the account service gets back from any operation. `error` is a short code, never a message that could carry a secret. */
export type ApiReply =
  | ({ ok: true } & Record<string, unknown>)
  | { ok: false; error: string; status: number; retry?: boolean; readyAt?: number };

/** One method: the operation name (`provision`, `recover/start`, …) and its JSON body. Authenticated operations attach the session themselves. */
export interface AccountApi {
  readonly kind: 'edge' | 'simulation';
  call(op: string, body?: Record<string, unknown>): Promise<ApiReply>;
}

const TIMEOUT_MS = 20_000;

/**
 * Talks to the `account` Edge Function. The publishable key identifies the project (it is public); signed-in operations also send the session's access token.
 * Network failures and timeouts become `{ error: 'network', retry: true }` so the caller can say "nothing was changed" or retry safely, never "done".
 */
export function createEdgeAccountApi(cfg: {
  url: string;
  publishableKey: string;
  getToken(): Promise<string | null>;
  fetchImpl?: typeof fetch;
}): AccountApi {
  const f = cfg.fetchImpl ?? fetch;
  const AUTHED = new Set(['recover/cancel', 'rotate', 'status']);
  return {
    kind: 'edge',
    async call(op, body = {}) {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        apikey: cfg.publishableKey,
      };
      if (AUTHED.has(op)) {
        const token = await cfg.getToken();
        if (!token) return { ok: false, error: 'unauthenticated', status: 401 };
        headers.authorization = `Bearer ${token}`;
      } else headers.authorization = `Bearer ${cfg.publishableKey}`;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const res = await f(`${cfg.url.replace(/\/+$/, '')}/functions/v1/account/${op}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: ctl.signal,
        });
        let json: Record<string, unknown> = {};
        try {
          json = (await res.json()) as Record<string, unknown>;
        } catch {
          /* a non-JSON reply is treated as a failure below */
        }
        if (res.ok && json.ok === true) return json as ApiReply;
        return {
          ok: false,
          error: typeof json.error === 'string' ? json.error : 'failed',
          status: res.status,
          ...(json.retry === true || res.status >= 500 ? { retry: true } : {}),
          ...(typeof json.readyAt === 'number' ? { readyAt: json.readyAt } : {}),
        };
      } catch {
        return { ok: false, error: 'network', status: 0, retry: true };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// LOCAL SIMULATION. This is NOT a server and proves nothing about the hosted service: it runs the same account logic (packages/shared) against an in-memory
// database kept in this browser/device, so the screens and flows can be built and tested before any Supabase change is approved. The cooling-off is 5 seconds
// here (24 hours in production). It is used only in the development mock build, and the app says so on screen.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

export const SIM_KEY = 'dh.devcloud.v1';
export const SIM_COOLING_OFF_MS = 5_000;
const SIM_PEPPER = new Uint8Array(32).fill(0x5a);

interface SimState {
  db: MemorySnapshot;
  users: [string, { secret: string; identifier: string }][];
  currentUser: string | null;
}

export interface SimulationApi extends AccountApi {
  kind: 'simulation';
  /** The simulated user the signed-in device belongs to (the simulation has no real sessions). */
  setCurrentUser(id: string | null): Promise<void>;
  currentUser(): Promise<string | null>;
}

export function createSimulationAccountApi(
  random: (n: number) => Uint8Array,
  storage: {
    getItem(k: string): Promise<string | null>;
    setItem(k: string, v: string): Promise<void>;
  } = AsyncStorage,
  now: () => number = Date.now,
): SimulationApi {
  let loaded: {
    db: MemoryAccountDb;
    users: Map<string, { secret: string; identifier: string }>;
    current: string | null;
  } | null = null;
  let core: AccountCore | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  async function load() {
    if (loaded && core) return loaded;
    let st: SimState | null = null;
    try {
      const raw = await storage.getItem(SIM_KEY);
      st = raw ? (JSON.parse(raw) as SimState) : null;
    } catch {
      st = null;
    }
    const db = st ? MemoryAccountDb.restore(st.db) : new MemoryAccountDb();
    const users = new Map(st?.users ?? []);
    loaded = { db, users, current: st?.currentUser ?? null };
    const uuid = () => {
      const h = [...random(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
    };
    const auth: AuthAdmin = {
      async createUser({ identifier, secret }) {
        const id = uuid();
        users.set(id, { secret, identifier });
        return id;
      },
      async deleteUser(id) {
        users.delete(id);
      },
      async setSecret(id, secret) {
        const u = users.get(id);
        if (!u) throw new Error('no user');
        u.secret = secret;
        return u.identifier;
      },
    };
    core = createAccountCore({
      db,
      auth,
      random,
      now,
      pepper: SIM_PEPPER,
      policy: { coolingOffMs: SIM_COOLING_OFF_MS },
    });
    return loaded;
  }
  async function save() {
    if (!loaded) return;
    const st: SimState = {
      db: loaded.db.snapshot(),
      users: [...loaded.users],
      currentUser: loaded.current,
    };
    await storage.setItem(SIM_KEY, JSON.stringify(st));
  }
  // Operations run one at a time, like a single-threaded server, so the simulation never interleaves two of them.
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  return {
    kind: 'simulation',
    call: (op, body = {}) =>
      serial(async (): Promise<ApiReply> => {
        const s = await load();
        const r = await core!.handle(op, body, {
          ipBucket: 'local',
          ...(s.current ? { userId: s.current } : {}),
        });
        // A successful provision makes the new account this device's account; a completed recovery does the same.
        await save();
        if (r.status === 200) return { ok: true, ...r.body };
        return {
          ok: false,
          error: typeof r.body.error === 'string' ? r.body.error : 'failed',
          status: r.status,
          ...(r.body.retry === true ? { retry: true } : {}),
          ...(typeof r.body.readyAt === 'number' ? { readyAt: r.body.readyAt } : {}),
        };
      }),
    setCurrentUser: (id) =>
      serial(async () => {
        const s = await load();
        s.current = id;
        await save();
      }),
    currentUser: () => serial(async () => (await load()).current),
  };
}

/** Finds the simulated user that owns an identifier (the simulation's stand-in for "the server knows who signed in"). */
export async function simulationUserFor(
  storage: { getItem(k: string): Promise<string | null> },
  identifier: string,
): Promise<string | null> {
  try {
    const st = JSON.parse((await storage.getItem(SIM_KEY)) ?? 'null') as SimState | null;
    return st?.users.find(([, u]) => u.identifier === identifier)?.[0] ?? null;
  } catch {
    return null;
  }
}
