package com.craftwho.bizzybee;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // BizzyBee's own native pieces (registered before the bridge starts).
        registerPlugin(BeeAlertsPlugin.class);
        registerPlugin(BeeUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
