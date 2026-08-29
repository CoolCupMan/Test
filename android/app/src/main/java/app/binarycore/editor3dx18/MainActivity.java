package app.binarycore.editor3dx18;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Explicitly disable WebView remote debugging (chrome://inspect over
        // USB, or any other on-device inspection tooling), regardless of
        // build variant. Capacitor's own Bridge otherwise turns this on
        // automatically for debug-signed builds — which is what every build
        // from this project's CI pipeline is, since there's no release
        // keystore — and that would let anyone with brief physical/USB
        // access to the device fully inspect and manipulate this app's
        // WebView: its DOM, JS console, cookies, and local storage
        // (IndexedDB/localStorage, where documents and any linked AI
        // provider API key live). Turning it off here doesn't change any
        // user-facing behavior — it only closes off that inspection surface.
        WebView.setWebContentsDebuggingEnabled(false);
        super.onCreate(savedInstanceState);
    }
}
