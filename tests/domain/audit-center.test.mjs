import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuditAction, mockExecuteAuditAction } from '../../packages/domain/src/audit-center.mjs';

test('audit center blocks unsupported or high-value actions', () => {
  const blocked = createAuditAction({
    sourceModule: 'M3',
    actionType: 'UNKNOWN_WRITE',
    target: { id: 'x' },
    payload: { amount: 1000 },
    sovereignty: 'auto',
  });
  assert.equal(blocked.risk.allowed, false);
  assert.equal(mockExecuteAuditAction(blocked).status, 'blocked');
});

test('audit center mock executes allowed actions without external writes', () => {
  const action = createAuditAction({
    sourceModule: 'M3',
    actionType: 'ADD_NEGATIVE_KEYWORD',
    target: { id: 'kw1' },
    payload: { amount: 10 },
    sovereignty: 'auto',
  });
  const executed = mockExecuteAuditAction(action);
  assert.equal(executed.status, 'mock_executed');
  assert.equal(executed.result.mode, 'mock');
});
