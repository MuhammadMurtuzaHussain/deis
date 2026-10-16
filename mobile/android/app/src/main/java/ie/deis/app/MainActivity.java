package ie.deis.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

// Deis for Android loads the hosted app (capacitor.config.json server.url). The web app
// reaches the native side through Capacitor.Plugins: Filesystem and Share to save Word files,
// DeisPrint to save a CV as PDF (src/lib/client/native.ts).
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeisPrintPlugin.class);
        super.onCreate(savedInstanceState);
        // Hash routes are history entries, so the back button walks back through the app first.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() == null ? null : getBridge().getWebView();
                if (web != null && web.canGoBack()) web.goBack();
                else moveTaskToBack(true);
            }
        });
    }
}
