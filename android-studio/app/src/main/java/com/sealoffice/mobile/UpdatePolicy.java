package com.sealoffice.mobile;

import java.net.URI;
import java.util.Locale;
import java.util.UUID;

/** 安装包只接受当前更新服务确认的 HTTPS 发布信息。 */
public final class UpdatePolicy {
    private UpdatePolicy() {}
    private static int port(URI value) { return value.getPort() < 0 ? 443 : value.getPort(); }

    public static String newTaskId() { return UUID.randomUUID().toString(); }
    public static boolean validTaskId(String value) {
        try { return value != null && UUID.fromString(value).toString().equals(value); }
        catch (IllegalArgumentException error) { return false; }
    }
    public static String taskFileName(String id) {
        if (!validTaskId(id)) throw new IllegalArgumentException("更新任务标识无效");
        return "pending-" + id + ".apk";
    }
    public static boolean canDiscard(boolean handedToInstaller, boolean installed) { return !handedToInstaller || installed; }

    public static boolean validRelease(String base, String url, String version, String hash, long bytes, String channel) {
        try {
            URI server = new URI(base), file = new URI(url);
            return "https".equalsIgnoreCase(server.getScheme()) && "https".equalsIgnoreCase(file.getScheme())
                    && server.getHost() != null && file.getHost() != null
                    && server.getHost().equalsIgnoreCase(file.getHost()) && port(server) == port(file)
                    && server.getUserInfo() == null && file.getUserInfo() == null
                    && server.getFragment() == null && server.getQuery() == null && file.getFragment() == null
                    && file.getPath() != null && file.getPath().toLowerCase(Locale.ROOT).endsWith(".apk")
                    && version != null && version.matches("\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?")
                    && hash != null && hash.matches("[a-fA-F0-9]{64}") && bytes > 0 && bytes <= 1073741824L
                    && ("stable".equals(channel) || "beta".equals(channel));
        } catch (Exception error) { return false; }
    }

    public static boolean matches(boolean available, String serverVersion, String serverUrl, String serverHash, long serverBytes,
                                  String version, String url, String hash, long bytes) {
        return available && version != null && version.equals(serverVersion) && url != null && url.equals(serverUrl)
                && hash != null && serverHash != null && hash.equalsIgnoreCase(serverHash) && bytes == serverBytes;
    }

    public static boolean alreadyInstalled(long installedCode, long archiveCode, String installedHash, String archiveHash) {
        return installedCode > archiveCode || installedCode == archiveCode && installedHash != null && archiveHash != null
                && installedHash.equalsIgnoreCase(archiveHash);
    }
}
