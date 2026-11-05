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
}
