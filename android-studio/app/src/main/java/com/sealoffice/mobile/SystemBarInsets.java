package com.sealoffice.mobile;

import java.util.Locale;

/**
 * 系统栏让位（2.8.1）：安卓 15 起 targetSdk 35 及以上强制边到边，状态栏、导航栏、挖孔与软键盘
 * 会覆盖在 WebView 之上。宿主把这些尺寸换算为承载 WebView 的容器内边距，使 WebView 只占系统栏之间的区域；
 * 同时把仍覆盖页面的安全区（让位后为 0）写入 --seal-safe-*，实际系统栏尺寸写入 --seal-host-inset-* 供验收记录。
 * 本类只做数值换算，不依赖安卓框架，便于单元测试。
 */
final class SystemBarInsets {
    final int left;
    final int top;
    final int right;
    final int bottom;
    final int keyboard;

    private SystemBarInsets(int left, int top, int right, int bottom, int keyboard) {
        this.left = left;
        this.top = top;
        this.right = right;
        this.bottom = bottom;
        this.keyboard = keyboard;
    }

    /**
     * @param barLeft   系统栏与挖孔合并后的左侧尺寸（物理像素）
     * @param imeBottom 软键盘底部尺寸；键盘弹出时底部让位取导航栏与键盘中的较大者，二者不叠加
     */
    static SystemBarInsets of(int barLeft, int barTop, int barRight, int barBottom, int imeBottom) {
        int navigation = Math.max(0, barBottom), ime = Math.max(0, imeBottom);
        return new SystemBarInsets(Math.max(0, barLeft), Math.max(0, barTop), Math.max(0, barRight), Math.max(navigation, ime),
                ime > navigation ? ime - navigation : 0);
    }

    /** 物理像素换算为 CSS 像素，最多保留两位小数，统一使用小数点。 */
    static String cssPixels(int pixels, float density) {
        float value = density > 0 ? pixels / density : pixels;
        String text = String.format(Locale.ROOT, "%.2f", value);
        if (text.contains(".")) text = text.replaceAll("0+$", "").replaceAll("\\.$", "");
        return text + "px";
    }

    /** 写入页面根元素的 CSS 变量，并派发 seal-safe-area 事件，供依赖尺寸的组件重新测量。 */
    String script(float density) {
        StringBuilder code = new StringBuilder("var s=document.documentElement.style;");
        for (String side : new String[]{"top", "right", "bottom", "left"}) {
            code.append("s.setProperty('--seal-safe-").append(side).append("','0px');");
        }
        code.append("s.setProperty('--seal-host-inset-top','").append(cssPixels(top, density)).append("');");
        code.append("s.setProperty('--seal-host-inset-right','").append(cssPixels(right, density)).append("');");
        code.append("s.setProperty('--seal-host-inset-bottom','").append(cssPixels(bottom, density)).append("');");
        code.append("s.setProperty('--seal-host-inset-left','").append(cssPixels(left, density)).append("');");
        code.append("s.setProperty('--seal-host-keyboard','").append(cssPixels(keyboard, density)).append("');");
        code.append("window.dispatchEvent(new Event('seal-safe-area'));");
        return code.toString();
    }
}
