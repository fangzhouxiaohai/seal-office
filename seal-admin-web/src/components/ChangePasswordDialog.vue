<template>
  <el-dialog
    v-model="visible"
    title="修改密码"
    width="min(440px, 94vw)"
    align-center
    :close-on-click-modal="false"
    class="change-password-dialog"
    @closed="reset"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item label="当前密码" prop="currentPassword" :error="currentError">
        <el-input v-model="form.currentPassword" type="password" show-password autocomplete="current-password" maxlength="128" @input="currentError = ''" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input v-model="form.newPassword" type="password" show-password autocomplete="new-password" maxlength="128" />
        <div class="field-hint">8 至 128 个字符，且不能与当前密码相同</div>
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirmPassword">
        <el-input v-model="form.confirmPassword" type="password" show-password autocomplete="new-password" maxlength="128" @keyup.enter="submit" />
      </el-form-item>
    </el-form>
    <p class="dialog-note">修改成功后当前登录保持有效，此账号在其他设备上的登录将失效。</p>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="busy" @click="submit">保存新密码</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { changePassword } from '@/api/auth'

const visible = defineModel<boolean>({ default: false })
const formRef = ref<FormInstance>()
const busy = ref(false)
const currentError = ref('')
const form = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })

const rules: FormRules = {
  currentPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, max: 128, message: '新密码须为 8 至 128 个字符', trigger: 'blur' },
    {
      validator: (_rule, value, callback) =>
        value && value === form.currentPassword ? callback(new Error('新密码不能与当前密码相同')) : callback(),
      trigger: 'blur'
    }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) =>
        value !== form.newPassword ? callback(new Error('两次输入的新密码不一致')) : callback(),
      trigger: 'blur'
    }
  ]
}

function reset() {
  form.currentPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  currentError.value = ''
  formRef.value?.clearValidate()
}

async function submit() {
  if (busy.value || !formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  busy.value = true
  try {
    const result = await changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
    ElMessage.success(result.revokedSessions ? `密码已修改，已退出其他 ${result.revokedSessions} 处登录` : '密码已修改')
    visible.value = false
  } catch (error: any) {
    // 服务端错误已由请求拦截器提示；当前密码错误同时标在字段上
    const message = error?.response?.data?.error || ''
    if (message.includes('当前密码')) currentError.value = message
  } finally {
    busy.value = false
  }
}
</script>

<style scoped lang="scss">
.field-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.dialog-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-2);
}
</style>
