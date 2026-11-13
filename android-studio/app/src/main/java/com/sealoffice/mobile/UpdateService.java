package com.sealoffice.mobile;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import java.util.UUID;
import org.json.JSONObject;
import androidx.core.app.NotificationManagerCompat;

/** 用户主动开始的更新下载在前台服务中运行，并以通知展示真实进度。 */
public final class UpdateService extends Service {
    private static final String CHANNEL = "seal_update_download";
    private static final int NOTIFICATION = 20942;
    private static final String EXTRA_TOKEN = "seal_update_notification_token";
    private static NativeUpdater updater;
    private static volatile UpdateService running;
    private final Handler ui = new Handler(Looper.getMainLooper());

    static synchronized NativeUpdater attach(Activity activity, NativeUpdater.Listener listener) {
        if (updater == null) updater = new NativeUpdater(activity.getApplicationContext());
        updater.attach(activity, listener);
        return updater;
    }
    static synchronized NativeUpdater updater(Context context) {
        if (updater == null) updater = new NativeUpdater(context.getApplicationContext());
        return updater;
    }
    static void begin(Context context) {
        Intent intent = new Intent(context, UpdateService.class);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
        else context.startService(intent);
    }
    static boolean isInstallIntent(Context context, Intent intent) {
        if (intent == null) return false;
        String expected = context.getSharedPreferences("seal_update_notifications", MODE_PRIVATE).getString("token", "");
        String token = intent.getStringExtra(EXTRA_TOKEN);
        intent.removeExtra(EXTRA_TOKEN);
        return token != null && !expected.isEmpty() && expected.equals(token);
    }
    static boolean notificationsVisible(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        NotificationChannel channel = ((NotificationManager) context.getSystemService(NOTIFICATION_SERVICE)).getNotificationChannel(CHANNEL);
        return channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }
    static void update(Context context, JSONObject state) {
        String phase = state.optString("阶段", "");
        if ("已取消".equals(phase) || "安装中".equals(phase)) {
            ((NotificationManager) context.getSystemService(NOTIFICATION_SERVICE)).cancel(NOTIFICATION);
        }
        UpdateService service = running;
        if (service == null) return;
        JSONObject copy;
        try { copy = new JSONObject(state.toString()); }
        catch (Exception ignored) { return; }
        service.ui.post(() -> { if (running == service) service.show(copy); });
    }
    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = (NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "应用更新", NotificationManager.IMPORTANCE_LOW));
        running = this;
        startForeground(NOTIFICATION, notification(updater(this).current()));
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        show(updater(this).current());
        return START_NOT_STICKY;
    }
    private Notification notification(JSONObject state) {
        String phase = state.optString("阶段", "下载中");
        boolean ready = "已就绪".equals(phase);
        boolean downloading = "下载中".equals(phase) || "校验中".equals(phase) || "空闲".equals(phase);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (ready) {
            String token = UUID.randomUUID().toString();
            if (!getSharedPreferences("seal_update_notifications", MODE_PRIVATE).edit().putString("token", token).commit()) throw new IllegalStateException("无法保存更新通知状态");
            open.putExtra(EXTRA_TOKEN, token);
        }
        PendingIntent click = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.seal_logo)
                .setContentTitle("海豹办公更新").setContentIntent(click).setOnlyAlertOnce(true)
                .setContentText(ready ? "下载完成，点击安装" : "失败".equals(phase) ? "下载失败，点击查看" : "正在下载更新")
                .setOngoing(downloading).setAutoCancel(!downloading);
        if (downloading) {
            long total = state.optLong("总大小", 0), done = state.optLong("已下载", 0);
            int percent = total > 0 ? (int)Math.min(100, Math.max(0, done * 100 / total)) : 0;
            builder.setProgress(100, percent, total <= 0).setContentText("校验中".equals(phase) ? "正在校验安装包" : total > 0 ? "正在下载更新 " + percent + "%" : "正在准备下载");
        }
        return builder.build();
    }
    private void show(JSONObject state) {
        String phase = state.optString("阶段", "");
        if ("已取消".equals(phase) || "安装中".equals(phase)) { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return; }
        Notification value = notification(state);
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION, value);
        if ("已就绪".equals(phase) || "失败".equals(phase) || "安装中".equals(phase)) {
            stopForeground(STOP_FOREGROUND_DETACH); stopSelf();
        }
    }
    @Override public void onTimeout(int startId, int fgsType) {
        updater(this).cancel(value -> {});
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }
    @Override public void onDestroy() { if (running == this) running = null; super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
