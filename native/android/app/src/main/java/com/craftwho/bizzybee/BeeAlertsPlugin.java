package com.craftwho.bizzybee;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.provider.AlarmClock;
import android.provider.CalendarContract;
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
        // Oct 30 2026 (Craft): BizzyBee's own buzz first (res/raw/bizzybee_buzz.wav).
        int buzz = getContext().getResources().getIdentifier("bizzybee_buzz", "raw", getContext().getPackageName());
        if (buzz != 0) {
            JSObject b = new JSObject();
            b.put("title", "🐝 BizzyBee buzz");
            b.put("uri", "android.resource://" + getContext().getPackageName() + "/raw/bizzybee_buzz");
            out.put(b);
        }
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

    // Oct 30 2026 (Craft): "Set alarm" - opens the phone's Clock with the
    // time filled in, so the user confirms it there. days = Calendar.SUNDAY(1)..SATURDAY(7).
    @PluginMethod
    public void setAlarm(PluginCall call) {
        try {
            Intent i = new Intent(AlarmClock.ACTION_SET_ALARM);
            i.putExtra(AlarmClock.EXTRA_HOUR, call.getInt("hour", 9));
            i.putExtra(AlarmClock.EXTRA_MINUTES, call.getInt("minutes", 0));
            i.putExtra(AlarmClock.EXTRA_MESSAGE, call.getString("message", "BizzyBee"));
            JSArray days = call.getArray("days");
            if (days != null && days.length() > 0) {
                java.util.ArrayList<Integer> list = new java.util.ArrayList<>();
                for (int d = 0; d < days.length(); d++) list.add(days.optInt(d));
                i.putExtra(AlarmClock.EXTRA_DAYS, list);
            }
            i.putExtra(AlarmClock.EXTRA_SKIP_UI, false);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No clock app found");
        }
    }

    // Oct 30 2026 (Craft): "Add to calendar" - opens the phone's calendar
    // with the event filled in. No calendar permission needed.
    @PluginMethod
    public void addToCalendar(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI);
            i.putExtra(CalendarContract.Events.TITLE, call.getString("title", "BizzyBee"));
            i.putExtra(CalendarContract.Events.DESCRIPTION, call.getString("notes", ""));
            // Times come in as ms numbers; read them as Long or Double, whichever JSON gave.
            long begin = call.getData().optLong("begin", 0), end = call.getData().optLong("end", 0);
            if (begin > 0) i.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, begin);
            if (end > 0) i.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end);
            i.putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, Boolean.TRUE.equals(call.getBoolean("allDay", false)));
            String rrule = call.getString("rrule", "");
            if (rrule != null && !rrule.isEmpty()) i.putExtra(CalendarContract.Events.RRULE, rrule);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No calendar app found");
        }
    }
}
