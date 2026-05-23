import http from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleExtendedRequest } from './extended-routes.mjs';

const port = Number(process.env.API_PORT || process.env.PORT || 8080);

export function createApiServer() {
  return http.createServer(async (incoming, outgoing) => {
    const body = await readIncomingBody(incoming);
    const request = new Request(`http://${incoming.headers.host || 'localhost'}${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      body: body.length > 0 ? body : undefined,
    });

    let response;
    try {
      response = await handleExtendedRequest(request);
    } catch (err) {
      try { console.error('[server]', request.method, request.url, err?.message || err); } catch {}
      response = new Response(JSON.stringify({ error: 'internal_error', message: String(err?.message || err) }), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const server = createApiServer();
  server.listen(port, () => {
    console.log(`amz-api listening on http://localhost:${port}`);
  });
}

async function readIncomingBody(incoming) {
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  return Buffer.concat(chunks);
}
