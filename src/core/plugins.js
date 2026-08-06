console.log("/// PLUGIN MANAGER ONLINE ///");

// The plugin manager - knows what optional expansion packs (src/plugins/*/)
// exist and whether each is actually available to turn on yet. Loaded on
// every page right after db.js, same as every other core singleton
// (Toast, HiveMind), so any page can check Plugins.isEnabled('habits')
// without needing to be the Plugin Hub page itself.
//
// Split of responsibility (matches ROADMAP.md's "core stores state,
// features own meaning" rule): db.js's state.plugins is just a raw
// id -> boolean on/off flag, with zero opinion about what a plugin id
// means or whether it's real yet. PLUGIN_CATALOG below is that meaning -
// the actual list of plugins, their metadata, and whether there's
// anything behind them yet (`status`). Plugins.toggle() is the only
// place allowed to flip Vault's stored flag, specifically so a
// 'coming-soon' plugin (see src/plugins/calendar, src/plugins/habits -
// both still empty stub files) can never actually be switched on by
// mistake before it has a real page behind it.

// status: 'available' once a plugin has a real page/feature behind it;
// 'coming-soon' means the folder is scaffolded (see src/plugins/*/) but
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
        id: 'habits',
        icon: '✅',
        label: 'Habits',
        status: 'coming-soon',
        description: 'Recurring habit tracking alongside quests/dailies - streaks and consistency, not one-off tasks.'
    },
    {
        id: 'study',
        icon: '🎓',
        label: 'Study',
        status: 'available',
        description: 'Track study sessions, courses, and learning goals alongside your quests - a dedicated space for the parts of leveling up that aren\'t code.'
    },
    {
        id: 'fitness',
        icon: '💪',
        label: 'Fitness & Health',
        status: 'coming-soon',
        description: 'Log workouts and general health metrics next to your quests - reps, sets, vitals, whatever you want tracked.'
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

const Plugins = {
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
        const entry = this.getEntry(pluginId);
        if (!entry || entry.status !== 'available') return false;
        return typeof Vault !== 'undefined' && Vault.isPluginEnabled(pluginId);
    },

    // Flips a plugin's on/off state. Returns the new enabled state, or
    // null if the plugin doesn't exist or isn't available to toggle yet
    // (Plugin Hub disables the toggle control for 'coming-soon' entries,
    // but this guard is the real gate - the UI check is just a courtesy).
    toggle(pluginId) {
        const entry = this.getEntry(pluginId);
        if (!entry || entry.status !== 'available') return null;
        if (typeof Vault === 'undefined') return null;

        const next = !Vault.isPluginEnabled(pluginId);
        return Vault.setPluginEnabled(pluginId, next);
    }
};
