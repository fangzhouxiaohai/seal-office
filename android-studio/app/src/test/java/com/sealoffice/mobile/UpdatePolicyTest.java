package com.sealoffice.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class UpdatePolicyTest {
    private static final String HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    @Test public void 安装包只能从与已配置更新服务同源的HTTPS地址获取() {
        assertTrue(UpdatePolicy.validRelease("https://seal.xingmasoft.com/api", "https://seal.xingmasoft.com/api/v1/release-assets/test/a.apk", "2.8.0", HASH, 123, "stable"));
        assertFalse(UpdatePolicy.validRelease("https://seal.xingmasoft.com/api", "http://seal.xingmasoft.com/a.apk", "2.8.0", HASH, 123, "stable"));
        assertFalse(UpdatePolicy.validRelease("https://seal.xingmasoft.com/api", "https://other.example/a.apk", "2.8.0", HASH, 123, "stable"));
        assertFalse(UpdatePolicy.validRelease("https://seal.xingmasoft.com/api", "https://user@seal.xingmasoft.com/a.apk", "2.8.0", HASH, 123, "stable"));
    }

    @Test public void 校验字段缺失或超过大小上限必须拒绝() {
        assertFalse(UpdatePolicy.validRelease("https://seal.xingmasoft.com/api", "https://seal.xingmasoft.com/a.apk", "../a", HASH, 123, "stable"));
        assertFalse(UpdatePolicy.validRelease("https://seal.xingmasoft.com/api", "https://seal.xingmasoft.com/a.apk", "2.8.0", "none", 123, "stable"));
        assertFalse(UpdatePolicy.validRelease("https://seal.xingmasoft.com/api", "https://seal.xingmasoft.com/a.apk", "2.8.0", HASH, 0, "stable"));
        assertFalse(UpdatePolicy.validRelease("https://seal.xingmasoft.com/api", "https://seal.xingmasoft.com/a.apk", "2.8.0", HASH, 1073741825L, "stable"));
        assertFalse(UpdatePolicy.validRelease("https://seal.xingmasoft.com/api", "https://seal.xingmasoft.com/a.apk", "2.8.0", HASH, 123, "other"));
    }

    @Test public void 最新发布信息必须逐字段完全一致() {
        assertTrue(UpdatePolicy.matches(true, "2.8.0", "https://example.com/x", HASH, 123, "2.8.0", "https://example.com/x", HASH, 123));
        assertFalse(UpdatePolicy.matches(false, "2.8.0", "https://example.com/x", HASH, 123, "2.8.0", "https://example.com/x", HASH, 123));
        assertFalse(UpdatePolicy.matches(true, "2.8.1", "https://example.com/x", HASH, 123, "2.8.0", "https://example.com/x", HASH, 123));
        assertFalse(UpdatePolicy.matches(true, "2.8.0", "https://example.com/x", HASH, 122, "2.8.0", "https://example.com/x", HASH, 123));
    }
    @Test public void 已安装相同字节或更高构建后不再重复拉起安装() {
        assertTrue(UpdatePolicy.alreadyInstalled(20702, 20702, HASH, HASH));
        assertTrue(UpdatePolicy.alreadyInstalled(20703, 20702, "other", HASH));
        assertFalse(UpdatePolicy.alreadyInstalled(20702, 20702, "different", HASH));
        assertFalse(UpdatePolicy.alreadyInstalled(20701, 20702, HASH, HASH));
    }
    @Test public void 下载任务标识可持久化且不同任务不会混淆() {
        String first = UpdatePolicy.newTaskId();
        String second = UpdatePolicy.newTaskId();
        assertTrue(UpdatePolicy.validTaskId(first));
        assertTrue(UpdatePolicy.validTaskId(second));
        assertNotEquals(first, second);
        assertFalse(UpdatePolicy.validTaskId(""));
        assertFalse(UpdatePolicy.validTaskId("invalid"));
        assertEquals("pending-" + first + ".apk", UpdatePolicy.taskFileName(first));
        assertNotEquals(UpdatePolicy.taskFileName(first), UpdatePolicy.taskFileName(second));
        try { UpdatePolicy.taskFileName("../unsafe"); fail("任务标识无效必须拒绝"); } catch (IllegalArgumentException expected) { }
    }
    @Test public void 已交给安装器的文件只在确认安装后才能清理() {
        assertFalse(UpdatePolicy.canDiscard(true, false));
        assertTrue(UpdatePolicy.canDiscard(true, true));
        assertTrue(UpdatePolicy.canDiscard(false, false));
    }
}
