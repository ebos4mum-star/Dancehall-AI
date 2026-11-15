/**
 * The same suite as the in-memory reference, run against the REAL SQL functions on a local Postgres that already has supabase/tests/shim.sql and the migrations
 * applied. Skipped unless DH_ACCOUNT_PG_URL is set (CI's database job sets it). Touches only that local database.
 */
import { describe, it } from 'vitest';
import pg from 'pg';
import { defineAccountSuite, type SuiteEnv } from './account-suite';
import { createRpcAccountDb } from './account-rpc-db';

const url = process.env.DH_ACCOUNT_PG_URL;

if (!url) {
  describe.skip('account core (postgres)', () => it('needs DH_ACCOUNT_PG_URL', () => {}));
} else {
  const pool = new pg.Pool({ connectionString: url, max: 8 });
  let n = 0;
  defineAccountSuite('postgres functions', async (): Promise<SuiteEnv> => {
    await pool.query('truncate app.acct_tx, app.acct_recovery, app.acct_provisioning, app.acct_hits, auth.users cascade');
    const db = createRpcAccountDb(async (fn, args) => (await pool.query(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(args)])).rows[0].r);
    const users = new Map<string, string>();
    const revoked: string[] = [];
    let failRevoke = false;
    const auth: SuiteEnv['auth'] = {
      users,
      async createUser({ identifier, secret }) {
        if (auth.failCreate) throw new Error('auth down');
        const id = (await pool.query('insert into auth.users (email) values ($1) returning id', [identifier])).rows[0].id as string;
        users.set(id, secret);
        return id;
      },
      async deleteUser(id) {
        await pool.query('delete from auth.users where id = $1', [id]);
        users.delete(id);
      },
      async setSecret(id, secret) {
        if (auth.failSetSecret) throw new Error('auth down');
        users.set(id, secret);
      },
    };
    const realRevoke = db.revokeSessions.bind(db);
    db.revokeSessions = async (id) => {
      if (failRevoke) {
        failRevoke = false;
        throw new Error('revoke failed');
      }
      await realRevoke(id);
      revoked.push(id);
    };
    void n++;
    return { db, auth, revoked, failRevoke: () => (failRevoke = true) };
  });
}
