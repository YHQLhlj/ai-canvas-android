package com.aicanvas.app;

import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class NativeImageStreamBridge {
    private final WebView webView;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, HttpURLConnection> activeConnections = new ConcurrentHashMap<>();

    public NativeImageStreamBridge(WebView webView) {
        this.webView = webView;
    }

    @JavascriptInterface
    public void stream(String requestJson) {
        executor.execute(() -> runStream(requestJson));
    }

    @JavascriptInterface
    public void cancel(String requestId) {
        HttpURLConnection connection = activeConnections.remove(requestId);
        if (connection != null) {
            connection.disconnect();
        }
    }

    private void runStream(String requestJson) {
        String requestId = "";
        HttpURLConnection connection = null;
        try {
            JSONObject request = new JSONObject(requestJson);
            requestId = request.optString("id", UUID.randomUUID().toString());
            String urlValue = request.getString("url");
            String method = request.optString("method", "POST");
            JSONObject headers = request.optJSONObject("headers");
            String bodyType = request.optString("bodyType", "json");

            connection = (HttpURLConnection) new URL(urlValue).openConnection();
            activeConnections.put(requestId, connection);
            connection.setRequestMethod(method);
            connection.setConnectTimeout(60 * 60 * 1000);
            connection.setReadTimeout(60 * 60 * 1000);
            connection.setDoInput(true);
            connection.setUseCaches(false);

            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    if ("content-length".equalsIgnoreCase(key)) {
                        continue;
                    }
                    connection.setRequestProperty(key, headers.optString(key));
                }
            }

            if ("multipart".equals(bodyType)) {
                writeMultipartBody(connection, request.getJSONArray("entries"));
            } else {
                writeJsonBody(connection, request.optString("body", "{}"));
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            if (status < 200 || status >= 300) {
                String errorText = readAll(stream);
                dispatchDone(requestId, errorText.isEmpty() ? "HTTP " + status : errorText);
                return;
            }

            readSseStream(requestId, stream);
            dispatchDone(requestId, null);
        } catch (Exception error) {
            dispatchDone(requestId, error.getMessage() != null ? error.getMessage() : "Native image stream failed.");
        } finally {
            if (requestId != null && !requestId.isEmpty()) {
                activeConnections.remove(requestId);
            }
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private void writeJsonBody(HttpURLConnection connection, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Accept", "text/event-stream, application/json");
        connection.setFixedLengthStreamingMode(bytes.length);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(bytes);
        }
    }

    private void writeMultipartBody(HttpURLConnection connection, JSONArray entries) throws IOException, JSONException {
        String boundary = "----GptImageCanvasBoundary" + UUID.randomUUID().toString().replace("-", "");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        connection.setRequestProperty("Accept", "text/event-stream, application/json");
        connection.setChunkedStreamingMode(256 * 1024);

        try (OutputStream output = connection.getOutputStream()) {
            for (int index = 0; index < entries.length(); index += 1) {
                JSONObject entry = entries.getJSONObject(index);
                String type = entry.optString("type", "string");
                String key = entry.getString("key");
                writeAscii(output, "--" + boundary + "\r\n");
                if ("base64File".equals(type)) {
                    String fileName = entry.optString("fileName", "reference.png");
                    String contentType = entry.optString("contentType", "image/png");
                    writeAscii(output, "Content-Disposition: form-data; name=\"" + escapeHeader(key) + "\"; filename=\"" + escapeHeader(fileName) + "\"\r\n");
                    writeAscii(output, "Content-Type: " + contentType + "\r\n\r\n");
                    byte[] fileBytes = Base64.decode(entry.optString("value", ""), Base64.DEFAULT);
                    output.write(fileBytes);
                    writeAscii(output, "\r\n");
                } else {
                    writeAscii(output, "Content-Disposition: form-data; name=\"" + escapeHeader(key) + "\"\r\n\r\n");
                    output.write(entry.optString("value", "").getBytes(StandardCharsets.UTF_8));
                    writeAscii(output, "\r\n");
                }
            }
            writeAscii(output, "--" + boundary + "--\r\n");
        }
    }

    private void readSseStream(String requestId, InputStream stream) throws IOException {
        if (stream == null) {
            return;
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder event = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isEmpty()) {
                    if (event.length() > 0) {
                        dispatchEvent(requestId, event.toString());
                        event.setLength(0);
                    }
                    continue;
                }
                event.append(line).append('\n');
            }
            if (event.length() > 0) {
                dispatchEvent(requestId, event.toString());
            }
        }
    }

    private String readAll(InputStream stream) throws IOException {
        if (stream == null) {
            return "";
        }
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private void dispatchEvent(String requestId, String rawEvent) {
        String script = "window.__gptImageCanvasNativeStreamEvent&&window.__gptImageCanvasNativeStreamEvent(" +
            JSONObject.quote(requestId) + "," + JSONObject.quote(rawEvent) + ")";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void dispatchDone(String requestId, String error) {
        if (requestId == null || requestId.isEmpty()) {
            return;
        }
        String errorValue = error == null ? "null" : JSONObject.quote(error);
        String script = "window.__gptImageCanvasNativeStreamDone&&window.__gptImageCanvasNativeStreamDone(" +
            JSONObject.quote(requestId) + "," + errorValue + ")";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void writeAscii(OutputStream output, String value) throws IOException {
        output.write(value.getBytes(StandardCharsets.UTF_8));
    }

    private String escapeHeader(String value) {
        return value.replace("\\", "_").replace("\"", "_").replace("\r", "_").replace("\n", "_");
    }
}
