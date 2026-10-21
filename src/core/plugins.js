console.log("/// PLUGIN MANAGER ONLINE ///");

// The plugin manager - knows what optional expansion packs (src/plugins/*/)
// exist and whether each is actually available to turn on yet. Loaded on
// every page right after db.js, same as every other core singleton
// (Toast, Waggle), so any page can check Plugins.isEnabled('calendar')
// without needing to be the Plugin Hub page itself.
//
// Split of responsibility (matches ROADMAP.md's "core stores state,
// features own meaning" rule): db.js's state.plugins is just a raw
// id -> boolean on/off flag, with zero opinion about what a plugin id
// means or whether it's real yet. PLUGIN_CATALOG below is that meaning -
// the actual list of plugins, their metadata, and whether there's
// anything behind them yet (`status`). Plugins.toggle() is the only
// place allowed to flip Vault's stored flag, specifically so a
// 'coming-soon' plugin (Fitness, Diet, Recovery - no folder yet) can
// never actually be switched on by mistake before it has a real page.

// status: 'available' once a plugin has a real page/feature behind it;
// 'coming-soon' means it's planned but
// there's genuinely nothing there yet - Plugin Hub shows these but
// doesn't let you toggle them.
const PLUGIN_CATALOG = [
    {
        id: 'calendar',
        icon: '📅',
        label: 'Calendar',
        status: 'available',
        description: 'A real calendar view of your quests, dailies, and deadlines - see the whole week at a glance instead of just a list. Month/Week/Day views, plus your own events.'
    },
    {
        id: 'dictionary',
        icon: '📖',
        label: 'Dictionary',
        status: 'available',
        description: 'Your own glossary of terms. Terms feed the Skill Mastery matrix on your Dashboard - matched against your Dailies\' tags and any completed Quest that mentions them.'
    },
    {
        id: 'study',
        icon: '🎓',
        label: 'Study',
        status: 'available',
        description: 'Track study sessions, courses, and learning goals alongside your quests - a dedicated space for the parts of leveling up that aren\'t code.',
        // RESERVED, not wired up yet. Original plan: a plugin's own extra
        // Personal Information fields, read by a dedicated Settings section
        // once the plugin is enabled. That whole mechanism (and the plain,
        // unencrypted state.personalInfo/personalInfoExtra it depended on)
        // was superseded before ever shipping - Personal Information is now
        // a single flat, ENCRYPTED page (src/features/account-info/,
        // db.js's getPersonalInfo/setPersonalInfo) with everything shown
        // together, per an explicit "put them all together for now" call.
        // Left here as a record of the intended direction - a future pass
        // can revive per-plugin field gating by actually reading this
        // array from account-info.js once that's worth building.
        personalInfoFields: [
            { key: 'dailyAvailability', label: 'Daily study availability', type: 'text', placeholder: 'e.g. Weekdays 7-9pm, weekends flexible' },
            { key: 'weeklyGoalHours', label: 'Weekly study goal (hours)', type: 'number', placeholder: 'e.g. 10' },
            { key: 'preferredTimes', label: 'Preferred study times', type: 'text', placeholder: 'e.g. Mornings, before work' }
        ]
    },
    {
        id: 'terminal',
        icon: '💻',
        label: 'Terminal',
        status: 'available',
        description: 'A support console, like the one in Fallout. If an update breaks your save, request help here - the team unlocks repair commands for you.'
    },
    {
        id: 'fitness',
        icon: '💪',
        label: 'Fitness & Health',
        status: 'coming-soon',
        description: 'Log workouts and general health metrics next to your quests - reps, sets, vitals, whatever you want tracked.',
        // RESERVED, not wired up yet - see the matching note on the Study
        // entry above. Height/weight/work/address-style fields now just
        // live directly on the flat account-info page for the time being.
        personalInfoFields: [
            { key: 'availability', label: 'Weekly availability for workouts', type: 'text', placeholder: 'e.g. Mon/Wed/Fri mornings' },
            { key: 'fastestMile', label: 'Fastest mile/run time', type: 'text', placeholder: 'e.g. 7:45' },
            { key: 'fitnessGoal', label: 'Primary fitness goal', type: 'text', placeholder: 'e.g. Build strength, lose weight, endurance' }
        ]
    },
    {
        id: 'diet',
        icon: '🥗',
        label: 'Diet',
        status: 'coming-soon',
        description: 'Track meals, macros, and nutrition goals - a real food log instead of a mental tally.'
    },
    {
        id: 'recovery',
        icon: '🛌',
        label: 'Recovery',
        status: 'coming-soon',
        description: 'Sleep, rest days, and recovery tracking - the counterbalance to Fitness so output isn\'t the only thing being measured.'
    }
];

// Core features (Craft, 2026-10-09): Habits, Dailies, To-Dos and Quests
// are the four dock tabs - part of the app itself, always on, and no
// longer listed in the Plugin Hub. (Habits and To-Dos started life as
// plugins, which is why their pages still live under src/plugins/.)
// Anything asking Plugins.isEnabled() about one of these gets true.
const CORE_FEATURES = ['habits', 'dailies', 'todos', 'quests'];

const Plugins = {
    isCore(id) {
        return CORE_FEATURES.includes(id);
    },

    // Full catalog, in display order - Plugin Hub renders directly from
    // this so a plugin only needs to be added here (plus its own status
    // flipped to 'available' once it has a real page) to show up.
    getCatalog() {
        return PLUGIN_CATALOG;
    },

    getEntry(pluginId) {
        return PLUGIN_CATALOG.find(p => p.id === pluginId) || null;
    },

    // A plugin only reads as "enabled" if it's BOTH available AND
    // switched on - a 'coming-soon' plugin can never report enabled even
    // if some stray state flag says true (e.g. an old save from before
    // this system existed), since there's no real page to hand off to.
    isEnabled(pluginId) {
        if (this.isCore(pluginId)) return true;
        const entry = this.getEntry(pluginId);
        if (!entry || entry.status !== 'available') return false;
        return typeof Vault !== 'undefined' && Vault.isPluginEnabled(pluginId);
    },

    // Flips a plugin's on/off state. Returns the new enabled state, or
    // null if the plugin doesn't exist or isn't available to toggle yet
    // (Plugin Hub disables the toggle control for 'coming-soon' entries,
    // but this guard is the real gate - the UI check is just a courtesy).
    toggle(pluginId) {
        if (this.isCore(pluginId)) return true;   // core: can't be switched off
        const entry = this.getEntry(pluginId);
        if (!entry || entry.status !== 'available') return null;
        if (typeof Vault === 'undefined') return null;

        const next = !Vault.isPluginEnabled(pluginId);
        return Vault.setPluginEnabled(pluginId, next);
    }
};
