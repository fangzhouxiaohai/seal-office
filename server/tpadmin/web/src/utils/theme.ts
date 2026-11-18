/**
 * 主题模式:浅色 / 暗色 / 跟随系统。
 *
 * 通过 <html theme-mode="dark"> 切换(TDesign 的暗色约定),选择存 localStorage;
 * 跟随系统时监听 prefers-color-scheme,系统切换后立即生效。
 * Author: qiufeng
 */
import { ref } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'tladmin:theme';

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

/** 当前选择(响应式,供切换按钮显示) */
export const themeMode = ref<ThemeMode>(readMode());

/** 实际生效的是不是暗色 */
export const isDark = ref(false);

function apply(): void {
  isDark.value = themeMode.value === 'dark' || (themeMode.value === 'auto' && Boolean(media?.matches));
  if (isDark.value) {
    document.documentElement.setAttribute('theme-mode', 'dark');
  } else {
    document.documentElement.removeAttribute('theme-mode');
  }
}

export function setThemeMode(mode: ThemeMode): void {
  themeMode.value = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* 存储不可用时本次会话仍生效 */
  }
  apply();
}

/** 应用启动时调用一次(挂载前,避免先闪一下浅色) */
export function initTheme(): void {
  apply();
  media?.addEventListener('change', () => {
    if (themeMode.value === 'auto') apply();
  });
}
