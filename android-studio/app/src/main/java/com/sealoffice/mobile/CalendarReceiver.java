package com.sealoffice.mobile;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Iterator;

public class CalendarReceiver extends BroadcastReceiver {
    private static final String FIRE = "com.sealoffice.mobile.CALENDAR";
    private static SharedPreferences store(Context context) {
        return context.getSharedPreferences("calendar-alarms", Context.MODE_PRIVATE);
    }
    private static PendingIntent intent(Context context, String id) {
        Intent intent = new Intent(context, CalendarReceiver.class).setAction(FIRE)
            .setData(new Uri.Builder().scheme("seal-calendar").authority("event").appendPath(id).build());
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private static void schedule(Context context, String id, long at) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        PendingIntent action = intent(context, id);
        if (Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms()) {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, action);
        } else {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, action);
        }
    }

    static String sync(Context context, JSONArray events) throws org.json.JSONException {
        if (events == null || events.length() > 5000) throw new IllegalArgumentException("日程列表无效");
        JSONObject previous = new JSONObject(store(context).getString("pending", "{}"));
        JSONObject next = new JSONObject();
        for (int i=0; i<events.length(); i++) {
            JSONObject item = events.getJSONObject(i);
            if (item.getLong("at") > System.currentTimeMillis()) next.put(item.getString("id"), item);
        }
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        for (Iterator<String> it=previous.keys(); it.hasNext();) {
            String id = it.next();
            if (!next.has(id)) alarms.cancel(intent(context, id));
        }
        for (Iterator<String> it=next.keys(); it.hasNext();) {
            String id = it.next();
            schedule(context, id, next.getJSONObject(id).getLong("at"));
        }
        if (!store(context).edit().putString("pending", next.toString()).commit()) throw new IllegalStateException("系统提醒未保存");
        if (!context.getSystemService(NotificationManager.class).areNotificationsEnabled()) return "系统通知权限未开启";
        return Build.VERSION.SDK_INT >= 31 && !alarms.canScheduleExactAlarms()
            ? "系统后台提醒，未开启精确闹钟权限时可能延迟" : "系统到点提醒，支持后台和锁屏";
    }
    @Override public void onReceive(Context context, Intent delivered) {
        try {
            JSONObject events = new JSONObject(store(context).getString("pending", "{}"));
            long now = System.currentTimeMillis();
            if (!FIRE.equals(delivered.getAction())) {
                for (Iterator<String> it=events.keys(); it.hasNext();) {
                    String id = it.next();
                    long at = events.getJSONObject(id).getLong("at");
                    if (at > now) schedule(context, id, at);
                }
                return;
            }
            if (delivered.getData() == null) return;
            String id = delivered.getData().getLastPathSegment();
            JSONObject item = events.optJSONObject(id);
            if (item == null || item.getLong("at") > now) return;
            events.remove(id);
            store(context).edit().putString("pending", events.toString()).apply();
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (!manager.areNotificationsEnabled()) return;
            String tone = item.optString("tone");
            if (!tone.equals("mallet") && !tone.equals("double")) tone = "bell";
            String channelId = "calendar-" + tone;
            String name = tone.equals("mallet") ? "木琴" : tone.equals("double") ? "双音" : "轻铃";
            NotificationChannel channel = new NotificationChannel(channelId, "日程 · " + name, NotificationManager.IMPORTANCE_HIGH);
            channel.setSound(Uri.parse("android.resource://" + context.getPackageName() + "/raw/seal_" + tone),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).build());
            manager.createNotificationChannel(channel);
            PendingIntent open = PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE);
            manager.notify(id, 1, new Notification.Builder(context, channelId).setContentTitle(item.getString("title"))
                .setContentText(item.getString("time")).setSmallIcon(R.drawable.seal_logo)
                .setAutoCancel(true).setContentIntent(open).build());
        } catch (Exception error) { android.util.Log.w("Calendar", "Calendar alarm delivery failed", error); }
    }
}
