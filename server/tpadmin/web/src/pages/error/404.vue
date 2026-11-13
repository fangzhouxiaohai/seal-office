<!-- 404 页面不存在 Author: qiufeng -->
<template>
  <div class="error-page">
    <h1>404</h1>
    <p>页面不存在或已被移除</p>
    <t-button @click="$router.replace('/')">返回首页</t-button>
  </div>
</template>

<style scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 12px;
}

.error-page h1 {
  margin: 0;
  font-size: 64px;
  color: var(--td-text-color-placeholder);
}
</style>
