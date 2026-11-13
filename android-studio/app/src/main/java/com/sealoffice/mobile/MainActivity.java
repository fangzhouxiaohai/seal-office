package com.sealoffice.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.View;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.core.content.FileProvider;
import androidx.core.splashscreen.SplashScreen;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public final class MainActivity extends Activity {
    private static final int PICK_DOCUMENT = 42101;
    private static final int SAVE_DOCUMENT = 42102;
    private static final int HTML_PICKER = 42103;
    private static final int CAMERA_CAPTURE = 42104;
    private static final int CAMERA_PERMISSION = 42105;
    private static final long MAX_IMPORT = 100L * 1024L * 1024L;
    private static final String LEGACY_ASSET_ROOT = "apps/__UNI__B52B65B/www/static/office/";
    private static final String ENTRY = "file:///android_asset" + HostProtocol.LEGACY_ASSET_PATH + "?native=1";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService workers = Executors.newCachedThreadPool();
    private final Map<String, Future<?>> tasks = new ConcurrentHashMap<>();
    private final Map<String, HttpURLConnection> connections = new ConcurrentHashMap<>();
    private final String token = UUID.randomUUID().toString();
    private WebView web;
    private NativeUpdater updater;
    private LinearLayout failure;
    private TextView failureDetail;
    private boolean ready;
    private boolean startupPending = true;
    private int backSequence;
    private long lastBack;
    private String saveId;
    private File saveFile;
    private String saveName;
    private String pickId;
    private ValueCallback<Uri[]> htmlPicker;
    // 拍照扫描：同一时间只允许一次拍照；来自网页桥接时回传 id，来自 <input capture> 时回传 callback。
    private String cameraId;
    private ValueCallback<Uri[]> cameraCallback;
    private File cameraFile;
    private Uri cameraUri;

    @Override public void onCreate(Bundle state) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> startupPending);
        super.onCreate(state);
        updater = new NativeUpdater(this, value -> evaluate("window.dispatchEvent(new CustomEvent('seal-native-update',{detail:" + value + "}))"));
        getWindow().setStatusBarColor(Color.rgb(245, 247, 255));
        getWindow().setNavigationBarColor(Color.rgb(245, 247, 255));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(245, 247, 255));
        web = new WebView(this);
        web.setVisibility(View.INVISIBLE);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        failure = new LinearLayout(this);
        failure.setOrientation(LinearLayout.VERTICAL);
        failure.setGravity(android.view.Gravity.CENTER);
        failure.setPadding(32, 32, 32, 32);
        TextView title = new TextView(this);
        title.setText("海豹办公暂时无法打开");
        title.setTextSize(20);
        title.setTextColor(Color.rgb(25, 31, 51));
        failure.addView(title);
        failureDetail = new TextView(this);
        failureDetail.setTextColor(Color.rgb(75, 87, 116));
        failureDetail.setPadding(0, 16, 0, 16);
        failure.addView(failureDetail);
        Button retry = new Button(this);
        retry.setText("重新打开");
        retry.setOnClickListener(value -> openOffice());
        failure.addView(retry);
        failure.setVisibility(View.GONE);
        root.addView(failure, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        if (!configureWebView()) return;
        openOffice();
    }

    private boolean configureWebView() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            showFailure("系统网页组件版本过旧，无法建立安全的原生连接，请更新系统 WebView 后重试");
            return false;
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        WebViewCompat.addWebMessageListener(web, "SealHost", new HashSet<>(java.util.Arrays.asList(HostProtocol.ORIGIN, "file://")),
                (view, message, origin, mainFrame, reply) -> {
                    if (!mainFrame || !HostProtocol.isWorkspaceUrl(view.getUrl())) return;
                    String expectedOrigin = HostProtocol.isLegacyWorkspaceUrl(view.getUrl()) ? "null" : HostProtocol.ORIGIN;
                    if (!expectedOrigin.equals(origin.toString())) return;
                    String data = message.getData();
                    if (data != null) ui.post(() -> receive(data));
                });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (HostProtocol.wantsCamera(params.isCaptureEnabled(), params.getAcceptTypes())) return capturePhoto(null, callback);
                if (htmlPicker != null) htmlPicker.onReceiveValue(null);
                htmlPicker = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                    startActivityForResult(intent, HTML_PICKER);
                    return true;
                } catch (Exception error) {
                    htmlPicker = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost())) return null;
                return readAsset(uri);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (HostProtocol.isWorkspaceUrl(url)) return false;
                if (request.isForMainFrame()) openExternal(url);
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!HostProtocol.isWorkspaceUrl(url)) return;
                String config = "{token:" + JSONObject.quote(token) + ",platform:'android'}";
                evaluate("window.uni=window.uni||{};window.uni.webView={postMessage:function(value){SealHost.postMessage(JSON.stringify(value))}};" +
                        "window.sealNative=" + config + ";window.open=function(url){SealHost.postMessage(JSON.stringify({data:{action:'open-external',token:window.sealNative.token,url:String(url)}}));return null};" +
                        "window.dispatchEvent(new Event('seal-native-ready'));");
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) ui.post(() -> showFailure("本地工作台加载失败（" + error.getErrorCode() + "），请重新打开"));
            }
        });
        return true;
    }

    private WebResourceResponse readAsset(Uri uri) {
        String path = uri.getPath();
        if (path == null || path.contains("..") || path.indexOf('\\') >= 0) return missingAsset();
        if (path.startsWith("/office/")) path = path.substring(8);
        else if (path.startsWith("/")) path = path.substring(1);
        if (path.isEmpty()) return missingAsset();
        try {
            InputStream stream = getAssets().open(LEGACY_ASSET_ROOT + path);
            String extension = MimeTypeMap.getFileExtensionFromUrl(path);
            String mime = "js".equals(extension) || "mjs".equals(extension) ? "application/javascript"
                    : "css".equals(extension) ? "text/css"
                    : "html".equals(extension) ? "text/html"
                    : "wasm".equals(extension) ? "application/wasm"
                    : "svg".equals(extension) ? "image/svg+xml"
                    : "ttf".equals(extension) ? "font/ttf"
                    : "otf".equals(extension) ? "font/otf"
                    : MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
            if (mime == null) mime = "application/octet-stream";
            return new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript") ? "UTF-8" : null,
                    200, "OK", Collections.singletonMap("Cache-Control", "no-cache"), stream);
        } catch (IOException error) { return missingAsset(); }
    }

    private WebResourceResponse missingAsset() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(),
                new ByteArrayInputStream("本地资源不存在".getBytes(StandardCharsets.UTF_8)));
    }

    private void openOffice() {
        ready = false;
        failure.setVisibility(View.GONE);
        web.setVisibility(View.INVISIBLE);
        web.loadUrl(ENTRY + "&reload=" + System.currentTimeMillis());
        ui.postDelayed(() -> { if (!ready && failure.getVisibility() != View.VISIBLE) showFailure("原生工作台连接超时，请重新打开") ; }, 20000);
    }

    private void showFailure(String detail) {
        ready = false;
        web.setVisibility(View.INVISIBLE);
        failureDetail.setText(detail);
        failure.setVisibility(View.VISIBLE);
        startupPending = false;
    }

    private void evaluate(String code) {
        ui.post(() -> { if (web != null && HostProtocol.isWorkspaceUrl(web.getUrl())) web.evaluateJavascript("(function(){" + code + "})()", null); });
    }

    private void reply(JSONObject data) {
        evaluate("window.sealReceiveNative&&window.sealReceiveNative(" + data + ")");
    }

    private JSONObject result(String id, String type) throws JSONException {
        return new JSONObject().put("id", id).put("type", type);
    }

    private void replyError(String id, String detail) {
        try { reply(result(id, "error").put("error", detail)); } catch (JSONException ignored) { }
    }

    private void receive(String json) {
        try {
            JSONObject envelope = new JSONObject(json);
            JSONObject data = envelope.optJSONObject("data");
            if (data == null || !token.equals(data.optString("token"))) return;
            String action = data.optString("action");
            if ("state".equals(action)) {
                ready = true;
                web.setVisibility(View.VISIBLE);
                failure.setVisibility(View.GONE);
                startupPending = false;
                return;
            }
            if ("healthy".equals(action)) return;
            if ("back-root".equals(action)) {
                if (HostProtocol.allowBackground(ready, backSequence, data.optInt("seq", -1), data.optBoolean("backToDesktop"))) openSystemHome();
                return;
            }
            if ("open-external".equals(action)) { openExternal(data.optString("url")); return; }
            String id = data.optString("id");
            if (id.isEmpty() || id.length() > 100) return;
            switch (action) {
                case "ping": reply(result(id, "ready")); break;
                case "abort": {
                    Future<?> task = tasks.remove(id);
                    if (task != null) task.cancel(true);
                    HttpURLConnection connection = connections.remove(id);
                    if (connection != null) connection.disconnect();
                    break;
                }
                case "request": request(id, data); break;
                case "update-download": {
                    JSONObject release = data.optJSONObject("release");
                    if (release == null) { replyError(id, "更新信息不完整"); break; }
                    release.put("base", data.optString("base"));
                    updater.download(release, value -> replyUpdate(id, value));
                    break;
                }
                case "update-cancel": updater.cancel(value -> replyUpdate(id, value)); break;
                case "update-status": updater.status(value -> replyUpdate(id, value)); break;
                case "update-install": updater.install(value -> replyUpdate(id, value)); break;
                case "pick-files": pickFiles(id, data.optBoolean("multiple")); break;
                case "camera-capture": capturePhoto(id, null); break;
                case "save": save(id, data, false); break;
                case "print": save(id, data, true); break;
                case "font": font(id, data.optString("family")); break;
                case "font-system-list": reply(result(id, "system-fonts").put("fonts", new JSONArray())); break;
                case "clipboard-write": clipboard(id, data.optString("text")); break;
                default: replyError(id, "当前原生接口不支持此操作，请更新应用");
            }
        } catch (JSONException error) { /* 无效消息不进入原生操作。 */ }
    }

    private void openExternal(String value) {
        try {
            Uri uri = Uri.parse(value);
            String scheme = uri.getScheme();
            if (!"https".equals(scheme) && !"http".equals(scheme) && !"mailto".equals(scheme)) return;
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) { }
    }

    @Override public void onBackPressed() {
        if (!ready) { openSystemHome(); return; }
        long now = System.currentTimeMillis();
        if (now - lastBack < 500) return;
        lastBack = now;
        int sequence = ++backSequence;
        evaluate("window.dispatchEvent(new Event('seal-persist-workspace'));" +
                "window.dispatchEvent(new CustomEvent('seal-native-back',{cancelable:true,detail:{seq:" + sequence + "}}))");
    }

    private void openSystemHome() {
        Intent home = new Intent(Intent.ACTION_MAIN);
        home.addCategory(Intent.CATEGORY_HOME);
        home.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(home); }
        catch (Exception error) { moveTaskToBack(true); }
    }

    @Override public void onDestroy() {
        if (updater != null) updater.close();
        for (Future<?> task : tasks.values()) task.cancel(true);
        for (HttpURLConnection connection : connections.values()) connection.disconnect();
        workers.shutdownNow();
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }

    private void replyUpdate(String id, JSONObject value) {
        try { reply(result(id, "update-result").put("value", value)); } catch (JSONException ignored) { }
    }

    private void clipboard(String id, String text) {
        if (text.length() > 4194304) { replyError(id, "复制内容超过 4 MiB，请分段复制"); return; }
        try {
            ClipboardManager manager = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            manager.setPrimaryClip(ClipData.newPlainText("海豹办公", text));
            reply(result(id, "written"));
        } catch (Exception error) { replyError(id, "系统剪贴板写入失败，请重试"); }
    }

    private void request(String id, JSONObject data) {
        String url = data.optString("url");
        if (!HostProtocol.isRequestUrlAllowed(url)) { replyError(id, "联网地址须使用 HTTPS"); return; }
        Future<?> task = workers.submit(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connections.put(id, connection);
                connection.setRequestMethod(data.optString("method", "GET"));
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(data.optBoolean("stream") ? 900000 : 60000);
                connection.setUseCaches(false);
                JSONObject headers = data.optJSONObject("headers");
                if (headers != null) {
                    Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        connection.setRequestProperty(key, headers.optString(key));
                    }
                }
                String bodyText = data.optString("bodyText");
                String body = data.optString("body");
                if (!bodyText.isEmpty() || !body.isEmpty()) {
                    byte[] bytes = !bodyText.isEmpty() ? bodyText.getBytes(StandardCharsets.UTF_8) : Base64.decode(body, Base64.DEFAULT);
                    connection.setDoOutput(true);
                    try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
                }
                int status = connection.getResponseCode();
                JSONObject responseHeaders = new JSONObject();
                for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                    if (entry.getKey() != null && entry.getValue() != null) responseHeaders.put(entry.getKey(), String.join(", ", entry.getValue()));
                }
                reply(result(id, "headers").put("status", status).put("headers", responseHeaders));
                InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                if (input != null) try (InputStream stream = input) {
                    byte[] chunk = new byte[24576];
                    int read;
                    while (!Thread.currentThread().isInterrupted() && (read = stream.read(chunk)) >= 0) {
                        if (read > 0) reply(result(id, "chunk").put("data", Base64.encodeToString(chunk, 0, read, Base64.NO_WRAP)));
                    }
                }
                if (!Thread.currentThread().isInterrupted()) reply(result(id, "end").put("status", status).put("headers", responseHeaders));
            } catch (Exception error) {
                if (!Thread.currentThread().isInterrupted()) replyError(id, "网络请求失败：" + error.getMessage());
            } finally {
                tasks.remove(id);
                connections.remove(id);
                if (connection != null) connection.disconnect();
            }
        });
        tasks.put(id, task);
    }

    private void font(String id, String family) {
        tasks.put(id, workers.submit(() -> {
            String name = "serif".equals(family) ? "NotoSerifCJKsc-Regular.otf" : "NotoSansSC.ttf";
            try (InputStream input = getAssets().open(LEGACY_ASSET_ROOT + "fonts/" + name)) {
                byte[] chunk = new byte[24576]; int read;
                while ((read = input.read(chunk)) >= 0) if (read > 0) reply(result(id, "chunk").put("data", Base64.encodeToString(chunk, 0, read, Base64.NO_WRAP)));
                reply(result(id, "end"));
            } catch (Exception error) { replyError(id, "内置字体读取失败，请重新安装应用"); }
            finally { tasks.remove(id); }
        }));
    }

    private void pickFiles(String id, boolean multiple) {
        if (pickId != null) { replyError(id, "已有文件选择窗口，请先完成当前操作"); return; }
        pickId = id;
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
            startActivityForResult(intent, PICK_DOCUMENT);
        } catch (Exception error) { pickId = null; replyError(id, "系统文件选择器未能打开"); }
    }

    /** 拍照：先确认运行时相机权限（网页层已先展示本应用的授权说明），再打开系统相机写入缓存文件。 */
    private boolean capturePhoto(String id, ValueCallback<Uri[]> callback) {
        if (cameraId != null || cameraCallback != null) {
            if (id != null) replyError(id, "相机已打开，请先完成当前拍摄");
            else callback.onReceiveValue(null);
            return true;
        }
        cameraId = id; cameraCallback = callback;
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
            return true;
        }
        openCamera();
        return true;
    }

    private void openCamera() {
        try {
            File directory = new File(getCacheDir(), "camera");
            File[] old = directory.listFiles();
            if (old != null) for (File item : old) item.delete();
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法创建拍照缓存目录");
            cameraFile = new File(directory, HostProtocol.cameraFileName(UUID.randomUUID().toString()));
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".scanfiles", cameraFile);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(intent, CAMERA_CAPTURE);
        } catch (ActivityNotFoundException error) {
            finishCamera("camera-error", "未找到可用的系统相机，请改用相册或文件导入");
        } catch (Exception error) {
            finishCamera("camera-error", "系统相机未能打开，请改用相册或文件导入");
        }
    }

    /** 结束本次拍照：拒绝、取消或失败时回传原因并清理临时文件。 */
    private void finishCamera(String type, String detail) {
        String id = cameraId; ValueCallback<Uri[]> callback = cameraCallback;
        cameraId = null; cameraCallback = null;
        if (cameraFile != null) cameraFile.delete();
        cameraFile = null; cameraUri = null;
        if (callback != null) {
            callback.onReceiveValue(null);
            if ("camera-denied".equals(type)) evaluate("window.dispatchEvent(new Event('seal-camera-denied'))");
        }
        if (id == null) return;
        try {
            if ("cancel".equals(type)) reply(result(id, "cancel"));
            else if ("camera-denied".equals(type)) reply(result(id, "camera-denied").put("error", detail));
            else replyError(id, detail);
        } catch (JSONException ignored) { }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != CAMERA_PERMISSION) return;
        if (HostProtocol.permissionGranted(results)) openCamera();
        else finishCamera("camera-denied", "未获得相机权限，可在系统设置中开启，或改用相册、文件导入");
    }

    private void readCameraPhoto(String id, File file) {
        try {
            long size = file.length();
            if (size <= 0) throw new IOException("拍照未生成图片，请重试");
            if (size > MAX_IMPORT) throw new IOException("照片超过 100 MiB，无法导入");
            reply(result(id, "file-start").put("name", file.getName()).put("size", size));
            try (InputStream input = new java.io.FileInputStream(file)) {
                byte[] chunk = new byte[24576]; int read;
                while ((read = input.read(chunk)) >= 0) if (read > 0) reply(result(id, "chunk").put("data", Base64.encodeToString(chunk, 0, read, Base64.NO_WRAP)));
            }
            reply(result(id, "file-end"));
            reply(result(id, "end"));
        } catch (Exception error) { replyError(id, error.getMessage() == null ? "照片读取失败，请重试" : error.getMessage()); }
        finally { file.delete(); tasks.remove(id); }
    }

    private void save(String id, JSONObject data, boolean print) {
        if (saveId != null) { replyError(id, "已有文件保存窗口，请先完成当前操作"); return; }
        String name = HostProtocol.safeExportName(data.optString("name", "文档"));
        String encoded = data.optString("data");
        if (encoded.length() > 150000000) { replyError(id, "文件过大，无法导出"); return; }
        saveId = id;
        tasks.put(id, workers.submit(() -> {
            try {
                byte[] content = Base64.decode(encoded, Base64.DEFAULT);
                File file = File.createTempFile("seal-export-", "-" + name, getCacheDir());
                try (OutputStream output = new FileOutputStream(file)) { output.write(content); }
                ui.post(() -> {
                    saveFile = file; saveName = name;
                    if (print) startPrint(id, file, name);
                    else try {
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType(data.optString("mime", "application/octet-stream"));
                        intent.putExtra(Intent.EXTRA_TITLE, name);
                        startActivityForResult(intent, SAVE_DOCUMENT);
                    } catch (Exception error) { clearSave(); replyError(id, "系统保存窗口未能打开"); }
                });
            } catch (Exception error) { ui.post(() -> clearSave()); replyError(id, "导出文件准备失败，请重试"); }
            finally { tasks.remove(id); }
        }));
    }

    private void startPrint(String id, File file, String name) {
        try {
            PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
            manager.print(name, new PrintDocumentAdapter() {
                @Override public void onLayout(PrintAttributes oldAttributes, PrintAttributes attributes,
                                               CancellationSignal cancellation, LayoutResultCallback callback, Bundle extras) {
                    if (cancellation.isCanceled()) { callback.onLayoutCancelled(); return; }
                    callback.onLayoutFinished(new PrintDocumentInfo.Builder(name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true);
                }
                @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor destination,
                                              CancellationSignal cancellation, WriteResultCallback callback) {
                    workers.submit(() -> {
                        try (InputStream input = new java.io.FileInputStream(file);
                             OutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(destination)) {
                            byte[] chunk = new byte[65536]; int read;
                            while ((read = input.read(chunk)) >= 0) {
                                if (cancellation.isCanceled()) { callback.onWriteCancelled(); return; }
                                output.write(chunk, 0, read);
                            }
                            callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                        } catch (IOException error) { callback.onWriteFailed("打印文件读取失败"); }
                    });
                }
                @Override public void onFinish() { file.delete(); }
            }, new PrintAttributes.Builder().build());
            reply(result(id, "printed"));
        } catch (Exception error) { replyError(id, "系统打印界面未能打开"); }
        finally { saveId = null; saveFile = null; saveName = null; }
    }

    private void clearSave() {
        if (saveFile != null) saveFile.delete();
        saveId = null; saveFile = null; saveName = null;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == NativeUpdater.INSTALL_REQUEST) { if (updater != null) updater.installReturned(); return; }
        if (requestCode == HTML_PICKER) {
            ValueCallback<Uri[]> callback = htmlPicker; htmlPicker = null;
            if (callback != null) callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            return;
        }
        if (requestCode == CAMERA_CAPTURE) {
            File file = cameraFile; Uri uri = cameraUri;
            if (resultCode != RESULT_OK || file == null || !file.isFile() || file.length() <= 0) { finishCamera("cancel", ""); return; }
            String id = cameraId; ValueCallback<Uri[]> callback = cameraCallback;
            cameraId = null; cameraCallback = null; cameraFile = null; cameraUri = null;
            if (callback != null) callback.onReceiveValue(new Uri[]{uri});
            else if (id != null) tasks.put(id, workers.submit(() -> readCameraPhoto(id, file)));
            return;
        }
        if (requestCode == PICK_DOCUMENT) {
            String id = pickId; pickId = null;
            if (id == null) return;
            if (resultCode != RESULT_OK || data == null) { try { reply(result(id, "cancel")); } catch (JSONException ignored) { } return; }
            ArrayList<Uri> items = new ArrayList<>();
            if (data.getClipData() != null) for (int index = 0; index < data.getClipData().getItemCount(); index++) items.add(data.getClipData().getItemAt(index).getUri());
            else if (data.getData() != null) items.add(data.getData());
            tasks.put(id, workers.submit(() -> readPicked(id, items)));
            return;
        }
        if (requestCode == SAVE_DOCUMENT) {
            String id = saveId;
            File file = saveFile;
            if (id == null) return;
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                clearSave(); try { reply(result(id, "cancel")); } catch (JSONException ignored) { } return;
            }
            Uri destination = data.getData();
            tasks.put(id, workers.submit(() -> {
                try (InputStream input = new java.io.FileInputStream(file);
                     OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
                    if (output == null) throw new IOException("系统拒绝写入");
                    byte[] chunk = new byte[65536]; int read;
                    while ((read = input.read(chunk)) >= 0) output.write(chunk, 0, read);
                    reply(result(id, "saved").put("path", destination.toString()));
                } catch (Exception error) { replyError(id, "文件保存失败，请选择其他位置后重试"); }
                finally { ui.post(this::clearSave); tasks.remove(id); }
            }));
        }
    }

    private void readPicked(String id, List<Uri> items) {
        try {
            if (items.size() > 20) throw new IOException("一次最多选择 20 个文件");
            long aggregate = 0;
            for (Uri uri : items) {
                String name = "文档"; long size = -1;
                try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        int sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (nameColumn >= 0) name = cursor.getString(nameColumn);
                        if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) size = cursor.getLong(sizeColumn);
                    }
                }
                if (size > MAX_IMPORT || aggregate + Math.max(0, size) > MAX_IMPORT) throw new IOException("一次导入的文件总大小不能超过 100 MiB");
                reply(result(id, "file-start").put("name", name).put("size", Math.max(0, size)));
                try (InputStream input = getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new IOException("系统拒绝读取所选文件");
                    byte[] chunk = new byte[24576]; int read;
                    while ((read = input.read(chunk)) >= 0) if (read > 0) {
                        aggregate += read;
                        if (aggregate > MAX_IMPORT) throw new IOException("一次导入的文件总大小不能超过 100 MiB");
                        reply(result(id, "chunk").put("data", Base64.encodeToString(chunk, 0, read, Base64.NO_WRAP)));
                    }
                }
                reply(result(id, "file-end"));
            }
            reply(result(id, "end"));
        } catch (Exception error) { replyError(id, error.getMessage() == null ? "所选文件读取失败" : error.getMessage()); }
        finally { tasks.remove(id); }
    }
}
