// useApi — 统一加载状态 + 错误处理

import { ref } from 'vue';
import { ElMessage } from 'element-plus';

export function useApi(fn, { showError = true, errorPrefix = '请求失败' } = {}) {
  const loading = ref(false);
  const error = ref(null);
  const data = ref(null);

  async function run(...args) {
    loading.value = true;
    error.value = null;
    try {
      const result = await fn(...args);
      data.value = result;
      return { ok: true, data: result };
    } catch (e) {
      error.value = e;
      if (showError) ElMessage.error(`${errorPrefix}：${e.message || e}`);
      return { ok: false, error: e };
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, data, run };
}
