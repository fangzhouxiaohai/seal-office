/**
 * 主题切换:浅色 / 暗色 / 跟随系统,写 <html theme-mode> 并记住选择。
 * Author: qiufeng
 */
import { afterEach, describe, expect, it } from 'vitest';
import { isDark, setThemeMode, themeMode } from '@/utils/theme';

afterEach(() => {
  setThemeMode('light');
  localStorage.clear();
});

describe('theme', () => {
  it('暗色:html 带 theme-mode="dark" 并记住选择', () => {
    setThemeMode('dark');
    expect(document.documentElement.getAttribute('theme-mode')).toBe('dark');
    expect(isDark.value).toBe(true);
    expect(localStorage.getItem('tladmin:theme')).toBe('dark');
  });

  it('浅色:去掉 theme-mode', () => {
    setThemeMode('dark');
    setThemeMode('light');
    expect(document.documentElement.hasAttribute('theme-mode')).toBe(false);
    expect(isDark.value).toBe(false);
  });

  it('跟随系统:按系统偏好决定,选择本身记为 auto', () => {
    setThemeMode('auto');
    expect(themeMode.value).toBe('auto');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    expect(isDark.value).toBe(systemDark);
    expect(localStorage.getItem('tladmin:theme')).toBe('auto');
  });
});
