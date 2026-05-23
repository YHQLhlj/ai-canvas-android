package com.aicanvas.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class NativeImageSaveBridge {
    private final Context context;

    public NativeImageSaveBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public String savePng(String requestJson) {
        try {
            JSONObject request = new JSONObject(requestJson);
            String base64 = request.optString("base64", "");
            String fileName = sanitizeFileName(request.optString("fileName", "ai-canvas-screenshot.png"));
            if (!fileName.toLowerCase().endsWith(".png")) {
                fileName = fileName + ".png";
            }
            byte[] bytes = Base64.decode(base64.getBytes(StandardCharsets.UTF_8), Base64.DEFAULT);
            String uri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? saveWithMediaStore(fileName, bytes)
                : saveLegacy(fileName, bytes);
            return new JSONObject()
                .put("ok", true)
                .put("path", "Pictures/AI画布/" + fileName)
                .put("uri", uri)
                .toString();
        } catch (Exception error) {
            try {
                return new JSONObject()
                    .put("ok", false)
                    .put("error", error.getMessage() != null ? error.getMessage() : "Save failed")
                    .toString();
            } catch (Exception ignored) {
                return "{\"ok\":false,\"error\":\"Save failed\"}";
            }
        }
    }

    private String saveWithMediaStore(String fileName, byte[] bytes) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/AI画布");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IllegalStateException("Unable to create image file");
        }
        try (OutputStream output = resolver.openOutputStream(uri)) {
            if (output == null) {
                throw new IllegalStateException("Unable to open image file");
            }
            output.write(bytes);
        }
        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return uri.toString();
    }

    private String saveLegacy(String fileName, byte[] bytes) throws Exception {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "AI画布");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("Unable to create Pictures/AI画布");
        }
        File file = new File(dir, fileName);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
        }
        return Uri.fromFile(file).toString();
    }

    private String sanitizeFileName(String value) {
        String fileName = value == null ? "" : value.trim();
        if (fileName.isEmpty()) {
            fileName = "ai-canvas-screenshot.png";
        }
        return fileName
            .replace("\\", "_")
            .replace("/", "_")
            .replace(":", "_")
            .replace("*", "_")
            .replace("?", "_")
            .replace("\"", "_")
            .replace("<", "_")
            .replace(">", "_")
            .replace("|", "_");
    }
}
