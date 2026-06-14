// m4-unwrap.js — M4 response envelope unwrappers (M4-P3-02)
// Kept dependency-free (no axios / pinia / vue) so it is unit-testable in plain node.
//
// Contract: every M4 list endpoint must return a `{ items, summary?, total? }` envelope.
// Drift (a bare array, or a missing items[] array) is surfaced as an explicit throw
// instead of silently falling back through a chain of `??`, which used to hide backend
// contract changes.

export function unwrapList(r) {
  const data = r?.data;
  if (Array.isArray(data)) {
    throw new Error('M4 list contract drift: expected { items } envelope, got a bare array');
  }
  if (!data || !Array.isArray(data.items)) {
    throw new Error('M4 list contract drift: response missing items[] array');
  }
  return { items: data.items, summary: data.summary, total: data.total };
}

// Convenience: list endpoints whose callers only need the array.
export function unwrapItems(r) {
  return unwrapList(r).items;
}

// Sub-resource endpoints (events / recommend / timeline) are not paginated list
// envelopes; they return bare arrays by design. Kept distinct from list endpoints.
export function unwrapSub(r) {
  return Array.isArray(r?.data) ? r.data : (r?.data?.items ?? []);
}
