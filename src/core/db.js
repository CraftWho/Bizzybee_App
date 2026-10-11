console.log("/// VAULT (DB) INITIALIZED ///");

// Bump this whenever data.json/data.personal.json's shape changes (new
// fields, renamed fields, etc.). Older saves are backed up and migrated
// through the additive initialization backfills; never discard progress.
// v7: added the "profile" block (projects/serviceRecord) - this used to be
// hardcoded directly in profile.html, which meant the real (personal)
// content shipped in the tracked base template. Now it's blueprint content
// like everything else, so data.json/data.personal.json stay properly split.
const VAULT_SCHEMA_VERSION = 7;

// Habitica difficulty -> Bizzybee difficulty. The Habitica import stores
// DP 25/50/75/100 for Habitica's trivial/easy/medium/hard (account-info.js's
// habiticaPriorityToDp), so the DP alone says which one it was.
function habiticaDifficultyFromDp(dp) {
    const n = Number(dp) || 0;
    if (n >= 100) return 'Hard';
    if (n >= 75) return 'Medium';
    if (n >= 50) return 'Easy';
    return 'Trivial';
}

// Pure, stateless: total DP is always the live sum of every completed
// task's current dp value, across every quest - never a stored running
// total. This means editing a task's dp (even after it's been completed),
// adding a new quest, or a future conditionally-generated quest all just
// work automatically, with no ledger to drift out of sync.
// Ghost Log entries (optional, see 5m below) count the exact same way a
// task does - any entry not sitting at 'pending' contributes its own dp,
// same live-not-a-ledger philosophy, since a Ghost Log's own status/dp can
// be edited after the fact too (correcting a partial-credit call, say) and
// the total should just reflect that immediately.
function computeTotalDP(quests) {
    return (quests || []).reduce((sum, quest) => {
        const taskDP = (quest.tasks || [])
            .filter(t => t.completed)
            .reduce((s, t) => s + t.dp, 0);
        const ghostLogDP = (quest.ghostLogs || [])
            .filter(g => g.status && g.status !== 'pending')
            .reduce((s, g) => s + (g.dp || 0), 0);
        return sum + taskDP + ghostLogDP;
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

// Same "live, not a ledger" philosophy again, just bidirectional: a
// Habit's `history` is a permanent log of every +/- click (see
// Vault.bumpHabit below) - this sums positive clicks and SUBTRACTS
// negative ones, both at the habit's CURRENT dp value, so editing a
// habit's dp later reflects across every past click, in both directions,
// exactly like a Daily's completedDates does for its own dp.
function computeHabitDP(habits) {
    return (habits || []).reduce((sum, habit) => {
        const history = habit.history || [];
        const positive = history.filter(h => h.direction === 'positive').length;
        const negative = history.filter(h => h.direction === 'negative').length;
        return sum + (positive - negative) * habit.dp;
    }, 0);
}

// Same live-not-a-ledger philosophy as computeTotalDP's quest tasks: a
// To-Do only ever contributes its CURRENT dp, and only once - the moment
// `completed` flips true (see Vault.toggleTodoComplete below). Unlike a
// Daily/Habit there's no repeat count to multiply by; a To-Do happens
// exactly once by definition.
function computeTodoDP(todos) {
    return (todos || []).filter(t => t.completed).reduce((sum, t) => sum + (t.dp || 0), 0);
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

// Start-of-current-period ISO date for a Habit's Reset Counter cadence -
// used only to derive a display-only "this period" tally (see getHabits
// below). Purely additive: the permanent `history` log (and everything
// computed from it - DP totals, Skill Matrix contributions) is never
// filtered by this and never resets. Week starts Sunday, matching the
// daysOfWeek 0=Sun convention Dailies already use elsewhere in this file.
function habitPeriodStartISO(resetCounter, now = new Date()) {
    if (resetCounter === 'weekly') {
        const start = new Date(now);
        start.setDate(start.getDate() - start.getDay());
        return start.toISOString().slice(0, 10);
    }
    if (resetCounter === 'monthly') {
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    return now.toISOString().slice(0, 10);
}

// Word-boundary-ish, case-insensitive "does this term appear in this text"
// check - shared by computeSkillMatrixDP's Quest-matching pass below and
// mirrored (independently, since this file has no DOM) by create-daily.js's
// findMatchingTerms for auto-tagging Dailies. Terms under 3 characters are
// skipped to avoid noisy single/double-letter false positives.
function textContainsTerm(text, term) {
    if (!text || !term || term.length < 3) return false;
    const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`, 'i');
    return re.test(text.toLowerCase());
}

// Real skill-mastery matrix, derived live from your Dailies' tags AND your
// completed Quest work rather than stored/incremented anywhere - same
// "live, not a ledger" philosophy as computeTotalDP/computeDailyDP above,
// and for the same reason: a tag's (or a term's) category can be
// re-assigned later (edit a Dictionary term's category), and everything
// downstream should just reflect that immediately rather than needing a
// migration to "fix" numbers that already drifted.
//
// Every one of a daily's tags counts in FULL toward its category - a task
// tagged both "CSS" and "Accessibility" genuinely exercises both, so it's
// not split/divided between them. A tag that doesn't match any Dictionary
// term's name becomes its OWN category (named after the tag itself) rather
// than being silently dropped or dumped into a catch-all "General" bucket
// - nothing you've tagged ever just vanishes from the matrix, it just
// isn't grouped with anything else yet until a matching Dictionary term
// exists.
//
// Quests don't have an explicit tags field (unlike Dailies), and most of
// this app's real, historical DP lives in completed Quest tasks, not
// Dailies (a brand-new feature) - so counting Dailies alone left the
// matrix empty despite plenty of already-earned mastery. This mirrors how
// the original Codex tracker worked: tagging a Quest Log entry applied its
// earned DP straight to the matching skill bars (see "Tags: [React, CSS]"
// in leveling-system.md's Skill Proficiency Tracks) - here it's fully
// automatic instead of hand-tagged: a completed task's DP counts toward
// every Dictionary term that appears as a whole word in its own quest's
// title, objective, or the task's own label. Unlike Daily tags, an
// unmatched word does NOT become its own category here - quest text is
// free-form prose, not a deliberate tag, so only a real Dictionary-term
// match counts (avoids turning entire sentences into bogus "categories").
// Every individual contribution behind the matrix - one entry per (tag or
// matched Dictionary term) x (completion), each carrying its own date. This
// is the single source of truth computeSkillMatrixDP aggregates below AND
// what getSkillContributionsSince (see the Vault class) filters by date to
// hand Eevee a real batch of "what actually happened" for a level-up
// assessment - keeping both in exact sync instead of two copies of the same
// matching logic that could quietly drift apart.
function computeSkillContributions(dailyTasks, dictionaryTerms, quests, habits, todos) {
    const categoryByTermName = {};
    const termNames = [];
    (dictionaryTerms || []).forEach(term => {
        if (term.name && term.category) {
            categoryByTermName[term.name.toLowerCase()] = term.category;
        }
        if (term.name) termNames.push(term.name);
    });

    const contributions = [];

    (dailyTasks || []).forEach(task => {
        (task.tags || []).forEach(tag => {
            const category = categoryByTermName[tag.toLowerCase()] || tag;
            (task.completedDates || []).forEach(dateStr => {
                contributions.push({ category, label: task.label, dp: task.dp || 0, date: dateStr, source: 'daily' });
            });
        });
    });

    // Habits: only POSITIVE clicks count toward the matrix - a negative
    // click is a lapse, not accomplishment, so it shouldn't read as
    // "skill mastery work" even though it does subtract real DP overall
    // (see computeHabitDP above). Each positive click contributes its own
    // dated entry, same as a Daily's completedDates.
    (habits || []).forEach(habit => {
        (habit.tags || []).forEach(tag => {
            const category = categoryByTermName[tag.toLowerCase()] || tag;
            (habit.history || []).filter(h => h.direction === 'positive').forEach(entry => {
                contributions.push({ category, label: habit.label, dp: habit.dp || 0, date: entry.date, source: 'habit' });
            });
        });
    });

    // To-Dos: tagged directly (like Dailies/Habits), not text-matched
    // (like Quests below) - only once completed, and only ever once,
    // matching computeTodoDP's own one-shot counting.
    (todos || []).forEach(todo => {
        if (!todo.completed) return;
        (todo.tags || []).forEach(tag => {
            const category = categoryByTermName[tag.toLowerCase()] || tag;
            contributions.push({ category, label: todo.label, dp: todo.dp || 0, date: todo.completedDate || null, source: 'todo' });
        });
    });

    (quests || []).forEach(quest => {
        (quest.tasks || []).forEach(task => {
            if (!task.completed) return;
            const haystack = `${quest.title || ''} ${quest.objective || ''} ${task.label || ''}`;

            const matchedCategories = new Set();
            termNames.forEach(name => {
                if (textContainsTerm(haystack, name)) {
                    matchedCategories.add(categoryByTermName[name.toLowerCase()] || name);
                }
            });

            matchedCategories.forEach(category => {
                contributions.push({ category, label: task.label, dp: task.dp || 0, date: task.dateCompleted || null, source: 'quest' });
            });
        });
    });

    return contributions;
}

function computeSkillMatrixDP(dailyTasks, dictionaryTerms, quests, habits, todos) {
    const dpByCategory = {};
    computeSkillContributions(dailyTasks, dictionaryTerms, quests, habits, todos).forEach(contribution => {
        dpByCategory[contribution.category] = (dpByCategory[contribution.category] || 0) + contribution.dp;
    });

    return Object.entries(dpByCategory)
        .map(([category, dp]) => ({ category, dp }))
        .sort((a, b) => b.dp - a.dp);
}

// Flat 200 DP per skill level, forever - simple and predictable, and it
// matches the DP-ceiling steps the Dashboard already showed before levels
// existed. Unlike character levels (which get harder further in), a
// skill's mastery bar is meant to be a steady, always-achievable climb.
const SKILL_LEVEL_DP_STEP = 200;

// A skill's live totalDP (always recomputed, never stored - see
// computeSkillMatrixDP above) can run ahead of the level the worker bee has
// actually CELEBRATED (acknowledgedLevel, stored in Vault.state.skillLevels
// - see levelUpSkill below). The bar only ever shows progress within the
// acknowledged level's own 200 DP band; once totalDP fills that band, the
// bar reports maxed (shakes, offers the Level Up button) and STAYS at 100%
// - it does not silently advance to the next band - until levelUpSkill()
// is actually called. This is the same "does NOT increase automatically,
// a specific action must break the seal" bottleneck the original Codex
// tracker used for character-level Promotion Trials, just applied per skill.
function computeSkillLevelState(totalDP, acknowledgedLevel) {
    const level = acknowledgedLevel || 1;
    const dpIntoLevel = Math.min(SKILL_LEVEL_DP_STEP, Math.max(0, totalDP - (level - 1) * SKILL_LEVEL_DP_STEP));

    return {
        level,
        dpIntoLevel,
        cap: SKILL_LEVEL_DP_STEP,
        percentage: Math.min(100, (dpIntoLevel / SKILL_LEVEL_DP_STEP) * 100),
        maxed: totalDP >= level * SKILL_LEVEL_DP_STEP
    };
}

// Starter Dictionary terms, seeded once (see _ensureDictionarySeeded below)
// so the Skill Mastery Matrix has real categories to bucket into from day
// one instead of waiting on a manually-added Dictionary entry. These match
// the genesis-tier skill tree this tracker already used (Semantic HTML,
// CSS Fundamentals, JavaScript Essentials, DOM Manipulation, React,
// WordPress - see skill-tree.md / the Genesis quest titles), so existing
// completed Quest tasks that already mention these by name light up
// immediately via computeSkillMatrixDP's Quest-matching pass above.
const DICTIONARY_STARTER_TERMS = [
    { name: 'HTML', category: 'HTML', definition: "HyperText Markup Language - the structural backbone of every web page." },
    { name: 'CSS', category: 'CSS', definition: 'Cascading Style Sheets - controls layout, color, and presentation.' },
    { name: 'JavaScript', category: 'JavaScript', definition: 'The scripting language that drives interactivity and logic in the browser.' },
    { name: 'DOM', category: 'JavaScript', definition: 'Document Object Model - the live tree of elements JS reads and manipulates.' },
    { name: 'React', category: 'React', definition: 'A component-based JavaScript library for building UIs.' },
    { name: 'WordPress', category: 'WordPress', definition: 'A CMS platform used for building and customizing client sites.' }
];

// Whether a daily is actually due on a given YYYY-MM-DD date, per its own
// `repeats` schedule. 'daily' (the default, and what every daily task made
// before this scheduling system existed backfills to - see
// _ensureDailyTaskScheduleData) means due every single day, no exceptions,
// so nothing about existing dailies' behavior changes. 'weekly' only
// counts on the toggled daysOfWeek (0=Sun..6=Sat, matching Date#getDay()),
// and if `every` is more than 1, only on weeks landing on the right
// multiple of weeks since startDate - e.g. every:2 means "every OTHER
// matching week," anchored to whichever week startDate itself falls in.
// Never due before its own startDate, regardless of type.
function isDailyDueOn(daily, dateStr) {
    const repeats = daily.repeats || { type: 'daily', every: 1, daysOfWeek: [] };
    const date = new Date(`${dateStr}T00:00:00`);
    const start = daily.startDate ? new Date(`${daily.startDate}T00:00:00`) : null;
    const every = Math.max(1, Number(repeats.every) || 1);

    if (start && date < start) return false;

    // 'daily' with every > 1 = every N days, counted from startDate
    // (added 2026-10-09 with the new Daily form; every:1 is unchanged).
    if (repeats.type === 'monthly') {
        if (!start) return date.getDate() === 1;
        const monthsSince = (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
        if (monthsSince % every !== 0) return false;
        // A start on the 31st still lands on the last day of a short month.
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        return date.getDate() === Math.min(start.getDate(), lastDay);
    }

    if (repeats.type !== 'weekly') {
        if (every > 1 && start) return Math.round((date - start) / 86400000) % every === 0;
        return true;
    }

    const daysOfWeek = repeats.daysOfWeek || [];
    if (!daysOfWeek.includes(date.getDay())) return false;

    if (every > 1 && start) {
        const daysSince = Math.round((date - start) / 86400000);
        const weeksSince = Math.floor(daysSince / 7);
        if (weeksSince % every !== 0) return false;
    }

    return true;
}

// YYYY-MM-DD moved by n days (local calendar, noon to dodge DST edges).
function shiftISODate(dateStr, n) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A daily's streak: how many due days in a row it was done, ending today
// (or yesterday, while today is still open). Days it isn't due are
// skipped. "Adjust Streak" on the edit screen stores streakAdjust =
// { value, through }: the streak as of the `through` date, so the count
// keeps growing from there and still breaks on a missed day.
function computeDailyStreak(task, today) {
    const done = new Set(task.completedDates || []);
    const adj = task.streakAdjust && task.streakAdjust.through ? task.streakAdjust : null;
    let count = 0;
    let day = done.has(today) ? today : shiftISODate(today, -1);
    for (let i = 0; i < 1000; i++) {
        if (adj && day <= adj.through) {
            const extra = Math.max(0, Number(adj.value) || 0);
            return count + (adj.through === today && !done.has(today) ? Math.max(0, extra - 1) : extra);
        }
        if (task.startDate && day < task.startDate) return count;
        if (isDailyDueOn(task, day)) {
            if (!done.has(day)) return count;
            count++;
        }
        day = shiftISODate(day, -1);
    }
    return count;
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
    { rarity: 'Named', weight: 0, color: '#ff2d78' },
    // Royal: the Queen/King hatched in onboarding (the egg gift). Never
    // rolled (weight 0), never evolved, combined or destroyed - one per save.
    { rarity: 'Royal', weight: 0, color: '#ffd700' }
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
// below, used to build <optgroup>s in bee-card.js) matching how redacted
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
    { id: 'pollen', label: 'Pollen', icon: '🌼', rarity: 'Common', description: 'Common material - nearly every Collector run has a shot at this.' },
    { id: 'royal-nectar', label: 'Royal Nectar', icon: '✨', rarity: 'Rare', description: 'Rare material - a refined drop straight from the queen\'s own stores.' },
    { id: 'honey-drop', label: 'Honey Drop', icon: '🍯', rarity: 'Epic', description: 'Epic-grade material - an exceptionally dense, solidified drop of pure hive honey. The hardest material to find.' }
];

// Reweighted to match each material's rarity tag above - Pollen (Common)
// stays the everyday drop, Royal Nectar (Rare) a real but regular find,
// Honey Drop (Epic) now the genuinely hard-to-get one.
const MATERIAL_DROP_TABLE = [
    { id: 'pollen', weight: 70 },
    { id: 'royal-nectar', weight: 25 },
    { id: 'honey-drop', weight: 5 }
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

// --- EVOLUTION ITEMS ------------------------------------------------------
// A second, rarer loot category alongside MATERIAL_CATALOG above - these
// aren't "collectibles," they're consumed to change a bee (see evolveBee/
// applyTraitItem below). Nanite-flavored on purpose (bolts/screws, drills)
// since the colony is explicitly mechanical, not organic - matches the
// existing "nanite hive" framing everywhere else in the app.
// How many fragments assemble into one complete item - see _addFragment()
// below. Only 'evo-stone' uses fragments right now (via its
// 'evo-stone-fragment' entry, flagged isFragment/completesInto); more
// items can opt in the same way later just by adding a matching
// "<id>-fragment" catalog entry.
const FRAGMENTS_REQUIRED = 5;

const EVOLUTION_ITEM_CATALOG = [
    { id: 'evo-stone', label: 'Evolution Stone', icon: '💠', rarity: 'Rare', description: 'A rare catalyst - guarantees a bee evolves up one full rarity tier (e.g. Common to Rare, Epic to Legendary). Assembled from 5 Evolution Stone Fragments.' },
    { id: 'evo-stone-fragment', label: 'Evolution Stone Fragment', icon: '🔹', rarity: 'Rare', isFragment: true, completesInto: 'evo-stone', description: 'A shard of an Evolution Stone. Collect 5 and they automatically assemble into a complete stone.' },
    { id: 'rebirth-stone', label: 'Rebirth Stone', icon: '🌟', rarity: 'Legendary', description: 'An exceptionally rare catalyst - guarantees a bee evolves straight to Legendary, no matter its current rarity.' },
    { id: 'drill-hands', label: 'Drill Hands', icon: '🪛', rarity: 'Common', description: "A pair of nanite drills - chance to grant the Breach trait, letting a bee punch through defenses and raid an enemy hive." },
    { id: 'nanite-bolt', label: 'Nanite Bolt', icon: '🔩', rarity: 'Common', description: 'A spare structural bolt from the nanite forges - chance to grant a random mechanical trait.' }
];

// Drill Hands/Nanite Bolt are the everyday finds; Evolution Stone
// Fragments are less impactful individually (5 needed for a usable
// stone) so they drop a bit more often than a complete stone used to;
// the Rebirth Stone is the single rarest drop in the whole game - a
// guaranteed straight-to-Legendary jump on ANY bee, so it's gated hard.
const EVOLUTION_ITEM_DROP_TABLE = [
    { id: 'nanite-bolt', weight: 50 },
    { id: 'drill-hands', weight: 40 },
    { id: 'evo-stone-fragment', weight: 9 },
    { id: 'rebirth-stone', weight: 1 }
];

function rollEvolutionItemDrop() {
    const totalWeight = EVOLUTION_ITEM_DROP_TABLE.reduce((sum, i) => sum + i.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of EVOLUTION_ITEM_DROP_TABLE) {
        if (roll < entry.weight) return entry.id;
        roll -= entry.weight;
    }
    return EVOLUTION_ITEM_DROP_TABLE[0].id;
}

// Chance an Evolution Item drops at all alongside a quest's material loot
// (see _awardLootOnQuestCompletion below) - deliberately much lower than
// COLLECTOR_DROP_CHANCE since these are meant to feel like a real find,
// not a routine drop.
const EVOLUTION_ITEM_DROP_CHANCE = 0.15;

// Persistent, cosmetic-for-now traits a bee can carry (bee.traits[]) -
// granted by applyTraitItem below. drill-hands always grants 'breach'
// specifically (redacted's own example: drill hands -> breaching an enemy
// hive); nanite-bolt is the generic "bolts and screws matter too" item
// and grants a random one instead of a fixed one.
// The 17 store-item traits below (brawler..insight) are deliberately
// listed here too (not just on STORE_ITEM_CATALOG's own `trait` field) so
// rollRandomTraitKey() - used by nanite-bolt's random-trait roll - can
// hand out any of them, not just the original three. A nanite-bolt find
// stays a genuine surprise even after the store exists.
const BEE_TRAITS = {
    breach: { label: 'Breach', icon: '🪛', description: 'A pair of drill-tipped limbs, built to punch through defenses and breach an enemy hive.' },
    reinforced: { label: 'Reinforced', icon: '🔩', description: 'Bolted and braced with spare nanite plating - shrugs off more than it should.' },
    overclocked: { label: 'Overclocked', icon: '⚡', description: 'Running hotter than spec - faster and twitchier, occasionally unstable.' },
    brawler: { label: 'Brawler', icon: '🥊', description: 'Throws its whole weight into every hit.' },
    rebound: { label: 'Rebound', icon: '🪀', description: 'Snaps back into position before anything can land a hit.' },
    rally: { label: 'Rally', icon: '📢', description: 'Its buzz alone rattles the whole swarm into formation.' },
    shaker: { label: 'Shaker', icon: '🪇', description: 'An unnerving rhythm that throws off anything nearby.' },
    unlocked: { label: 'Unlocked', icon: '🗝️', description: "Finds a way through locks and seals that should've held." },
    tinkerer: { label: 'Tinkerer', icon: '🔧', description: 'Always mid-repair, patching itself back together between fights.' },
    mutant: { label: 'Mutant', icon: '🧬', description: 'Its nanite code keeps rewriting itself in strange, unpredictable directions.' },
    restraint: { label: 'Restraint', icon: '⛓️', description: 'Wraps a target down before it even has a chance to react.' },
    unbound: { label: 'Unbound', icon: '⛓️‍💥', description: 'Snapped its own leash a long time ago - answers to nothing now.' },
    marksman: { label: 'Marksman', icon: '🏹', description: "Never wastes a shot on a target it can't hit." },
    duelist: { label: 'Duelist', icon: '⚔️', description: 'Built for a one-on-one fight, and it shows.' },
    backstab: { label: 'Backstab', icon: '🗡️', description: 'Strikes exactly where it hurts most, and exactly once.' },
    ricochet: { label: 'Ricochet', icon: '🪃', description: "An attack that comes back around whether you're ready for it or not." },
    undertaker: { label: 'Undertaker', icon: '⚰️', description: 'Calm in a way that should probably worry you.' },
    charged: { label: 'Charged', icon: '🔋', description: 'Runs hot and never seems to slow down.' },
    overdrawn: { label: 'Overdrawn', icon: '🪫', description: 'Running on fumes, somehow still standing.' },
    insight: { label: 'Bright Idea', icon: '💡', description: "Always the first to spot an opening everyone else missed." }
};
const BEE_TRAIT_KEYS = Object.keys(BEE_TRAITS);

function rollRandomTraitKey() {
    return BEE_TRAIT_KEYS[Math.floor(Math.random() * BEE_TRAIT_KEYS.length)];
}

// Only drill-hands has a fixed, thematically-specific trait - everything
// else granted through applyTraitItem falls back to a random roll.
const ITEM_TRAIT_MAP = {
    'drill-hands': 'breach'
};

// evolveBee/applyTraitItem below - both spend the item regardless of
// outcome. Both stones' effects are GUARANTEED (100%) - per redacted's explicit
// call, the risk lives entirely in how rare each stone is to find (see
// their weights in EVOLUTION_ITEM_DROP_TABLE above), not in whether using
// one actually works. Trait items keep their own real per-use chance
// instead, since they're a much more common drop.
const TRAIT_GRANT_CHANCE = 0.35;

// --- HONEY STORE -----------------------------------------------------
// Purchased (not dropped) items - priced in the same materials Collector
// bees/quests/level-ups already earn (see purchaseStoreItem below), so
// the store is a real sink for that economy rather than a new separate
// currency. Bought items land in the exact same state.inventory.items
// pool a random Evolution Item drop would, and are applied to a bee from
// the same roster UI (see bee-card.js) - purchase vs. drop is just how
// you GOT the item, not a different kind of item once you own it.
//
// Two kinds:
// - 'trait' (17 items, one per emoji redacted picked): works on ANY bee that
//   isn't already a Named Beast. Always rolls a chance at its trait
//   (TRAIT_GRANT_CHANCE); ADDITIONALLY, if the bee is still Common or
//   Rare, also rolls a chance (STORE_EVOLVE_TO_EPIC_CHANCE) to bump it
//   straight to Epic. See applyStoreItem below.
// - 'identity' (the Identity Card): a single, much pricier item that
//   GUARANTEES a bee becomes a full Named Beast - see evolveToNamed
//   below for its "excludes bees you've already personally renamed" rule.
const STORE_ITEM_CATALOG = [
    { id: 'boxing-glove', label: 'Boxing Glove', icon: '🥊', kind: 'trait', rarity: 'Rare', trait: 'brawler', price: { materialId: 'pollen', amount: 4 }, description: 'Grants the Brawler trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'yo-yo', label: 'Yo-Yo', icon: '🪀', kind: 'trait', rarity: 'Rare', trait: 'rebound', price: { materialId: 'pollen', amount: 4 }, description: 'Grants the Rebound trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'megaphone', label: 'Megaphone', icon: '📢', kind: 'trait', rarity: 'Rare', trait: 'rally', price: { materialId: 'pollen', amount: 5 }, description: 'Grants the Rally trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'maracas', label: 'Maracas', icon: '🪇', kind: 'trait', rarity: 'Rare', trait: 'shaker', price: { materialId: 'pollen', amount: 3 }, description: 'Grants the Shaker trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'key', label: 'Key', icon: '🗝️', kind: 'trait', rarity: 'Rare', trait: 'unlocked', price: { materialId: 'honey-drop', amount: 1 }, description: 'Grants the Unlocked trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'wrench', label: 'Wrench', icon: '🔧', kind: 'trait', rarity: 'Rare', trait: 'tinkerer', price: { materialId: 'pollen', amount: 5 }, description: 'Grants the Tinkerer trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'dna-helix', label: 'DNA Helix', icon: '🧬', kind: 'trait', rarity: 'Rare', trait: 'mutant', price: { materialId: 'honey-drop', amount: 3 }, description: 'Grants the Mutant trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'chain', label: 'Chain', icon: '⛓️', kind: 'trait', rarity: 'Rare', trait: 'restraint', price: { materialId: 'pollen', amount: 6 }, description: 'Grants the Restraint trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'broken-chain', label: 'Broken Chain', icon: '⛓️‍💥', kind: 'trait', rarity: 'Rare', trait: 'unbound', price: { materialId: 'honey-drop', amount: 2 }, description: 'Grants the Unbound trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'bow', label: 'Bow', icon: '🏹', kind: 'trait', rarity: 'Rare', trait: 'marksman', price: { materialId: 'pollen', amount: 5 }, description: 'Grants the Marksman trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'crossed-swords', label: 'Crossed Swords', icon: '⚔️', kind: 'trait', rarity: 'Rare', trait: 'duelist', price: { materialId: 'pollen', amount: 6 }, description: 'Grants the Duelist trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'dagger', label: 'Dagger', icon: '🗡️', kind: 'trait', rarity: 'Rare', trait: 'backstab', price: { materialId: 'honey-drop', amount: 1 }, description: 'Grants the Backstab trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'boomerang', label: 'Boomerang', icon: '🪃', kind: 'trait', rarity: 'Rare', trait: 'ricochet', price: { materialId: 'pollen', amount: 5 }, description: 'Grants the Ricochet trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'coffin', label: 'Coffin', icon: '⚰️', kind: 'trait', rarity: 'Rare', trait: 'undertaker', price: { materialId: 'royal-nectar', amount: 1 }, description: 'Grants the Undertaker trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'battery-full', label: 'Battery', icon: '🔋', kind: 'trait', rarity: 'Rare', trait: 'charged', price: { materialId: 'pollen', amount: 5 }, description: 'Grants the Charged trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'battery-low', label: 'Dead Battery', icon: '🪫', kind: 'trait', rarity: 'Rare', trait: 'overdrawn', price: { materialId: 'pollen', amount: 3 }, description: 'Grants the Overdrawn trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'lightbulb', label: 'Lightbulb', icon: '💡', kind: 'trait', rarity: 'Rare', trait: 'insight', price: { materialId: 'pollen', amount: 4 }, description: 'Grants the Bright Idea trait - plus a chance to evolve a Common/Rare bee to Epic.' },
    { id: 'identity-card', label: 'Identity Card', icon: '🪪', kind: 'identity', rarity: 'Legendary', price: { materialId: 'royal-nectar', amount: 3 }, description: "Guarantees a bee evolves straight into a full Named Beast. Only works on a bee you haven't personally renamed." }
];

// Your real skill tree - a base feature, not a plugin. Flat catalog with
// parentId edges (instead of hardcoded nested markup like the old Codex
// project this was ported from) so skills.js can render it recursively and
// new skills can just be appended here later. defaultUnlocked seeds
// state.skills the first time a given id is ever seen (see
// _ensureSkillTreeData below) - after that, state.skills is the source of
// truth and this catalog is only consulted for name/icon/description/
// prerequisite, the same "catalog = meaning, Vault state = your progress"
// split used everywhere else (materials, plugins, etc.).
const SKILL_TREE_CATALOG = [
    { id: 'codex-architect', parentId: null, name: 'Codex Architect', icon: '🧑🏾‍💼', description: 'The Core System. Current Status: Level 5 Web Developer. Ready for React integration.', defaultUnlocked: true },

    { id: 'semantic-html', parentId: 'codex-architect', name: 'Semantic HTML Fluency', icon: '🧱', description: 'Mastery of meaningful HTML tags (header, nav, main) for better accessibility and SEO.', defaultUnlocked: true },
    { id: 'modular-repo', parentId: 'semantic-html', name: 'Modular Repo Scaffolding', icon: '🏗️', description: 'Ability to set up clean, scalable project structures with organized folder hierarchies.', defaultUnlocked: true },
    { id: 'github-pages', parentId: 'modular-repo', name: 'GitHub Pages Deployment', icon: '🚀', description: 'Pipeline established for publishing live projects directly to the web for recruiter access.', defaultUnlocked: true },

    { id: 'css-fundamentals', parentId: 'codex-architect', name: 'CSS Fundamentals', icon: '🎨', description: 'The visual styling engine. Control over colors, typography, and the box model.', defaultUnlocked: true },
    { id: 'responsive-design', parentId: 'css-fundamentals', name: 'Responsive Design', icon: '📱', description: 'Ensuring layouts adapt fluidly to mobile, tablet, and desktop screens.', defaultUnlocked: true },
    { id: 'flexbox-grid', parentId: 'css-fundamentals', name: 'Flexbox/Grid', icon: '📐', description: 'Advanced layout modules for controlling complex positioning and alignment.', defaultUnlocked: true },

    { id: 'js-essentials', parentId: 'codex-architect', name: 'JavaScript Essentials', icon: '🧠', description: 'The logic layer. Variables, functions, loops, and data types.', defaultUnlocked: true },
    { id: 'dom-manipulation', parentId: 'js-essentials', name: 'DOM Manipulation', icon: '⚡', description: 'Ability to use JS to target HTML elements and change them dynamically.', defaultUnlocked: true },
    { id: 'react-fundamentals', parentId: 'js-essentials', name: 'React Fundamentals', icon: '⚛️', description: 'Component-based UI architecture. The ability to build reusable, state-driven interfaces.', defaultUnlocked: true }
];

// The chance a Common/Rare bee jumps to Epic when a 'trait' store item is
// applied to it - separate from (and in addition to) TRAIT_GRANT_CHANCE
// above, since the item always attempts the trait roll regardless of
// rarity, but only attempts THIS roll when there's actually room to climb.
const STORE_EVOLVE_TO_EPIC_CHANCE = 0.4;

// Whole days between two YYYY-MM-DD (or ISO) date strings - the finest
// grain Quest's dateStarted/dateCompleted actually store, so "fast" is
// measured in days, not hours/minutes. Clamped to a 0 floor since a
// same-day completion should never read as negative.
function daysBetween(startISO, endISO) {
    if (!startISO || !endISO) return null;
    const start = new Date(startISO);
    const end = new Date(endISO);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    return Math.max(0, Math.round((end - start) / MS_PER_DAY));
}

// Quest-completion loot scaling (see _awardLootOnQuestCompletion below):
// 1 material roll per QUEST_LOOT_DP_DIVISOR of the quest's total DP
// (minimum 1), plus a speed bonus for finishing fast - same-day earns the
// biggest bonus, within a few days still earns a smaller one.
const QUEST_LOOT_DP_DIVISOR = 100;
const QUEST_SPEED_INSTANT_DAYS = 0;
const QUEST_SPEED_INSTANT_BONUS_ROLLS = 2;
const QUEST_SPEED_FAST_DAYS = 2;
const QUEST_SPEED_FAST_BONUS_ROLLS = 1;

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
// elements redacted named. Rolled uniformly (no rarity weighting, unlike
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

// --- KEEPERDEX ---------------------------------------------------------
// A pure reference/collection-tracker catalog for the KeeperDex page
// (src/features/keeperdex/) - NOT a live bee. Every individual bee is
// otherwise randomly rolled (rarity, element, stats, weight - see
// rollBeeRarity/rollBeeElement/rollBeeStats/rollBeeWeight above) with no
// fixed identity to browse, so there's no real "species list" the way a
// real Pokedex has exactly 1010. Rarity x Element is the closest thing
// this game has to one: 5 rarities x 4 elements = 20 fixed entries, each
// with a real color theme (rarity) and a real weakness (element,
// BEE_ELEMENT_WEAKNESS above) so every field on the card has genuine
// data behind it instead of being invented per entry.
//
// skills are flavor-only (no gameplay effect, nothing reads these) -
// name/power modeled after a real trading card's move list. 2 per
// element for every rarity, plus a 3rd rarity-flavored "signature" move
// on Epic/Legendary/Named so the higher tiers read as a genuine step up
// on the card itself, not just a different border color.
const KEEPERDEX_ELEMENT_SKILLS = {
    fire: [{ name: 'Ember Sting', power: 10 }, { name: 'Wax Melt', power: 20 }],
    water: [{ name: 'Dew Drop', power: 10 }, { name: 'Cool Mist', power: 20 }],
    earth: [{ name: 'Root Bind', power: 10 }, { name: 'Pollen Dust', power: 20 }],
    wind: [{ name: 'Gale Buzz', power: 10 }, { name: 'Tailwind', power: 20 }]
};

const KEEPERDEX_RARITY_SIGNATURE_SKILL = {
    Epic: { name: 'Overdrive Buzz', power: 35 },
    Legendary: { name: 'Radiant Sting', power: 50 },
    Named: { name: 'Unbound Fury', power: 65 }
};

// Reused verbatim from BEE_ARCHETYPES' element-based entries (bee-card.js)
// so the flavor text reads identically wherever a fire/water/earth/wind
// bee shows up, whether that's an owned bee's own card or its dex entry.
const KEEPERDEX_ELEMENT_FLAVOR = {
    fire: { title: 'Pyron', description: "A bee pyromaniac, helplessly drawn to heat and sparks it really shouldn't touch." },
    water: { title: 'Dewzzer', description: 'Never far from morning dew - calm, cool, and quick to slip away.' },
    earth: { title: 'Loambuzz', description: 'Thick-shelled and grounded, most at home nose-deep in soil.' },
    wind: { title: 'Gustwing', description: 'Rides every gust like it was born mid-flight, never quite landing.' }
};

// Fixed order/numbering: rarity-major (BEE_RARITIES' own order), element
// minor (BEE_ELEMENTS' own order) - 001-004 Common, 005-008 Rare, 009-012
// Epic, 013-016 Legendary, 017-020 Named. dexNumber is this array's own
// index+1, permanently fixed by position - unrelated to bee.dexNumber
// elsewhere, which is per-owned-bee collection order, not a species id.
const KEEPERDEX_ENTRIES = (() => {
    const entries = [];
    BEE_RARITIES.forEach(rarityInfo => {
        BEE_ELEMENT_KEYS.forEach(element => {
            const flavor = KEEPERDEX_ELEMENT_FLAVOR[element];
            const skills = [...KEEPERDEX_ELEMENT_SKILLS[element]];
            const signature = KEEPERDEX_RARITY_SIGNATURE_SKILL[rarityInfo.rarity];
            if (signature) skills.push(signature);

            entries.push({
                dexNumber: entries.length + 1,
                rarity: rarityInfo.rarity,
                element,
                name: `${rarityInfo.rarity} ${BEE_ELEMENTS[element].label} Bee`,
                species: flavor.title,
                description: flavor.description,
                skills,
                // Single hook the Models page (src/features/models/) and,
                // eventually, BeeCard/KeeperDexCard all read from - today
                // ready is always false so every consumer falls back to
                // the flat NanoBee art, same "groundwork now" spirit as
                // BEE_ELEMENTS/BEE_CLASSES above. The moment a real
                // rotatable asset exists for a given rarity+element pair,
                // filling in asset (and flipping ready) here is the only
                // change needed - no consumer's own code has to change to
                // start using it.
                model: { ready: false, asset: null }
            });
        });
    });
    return entries;
})();

// An entry counts as obtained the moment you've ever owned a bee matching
// its exact rarity+element pair - "ever owned," not "currently own,"
// since Refine/combine can consume a bee later without that un-revealing
// an entry you already saw. Kept here, next to the catalog it reads
// against, same "catalog = meaning, Vault state = your progress" split as
// everything else in this file.
function isKeeperDexEntryObtained(entry, bees) {
    return bees.some(bee => bee.rarity === entry.rarity && bee.element === entry.element);
}

// Date.now() alone isn't collision-safe for bee ids - _syncLevelUpBees can
// award several bees in one tight synchronous loop (catching a save file
// up several levels at once), which can land multiple awardBee() calls in
// the same millisecond and produce duplicate ids. Every bee-lookup
// feature (rename, class-assign, destroy, combine) depends on ids being
// unique, so this appends a short random suffix on top of the timestamp.
// --- Onboarding: the egg gift (EGG_ORIGIN_STORY_SPEC.md) -----------------
// Every save gets state.onboarding the first time it loads after this
// shipped - new AND existing players (Craft's launch call, 2026-10-08):
// the egg is "a gift from the developer". Until it hatches (stage 'done'),
// _onboardingGate() sends every page except onboarding/settings/account
// pages to src/features/onboarding/. The page itself owns all the stage
// logic; Vault only stores the record and does the final hand-off
// (completeOnboarding: royal bee + starter habits).
const ONBOARDING_STARTER_HABITS = [
    { label: 'Read a motivational quote', notes: "Don't go into the day without a plan. A quote makes you stop, think it through and prepare." },
    { label: 'Walk 1,000 feet', notes: 'Walking loosens your muscles and keeps you healthy.' },
    { label: 'Stretch for 3 minutes', notes: 'A full stretch wakes you up, keeps you flexible and lowers your risk of injury.' }
];
// Pages that stay reachable while the egg is being raised.
const ONBOARDING_OPEN_PAGES = ['/onboarding/', '/settings/', '/account-info/', '/account-security/'];

// The dock tabs unlock one by one while the egg grows (2026-10-09):
// Habits (egg), To-Dos (larva), Dailies then Quests (while sealed). Each
// tab's real pages open up once it's unlocked, and each has a short
// tutorial that's checked against what you actually do on those pages.
const ONBOARDING_TAB_ORDER = ['habits', 'todos', 'dailies', 'quests'];
const ONBOARDING_TAB_PATHS = {
    habits: ['/features/habits/'],
    todos: ['/features/todos/'],
    dailies: ['/features/dailies/'],
    quests: ['/features/quests/']
};
const ONBOARDING_STEPS = {
    habits: [
        { key: 'make', title: 'Make your own habit', why: 'Pick something small you want to do more of.' },
        { key: 'plus', title: 'Tap + on your habit when you do it', why: 'Each + on your own habit gives the egg energy.' },
        { key: 'bad', title: 'Add a bad habit you want to break', why: 'Be honest. If it slips in, tap −. It drains a little energy. Reality waits on no one.' }
    ],
    todos: [
        { key: 'add', title: 'Add your first To-Do', why: "Get it out of your head. Once it's written down, you don't have to keep remembering it." },
        { key: 'due', title: 'Give a To-Do a due date', why: "A due date turns 'someday' into a plan." },
        { key: 'steps', title: 'Break a To-Do into a checklist', why: 'Big jobs feel smaller one step at a time.' },
        { key: 'check', title: 'Check off a To-Do', why: 'Finishing feels good. It feeds the larva too.' }
    ],
    dailies: [
        { key: 'add', title: 'Make a daily', why: 'Something you do on set days. It resets every morning, so each day is a fresh start.' },
        { key: 'days', title: 'Choose the days it repeats', why: 'Not every day? Pick the days, or every few days. It only shows up when it counts.' },
        { key: 'check', title: 'Check off a daily today', why: 'Do it, tap the hexagon. Day after day, that builds a streak.' }
    ],
    quests: [
        { key: 'make', title: 'Start a quest with 2 or more tasks', why: "A quest is a long-term goal, too big for one day. Break it into steps you can finish." },
        { key: 'focus', title: 'Put a quest in focus 🎯', why: 'Your focused quest sits on top of Quests and on Home, so you always know the next step.' },
        { key: 'check', title: 'Check off a quest task', why: 'Every task you finish moves the whole goal forward.' }
    ]
};

function freshOnboardingRecord() {
    return {
        stage: 'gift',               // gift -> egg -> larva -> pupa -> ready -> hatched -> done
        seed: 1 + Math.floor(Math.random() * 2147483000),   // the egg's design (EggDesign seed)
        startedAt: new Date().toISOString(),
        completedAt: null,
        energy: 0,
        step: 'quiet',
        bonded: false,
        taps: 0,
        quote: null,
        done: {},                    // starter habits: tap / quote / walk / stretch
        tut: {},                     // Habits tutorial quests
        ltut: {},                    // To-Dos tutorial quests
        unlocked: false,             // Habits unlocked (after habit 2)
        plusLog: {},                 // habitId -> { date, count } (energy cap per day)
        todoChecks: { date: null, count: 0 },
        crackTaps: 0,
        readyTaps: 0,
        pupaEnd: null,
        royal: null,                 // 'queen' | 'king'
        name: ''
    };
}

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
// Hoisted so computeCharacterLevelBandState below can walk the exact same
// curve computeLevelProgress uses, instead of a second copy that could
// quietly drift out of sync with it.
const CHARACTER_LEVEL_BASE_THRESHOLD = 150;
const CHARACTER_LEVEL_GROWTH_RATE = 1.15;

function computeLevelProgress(totalDP) {
    let level = 1;
    let threshold = CHARACTER_LEVEL_BASE_THRESHOLD;
    let remaining = totalDP;

    while (remaining >= threshold) {
        remaining -= threshold;
        level += 1;
        threshold = Math.round(threshold * CHARACTER_LEVEL_GROWTH_RATE);
    }

    return { level, currentXP: remaining, nextLevelXP: threshold };
}

// Same curve as computeLevelProgress, but reports progress relative to a
// specific `acknowledgedLevel` rather than whatever the live totalDP works
// out to - the character-level bar (Home/Profile) is gated exactly like
// Skill Mastery: it can run ahead in real totalDP, but the bar and its
// rewards only advance one level at a time, on purpose, via
// levelUpCharacterBar() (see the Vault class below).
function computeCharacterLevelBandState(totalDP, acknowledgedLevel) {
    const level = acknowledgedLevel || 1;
    let threshold = CHARACTER_LEVEL_BASE_THRESHOLD;
    let cumulativeDP = 0;

    for (let lvl = 1; lvl < level; lvl++) {
        cumulativeDP += threshold;
        threshold = Math.round(threshold * CHARACTER_LEVEL_GROWTH_RATE);
    }
    // threshold is now this level's own cap (DP needed to clear it);
    // cumulativeDP is the total DP required to have already reached `level`.

    const dpIntoLevel = Math.min(threshold, Math.max(0, totalDP - cumulativeDP));

    return {
        level,
        dpIntoLevel,
        cap: threshold,
        percentage: Math.min(100, (dpIntoLevel / threshold) * 100),
        maxed: totalDP >= cumulativeDP + threshold
    };
}

class DatabaseManager {
    constructor() {
        this.dbName = 'BizzybeeVault';
        this.storageKey = 'bizzybee_user_data';
        // Dev test save (src/core/dev-tools/dev-tools.js): a separate save
        // under its own key that never syncs to the cloud, so the dev panel
        // can never touch your real save. app.js skips Cloud Sync and folder
        // backup while it's on.
        this.devTest = localStorage.getItem('bizzybee_dev_test') === '1';
        if (this.devTest) {
            this.storageKey = 'bizzybee_user_data:devtest';
        } else if (localStorage.getItem('bizzybee_session') === 'identity' && localStorage.getItem('bizzybee_cloud_owner')) {
            this.storageKey += ':' + localStorage.getItem('bizzybee_cloud_owner');
            if (!localStorage.getItem('bizzybee_legacy_owner')) localStorage.setItem('bizzybee_legacy_owner', localStorage.getItem('bizzybee_cloud_owner'));
        }
        this.state = null;
    }

    // 1. Boot up the database
    init() {
        if (this._initPromise) return this._initPromise;
        if (this.state) return Promise.resolve(this.state);
        this._initPromise = this._initialize().finally(() => { this._initPromise = null; });
        return this._initPromise;
    }

    // A device with no local data under the current storage key looks
    // identical whether it's a genuinely new account OR a signed-in
    // account's real save just isn't cached here yet (first login on this
    // device/browser, or local storage got cleared) - see HANDOFF.md's
    // data-loss writeup. This is the synchronous, no-network check that
    // decides whether it's even worth trying a recovery pull: true only
    // when this device is currently signed into a cloud identity.
    _looksLikeExistingCloudAccount() {
        if (this.devTest) return false;
        return localStorage.getItem('bizzybee_session') === 'identity' && !!localStorage.getItem('bizzybee_cloud_owner');
    }

    // Best-effort only, by design: this runs before cloud-sync.js may even
    // be loaded yet (it's injected dynamically, later, by app.js), so it
    // talks to the same load-state Function directly rather than waiting
    // on that module. Any failure here (network, no session yet, the
    // Identity widget not ready) just returns false and the caller falls
    // back to Blueprint exactly as before - this only ever adds a recovery
    // attempt, never blocks startup on one. On success it also stamps the
    // revision cloud-sync.js's own reconciliation expects to find (see
    // that file's revisionKey()), so it recognizes the save as already
    // up to date instead of re-importing and reloading a second time.
    async _tryRecoverFromCloud() {
        try {
            if (typeof netlifyIdentity === 'undefined' || typeof fetch === 'undefined') return false;
            const user = netlifyIdentity.currentUser();
            if (!user) return false;
            const token = await user.jwt();
            const response = await fetch('/.netlify/functions/load-state', {
                method: 'GET', cache: 'no-store',
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(15000)
            });
            const result = await response.json();
            if (!response.ok || !result.ok || !result.data) return false;
            const imported = this.importFullState(result.data, { fromCloud: true });
            if (!imported.ok) return false;
            localStorage.setItem(this.storageKey + ':revision', JSON.stringify(result.revision ?? null));
            return true;
        } catch {
            return false;
        }
    }

    async _initialize() {
        await this.refreshLocalCloudDownload();
        const existingData = localStorage.getItem(this.storageKey);
        let parsed;
        try { parsed = existingData ? JSON.parse(existingData) : null; }
        catch { throw new Error('Your saved data could not be read. It has been preserved; recover a backup in Settings.'); }
        if (existingData !== null) this.validateFullState(parsed);

        if (parsed) {
            this.validateFullState(parsed);
            const migrated = parsed.schemaVersion !== VAULT_SCHEMA_VERSION;
            if (migrated) {
                this.createLocalBackup('Before schema upgrade');
                parsed.schemaVersion = VAULT_SCHEMA_VERSION;
            }
            console.log("Vault: Local data found. Loading state...");
            this.state = parsed;
            if (migrated) this.save();
        } else {
            console.log("Vault: No local data found.");
            const recovered = this._looksLikeExistingCloudAccount() && await this._tryRecoverFromCloud();
            if (recovered) {
                console.log("Vault: Recovered existing save from the cloud - skipped a blank reseed.");
            } else {
                console.log("Vault: Fetching Blueprint...");
                await this.loadBlueprint();
            }
        }
        // Catches up level-up bee rewards to the current level every time
        // the app loads - covers both normal play AND a save file that
        // already reached its current level before this reward (or a
        // formula change to it) existed. No-ops once caught up.
        this._syncLevelUpBees();
        // Backfills state.plugins onto any save from before the plugin
        // toggle system existed - no-ops once it's there.
        this._ensurePluginData();
        // Backfills bee.stats/weight/dexNumber onto any bee that predates
        // these fields (see rollBeeStats/rollBeeWeight above) - no-ops
        // once every bee already has them.
        this._ensureBeeCardData();
        // Backfills state.skills onto any save from before the Skill Tree
        // existed, AND tops up any save that predates a newly-added skill
        // in SKILL_TREE_CATALOG - no-ops once every catalog id is present.
        this._ensureSkillTreeData();
        // Backfills notes/checklist/startDate/repeats/reminders/tags onto
        // any daily task saved before the Create/Edit Daily page existed -
        // repeats defaults to 'daily' (due every day), so nothing about an
        // existing daily's behavior changes just by picking up this field.
        this._ensureDailyTaskScheduleData();
        // Gives every save the egg gift record once (new and existing
        // players alike) - no-ops after that. See freshOnboardingRecord.
        this._ensureOnboardingData();
        // One-time sort of an old Habitica import into the right tabs.
        this._sortHabiticaImports();
        // Backfills state.dictionary onto any save from before the
        // Dictionary feature existed - no-ops once it's there.
        if (!this.state.dictionary) {
            this.state.dictionary = [];
            this.save();
        }
        // Seeds DICTIONARY_STARTER_TERMS exactly once per save (gated on
        // dictionarySeeded, not on the dictionary array being empty) - so
        // the Skill Mastery Matrix has real categories from the start
        // instead of sitting at zero until you manually add a term, but
        // deliberately deleting a starter term later doesn't bring it back.
        if (!this.state.dictionarySeeded) {
            DICTIONARY_STARTER_TERMS.forEach(starter => {
                const alreadyExists = this.state.dictionary.some(t => t.name.toLowerCase() === starter.name.toLowerCase());
                if (alreadyExists) return;
                this.state.dictionary.push({
                    id: `term-seed-${starter.name.toLowerCase()}`,
                    name: starter.name,
                    definition: starter.definition,
                    category: starter.category,
                    createdAt: new Date().toISOString()
                });
            });
            this.state.dictionarySeeded = true;
            this.save();
        }
        // Backfills state.skillLevels onto any save from before per-skill
        // leveling existed - no-ops once it's there. Lazily defaults any
        // category not yet in this object to level 1 (see
        // computeSkillLevelState above), so this only ever needs an entry
        // once a skill has actually been leveled up at least once.
        if (!this.state.skillLevels) {
            this.state.skillLevels = {};
            this.save();
        }
        // Backfills state.studyQueue onto any save from before the Study
        // plugin existed - no-ops once it's there. Same reasoning as the
        // dictionary backfill above.
        if (!this.state.studyQueue) {
            this.state.studyQueue = [];
            this.save();
        }
        this._onboardingGate();
        return this.state;
    }

    // A downloaded full save is applied once on localhost, before normal
    // blueprint/backfill logic. Subsequent local edits survive every reload.
    async refreshLocalCloudDownload() {
        if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
            || localStorage.getItem('bizzybee_session') === 'identity' || this.devTest) return;
        const nested = /\/(features|plugins)\//.test(window.location.pathname);
        let response;
        try { response = await fetch(`${nested ? '../../..' : '.'}/src/core/data.personal.json`, { cache: 'no-store' }); }
        catch { return; } // Offline: continue using the existing browser save.
        if (!response.ok) return;
        const state = await response.json();
        const id = state?._localCloudTransfer?.id;
        if (typeof id !== 'string' || !id) return; // Ordinary blueprints stay ordinary blueprints.
        const markerKey = this.storageKey + ':local-cloud-transfer';
        if (localStorage.getItem(markerKey) === id) return;
        this.validateFullState(state);
        state.blueprintSource = 'personal';
        const previousMarker = localStorage.getItem(markerKey);
        // Persist the marker first; rollback if the import cannot be installed.
        localStorage.setItem(markerKey, id);
        const imported = this.importFullState(JSON.stringify(state), { fromCloud: true });
        if (!imported.ok) {
            if (previousMarker === null) localStorage.removeItem(markerKey);
            else localStorage.setItem(markerKey, previousMarker);
            throw new Error(imported.error);
        }
        this.state = null; // Continue initialization with the full imported save.
    }

    // Fetches the active blueprint (personal-first, generic-fallback).
    // Shared by loadBlueprint() (overwrite) and syncFromBlueprint() (merge).
    async fetchBlueprint() {
        // Pages under src/features/*/ AND src/plugins/*/ are both two
        // levels deep; the root index.html (the login page - see
        // HANDOFF.md §12) is not, and never calls fetchBlueprint itself,
        // but Vault.init() runs on every page including this one.
        const path = window.location.pathname;
        const rootPrefix = (path.includes('features') || path.includes('plugins')) ? '../../..' : '.';

        // Stamps which file actually won (blueprintSource: 'personal' | 'generic')
        // onto the returned blueprint - the login backdoor (login.js) checks this
        // via getBlueprintSource() to know whether this device already has your
        // real data locally, or needs you to import a save file first.
        try {
            const personalResponse = localStorage.getItem('bizzybee_session') === 'identity'
                ? null : await fetch(`${rootPrefix}/src/core/data.personal.json`);
            if (personalResponse?.ok) {
                const data = await personalResponse.json();
                data.blueprintSource = 'personal';
                return data;
            }
        } catch (error) {
            // No personal blueprint on this machine - fall through to the generic one.
        }

        const response = await fetch(`${rootPrefix}/src/core/data.json`);
        if (!response.ok) throw new Error('Could not load the starter data. Your existing save has not been replaced.');
        const data = await response.json();
        data.blueprintSource = 'generic';
        return data;
    }

    // 2. Overwrite: used when starting fresh, or by a full Reset.
    // data.personal.json is gitignored - if it exists (your own machine), it wins.
    // Everyone else silently falls back to the generic data.json.
    async loadBlueprint() {
        const previousState = this.state;
        try {
            this.state = await this.fetchBlueprint();
            this.validateFullState(this.state);
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
                    element: rollBeeElement(),
                    customNamed: false
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
            // syncFromBlueprint. `items` (Evolution Items) is the same idea
            // as `materials`, just a second, rarer loot pool - see
            // EVOLUTION_ITEM_CATALOG above. `fragments` tracks partial
            // progress toward a fragment-based item (see FRAGMENTS_REQUIRED/
            // _addFragment above/below) - separate bucket since a fragment
            // isn't a usable item until it's assembled into one.
            this.state.inventory = { materials: {}, items: {}, fragments: {} };
            // Which optional plugins (see PLUGIN_CATALOG in plugins.js) the
            // user has switched on - a local setting, not blueprint
            // content, same reasoning as colony/inventory above. Keyed by
            // plugin id -> boolean. Only plugins.js knows what a given id
            // actually IS or whether it's currently available to toggle at
            // all (see PLUGIN_CATALOG's 'coming-soon' status) - db.js just
            // stores the raw on/off state.
            this.state.plugins = {};
            // User-created Calendar plugin entries (src/plugins/calendar/) -
            // genuinely new content the user types in, not derived from
            // anything else, so (unlike the quest/daily completion dates
            // the Calendar page also displays) this has to be its own
            // stored list. See getCalendarEvents/addCalendarEvent below.
            this.state.calendarEvents = [];
            // Dictionary terms - see getDictionaryTerms/addDictionaryTerm
            // below. Local content, same reasoning as calendarEvents above.
            this.state.dictionary = [];
            // Study plugin (src/plugins/study/) - a running queue of
            // courses/topics being worked through, same shape as the old
            // Codex tracker's studyQueue: {id, topic, type, priority,
            // status, link}. Ships empty - real content only ever comes
            // from you adding it through the Study page, same "local
            // content, not blueprint content" reasoning as calendarEvents/
            // dictionary above.
            this.state.studyQueue = [];
            // Habits (core feature, src/features/habits/) - Habitica-style +/-
            // action buttons, own top-level array like dailyTasks (not
            // nested under studyQueue's shape - a habit's `history` log is
            // its own thing, see computeHabitDP/bumpHabit). Ships empty,
            // same "local content, only ever comes from adding it through
            // the page" reasoning as studyQueue above.
            this.state.habits = [];
            // To-Dos (core feature, src/features/todos/) - one-off tasks, same
            // shape family as dailyTasks (title/notes/checklist/
            // difficulty/dp/tags/reminders) minus a repeat schedule, plus
            // a due date and a `completed`/`completedDate` pair instead of
            // completedDates. Ships empty, same reasoning as habits above.
            this.state.todos = [];
            // Skill Tree progress - id -> unlocked boolean, seeded from
            // SKILL_TREE_CATALOG's defaultUnlocked on a fresh save. Same
            // "local setting, not blueprint content" reasoning as plugins/
            // calendarEvents above (see _ensureSkillTreeData for how an
            // EXISTING save picks up new skills added to the catalog later).
            this.state.skills = {};
            SKILL_TREE_CATALOG.forEach(skill => {
                this.state.skills[skill.id] = skill.defaultUnlocked;
            });
            this.save();
            console.log("Vault: Blueprint loaded and secured.");
        } catch (error) {
            this.state = previousState;
            console.error("Vault Error: Could not load blueprint.", error);
            throw error;
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
        // localStorage wins for completion history AND every field you can
        // only set from inside the app itself (notes/checklist/schedule/
        // reminders/tags) - none of that lives in the blueprint file, so
        // losing it on every sync would be a silent data-loss bug.
        const existingDailyTasks = this.state.dailyTasks || [];
        this.state.dailyTasks = (blueprint.dailyTasks || []).map(blueprintTask => {
            const existingTask = existingDailyTasks.find(t => t.id === blueprintTask.id);
            return {
                ...blueprintTask,
                completedDates: existingTask ? existingTask.completedDates : [],
                notes: existingTask ? existingTask.notes : '',
                checklist: existingTask ? existingTask.checklist : [],
                startDate: existingTask ? existingTask.startDate : todayISO(),
                repeats: existingTask ? existingTask.repeats : { type: 'daily', every: 1, daysOfWeek: [] },
                reminders: existingTask ? existingTask.reminders : [],
                tags: existingTask ? existingTask.tags : []
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
        this.createLocalBackup('Before reset');
        await this.loadBlueprint();
        return this.state;
    }

    // 3. Save current state to the browser
    save() {
        if (this.state) {
            try {
                // Stamped on every real mutation that goes through this method -
                // NOT touched by importFullState() below, which writes straight
                // to localStorage and never calls save(), so a cloud pull or a
                // Full Save Transfer import correctly inherits the timestamp the
                // source device already stamped on it, rather than this device
                // claiming "just now" for data it didn't actually author. This
                // is what Settings' Cloud-vs-Local comparison reads to tell you
                // which copy is actually newer (see getLastLocalUpdate() below).
                this.state.updatedAt = new Date().toISOString();
                localStorage.setItem(this.storageKey + ':dirty', 'true');
                localStorage.setItem(this.storageKey, JSON.stringify(this.state));
                window.dispatchEvent(new Event('vault-saved'));
            } catch (error) {
                if (typeof Toast !== 'undefined') Toast.show('Could not save on this device. Export your progress before closing this page.', 'negative');
                throw error;
            }
        }
    }

    // When this device's own local data was last actually changed (not when
    // it was last synced/backed up - see the comment in save() above). null
    // for a save made before this field existed; the next real change stamps
    // it going forward, same backfill-by-next-write pattern this project
    // already uses for every other additive field.
    getLastLocalUpdate() {
        return this.state?.updatedAt || null;
    }

    validateFullState(parsed) {
        const object = value => value && typeof value === 'object' && !Array.isArray(value);
        if (!object(parsed) || !object(parsed.user) || !Array.isArray(parsed.quests)) throw new Error('That is not a Bizzybee save file.');
        if (parsed.schemaVersion != null && (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion > VAULT_SCHEMA_VERSION || parsed.schemaVersion < 1)) throw new Error('This save uses an unsupported schema version. Update the app before importing it.');
        for (const field of ['dailyTasks', 'habits', 'todos', 'dictionary', 'studyQueue', 'calendarEvents']) {
            if (parsed[field] != null && !Array.isArray(parsed[field])) throw new Error(`Invalid ${field} in save.`);
        }
        for (const quest of parsed.quests) {
            if (!object(quest) || typeof quest.id !== 'string' || !Array.isArray(quest.tasks)) throw new Error('Invalid quest in save.');
            for (const task of quest.tasks) if (!object(task) || typeof task.dp !== 'number' || !Number.isFinite(task.dp)) throw new Error('Invalid task points in save.');
        }
        return parsed;
    }

    getLocalBackups() {
        return JSON.parse(localStorage.getItem(this.storageKey + ':backups') || '[]');
    }

    removeLocalBackup(id) {
        localStorage.setItem(this.storageKey + ':backups', JSON.stringify(this.getLocalBackups().filter(item => item.id !== id)));
    }

    createLocalBackup(reason = 'Manual backup') {
        const data = localStorage.getItem(this.storageKey);
        if (!data) return;
        const entries = this.getLocalBackups();
        entries.unshift({ id: Date.now().toString(), createdAt: new Date().toISOString(), reason, data });
        try { localStorage.setItem(this.storageKey + ':backups', JSON.stringify(entries.slice(0, 3))); }
        catch { throw new Error('Not enough storage for a recovery copy. Export and remove older device backups to free space, then retry.'); }
    }

    // 4. Getters
    getUser() {
        if (!this.state) return null;

        const totalDP = computeTotalDP(this.state.quests)
            + computeDailyDP(this.state.dailyTasks)
            + computeHabitDP(this.state.habits)
            + computeTodoDP(this.state.todos);
        const { level, currentXP, nextLevelXP } = computeLevelProgress(totalDP);

        return {
            ...this.state.user,
            // The name you gave while raising your egg wins over the
            // blueprint's placeholder ("Worker Bee").
            name: this.state.displayName || (this.state.user && this.state.user.name),
            totalDP,
            level,
            currentXP,
            nextLevelXP
        };
    }

    getQuests() {
        return this.state ? (this.state.quests || []) : [];
    }

    // Which blueprint actually loaded this state - 'personal' means
    // data.personal.json was found on this machine (your own dev box, or a
    // device that's already had a full-state save imported onto it, since
    // that import overwrites this.state wholesale - see importFullState
    // below). 'generic' means data.json (the public/demo content). The
    // login backdoor (login.js) checks this to decide whether a device
    // already has your real data or still needs a save file imported.
    getBlueprintSource() {
        return this.state ? (this.state.blueprintSource || 'generic') : 'generic';
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
        if (!wasQuestCompleted && quest.status === 'completed') {
            this._awardQuestTicketIfSignificant(quest);
            this._awardLootOnQuestCompletion(quest);
        }
        return quest;
    }

    // Tops up level-up bee/ticket/material rewards (see beesForLevel above)
    // to match the character level bar's ACKNOWLEDGED level - not the live
    // level. Character leveling is gated exactly like Skill Mastery now
    // (see computeCharacterLevelBandState above and levelUpCharacterBar
    // below): totalDP can run ahead, but nothing is actually granted until
    // levelUpCharacterBar() advances acknowledgedLevel, which is the only
    // thing that changes the `level` this function syncs against. Still
    // called on every init() and after anything that can change DP
    // (toggleTask/toggleDailyTask) as a defensive catch-up - it's a no-op
    // in the normal case since acknowledgedLevel doesn't move on its own,
    // but it's what backfills characterLevelBar itself on an existing save
    // (see the defensive init below) and would re-sync state if it were
    // ever nudged out of alignment. Purely additive - never removes
    // bees/tickets, never touches gacha pulls, ticket unwraps, or the
    // starter bee.
    //
    // Pass { silent: true } to suppress its own toasts - used by
    // levelUpCharacterBar() below, which presents the same reward through
    // the shared celebration modal instead, so the two don't double-notify
    // for the same grant. Returns what was actually granted this call
    // (empty arrays/0 if nothing was due) so the caller can build that
    // celebration payload without having to separately diff state.
    _syncLevelUpBees({ silent } = {}) {
        if (!this.state) return { awardedBees: [], ticketsGranted: 0, awardedMaterials: [] };
        if (!this.state.colony) this.state.colony = { bees: [], levelUpBeesAwarded: 0, tickets: 0, ticketsAwarded: 0 };
        if (typeof this.state.colony.levelUpBeesAwarded !== 'number') this.state.colony.levelUpBeesAwarded = 0;
        if (typeof this.state.colony.tickets !== 'number') this.state.colony.tickets = 0;
        if (typeof this.state.colony.ticketsAwarded !== 'number') this.state.colony.ticketsAwarded = 0;
        if (typeof this.state.colony.materialsAwardedForLevels !== 'number') this.state.colony.materialsAwardedForLevels = 0;
        // First time this runs on a given save, the character level bar
        // starts ACKNOWLEDGED at the current live level - not level 1 -
        // since everything up to here has already been silently granted
        // by this same function in the past (before the gate existed).
        // Only levels reached from this point forward go through the new
        // press-to-claim ritual.
        if (!this.state.characterLevelBar) {
            this.state.characterLevelBar = { acknowledgedLevel: this.getUser().level, leveledUpAt: null };
        }

        const level = this.state.characterLevelBar.acknowledgedLevel;

        let expectedBees = 0;
        for (let lvl = 2; lvl <= level; lvl++) expectedBees += beesForLevel(lvl);
        const beeDeficit = expectedBees - this.state.colony.levelUpBeesAwarded;

        // 1 ticket per level-up - simpler cadence than the escalating bee
        // formula since tickets are the rarer, higher-stakes currency.
        const expectedTickets = Math.max(0, level - 1);
        const ticketDeficit = expectedTickets - this.state.colony.ticketsAwarded;

        // 1 material roll per level-up too - flat, unlike the escalating
        // bee formula, since this is meant to be a small steady trickle
        // rather than the main reward for leveling.
        const expectedMaterialRolls = Math.max(0, level - 1);
        const materialDeficit = expectedMaterialRolls - this.state.colony.materialsAwardedForLevels;

        if (beeDeficit <= 0 && ticketDeficit <= 0 && materialDeficit <= 0) {
            return { awardedBees: [], ticketsGranted: 0, awardedMaterials: [] };
        }

        const awardedBees = [];
        if (beeDeficit > 0) {
            for (let i = 0; i < beeDeficit; i++) awardedBees.push(this.awardBee('levelup'));
            this.state.colony.levelUpBeesAwarded = expectedBees;
        }

        if (ticketDeficit > 0) {
            this.state.colony.tickets += ticketDeficit;
            this.state.colony.ticketsAwarded = expectedTickets;
        }

        const awardedMaterials = [];
        if (materialDeficit > 0) {
            if (!this.state.inventory) this.state.inventory = { materials: {}, items: {} };
            if (!this.state.inventory.materials) this.state.inventory.materials = {};
            for (let i = 0; i < materialDeficit; i++) {
                const materialId = rollMaterialDrop();
                this.state.inventory.materials[materialId] = (this.state.inventory.materials[materialId] || 0) + 1;
                awardedMaterials.push(materialId);
            }
            this.state.colony.materialsAwardedForLevels = expectedMaterialRolls;
        }

        this.save();

        if (!silent && typeof Toast !== 'undefined') {
            if (awardedBees.length > 0) {
                const label = awardedBees.length === 1 ? awardedBees[0].name : `${awardedBees.length} bees`;
                Toast.show(`🐝 ${label} joined your colony!`, 'positive');
            }
            if (ticketDeficit > 0) {
                Toast.show(`🎟️ ${ticketDeficit === 1 ? 'A gacha ticket' : `${ticketDeficit} gacha tickets`} earned from leveling up!`, 'positive');
            }
            if (awardedMaterials.length > 0) {
                Toast.show(`🌼 ${awardedMaterials.length} material${awardedMaterials.length === 1 ? '' : 's'} earned from leveling up!`, 'positive');
            }
        }

        return { awardedBees, ticketsGranted: ticketDeficit > 0 ? ticketDeficit : 0, awardedMaterials };
    }

    // Breaks the seal on the character level bar (see
    // computeCharacterLevelBandState above) - the Home/Profile bar's
    // press-to-claim counterpart to levelUpSkill(). Guards on the bar
    // actually being maxed, bumps acknowledgedLevel by exactly one, then
    // runs _syncLevelUpBees (silently) to grant whatever that specific
    // level is worth and reports it back for the shared celebration modal.
    levelUpCharacterBar() {
        if (!this.state) return null;
        if (!this.state.characterLevelBar) {
            this.state.characterLevelBar = { acknowledgedLevel: this.getUser().level, leveledUpAt: null };
        }

        const totalDP = this.getUser().totalDP;
        const bandState = computeCharacterLevelBandState(totalDP, this.state.characterLevelBar.acknowledgedLevel);
        if (!bandState.maxed) return null;

        this.state.characterLevelBar.acknowledgedLevel += 1;
        this.state.characterLevelBar.leveledUpAt = new Date().toISOString();
        this.save();

        const { awardedBees, ticketsGranted, awardedMaterials } = this._syncLevelUpBees({ silent: true });

        return {
            newLevel: this.state.characterLevelBar.acknowledgedLevel,
            awardedBees,
            ticketsGranted,
            awardedMaterials
        };
    }

    // The Home/Profile character-level bar reads this directly - same
    // pre-merged shape as getSkillMatrix() (level/dpIntoLevel/cap/
    // percentage/maxed), just for the one character-level band instead of
    // a whole matrix of skill categories.
    getCharacterLevelBar() {
        if (!this.state) return null;
        if (!this.state.characterLevelBar) {
            this.state.characterLevelBar = { acknowledgedLevel: this.getUser().level, leveledUpAt: null };
            this.save();
        }
        return computeCharacterLevelBandState(this.getUser().totalDP, this.state.characterLevelBar.acknowledgedLevel);
    }

    // Backfills state.plugins onto any save from before the plugin toggle
    // system existed - no-ops once it's there. Same additive philosophy
    // as _ensureBeeCardData below, just at the top level.
    _ensurePluginData() {
        if (!this.state) return;
        let changed = false;
        if (!this.state.plugins) {
            this.state.plugins = {};
            changed = true;
        }
        if (!this.state.calendarEvents) {
            this.state.calendarEvents = [];
            changed = true;
        }
        if (!this.state.habits) {
            this.state.habits = [];
            changed = true;
        }
        if (!this.state.todos) {
            this.state.todos = [];
            changed = true;
        }
        // Habits and To-Dos ship switched ON by default - an explicit
        // "already installed" ask, unlike every other optional plugin
        // (Calendar, Study, ...) which starts off until you flip it on
        // yourself in Plugin Hub. Gated on its own one-time flag rather
        // than on state.plugins.habits/todos being falsy, so deliberately
        // uninstalling either later in Plugin Hub never gets silently
        // re-installed the next time the app loads.
        if (!this.state.habitsTodosDefaultInstalled) {
            this.state.plugins.habits = true;
            this.state.plugins.todos = true;
            this.state.habitsTodosDefaultInstalled = true;
            changed = true;
        }
        if (changed) this.save();
    }

    // Same additive/backfill pattern as _ensurePluginData - covers both a
    // save from before the Skill Tree existed at all (state.skills missing
    // entirely) AND a save that predates a skill added to the catalog
    // later (that one id missing from an otherwise-populated state.skills).
    _ensureSkillTreeData() {
        if (!this.state) return;
        if (!this.state.skills) this.state.skills = {};
        let changed = !this.state.skills || false;
        SKILL_TREE_CATALOG.forEach(skill => {
            if (typeof this.state.skills[skill.id] !== 'boolean') {
                this.state.skills[skill.id] = skill.defaultUnlocked;
                changed = true;
            }
        });
        if (changed) this.save();
    }

    // Same additive/backfill pattern as _ensurePluginData/_ensureSkillTreeData
    // - covers both a save from before the Create/Edit Daily page existed
    // (these fields missing entirely) and a fresh blueprint-authored daily
    // task (which only ever ships label/dp/difficulty, never these).
    _ensureDailyTaskScheduleData() {
        if (!this.state) return;
        let changed = false;
        const today = todayISO();

        (this.state.dailyTasks || []).forEach(task => {
            if (typeof task.notes !== 'string') { task.notes = ''; changed = true; }
            if (!Array.isArray(task.checklist)) { task.checklist = []; changed = true; }
            if (!task.startDate) { task.startDate = today; changed = true; }
            if (!task.repeats) { task.repeats = { type: 'daily', every: 1, daysOfWeek: [] }; changed = true; }
            if (!Array.isArray(task.reminders)) { task.reminders = []; changed = true; }
            if (!Array.isArray(task.tags)) { task.tags = []; changed = true; }
        });

        if (changed) this.save();
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

        // Backfills the fragments bucket onto any save from before the
        // fragment system existed - same additive philosophy as the rest
        // of this method, just at the inventory level instead of per-bee.
        if (this.state.inventory && !this.state.inventory.fragments) {
            this.state.inventory.fragments = {};
            changed = true;
        }

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
            if (bee.rarity !== 'Royal' && (!bee.element || !BEE_ELEMENTS[bee.element])) {
                bee.element = rollBeeElement();
                changed = true;
            }
            if (typeof bee.customNamed !== 'boolean') {
                // Can't know retroactively whether a pre-existing bee's
                // current name was auto-generated or something redacted typed
                // in before this flag existed - defaults to false (not
                // custom-named). Worst case on an old save: the Identity
                // Card becomes usable on a bee he'd already personally
                // renamed pre-this-feature - a one-time grandfather-clause
                // gap, not an ongoing exploit (still costs a real item).
                bee.customNamed = false;
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
    // accomplish a great deal," per redacted's own framing, not every quest.
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

    // Awards material (and, on a smaller chance, Evolution Item) loot
    // every time ANY quest transitions into completed - unlike the ticket
    // above, this isn't gated behind a DP threshold, just SCALED by it:
    // bigger quests drop more material rolls (QUEST_LOOT_DP_DIVISOR), and
    // finishing fast (days between dateStarted/dateCompleted - the finest
    // grain a quest actually tracks) adds bonus rolls on top. This runs
    // alongside (not instead of) any Collector-bee drops that already
    // fired per-task along the way - a fresh, real "you did a whole
    // quest" payout, not a replacement for the ambient trickle.
    _awardLootOnQuestCompletion(quest) {
        if (!this.state) return;
        if (!this.state.inventory) this.state.inventory = { materials: {}, items: {}, fragments: {} };
        if (!this.state.inventory.materials) this.state.inventory.materials = {};
        if (!this.state.inventory.items) this.state.inventory.items = {};
        if (!this.state.inventory.fragments) this.state.inventory.fragments = {};

        const totalDP = (quest.tasks || []).reduce((sum, t) => sum + t.dp, 0);
        const baseRolls = Math.max(1, Math.floor(totalDP / QUEST_LOOT_DP_DIVISOR));

        const daysElapsed = daysBetween(quest.dateStarted, quest.dateCompleted);
        let speedBonusRolls = 0;
        if (daysElapsed !== null) {
            if (daysElapsed <= QUEST_SPEED_INSTANT_DAYS) speedBonusRolls = QUEST_SPEED_INSTANT_BONUS_ROLLS;
            else if (daysElapsed <= QUEST_SPEED_FAST_DAYS) speedBonusRolls = QUEST_SPEED_FAST_BONUS_ROLLS;
        }

        const totalRolls = baseRolls + speedBonusRolls;
        const materialsDropped = [];
        for (let i = 0; i < totalRolls; i++) {
            const materialId = rollMaterialDrop();
            this.state.inventory.materials[materialId] = (this.state.inventory.materials[materialId] || 0) + 1;
            materialsDropped.push(materialId);
        }

        const itemsDropped = [];
        const fragmentsDropped = [];
        if (Math.random() < EVOLUTION_ITEM_DROP_CHANCE) {
            const rolledId = rollEvolutionItemDrop();
            const rolledEntry = EVOLUTION_ITEM_CATALOG.find(i => i.id === rolledId);

            if (rolledEntry && rolledEntry.isFragment) {
                const { assembled, completesInto } = this._addFragment(rolledId);
                fragmentsDropped.push(rolledId);
                for (let i = 0; i < assembled; i++) itemsDropped.push(completesInto);
            } else {
                this.state.inventory.items[rolledId] = (this.state.inventory.items[rolledId] || 0) + 1;
                itemsDropped.push(rolledId);
            }
        }

        this.save();

        if (typeof Toast !== 'undefined') {
            const materialLabel = materialsDropped.length === 1 ? '1 material' : `${materialsDropped.length} materials`;
            const speedNote = speedBonusRolls > 0 ? ' (speed bonus!)' : '';
            Toast.show(`🌼 ${materialLabel} from "${quest.title}"${speedNote}`, 'positive');

            fragmentsDropped.forEach(fragmentId => {
                const item = EVOLUTION_ITEM_CATALOG.find(i => i.id === fragmentId);
                const label = item ? `${item.icon} ${item.label}` : fragmentId;
                const progress = item ? (this.state.inventory.fragments[fragmentId] || 0) : 0;
                Toast.show(`🔹 Found a ${label}! (${progress}/${FRAGMENTS_REQUIRED})`, 'positive');
            });

            itemsDropped.forEach(itemId => {
                const item = EVOLUTION_ITEM_CATALOG.find(i => i.id === itemId);
                const label = item ? `${item.icon} ${item.label}` : itemId;
                Toast.show(`✨ Rare find: ${label}!`, 'positive');
            });
        }

        return { materialsDropped, itemsDropped, fragmentsDropped, speedBonusRolls };
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

    // 5m. Logic: Ghost Logs - a quest's optional "Interactive Intel" sub-list
    // (ported from the old Codex tracker's per-quest challenge table).
    // Distinct from the main task checklist: a task is binary complete/
    // incomplete, but a Ghost Log entry can sit at partial credit - status
    // is one of 'pending' | 'red' | 'yellow' | 'green' (attempted / partial /
    // full), each carrying its own dp value the author set for that entry
    // (not auto-scaled from a "full" value - see computeTotalDP above for
    // how a non-pending entry's dp counts toward the live total, same as a
    // completed task). Optional field, absent entirely on quests that don't
    // use it - nothing renders or breaks for those.
    getGhostLogs(questId) {
        const quest = (this.state && this.state.quests || []).find(q => q.id === questId);
        return quest ? (quest.ghostLogs || []) : [];
    }

    addGhostLog(questId, { name, dp }) {
        if (!this.state) return null;
        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest) return null;
        if (!quest.ghostLogs) quest.ghostLogs = [];

        const entry = {
            id: `${questId.toLowerCase()}-gl${Date.now()}`,
            name: name || 'Untitled Challenge',
            status: 'pending',
            dp: Number(dp) || 0,
            dateCompleted: null
        };
        quest.ghostLogs.push(entry);
        this.save();
        return entry;
    }

    // Cycles (or directly sets, if `status` is passed) an entry's status.
    // Stamps dateCompleted the moment it leaves 'pending', clears it if it's
    // set back to 'pending' - same "only stamp on a real transition" pattern
    // as _updateQuestCompletionState uses for a whole quest.
    updateGhostLogStatus(questId, entryId, status) {
        if (!this.state) return null;
        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest || !quest.ghostLogs) return null;

        const entry = quest.ghostLogs.find(g => g.id === entryId);
        if (!entry) return null;

        const validStatuses = ['pending', 'red', 'yellow', 'green'];
        if (!validStatuses.includes(status)) return null;

        entry.status = status;
        entry.dateCompleted = status === 'pending' ? null : (entry.dateCompleted || todayISO());

        this.save();
        this._syncLevelUpBees();
        return entry;
    }

    removeGhostLog(questId, entryId) {
        if (!this.state) return false;
        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest || !quest.ghostLogs) return false;

        const before = quest.ghostLogs.length;
        quest.ghostLogs = quest.ghostLogs.filter(g => g.id !== entryId);
        const removed = quest.ghostLogs.length < before;
        if (removed) this.save();
        return removed;
    }

    // 5n. Logic: Side Quest back-links. A main quest optionally lists its
    // own related side quests via `sideQuestIds` (an array of quest ids,
    // hand-authored the same way repoTask/quizChallenge/patchNotes are -
    // via Dev Edit or a future Eevee-generated quest). The reverse
    // direction (a side quest showing "part of: X") is deliberately NOT a
    // second stored field - it's derived live by scanning for whichever
    // quest (if any) lists this id in ITS sideQuestIds, same "live, not a
    // ledger" reasoning as everything else in this file: two quests can
    // never disagree about the relationship since there's only one copy of
    // the fact to begin with.
    getSideQuestsFor(questId) {
        const quest = (this.state && this.state.quests || []).find(q => q.id === questId);
        if (!quest || !Array.isArray(quest.sideQuestIds)) return [];

        return quest.sideQuestIds
            .map(id => (this.state.quests || []).find(q => q.id === id))
            .filter(Boolean);
    }

    getParentQuestFor(questId) {
        return (this.state && this.state.quests || [])
            .find(q => Array.isArray(q.sideQuestIds) && q.sideQuestIds.includes(questId)) || null;
    }

    // 5o. Logic: Codex Unlocks - named ability/title unlocks tied to a
    // specific quest (ported from the old Codex tracker's "Codex Unlocks"
    // table). Optional per-quest field: codexUnlocks: [{id, title, ability,
    // dateEarned, skillNodeId}]. dateEarned is null until claimed - this is
    // a deliberate manual "press a button to claim" action (claimCodexUnlock
    // below), same gated-claim ritual as skill/character leveling, rather
    // than the app trying to auto-detect a real-world moment like "first
    // successful DOM event listener" it has no way to observe. skillNodeId
    // is optional - if set and it matches a real SKILL_TREE_CATALOG id,
    // claiming this unlock ALSO unlocks that Skill Tree node via the
    // existing unlockSkill() (so a Codex Unlock can be the reason a tree
    // node opens up, not just a separate parallel achievement list).
    getCodexUnlocks(questId) {
        const quest = (this.state && this.state.quests || []).find(q => q.id === questId);
        return quest ? (quest.codexUnlocks || []) : [];
    }

    claimCodexUnlock(questId, unlockId) {
        if (!this.state) return null;
        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest || !quest.codexUnlocks) return null;

        const unlock = quest.codexUnlocks.find(u => u.id === unlockId);
        if (!unlock || unlock.dateEarned) return null; // already claimed, or doesn't exist

        unlock.dateEarned = todayISO();

        let skillUnlocked = null;
        if (unlock.skillNodeId) {
            skillUnlocked = this.unlockSkill(unlock.skillNodeId);
        }

        this.save();
        return { unlock, skillUnlocked };
    }

    // 5p. Logic: which Dictionary terms are actually relevant to a given
    // quest - reuses the exact same matching pass the Skill Mastery matrix
    // runs (textContainsTerm against title/objective/every task label), so
    // "relevant to this quest" always means the same thing in both places.
    // Built for the Quest Detail screen's "Related Terms" button: rather
    // than embedding full definitions inline (the old Codex tracker's
    // per-quest glossary got long and repetitive), this just hands back
    // which terms matched so the UI can link out to the real Dictionary
    // entry instead.
    getQuestRelatedTerms(questId) {
        const quest = (this.state && this.state.quests || []).find(q => q.id === questId);
        if (!quest) return [];

        const dictionaryTerms = this.state.dictionary || [];
        const haystack = `${quest.title || ''} ${quest.objective || ''} ${(quest.tasks || []).map(t => t.label || '').join(' ')}`;

        return dictionaryTerms.filter(term => term.name && textContainsTerm(haystack, term.name));
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

    // 5e1. Logic: permanently remove a whole quest/campaign. Unlike task/
    // Ghost Log removal (which just trims part of a quest that still
    // exists), this deletes the whole thing - there's no undo beyond a
    // device or cloud backup, so callers must confirm with the user first.
    // A stale sideQuestIds reference to the removed quest is left in place
    // deliberately: getSideQuestsFor()/getParentQuestFor() already filter
    // out ids that no longer resolve, so it just quietly stops showing up.
    // Create / Edit Quest form (2026-10-09). Saves title, objective,
    // category, source and the task list in one go. Existing tasks are
    // matched by id so their completed state, dates, links and relevance
    // are kept; new rows become new tasks; rows left out are removed.
    // Everything else on the quest (ghost logs, side quests, codex
    // unlocks, repo task...) is left alone. Returns the quest.
    saveQuestForm(questId, { title, objective, category, source, tasks, makeActive }) {
        if (!this.state) return null;
        if (!this.state.quests) this.state.quests = [];
        const stamp = Date.now();
        let quest = questId ? this.state.quests.find(q => q.id === questId) : null;
        if (!quest) {
            quest = {
                id: `QUEST-${stamp}`,
                category: 'main',
                status: 'active',
                title: '',
                objective: '',
                queensDecree: '',
                source: null,
                dateStarted: todayISO(),
                dateCompleted: null,
                tasks: []
            };
            this.state.quests.push(quest);
        }
        const old = quest.tasks || [];
        quest.title = title;
        quest.objective = objective || '';
        quest.category = category === 'side' ? 'side' : 'main';
        quest.source = source && source.url ? { label: source.label || source.url, url: source.url } : null;
        quest.tasks = (tasks || []).map((row, index) => {
            const prev = row.id && old.find(t => t.id === row.id);
            if (prev) return { ...prev, label: row.label, difficulty: row.difficulty || null, dp: Number(row.dp) || 0 };
            return {
                id: `${quest.id.toLowerCase()}-t${stamp}-${index}`,
                label: row.label,
                dp: Number(row.dp) || 0,
                completed: false,
                dateCompleted: null,
                link: null,
                difficulty: row.difficulty || null
            };
        });
        if (quest.tasks.length) this._updateQuestCompletionState(quest);
        if (makeActive) this.state.activeQuestId = quest.id;
        this.save();
        return quest;
    }

    removeQuest(questId) {
        if (!this.state) return false;

        const quests = this.state.quests || [];
        const before = quests.length;
        this.state.quests = quests.filter(q => q.id !== questId);
        const removed = this.state.quests.length < before;
        if (!removed) return false;

        // Don't leave the active-quest pointer dangling on a quest that no
        // longer exists - Home/Quests already treat a missing match as
        // "no active quest selected" so this is safe to just clear.
        if (this.state.activeQuestId === questId) this.state.activeQuestId = null;

        this.save();
        return true;
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
        const dexNumber = this.getColonyBees().filter(b => b.rarity !== 'Royal').length + 1;
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
            element: rollBeeElement(),
            customNamed: false
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
        // Flags this bee as user-named - the Identity Card store item
        // (evolveToNamed below) explicitly excludes these, per redacted's own
        // rule, so it can't be used to "steal" a name-worthy moment from
        // a bee you already personally named.
        bee.customNamed = true;
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
            dexNumber: this.getColonyBees().filter(b => b.rarity !== 'Royal').length + 1,
            element: rollBeeElement(),
            // Named Beasts from a ticket already have a generated themed
            // name (rollNamedBeeName above), but that's not a CUSTOM name
            // redacted picked - starts false like every other bee, same rule.
            customNamed: false
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

    // Evolution Items - see EVOLUTION_ITEM_CATALOG above. Same shape as
    // getMaterials(): keyed by item id -> count owned. Fragments (partial
    // progress toward a fragment-based item) are NOT included here - see
    // getFragments() below, a separate bucket since a fragment isn't a
    // usable item until _addFragment() assembles it into one.
    getItems() {
        return this.state && this.state.inventory ? (this.state.inventory.items || {}) : {};
    }

    // Fragment progress - see FRAGMENTS_REQUIRED/_addFragment. Keyed by
    // the COMPLETE item's id (e.g. 'evo-stone'), not the fragment
    // catalog id, so the UI can show "3 / 5" against the item it's
    // building toward.
    getFragments() {
        return this.state && this.state.inventory ? (this.state.inventory.fragments || {}) : {};
    }

    // Skill Tree - see SKILL_TREE_CATALOG above for name/icon/description/
    // parentId per skill; this only ever tracks the unlocked boolean.
    // Returns the catalog merged with live unlocked state, ready for
    // skills.js to render without it needing to touch state.skills itself.
    getSkillTree() {
        const skills = this.state ? (this.state.skills || {}) : {};
        return SKILL_TREE_CATALOG.map(entry => ({
            ...entry,
            unlocked: !!skills[entry.id]
        }));
    }

    isSkillUnlocked(skillId) {
        return this.state && this.state.skills ? !!this.state.skills[skillId] : false;
    }

    // Unlocks a skill - but only if it isn't already unlocked, and (unless
    // it's a root with no parentId) only if its prerequisite is unlocked
    // first. Returns the catalog entry on success, or null if the skill id
    // doesn't exist or its prerequisite still blocks it - skills.js uses
    // that null to know when NOT to show an unlock button at all.
    unlockSkill(skillId) {
        if (!this.state) return null;
        const entry = SKILL_TREE_CATALOG.find(s => s.id === skillId);
        if (!entry) return null;
        if (!this.state.skills) this.state.skills = {};
        if (this.state.skills[skillId]) return entry;
        if (entry.parentId && !this.state.skills[entry.parentId]) return null;

        this.state.skills[skillId] = true;
        this.save();
        return entry;
    }

    // Plugin toggle state - see PLUGIN_CATALOG in plugins.js for what a
    // given id actually means and whether it's currently available to
    // toggle at all. db.js only stores the raw on/off flag, keyed by
    // plugin id -> boolean; a missing key reads as "not enabled" (false),
    // same undefined-is-falsy convention as the rest of the Vault.
    getPlugins() {
        return this.state ? (this.state.plugins || {}) : {};
    }

    isPluginEnabled(pluginId) {
        return !!this.getPlugins()[pluginId];
    }

    // Sets a plugin's raw on/off flag and persists it. Deliberately does
    // NOT check PLUGIN_CATALOG's status here - that "is this actually
    // available yet" gate belongs to plugins.js's Plugins.toggle(), which
    // calls this only after confirming the plugin isn't 'coming-soon'.
    // Keeping the check out of db.js is the same "core stores state,
    // features own meaning" split as everything else in this file.
    setPluginEnabled(pluginId, enabled) {
        if (!this.state) return null;
        if (!this.state.plugins) this.state.plugins = {};
        this.state.plugins[pluginId] = !!enabled;
        this.save();
        return this.state.plugins[pluginId];
    }

    // Shared by evolveBee/applyTraitItem below - spends `count` of an
    // Evolution Item if you own enough, otherwise fails without touching
    // state. Not exposed publicly; both callers need the "consume, then
    // roll an outcome" order kept atomic-ish (consume first so a bee never
    // ends up "charged" without the item actually leaving the inventory).
    _consumeItem(itemId, count) {
        if (!this.state || !this.state.inventory || !this.state.inventory.items) return false;
        const owned = this.state.inventory.items[itemId] || 0;
        if (owned < count) return false;

        this.state.inventory.items[itemId] = owned - count;
        return true;
    }

    // Adds one fragment of a fragment-catalog entry (e.g.
    // 'evo-stone-fragment') and auto-assembles it into the complete item
    // (entry.completesInto) every time the count reaches FRAGMENTS_REQUIRED -
    // no separate "combine" action needed, it just happens as fragments
    // come in. Returns how many complete items were assembled this call
    // (almost always 0 or 1, but a save-file catch-up or lucky multi-drop
    // could in principle carry over more than one at once).
    _addFragment(fragmentId) {
        if (!this.state || !this.state.inventory) return { assembled: 0, completesInto: null };
        const entry = EVOLUTION_ITEM_CATALOG.find(i => i.id === fragmentId && i.isFragment);
        if (!entry) return { assembled: 0, completesInto: null };

        if (!this.state.inventory.fragments) this.state.inventory.fragments = {};
        if (!this.state.inventory.items) this.state.inventory.items = {};

        this.state.inventory.fragments[fragmentId] = (this.state.inventory.fragments[fragmentId] || 0) + 1;

        let assembled = 0;
        while (this.state.inventory.fragments[fragmentId] >= FRAGMENTS_REQUIRED) {
            this.state.inventory.fragments[fragmentId] -= FRAGMENTS_REQUIRED;
            this.state.inventory.items[entry.completesInto] = (this.state.inventory.items[entry.completesInto] || 0) + 1;
            assembled += 1;
        }

        return { assembled, completesInto: entry.completesInto };
    }

    // Consumes an Evolution Stone (bumps a bee up exactly ONE rarity tier,
    // e.g. Common -> Rare) or a Rebirth Stone (jumps a bee straight to
    // Legendary regardless of its current tier) - both GUARANTEED, per
    // redacted's explicit call the risk lives entirely in how rare each stone
    // is to find (see EVOLUTION_ITEM_DROP_TABLE above), not in whether
    // using one actually works. Keeps the bee's identity (id/name/
    // dexNumber/obtainedAt/class/element) intact; only rarity/stats/weight
    // change, since it's still the same individual bee, just evolved.
    // Works on any bee that isn't already Legendary (nothing to gain) or
    // Named (index -1 in RARITY_ORDER, tops out beyond either stone's
    // reach) - returns null on an ineligible rarity/item/missing bee.
    evolveBee(beeId, itemId) {
        if (!this.state || !this.state.colony) return null;
        if (itemId !== 'evo-stone' && itemId !== 'rebirth-stone') return null;

        const bee = (this.state.colony.bees || []).find(b => b.id === beeId);
        if (!bee) return null;

        const rarityIndex = RARITY_ORDER.indexOf(bee.rarity);
        if (rarityIndex === -1 || bee.rarity === 'Legendary') return null;
        if (!this._consumeItem(itemId, 1)) return null;

        const newRarity = itemId === 'rebirth-stone' ? 'Legendary' : RARITY_ORDER[rarityIndex + 1];
        bee.rarity = newRarity;
        bee.stats = rollBeeStats(newRarity);
        bee.weight = rollBeeWeight(newRarity);

        this.save();
        return { bee, newRarity };
    }

    // Consumes drill-hands or a nanite-bolt on an Epic+ bee for a chance
    // (TRAIT_GRANT_CHANCE) at a persistent trait (BEE_TRAITS above),
    // stored on bee.traits[]. drill-hands always grants Breach
    // specifically (ITEM_TRAIT_MAP); a nanite-bolt rolls a random one.
    // The item is spent either way. Returns null on an ineligible
    // rarity/item/missing bee.
    applyTraitItem(beeId, itemId) {
        if (!this.state || !this.state.colony) return null;
        if (itemId === 'evo-stone' || itemId === 'rebirth-stone' || itemId === 'evo-stone-fragment') return null; // wrong item for this action

        const bee = (this.state.colony.bees || []).find(b => b.id === beeId);
        if (!bee) return null;

        const eligibleRarities = ['Epic', 'Legendary', 'Named'];
        if (!eligibleRarities.includes(bee.rarity)) return null;
        if (!this._consumeItem(itemId, 1)) return null;

        const succeeded = Math.random() < TRAIT_GRANT_CHANCE;
        let traitKey = null;
        if (succeeded) {
            traitKey = ITEM_TRAIT_MAP[itemId] || rollRandomTraitKey();
            if (!bee.traits) bee.traits = [];
            if (!bee.traits.includes(traitKey)) bee.traits.push(traitKey);
        }

        this.save();
        return { bee, succeeded, traitKey };
    }

    // Spends materials on a Honey Store item - see STORE_ITEM_CATALOG
    // above for the catalog/prices. Purchased items land in the same
    // state.inventory.items pool a random Evolution Item drop would (see
    // getItems()), so they're applied to a bee the exact same way.
    // Returns null on an unknown item or insufficient materials -
    // doesn't touch state either way if it can't afford it.
    purchaseStoreItem(itemId) {
        if (!this.state) return null;
        const item = STORE_ITEM_CATALOG.find(i => i.id === itemId);
        if (!item) return null;

        if (!this.state.inventory) this.state.inventory = { materials: {}, items: {} };
        if (!this.state.inventory.materials) this.state.inventory.materials = {};
        if (!this.state.inventory.items) this.state.inventory.items = {};

        const { materialId, amount } = item.price;
        const owned = this.state.inventory.materials[materialId] || 0;
        if (owned < amount) return null;

        this.state.inventory.materials[materialId] = owned - amount;
        this.state.inventory.items[itemId] = (this.state.inventory.items[itemId] || 0) + 1;

        this.save();
        return { item };
    }

    // Applies a 'trait' kind Honey Store item (see STORE_ITEM_CATALOG) -
    // unlike applyTraitItem above (Epic+ only, drop items only), this
    // works on ANY bee that isn't already Named. Always rolls the trait
    // chance (TRAIT_GRANT_CHANCE); if the bee is still Common or Rare,
    // ALSO rolls a separate chance (STORE_EVOLVE_TO_EPIC_CHANCE) to bump
    // it straight to Epic - the item is spent either way, both rolls can
    // independently hit or miss. Returns null on an ineligible item/
    // rarity/missing bee.
    applyStoreItem(beeId, itemId) {
        if (!this.state || !this.state.colony) return null;
        const item = STORE_ITEM_CATALOG.find(i => i.id === itemId && i.kind === 'trait');
        if (!item) return null;

        const bee = (this.state.colony.bees || []).find(b => b.id === beeId);
        if (!bee || bee.rarity === 'Named' || bee.rarity === 'Royal') return null;
        if (!this._consumeItem(itemId, 1)) return null;

        let evolved = false;
        const rarityIndex = RARITY_ORDER.indexOf(bee.rarity);
        if (rarityIndex !== -1 && rarityIndex < RARITY_ORDER.indexOf('Epic') && Math.random() < STORE_EVOLVE_TO_EPIC_CHANCE) {
            bee.rarity = 'Epic';
            bee.stats = rollBeeStats('Epic');
            bee.weight = rollBeeWeight('Epic');
            evolved = true;
        }

        const succeeded = Math.random() < TRAIT_GRANT_CHANCE;
        let traitKey = null;
        if (succeeded) {
            traitKey = item.trait;
            if (!bee.traits) bee.traits = [];
            if (!bee.traits.includes(traitKey)) bee.traits.push(traitKey);
        }

        this.save();
        return { bee, evolved, succeeded, traitKey };
    }

    // Consumes the Identity Card for a GUARANTEED evolution into a full
    // Named Beast - re-rolls a themed name (rollNamedBeeName) since the
    // bee never had one. Explicitly excludes any bee already flagged
    // customNamed (see renameBee above) - per redacted's own rule, this can't
    // be used to override a name he already personally chose. Also
    // excludes bees already Named (nothing to evolve into). Returns null
    // on any ineligible bee/item/insufficient stock.
    evolveToNamed(beeId, itemId) {
        if (!this.state || !this.state.colony) return null;
        const item = STORE_ITEM_CATALOG.find(i => i.id === itemId && i.kind === 'identity');
        if (!item) return null;

        const bee = (this.state.colony.bees || []).find(b => b.id === beeId);
        if (!bee || bee.rarity === 'Named' || bee.rarity === 'Royal' || bee.customNamed) return null;
        if (!this._consumeItem(itemId, 1)) return null;

        bee.rarity = 'Named';
        bee.name = rollNamedBeeName();
        bee.stats = rollBeeStats('Named');
        bee.weight = rollBeeWeight('Named');

        this.save();
        return { bee };
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
        if (bees[index].rarity === 'Royal') return null;   // the founder stays

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
        if (beeA.rarity === 'Royal' || beeB.rarity === 'Royal') return null;

        const indexOf = (rarity) => {
            const idx = RARITY_ORDER.indexOf(rarity);
            return idx === -1 ? RARITY_ORDER.length - 1 : idx; // Named -> treated as topped-out
        };
        const baseIndex = Math.max(indexOf(beeA.rarity), indexOf(beeB.rarity));

        const upgraded = baseIndex < RARITY_ORDER.length - 1 && Math.random() < COMBINE_UPGRADE_CHANCE;
        const resultRarity = RARITY_ORDER[upgraded ? baseIndex + 1 : baseIndex];

        this.state.colony.bees = bees.filter(b => b.id !== beeIdA && b.id !== beeIdB);

        const dexNumber = this.getColonyBees().filter(b => b.rarity !== 'Royal').length + 1;
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
            element: rollBeeElement(),
            customNamed: false
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
            completedToday: (task.completedDates || []).includes(today),
            // Whether its own schedule (see isDailyDueOn above) actually
            // includes today - dailies.js dims/badges these rather than
            // hiding them outright, so nothing looks like it vanished.
            dueToday: isDailyDueOn(task, today),
            streak: computeDailyStreak(task, today),
            // Checklist ticks reset every day: an item counts as done only
            // when its doneOn is today.
            checklist: (task.checklist || []).map(item => ({ ...item, done: item.doneOn === today }))
        }));
    }

    // Tick or untick one checklist line on a daily (no DP - the daily
    // itself is what pays out).
    toggleDailyChecklistItem(taskId, itemId) {
        if (!this.state) return null;
        const task = (this.state.dailyTasks || []).find(t => t.id === taskId);
        const item = task && (task.checklist || []).find(i => i.id === itemId);
        if (!item) return null;
        const today = todayISO();
        item.doneOn = item.doneOn === today ? null : today;
        item.done = item.doneOn === today;
        this.save();
        return item;
    }

    // Hold-to-move on the Dailies page, same as moveHabit.
    moveDaily(taskId, toIndex) {
        if (!this.state || !this.state.dailyTasks) return false;
        const list = this.state.dailyTasks;
        const from = list.findIndex(t => t.id === taskId);
        if (from < 0) return false;
        const to = Math.max(0, Math.min(list.length - 1, Number(toIndex) || 0));
        if (from === to) return false;
        const [task] = list.splice(from, 1);
        list.splice(to, 0, task);
        this.save();
        return true;
    }

    // "Adjust Streak": sets today's streak to `value`. Stored as the streak
    // through the last counted day (today if done, else yesterday).
    setDailyStreak(taskId, value) {
        if (!this.state) return null;
        const task = (this.state.dailyTasks || []).find(t => t.id === taskId);
        if (!task) return null;
        const today = todayISO();
        const doneToday = (task.completedDates || []).includes(today);
        task.streakAdjust = { value: Math.max(0, Math.floor(Number(value) || 0)), through: doneToday ? today : shiftISODate(today, -1) };
        this.save();
        return task;
    }

    // Generic feed for the sitewide Reminders engine (src/core/reminders/) -
    // that module is core infra loaded on every page and must never know a
    // "daily task" exists; this is the one place allowed to make that
    // translation, since Vault is already the accepted single spot every
    // feature's real data shape lives. Shape is deliberately minimal and
    // feature-agnostic: { id, label, reminders: [{ id, time }] }. Dailies
    // and To-Dos both feed this now - a To-Do only counts as "due" on its
    // actual due date, not every day like a Daily (see isDailyDueOn vs the
    // plain dueDate === today check below). Habits deliberately don't feed
    // this - they're not "due" on any particular day, there's nothing to
    // remind about.
    getDueReminderItems() {
        const dailyItems = this.getDailyTasks()
            .filter(task => task.dueToday && !task.completedToday)
            .map(task => ({ id: task.id, label: task.label, reminders: task.reminders || [] }));

        const today = todayISO();
        const todoItems = this.getTodos()
            .filter(todo => !todo.completed && todo.dueDate === today)
            .map(todo => ({ id: todo.id, label: todo.label, reminders: todo.reminders || [] }));

        return [...dailyItems, ...todoItems];
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
    // addTask/updateTask/removeTask for quest tasks above. Expanded past
    // just label/dp/difficulty to match the full Create/Edit Daily page
    // (see src/features/dailies/create-daily.js): notes, a checklist of
    // sub-items, a repeats schedule (see isDailyDueOn above), reminder
    // times, and free-text tags. Every new field has a safe fallback so
    // both callers can still pass just the original 3 fields if that's
    // all they have.
    addDailyTask({ label, dp, difficulty, notes, checklist, startDate, repeats, reminders, tags }) {
        if (!this.state) return null;
        if (!this.state.dailyTasks) this.state.dailyTasks = [];

        const id = `daily-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        this._lastDailyId = id;
        this.state.dailyTasks.push({
            id,
            label,
            dp: Number(dp) || 0,
            difficulty: difficulty || null,
            notes: notes || '',
            checklist: Array.isArray(checklist) ? checklist : [],
            startDate: startDate || todayISO(),
            repeats: repeats || { type: 'daily', every: 1, daysOfWeek: [] },
            reminders: Array.isArray(reminders) ? reminders : [],
            tags: Array.isArray(tags) ? tags : [],
            completedDates: []
        });

        this.save();
        return this.state.dailyTasks;
    }

    updateDailyTask(taskId, { label, dp, difficulty, notes, checklist, startDate, repeats, reminders, tags }) {
        if (!this.state) return null;

        const task = (this.state.dailyTasks || []).find(t => t.id === taskId);
        if (!task) return null;

        if (label !== undefined) task.label = label;
        if (dp !== undefined) task.dp = Number(dp) || 0;
        if (difficulty !== undefined) task.difficulty = difficulty || null;
        if (notes !== undefined) task.notes = notes;
        if (checklist !== undefined) task.checklist = Array.isArray(checklist) ? checklist : [];
        if (startDate !== undefined) task.startDate = startDate;
        if (repeats !== undefined) task.repeats = repeats;
        if (reminders !== undefined) task.reminders = Array.isArray(reminders) ? reminders : [];
        if (tags !== undefined) task.tags = Array.isArray(tags) ? tags : [];

        this.save();
        return task;
    }

    removeDailyTask(taskId) {
        if (!this.state || !this.state.dailyTasks) return false;

        this.state.dailyTasks = this.state.dailyTasks.filter(t => t.id !== taskId);
        this.save();
        return true;
    }

    // 5i2. Logic: Habits (src/features/habits/) - a Habitica-style
    // +/- action button. No schedule, nothing "due" - just a permanent
    // `history` log of every click (see computeHabitDP above for how that
    // log turns into a live DP total, never affected by resetCounter).
    // Which of +/- shows is a per-habit toggle (positive/negative, default
    // both true) - so unlike Dailies there's no per-item "is this the
    // right kind of action today" check, just "is this direction turned
    // on for this habit" (enforced again in bumpHabit below).
    getHabits() {
        if (!this.state) return [];
        return (this.state.habits || []).map(habit => {
            const history = habit.history || [];
            const resetCounter = habit.resetCounter || 'daily';
            const periodStart = habitPeriodStartISO(resetCounter);
            return {
                ...habit,
                // Old habits predate the positive/negative toggle - they
                // always showed both buttons, so an absent field defaults
                // to true (not false) to keep their behavior unchanged.
                positive: habit.positive !== false,
                negative: habit.negative !== false,
                resetCounter,
                positiveCount: history.filter(h => h.direction === 'positive').length,
                negativeCount: history.filter(h => h.direction === 'negative').length,
                // Display-only tally for the current Reset Counter period -
                // DP/totals above are still computed from the full history.
                periodPositiveCount: history.filter(h => h.direction === 'positive' && h.date >= periodStart).length,
                periodNegativeCount: history.filter(h => h.direction === 'negative' && h.date >= periodStart).length
            };
        });
    }

    // direction: 'positive' | 'negative'. Fire-and-forget, same as a real
    // Habitica habit click - there's no toggle/undo (that's what clicking
    // the opposite button is for), each click is its own permanent entry.
    // A habit whose positive/negative toggle is off for this direction
    // rejects the bump - the UI already hides that button, this is just
    // the same guard enforced server-side-of-the-Vault too.
    bumpHabit(habitId, direction) {
        if (!this.state) return null;
        if (direction !== 'positive' && direction !== 'negative') return null;

        const habit = (this.state.habits || []).find(h => h.id === habitId);
        if (!habit) return null;
        if (direction === 'positive' && habit.positive === false) return null;
        if (direction === 'negative' && habit.negative === false) return null;

        if (!habit.history) habit.history = [];
        habit.history.push({
            id: `bump-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            direction,
            date: todayISO()
        });

        this.save();
        this._syncLevelUpBees();
        // Collector-bee material drops only fire on genuine accomplishment,
        // same reasoning as computeSkillContributions skipping negative
        // clicks for the matrix - a lapse shouldn't drop loot.
        if (direction === 'positive') this._collectMaterialsOnCompletion();
        return habit;
    }

    addHabit({ label, dp, difficulty, notes, tags, positive, negative, resetCounter }) {
        if (!this.state) return null;
        if (!this.state.habits) this.state.habits = [];

        let hasPositive = positive !== false;
        let hasNegative = negative !== false;
        // Refuse to create a habit with neither button visible - fall back
        // to the historical "both, always" default rather than a dead end.
        if (!hasPositive && !hasNegative) { hasPositive = true; hasNegative = true; }

        this.state.habits.push({
            id: `habit-${Date.now()}`,
            label,
            dp: Number(dp) || 0,
            difficulty: difficulty || null,
            notes: notes || '',
            tags: Array.isArray(tags) ? tags : [],
            positive: hasPositive,
            negative: hasNegative,
            resetCounter: resetCounter || 'daily',
            history: []
        });

        this.save();
        return this.state.habits;
    }

    updateHabit(habitId, { label, dp, difficulty, notes, tags, positive, negative, resetCounter }) {
        if (!this.state) return null;

        const habit = (this.state.habits || []).find(h => h.id === habitId);
        if (!habit) return null;

        if (label !== undefined) habit.label = label;
        if (dp !== undefined) habit.dp = Number(dp) || 0;
        if (difficulty !== undefined) habit.difficulty = difficulty || null;
        if (notes !== undefined) habit.notes = notes;
        if (tags !== undefined) habit.tags = Array.isArray(tags) ? tags : [];
        if (positive !== undefined) habit.positive = positive !== false;
        if (negative !== undefined) habit.negative = negative !== false;
        if (resetCounter !== undefined) habit.resetCounter = resetCounter || 'daily';
        // Same "can't have neither" guard as addHabit, re-checked after
        // applying whichever of positive/negative was just passed in.
        if (habit.positive === false && habit.negative === false) { habit.positive = true; habit.negative = true; }

        this.save();
        return habit;
    }

    // Hold-to-move on the Habits page: moves one habit to a new position
    // in the list. The list order IS the display order everywhere.
    moveHabit(habitId, toIndex) {
        if (!this.state || !this.state.habits) return false;
        const list = this.state.habits;
        const from = list.findIndex(h => h.id === habitId);
        if (from < 0) return false;
        const to = Math.max(0, Math.min(list.length - 1, Number(toIndex) || 0));
        if (from === to) return false;
        const [habit] = list.splice(from, 1);
        list.splice(to, 0, habit);
        this.save();
        return true;
    }

    // "Adjust Counter" on the edit screen: sets the current period's +/-
    // tally (the one the Reset Counter resets). Adds clicks dated today, or
    // removes the newest clicks from this period. DP follows the clicks,
    // same as tapping + or - yourself.
    setHabitPeriodCounts(habitId, { positive, negative } = {}) {
        if (!this.state) return null;
        const habit = (this.state.habits || []).find(h => h.id === habitId);
        if (!habit) return null;
        if (!habit.history) habit.history = [];
        const periodStart = habitPeriodStartISO(habit.resetCounter || 'daily');
        const adjust = (direction, wanted) => {
            if (wanted === undefined || wanted === null) return;
            const target = Math.max(0, Math.floor(Number(wanted) || 0));
            const inPeriod = habit.history.filter(h => h.direction === direction && h.date >= periodStart);
            if (target > inPeriod.length) {
                for (let i = inPeriod.length; i < target; i++) {
                    habit.history.push({ id: `bump-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, direction, date: todayISO(), adjusted: true });
                }
            } else if (target < inPeriod.length) {
                const drop = new Set(inPeriod.slice(target).map(h => h.id));
                habit.history = habit.history.filter(h => !drop.has(h.id));
            }
        };
        adjust('positive', positive);
        adjust('negative', negative);
        this.save();
        return habit;
    }

    removeHabit(habitId) {
        if (!this.state || !this.state.habits) return false;

        this.state.habits = this.state.habits.filter(h => h.id !== habitId);
        this.save();
        return true;
    }

    // 5i3. Logic: To-Dos (src/features/todos/) - a one-off task, same
    // field family as a Daily Task (see addDailyTask above) minus a repeat
    // schedule, plus an optional due date. `completed`/`completedDate`
    // replace Dailies' completedDates list since a To-Do only ever
    // completes once - no per-day re-derivation needed the way
    // getDailyTasks does for completedToday/dueToday.
    getTodos() {
        if (!this.state) return [];
        return this.state.todos || [];
    }

    // Checking a To-Do complete "archives" it - todos.js filters completed
    // items out of the active list (they collapse into a "Completed"
    // section instead of vanishing outright, so nothing's ever silently
    // lost, and unchecking there brings it right back to active).
    toggleTodoComplete(todoId) {
        if (!this.state) return null;

        const todo = (this.state.todos || []).find(t => t.id === todoId);
        if (!todo) return null;

        todo.completed = !todo.completed;
        todo.completedDate = todo.completed ? todayISO() : null;

        this.save();
        this._syncLevelUpBees();
        if (todo.completed) this._collectMaterialsOnCompletion();
        return todo;
    }

    addTodo({ label, dp, difficulty, notes, checklist, dueDate, reminders, tags }) {
        if (!this.state) return null;
        if (!this.state.todos) this.state.todos = [];

        this.state.todos.push({
            id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label,
            dp: Number(dp) || 0,
            difficulty: difficulty || null,
            notes: notes || '',
            checklist: Array.isArray(checklist) ? checklist : [],
            dueDate: dueDate || null,
            reminders: Array.isArray(reminders) ? reminders : [],
            tags: Array.isArray(tags) ? tags : [],
            completed: false,
            completedDate: null
        });

        this.save();
        return this.state.todos;
    }

    updateTodo(todoId, { label, dp, difficulty, notes, checklist, dueDate, reminders, tags }) {
        if (!this.state) return null;

        const todo = (this.state.todos || []).find(t => t.id === todoId);
        if (!todo) return null;

        if (label !== undefined) todo.label = label;
        if (dp !== undefined) todo.dp = Number(dp) || 0;
        if (difficulty !== undefined) todo.difficulty = difficulty || null;
        if (notes !== undefined) todo.notes = notes;
        if (checklist !== undefined) todo.checklist = Array.isArray(checklist) ? checklist : [];
        if (dueDate !== undefined) todo.dueDate = dueDate || null;
        if (reminders !== undefined) todo.reminders = Array.isArray(reminders) ? reminders : [];
        if (tags !== undefined) todo.tags = Array.isArray(tags) ? tags : [];

        this.save();
        return todo;
    }

    removeTodo(todoId) {
        if (!this.state || !this.state.todos) return false;

        this.state.todos = this.state.todos.filter(t => t.id !== todoId);
        this.save();
        return true;
    }

    // Tick or untick one checklist line on a to-do (no DP - the to-do
    // itself pays out). Unlike a daily's, these stay ticked.
    toggleTodoChecklistItem(todoId, itemId) {
        if (!this.state) return null;
        const todo = (this.state.todos || []).find(t => t.id === todoId);
        const item = todo && (todo.checklist || []).find(i => i.id === itemId);
        if (!item) return null;
        item.done = !item.done;
        this.save();
        return item;
    }

    // Hold-to-move on the To-Dos page, same as moveHabit.
    moveTodo(todoId, toIndex) {
        if (!this.state || !this.state.todos) return false;
        const list = this.state.todos;
        const from = list.findIndex(t => t.id === todoId);
        if (from < 0) return false;
        const to = Math.max(0, Math.min(list.length - 1, Number(toIndex) || 0));
        if (from === to) return false;
        const [todo] = list.splice(from, 1);
        list.splice(to, 0, todo);
        this.save();
        return true;
    }

    // 5j. Logic: Calendar plugin events (src/plugins/calendar/) - purely
    // user-authored entries, the one part of the Calendar page that isn't
    // derived from quest/daily data. Each event: { id, date (YYYY-MM-DD),
    // title, time (optional 'HH:MM' or null), notes (optional string) }.
    // Kept generic on purpose (no quest/daily linkage) since these are
    // meant for things that AREN'T already tracked elsewhere - the
    // Calendar page itself is what merges these with quest/daily
    // completion dates for display, not this data model.
    getCalendarEvents() {
        return this.state ? (this.state.calendarEvents || []) : [];
    }

    addCalendarEvent({ date, title, time, notes }) {
        if (!this.state) return null;
        if (!date || !title) return null;
        if (!this.state.calendarEvents) this.state.calendarEvents = [];

        const event = {
            id: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            date,
            title,
            time: time || null,
            notes: notes || null
        };
        this.state.calendarEvents.push(event);
        this.save();
        return event;
    }

    updateCalendarEvent(eventId, { date, title, time, notes }) {
        if (!this.state || !this.state.calendarEvents) return null;

        const event = this.state.calendarEvents.find(e => e.id === eventId);
        if (!event) return null;

        if (date !== undefined) event.date = date;
        if (title !== undefined) event.title = title;
        if (time !== undefined) event.time = time || null;
        if (notes !== undefined) event.notes = notes || null;

        this.save();
        return event;
    }

    removeCalendarEvent(eventId) {
        if (!this.state || !this.state.calendarEvents) return false;

        const before = this.state.calendarEvents.length;
        this.state.calendarEvents = this.state.calendarEvents.filter(e => e.id !== eventId);
        const removed = this.state.calendarEvents.length < before;
        if (removed) this.save();
        return removed;
    }

    // 5l. Logic: Study Queue (src/plugins/study/) - a running list of
    // courses/topics being worked through, same shape as the old Codex
    // tracker's studyQueue. Each item: { id, topic, type, priority,
    // status, link }. Purely user-authored local content, same reasoning
    // as calendarEvents/dictionary above - ships empty, real entries only
    // ever come from adding them through the Study page itself.
    getStudyQueue() {
        return this.state ? (this.state.studyQueue || []) : [];
    }

    addStudyItem({ topic, type, priority, status, link }) {
        if (!this.state) return null;
        if (!topic || !String(topic).trim()) return null;
        if (!this.state.studyQueue) this.state.studyQueue = [];

        const item = {
            id: `study-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            topic: String(topic).trim(),
            type: type || 'Article',
            priority: priority || 'Medium',
            status: status || 'Pending',
            link: link ? String(link).trim() : null
        };
        this.state.studyQueue.push(item);
        this.save();
        return item;
    }

    updateStudyItem(itemId, { topic, type, priority, status, link }) {
        if (!this.state || !this.state.studyQueue) return null;

        const item = this.state.studyQueue.find(i => i.id === itemId);
        if (!item) return null;

        if (topic !== undefined && String(topic).trim()) item.topic = String(topic).trim();
        if (type !== undefined) item.type = type;
        if (priority !== undefined) item.priority = priority;
        if (status !== undefined) item.status = status;
        if (link !== undefined) item.link = link ? String(link).trim() : null;

        this.save();
        return item;
    }

    removeStudyItem(itemId) {
        if (!this.state || !this.state.studyQueue) return false;

        const before = this.state.studyQueue.length;
        this.state.studyQueue = this.state.studyQueue.filter(i => i.id !== itemId);
        const removed = this.state.studyQueue.length < before;
        if (removed) this.save();
        return removed;
    }

    // 5k. Logic: Dictionary Terms (src/features/dictionary/) - each term:
    // { id, name, definition, category, createdAt }. `category` is what
    // actually ties a term to the skill mastery matrix (see
    // computeSkillMatrixDP above) - defining a term under "CSS" is the
    // deliberate, curated action that makes that category real, rather
    // than every stray word you ever type anywhere silently becoming a
    // tracked skill. Create-Daily's auto-tagging only ever MATCHES against
    // term names that already exist here; it never creates new ones on
    // its own.
    getDictionaryTerms() {
        return this.state ? (this.state.dictionary || []) : [];
    }

    addDictionaryTerm({ name, definition, category }) {
        if (!this.state) return null;
        if (!name || !String(name).trim()) return null;
        if (!this.state.dictionary) this.state.dictionary = [];

        const term = {
            id: `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: String(name).trim(),
            definition: definition ? String(definition).trim() : '',
            category: category && String(category).trim() ? String(category).trim() : 'General',
            createdAt: new Date().toISOString()
        };
        this.state.dictionary.push(term);
        this.save();
        return term;
    }

    updateDictionaryTerm(termId, { name, definition, category }) {
        if (!this.state || !this.state.dictionary) return null;

        const term = this.state.dictionary.find(t => t.id === termId);
        if (!term) return null;

        if (name !== undefined && String(name).trim()) term.name = String(name).trim();
        if (definition !== undefined) term.definition = String(definition).trim();
        if (category !== undefined) term.category = String(category).trim() || 'General';

        this.save();
        return term;
    }

    removeDictionaryTerm(termId) {
        if (!this.state || !this.state.dictionary) return false;

        const before = this.state.dictionary.length;
        this.state.dictionary = this.state.dictionary.filter(t => t.id !== termId);
        const removed = this.state.dictionary.length < before;
        if (removed) this.save();
        return removed;
    }

    // The Dashboard's Skill Matrix reads this directly - see
    // computeSkillMatrixDP above for how the raw dp is derived, and
    // computeSkillLevelState above for how that dp maps onto a level/bar.
    // Each entry comes back pre-merged with its level info so the Dashboard
    // never has to cross-reference two separate calls per row.
    getSkillMatrix() {
        if (!this.state) return [];
        if (!this.state.skillLevels) this.state.skillLevels = {};

        return computeSkillMatrixDP(this.state.dailyTasks, this.state.dictionary, this.state.quests, this.state.habits, this.state.todos).map(entry => {
            const stored = this.state.skillLevels[entry.category];
            const levelState = computeSkillLevelState(entry.dp, stored ? stored.level : 1);
            return { ...entry, ...levelState };
        });
    }

    // Every contribution toward `category` completed on or after `sinceISO`
    // (or ALL of them, if sinceISO is null/undefined - a skill's very first
    // level-up has no "since" yet). This is what gets handed to Eevee in
    // levelUpSkill below so her reward judgment is based on the real batch
    // of work behind that level-up, not just a bare DP number. A
    // contribution with no recorded date (can happen for an older Quest
    // task saved before dateCompleted was tracked) is included rather than
    // silently dropped - real work shouldn't vanish from her view just
    // because its timestamp is missing.
    getSkillContributionsSince(category, sinceISO) {
        if (!this.state) return [];
        const sinceTime = sinceISO ? new Date(sinceISO).getTime() : null;

        return computeSkillContributions(this.state.dailyTasks, this.state.dictionary, this.state.quests, this.state.habits, this.state.todos)
            .filter(c => c.category === category)
            .filter(c => {
                if (!sinceTime) return true;
                if (!c.date) return true;
                const t = new Date(c.date).getTime();
                return Number.isFinite(t) ? t >= sinceTime : true;
            });
    }

    // Breaks the seal on one pending skill level (see computeSkillLevelState
    // above for why the bar can sit "maxed" without the level actually
    // moving until this runs). Returns null if that category isn't actually
    // maxed yet - the Dashboard only ever shows the button when it is, but
    // this guards the method itself against being called out of turn.
    //
    // Rewards: always +1 gacha ticket (added to the existing Colony ticket
    // pool - unwrap it from the Pollination Chamber like any other ticket),
    // plus Pollen and an optional rarer bonus material judged by Eevee
    // against everything completed in this skill since its last level-up
    // (see getSkillContributionsSince above). If Eevee's unreachable, the
    // level-up still goes through with a quiet flat fallback - a downed
    // Ollama server should never block the celebration itself.
    async levelUpSkill(category) {
        if (!this.state) return null;
        if (!this.state.skillLevels) this.state.skillLevels = {};

        const matrixEntry = computeSkillMatrixDP(this.state.dailyTasks, this.state.dictionary, this.state.quests, this.state.habits, this.state.todos)
            .find(entry => entry.category === category);
        const totalDP = matrixEntry ? matrixEntry.dp : 0;

        const stored = this.state.skillLevels[category] || { level: 1, leveledUpAt: null };
        const levelState = computeSkillLevelState(totalDP, stored.level);
        if (!levelState.maxed) return null;

        const contributions = this.getSkillContributionsSince(category, stored.leveledUpAt);

        let pollen = 3; // quiet fallback if Eevee can't be reached
        let bonusMaterialId = null;
        try {
            const assessment = await Eevee.assessSkillLevelUpReward(category, contributions.map(c => c.label));
            pollen = assessment.pollen;
            bonusMaterialId = assessment.bonusMaterialId;
        } catch (error) {
            // Silent fallback, same philosophy as create-daily's "Ask Eevee"
            // button - a level-up should never be blocked by Ollama being down.
        }

        if (!this.state.inventory) this.state.inventory = { materials: {}, items: {}, fragments: {} };
        if (!this.state.inventory.materials) this.state.inventory.materials = {};
        this.state.inventory.materials.pollen = (this.state.inventory.materials.pollen || 0) + pollen;

        if (bonusMaterialId && MATERIAL_CATALOG.some(m => m.id === bonusMaterialId)) {
            this.state.inventory.materials[bonusMaterialId] = (this.state.inventory.materials[bonusMaterialId] || 0) + 1;
        } else {
            bonusMaterialId = null; // ignore anything Eevee returned that isn't a real material id
        }

        if (!this.state.colony) this.state.colony = { bees: [], levelUpBeesAwarded: 0, tickets: 0, ticketsAwarded: 0 };
        if (typeof this.state.colony.tickets !== 'number') this.state.colony.tickets = 0;
        this.state.colony.tickets += 1;

        const newLevel = stored.level + 1;
        this.state.skillLevels[category] = { level: newLevel, leveledUpAt: new Date().toISOString() };
        this.save();

        return { category, newLevel, pollen, bonusMaterialId, ticketsGranted: 1 };
    }

    // 7. Logic: Full-state export/import - a manual, no-backend way to move
    // your progress between devices (e.g. computer -> phone). Everything
    // lives under one localStorage key (this.storageKey), so "export" is
    // just that whole blob as a downloadable file, and "import" is
    // overwriting the same key from a file you brought over yourself. This
    // is also what the login backdoor's "Load My Save" step calls once
    // personal credentials are entered on a device that doesn't already
    // have personal data loaded (see getBlueprintSource above).
    exportFullState() {
        if (!this.state) return null;
        return JSON.stringify(this.state, null, 2);
    }

    // Returns { ok: true } on success or { ok: false, error } on failure.
    // Doesn't call save()/re-run init()'s backfills itself - the caller
    // (settings.js, login.js) reloads the page after a successful import so
    // Vault.init() re-runs fresh against the newly-loaded state, same as
    // any other schema-migration path.
    importFullState(jsonString, { fromCloud = false } = {}) {
        let parsed;
        try {
            parsed = JSON.parse(jsonString);
        } catch (error) {
            return { ok: false, error: "That file isn't valid JSON." };
        }

        // Loose sanity check - not a full schema validation, just enough to
        // catch "wrong file entirely" (e.g. a quest-only export) before it
        // overwrites a real save.
        if (!parsed || typeof parsed !== 'object' || !parsed.user || !Array.isArray(parsed.quests)) {
            return { ok: false, error: "That doesn't look like a Bizzybee save file." };
        }

        const previousDirty = localStorage.getItem(this.storageKey + ':dirty');
        try {
            this.validateFullState(parsed);
            this.createLocalBackup('Before import or cloud restore');
            parsed.schemaVersion = VAULT_SCHEMA_VERSION;
            localStorage.setItem(this.storageKey + ':dirty', fromCloud ? 'false' : 'true');
            localStorage.setItem(this.storageKey, JSON.stringify(parsed));
            this.state = parsed;
            if (!fromCloud) window.dispatchEvent(new Event('vault-saved'));
            return { ok: true };
        } catch (error) {
            try {
                if (previousDirty === null) localStorage.removeItem(this.storageKey + ':dirty');
                else localStorage.setItem(this.storageKey + ':dirty', previousDirty);
            } catch { /* Original data remains intact; preserve the original error. */ }
            return { ok: false, error: error.message };
        }
    }

    // 7b. Logic: Profile photo. Unlike everything else on Profile, the
    // avatar used to be a static file (src/assets/images/me.jpg, gitignored -
    // see profile.html's old onerror-to-placeholder chain) rather than
    // anything stored in the Vault. That's exactly why it never traveled
    // with exportFullState()/importFullState() above - it was never part of
    // "your data" to begin with, just a file sitting next to the code on
    // whichever device happened to have it. Storing it here instead (as a
    // base64 data URL, produced by profile.js's client-side downscale
    // before it ever reaches this method) makes it genuinely part of your
    // save, so it now travels automatically with every future export/
    // import - no special-casing needed in exportFullState/importFullState
    // themselves, it's just another field on this.state.
    getProfilePhoto() {
        return this.state && this.state.profilePhoto ? this.state.profilePhoto : null;
    }

    setProfilePhoto(dataUrl) {
        if (!this.state) return null;
        this.state.profilePhoto = dataUrl;
        this.save();
        return dataUrl;
    }

    clearProfilePhoto() {
        if (!this.state) return;
        this.state.profilePhoto = null;
        this.save();
    }

    // 7c. Logic: Personal Information - genuinely ENCRYPTED at rest, not
    // just gated behind a UI lock screen. state.personalInfoEncrypted is a
    // single CryptoLite (AES-GCM) envelope string keyed by your own
    // 6-digit account PIN (see the Account PIN section below) - the exact
    // same PIN that gates src/features/account-info/, the only page that
    // ever reads or writes this. Even someone who gets your exported save
    // file, or opens localStorage directly, can't read your name/address/
    // etc. without that PIN - this is real encryption, not obfuscation
    // (same honest framing login.js's own passcode-hash comment uses).
    // Every method below still just takes a generic `passcode` string
    // parameter and hands it straight to CryptoLite - it doesn't care
    // whether that string happens to be 6 digits or something else, so
    // nothing here needed to change when the account-info lock screen
    // itself switched from a typed passcode to a PIN.
    //
    // A prior version of this feature (state.personalInfo, plain, no
    // passcode) shipped for one session and was superseded before it was
    // ever actually used - no migration path from it, deliberately: it was
    // never populated with anything real.
    //
    // The profile PHOTO deliberately stays unencrypted (getProfilePhoto/
    // setProfilePhoto above, state.profilePhoto) - Profile page shows it on
    // every visit with no unlock step, which only works if it's plaintext.
    // The fields below (name/address/availability/etc.) are the genuinely
    // sensitive ones worth gating.
    //
    // Deliberately flat/unstructured for now - alias is the only field the
    // account-info UI treats as required; everything else (firstName,
    // lastName, availability, height, weight, bmi, work, address) is
    // optional and shown together on one page. The longer-term plan is for
    // fields like height/weight/work/address to only appear once a
    // matching plugin is installed (see plugins.js's `personalInfoFields`
    // catalog entries, reserved but not wired up yet) - not built now,
    // per an explicit "put them all together for now" call.
    hasPersonalInfo() {
        return !!(this.state && this.state.personalInfoEncrypted);
    }

    // Returns {} if nothing has ever been saved (no passcode needed for
    // that no-op case). Otherwise decrypts with `passcode` - throws
    // (propagated straight from CryptoLite.decrypt) on a wrong passcode or
    // a corrupted envelope; the caller (account-info.js) is responsible for
    // catching that and showing a real error rather than crashing.
    async getPersonalInfo(passcode) {
        if (!this.state || !this.state.personalInfoEncrypted) return {};
        const json = await CryptoLite.decrypt(this.state.personalInfoEncrypted, passcode);
        return JSON.parse(json);
    }

    // Always a wholesale replace, not a merge - account-info.js's Save
    // button submits the entire form every time (it's a single page, not
    // partial widgets), so there's no partial-update case to preserve here
    // unlike the old plain version's shallow-merge.
    async setPersonalInfo(data, passcode) {
        if (!this.state) return null;
        this.state.personalInfoEncrypted = await CryptoLite.encrypt(JSON.stringify(data || {}), passcode);
        this.save();
        return data;
    }

    // No passcode required to clear - matches Reset Local Data's own
    // "destructive action, caller confirms first" convention; account-info
    // page is already behind the lock screen by the time this is reachable.
    clearPersonalInfo() {
        if (!this.state) return;
        this.state.personalInfoEncrypted = null;
        this.save();
    }

    // 7d. Logic: Account PIN. A user-CREATED 6-digit numeric PIN, hashed
    // (SHA-256 via Auth.sha256Hex - src/core/auth.js, loaded on every page
    // that calls these - reused rather than duplicated) and stored as
    // state.accountPinHash. This is NOT the same thing as login.js's
    // PERSONAL_PASSWORD_HASH (a fixed constant baked into source, gating
    // the app itself) - the PIN is per-save-file, created by the user the
    // FIRST time they visit Account Info (src/features/account-info/), and
    // travels with a Full Save export/import like any other Vault field,
    // same as everything else in this file.
    //
    // The raw PIN (never the hash - a hash can't be used as an encryption
    // key) is also what actually gets passed as `passcode` to
    // getPersonalInfo/setPersonalInfo above - so "wrong PIN" and "can't
    // decrypt your personal info" are structurally the same failure, not
    // two independent checks that could ever drift out of sync with each
    // other. Format validation (exactly 6 digits, numeric only) is a UI
    // concern, deliberately NOT enforced here - account-info.js/
    // account-security.js validate before ever calling setAccountPin, same
    // "core stores state, features own meaning" split used everywhere else
    // in this file.
    hasAccountPin() {
        return !!(this.state && this.state.accountPinHash);
    }

    async setAccountPin(pin) {
        if (!this.state) return null;
        this.state.accountPinHash = await Auth.sha256Hex(pin);
        this.save();
        return true;
    }

    async verifyAccountPin(pin) {
        if (!this.state || !this.state.accountPinHash) return false;
        const hash = await Auth.sha256Hex(pin);
        return hash === this.state.accountPinHash;
    }

    // An early version of the Habitica import put every Habitica Habit into
    // Dailies (note "Imported from Habitica (habit).") and every To-Do into
    // a standing "Imported from Habitica" quest. This moves them where they
    // belong - Habits and To-Dos - with no network needed, keeping each
    // To-Do's done state. Imported items with no difficulty get one from
    // their DP (the import set DP from Habitica's difficulty). Runs once per
    // save (state.habiticaSorted), after a local backup. (Craft, 2026-10-10)
    _sortHabiticaImports() {
        if (!this.state || this.state.habiticaSorted) return { habits: 0, todos: 0 };
        const fromHabitica = (item) => typeof item.notes === 'string' && item.notes.startsWith('Imported from Habitica');
        const oldHabits = (this.state.dailyTasks || []).filter(t => typeof t.notes === 'string' && t.notes.startsWith('Imported from Habitica (habit).'));
        const oldQuest = (this.state.quests || []).find(q => q.id === 'quest-habitica-import');
        const needsDifficulty = ['habits', 'dailyTasks', 'todos'].some(k => (this.state[k] || []).some(t => fromHabitica(t) && !t.difficulty));
        if (!oldHabits.length && !oldQuest && !needsDifficulty) {
            this.state.habiticaSorted = true;
            this.save();
            return { habits: 0, todos: 0 };
        }
        this.createLocalBackup('Before sorting Habitica imports');
        const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        if (!this.state.habits) this.state.habits = [];
        const haveHabit = new Set(this.state.habits.map(h => String(h.label).trim().toLowerCase()));
        oldHabits.forEach(t => {
            const key = String(t.label).trim().toLowerCase();
            if (!haveHabit.has(key)) {
                haveHabit.add(key);
                this.state.habits.push({
                    id: `habit-${uid()}`,
                    label: t.label,
                    dp: Number(t.dp) || 0,
                    difficulty: t.difficulty || habiticaDifficultyFromDp(t.dp),
                    notes: t.notes,
                    tags: Array.isArray(t.tags) ? t.tags : [],
                    positive: true,
                    negative: true,
                    resetCounter: 'daily',
                    history: []
                });
            }
        });
        const moved = new Set(oldHabits.map(t => t.id));
        this.state.dailyTasks = (this.state.dailyTasks || []).filter(t => !moved.has(t.id));

        let todos = 0;
        if (oldQuest) {
            if (!this.state.todos) this.state.todos = [];
            const haveTodo = new Set(this.state.todos.map(t => String(t.label).trim().toLowerCase()));
            (oldQuest.tasks || []).forEach(t => {
                const key = String(t.label).trim().toLowerCase();
                if (haveTodo.has(key)) return;
                haveTodo.add(key);
                this.state.todos.push({
                    id: `todo-${uid()}`,
                    label: t.label,
                    dp: Number(t.dp) || 0,
                    difficulty: t.difficulty || habiticaDifficultyFromDp(t.dp),
                    notes: 'Imported from Habitica (todo).',
                    checklist: [], dueDate: null, reminders: [], tags: [],
                    completed: !!t.completed,
                    completedDate: t.completed ? (t.dateCompleted || todayISO()) : null
                });
                todos++;
            });
            this.state.quests = this.state.quests.filter(q => q.id !== oldQuest.id);
            if (this.state.activeQuestId === oldQuest.id) this.state.activeQuestId = null;
        }

        ['habits', 'dailyTasks', 'todos'].forEach(k => (this.state[k] || []).forEach(t => {
            if (fromHabitica(t) && !t.difficulty) t.difficulty = habiticaDifficultyFromDp(t.dp);
        }));

        this.state.habiticaSorted = true;
        this.save();
        console.log(`Vault: sorted Habitica imports - ${oldHabits.length} habits out of Dailies, ${todos} quest tasks into To-Dos.`);
        return { habits: oldHabits.length, todos };
    }

    // 7e. Habitica: the old one-way import's id list (state.habiticaImportedIds)
    // is no longer used - two-way sync keeps state.habiticaLinks instead
    // (src/core/habitica-sync/). Old saves still carry the list; it's harmless.


    // --- Onboarding (the egg gift) ------------------------------------------
    _ensureOnboardingData() {
        if (this.state.onboarding) return;
        this.state.onboarding = freshOnboardingRecord();
        this.save();
    }

    getOnboarding() {
        return this.state ? (this.state.onboarding || null) : null;
    }

    isOnboarding() {
        const o = this.getOnboarding();
        return !!o && o.stage !== 'done';
    }

    // Merges a partial update into the record and saves. The onboarding
    // page calls this on every meaningful step, so closing the app never
    // loses progress.
    updateOnboarding(patch) {
        if (!this.state || !this.state.onboarding) return null;
        Object.assign(this.state.onboarding, patch || {});
        this.save();
        return this.state.onboarding;
    }

    // Your own name (asked for while raising your egg; Account Info can
    // change it). Kept apart from state.user, which the blueprint owns.
    setDisplayName(name) {
        if (!this.state) return null;
        const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 30);
        this.state.displayName = clean || null;
        this.save();
        return this.state.displayName;
    }

    // Which dock tabs are open during onboarding, in unlock order. Older
    // records (from before tabs existed) are read from how far they got.
    getOnboardingTabs() {
        const o = this.getOnboarding();
        if (!o) return [];
        if (Array.isArray(o.tabs)) return o.tabs.filter(t => ONBOARDING_TAB_ORDER.includes(t));
        const tabs = [];
        if (o.unlocked) tabs.push('habits');
        if (['larva', 'pupa', 'ready', 'hatched'].includes(o.stage)) tabs.push('todos');
        if (['ready', 'hatched'].includes(o.stage)) tabs.push('dailies', 'quests');
        return tabs;
    }

    // Opens a tab and remembers what was already there, so only things
    // made from now on count toward its tutorial.
    unlockOnboardingTab(tab) {
        const o = this.getOnboarding();
        if (!o || !ONBOARDING_TAB_ORDER.includes(tab)) return false;
        if (!Array.isArray(o.tabs)) o.tabs = this.getOnboardingTabs();
        if (!o.base) o.base = {};
        if (!o.tabs.includes(tab)) o.tabs.push(tab);
        if (!o.base[tab]) o.base[tab] = this._onboardingItems(tab).map(x => x.id);
        if (tab === 'habits' || tab === 'todos') this.setPluginEnabled(tab, true);
        this.save();
        return true;
    }

    _onboardingItems(tab) {
        if (!this.state) return [];
        return ({ habits: this.state.habits, todos: this.state.todos, dailies: this.state.dailyTasks, quests: this.state.quests }[tab]) || [];
    }

    // Things made on this tab since it unlocked.
    onboardingNewItems(tab) {
        const o = this.getOnboarding();
        const base = new Set((o && o.base && o.base[tab]) || []);
        return this._onboardingItems(tab).filter(x => !base.has(x.id));
    }

    // { stepKey: true/false } for one tab, read from the real data.
    onboardingStepStatus(tab) {
        const items = this.onboardingNewItems(tab);
        const today = todayISO();
        if (tab === 'habits') {
            return {
                make: items.length > 0,
                plus: items.some(h => (h.history || []).some(x => x.direction === 'positive')),
                bad: items.some(h => h.negative === true)
            };
        }
        if (tab === 'todos') {
            return {
                add: items.length > 0,
                due: items.some(t => !!t.dueDate),
                steps: items.some(t => (t.checklist || []).length > 0),
                check: items.some(t => t.completed)
            };
        }
        if (tab === 'dailies') {
            return {
                add: items.length > 0,
                days: items.some(d => {
                    const r = d.repeats || {};
                    return r.type === 'monthly' || (Number(r.every) || 1) > 1 || (r.type === 'weekly' && (r.daysOfWeek || []).length > 0 && (r.daysOfWeek || []).length < 7);
                }),
                check: items.some(d => (d.completedDates || []).includes(today))
            };
        }
        if (tab === 'quests') {
            const ids = new Set(items.map(q => q.id));
            return {
                make: items.some(q => (q.tasks || []).length >= 2),
                focus: ids.has(this.getActiveQuestId()),
                check: items.some(q => (q.tasks || []).some(t => t.completed))
            };
        }
        return {};
    }

    // The next step still to do on a tab (or null when it's all done).
    onboardingNextStep(tab) {
        const status = this.onboardingStepStatus(tab);
        return (ONBOARDING_STEPS[tab] || []).find(st => !status[st.key]) || null;
    }

    // Sends pages to the egg while it isn't hatched yet. Only nested app
    // pages are gated - the login page and the open pages above never are.
    _onboardingGate() {
        if (typeof window === 'undefined' || !window.location || typeof window.location.replace !== 'function') return;
        if (!this.isOnboarding()) return;
        const path = window.location.pathname || '';
        const inFeatures = path.includes('/src/features/'), inPlugins = path.includes('/src/plugins/');
        if (!inFeatures && !inPlugins) return;
        if (ONBOARDING_OPEN_PAGES.some(p => path.includes(p))) return;
        if (this.getOnboardingTabs().some(tab => ONBOARDING_TAB_PATHS[tab].some(p => path.includes(p)))) return;
        window.location.replace((inPlugins ? '../../features/onboarding/' : '../onboarding/') + 'onboarding.html');
    }

    // The hatch: adds the founder (Royal) bee, keeps the starter habits as
    // real Habits, and opens the app. Safe to call twice - it never adds a
    // second royal or duplicate starter habits.
    completeOnboarding({ royal, name } = {}) {
        if (!this.state || !this.state.onboarding) return null;
        const kind = royal === 'king' ? 'king' : 'queen';
        const label = kind === 'king' ? 'King' : 'Queen';
        if (!this.state.colony) this.state.colony = { bees: [] };
        const bees = this.state.colony.bees || (this.state.colony.bees = []);
        if (!bees.some(b => b.rarity === 'Royal')) {
            bees.push({
                id: 'bee-royal',
                name: (String(name || '').trim().slice(0, 24)) || label,
                rarity: 'Royal',
                royal: kind,
                class: null,
                obtainedAt: new Date().toISOString(),
                source: 'onboarding',
                // the same founder card for everyone (Craft's call): fixed stats, no element
                stats: { level: 1, hp: 120, offense: 40, defense: 40, speed: 40, power: 40 },
                weight: 4.0,
                dexNumber: 0,
                element: null,
                customNamed: true
            });
        }
        if (!this.state.habits) this.state.habits = [];
        ONBOARDING_STARTER_HABITS.forEach((h, i) => {
            if (this.state.habits.some(x => x.label === h.label)) return;
            this.state.habits.push({
                id: `habit-starter-${i}-${Date.now()}`,
                label: h.label, dp: 20, difficulty: 'Easy', notes: h.notes, tags: [],
                positive: true, negative: false, resetCounter: 'daily', history: [],
                ...(i === 0 ? { quoteOfWeek: true } : {})
            });
        });
        Object.assign(this.state.onboarding, { stage: 'done', royal: kind, name: String(name || '').trim().slice(0, 24), completedAt: new Date().toISOString() });
        this.save();
        return bees.find(b => b.rarity === 'Royal');
    }

    // The hive's honey and decay, shared by the Hive page and Home's hive
    // strip (moved here from colony.js so both read the same numbers).
    //   honey  = base + 4 per bee card + 3 per level (XP counts partly)
    //   decay  = missed dailies, overdue To-Dos and bad-habit clicks in the
    //            last 14 days; it can hollow at most half the honey.
    getHiveHoney() {
        const CAP = 320, BASE = 6, PER_BEE = 4, PER_LEVEL = 3, DAYS = 14;
        const dayISO = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
        const user = this.getUser() || { level: 1, currentXP: 0, nextLevelXP: 1 };
        const bees = this.getColonyBees();
        const ids = [];
        const today = dayISO(0), windowStart = dayISO(DAYS);
        const dailies = this.getDailyTasks ? this.getDailyTasks() : [];
        for (let d = 1; d <= DAYS; d++) {
            const day = dayISO(d);
            dailies.forEach(task => {
                if (!isDailyDueOn(task, day)) return;
                if ((task.completedDates || []).includes(day)) return;
                ids.push(`daily:${task.id}:${day}`);
            });
        }
        (this.getTodos ? this.getTodos() : []).forEach(todo => {
            if (todo.completed || !todo.dueDate) return;
            if (todo.dueDate < today && todo.dueDate >= windowStart) ids.push(`todo:${todo.id}`);
        });
        (this.getHabits ? this.getHabits() : []).forEach(habit => {
            (habit.history || []).forEach(entry => {
                if (entry.direction === 'negative' && entry.date >= windowStart) ids.push(`habit:${habit.id}:${entry.id}`);
            });
        });
        const xpPart = user.nextLevelXP ? Math.min(1, user.currentXP / user.nextLevelXP) : 0;
        const fromCards = bees.length * PER_BEE;
        const fromLevel = Math.floor(((user.level || 1) - 1 + xpPart) * PER_LEVEL);
        const lit = Math.min(CAP, BASE + fromCards + fromLevel);
        const decay = Math.min(ids.length, Math.floor(lit * 0.5));
        return { lit, capacity: CAP, fromCards, fromLevel, lapseIds: ids, lapses: ids.length, decay, level: user.level || 1, bees: bees.length };
    }

    getRoyalBee() {
        return this.getColonyBees().find(b => b.rarity === 'Royal') || null;
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
