<!--
  登录页:左侧品牌区 + 右侧登录卡片,
  接入 TLAdmin 登录逻辑(账号密码 + Google 动态验证码,后端返回 totp_required 时自动展开码输入框)。
  Author: qiufeng
-->
<template>
  <div class="login">
    <section class="login-brand">
      <div class="login-brand__inner">
        <div class="login-brand__logo">
          <img :src="logoUrl" alt="" />
          <span>海豹办公</span>
        </div>
        <h1>云端管理工作台</h1>
        <p class="login-brand__slogan">查看服务运行情况，处理用户主动发布的公开资料。</p>
        <ul class="login-features">
          <li v-for="f in features" :key="f.title">
            <span class="login-features__icon"><component :is="f.icon" size="18px" /></span>
            <div>
              <strong>{{ f.title }}</strong>
              <small>{{ f.desc }}</small>
            </div>
          </li>
        </ul>
      </div>
      <span class="login-brand__circle login-brand__circle--a" />
      <span class="login-brand__circle login-brand__circle--b" />
    </section>

    <section class="login-panel">
      <div class="login-card">
        <h2>欢迎登录</h2>
        <p class="login-card__hint">请使用管理员账号登录海豹办公管理后台</p>

        <t-form ref="formRef" :data="form" :rules="rules" label-align="top" @submit="onSubmit">
          <t-form-item label="账号" name="username">
            <t-input v-model="form.username" size="large" placeholder="请输入账号" clearable>
              <template #prefix-icon><user-icon /></template>
            </t-input>
          </t-form-item>

          <t-form-item label="密码" name="password">
            <t-input
              v-model="form.password"
              size="large"
              :type="showPsw ? 'text' : 'password'"
              clearable
              placeholder="请输入登录密码"
            >
              <template #prefix-icon><lock-on-icon /></template>
              <template #suffix-icon>
                <browse-icon v-if="showPsw" class="psw-toggle" @click="showPsw = !showPsw" />
                <browse-off-icon v-else class="psw-toggle" @click="showPsw = !showPsw" />
              </template>
            </t-input>
          </t-form-item>


          <div class="login-card__remember">
            <t-checkbox v-model="remember">记住账号</t-checkbox>
          </div>

          <t-button block size="large" type="submit" class="login-card__submit" :loading="loading">登 录</t-button>
        </t-form>
      </div>

      <footer class="login-panel__copyright">海豹办公云端服务</footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { MessagePlugin, type FormProps, type FormInstanceFunctions } from 'tdesign-vue-next';
import {
  UserIcon,
  LockOnIcon,
  BrowseIcon,
  BrowseOffIcon,
  UserSafetyIcon,
  ApiIcon,
  CloudUploadIcon,
} from 'tdesign-icons-vue-next';
import { useUserStore } from '@/stores/user';
import logoUrl from '@/assets/seal-logo.png';

const REMEMBER_KEY = 'tladmin:remember_username';

const features = [
  { icon: UserSafetyIcon, title: '私有资料保护', desc: '用户私有文档保持加密' },
  { icon: ApiIcon, title: '服务运行', desc: '了解云服务和文档转换状态' },
  { icon: CloudUploadIcon, title: '版本管理', desc: '维护各平台安装包与更新' },
];

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const formRef = ref<FormInstanceFunctions>();
const loading = ref(false);
const showPsw = ref(false);
const remember = ref(false);

const form = reactive({ username: '', password: '', code: '' });

onMounted(() => {
  const saved = localStorage.getItem(REMEMBER_KEY);
  if (saved) {
    form.username = saved;
    remember.value = true;
  }
});

const rules: FormProps['rules'] = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入登录密码', trigger: 'blur' }],
};

const onSubmit: FormProps['onSubmit'] = async ({ validateResult }) => {
  if (validateResult !== true) return;
  loading.value = true;
  try {
    await userStore.login({
      username: form.username,
      password: form.password,
    });
    form.password = '';
    if (remember.value) {
      localStorage.setItem(REMEMBER_KEY, form.username);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
    MessagePlugin.success('登录成功');
    const redirect = (route.query.redirect as string) || '/';
    await router.replace(redirect);
  } catch (err) {
    MessagePlugin.error(err instanceof Error ? err.message : '登录失败');
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login {
  display: flex;
  min-height: 100vh;
  background: var(--tl-surface);
}

/* ---------- 左侧品牌区 ---------- */
.login-brand {
  position: relative;
  display: flex;
  flex: 0 0 46%;
  align-items: center;
  padding: 64px;
  overflow: hidden;
  color: #fff;
  background: linear-gradient(150deg, #0c6e52 0%, #16a37a 55%, #3fc39c 100%);
}

.login-brand__inner {
  position: relative;
  z-index: 1;
  max-width: 440px;
}

.login-brand__logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.login-brand__logo img {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.login-brand h1 {
  margin: 48px 0 12px;
  font-size: 36px;
  font-weight: 700;
  letter-spacing: 1px;
}

.login-brand__slogan {
  margin: 0 0 48px;
  font-size: 15px;
  opacity: 0.85;
}

.login-features {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.login-features li {
  display: flex;
  align-items: center;
  gap: 14px;
}

.login-features strong {
  display: block;
  font-size: 15px;
  font-weight: 600;
}

.login-features small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  opacity: 0.8;
}

.login-features__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  backdrop-filter: blur(4px);
}

.login-brand__circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}

.login-brand__circle--a {
  right: -140px;
  bottom: -160px;
  width: 420px;
  height: 420px;
}

.login-brand__circle--b {
  top: -60px;
  left: -60px;
  width: 220px;
  height: 220px;
  background: rgba(255, 255, 255, 0.06);
}

/* ---------- 右侧登录卡片 ---------- */
.login-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}

.login-card {
  width: 100%;
  max-width: 380px;
}

.login-card h2 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 700;
  color: var(--tl-text-1);
}

.login-card__hint {
  margin: 0 0 28px;
  font-size: 14px;
  color: var(--tl-text-2);
}

.login-card__remember {
  margin-bottom: 20px;
}

.login-card__submit {
  height: 46px;
  font-size: 16px;
  letter-spacing: 2px;
}

.psw-toggle {
  cursor: pointer;
}

.login-panel__copyright {
  margin-top: 60px;
  font-size: 12px;
  color: var(--tl-text-3);
}

@media (max-width: 900px) {
  .login-brand {
    display: none;
  }
}
</style>
