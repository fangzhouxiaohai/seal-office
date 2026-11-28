package com.sealoffice.mobile;

import java.util.HashMap;
import java.util.Map;

/**
 * 原生宿主文案（2.8.1）：故障页标题、按钮与原因随产品界面语言显示，而不是随系统语言。
 * 产品语言由网页工作区在每次状态上报时同步给宿主并持久化；从未同步时与网页默认一致，使用中文。
 */
final class HostText {
    static final String CHINESE = "zh-CN";
    static final String ENGLISH = "en-US";

    private static final Map<String, String[]> TEXT = new HashMap<>();
    static {
        TEXT.put("failure.title", new String[]{"海豹办公暂时无法打开", "Seal Office can't open right now"});
        TEXT.put("failure.retry", new String[]{"重新打开", "Reopen"});
        TEXT.put("failure.webview", new String[]{"系统网页组件版本过旧，无法建立安全的原生连接，请更新系统 WebView 后重试",
                "The system WebView is too old to create a secure native connection. Update Android System WebView and try again."});
        TEXT.put("failure.load", new String[]{"本地工作台加载失败（%s），请重新打开", "The local workspace failed to load (%s). Reopen it to try again."});
        TEXT.put("failure.timeout", new String[]{"原生工作台连接超时，请重新打开", "Connecting to the native workspace timed out. Reopen it to try again."});
    }

    private HostText() { }

    /** 只接受产品支持的两种语言，其余值按中文处理。 */
    static String normalize(String language) {
        return ENGLISH.equals(language) ? ENGLISH : CHINESE;
    }

    static String get(String key, String language, Object... arguments) {
        String[] value = TEXT.get(key);
        if (value == null) throw new IllegalArgumentException("缺少宿主文案：" + key);
        String text = value[ENGLISH.equals(normalize(language)) ? 1 : 0];
        return arguments.length == 0 ? text : String.format(java.util.Locale.ROOT, text, arguments);
    }

    /** 测试用：所有键都同时具备中英文。 */
    static boolean complete() {
        for (String[] value : TEXT.values()) if (value.length != 2 || value[0].isEmpty() || value[1].isEmpty()) return false;
        return true;
    }
}
