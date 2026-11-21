package com.craftwho.bizzybee;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * Nov 21 2026 (Craft; approved): KEEP BIZZYBEE RUNNING. A foreground service: Android keeps the app alive
 * while this always-on, silent notification shows (like a music or step app). It carries the hive status bar
 * ("🐝 12 working · 3 resting" / "Lv 13 · 🍯 40 honey · ☁️ Saved 3:10 PM"), which the app updates as things
 * change, and lets the app keep uploading your save after you leave it. Turned on and off in Settings
 * (BeeFiles.hiveService). Tapping it opens Hive Life.
 */
public class HiveService extends Service {
    static final String CHANNEL = "hive-status";
    static final int ID = 990002;
    private static String title = "🐝 BizzyBee";
    private static String body = "Keeping your hive running";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String t = intent.getStringExtra("title"), b = intent.getStringExtra("body");
            if (t != null) title = t;
            if (b != null) body = b;
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Hive status", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Your hive and save at a glance");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("bizzybee://hive")).setClass(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_bee)
                .setColor(0xFFFFCC00)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setShowWhen(false)
                .setContentIntent(pi)
                .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(ID, n);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
