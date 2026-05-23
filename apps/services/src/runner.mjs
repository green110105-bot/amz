#!/usr/bin/env node
import { listServices } from './manifest.mjs';
import { startService } from './runtime.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const serviceName = argValue('service') ?? process.argv[2];

if (!serviceName || serviceName === '--help' || serviceName === '-h') {
  const services = await listServices();
  console.log('Usage: node apps/services/src/runner.mjs --service <name> [--port <port>]');
  console.log(`Services: ${services.join(', ')}`);
  process.exit(serviceName ? 0 : 1);
}

const portArg = argValue('port');
const server = await startService(serviceName, { port: portArg === undefined ? undefined : Number(portArg) });
const address = server.address();
const host = typeof address === 'object' && address ? address.address : '127.0.0.1';
const port = typeof address === 'object' && address ? address.port : 'unknown';

console.log(JSON.stringify({ status: 'listening', service: serviceName, host, port, paths: ['/health', '/ready'] }));
