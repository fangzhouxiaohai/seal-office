<template>
  <div class="error-page">
    <div class="error-code">404</div>
    <p class="error-text">页面不存在或已被移除</p>
    <el-button type="primary" @click="router.push('/')">返回首页</el-button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<style scoped>
.error-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: var(--bg-page);
}

.error-code {
  font-size: 72px;
  font-weight: 700;
  color: var(--brand);
  letter-spacing: 4px;
}

.error-text {
  color: var(--text-2);
  margin: 0 0 8px;
}
</style>
