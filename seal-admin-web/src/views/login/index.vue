<template>
  <div class="login-page">
    <!-- 左侧品牌区 -->
    <section class="brand-panel">
      <div class="brand-glow brand-glow--1"></div>
      <div class="brand-glow brand-glow--2"></div>
      <div class="brand-grid"></div>

      <div class="brand-inner">
        <header class="brand-head">
          <img :src="logoUrl" alt="海豹办公" class="logo-img" />
          <div class="logo-text">
            <strong>海豹办公</strong>
            <span>Seal Office Cloud</span>
          </div>
        </header>

        <div class="brand-main">
          <h1>云端服务<br />一切尽在掌握</h1>
          <p>
            账号状态、公开内容审核、文档转换与版本发布集中管理，
            数据概览一页看清，权限分工精细到每个操作。
          </p>

          <ul class="feature-list">
            <li v-for="item in features" :key="item.title">
              <div class="feature-icon">
                <el-icon :size="18"><component :is="item.icon" /></el-icon>
              </div>
              <div class="feature-text">
                <strong>{{ item.title }}</strong>
                <span>{{ item.desc }}</span>
              </div>
            </li>
          </ul>
        </div>

        <footer class="brand-foot">
          <span class="dot"></span>
          私有文档保持客户端加密，后台不提供解密入口
        </footer>
      </div>
    </section>

    <!-- 右侧表单区 -->
    <section class="form-panel">
      <div class="form-inner">
        <div class="mobile-brand">
          <img :src="logoUrl" alt="海豹办公" class="logo-img logo-img--sm" />
          <strong>海豹办公云端管理</strong>
        </div>

        <div class="form-head">
          <h2>欢迎回来</h2>
          <p>请使用管理员账号登录云端管理后台</p>
        </div>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          class="login-form"
          size="large"
          @keyup.enter="submit"
        >
          <el-form-item prop="username">
            <el-input
              v-model="form.username"
              placeholder="管理员账号"
              :prefix-icon="User"
              clearable
              autocomplete="username"
            />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              :prefix-icon="Lock"
              show-password
              autocomplete="current-password"
            />
          </el-form-item>

          <div class="form-extra">
            <el-checkbox v-model="remember">记住账号</el-checkbox>
            <span class="forgot">连续输错将临时锁定，请谨慎输入</span>
          </div>

          <el-button
            class="submit-btn"
            type="primary"
            :loading="loading"
            @click="submit"
          >
            {{ loading ? '登录中…' : '登 录' }}
          </el-button>
        </el-form>

        <div class="copyright">
          海豹办公云端管理后台
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Lock, Odometer, Stamp, Upload, User, UserFilled } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { registerDynamicRoutes } from '@/router'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const REMEMBER_KEY = 'seal_admin_login_username'

// Logo 位于 public 目录，按部署基础路径拼接
const logoUrl = import.meta.env.BASE_URL + 'seal-logo.png'

const formRef = ref<FormInstance>()
const loading = ref(false)
const remember = ref(false)
const form = reactive({ username: '', password: '' })

const features = [
  { icon: Odometer, title: '数据概览', desc: '用户增长、空间使用与服务状态图表一页掌握' },
  { icon: Stamp, title: '内容审核', desc: '模板、知识、皮肤公开前把关' },
  { icon: Upload, title: '版本发布', desc: '多平台同版本发布与安装包管理' },
  { icon: UserFilled, title: '权限分工', desc: '管理员、角色、菜单精细授权' }
]

const rules: FormRules = {
  username: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

// 回填上次登录的账号
const savedName = localStorage.getItem(REMEMBER_KEY)
if (savedName) {
  form.username = savedName
  remember.value = true
}

async function submit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await userStore.login({ username: form.username.trim(), password: form.password })
    registerDynamicRoutes()
    if (remember.value) {
      localStorage.setItem(REMEMBER_KEY, form.username.trim())
    } else {
      localStorage.removeItem(REMEMBER_KEY)
    }
    ElMessage.success(`欢迎回来，${userStore.displayName}`)
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
  } catch {
    // 错误提示已由请求拦截器统一处理
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
$primary: #6a5cf5;

.login-page {
  display: flex;
  min-height: 100vh;
  background: #fff;
}

/* ============ 左侧品牌区 ============ */
.brand-panel {
  position: relative;
  flex: 1 1 58%;
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(120% 90% at 8% 0%, #3b2f7a 0%, transparent 55%),
    linear-gradient(150deg, #0d0a24 0%, #1d1747 42%, #33256e 100%);
}

.brand-glow {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  filter: blur(2px);
}

.brand-glow--1 {
  width: 460px;
  height: 460px;
  top: -140px;
  right: -120px;
  background: radial-gradient(circle, rgba(106, 92, 245, 0.5), transparent 68%);
}

.brand-glow--2 {
  width: 380px;
  height: 380px;
  bottom: -160px;
  left: -100px;
  background: radial-gradient(circle, rgba(148, 130, 255, 0.28), transparent 70%);
}

.brand-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.5;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: radial-gradient(80% 70% at 30% 35%, #000 30%, transparent 85%);
}

.brand-inner {
  position: relative;
  z-index: 2;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 48px clamp(40px, 6vw, 80px);
  max-width: 720px;
}

.brand-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-img {
  width: 46px;
  height: 46px;
  border-radius: 13px;
  box-shadow: 0 10px 24px rgba(106, 92, 245, 0.42);
}

.logo-img--sm {
  width: 36px;
  height: 36px;
  border-radius: 10px;
}

.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;

  strong {
    font-size: 16px;
    letter-spacing: 0.5px;
  }

  span {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }
}

.brand-main {
  margin: 32px 0;

  h1 {
    font-size: clamp(30px, 3.2vw, 42px);
    line-height: 1.28;
    margin: 0 0 18px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  > p {
    max-width: 430px;
    margin: 0 0 34px;
    font-size: 14px;
    line-height: 1.9;
    color: rgba(255, 255, 255, 0.62);
  }
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  max-width: 480px;

  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.09);
    backdrop-filter: blur(4px);
    transition: background 0.25s, transform 0.25s;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateY(-2px);
    }
  }
}

.feature-icon {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c3b8ff;
  background: rgba(106, 92, 245, 0.22);
}

.feature-text {
  display: flex;
  flex-direction: column;
  min-width: 0;

  strong {
    font-size: 13.5px;
    font-weight: 600;
  }

  span {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.brand-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.42);

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4ade80;
    box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.16);
  }
}

/* ============ 右侧表单区 ============ */
.form-panel {
  flex: 1 1 42%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: #fff;
}

.form-inner {
  width: 100%;
  max-width: 356px;
}

.mobile-brand {
  display: none;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;

  strong {
    font-size: 16px;
    color: #1f2d3d;
  }
}

.form-head {
  margin-bottom: 26px;

  h2 {
    margin: 0 0 8px;
    font-size: 26px;
    font-weight: 600;
    color: #16243a;
    letter-spacing: 0.5px;
  }

  p {
    margin: 0;
    font-size: 13px;
    color: #8b96a8;
  }
}

.login-form {
  :deep(.el-form-item) {
    margin-bottom: 18px;
  }

  :deep(.el-input__wrapper) {
    padding: 2px 14px;
    border-radius: 10px;
    background: #f6f8fb;
    box-shadow: 0 0 0 1px #e8edf5 inset;
    transition: box-shadow 0.2s, background 0.2s;
  }

  :deep(.el-input__wrapper:hover) {
    box-shadow: 0 0 0 1px #cfd8f0 inset;
  }

  :deep(.el-input__wrapper.is-focus) {
    background: #fff;
    box-shadow: 0 0 0 1px $primary inset, 0 0 0 4px rgba(106, 92, 245, 0.1);
  }

  :deep(.el-input__inner) {
    height: 42px;
    font-size: 14px;
  }

  :deep(.el-input__prefix) {
    color: #a8b3c4;
  }
}

.form-extra {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -4px 0 20px;

  :deep(.el-checkbox__label) {
    font-size: 13px;
    color: #6b7688;
  }
}

.forgot {
  font-size: 12px;
  color: #a8b3c4;
}

.submit-btn {
  width: 100%;
  height: 46px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  letter-spacing: 3px;
  font-weight: 500;
  background: linear-gradient(120deg, #6a5cf5, #8579f8);
  box-shadow: 0 10px 22px rgba(106, 92, 245, 0.28);
  transition: transform 0.18s, box-shadow 0.18s, filter 0.18s;

  &:hover:not(.is-loading) {
    filter: brightness(1.06);
    transform: translateY(-1px);
    box-shadow: 0 14px 26px rgba(106, 92, 245, 0.34);
  }

  &:active:not(.is-loading) {
    transform: translateY(0);
  }
}

.copyright {
  margin-top: 28px;
  text-align: center;
  font-size: 11px;
  color: #c3cbd8;
}

/* ============ 响应式 ============ */
@media (max-width: 1024px) {
  .brand-panel {
    flex-basis: 50%;
  }

  .feature-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .brand-panel {
    display: none;
  }

  .mobile-brand {
    display: flex;
  }

  .form-panel {
    flex-basis: 100%;
    background: linear-gradient(180deg, #f7f6ff 0%, #fff 30%);
  }
}
</style>
