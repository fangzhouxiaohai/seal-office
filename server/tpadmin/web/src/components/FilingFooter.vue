<template>
  <footer class="filing-footer">
    <slot />
    <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">新ICP备2024014104号-7</a>
  </footer>
</template>

<style scoped>
.filing-footer {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0 12px;
  padding: 6px 12px max(6px, env(safe-area-inset-bottom));
  color: var(--tl-text-2);
  font-size: 12px;
}
.filing-footer a { color: inherit; line-height: 28px; }
.filing-footer a:hover, .filing-footer a:focus-visible { text-decoration: underline; }
</style>
