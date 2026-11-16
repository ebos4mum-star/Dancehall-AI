// A local STAND-IN for the parts of the Supabase platform the `community` Edge Function talks to: Auth (verify a token), the REST function call, and private Storage with
// signed links. It exists only so the REAL function (running under Deno) and the REAL SQL can be exercised together on one machine. It is not Supabase: it implements just
// enough of the wire format, and it is deliberately strict (a token must be correctly signed and unexpired; storage is private; every database call runs as service_role).
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { userInfo } from 'node:os';
import pg from 'pg';

/** Connection options: the PG* variables if set, otherwise the current OS user over the local socket (as psql does). */
export const pgOptions = (database) => ({
  database,
  user: process.env.PGUSER || userInfo().username,
  ...(process.env.PGHOST ? {} : { host: '/var/run/postgresql' }),
});

const b64u = (b) => Buffer.from(b).toString('base64url');
export function signJwt(payload, secret) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}
export function verifyJwt(token, secret, nowS) {
  const [h, p, s] = String(token).split('.');
  if (!h || !p || !s) return null;
  const want = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  let got;
  try {
    got = Buffer.from(s, 'base64url');
  } catch {
    return null;
  }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (typeof payload.exp === 'number' && payload.exp <= nowS) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function startPlatform({ port, database, jwtSecret, serviceKey }) {
  const pool = new pg.Pool({ ...pgOptions(database), max: 4 });
  const files = new Map(); // "bucket/path" -> { bytes, type }
  const state = { clockOffsetS: 0, rpcDown: false, mail: [], rpcLog: [], downloads: 0 };
  const now = () => Math.floor(Date.now() / 1000) + state.clockOffsetS;
  const send = (res, status, body, type = 'application/json') => {
    if (process.env.E2E_DEBUG && status >= 400 && status !== 404)
      console.error(
        'PLATFORM',
        status,
        res.req?.method,
        res.req?.url,
        Buffer.isBuffer(body) ? '' : JSON.stringify(body).slice(0, 200),
      );
    res.writeHead(status, { 'content-type': type });
    res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
  };
  const isService = (req) =>
    (req.headers.authorization ?? '') === `Bearer ${serviceKey}` &&
    req.headers.apikey === serviceKey;
  const readBody = (req) =>
    new Promise((r) => {
      const c = [];
      req.on('data', (d) => c.push(d));
      req.on('end', () => r(Buffer.concat(c)));
    });
  const objToken = (kind, key, ttl) => signJwt({ kind, key, exp: now() + ttl }, jwtSecret);
  const checkObjToken = (t, kind, key) => {
    const p = verifyJwt(t, jwtSecret, now());
    return !!p && p.kind === kind && p.key === key;
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = decodeURIComponent(url.pathname);
    try {
      // ---- test controls ----
      if (path === '/__test/clock' && req.method === 'POST') {
        state.clockOffsetS = JSON.parse((await readBody(req)).toString()).offsetS;
        return send(res, 200, { ok: true });
      }
      if (path === '/__test/rpc-down' && req.method === 'POST') {
        state.rpcDown = JSON.parse((await readBody(req)).toString()).down;
        return send(res, 200, { ok: true });
      }
      if (path === '/__test/mail') return send(res, 200, state.mail);
      if (path === '/__test/files') return send(res, 200, [...files.keys()]);
      if (path.startsWith('/__test/file/')) {
        const f = files.get(path.slice('/__test/file/'.length));
        return f ? send(res, 200, f.bytes, f.type) : send(res, 404, { message: 'no such file' });
      }
      if (path === '/__test/rpclog') return send(res, 200, state.rpcLog);
      if (path === '/__test/downloads') return send(res, 200, { n: state.downloads });

      // ---- email provider stand-in ----
      if (path === '/mail/send' && req.method === 'POST') {
        if (req.headers.authorization !== 'Bearer test-mail-key')
          return send(res, 401, { message: 'bad key' });
        state.mail.push(JSON.parse((await readBody(req)).toString()));
        return send(res, 200, { id: 'm1' });
      }

      // ---- Auth ----
      if (path === '/auth/v1/user' && req.method === 'GET') {
        const tok = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
        const p = verifyJwt(tok, jwtSecret, now());
        if (!p || !p.sub || p.role !== 'authenticated')
          return send(res, 401, { code: 401, msg: 'invalid JWT' });
        return send(res, 200, {
          id: p.sub,
          aud: 'authenticated',
          role: 'authenticated',
          email: `u${p.sub.replace(/-/g, '')}@accounts.dancehall.invalid`,
        });
      }

      // ---- REST: the one door ----
      const door = /^\/rest\/v1\/rpc\/(community_rpc|social_rpc|gm_rpc)$/.exec(path)?.[1];
      if (door && req.method === 'POST') {
        if (!isService(req)) return send(res, 401, { message: 'permission denied' });
        if (state.rpcDown) return send(res, 503, { message: 'database unavailable' });
        const { fn, args } = JSON.parse((await readBody(req)).toString());
        state.rpcLog.push(fn);
        const c = await pool.connect();
        try {
          await c.query('begin');
          await c.query('set local role service_role'); // exactly the privileges the real server key has
          const r = await c.query(`select public.${door}($1, $2::jsonb) as r`, [
            fn,
            JSON.stringify(args ?? {}),
          ]);
          await c.query('commit');
          return send(res, 200, JSON.stringify(r.rows[0].r));
        } catch (e) {
          await c.query('rollback').catch(() => {});
          return send(res, 400, {
            code: e.code ?? 'P0001',
            message: e.message,
            details: null,
            hint: null,
          });
        } finally {
          c.release();
        }
      }

      // ---- Storage (private bucket) ----
      const m = path.match(/^\/storage\/v1\/(.*)$/);
      if (m) {
        const rest = m[1];
        let g;
        if ((g = rest.match(/^object\/upload\/sign\/(.+)$/))) {
          const key = g[1];
          if (req.method === 'POST') {
            if (!isService(req)) return send(res, 401, { message: 'unauthorized' });
            return send(res, 200, {
              url: `/object/upload/sign/${key}?token=${objToken('upload', key, 7200)}`,
            });
          }
          if (req.method === 'PUT') {
            if (!checkObjToken(url.searchParams.get('token'), 'upload', key))
              return send(res, 403, { message: 'invalid upload token' });
            files.set(key, {
              bytes: await readBody(req),
              type: req.headers['content-type'] ?? 'application/octet-stream',
            });
            return send(res, 200, { Key: key });
          }
        }
        if ((g = rest.match(/^object\/sign\/(.+)$/))) {
          const key = g[1];
          if (req.method === 'POST') {
            if (!isService(req)) return send(res, 401, { message: 'unauthorized' });
            if (!files.has(key)) return send(res, 404, { message: 'Object not found' });
            const { expiresIn } = JSON.parse((await readBody(req)).toString());
            return send(res, 200, {
              signedURL: `/object/sign/${key}?token=${objToken('view', key, expiresIn)}`,
            });
          }
          if (req.method === 'GET' || req.method === 'HEAD') {
            if (!checkObjToken(url.searchParams.get('token'), 'view', key))
              return send(res, 400, { message: 'invalid or expired signature' });
            const f = files.get(key);
            if (f && req.method === 'HEAD') {
              res.writeHead(200, { 'content-type': f.type, 'content-length': f.bytes.length });
              return res.end();
            }
            return f
              ? send(res, 200, f.bytes, f.type)
              : send(res, 404, { message: 'Object not found' });
          }
        }
        if ((g = rest.match(/^object\/([^/]+)$/)) && req.method === 'DELETE') {
          if (!isService(req)) return send(res, 401, { message: 'unauthorized' });
          const { prefixes } = JSON.parse((await readBody(req)).toString());
          for (const p of prefixes) files.delete(`${g[1]}/${p}`);
          return send(res, 200, []);
        }
        if ((g = rest.match(/^object\/(.+)$/))) {
          const key = g[1];
          if (!isService(req))
            return send(res, 400, {
              message: 'private bucket: anonymous and signed-in access is refused',
            }); // no public or per-user policy exists
          if (req.method === 'GET') {
            state.downloads++;
            const f = files.get(key);
            return f
              ? send(res, 200, f.bytes, f.type)
              : send(res, 404, { message: 'Object not found' });
          }
          if (req.method === 'POST') {
            files.set(key, {
              bytes: await readBody(req),
              type: req.headers['content-type'] ?? 'application/octet-stream',
            });
            return send(res, 200, { Key: key, Id: key });
          }
        }
      }
      return send(res, 404, { message: `no stand-in route for ${req.method} ${path}` });
    } catch (e) {
      return send(res, 500, { message: String(e.message ?? e) });
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return {
    state,
    files,
    close: async () => {
      server.close();
      await pool.end();
    },
  };
}
