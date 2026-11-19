package com.sanmilagro.eldiospresidente;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * Thin Android TV shell: a fullscreen, hardware-accelerated WebView that loads the game
 * from APK assets. Gamepad input is read natively by {@link GamepadBridge} and exposed to
 * the game as {@code window.AndroidPad}, because the WebView's own Gamepad API does not
 * reliably receive controller events on Android TV.
 */
public class MainActivity extends Activity {
    private static final String START_URL = "https://appassets.androidplatform.net/assets/index.html";
    private WebView webView;
    private GamepadBridge gamepad;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // ES modules need an http(s) origin; this serves /assets/* straight from the APK.
        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        gamepad = new GamepadBridge(this);

        webView = new GameWebView(this, gamepad);
        webView.setBackgroundColor(0xFF0B1020);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        webView.addJavascriptInterface(gamepad, "AndroidPad");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
        });
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        setContentView(webView);
        webView.requestFocus();
        webView.loadUrl(START_URL);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) gamepad.clearHeld();
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    /**
     * Every key event from a gamepad is consumed here and recorded for the game. That also
     * stops Android from turning Circle into BACK (which would quit) or the D-pad into focus
     * navigation. The TV remote's keys are not from a gamepad and pass through as normal.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (gamepad.onKey(event)) return true;
        return super.dispatchKeyEvent(event);
    }

    /** Sticks, analog triggers and the D-pad hat. */
    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (gamepad.onMotion(event)) return true;
        return super.dispatchGenericMotionEvent(event);
    }

    /**
     * Second line of defence: if a TV build routes controller events straight to the focused
     * view instead of through the Activity, they are caught here. Events the Activity already
     * consumed never reach the view, so nothing is counted twice.
     */
    static class GameWebView extends WebView {
        private final GamepadBridge pad;

        GameWebView(Context context, GamepadBridge pad) {
            super(context);
            this.pad = pad;
        }

        @Override
        public boolean dispatchKeyEvent(KeyEvent event) {
            return pad.onKey(event) || super.dispatchKeyEvent(event);
        }

        @Override
        public boolean dispatchGenericMotionEvent(MotionEvent event) {
            return pad.onMotion(event) || super.dispatchGenericMotionEvent(event);
        }
    }

    @Override protected void onPause() { super.onPause(); gamepad.clearHeld(); webView.onPause(); }
    @Override protected void onResume() { super.onResume(); webView.onResume(); }
    @Override protected void onDestroy() { gamepad.release(); webView.destroy(); super.onDestroy(); }
}
