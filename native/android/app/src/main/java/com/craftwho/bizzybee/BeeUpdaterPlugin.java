package com.craftwho.bizzybee;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;

/**
 * In-app updates (Oct 27 2026). Downloads a new BizzyBee APK and hands it
 * to Android's installer. The web side finds the release (GitHub) and passes
 * the download URL plus any headers (a private repo needs a token).
 */
@CapacitorPlugin(name = "BeeUpdater")
public class BeeUpdaterPlugin extends Plugin {

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "BizzyBee-update.apk");
    }

    /** { url, headers: {name: value} } -> { path, bytes }. Sends "progress" events. */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null) { call.reject("url is required"); return; }
        JSObject headers = call.getObject("headers", new JSObject());
        new Thread(() -> {
            HttpURLConnection con = null;
            try {
                String next = url;
                boolean first = true;
                // Follow redirects by hand: GitHub sends us to a signed file
                // link, and that link must NOT get the GitHub token.
                for (int hop = 0; hop < 6; hop++) {
                    con = (HttpURLConnection) new URL(next).openConnection();
                    con.setInstanceFollowRedirects(false);
                    con.setConnectTimeout(20000);
                    con.setReadTimeout(30000);
                    if (first) {
                        Iterator<String> keys = headers.keys();
                        while (keys.hasNext()) { String k = keys.next(); con.setRequestProperty(k, headers.getString(k)); }
                    }
                    int code = con.getResponseCode();
                    if (code >= 300 && code < 400) {
                        next = con.getHeaderField("Location");
                        con.disconnect();
                        first = false;
                        if (next == null) throw new Exception("Redirect without a location");
                        continue;
                    }
                    if (code != 200) throw new Exception("Download failed (" + code + ")");
                    break;
                }
                long total = con.getContentLengthLong();
                File out = apkFile();
                try (InputStream in = con.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0; int n; int lastPct = -1;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject p = new JSObject();
                            p.put("pct", pct); p.put("done", done); p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                }
                JSObject ret = new JSObject();
                ret.put("path", out.getAbsolutePath());
                ret.put("bytes", out.length());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Download failed");
            } finally {
                if (con != null) con.disconnect();
            }
        }).start();
    }

    /** Can this app open the installer? (Android asks once per app.) */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(ret);
    }

    /** Opens "Install unknown apps" for BizzyBee. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /** Hands the downloaded APK to Android's installer. */
    @PluginMethod
    public void install(PluginCall call) {
        File f = apkFile();
        if (!f.exists()) { call.reject("Nothing downloaded yet"); return; }
        Context ctx = getContext();
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        call.resolve();
    }
}
