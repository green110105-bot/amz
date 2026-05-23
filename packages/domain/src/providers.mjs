export class ProviderRegistry {
  constructor(providers = {}) {
    this.providers = providers;
  }

  get(name) {
    const provider = this.providers[name];
    if (!provider) throw new Error(`Provider not registered: ${name}`);
    return provider;
  }

  list() {
    return Object.keys(this.providers).sort();
  }
}

export function providerResult(provider, data, metadata = {}) {
  return {
    provider,
    sourceMode: metadata.sourceMode || 'mock',
    fetchedAt: metadata.fetchedAt || new Date().toISOString(),
    confidence: metadata.confidence ?? 0.7,
    data,
  };
}

export function realWriteBlocked(providerName, action) {
  return {
    ok: false,
    provider: providerName,
    action,
    reason: 'Real external write is blocked until credentials and explicit approval are provided.',
    sourceMode: 'mock',
  };
}
