package com.craftwho.bizzybee;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // BizzyBee's own native pieces (registered before the bridge starts).
        registerPlugin(BeeAlertsPlugin.class);
        registerPlugin(BeeUpdaterPlugin.class);
        registerPlugin(BeeFilesPlugin.class);
        // Nov 1 2026 (Craft): the app's own copy + its updates (BeeWebPlugin).
        // A downloaded version that failed to start twice is dropped here.
        registerPlugin(BeeWebPlugin.class);
        BeeWebPlugin.checkLastStart(this);
        super.onCreate(savedInstanceState);
    }
}
