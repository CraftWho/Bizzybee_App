package com.craftwho.bizzybee;

import android.app.Activity;
import android.content.ContentResolver;
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
