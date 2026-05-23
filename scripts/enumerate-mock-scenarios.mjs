#!/usr/bin/env node
import { enumerateScenarios, scenarioCategories, summarizeScenarioCatalog } from '../packages/mock-data/src/scenario-catalog.mjs';

const args = parseArgs(process.argv.slice(2));
const scenarios = enumerateScenarios({ category: args.category, provider: args.provider, mode: args.mode });
const summary = summarizeScenarioCatalog(scenarios);

if (args.json) {
  console.log(JSON.stringify({ summary, scenarios }, null, 2));
} else {
  console.log(`Mock scenarios: ${summary.total}`);
  console.log(`Categories: ${scenarioCategories.map((category) => `${category}=${summary.categories[category] || 0}`).join(', ')}`);
  console.log(`Real writes allowed: ${summary.realWriteAllowed ? 'YES' : 'NO'}`);
  for (const scenario of scenarios) {
    console.log(`- ${scenario.id} [${scenario.category}] ${scenario.title}`);
    console.log(`  providers=${scenario.providers.join(',')} mode=${scenario.mode} confidence=${scenario.confidence}`);
    console.log(`  source=${scenario.source}`);
    console.log(`  signals=${scenario.expectedSignals.join(',')}`);
  }
}

function parseArgs(argv) {
  const parsed = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') parsed.json = true;
    else if (arg === '--category') parsed.category = argv[++index];
    else if (arg.startsWith('--category=')) parsed.category = arg.slice('--category='.length);
    else if (arg === '--provider') parsed.provider = argv[++index];
    else if (arg.startsWith('--provider=')) parsed.provider = arg.slice('--provider='.length);
    else if (arg === '--mode') parsed.mode = argv[++index];
    else if (arg.startsWith('--mode=')) parsed.mode = arg.slice('--mode='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/enumerate-mock-scenarios.mjs [--json] [--category M2] [--provider amazon-ads-api] [--mode mock]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}
