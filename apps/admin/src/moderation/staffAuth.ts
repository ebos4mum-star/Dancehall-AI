// Staff sign-in for the console: email and password, then a second factor (an authenticator-app code) before any moderation call is allowed.
// Talks to the project's Auth service directly. The access token lives in memory only (closing the tab signs out); nothing is written to storage.
export type StaffStep =
  { step: 'signed_out' } | { step: 'second_factor'; factorId: string } | { step: 'ready' };

interface Tokens {
  access_token: string;
  user?: { factors?: Array<{ id: string; factor_type: string; status: string }> };
}

export function createStaffAuth(cfg: {
  url: string;
  publishableKey: string;
  fetchImpl?: typeof fetch;
}) {
  const f = cfg.fetchImpl ?? fetch;
  const base = `${cfg.url.replace(/\/+$/, '')}/auth/v1`;
  /** The password-only token: kept just long enough to complete the second factor, never offered to callers. */
  let pending: string | null = null;
  let token: string | null = null;
  const headers = (auth?: string) => ({
    'content-type': 'application/json',
    apikey: cfg.publishableKey,
    ...(auth ? { authorization: `Bearer ${auth}` } : {}),
  });
  async function post(
    path: string,
    body: unknown,
    auth?: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const r = await f(`${base}${path}`, {
        method: 'POST',
        headers: headers(auth),
        body: JSON.stringify(body),
      });
      return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return {
    async signIn(email: string, password: string): Promise<StaffStep | { step: 'failed' }> {
      const r = (await post('/token?grant_type=password', { email, password })) as Tokens | null;
      if (!r?.access_token) return { step: 'failed' }; // one message for every failure: do not reveal which part was wrong
      pending = r.access_token;
      const totp = r.user?.factors?.find(
        (x) => x.factor_type === 'totp' && x.status === 'verified',
      );
      // No verified second factor: the console stays locked. Enrolling is done once, by the account owner, in the Auth dashboard.
      if (!totp) {
        pending = null;
        return { step: 'failed' };
      }
      return { step: 'second_factor', factorId: totp.id };
    },
    async verifyCode(factorId: string, code: string): Promise<StaffStep | { step: 'failed' }> {
      if (!pending || !/^\d{6}$/.test(code)) return { step: 'failed' };
      const ch = await post(`/factors/${encodeURIComponent(factorId)}/challenge`, {}, pending);
      if (!ch?.id) return { step: 'failed' };
      const v = (await post(
        `/factors/${encodeURIComponent(factorId)}/verify`,
        { challenge_id: ch.id, code },
        pending,
      )) as Tokens | null;
      if (!v?.access_token) return { step: 'failed' };
      token = v.access_token; // now carries the second-factor level the server requires
      pending = null;
      return { step: 'ready' };
    },
    getToken: async () => token,
    signOut() {
      pending = null;
      token = null;
    },
  };
}
