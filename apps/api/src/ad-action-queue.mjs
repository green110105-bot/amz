// ad-action-queue.mjs — single funnel for enqueuing ads write intents.
//
// SAFETY INVARIANTS (do not weaken):
//   1. Every ads write MUST go through ad_action_queue. There is no direct-execute path.
//   2. dryRun defaults to 1 (ON). A real write (dry_run=0) is only possible when the
//      provider mode is 'real' AND the caller explicitly set dryRun===false.
//   3. audit_required defaults to 1 and the guardrail status defaults to 'needs_review'
//      so a real write never slips through without human review.
//   4. requiresRealStoreWrite is clamped to false unless the provider mode is 'real';
//      the frontend body flag is never trusted on its own.
//
// The actual Amazon mutation is still performed exclusively by the live-action-executor
// behind isRealMode() + every env gate. This module only records the queued intent.

import { randomBytes } from 'node:crypto';
import { isRealMode as providerIsRealMode } from './integrations/provider-mode.mjs';

// The action queue is the single isRealMode-gated boundary for ads writes. It owns the
// gate consultation: every enqueue consults isRealMode() to decide whether a real write
// (dry_run=0) is even possible.
function isRealMode() { return providerIsRealMode(); }

function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return prefix + '-' + randomBytes(4).toString('hex'); }
function J(value) { return JSON.stringify(value); }

// enqueueAdAction — record an ads write intent into ad_action_queue.
//   action: {
//     typedAction, asin, campaignIds, severity, suggestionId, sourceModule, sourceEvent,
//     entity, evidenceRefs, rollbackPlan,
//     dryRun,                 // honored as real write ONLY in real mode
//     requiresRealStoreWrite, // clamped to false outside real mode
//   }
export function enqueueAdAction(db, userId, storeId, action = {}) {
  const real = isRealMode();
  const id = action.id || newId('aq');

  // dryRun is 1 (ON) unless we are in real mode AND the caller explicitly asked for a
  // real write via dryRun===false. Outside real mode it is always a dry run.
  const dryRun = real && action.dryRun === false ? 0 : 1;

  // requiresRealStoreWrite is clamped to false unless real mode. Never trust the body
  // flag on its own.
  const requiresRealStoreWrite = real ? (action.requiresRealStoreWrite === true) : false;

  // Hard-default guardrail to needs_review and audit_required to 1 so a queued real
  // write can never auto-execute without review.
  const queued = {
    guardrail_status: 'needs_review',
    audit_required: 1,
    dry_run: dryRun,
    requires_real_store_write: requiresRealStoreWrite ? 1 : 0,
  };

  const typed = {
    type: action.typedAction,
    asin: action.asin,
    campaignIds: action.campaignIds,
    sourceModule: action.sourceModule || 'M4',
    sourceEvent: action.sourceEvent || action.typedAction,
    hijackingId: action.hijackingId,
    requiresRealStoreWrite,
    dryRun: dryRun === 1,
  };

  try {
    db.prepare(`INSERT INTO ad_action_queue(
      id, user_id, store_id, suggestion_id, source_strategy_name, state,
      severity, entity, typed_action, evidence_refs, guardrail, dry_run, audit_required,
      created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, action.suggestionId || null,
      action.sourceStrategyName || 'M4→M3 联动', 'queued',
      action.severity || 'P0',
      J(action.entity || { asin: action.asin, campaignIds: action.campaignIds }),
      J(typed),
      J(action.evidenceRefs || { source: 'M4→M3', asin: action.asin }),
      J({ status: queued.guardrail_status, requiresRealStoreWrite, dryRun: dryRun === 1 }),
      queued.dry_run,
      queued.audit_required,
      nowIso()
    );
  } catch (err) {
    try { console.error('[ad-action-queue] enqueueAdAction failed:', err?.message || err); } catch {}
  }
  return id;
}
