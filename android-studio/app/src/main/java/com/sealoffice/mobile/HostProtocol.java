package com.sealoffice.mobile;

import java.net.URI;
import java.net.URISyntaxException;

public final class HostProtocol {
    public static final String ORIGIN = "https://appassets.androidplatform.net";
    public static final String LEGACY_ASSET_PATH = "/apps/__UNI__B52B65B/www/static/office/index.html";

    private HostProtocol() {}

    public static boolean isWorkspaceUrl(String value) {
        return isHttpsWorkspaceUrl(value) || isLegacyWorkspaceUrl(value);
    }

    public static boolean isLegacyWorkspaceUrl(String value) {
        try {
            URI uri = new URI(value);
            if (!"file".equalsIgnoreCase(uri.getScheme()) || uri.getHost() != null) return false;
            if (!("/android_asset" + LEGACY_ASSET_PATH).equals(uri.getRawPath())) return false;
            return hasNativeQuery(uri.getRawQuery());
        } catch (URISyntaxException ignored) { return false; }
    }

    private static boolean isHttpsWorkspaceUrl(String value) {
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())) return false;
            if (!"/office/index.html".equals(uri.getRawPath())) return false;
            return hasNativeQuery(uri.getRawQuery());
        } catch (URISyntaxException ignored) { return false; }
    }

    private static boolean hasNativeQuery(String query) {
        if (query == null) return false;
        for (String part : query.split("&")) if ("native=1".equals(part)) return true;
        return false;
    }

    public static boolean allowBackground(boolean ready, int expectedSequence, int receivedSequence, boolean requested) {
        return ready && expectedSequence > 0 && expectedSequence == receivedSequence && requested;
    }

    public static boolean isRequestUrlAllowed(String value) {
        try {
            URI uri = new URI(value);
            if ("https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null) return true;
            return "http".equalsIgnoreCase(uri.getScheme()) &&
                    ("127.0.0.1".equals(uri.getHost()) || "localhost".equalsIgnoreCase(uri.getHost()));
        } catch (URISyntaxException ignored) { return false; }
    }

    public static String safeExportName(String value) {
        String clean = value == null ? "文档" : value.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim();
        if (clean.isEmpty()) clean = "文档";
        return clean.length() > 240 ? clean.substring(0, 240) : clean;
    }

    /** 网页文件输入带 capture 且只接受图片时才走相机；其余情况仍打开系统文件选择器。 */
    public static boolean wantsCamera(boolean captureEnabled, String[] acceptTypes) {
        if (!captureEnabled) return false;
        if (acceptTypes == null) return true;
        for (String type : acceptTypes) {
            String value = type == null ? "" : type.trim().toLowerCase();
            if (value.isEmpty()) continue;
            if (!value.startsWith("image/")) return false;
        }
        return true;
    }

    public static boolean permissionGranted(int[] results) {
        if (results == null || results.length == 0) return false;
        for (int result : results) if (result != 0) return false;
        return true;
    }

    /** 拍照临时文件名：只取安全字符，放在应用缓存的 camera 子目录，由 FileProvider 授权给系统相机写入。 */
    public static String cameraFileName(String id) {
        String clean = id == null ? "" : id.replaceAll("[^A-Za-z0-9-]", "_");
        return "photo-" + (clean.isEmpty() ? "image" : clean) + ".jpg";
    }
}
