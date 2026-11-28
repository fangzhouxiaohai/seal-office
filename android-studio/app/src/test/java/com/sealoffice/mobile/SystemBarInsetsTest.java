package com.sealoffice.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class SystemBarInsetsTest {
    @Test public void 截图设备的状态栏与导航栏换算为容器内边距() {
        // 1080×2404、像素比 2.0：状态栏约 93 物理像素（46.5），导航栏 96（48）
        SystemBarInsets insets = SystemBarInsets.of(0, 93, 0, 96, 0);
        assertEquals(93, insets.top);
        assertEquals(96, insets.bottom);
        assertEquals(0, insets.keyboard);
        String script = insets.script(2.0f);
        assertTrue(script.contains("'--seal-host-inset-top','46.5px'"));
        assertTrue(script.contains("'--seal-host-inset-bottom','48px'"));
        // 宿主已让出系统栏，页面不再重复扣除
        assertTrue(script.contains("'--seal-safe-top','0px'"));
        assertTrue(script.contains("'--seal-safe-bottom','0px'"));
        assertTrue(script.endsWith("window.dispatchEvent(new Event('seal-safe-area'));"));
    }

    @Test public void 软键盘弹出时底部取较大者而不叠加导航栏() {
        SystemBarInsets insets = SystemBarInsets.of(0, 93, 0, 96, 900);
        assertEquals(900, insets.bottom);
        assertEquals(804, insets.keyboard);
        SystemBarInsets hidden = SystemBarInsets.of(0, 93, 0, 96, 0);
        assertEquals(96, hidden.bottom);
    }

    @Test public void 横屏挖孔与负值() {
        SystemBarInsets insets = SystemBarInsets.of(110, 0, -3, 0, -1);
        assertEquals(110, insets.left);
        assertEquals(0, insets.right);
        assertEquals(0, insets.bottom);
    }

    @Test public void 像素换算保留两位小数且不受系统区域设置影响() {
        java.util.Locale original = java.util.Locale.getDefault();
        try {
            java.util.Locale.setDefault(java.util.Locale.GERMANY);
            assertEquals("31.33px", SystemBarInsets.cssPixels(94, 3.0f));
            assertEquals("24px", SystemBarInsets.cssPixels(72, 3.0f));
            assertEquals("0px", SystemBarInsets.cssPixels(0, 2.75f));
            assertEquals("10px", SystemBarInsets.cssPixels(10, 0f));
        } finally { java.util.Locale.setDefault(original); }
    }
}
