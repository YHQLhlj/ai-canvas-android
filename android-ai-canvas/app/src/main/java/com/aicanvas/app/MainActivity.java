package com.aicanvas.app;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        Window window = getWindow();
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        window.setFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED, WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        requestHighestRefreshRate(window);
        super.onCreate(savedInstanceState);
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        optimizeWebViewForHighPerformanceDevice();
    }

    @Override
    public void onBackPressed() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            super.onBackPressed();
            return;
        }

        webView.evaluateJavascript(
            "(function(){try{return !!(window.__gptImageCanvasHandleNativeBack && window.__gptImageCanvasHandleNativeBack());}catch(e){return false;}})();",
            value -> {
                if (!"true".equals(value) && !isFinishing()) {
                    MainActivity.super.onBackPressed();
                }
            }
        );
    }

    private void optimizeWebViewForHighPerformanceDevice() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }

        requestHighestRefreshRate(getWindow());
        requestHighestFrameRate(webView);

        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setScrollbarFadingEnabled(true);

        webView.addJavascriptInterface(new NativeImageStreamBridge(webView), "GptImageCanvasNativeStream");
        webView.addJavascriptInterface(new NativeImageSaveBridge(this), "GptImageCanvasNativeSave");

        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setOffscreenPreRaster(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
    }

    private void requestHighestRefreshRate(Window window) {
        if (window == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        Display.Mode[] supportedModes = getWindowManager().getDefaultDisplay().getSupportedModes();
        float bestRefreshRate = 0f;
        int bestModeId = 0;
        for (Display.Mode mode : supportedModes) {
            if (mode.getRefreshRate() > bestRefreshRate) {
                bestRefreshRate = mode.getRefreshRate();
                bestModeId = mode.getModeId();
            }
        }

        WindowManager.LayoutParams layoutParams = window.getAttributes();
        if (bestRefreshRate > 0f) {
            layoutParams.preferredRefreshRate = bestRefreshRate;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && bestModeId > 0) {
            layoutParams.preferredDisplayModeId = bestModeId;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            layoutParams.setFrameRateBoostOnTouchEnabled(true);
            layoutParams.setFrameRatePowerSavingsBalanced(false);
        }
        window.setAttributes(layoutParams);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            window.getDecorView().setRequestedFrameRate(bestRefreshRate > 0f ? bestRefreshRate : View.REQUESTED_FRAME_RATE_CATEGORY_HIGH);
        }
    }

    private void requestHighestFrameRate(WebView webView) {
        if (webView == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return;
        }

        float bestRefreshRate = 0f;
        for (Display.Mode mode : getWindowManager().getDefaultDisplay().getSupportedModes()) {
            if (mode.getRefreshRate() > bestRefreshRate) {
                bestRefreshRate = mode.getRefreshRate();
            }
        }
        webView.setRequestedFrameRate(bestRefreshRate > 0f ? bestRefreshRate : View.REQUESTED_FRAME_RATE_CATEGORY_HIGH);
    }
}
