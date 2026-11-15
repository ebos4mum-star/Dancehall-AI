import { defineAccountSuite, type SuiteEnv } from './account-suite';
import { MemoryAccountDb } from './account-memory-db';

defineAccountSuite('in-memory reference', async (): Promise<SuiteEnv> => {
  const db = new MemoryAccountDb();
  const users = new Map<string, string>();
  const revoked: string[] = [];
  let n = 0;
  const auth: SuiteEnv['auth'] = {
    users,
    async createUser({ secret }) {
      if (auth.failCreate) throw new Error('auth down');
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      users.set(id, secret);
      return id;
    },
    async deleteUser(id) {
      users.delete(id);
    },
    async setSecret(id, secret) {
      auth.setSecretCalls = (auth.setSecretCalls ?? 0) + 1;
      if (auth.failSetSecret) throw new Error('auth down');
      users.set(id, secret);
      return `${id}@fake.invalid`;
    },
  };
  const realRevoke = db.revokeSessions.bind(db);
  db.revokeSessions = async (id) => {
    await realRevoke(id);
    revoked.push(id);
  };
  return { db, auth, revoked, failRevoke: () => (db.failRevoke = true) };
});
