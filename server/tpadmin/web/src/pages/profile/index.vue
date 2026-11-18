<!--
  个人中心:账号信息、修改密码、动态验证码绑定/解绑(扫码 + 确认码)。
  Author: qiufeng
-->
<template>
  <div class="profile-page">
    <t-card title="账号信息" :bordered="false">
      <t-descriptions :column="2" size="small">
        <t-descriptions-item label="账号">{{ userStore.user?.username }}</t-descriptions-item>
        <t-descriptions-item label="昵称">{{ userStore.user?.nickname }}</t-descriptions-item>
        <t-descriptions-item label="角色">{{ userStore.roles.map((r) => r.name).join('、') || '-' }}</t-descriptions-item>
        <t-descriptions-item label="上次登录">
          {{ formatDate(userStore.user?.last_login_time) }}({{ userStore.user?.last_login_ip || '-' }})
        </t-descriptions-item>
      </t-descriptions>
    </t-card>

    <t-card title="修改密码" :bordered="false">
      <t-form ref="pwdFormRef" :data="pwdForm" :rules="pwdRules" label-width="100px" class="narrow-form">
        <t-form-item label="原密码" name="old_password">
          <t-input v-model="pwdForm.old_password" type="password" placeholder="当前登录密码" />
        </t-form-item>
        <t-form-item label="新密码" name="new_password">
          <t-input v-model="pwdForm.new_password" type="password" placeholder="至少 8 位" />
        </t-form-item>
        <t-form-item label="确认新密码" name="confirm_password">
          <t-input v-model="pwdForm.confirm_password" type="password" placeholder="再次输入新密码" />
        </t-form-item>
        <t-form-item>
          <t-button theme="primary" :loading="pwdSaving" @click="onChangePassword">修改密码</t-button>
        </t-form-item>
      </t-form>
    </t-card>

    <t-card title="动态验证码(Google Authenticator)" :bordered="false">
      <template v-if="totpStatus">
        <t-alert v-if="!totpStatus.global_enabled" theme="info" class="totp-alert"
          message="系统暂未开启动态验证码登录校验,绑定后待管理员开启即生效。" />

        <!-- 已绑定 -->
        <template v-if="totpStatus.bound">
          <t-space direction="vertical" size="16px">
            <t-tag theme="success" variant="light">已绑定</t-tag>
            <t-form label-width="100px" class="narrow-form">
              <t-form-item label="动态码" help="输入验证器当前 6 位码以解绑">
                <t-input v-model="disableCode" placeholder="6 位动态码" :maxlength="6" style="width: 180px" />
              </t-form-item>
              <t-form-item>
                <t-button theme="danger" variant="outline" :loading="totpSaving" @click="onDisable">解除绑定</t-button>
              </t-form-item>
            </t-form>
          </t-space>
        </template>

        <!-- 未绑定 -->
        <template v-else>
          <t-space v-if="!setup" direction="vertical" size="12px">
            <t-tag variant="light">未绑定</t-tag>
            <t-button theme="primary" :loading="totpSaving" @click="onSetup">开始绑定</t-button>
          </t-space>

          <div v-else class="setup-box">
            <div class="qr-box">
              <t-qrcode :value="setup.otpauth_uri" :size="160" level="M" />
              <p class="secret-text">密钥:{{ setup.secret }}</p>
            </div>
            <div class="setup-steps">
              <ol>
                <li>打开 Google Authenticator 或其他验证器 App</li>
                <li>扫描左侧二维码(或手动输入密钥)</li>
                <li>输入 App 显示的 6 位动态码完成绑定</li>
              </ol>
              <t-space size="8px">
                <t-input v-model="confirmCode" placeholder="6 位动态码" :maxlength="6" style="width: 160px" />
                <t-button theme="primary" :loading="totpSaving" @click="onConfirm">确认绑定</t-button>
              </t-space>
            </div>
          </div>
        </template>
      </template>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MessagePlugin, type FormInstanceFunctions, type FormProps } from 'tdesign-vue-next';
import { useUserStore } from '@/stores/user';
import {
  changePassword, getTotpStatus, totpSetup, totpConfirm, totpDisable,
  type TotpStatus, type TotpSetup,
} from '@/api/auth';
import { formatDate } from '@/utils/date';

const router = useRouter();
const userStore = useUserStore();

// ---- 修改密码 ----
const pwdFormRef = ref<FormInstanceFunctions>();
const pwdForm = reactive({ old_password: '', new_password: '', confirm_password: '' });
const pwdSaving = ref(false);

const pwdRules: FormProps['rules'] = {
  old_password: [{ required: true, message: '请输入原密码' }],
  new_password: [
    { required: true, message: '请输入新密码' },
    { min: 8, message: '新密码至少 8 位' },
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码' },
    { validator: (val: unknown) => val === pwdForm.new_password, message: '两次输入的密码不一致' },
  ],
};

async function onChangePassword(): Promise<void> {
  if ((await pwdFormRef.value?.validate()) !== true) return;
  pwdSaving.value = true;
  try {
    await changePassword(pwdForm.old_password, pwdForm.new_password);
    MessagePlugin.success('密码已修改,请重新登录');
    await userStore.logout();
    router.replace('/login');
  } finally {
    pwdSaving.value = false;
  }
}

// ---- TOTP ----
const totpStatus = ref<TotpStatus | null>(null);
const setup = ref<TotpSetup | null>(null);
const confirmCode = ref('');
const disableCode = ref('');
const totpSaving = ref(false);

async function loadStatus(): Promise<void> {
  totpStatus.value = await getTotpStatus();
}

onMounted(loadStatus);

async function onSetup(): Promise<void> {
  totpSaving.value = true;
  try {
    setup.value = await totpSetup();
  } finally {
    totpSaving.value = false;
  }
}

async function onConfirm(): Promise<void> {
  if (!/^\d{6}$/.test(confirmCode.value)) {
    MessagePlugin.warning('请输入 6 位数字动态码');
    return;
  }
  totpSaving.value = true;
  try {
    await totpConfirm(confirmCode.value);
    MessagePlugin.success('动态验证码绑定成功');
    setup.value = null;
    confirmCode.value = '';
    await loadStatus();
  } finally {
    totpSaving.value = false;
  }
}

async function onDisable(): Promise<void> {
  if (!/^\d{6}$/.test(disableCode.value)) {
    MessagePlugin.warning('请输入 6 位数字动态码');
    return;
  }
  totpSaving.value = true;
  try {
    await totpDisable(disableCode.value);
    MessagePlugin.success('已解绑动态验证码');
    disableCode.value = '';
    await loadStatus();
  } finally {
    totpSaving.value = false;
  }
}
</script>

<style scoped>
.profile-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.narrow-form {
  max-width: 480px;
}

.totp-alert {
  margin-bottom: 16px;
}

.setup-box {
  display: flex;
  gap: 32px;
  align-items: flex-start;
}

.qr-box {
  text-align: center;
}

.secret-text {
  max-width: 200px;
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  word-break: break-all;
}

.setup-steps ol {
  margin: 0 0 16px;
  padding-left: 20px;
  color: var(--td-text-color-secondary);
  line-height: 2;
}
</style>
