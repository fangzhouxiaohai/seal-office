package com.sealoffice.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class HostProtocolTest {
    @Test public void 旧版文件来源仅允许内置工作台() {
        assertTrue(HostProtocol.isLegacyWorkspaceUrl("file:///android_asset/apps/__UNI__B52B65B/www/static/office/index.html?native=1"));
        assertTrue(HostProtocol.isWorkspaceUrl("file:///android_asset/apps/__UNI__B52B65B/www/static/office/index.html?native=1"));
        assertFalse(HostProtocol.isLegacyWorkspaceUrl("file:///sdcard/Download/index.html?native=1"));
        assertFalse(HostProtocol.isLegacyWorkspaceUrl("file:///android_asset/office/other.html?native=1"));
    }

    @Test public void 只允许应用内工作台作为原生桥接目标() {
        assertTrue(HostProtocol.isWorkspaceUrl("https://appassets.androidplatform.net/office/index.html?native=1"));
        assertFalse(HostProtocol.isWorkspaceUrl("https://appassets.androidplatform.net/office/../outside.html"));
        assertFalse(HostProtocol.isWorkspaceUrl("https://example.com/office/index.html?native=1"));
        assertFalse(HostProtocol.isWorkspaceUrl("https://appassets.androidplatform.net/office/index.html"));
    }

    @Test public void 返回桌面只能响应本次按键() {
        assertTrue(HostProtocol.allowBackground(true, 4, 4, true));
        assertFalse(HostProtocol.allowBackground(false, 4, 4, true));
        assertFalse(HostProtocol.allowBackground(true, 4, 3, true));
        assertFalse(HostProtocol.allowBackground(true, 4, 4, false));
    }

    @Test public void 网络与文件名保持安全边界() {
        assertTrue(HostProtocol.isRequestUrlAllowed("https://seal.xingmasoft.com/api/v1/capabilities"));
        assertTrue(HostProtocol.isRequestUrlAllowed("http://127.0.0.1:8000/"));
        assertFalse(HostProtocol.isRequestUrlAllowed("http://public.example.com/"));
        assertFalse(HostProtocol.isRequestUrlAllowed("file:///data/user/0/secret"));
        assertEquals("报告_2026.pdf", HostProtocol.safeExportName("报告/2026.pdf"));
    }

    @Test public void 网页拍照请求只在要求拍摄图片时打开相机() {
        assertTrue(HostProtocol.wantsCamera(true, new String[]{"image/*"}));
        assertTrue(HostProtocol.wantsCamera(true, new String[]{"image/jpeg", "image/png"}));
        assertTrue(HostProtocol.wantsCamera(true, new String[]{""}));
        assertTrue(HostProtocol.wantsCamera(true, null));
        assertFalse(HostProtocol.wantsCamera(false, new String[]{"image/*"}));
        assertFalse(HostProtocol.wantsCamera(true, new String[]{"application/pdf"}));
        assertFalse(HostProtocol.wantsCamera(true, new String[]{".docx", "image/*"}));
    }

    @Test public void 相机权限只有全部授予才算通过() {
        assertTrue(HostProtocol.permissionGranted(new int[]{0}));
        assertFalse(HostProtocol.permissionGranted(new int[]{-1}));
        assertFalse(HostProtocol.permissionGranted(new int[]{0, -1}));
        assertFalse(HostProtocol.permissionGranted(new int[0]));
        assertFalse(HostProtocol.permissionGranted(null));
    }

    @Test public void 拍照文件只放在应用缓存的相机目录() {
        assertEquals("photo-abc.jpg", HostProtocol.cameraFileName("abc"));
        assertEquals("photo-x_y.jpg", HostProtocol.cameraFileName("x/y"));
    }
}
