package com.sealoffice.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class HostTextTest {
    @Test public void 故障页随产品语言显示() {
        assertEquals("重新打开", HostText.get("failure.retry", HostText.CHINESE));
        assertEquals("Reopen", HostText.get("failure.retry", HostText.ENGLISH));
        assertEquals("Seal Office can't open right now", HostText.get("failure.title", "en-US"));
        assertEquals("本地工作台加载失败（-2），请重新打开", HostText.get("failure.load", "zh-CN", -2));
        assertEquals("The local workspace failed to load (-2). Reopen it to try again.", HostText.get("failure.load", "en-US", -2));
    }

    @Test public void 未同步或未知语言按中文处理() {
        assertEquals(HostText.CHINESE, HostText.normalize(null));
        assertEquals(HostText.CHINESE, HostText.normalize("fr-FR"));
        assertEquals("原生工作台连接超时，请重新打开", HostText.get("failure.timeout", "fr-FR"));
    }

    @Test public void 每个键都有中英文() {
        assertTrue(HostText.complete());
        assertThrows(IllegalArgumentException.class, () -> HostText.get("missing", HostText.ENGLISH));
    }
}
