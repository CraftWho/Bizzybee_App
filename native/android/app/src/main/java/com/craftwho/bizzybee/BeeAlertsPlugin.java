package com.craftwho.bizzybee;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Notification sound + vibration settings (Oct 27 2026).
 * Android fixes a channel's sound and vibration when the channel is made,
 * so the web side asks for a new channel id whenever the settings change.
 */
@CapacitorPlugin(name = "BeeAlerts")
public class BeeAlertsPlugin extends Plugin {
    private Ringtone playing;
    private final Handler main = new Handler(Looper.getMainLooper());

    private int typeOf(String kind) {
        if ("alarm".equals(kind)) return RingtoneManager.TYPE_ALARM;
        if ("ringtone".equals(kind)) return RingtoneManager.TYPE_RINGTONE;
        return RingtoneManager.TYPE_NOTIFICATION;
    }

    private Uri soundUri(String sound, boolean alarm) {
        if (sound == null || "default".equals(sound)) {
            return RingtoneManager.getDefaultUri(alarm ? RingtoneManager.TYPE_ALARM : RingtoneManager.TYPE_NOTIFICATION);
        }
        return Uri.parse(sound);
    }

    private long[] toLongs(JSArray a) {
        if (a == null) return null;
        long[] p = new long[a.length()];
        for (int i = 0; i < a.length(); i++) p[i] = a.optLong(i);
        return p;
    }

    /** The phone's own tones: { default, sounds: [{ title, uri }] }. */
    @PluginMethod
    public void listSounds(PluginCall call) {
        int type = typeOf(call.getString("kind", "notification"));
        JSArray out = new JSArray();
        Set<String> seen = new HashSet<>();
        try {
            RingtoneManager rm = new RingtoneManager(getContext());
            rm.setType(type);
            Cursor c = rm.getCursor();
            while (c != null && c.moveToNext() && out.length() < 200) {
                String title = c.getString(RingtoneManager.TITLE_COLUMN_INDEX);
                Uri uri = rm.getRingtoneUri(c.getPosition());
                if (uri == null || title == null || !seen.add(title)) continue;
                JSObject o = new JSObject();
                o.put("title", title);
                o.put("uri", uri.toString());
                out.put(o);
            }
        } catch (Exception ignored) { }
        JSObject ret = new JSObject();
        Uri def = RingtoneManager.getDefaultUri(type);
        ret.put("default", def != null ? def.toString() : "");
        ret.put("sounds", out);
        call.resolve(ret);
    }

    /** { id, name, importance 1-5, sound: "default"|"none"|uri, alarm, pattern: [ms...] } */
    @PluginMethod
    public void createChannel(PluginCall call) {
        if (Build.VERSION.SDK_INT < 26) { call.resolve(); return; }
        String id = call.getString("id");
        if (id == null) { call.reject("id is required"); return; }
        String name = call.getString("name", id);
        int importance = call.getInt("importance", 3);
        String sound = call.getString("sound", "default");
        boolean alarm = Boolean.TRUE.equals(call.getBoolean("alarm", false));
        NotificationChannel ch = new NotificationChannel(id, name, importance);
        if ("none".equals(sound)) {
            ch.setSound(null, null);
        } else {
            AudioAttributes aa = new AudioAttributes.Builder()
                .setUsage(alarm ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            ch.setSound(soundUri(sound, alarm), aa);
        }
        long[] p = toLongs(call.getArray("pattern"));
        if (p == null || p.length < 2) {
            ch.enableVibration(false);
        } else {
            ch.enableVibration(true);
            ch.setVibrationPattern(p);
        }
        ch.enableLights(true);
        ch.setLightColor(0xFFFFCC00);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.createNotificationChannel(ch);
        call.resolve();
    }

    /** Deletes our old channels: every id starting with prefix that isn't in keep. */
    @PluginMethod
    public void cleanChannels(PluginCall call) {
        if (Build.VERSION.SDK_INT < 26) { call.resolve(); return; }
        String prefix = call.getString("prefix", "bb-");
        Set<String> keep = new HashSet<>();
        JSArray k = call.getArray("keep");
        if (k != null) for (int i = 0; i < k.length(); i++) keep.add(k.optString(i));
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            List<NotificationChannel> all = nm.getNotificationChannels();
            for (NotificationChannel ch : all) {
                String id = ch.getId();
                if (id.startsWith(prefix) && !keep.contains(id)) nm.deleteNotificationChannel(id);
            }
        }
        call.resolve();
    }

    /** Plays a tone for 3 seconds so you can hear it before picking it. */
    @PluginMethod
    public void previewSound(PluginCall call) {
        String sound = call.getString("sound", "default");
        boolean alarm = Boolean.TRUE.equals(call.getBoolean("alarm", false));
        main.post(() -> {
            stopPlaying();
            if (!"none".equals(sound)) {
                playing = RingtoneManager.getRingtone(getContext(), soundUri(sound, alarm));
                if (playing != null) {
                    playing.play();
                    main.postDelayed(this::stopPlaying, 3000);
                }
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void stopPreview(PluginCall call) {
        main.post(this::stopPlaying);
        call.resolve();
    }

    private void stopPlaying() {
        if (playing != null && playing.isPlaying()) playing.stop();
    }

    /** Feel a vibration rhythm once. */
    @PluginMethod
    public void previewVibration(PluginCall call) {
        long[] p = toLongs(call.getArray("pattern"));
        Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null && p != null && p.length > 1) {
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(p, -1));
            else v.vibrate(p, -1);
        }
        call.resolve();
    }
}
