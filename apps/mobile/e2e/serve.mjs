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
};
export function serve(port = 8099) {
  const s = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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
