// m4-transitions.js — M4 state-machine transition maps + helpers.
// Dependency-free (no vue / element-plus / axios) so it is unit-testable in plain node
// (node --test) and shared as the single source of truth for useM4State.js.

// ----------------------------------------------------------------------------
// Appeal
// ----------------------------------------------------------------------------
export const APPEAL_TRANSITIONS = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'accepted', 'rejected', 'withdrawn'],
  under_review: ['accepted', 'rejected', 'withdrawn'],
  rejected: ['retry'], // retry → 新建子 appeal
  accepted: [],
  withdrawn: [],
};
export function canAppealTransition(from, to) {
  const arr = APPEAL_TRANSITIONS[from] || [];
  return arr.includes(to);
}
export function allowedAppealActions(status) {
  return APPEAL_TRANSITIONS[status] || [];
}

// ----------------------------------------------------------------------------
// Recovery
// M4-P1-03: 'sent' is replaced by 'marked_sent' (manual ticket board — there is no
// live Buyer-Seller Messaging channel). Both kept for backward-compatible reads.
// ----------------------------------------------------------------------------
export const RECOVERY_TRANSITIONS = {
  pending: ['draft'],
  draft: ['marked_sent', 'sent', 'closed'],
  in_progress: ['marked_sent', 'closed'],
  marked_sent: ['replied', 'failed'],
  sent: ['replied', 'failed'],
  replied: ['review_updated', 'next_round', 'closed'],
  review_updated: ['closed', 'next_round'],
  failed: ['next_round', 'closed'],
  closed: [],
};
export function canRecoveryTransition(from, to) {
  const arr = RECOVERY_TRANSITIONS[from] || [];
  return arr.includes(to);
}
export function allowedRecoveryActions(status) {
  return RECOVERY_TRANSITIONS[status] || [];
}

// ----------------------------------------------------------------------------
// Anomaly
// M4-P1-01: this mirrors the backend ANOMALY_TRANSITIONS (data-store-monitor.mjs)
// EXACTLY. A consistency test asserts the two definitions stay in sync; if you change
// one you must change the other.
// ----------------------------------------------------------------------------
export const ANOMALY_TRANSITIONS = {
  open: ['assigned', 'investigating', 'resolved', 'dismissed', 'escalated'],
  assigned: ['investigating', 'resolved', 'dismissed', 'escalated'],
  investigating: ['resolved', 'dismissed', 'escalated'],
  escalated: ['investigating', 'resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
  closed: [],
};
export function canAnomalyTransition(from, to) {
  const arr = ANOMALY_TRANSITIONS[from] || [];
  return arr.includes(to);
}
export function allowedAnomalyActions(status) {
  return ANOMALY_TRANSITIONS[status] || [];
}

// ----------------------------------------------------------------------------
// Hijacking
// M4-P0-02: the backend never writes `appeal_drafted` (confirm-counterfeit stops at
// `test_buy_received`, and the manual-evidence submission jumps straight to
// `appeal_submitted`). The dead `appeal_drafted` transitions were removed so the front
// end no longer gates the appeal entry on an unreachable status.
// ----------------------------------------------------------------------------
export const HIJACKING_TRANSITIONS = {
  pending_test_buy: ['test_buy_in_transit'],
  test_buy_in_transit: ['test_buy_received'],
  test_buy_received: ['appeal_submitted', 'genuine', 'closed'],
  appeal_submitted: ['appeal_accepted', 'closed'],
  appeal_accepted: ['closed'],
  genuine: ['closed'],
  closed: [],
};
export function canHijackingTransition(from, to) {
  return (HIJACKING_TRANSITIONS[from] || []).includes(to);
}

// ----------------------------------------------------------------------------
// Infringement
// ----------------------------------------------------------------------------
export const INFRINGEMENT_TRANSITIONS = {
  investigating: ['draft', 'pending_legal_review', 'dismissed'],
  pending_legal_review: ['draft', 'dismissed'],
  draft: ['submitted', 'dismissed'],
  submitted: ['accepted', 'rejected'],
  accepted: ['resolved'],
  rejected: ['resolved'],
  resolved: [],
  dismissed: [],
};
export function canInfringementTransition(from, to) {
  return (INFRINGEMENT_TRANSITIONS[from] || []).includes(to);
}
