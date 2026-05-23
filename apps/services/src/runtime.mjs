import http from 'node:http';
import { getServiceDefinition } from './manifest.mjs';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

function envFlag(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

function servicePort(service) {
  const httpPort = service.ports.find((port) => port.name === 'http') ?? service.ports[0];
  if (!httpPort) return Number(envFlag('SERVICE_PORT', 0));
  return Number(envFlag(httpPort.env, httpPort.default));
}

function basePayload(manifest, service, probe) {
  const probeConfig = probe === 'health' ? service.health : service.readiness;
  return {
    status: 'ok',
    service: service.name,
    owner: service.owner,
    probe,
    probePath: probeConfig.path,
    dependencyMode: manifest.dependencyMode,
    source: manifest.defaults.source,
    writePolicy: manifest.defaults.writePolicy,
    mockMode: envFlag('MOCK_MODE', 'true'),
    checks: probeConfig.checks.map((name) => ({ name, status: 'ok', source: manifest.defaults.source, confidence: 1 })),
    contracts: service.contracts,
    externalBlockers: service.externalBlockers,
    prdModules: service.prdModules,
    metadata: {
      required: manifest.defaults.metadata,
      source: manifest.defaults.source,
      confidence: 1,
      freshness: 'runtime-static-manifest'
    }
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, jsonHeaders);
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

export async function buildProbePayload(serviceName, probe) {
  if (probe !== 'health' && probe !== 'ready') {
    throw new Error(`Unknown probe "${probe}". Expected health or ready.`);
  }

  const { manifest, service } = await getServiceDefinition(serviceName);
  return basePayload(manifest, service, probe === 'ready' ? 'readiness' : 'health');
}

export async function createServiceServer(serviceName) {
  const { manifest, service } = await getServiceDefinition(serviceName);

  return http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (request.method !== 'GET') {
      sendJson(response, 405, { status: 'error', error: 'method_not_allowed' });
      return;
    }

    if (url.pathname === '/health') {
      sendJson(response, 200, basePayload(manifest, service, 'health'));
      return;
    }

    if (url.pathname === '/ready') {
      sendJson(response, 200, basePayload(manifest, service, 'readiness'));
      return;
    }

    sendJson(response, 404, {
      status: 'error',
      error: 'not_found',
      service: service.name,
      availablePaths: ['/health', '/ready']
    });
  });
}

export async function startService(serviceName, options = {}) {
  const { service } = await getServiceDefinition(serviceName);
  const port = options.port ?? servicePort(service);
  const host = options.host ?? envFlag('SERVICE_HOST', '127.0.0.1');
  const server = await createServiceServer(serviceName);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return server;
}
