// Shared live-action gate for Ads / LX real-write actions.
//
// SAFETY CONTRACT (must stay in sync with backend ad-action-queue.mjs):
//  - Real writes are only possible when REAL_WRITES_ENABLED === 'true' (exposed to the
//    client as import.meta.env.VITE_REAL_WRITES_ENABLED). Otherwise dryRun is forced ON.
//  - Before any real-write action (pause / budget / strategy apply) the user must
//    confirm that the action enters ad_action_queue for audit (needs_review /
//    auditRequired), with dryRun ON by default.
//  - The server is authoritative; this client gate is UX + defense-in-depth only.

export function realWritesEnabled() {
  // import.meta.env may be undefined in plain node test contexts.
  try {
    return import.meta.env?.VITE_REAL_WRITES_ENABLED === 'true'
  } catch {
    return false
  }
}

// Whether a real-write action button should be disabled.
// When real writes are NOT enabled, the button stays usable but only ever produces
// a dryRun queue entry; callers may also choose to disable it and show a ticket hint.
export function realWriteDisabled() {
  return !realWritesEnabled()
}

// Build the confirmation message shown before enqueuing an Ads/LX action.
export function buildAuditConfirmMessage(actionLabel, count) {
  const scope = count != null ? `(共 ${count} 项)` : ''
  const mode = realWritesEnabled() ? '真实写模式' : 'dryRun(演示)模式'
  return (
    `确认执行「${actionLabel}」${scope}?\n\n` +
    `该操作将进入 ad_action_queue 审计工单流程:\n` +
    `· dryRun 默认开启,不会立即真实生效\n` +
    `· guardrail 状态 needs_review,需人工复核(auditRequired)\n` +
    `当前:${mode}`
  )
}

// Returns true if the user confirmed. Uses window.confirm by default; injectable for tests.
export function confirmAuditAction(actionLabel, count, confirmFn) {
  const fn = confirmFn || (typeof window !== 'undefined' ? window.confirm : () => true)
  return fn(buildAuditConfirmMessage(actionLabel, count))
}
