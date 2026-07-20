package com.ku9.player;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 启用硬件加速
        getWindow().setFlags(
            android.view.WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            android.view.WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );

        // 保持屏幕常亮
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // 沉浸式全屏
        View decorView = getWindow().getDecorView();
        int uiOptions = View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        decorView.setSystemUiVisibility(uiOptions);

        // 配置WebView
        WebSettings webSettings = bridge.getWebView().getSettings();
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // 遥控器/键盘支持
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
                bridge.eval("window.KU9Player && window.KU9Player.prev()", null);
                return true;
            case KeyEvent.KEYCODE_DPAD_DOWN:
                bridge.eval("window.KU9Player && window.KU9Player.next()", null);
                return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                bridge.eval("window.KU9Player && window.KU9Player.pause()", null);
                return true;
            case KeyEvent.KEYCODE_BACK:
                bridge.eval("window.KU9Player && window.KU9Player.current()", value -> {
                    if (value != null) {
                        // 如果正在播放，先尝试退出全屏
                        runOnUiThread(() -> {
                            View decorView = getWindow().getDecorView();
                            if ((decorView.getSystemUiVisibility() & View.SYSTEM_UI_FLAG_FULLSCREEN) != 0) {
                                decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
                            } else {
                                moveTaskToBack(true);
                            }
                        });
                    }
                });
                return true;
            case KeyEvent.KEYCODE_MENU:
                bridge.eval("window.KU9Player && document.getElementById('settingsOverlay').classList.toggle('active')", null);
                return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            View decorView = getWindow().getDecorView();
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
        }
    }
}
