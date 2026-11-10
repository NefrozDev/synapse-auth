// Serves the production build with SPA fallback. /api is left unserved (404): the tests mock it
// in the browser.
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/synapse-auth/browser/', import.meta.url));
const port = Number(process.argv[2] ?? 4310);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const index = join(root, 'index.html');
if (!existsSync(index)) {
  console.error(`No build at ${root}. Run: npm run build`);
  process.exit(1);
}

// Every file of the build by URL path, listed once at startup: a URL can only name a file of
// the build, never one outside it.
const files = new Map(
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => [`/${relative(root, file).replaceAll(sep, '/')}`, file]),
);

createServer((req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0];
  if (urlPath.startsWith('/api/')) {
    res.writeHead(404).end();
    return;
  }
  const file = files.get(urlPath) ?? index;
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Identity pages build on http://127.0.0.1:${port}`));
