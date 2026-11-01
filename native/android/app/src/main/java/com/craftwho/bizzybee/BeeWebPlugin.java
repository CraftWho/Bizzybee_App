package com.craftwho.bizzybee;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Iterator;

/**
 * App copy updates (Nov 1 2026, Craft). BizzyBee runs its own copy of the
 * app files (inside the APK). After each website deploy, update() downloads
 * only the files whose fingerprint changed (app-files.json) into a new
 * folder; unchanged files are copied from the current copy. The new folder
 * is used from the next start (Capacitor's saved server path), or right away
 * with restart(). confirm() marks a version as good; MainActivity goes back
 * to the last good copy if a new one fails to start twice.
 * A new APK always starts from its own built-in copy (Capacitor resets it).
 */
@CapacitorPlugin(name = "BeeWeb")
public class BeeWebPlugin extends Plugin {
    static final String PREFS = "bee_web";
    static final String PENDING = "pending";       // folder of a version not confirmed yet
    static final String TRIES = "tries";           // starts of that version without confirm()
    static final String GOOD = "good";             // last confirmed folder ("" = built-in copy)
    static final String CAP_PREFS = "CapWebViewSettings";   // com.getcapacitor.plugin.WebView
    static final String CAP_PATH = "serverBasePath";

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private File webRoot() { File d = new File(getContext().getFilesDir(), "web"); if (!d.exists()) d.mkdirs(); return d; }

    /** The folder being served now, or null for the copy built into the APK. */
    private String currentDir() {
        String base = getBridge().getServerBasePath();
        return base != null && base.startsWith("/") ? base : null;
    }

    private InputStream openCurrent(String rel) throws Exception {
        String dir = currentDir();
        if (dir != null) return new FileInputStream(new File(dir, rel));
        AssetManager am = getContext().getAssets();
        return am.open("public/" + rel);
    }

    private static byte[] readAll(InputStream in) throws Exception {
        try (InputStream i = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[64 * 1024]; int n;
            while ((n = i.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static String sha256(byte[] data) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(data);
        StringBuilder sb = new StringBuilder();
        for (byte b : d) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static byte[] get(String url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        try {
            con.setConnectTimeout(20000);
            con.setReadTimeout(30000);
            con.setRequestProperty("Cache-Control", "no-cache");
            int code = con.getResponseCode();
            if (code != 200) throw new Exception("Download failed (" + code + ") " + url);
            return readAll(con.getInputStream());
        } finally { con.disconnect(); }
    }

    /** "src/core/app.js" -> "src/core/app.js" with each part URL-encoded. */
    private static String encodePath(String rel) throws Exception {
        StringBuilder sb = new StringBuilder();
        for (String part : rel.split("/")) {
            if (sb.length() > 0) sb.append('/');
            sb.append(URLEncoder.encode(part, "UTF-8").replace("+", "%20"));
        }
        return sb.toString();
    }

    /** Only plain relative paths inside the app folder. */
    private static boolean safePath(String rel) {
        return rel != null && !rel.isEmpty() && !rel.startsWith("/") && !rel.contains("..") && !rel.contains("\\") && !rel.contains(":");
    }

    private static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    /** { site } -> { updated, version, downloaded, copied } (updated=false when already current). */
    @PluginMethod
    public void update(PluginCall call) {
        String site = call.getString("site");
        if (site == null || !site.startsWith("https://")) { call.reject("site is required"); return; }
        new Thread(() -> {
            File tmp = null;
            try {
                JSONObject remote = new JSONObject(new String(get(site + "/app-files.json?t=" + System.currentTimeMillis()), StandardCharsets.UTF_8));
                String version = remote.getString("version");
                JSONObject files = remote.getJSONObject("files");
                JSONObject localFiles = new JSONObject();
                String localVersion = "";
                try {
                    JSONObject local = new JSONObject(new String(readAll(openCurrent("app-files.json")), StandardCharsets.UTF_8));
                    localVersion = local.optString("version", "");
                    localFiles = local.optJSONObject("files") != null ? local.getJSONObject("files") : new JSONObject();
                } catch (Exception ignore) { /* no list: every file counts as changed */ }

                JSObject ret = new JSObject();
                String safeVersion = version.replaceAll("[^A-Za-z0-9_-]", "");
                if (safeVersion.isEmpty()) throw new Exception("Bad version");
                File done = new File(webRoot(), safeVersion);
                String pending = prefs().getString(PENDING, "");
                if (version.equals(localVersion) || (done.exists() && done.getAbsolutePath().equals(pending))) {
                    ret.put("updated", false);
                    ret.put("version", version);
                    call.resolve(ret);
                    return;
                }

                tmp = new File(webRoot(), safeVersion + ".tmp");
                deleteTree(tmp);
                tmp.mkdirs();
                int downloaded = 0, copied = 0;
                Iterator<String> keys = files.keys();
                while (keys.hasNext()) {
                    String rel = keys.next();
                    if (!safePath(rel)) throw new Exception("Bad file name in list");
                    JSONArray info = files.getJSONArray(rel);
                    String hash = info.getString(0);
                    byte[] data = null;
                    JSONArray mine = localFiles.optJSONArray(rel);
                    if (mine != null && hash.equals(mine.optString(0))) {
                        try { data = readAll(openCurrent(rel)); if (!hash.equals(sha256(data))) data = null; else copied++; }
                        catch (Exception ignore) { data = null; }
                    }
                    if (data == null) {
                        data = get(site + "/" + encodePath(rel) + "?v=" + URLEncoder.encode(version, "UTF-8"));
                        if (!hash.equals(sha256(data))) throw new Exception("File check failed: " + rel);
                        downloaded++;
                    }
                    File out = new File(tmp, rel);
                    File parent = out.getParentFile();
                    if (parent != null && !parent.exists()) parent.mkdirs();
                    try (OutputStream os = new FileOutputStream(out)) { os.write(data); }
                }
                try (OutputStream os = new FileOutputStream(new File(tmp, "app-files.json"))) { os.write(remote.toString().getBytes(StandardCharsets.UTF_8)); }
                try {
                    byte[] v = get(site + "/version.json?t=" + System.currentTimeMillis());
                    try (OutputStream os = new FileOutputStream(new File(tmp, "version.json"))) { os.write(v); }
                } catch (Exception ignore) { /* optional */ }
                if (!new File(tmp, "index.html").exists()) throw new Exception("The update is missing index.html");

                deleteTree(done);
                if (!tmp.renameTo(done)) throw new Exception("Could not save the update");
                tmp = null;

                // Used from the next start. Not confirmed until it starts fine.
                getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_PATH, done.getAbsolutePath()).apply();
                prefs().edit().putString(PENDING, done.getAbsolutePath()).putInt(TRIES, 0).apply();

                // Keep only the new copy, the one in use and the last good one.
                String cur = currentDir(), good = prefs().getString(GOOD, "");
                File[] all = webRoot().listFiles();
                if (all != null) for (File f : all) {
                    String p = f.getAbsolutePath();
                    if (p.equals(done.getAbsolutePath()) || p.equals(cur) || p.equals(good)) continue;
                    deleteTree(f);
                }

                ret.put("updated", true);
                ret.put("version", version);
                ret.put("downloaded", downloaded);
                ret.put("copied", copied);
                call.resolve(ret);
            } catch (Exception e) {
                if (tmp != null) deleteTree(tmp);
                call.reject(e.getMessage() != null ? e.getMessage() : "Update failed");
            }
        }).start();
    }

    /** This version started fine: keep it. */
    @PluginMethod
    public void confirm(PluginCall call) {
        String cur = currentDir();
        SharedPreferences.Editor ed = prefs().edit();
        String pending = prefs().getString(PENDING, "");
        if (cur != null && cur.equals(pending)) ed.remove(PENDING).remove(TRIES);
        ed.putString(GOOD, cur == null ? "" : cur).apply();
        call.resolve();
    }

    /** Opens the downloaded version now. */
    @PluginMethod
    public void restart(PluginCall call) {
        String path = getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).getString(CAP_PATH, "");
        if (path == null || path.isEmpty() || !new File(path).exists()) { call.reject("Nothing new to open"); return; }
        call.resolve();
        getBridge().setServerBasePath(path);
    }

    /** { dir, version } of the copy in use (dir "" = built into the APK). */
    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        String cur = currentDir();
        ret.put("dir", cur == null ? "" : cur);
        try { ret.put("version", new JSONObject(new String(readAll(openCurrent("app-files.json")), StandardCharsets.UTF_8)).optString("version", "")); }
        catch (Exception e) { ret.put("version", ""); }
        call.resolve(ret);
    }

    /**
     * Called by MainActivity before the app loads. A version that hasn't been
     * confirmed after 2 starts is dropped: back to the last good copy.
     */
    static void checkLastStart(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String pending = p.getString(PENDING, "");
        if (pending == null || pending.isEmpty()) return;
        int tries = p.getInt(TRIES, 0) + 1;
        if (tries <= 2) { p.edit().putInt(TRIES, tries).apply(); return; }
        String good = p.getString(GOOD, "");
        String back = good != null && !good.isEmpty() && new File(good).exists() ? good : "";
        ctx.getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_PATH, back).apply();
        p.edit().remove(PENDING).remove(TRIES).apply();
    }
}
