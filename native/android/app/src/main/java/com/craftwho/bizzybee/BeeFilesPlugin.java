package com.craftwho.bizzybee;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Phone backups (Oct 27 2026). You pick ONE folder with Android's folder
 * picker; BizzyBee can then write save files there and nowhere else.
 * No storage permission is used.
 */
@CapacitorPlugin(name = "BeeFiles")
public class BeeFilesPlugin extends Plugin {
    private static final String PREFS = "bee_files";
    private static final String KEY = "tree";

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, 0); }
    private Uri tree() { String s = prefs().getString(KEY, null); return s == null ? null : Uri.parse(s); }

    private boolean stillAllowed(Uri t) {
        if (t == null) return false;
        for (android.content.UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(t) && p.isWritePermission()) return true;
        }
        return false;
    }

    private String folderName(Uri t) {
        try {
            String id = DocumentsContract.getTreeDocumentId(t);
            int i = id.lastIndexOf(':');
            String path = i >= 0 ? id.substring(i + 1) : id;
            return path.isEmpty() ? "Phone storage" : path;
        } catch (Exception e) { return "your folder"; }
    }

    @PluginMethod
    public void status(PluginCall call) {
        Uri t = tree();
        JSObject r = new JSObject();
        boolean ok = stillAllowed(t);
        r.put("picked", ok);
        if (ok) r.put("folder", folderName(t));
        call.resolve(r);
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject r = new JSObject(); r.put("picked", false); call.resolve(r); return;
        }
        Uri t = result.getData().getData();
        ContentResolver cr = getContext().getContentResolver();
        // Forget the old folder, keep the new one across restarts.
        Uri old = tree();
        if (old != null && !old.equals(t)) {
            try { cr.releasePersistableUriPermission(old, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception ignored) { }
        }
        cr.takePersistableUriPermission(t, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        prefs().edit().putString(KEY, t.toString()).apply();
        JSObject r = new JSObject(); r.put("picked", true); r.put("folder", folderName(t));
        call.resolve(r);
    }

    @PluginMethod
    public void forget(PluginCall call) {
        Uri t = tree();
        if (t != null) {
            try { getContext().getContentResolver().releasePersistableUriPermission(t, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception ignored) { }
        }
        prefs().edit().remove(KEY).apply();
        call.resolve();
    }

    /** { name, text, keep?: number, prefix?: string } -> writes the file, then keeps only the newest `keep` files with `prefix`. */
    @PluginMethod
    public void writeFile(PluginCall call) {
        Uri t = tree();
        if (!stillAllowed(t)) { call.reject("Pick a backup folder first"); return; }
        String name = call.getString("name");
        String text = call.getString("text", "");
        if (name == null) { call.reject("name is required"); return; }
        ContentResolver cr = getContext().getContentResolver();
        try {
            Uri dir = DocumentsContract.buildDocumentUriUsingTree(t, DocumentsContract.getTreeDocumentId(t));
            Uri file = DocumentsContract.createDocument(cr, dir, "application/json", name);
            if (file == null) throw new Exception("Couldn't create the file");
            try (OutputStream os = cr.openOutputStream(file, "wt")) {
                if (os == null) throw new Exception("Couldn't open the file");
                os.write(text.getBytes(StandardCharsets.UTF_8));
            }
            int keep = call.getInt("keep", 0);
            String prefix = call.getString("prefix", null);
            if (keep > 0 && prefix != null) prune(cr, t, prefix, keep);
            JSObject r = new JSObject(); r.put("ok", true); r.put("name", name); r.put("folder", folderName(t));
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Backup failed");
        }
    }

    private void prune(ContentResolver cr, Uri t, String prefix, int keep) {
        Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(t, DocumentsContract.getTreeDocumentId(t));
        List<String[]> found = new ArrayList<>();
        try (Cursor c = cr.query(kids, new String[]{ DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            while (c != null && c.moveToNext()) {
                String id = c.getString(0), n = c.getString(1);
                if (n != null && n.startsWith(prefix)) found.add(new String[]{ n, id });
            }
        } catch (Exception ignored) { return; }
        if (found.size() <= keep) return;
        Collections.sort(found, (a, b) -> a[0].compareTo(b[0]));   // names carry the date, oldest first
        for (int i = 0; i < found.size() - keep; i++) {
            try { DocumentsContract.deleteDocument(cr, DocumentsContract.buildDocumentUriUsingTree(t, found.get(i)[1])); } catch (Exception ignored) { }
        }
    }

    /**
     * Nov 20 2026 (Craft): { name, text, mime? } -> Android's Share / Save screen for a file BizzyBee made
     * (a save export, a save point). A browser download does nothing inside the app, so exports use this.
     * The file is written to the app's cache and shared through the FileProvider (cache-path in file_paths.xml).
     */
    @PluginMethod
    public void share(PluginCall call) {
        String name = call.getString("name");
        String text = call.getString("text", "");
        String mime = call.getString("mime", "application/json");
        if (name == null || name.isEmpty()) { call.reject("name is required"); return; }
        try {
            java.io.File dir = new java.io.File(getContext().getCacheDir(), "exports");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("Couldn't make the export folder");
            java.io.File[] old = dir.listFiles();
            if (old != null) for (java.io.File f : old) { if (System.currentTimeMillis() - f.lastModified() > 86400000L) f.delete(); }
            String safe = name.replaceAll("[^A-Za-z0-9._ -]", "_");
            java.io.File file = new java.io.File(dir, safe);
            try (java.io.FileOutputStream os = new java.io.FileOutputStream(file)) { os.write(text.getBytes(StandardCharsets.UTF_8)); }
            Uri uri = androidx.core.content.FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TITLE, safe);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Save or share " + safe);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            JSObject r = new JSObject(); r.put("ok", true); r.put("name", safe);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Share failed");
        }
    }

    /** Nov 20 2026 (Craft): { url } -> opens a website in the phone's browser (links to other sites). */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) { call.reject("Only web links"); return; }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No browser found");
        }
    }

    /**
     * Nov 21 2026 (Craft): { name, text } -> writes (or overwrites) a file in Documents/BizzyBee, a normal folder
     * you can see in the Files app. No folder picking and no permission (Android 10+ MediaStore, own files).
     */
    @PluginMethod
    public void saveDocument(PluginCall call) {
        String name = call.getString("name");
        String text = call.getString("text", "");
        if (name == null || !name.matches("[A-Za-z0-9._ -]{1,80}")) { call.reject("Bad file name"); return; }
        if (android.os.Build.VERSION.SDK_INT < 29) { call.reject("Needs Android 10 or newer"); return; }
        try {
            ContentResolver cr = getContext().getContentResolver();
            Uri col = android.provider.MediaStore.Files.getContentUri("external");
            String rel = android.os.Environment.DIRECTORY_DOCUMENTS + "/BizzyBee/";
            Uri uri = null;
            try (Cursor c = cr.query(col, new String[] { android.provider.MediaStore.MediaColumns._ID },
                    android.provider.MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + android.provider.MediaStore.MediaColumns.DISPLAY_NAME + "=?",
                    new String[] { rel, name }, null)) {
                if (c != null && c.moveToFirst()) uri = android.content.ContentUris.withAppendedId(col, c.getLong(0));
            }
            if (uri == null) {
                android.content.ContentValues v = new android.content.ContentValues();
                v.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/json");
                v.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, rel);
                uri = cr.insert(col, v);
            }
            if (uri == null) throw new Exception("Couldn't make the file");
            try (OutputStream os = cr.openOutputStream(uri, "wt")) {
                if (os == null) throw new Exception("Couldn't open the file");
                os.write(text.getBytes(StandardCharsets.UTF_8));
            }
            JSObject r = new JSObject(); r.put("ok", true); r.put("folder", "Documents/BizzyBee"); r.put("name", name);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Save failed");
        }
    }

    /** Nov 21 2026 (Craft): { prompt } -> { text } using Android's speech recognizer (the voice screen). */
    @PluginMethod
    public void listen(PluginCall call) {
        Intent i = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Tell BizzyBee"));
        i.putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try { startActivityForResult(call, i, "speechResult"); }
        catch (Exception e) { call.reject("No speech recognizer on this phone"); }
    }
    @ActivityCallback
    private void speechResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.reject("cancelled"); return; }
        ArrayList<String> said = result.getData().getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
        JSObject r = new JSObject(); r.put("text", said != null && !said.isEmpty() ? said.get(0) : "");
        call.resolve(r);
    }

    /**
     * Nov 21 2026 (Craft): app shortcuts. Long-press the BizzyBee icon for "Save BizzyBee" and "Voice";
     * { pin: true } also asks Android to put a "Save BizzyBee" button on the home screen.
     */
    @PluginMethod
    public void shortcuts(PluginCall call) {
        try {
            Context ctx = getContext();
            android.content.pm.ShortcutManager sm = ctx.getSystemService(android.content.pm.ShortcutManager.class);
            if (sm == null) { call.reject("No shortcuts on this phone"); return; }
            Intent save = new Intent(Intent.ACTION_VIEW, Uri.parse("bizzybee://save")).setClass(ctx, MainActivity.class);
            Intent voice = new Intent(Intent.ACTION_VIEW, Uri.parse("bizzybee://voice")).setClass(ctx, MainActivity.class);
            android.content.pm.ShortcutInfo s1 = new android.content.pm.ShortcutInfo.Builder(ctx, "bb-save").setShortLabel("Save BizzyBee").setLongLabel("Save BizzyBee now")
                    .setIcon(android.graphics.drawable.Icon.createWithResource(ctx, R.mipmap.ic_launcher)).setIntent(save).build();
            android.content.pm.ShortcutInfo s2 = new android.content.pm.ShortcutInfo.Builder(ctx, "bb-voice").setShortLabel("Voice").setLongLabel("Tell BizzyBee")
                    .setIcon(android.graphics.drawable.Icon.createWithResource(ctx, R.mipmap.ic_launcher)).setIntent(voice).build();
            List<android.content.pm.ShortcutInfo> list = new ArrayList<>(); list.add(s1); list.add(s2);
            sm.setDynamicShortcuts(list);
            boolean pinned = false;
            if (call.getBoolean("pin", false) && sm.isRequestPinShortcutSupported()) pinned = sm.requestPinShortcut(s1, null);
            JSObject r = new JSObject(); r.put("ok", true); r.put("pinAsked", pinned);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Shortcut failed");
        }
    }

    /** Nov 21 2026 (Craft): { on, title?, body? } -> start / update / stop the keep-running hive service. */
    @PluginMethod
    public void hiveService(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent i = new Intent(ctx, HiveService.class);
            if (!call.getBoolean("on", true)) { ctx.stopService(i); call.resolve(); return; }
            if (call.getString("title") != null) i.putExtra("title", call.getString("title"));
            if (call.getString("body") != null) i.putExtra("body", call.getString("body"));
            if (android.os.Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Could not start the hive service");
        }
    }

    /** Opens Android's App info page for BizzyBee (Permissions live there). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** Lists backup files: { files: [name...] } (newest first). */
    @PluginMethod
    public void list(PluginCall call) {
        Uri t = tree();
        JSArray out = new JSArray();
        if (stillAllowed(t)) {
            String prefix = call.getString("prefix", "");
            Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(t, DocumentsContract.getTreeDocumentId(t));
            List<String> names = new ArrayList<>();
            try (Cursor c = getContext().getContentResolver().query(kids, new String[]{ DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
                while (c != null && c.moveToNext()) { String n = c.getString(0); if (n != null && n.startsWith(prefix)) names.add(n); }
            } catch (Exception ignored) { }
            Collections.sort(names, Collections.reverseOrder());
            for (String n : names) out.put(n);
        }
        JSObject r = new JSObject(); r.put("files", out);
        call.resolve(r);
    }
}
