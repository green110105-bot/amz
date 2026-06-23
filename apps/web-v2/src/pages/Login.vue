<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useLocalStore } from '../composables/useLocalStore';
import { authApi } from '../api/store';

const router = useRouter();
const route = useRoute();
const store = useLocalStore();

const tab = ref('login');

// === 登录 ===
const loginForm = ref({ email: 'demo@amz.local', password: 'demo' });
const loginLoading = ref(false);

async function login() {
  if (!loginForm.value.email || !loginForm.value.password) return ElMessage.warning('请输入邮箱和密码');
  loginLoading.value = true;
  const res = await store.login({ email: loginForm.value.email, password: loginForm.value.password });
  loginLoading.value = false;
  if (!res.ok) return;
  ElMessage.success('登录成功');
  // 强制首页为 TikTok 日报 — 不跟随 redirect query(否则会被登录前访问过的页面覆盖)。
  router.push('/m4/reports/tiktok');
}

// === 注册 ===
const registerForm = ref({ email: '', password: '', confirm: '', name: '' });
const registerLoading = ref(false);

async function register() {
  const f = registerForm.value;
  if (!f.email || !f.password) return ElMessage.warning('请输入邮箱和密码');
  if (f.password.length < 4) return ElMessage.warning('密码至少 4 位');
  if (f.password !== f.confirm) return ElMessage.warning('两次密码不一致');
  registerLoading.value = true;
  try {
    await authApi.register({ email: f.email, password: f.password, name: f.name });
    ElMessage.success('注册成功，正在登录...');
    const res = await store.login({ email: f.email, password: f.password });
    if (res.ok) {
      router.push('/m4/reports/tiktok');
    } else {
      tab.value = 'login';
      loginForm.value = { email: f.email, password: '' };
    }
  } catch (e) {
    if (e.status === 409) ElMessage.error('该邮箱已注册');
    else if (e.status === 400) ElMessage.error('请求格式不合法（密码可能太短）');
    else ElMessage.error(`注册失败：${e.message || e}`);
  } finally {
    registerLoading.value = false;
  }
}

// === 忘记密码 ===
const forgotEmail = ref('');
const forgotLoading = ref(false);
const resetToken = ref('');
const resetForm = ref({ token: '', newPassword: '', confirm: '' });

async function sendResetLink() {
  if (!forgotEmail.value) return ElMessage.warning('请输入邮箱');
  forgotLoading.value = true;
  try {
    const res = await authApi.forgotPassword(forgotEmail.value);
    if (res.resetToken) {
      // 演示模式：直接展示 token；生产应通过邮件发送
      resetToken.value = res.resetToken;
      resetForm.value.token = res.resetToken;
      ElMessageBox.alert(
        `演示模式：重置令牌已生成。\n\n令牌：${res.resetToken}\n过期：${new Date(res.expiresAt).toLocaleString()}\n\n生产环境会通过邮件发送重置链接。请填入下方表单完成重置。`,
        '重置令牌已生成',
        { type: 'success', confirmButtonText: '知道了' },
      );
    } else {
      ElMessage.success('若该邮箱已注册，重置链接已发送');
    }
  } catch (e) {
    ElMessage.error(`请求失败：${e.message || e}`);
  } finally {
    forgotLoading.value = false;
  }
}

async function doReset() {
  const f = resetForm.value;
  if (!f.token || !f.newPassword) return ElMessage.warning('请输入令牌和新密码');
  if (f.newPassword.length < 4) return ElMessage.warning('密码至少 4 位');
  if (f.newPassword !== f.confirm) return ElMessage.warning('两次密码不一致');
  try {
    await authApi.resetPassword({ token: f.token, newPassword: f.newPassword });
    ElMessage.success('密码已重置，请登录');
    tab.value = 'login';
    loginForm.value = { email: forgotEmail.value, password: f.newPassword };
    forgotEmail.value = '';
    resetToken.value = '';
    resetForm.value = { token: '', newPassword: '', confirm: '' };
  } catch (e) {
    if (e.status === 410) ElMessage.error('令牌已过期或已使用');
    else if (e.status === 404) ElMessage.error('令牌不存在');
    else ElMessage.error(`重置失败：${e.message || e}`);
  }
}

function loginAs(role) {
  loginForm.value.email = role === 'admin' ? 'admin@amz.local' : `${role}@amz.local`;
  loginForm.value.password = 'demo';
  // admin/operator/finance 用户首次需要通过注册创建；这里直接尝试登录失败则给提示
  ElMessage.info('演示快捷：admin/operator/finance 默认未注册，请先去"注册"页创建');
}
</script>

<template>
  <div class="login-page">
    <div class="login-bg" />
    <el-card class="login-card" shadow="never">
      <div class="brand">
        <span class="brand-logo">a</span>
        <span class="brand-text">amz · 卖家运营工作台</span>
      </div>

      <el-tabs v-model="tab" class="auth-tabs">
        <!-- ===== 登录 ===== -->
        <el-tab-pane label="登录" name="login">
          <p class="subtitle">演示账号 demo@amz.local / demo</p>
          <el-form @submit.prevent="login" label-position="top">
            <el-form-item label="邮箱">
              <el-input v-model="loginForm.email" :prefix-icon="'Message'" placeholder="email@example.com" size="large" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="loginForm.password" type="password" :prefix-icon="'Lock'" placeholder="密码" size="large" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" size="large" :loading="loginLoading" style="width: 100%" @click="login">登录</el-button>
            </el-form-item>
          </el-form>
          <div class="quick-login">
            <span class="text-muted">快速演示：</span>
            <el-button size="small" link type="primary" @click="loginAs('admin')">管理员</el-button>
            <el-button size="small" link type="primary" @click="loginAs('operator')">运营</el-button>
            <el-button size="small" link type="primary" @click="loginAs('finance')">财务</el-button>
          </div>
        </el-tab-pane>

        <!-- ===== 注册 ===== -->
        <el-tab-pane label="注册" name="register">
          <p class="subtitle">注册账号会自动开通一个默认店铺并预填演示商品</p>
          <el-form @submit.prevent="register" label-position="top">
            <el-form-item label="昵称（可选）">
              <el-input v-model="registerForm.name" :prefix-icon="'User'" placeholder="如：张三" size="large" />
            </el-form-item>
            <el-form-item label="邮箱">
              <el-input v-model="registerForm.email" :prefix-icon="'Message'" placeholder="email@example.com" size="large" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="registerForm.password" type="password" :prefix-icon="'Lock'" placeholder="至少 4 位" size="large" show-password />
            </el-form-item>
            <el-form-item label="确认密码">
              <el-input v-model="registerForm.confirm" type="password" :prefix-icon="'Lock'" placeholder="再次输入密码" size="large" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" size="large" :loading="registerLoading" style="width: 100%" @click="register">注册并登录</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- ===== 忘记密码 ===== -->
        <el-tab-pane label="忘记密码" name="forgot">
          <p class="subtitle">演示模式：提交后直接显示重置令牌；生产会通过邮件发送链接</p>
          <el-form @submit.prevent="sendResetLink" label-position="top">
            <el-form-item label="注册邮箱">
              <el-input v-model="forgotEmail" :prefix-icon="'Message'" placeholder="email@example.com" size="large" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" size="large" :loading="forgotLoading" style="width: 100%" @click="sendResetLink">获取重置令牌</el-button>
            </el-form-item>
          </el-form>

          <el-divider><span class="text-muted">收到令牌后</span></el-divider>

          <el-form @submit.prevent="doReset" label-position="top">
            <el-form-item label="重置令牌">
              <el-input v-model="resetForm.token" :prefix-icon="'Key'" placeholder="rst-..." size="large" />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="resetForm.newPassword" type="password" :prefix-icon="'Lock'" placeholder="至少 4 位" size="large" show-password />
            </el-form-item>
            <el-form-item label="确认密码">
              <el-input v-model="resetForm.confirm" type="password" :prefix-icon="'Lock'" placeholder="再次输入" size="large" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" size="large" :disabled="!resetForm.token" style="width: 100%" @click="doReset">重置密码</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <p class="hint">
        本系统已切换为 <strong>SQLite 真后端</strong>（用户/Token/店铺/审计/商品/listings/reviews 全持久化）。生产可平滑替换为 PostgreSQL / OAuth / SSO。
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.login-page { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--bg); }
.login-bg { position: absolute; inset: 0; background: radial-gradient(800px 600px at 30% 20%, rgba(37, 99, 235, 0.08), transparent 70%), radial-gradient(800px 600px at 70% 80%, rgba(139, 92, 246, 0.06), transparent 70%); pointer-events: none; }
.login-card { width: 460px; padding: 28px 32px; position: relative; z-index: 1; max-height: 92vh; overflow-y: auto; }
.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.brand-logo { width: 32px; height: 32px; border-radius: 8px; background: var(--primary); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; }
.brand-text { font-weight: 600; font-size: 14px; color: var(--text); }
.subtitle { margin: 4px 0 14px; font-size: 12px; color: var(--text-muted); }
.auth-tabs :deep(.el-tabs__nav-wrap) { padding: 0 4px; }
.quick-login { display: flex; gap: 4px; align-items: center; padding: 12px 0 0; border-top: 1px dashed var(--line-soft); margin-top: 4px; }
.hint { font-size: 11px; color: var(--text-muted); line-height: 1.5; margin: 14px 0 0; padding: 8px 12px; background: #f9fafb; border-radius: 4px; }
.hint strong { color: var(--text); }
</style>
