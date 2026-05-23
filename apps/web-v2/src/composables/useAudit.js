// useAudit — 统一通过审计中心提交所有写操作
// 替代散落各页的 ElMessage.success — 写操作必经此路

import { ElMessage, ElNotification } from 'element-plus';
import { auditApi } from '../api/audit';
import { useLocalStore } from './useLocalStore';

export function useAudit() {
  const store = useLocalStore();

  async function submit({ sourceModule, actionType, target, payload, expectedImpact, description, sovereignty = 'manual' }) {
    const action = {
      sourceModule,
      actionType,
      target: target || {},
      payload: { ...(payload || {}), requiresRealStoreWrite: false },
      expectedImpact: expectedImpact || {},
      sovereignty,
      requestedBy: store.user?.id || 'demo',
    };

    try {
      const result = await auditApi.mockExecute(action);
      const auditId = result?.id || `${sourceModule}:${actionType}:${Date.now()}`;

      // 持久化到本地审计日志 + 后端 DB
      await store.addAuditLog({
        id: auditId,
        sourceModule,
        actionType,
        resourceType: target?.type || 'unknown',
        resourceId: target?.id || target?.sku || target?.asin || 'na',
        executor: store.user?.id || 'demo',
        executedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        status: result?.status === 'mock_executed' ? 'success' : 'failed',
        verdict: result?.status === 'mock_executed' ? 'pending' : 'failed',
        beforeMetrics: result?.before || null,
        afterMetrics: result?.after || null,
        monthlySaving: expectedImpact?.savingMonthly ?? null,
        reverted: false,
        rationale: description || actionType,
      });

      if (result?.status === 'mock_executed') {
        ElNotification({
          title: '已提交审计中心',
          message: description || `${actionType} 已 mock 执行，可在审计中心回滚`,
          type: 'success',
          duration: 3000,
          position: 'bottom-right',
        });
        return { ok: true, id: auditId, result };
      }

      ElMessage.warning(`已阻断：${result?.result?.reasons?.[0] || '不在白名单'}`);
      return { ok: false, id: auditId, result };
    } catch (e) {
      ElMessage.error(`提交审计失败：${e.message || e}`);
      return { ok: false, error: e };
    }
  }

  return { submit };
}
