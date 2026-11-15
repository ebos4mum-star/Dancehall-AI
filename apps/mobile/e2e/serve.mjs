import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// E2E_DIST selects another export (for example dist-fixtures); the default is the normal build.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', process.env.E2E_DIST ?? 'dist');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
};
// A synthetic test pattern (not a demonstration) served only by this test server, with byte ranges so a browser can seek.
const mediaDir = join(dirname(fileURLToPath(import.meta.url)), 'media');
export function serve(port = 8099) {
  const s = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/e2e-clip.webm') {
      const f = await readFile(join(mediaDir, 'e2e-clip.webm'));
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
      const start = m && m[1] ? Number(m[1]) : 0;
      const end = m && m[2] ? Number(m[2]) : f.length - 1;
      res
        .writeHead(m ? 206 : 200, {
          'content-type': 'video/webm',
          'accept-ranges': 'bytes',
          'content-length': end - start + 1,
          ...(m ? { 'content-range': `bytes ${start}-${end}/${f.length}` } : {}),
        })
        .end(f.subarray(start, end + 1));
      return;
    }
    try {
      const f = await readFile(join(root, p));
      res
        .writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' })
        .end(f);
    } catch {
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end(await readFile(join(root, 'index.html'))); // SPA fallback
    }
  });
  return new Promise((r) => s.listen(port, '127.0.0.1', () => r(s)));
}
