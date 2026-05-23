#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { generateAdTimeseries } from '../packages/mock-data/src/ad-timeseries.mjs';

const args = parseArgs(process.argv.slice(2));
const fixture = generateAdTimeseries({
  asOfDate: args.asOfDate,
  days: args.days,
  hourlyDays: args.hourlyDays,
});
const json = `${JSON.stringify(fixture, null, 2)}\n`;

if (args.stdout) {
  process.stdout.write(json);
} else {
  const output = resolve(args.output ?? 'dist/mock-data/ad-timeseries.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, json, 'utf8');
  process.stdout.write(`generated ${output}\n`);
  process.stdout.write(`daily=${fixture.daily.length} hourly=${fixture.hourly.length} scenarios=${fixture.scenarioCoverage.length}\n`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--stdout') parsed.stdout = true;
    else if (arg === '--output') parsed.output = argv[++index];
    else if (arg === '--days') parsed.days = Number(argv[++index]);
    else if (arg === '--hourly-days') parsed.hourlyDays = Number(argv[++index]);
    else if (arg === '--as-of-date') parsed.asOfDate = argv[++index];
    else if (arg === '--help') {
      process.stdout.write('Usage: node scripts/generate-ad-timeseries.mjs [--stdout] [--output path] [--days 90] [--hourly-days 90] [--as-of-date YYYY-MM-DD]\n');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}
