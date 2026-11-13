<!-- 403 无权限页 Author: qiufeng -->
<template>
  <div class="error-page">
    <h1>403</h1>
    <p>没有访问权限</p>
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
