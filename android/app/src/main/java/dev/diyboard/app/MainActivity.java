package dev.diyboard.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Fullscreen kiosk that shows the dashboard served by the laptop.
 *
 * The laptop runs `adb reverse tcp:7777 tcp:7777`, so the tablet's own localhost:7777 reaches
 * the laptop over the USB cable. While the laptop is unreachable we show a bundled offline page
 * and probe /health every 2 seconds; as soon as it answers we load the live dashboard.
 */
public class MainActivity extends Activity {
    private static final String SERVER = "http://127.0.0.1:7777/";
    private static final String OFFLINE = "file:///android_asset/offline.html";
    private static final long PROBE_MS = 2000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView web;
    private boolean onDashboard = false;
    private boolean resumed = false;

    private final Runnable probe = new Runnable() {
        @Override
        public void run() {
            if (onDashboard || !resumed) return;
            io.execute(() -> {
                boolean up = serverIsUp();
                main.post(() -> {
                    if (onDashboard || !resumed) return;
                    if (up) showDashboard();
                    else main.postDelayed(probe, PROBE_MS);
                });
            });
        }
    };

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        web = new WebView(this);
        web.setBackgroundColor(0xFF07080C);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setAllowFileAccess(true); // only for the bundled offline page

        web.addJavascriptInterface(new Bridge(), "DiyBoardNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame() && onDashboard) showOffline();
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse res) {
                if (req.isForMainFrame() && onDashboard && res.getStatusCode() >= 500) showOffline();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return true; // kiosk: never navigate away (e.g. tapping a PR link)
            }
        });

        setContentView(web);
        showOffline();
    }

    private void showOffline() {
        onDashboard = false;
        web.loadUrl(OFFLINE);
        main.removeCallbacks(probe);
        main.postDelayed(probe, 500);
    }

    private void showDashboard() {
        onDashboard = true;
        main.removeCallbacks(probe);
        web.loadUrl(SERVER);
    }

    private static boolean serverIsUp() {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(SERVER + "health").openConnection();
            c.setConnectTimeout(1500);
            c.setReadTimeout(1500);
            c.setUseCaches(false);
            return c.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        web.onResume();
        hideSystemUi();
        if (!onDashboard) main.post(probe);
    }

    @Override
    protected void onPause() {
        resumed = false;
        main.removeCallbacks(probe);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Re-launched by the laptop (`am start`) after a reconnect: retry right away.
        if (!onDashboard) {
            main.removeCallbacks(probe);
            main.post(probe);
        }
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        io.shutdownNow();
        web.destroy();
        super.onDestroy();
    }

    /** Exposed to the page as window.DiyBoardNative. */
    private class Bridge {
        @JavascriptInterface
        public String getBattery() {
            Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b == null) return "null";
            int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            int status = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING
                    || status == BatteryManager.BATTERY_STATUS_FULL;
            int pct = scale > 0 ? Math.round(level * 100f / scale) : level;
            return "{\"level\":" + pct + ",\"charging\":" + charging + "}";
        }

        @JavascriptInterface
        public void serverLost() {
            main.post(() -> {
                if (onDashboard) showOffline();
            });
        }

        @JavascriptInterface
        public void setBrightness(float value) {
            main.post(() -> {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.screenBrightness = value < 0
                        ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                        : Math.max(0.01f, Math.min(1f, value));
                getWindow().setAttributes(lp);
            });
        }
    }
}
