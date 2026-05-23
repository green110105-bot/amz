import http from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.WEB_PORT || process.env.PORT || 3000);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

export function createWebServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');

    if (url.pathname === '/health' || url.pathname === '/ready') {
      sendJson(response, 200, {
        ok: true,
        service: 'amz-web',
        mode: 'mock',
        realWritesEnabled: false,
        paths: ['/', '/health', '/ready'],
      });
      return;
    }

    const relative = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^([/\\])+/, '');
    const file = resolve(join(root, relative));
    if (!file.startsWith(root)) {
      sendText(response, 403, 'forbidden');
      return;
    }

    try {
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': types[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(body);
    } catch {
      sendText(response, 404, 'not found');
    }
  });
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  createWebServer().listen(port, () => {
    console.log(`amz-web listening on http://localhost:${port}`);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function sendText(response, status, body) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
}
