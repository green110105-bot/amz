export async function GET() {
  return Response.json({
    runtimeTruth: 'node-mock-gated',
    sourceMetadata: { source: 'deterministic-mock', confidence: 1, freshness: 'fixture' }
  });
}

export async function POST() {
  return Response.json({ writePolicy: 'audit-draft-only', applied: false }, { status: 202 });
}
