console.log("/// VAULT (DB) INITIALIZED ///");

// Bump this whenever data.json/data.personal.json's shape changes (new
// fields, renamed fields, etc.). A cached Vault from an older version gets
// discarded and re-fetched automatically - no manual localStorage clearing.
// v7: added the "profile" block (projects/serviceRecord) - this used to be
// hardcoded directly in profile.html, which meant the real (personal)
// content shipped in the tracked base template. Now it's blueprint content
// like everything else, so data.json/data.personal.json stay properly split.
const VAULT_SCHEMA_VERSION = 7;

// Pure, stateless: total DP is always the live sum of every completed
// task's current dp value, across every quest - never a stored running
// total. This means editing a task's dp (even after it's been completed),
// adding a new quest, or a future conditionally-generated quest all just
// work automatically, with no ledger to drift out of sync.
function computeTotalDP(quests) {
    return (quests || []).reduce((sum, quest) => {
        const questDP = (quest.tasks || [])
            .filter(t => t.completed)
            .reduce((s, t) => s + t.dp, 0);
        return sum + questDP;
    }, 0);
}

// Same "live, not a ledger" philosophy as computeTotalDP: a daily task's DP
// contribution is however many days it's been checked off (completedDates
// stores a list of "YYYY-MM-DD" strings) times its CURRENT dp value - so
// editing a daily task's dp retroactively reflects across all its past
// completions too, same as editing a quest task's dp does.
function computeDailyDP(dailyTasks) {
    return (dailyTasks || []).reduce((sum, task) => {
        return sum + (task.completedDates || []).length * task.dp;
    }, 0);
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

// Colony bee rarities - lives here (not colony.js) because bees are now
// awarded on level-up too (see toggleTask/toggleDailyTask below), which
// happens from Home/Quests/Dailies, not just the Colony page itself.
// colony.js's rendering re-uses this exact same table so a bee's color is
// identical everywhere it's shown, no matter how it was earned.
// weight: 0 on Named is deliberate - rollBeeRarity() below can never
// select it (see the loop: `if (roll < entry.weight) return entry` is
// never true for a 0-weight entry). The ONLY way to get a Named Beast is
// unwrapTicket() below, which builds one directly and skips this table's
// weighting entirely.
const BEE_RARITIES = [
    { rarity: 'Common', weight: 60, color: '#aaaaaa' },
    { rarity: 'Rare', weight: 25, color: '#4aa3ff' },
    { rarity: 'Epic', weight: 12, color: '#b06bff' },
    { rarity: 'Legendary', weight: 3, color: 'var(--gold-start)' },
    { rarity: 'Named', weight: 0, color: '#ff2d78' }
];

// Named Beast bees get a "<Noun> The <Title>" name instead of the usual
// "Rarity Bee #N" - e.g. "Stinger The Champ", "Gem The Collector". Just a
// starting point - renameBee() below lets you overwrite it with anything.
const NAMED_BEE_NOUNS = ['Stinger', 'Gem', 'Blaze', 'Nova', 'Comet', 'Ember', 'Onyx', 'Sable', 'Flicker', 'Talon'];
const NAMED_BEE_TITLES = ['The Champ', 'The Collector', 'The Guardian', 'The Swift', 'The Bold', 'The Wanderer', 'The Relentless', 'The Keeper', 'The Bright', 'The Unyielding'];

function rollNamedBeeName() {
    const noun = NAMED_BEE_NOUNS[Math.floor(Math.random() * NAMED_BEE_NOUNS.length)];
    const title = NAMED_BEE_TITLES[Math.floor(Math.random() * NAMED_BEE_TITLES.length)];
    return `${noun} ${title}`;
}

// Bee classes ("work" you can assign a bee to once you own it - see
// assignBeeClass below). Grouped into three categories (see `category`
// below, used to build <optgroup>s in bee-card.js) matching how Leo
// framed the roster: Gathering, Defense, and Hive Management. Collector
// is still the only one with a real mechanical payoff (a material drop
// whenever you complete a real task/daily - see
// _collectMaterialsOnCompletion below); the rest are flavor + their own
// distinct swarm animation for now (colony.js reads bee.class to pick
// which - see colony.css's colony-patrol/colony-forage/colony-fortify/
// colony-build/colony-tend keyframes), same intentional "groundwork
// before mechanics" spirit as the numeric stats note used to be here.
const BEE_CLASSES = {
    collector: { label: 'Collector', icon: '🌾', category: 'Gathering', description: 'Gathers materials whenever you complete a task or daily.' },
    guardian: { label: 'Guardian', icon: '🛡️', category: 'Defense', description: 'Patrols the hive, scanning for intruders. No material yield yet.' },
    barrier: { label: 'Barrier', icon: '🧱', category: 'Defense', description: 'Holds a fixed post at the entrance instead of patrolling. No material yield yet.' },
    architect: { label: 'Architect', icon: '🏗️', category: 'Hive Management', description: 'Raises new honeycomb cells for the hive. No material yield yet.' },
    nurse: { label: 'Nurse', icon: '🥚', category: 'Hive Management', description: "Tends the brood chamber and the colony's eggs. No material yield yet." }
};

// What a Collector bee can bring back. Flat, deliberately small catalog -
// the Inventory page (src/features/inventory/) lists every entry here
// regardless of whether you've obtained any yet, so it reads as a full
// "collection dex," not just a list of what you happen to own.
const MATERIAL_CATALOG = [
    { id: 'pollen', label: 'Pollen', icon: '🌼', description: 'Common material - nearly every Collector run has a shot at this.' },
    { id: 'honey-drop', label: 'Honey Drop', icon: '🍯', description: 'Uncommon material - a solidified drop of pure hive honey.' },
    { id: 'royal-nectar', label: 'Royal Nectar', icon: '✨', description: 'Rare, high-grade material - needed for higher-tier cosmetic unlocks.' }
];

const MATERIAL_DROP_TABLE = [
    { id: 'pollen', weight: 70 },
    { id: 'honey-drop', weight: 25 },
    { id: 'royal-nectar', weight: 5 }
];

function rollMaterialDrop() {
    const totalWeight = MATERIAL_DROP_TABLE.reduce((sum, m) => sum + m.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of MATERIAL_DROP_TABLE) {
        if (roll < entry.weight) return entry.id;
        roll -= entry.weight;
    }
    return MATERIAL_DROP_TABLE[0].id;
}

// Per-Collector-bee chance of a drop each time you complete a task/daily -
// not guaranteed every time, so owning several Collectors doesn't flood
// you with material toasts on every single checkbox.
const COLLECTOR_DROP_CHANCE = 0.35;

// A quest's total DP (sum of every task's dp) has to clear this to count
// as "accomplishes a great deal" and earn a gacha ticket on completion -
// matches the upper end of llm-engine.js's own "Hard task" DP anchors
// (90-180), so this is roughly "a whole quest's worth of hard work," not
// any quest at all.
const QUEST_TICKET_DP_THRESHOLD = 150;

// Escalating level-up bee reward: the first level-up (reaching level 2)
// awards 1 bee, and each level after that awards 0.5 more than the last
// (1, 1.5, 2, 2.5, 3, 3.5...) - rounded to a whole bee since you can't
// award half of one. Higher levels reward more bees per level-up, not just
// a flat 1 each time.
function beesForLevel(level) {
    return Math.max(1, Math.round(1 + (level - 2) * 0.5));
}

function rollBeeRarity() {
    const totalWeight = BEE_RARITIES.reduce((sum, r) => sum + r.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of BEE_RARITIES) {
        if (roll < entry.weight) return entry;
        roll -= entry.weight;
    }
    return BEE_RARITIES[0];
}

// Combat-style stats, rolled ONCE per bee at creation and stored on the
// bee itself (bee.stats) - same "this is a real individual creature" logic
// as its name/color, not something recomputed on every render. Each
// rarity rolls from its own (overlapping, but higher-floor/higher-ceiling)
// range, so a Legendary is reliably stronger than a Common but two bees of
// the same rarity still aren't identical twins. This is the "we can work
// on each individual stat wise" follow-up referenced in BEE_CLASSES above -
// surfaced on the flip side of the bee's trading card (see bee-card.js).
const BEE_STAT_RANGES = {
    Common: { hp: [20, 40], offense: [5, 12], defense: [5, 12], speed: [5, 12], power: [5, 12] },
    Rare: { hp: [35, 55], offense: [10, 18], defense: [10, 18], speed: [10, 18], power: [10, 18] },
    Epic: { hp: [50, 75], offense: [16, 26], defense: [16, 26], speed: [16, 26], power: [16, 26] },
    Legendary: { hp: [70, 100], offense: [24, 36], defense: [24, 36], speed: [24, 36], power: [24, 36] },
    Named: { hp: [90, 130], offense: [32, 48], defense: [32, 48], speed: [32, 48], power: [32, 48] }
};

function rollStatValue([min, max]) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function rollBeeStats(rarity) {
    const ranges = BEE_STAT_RANGES[rarity] || BEE_STAT_RANGES.Common;
    return {
        level: 1,
        hp: rollStatValue(ranges.hp),
        offense: rollStatValue(ranges.offense),
        defense: rollStatValue(ranges.defense),
        speed: rollStatValue(ranges.speed),
        power: rollStatValue(ranges.power)
    };
}

// Flavor stat for the BeeDex strip on the card front (bee-card.js) - the
// "WT: 13.2 lbs." line on a real Pokemon card. Grams, rarity-scaled like
// everything else here so a Named Beast reads as a heavier, denser
// presence than a Common worker, purely for flavor (nothing reads this
// value mechanically).
const BEE_WEIGHT_RANGES = {
    Common: [0.6, 1.4],
    Rare: [1.0, 2.0],
    Epic: [1.6, 2.8],
    Legendary: [2.2, 3.8],
    Named: [3.0, 5.0]
};

function rollBeeWeight(rarity) {
    const [min, max] = BEE_WEIGHT_RANGES[rarity] || BEE_WEIGHT_RANGES.Common;
    return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

// Elemental affinity - v1, deliberately just the four "easy" starter
// elements Leo named. Rolled uniformly (no rarity weighting, unlike
// stats/weight) and rendered as a hexagon badge on the card's art frame
// (see bee-card.js/css). Doesn't affect any mechanic yet - same
// "groundwork now, hook things into it later" spirit as BEE_CLASSES.
const BEE_ELEMENTS = {
    wind: { label: 'Wind', emoji: '🌪️' },
    earth: { label: 'Earth', emoji: '🌍' },
    water: { label: 'Water', emoji: '💧' },
    fire: { label: 'Fire', emoji: '🔥' }
};
const BEE_ELEMENT_KEYS = Object.keys(BEE_ELEMENTS);

function rollBeeElement() {
    return BEE_ELEMENT_KEYS[Math.floor(Math.random() * BEE_ELEMENT_KEYS.length)];
}

// A simple 4-way cycle (each element is weak to exactly one other) - shown
// on the card front as a weakness badge (see bee-card.js). Doesn't affect
// any mechanic yet, same "groundwork now" spirit as BEE_ELEMENTS itself.
const BEE_ELEMENT_WEAKNESS = {
    fire: 'water',
    water: 'earth',
    earth: 'wind',
    wind: 'fire'
};

// Date.now() alone isn't collision-safe for bee ids - _syncLevelUpBees can
// award several bees in one tight synchronous loop (catching a save file
// up several levels at once), which can land multiple awardBee() calls in
// the same millisecond and produce duplicate ids. Every bee-lookup
// feature (rename, class-assign, destroy, combine) depends on ids being
// unique, so this appends a short random suffix on top of the timestamp.
function generateBeeId() {
    return `bee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- REFINE: destroy-for-loot / combine-for-a-chance-at-better ---------
// The normal rarity ladder combine can climb - deliberately excludes
// Named. That tier stays ticket-exclusive (see unwrapTicket below); a
// Named bee fed into combine is treated as already topped-out (see
// combineBees' baseIndex below) rather than being a shortcut to another one.
const RARITY_ORDER = ['Common', 'Rare', 'Epic', 'Legendary'];

// How many material rolls destroying a bee grants, scaled by rarity -
// same MATERIAL_DROP_TABLE a live Collector bee rolls from (see
// rollMaterialDrop above), just guaranteed instead of a per-task chance.
const DESTROY_LOOT_COUNT = { Common: 1, Rare: 1, Epic: 2, Legendary: 2, Named: 3 };

// Combining always consumes both bees and always produces a new one -
// this is the odds that the result climbs one rarity tier above the
// higher of the two inputs, rather than landing on that same tier.
const COMBINE_UPGRADE_CHANCE = 0.5;

// Pure, stateless: derives level/currentXP/nextLevelXP from a total DP
// figure. Recomputed fresh every call instead of stored, for the same
// reason as computeTotalDP above.
//
// REBALANCED TWICE. v1 (original): starts at 1000, x1.5 compounding - by
// level 20 that demands over 2 million DP for a single level, which is why
// leveling felt endless. v2: flat +75/level - fixed the explosion, but a
// flat step isn't actually "progressive," it's linear - level 19->20 costs
// the same marginal amount as level 2->3, which made later levels feel too
// cheap (barely more than a task or two). This version: still starts at
// 150, but now GROWS by a gentle 15% each level instead of a fixed amount -
// early levels stay quick, but the threshold genuinely climbs faster the
// higher you go, without spiraling anywhere near the old x1.5 curve. Tune
// GROWTH_RATE (currently 1.15) if the pace still feels off with more real
// usage to judge it against.
function computeLevelProgress(totalDP) {
    const BASE_THRESHOLD = 150;
    const GROWTH_RATE = 1.15;

    let level = 1;
    let threshold = BASE_THRESHOLD;
    let remaining = totalDP;

    while (remaining >= threshold) {
        remaining -= threshold;
        level += 1;
        threshold = Math.round(threshold * GROWTH_RATE);
    }

    return { level, currentXP: remaining, nextLevelXP: threshold };
}

class DatabaseManager {
    constructor() {
        this.dbName = 'BizzybeeVault';
        this.storageKey = 'bizzybee_user_data';
        this.state = null;
    }

    // 1. Boot up the database
    async init() {
        const existingData = localStorage.getItem(this.storageKey);
        const parsed = existingData ? JSON.parse(existingData) : null;

        if (parsed && parsed.schemaVersion === VAULT_SCHEMA_VERSION) {
            console.log("Vault: Local data found. Loading state...");
            this.state = parsed;
        } else {
            if (parsed) console.log("Vault: Cached data is from an older schema. Refreshing from blueprint...");
            else console.log("Vault: No local data found. Fetching Blueprint...");
            await this.loadBlueprint();
        }
        // Catches up level-up bee rewards to the current level every time
        // the app loads - covers both normal play AND a save file that
        // already reached its current level before this reward (or a
        // formula change to it) existed. No-ops once caught up.
        this._syncLevelUpBees();
        // Backfills bee.stats/weight/dexNumber onto any bee that predates
        // these fields (see rollBeeStats/rollBeeWeight above) - no-ops
        // once every bee already has them.
        this._ensureBeeCardData();
        return this.state;
    }

    // Fetches the active blueprint (personal-first, generic-fallback).
    // Shared by loadBlueprint() (overwrite) and syncFromBlueprint() (merge).
    async fetchBlueprint() {
        // Pages under src/features/* are two levels deep; the root index.html is not.
        const rootPrefix = window.location.pathname.includes('features') ? '../../..' : '.';

        try {
            const personalResponse = await fetch(`${rootPrefix}/src/core/data.personal.json`);
            if (personalResponse.ok) return await personalResponse.json();
        } catch (error) {
            // No personal blueprint on this machine - fall through to the generic one.
        }

        const response = await fetch(`${rootPrefix}/src/core/data.json`);
        return await response.json();
    }

    // 2. Overwrite: used when starting fresh, or by a full Reset.
    // data.personal.json is gitignored - if it exists (your own machine), it wins.
    // Everyone else silently falls back to the generic data.json.
    async loadBlueprint() {
        try {
            this.state = await this.fetchBlueprint();
            this.state.schemaVersion = VAULT_SCHEMA_VERSION;
            // Eevee's memory isn't part of the blueprint (it's generated locally,
            // not authored) - always starts fresh here since loadBlueprint is
            // used by both first-run init and a full Reset.
            this.state.eevee = { conversations: [] };
            // Same reasoning for the colony's gacha-pulled bees - these are
            // random results that can't be recomputed from a formula (unlike
            // DP/level), so they have to actually be stored, but they're not
            // blueprint content either. The colony always starts with the
            // Queen (a fixed, separate visual - see colony.js, never stored
            // here) plus exactly one Common Worker Bee, so the collection
            // isn't empty on a fresh start. Only runs on first init or a
            // full Reset - an existing player's already-earned bees are
            // never touched or retroactively seeded.
            this.state.colony = {
                bees: [{
                    id: 'bee-starter',
                    name: 'Worker Bee #1',
                    rarity: 'Common',
                    class: null,
                    obtainedAt: new Date().toISOString(),
                    source: 'starter',
                    stats: rollBeeStats('Common'),
                    weight: rollBeeWeight('Common'),
                    dexNumber: 1,
                    element: rollBeeElement()
                }],
                // How many bees/tickets the level-up reward has granted so
                // far - see _syncLevelUpBees(). Tracked separately from
                // bees.length since that array also includes gacha pulls,
                // ticket unwraps, and the starter bee.
                levelUpBeesAwarded: 0,
                tickets: 0,
                ticketsAwarded: 0
            };
            // Collector-bee material drops - see _collectMaterialsOnCompletion.
            // Not blueprint content (random results, same reasoning as colony
            // above), so this only gets seeded fresh here, never touched by
            // syncFromBlueprint.
            this.state.inventory = { materials: {} };
            this.save();
            console.log("Vault: Blueprint loaded and secured.");
        } catch (error) {
            console.error("Vault Error: Could not load blueprint.", error);
        }
    }

    // 2b. Merge: pulls in content changes (titles, objectives, sources,
    // task labels/dp/links, new or removed quests/tasks) from the blueprint
    // while keeping your progress - task completion, dates, activeQuestId.
    // Blueprint is authoritative for "what exists and what it's called";
    // localStorage is authoritative for "what you've done." DP/level need
    // no merging at all since they're always derived live from task state.
    async syncFromBlueprint() {
        if (!this.state) return null;

        let blueprint;
        try {
            blueprint = await this.fetchBlueprint();
        } catch (error) {
            console.error("Vault Error: Could not fetch blueprint for sync.", error);
            return null;
        }

        this.state.user = {
            ...this.state.user,
            name: blueprint.user.name,
            class: blueprint.user.class,
            title: blueprint.user.title,
            skills: blueprint.user.skills || []
        };

        // Static profile content (projects/service record) - blueprint is
        // fully authoritative here, same as user.name/class/title above.
        // Nothing to preserve locally since there's no user-driven progress
        // on this data (unlike quests/dailies).
        this.state.profile = blueprint.profile || { projects: [], serviceRecord: [] };

        const existingQuests = this.state.quests || [];

        this.state.quests = (blueprint.quests || []).map(blueprintQuest => {
            const existingQuest = existingQuests.find(q => q.id === blueprintQuest.id);

            const mergedTasks = (blueprintQuest.tasks || []).map(blueprintTask => {
                const existingTask = existingQuest && existingQuest.tasks
                    ? existingQuest.tasks.find(t => t.id === blueprintTask.id)
                    : null;

                return {
                    ...blueprintTask,
                    completed: existingTask ? existingTask.completed : blueprintTask.completed,
                    dateCompleted: existingTask ? existingTask.dateCompleted : blueprintTask.dateCompleted
                };
            });

            const mergedQuest = {
                ...blueprintQuest,
                tasks: mergedTasks,
                // Seed from the existing quest's progress (if it exists) so
                // _updateQuestCompletionState can correctly tell whether this
                // is a *new* completion (stamps today) or an existing one
                // (preserves its original date).
                status: existingQuest ? existingQuest.status : blueprintQuest.status,
                dateCompleted: existingQuest ? existingQuest.dateCompleted : blueprintQuest.dateCompleted
            };

            this._updateQuestCompletionState(mergedQuest);
            return mergedQuest;
        });

        // Same merge philosophy as quests: blueprint wins for label/dp,
        // localStorage wins for completion history.
        const existingDailyTasks = this.state.dailyTasks || [];
        this.state.dailyTasks = (blueprint.dailyTasks || []).map(blueprintTask => {
            const existingTask = existingDailyTasks.find(t => t.id === blueprintTask.id);
            return {
                ...blueprintTask,
                completedDates: existingTask ? existingTask.completedDates : []
            };
        });

        // Keep your local choice of active quest if it still exists after
        // merging; otherwise fall back to whatever the blueprint suggests.
        const activeStillExists = this.state.quests.some(q => q.id === this.state.activeQuestId);
        if (!activeStillExists) {
            this.state.activeQuestId = blueprint.activeQuestId || null;
        }

        this.save();
        console.log("Vault: Synced content from blueprint, progress preserved.");
        return this.state;
    }

    // 2c. Full reset - wipes local progress and reloads fresh. Destructive
    // and intentionally has no confirmation of its own; the caller (the
    // Settings page) is responsible for confirming with the user first.
    async forceReset() {
        await this.loadBlueprint();
        return this.state;
    }

    // 3. Save current state to the browser
    save() {
        if (this.state) {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        }
    }

    // 4. Getters
    getUser() {
        if (!this.state) return null;

        const totalDP = computeTotalDP(this.state.quests) + computeDailyDP(this.state.dailyTasks);
        const { level, currentXP, nextLevelXP } = computeLevelProgress(totalDP);

        return {
            ...this.state.user,
            totalDP,
            level,
            currentXP,
            nextLevelXP
        };
    }

    getQuests() {
        return this.state ? (this.state.quests || []) : [];
    }

    // Static profile content (projects/service record) - see the schema v7
    // note above VAULT_SCHEMA_VERSION for why this moved out of profile.html.
    getProfileExtras() {
        return this.state && this.state.profile
            ? this.state.profile
            : { projects: [], serviceRecord: [] };
    }

    // The one quest you're currently focused on - separate from each quest's
    // own status, since multiple quests can be "active" (in progress) at once.
    getActiveQuestId() {
        return this.state ? (this.state.activeQuestId || null) : null;
    }

    setActiveQuestId(questId) {
        if (!this.state) return;
        this.state.activeQuestId = questId;
        this.save();
    }

    // Recomputes a quest's status from its tasks, stamping dateCompleted the
    // moment it *becomes* fully done (never overwriting an existing date on
    // repeat calls) and clearing it the moment it's reopened.
    _updateQuestCompletionState(quest) {
        const allDone = quest.tasks.length > 0 && quest.tasks.every(t => t.completed);
        const wasCompleted = quest.status === 'completed';

        quest.status = allDone ? 'completed' : 'active';

        if (allDone && !wasCompleted) {
            quest.dateCompleted = new Date().toISOString().slice(0, 10);
        } else if (!allDone) {
            quest.dateCompleted = null;
        }
    }

    // 5. Logic: Toggle a quest's task. DP needs no updating here at all -
    // it's derived live in getUser() from whichever tasks are completed.
    // When every task on a quest is done, the quest auto-completes;
    // unchecking any task on a completed quest re-opens it.
    toggleTask(questId, taskId) {
        if (!this.state) return null;

        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest || !quest.tasks) return null;

        const task = quest.tasks.find(t => t.id === taskId);
        if (!task) return null;

        const wasQuestCompleted = quest.status === 'completed';

        task.completed = !task.completed;
        // Full timestamp (not just the date) so the UI can show exactly when
        // a task was actually checked off, not just which day. Quest-level
        // dateCompleted (below) stays date-only - this is scoped to tasks.
        task.dateCompleted = task.completed ? new Date().toISOString() : null;

        this._updateQuestCompletionState(quest);

        this.save();
        this._syncLevelUpBees();
        if (task.completed) this._collectMaterialsOnCompletion();
        if (!wasQuestCompleted && quest.status === 'completed') this._awardQuestTicketIfSignificant(quest);
        return quest;
    }

    // Tops up level-up bee AND ticket rewards (see beesForLevel above) to
    // match the current level - called after anything that can change
    // DP/level (toggleTask/toggleDailyTask below) AND once on every
    // init(), so a save file that already reached its current level
    // before these rewards (or a formula change to them) existed gets
    // caught up automatically instead of being stuck at whatever it had
    // before. Purely additive - never removes bees/tickets, and never
    // touches gacha pulls, ticket unwraps, or the starter bee. Each page
    // still does its own levelBefore/After compare for the "LEVEL UP!"
    // toast (unrelated to this); this only handles bees/tickets. Toast is
    // loaded on every page alongside db.js, but guarded here anyway since
    // Vault (the model layer) otherwise never reaches into UI code.
    _syncLevelUpBees() {
        if (!this.state) return;
        if (!this.state.colony) this.state.colony = { bees: [], levelUpBeesAwarded: 0, tickets: 0, ticketsAwarded: 0 };
        if (typeof this.state.colony.levelUpBeesAwarded !== 'number') this.state.colony.levelUpBeesAwarded = 0;
        if (typeof this.state.colony.tickets !== 'number') this.state.colony.tickets = 0;
        if (typeof this.state.colony.ticketsAwarded !== 'number') this.state.colony.ticketsAwarded = 0;

        const level = this.getUser().level;

        let expectedBees = 0;
        for (let lvl = 2; lvl <= level; lvl++) expectedBees += beesForLevel(lvl);
        const beeDeficit = expectedBees - this.state.colony.levelUpBeesAwarded;

        // 1 ticket per level-up - simpler cadence than the escalating bee
        // formula since tickets are the rarer, higher-stakes currency.
        const expectedTickets = Math.max(0, level - 1);
        const ticketDeficit = expectedTickets - this.state.colony.ticketsAwarded;

        if (beeDeficit <= 0 && ticketDeficit <= 0) return;

        const awardedBees = [];
        if (beeDeficit > 0) {
            for (let i = 0; i < beeDeficit; i++) awardedBees.push(this.awardBee('levelup'));
            this.state.colony.levelUpBeesAwarded = expectedBees;
        }

        if (ticketDeficit > 0) {
            this.state.colony.tickets += ticketDeficit;
            this.state.colony.ticketsAwarded = expectedTickets;
        }

        this.save();

        if (typeof Toast !== 'undefined') {
            if (awardedBees.length > 0) {
                const label = awardedBees.length === 1 ? awardedBees[0].name : `${awardedBees.length} bees`;
                Toast.show(`🐝 ${label} joined your colony!`, 'positive');
            }
            if (ticketDeficit > 0) {
                Toast.show(`🎟️ ${ticketDeficit === 1 ? 'A gacha ticket' : `${ticketDeficit} gacha tickets`} earned from leveling up!`, 'positive');
            }
        }
    }

    // Backfills bee.stats/weight/dexNumber onto any bee saved before these
    // fields existed - stats/weight rolled once per bee, same as a fresh
    // pull, then persisted so they never re-roll on a later visit.
    // dexNumber is deterministic (bees array is append-only, so array
    // index+1 IS each bee's true acquisition order) rather than rolled.
    // Purely additive, mirrors _syncLevelUpBees' catch-up philosophy.
    _ensureBeeCardData() {
        if (!this.state || !this.state.colony) return;
        let changed = false;

        (this.state.colony.bees || []).forEach((bee, index) => {
            if (!bee.stats) {
                bee.stats = rollBeeStats(bee.rarity);
                changed = true;
            }
            if (typeof bee.weight !== 'number') {
                bee.weight = rollBeeWeight(bee.rarity);
                changed = true;
            }
            if (typeof bee.dexNumber !== 'number') {
                bee.dexNumber = index + 1;
                changed = true;
            }
            if (!bee.element || !BEE_ELEMENTS[bee.element]) {
                bee.element = rollBeeElement();
                changed = true;
            }
        });

        if (changed) this.save();
    }

    // Per-Collector-bee chance (COLLECTOR_DROP_CHANCE) of a material drop
    // whenever a real task/daily gets completed - called from
    // toggleTask/toggleDailyTask, only on the transition INTO completed
    // (not when unchecking). No-ops silently if you have no Collectors.
    _collectMaterialsOnCompletion() {
        if (!this.state) return;
        const collectors = this.getColonyBees().filter(b => b.class === 'collector');
        if (collectors.length === 0) return;

        if (!this.state.inventory) this.state.inventory = { materials: {} };
        if (!this.state.inventory.materials) this.state.inventory.materials = {};

        const drops = [];
        collectors.forEach(bee => {
            if (Math.random() < COLLECTOR_DROP_CHANCE) {
                const materialId = rollMaterialDrop();
                this.state.inventory.materials[materialId] = (this.state.inventory.materials[materialId] || 0) + 1;
                drops.push({ bee, materialId });
            }
        });

        if (drops.length === 0) return;
        this.save();

        if (typeof Toast !== 'undefined') {
            drops.forEach(({ bee, materialId }) => {
                const material = MATERIAL_CATALOG.find(m => m.id === materialId);
                const label = material ? `${material.icon} ${material.label}` : materialId;
                Toast.show(`${label} - brought back by ${bee.name}`, 'positive');
            });
        }
    }

    // Awards a gacha ticket when a quest transitions INTO completed and
    // its total DP clears QUEST_TICKET_DP_THRESHOLD - "certain quests that
    // accomplish a great deal," per Leo's own framing, not every quest.
    _awardQuestTicketIfSignificant(quest) {
        if (!this.state) return;
        const totalDP = (quest.tasks || []).reduce((sum, t) => sum + t.dp, 0);
        if (totalDP < QUEST_TICKET_DP_THRESHOLD) return;

        if (!this.state.colony) this.state.colony = { bees: [], levelUpBeesAwarded: 0, tickets: 0, ticketsAwarded: 0 };
        if (typeof this.state.colony.tickets !== 'number') this.state.colony.tickets = 0;
        this.state.colony.tickets += 1;
        this.save();

        if (typeof Toast !== 'undefined') {
            Toast.show(`🎟️ Gacha ticket earned for completing "${quest.title}"!`, 'positive');
        }
    }

    // 5b. Logic: Task management (add/edit/remove) - the LLM or the user can
    // both shape a quest's tasks this way, not just check them off.
    addTask(questId, { label, dp, difficulty }) {
        if (!this.state) return null;

        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest) return null;

        if (!quest.tasks) quest.tasks = [];
        quest.tasks.push({
            id: `${questId.toLowerCase()}-t${Date.now()}`,
            label,
            dp: Number(dp) || 0,
            completed: false,
            dateCompleted: null,
            link: null,
            difficulty: difficulty || null
        });

        this._updateQuestCompletionState(quest);
        this.save();
        return quest;
    }

    updateTask(questId, taskId, { label, dp, difficulty }) {
        if (!this.state) return null;

        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest || !quest.tasks) return null;

        const task = quest.tasks.find(t => t.id === taskId);
        if (!task) return null;

        if (label !== undefined) task.label = label;
        if (dp !== undefined) task.dp = Number(dp) || 0;
        if (difficulty !== undefined) task.difficulty = difficulty || null;

        this.save();
        return quest;
    }

    removeTask(questId, taskId) {
        if (!this.state) return null;

        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest || !quest.tasks) return null;

        const task = quest.tasks.find(t => t.id === taskId);
        if (!task) return null;

        quest.tasks = quest.tasks.filter(t => t.id !== taskId);
        this._updateQuestCompletionState(quest);

        this.save();
        return quest;
    }

    // 5c. Logic: Edit a single narrative field (objective/source/title/
    // dateStarted). Deliberately NOT a free-for-all setter - status/tasks/
    // dateCompleted have their own methods that handle side effects, and
    // letting this bypass them would desync things.
    updateQuestField(questId, field, value) {
        const allowedFields = ['objective', 'source', 'title', 'dateStarted'];
        if (!this.state || !allowedFields.includes(field)) return null;

        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest) return null;

        quest[field] = value;
        this.save();
        return quest;
    }

    // 5d. Logic: Dev Edit - replace a quest's data wholesale from pasted
    // JSON (hand-edited, or eventually LLM-generated). The id is pinned to
    // the original regardless of what the pasted JSON says, since
    // activeQuestId and every UI reference to this quest depends on it
    // staying stable.
    replaceQuest(questId, newData) {
        if (!this.state) return null;

        const quests = this.state.quests || [];
        const index = quests.findIndex(q => q.id === questId);
        if (index === -1) return null;

        quests[index] = { ...newData, id: questId };
        this.save();
        return quests[index];
    }

    // 5e. Logic: Eevee generates a whole new quest (goal -> structured
    // campaign). Just appends to the quest list - the LLM-facing schema
    // validation/shaping happens in llm-engine.js before this is called.
    addQuest(questData) {
        if (!this.state) return null;

        if (!this.state.quests) this.state.quests = [];
        this.state.quests.push(questData);

        this.save();
        return questData;
    }

    // 5f. Logic: Eevee's memory. Every real exchange (chat, or a quest
    // generation request) gets appended here, timestamped. This is the raw
    // material for Track B (real fine-tuning) later, and also what gets fed
    // back into her prompt as short-term context in the meantime - see
    // ROADMAP.md's "Two-track plan" for the full reasoning.
    logConversation(role, content) {
        if (!this.state) return;
        if (!this.state.eevee) this.state.eevee = { conversations: [] };

        this.state.eevee.conversations.push({
            role,
            content,
            timestamp: new Date().toISOString()
        });

        this.save();
    }

    getConversations() {
        return this.state && this.state.eevee ? (this.state.eevee.conversations || []) : [];
    }

    // 5g. Logic: the colony's gacha-pulled bees (src/features/colony/). Each
    // pull's rarity/name is random, so - unlike DP/level - there's no formula
    // to recompute it from; it has to be stored as its own fact.
    getColonyBees() {
        return this.state && this.state.colony ? (this.state.colony.bees || []) : [];
    }

    addColonyBee(bee) {
        if (!this.state) return null;
        if (!this.state.colony) this.state.colony = { bees: [] };

        this.state.colony.bees.push(bee);
        this.save();
        return bee;
    }

    // Rolls a brand new bee via the shared rarity table and stores it -
    // shared by the Pollination Chamber gacha (colony.js, after its spin
    // animation finishes) and the automatic level-up reward in
    // toggleTask/toggleDailyTask below. `source` is purely informational
    // ('gacha' / 'levelup' / 'starter') in case that's ever worth surfacing
    // in the UI later - nothing currently branches on it.
    awardBee(source) {
        const rarityInfo = rollBeeRarity();
        const dexNumber = this.getColonyBees().length + 1;
        const bee = {
            id: generateBeeId(),
            name: `${rarityInfo.rarity} Bee #${dexNumber}`,
            rarity: rarityInfo.rarity,
            class: null,
            obtainedAt: new Date().toISOString(),
            source: source || 'gacha',
            stats: rollBeeStats(rarityInfo.rarity),
            weight: rollBeeWeight(rarityInfo.rarity),
            dexNumber,
            element: rollBeeElement()
        };
        return this.addColonyBee(bee);
    }

    // Renames a bee - works on any bee regardless of rarity/source, not
    // just Named Beasts (their generated "<Noun> The <Title>" name is just
    // a starting point). Trimmed and length-capped so a swarm name label
    // can't grow unboundedly.
    renameBee(beeId, newName) {
        if (!this.state || !this.state.colony) return null;
        const bee = (this.state.colony.bees || []).find(b => b.id === beeId);
        if (!bee) return null;

        const trimmed = (newName || '').trim();
        if (!trimmed) return null;

        bee.name = trimmed.slice(0, 40);
        this.save();
        return bee;
    }

    // Assigns (or clears, with className=null) a bee's class/"work" - see
    // BEE_CLASSES above for what each does. Rejects unknown class keys
    // rather than silently storing garbage.
    assignBeeClass(beeId, className) {
        if (!this.state || !this.state.colony) return null;
        const bee = (this.state.colony.bees || []).find(b => b.id === beeId);
        if (!bee) return null;
        if (className && !BEE_CLASSES[className]) return null;

        bee.class = className || null;
        this.save();
        return bee;
    }

    getTicketCount() {
        return this.state && this.state.colony ? (this.state.colony.tickets || 0) : 0;
    }

    // Consumes 1 ticket and guarantees a Named Beast - the ONLY path that
    // can produce this rarity (see BEE_RARITIES' weight:0 comment on
    // 'Named' - normal rollBeeRarity() can never select it). Returns null
    // if there's no ticket to spend, so the caller (colony.js's unwrap UI)
    // can guard the tear/reveal interaction on a real ticket existing.
    unwrapTicket() {
        if (!this.state || !this.state.colony) return null;
        if (!this.state.colony.tickets || this.state.colony.tickets <= 0) return null;

        this.state.colony.tickets -= 1;
        const bee = {
            id: generateBeeId(),
            name: rollNamedBeeName(),
            rarity: 'Named',
            class: null,
            obtainedAt: new Date().toISOString(),
            source: 'ticket',
            stats: rollBeeStats('Named'),
            weight: rollBeeWeight('Named'),
            dexNumber: this.getColonyBees().length + 1,
            element: rollBeeElement()
        };
        return this.addColonyBee(bee); // also saves - persists the ticket spend + the new bee together
    }

    // Materials a Collector bee can bring back - see MATERIAL_CATALOG for
    // the full catalog (including ones you don't own yet) and
    // _collectMaterialsOnCompletion for how they're earned. Keyed by
    // material id -> count owned.
    getMaterials() {
        return this.state && this.state.inventory ? (this.state.inventory.materials || {}) : {};
    }

    // Permanently removes a bee and grants material loot in exchange -
    // count scaled by rarity (DESTROY_LOOT_COUNT above), rolled from the
    // same table a live Collector bee drops from. Returns null if the bee
    // doesn't exist so the caller can guard against a stale selection.
    destroyBee(beeId) {
        if (!this.state || !this.state.colony) return null;
        const bees = this.state.colony.bees || [];
        const index = bees.findIndex(b => b.id === beeId);
        if (index === -1) return null;

        const [removed] = bees.splice(index, 1);

        if (!this.state.inventory) this.state.inventory = { materials: {} };
        if (!this.state.inventory.materials) this.state.inventory.materials = {};

        const lootCount = DESTROY_LOOT_COUNT[removed.rarity] || 1;
        const loot = [];
        for (let i = 0; i < lootCount; i++) {
            const materialId = rollMaterialDrop();
            this.state.inventory.materials[materialId] = (this.state.inventory.materials[materialId] || 0) + 1;
            loot.push(materialId);
        }

        this.save();
        return { removed, loot };
    }

    // Consumes two bees and produces one new one - a coin flip (see
    // COMBINE_UPGRADE_CHANCE) on whether the result climbs one rarity
    // tier above the higher of the two inputs, or lands on that same
    // tier. Never produces a Named Beast (see RARITY_ORDER's comment).
    // Returns null on an invalid pick (missing bee, or the same bee
    // picked for both slots) so the caller can guard the UI on it.
    combineBees(beeIdA, beeIdB) {
        if (!this.state || !this.state.colony || !beeIdA || !beeIdB || beeIdA === beeIdB) return null;

        const bees = this.state.colony.bees || [];
        const beeA = bees.find(b => b.id === beeIdA);
        const beeB = bees.find(b => b.id === beeIdB);
        if (!beeA || !beeB) return null;

        const indexOf = (rarity) => {
            const idx = RARITY_ORDER.indexOf(rarity);
            return idx === -1 ? RARITY_ORDER.length - 1 : idx; // Named -> treated as topped-out
        };
        const baseIndex = Math.max(indexOf(beeA.rarity), indexOf(beeB.rarity));

        const upgraded = baseIndex < RARITY_ORDER.length - 1 && Math.random() < COMBINE_UPGRADE_CHANCE;
        const resultRarity = RARITY_ORDER[upgraded ? baseIndex + 1 : baseIndex];

        this.state.colony.bees = bees.filter(b => b.id !== beeIdA && b.id !== beeIdB);

        const dexNumber = this.getColonyBees().length + 1;
        const newBee = {
            id: generateBeeId(),
            name: `${resultRarity} Bee #${dexNumber}`,
            rarity: resultRarity,
            class: null,
            obtainedAt: new Date().toISOString(),
            source: 'combine',
            stats: rollBeeStats(resultRarity),
            weight: rollBeeWeight(resultRarity),
            dexNumber,
            element: rollBeeElement()
        };

        this.addColonyBee(newBee); // also saves - persists the consumption + the new bee together
        return { newBee, upgraded };
    }

    // 5h. Logic: Daily Tasks (a Habitica-style "Dailies" checklist, distinct
    // from quest tasks - these reset every day rather than being one-off).
    // Blueprint-authored (label/dp), like quests, but Vault tracks a running
    // list of the dates each one was completed on. getDailyTasks() derives
    // "is this checked off today" live from that list rather than storing a
    // separate boolean, so there's nothing to reset at midnight - a new day
    // just means today's date isn't in the list yet.
    getDailyTasks() {
        if (!this.state) return [];
        const today = todayISO();

        return (this.state.dailyTasks || []).map(task => ({
            ...task,
            completedToday: (task.completedDates || []).includes(today)
        }));
    }

    toggleDailyTask(taskId) {
        if (!this.state) return null;

        const task = (this.state.dailyTasks || []).find(t => t.id === taskId);
        if (!task) return null;

        if (!task.completedDates) task.completedDates = [];
        const today = todayISO();
        const index = task.completedDates.indexOf(today);
        const justCompleted = index === -1;

        if (justCompleted) {
            task.completedDates.push(today);
        } else {
            task.completedDates.splice(index, 1);
        }

        this.save();
        this._syncLevelUpBees();
        if (justCompleted) this._collectMaterialsOnCompletion();
        return task;
    }

    // 5i. Logic: Daily Task management (add/edit/remove) - mirrors
    // addTask/updateTask/removeTask for quest tasks above.
    addDailyTask({ label, dp, difficulty }) {
        if (!this.state) return null;
        if (!this.state.dailyTasks) this.state.dailyTasks = [];

        this.state.dailyTasks.push({
            id: `daily-${Date.now()}`,
            label,
            dp: Number(dp) || 0,
            difficulty: difficulty || null,
            completedDates: []
        });

        this.save();
        return this.state.dailyTasks;
    }

    updateDailyTask(taskId, { label, dp, difficulty }) {
        if (!this.state) return null;

        const task = (this.state.dailyTasks || []).find(t => t.id === taskId);
        if (!task) return null;

        if (label !== undefined) task.label = label;
        if (dp !== undefined) task.dp = Number(dp) || 0;
        if (difficulty !== undefined) task.difficulty = difficulty || null;

        this.save();
        return task;
    }

    removeDailyTask(taskId) {
        if (!this.state || !this.state.dailyTasks) return false;

        this.state.dailyTasks = this.state.dailyTasks.filter(t => t.id !== taskId);
        this.save();
        return true;
    }

    // 6. Logic: Privacy Preference Write
    setStorageMode(mode) {
        if (!this.state) return;

        this.state.storage_mode = mode;
        this.state.onboardingComplete = true;

        this.save();
        console.log(`Vault: Storage mode locked to [${mode.toUpperCase()}]`);
    }
}

// Global instance
const Vault = new DatabaseManager();
