import { readFile } from 'node:fs/promises';

const manifestUrl = new URL('../service-manifest.json', import.meta.url);

let cachedManifest;

export async function loadServiceManifest() {
  if (!cachedManifest) {
    cachedManifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  }
  return cachedManifest;
}

export async function listServices() {
  const manifest = await loadServiceManifest();
  return manifest.services.map((service) => service.name);
}

export async function getServiceDefinition(serviceName) {
  const manifest = await loadServiceManifest();
  const service = manifest.services.find((candidate) => candidate.name === serviceName);

  if (!service) {
    const known = manifest.services.map((candidate) => candidate.name).join(', ');
    throw new Error(`Unknown service "${serviceName}". Expected one of: ${known}`);
  }

  return { manifest, service };
}
