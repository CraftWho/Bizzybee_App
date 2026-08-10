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

function todayISO() {
    return new Date().toISOString().slice(0, 10);
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
function computeSkillContributions(dailyTasks, dictionaryTerms, quests) {
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

function computeSkillMatrixDP(dailyTasks, dictionaryTerms, quests) {
    const dpByCategory = {};
    computeSkillContributions(dailyTasks, dictionaryTerms, quests).forEach(contribution => {
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

    if (daily.startDate) {
        const start = new Date(`${daily.startDate}T00:00:00`);
        if (date < start) return false;
    }

    if (repeats.type !== 'weekly') return true;

    const daysOfWeek = repeats.daysOfWeek || [];
    if (!daysOfWeek.includes(date.getDay())) return false;

    const every = repeats.every || 1;
    if (every > 1 && daily.startDate) {
        const start = new Date(`${daily.startDate}T00:00:00`);
        const daysSince = Math.round((date - start) / 86400000);
        const weeksSince = Math.floor(daysSince / 7);
        if (weeksSince % every !== 0) return false;
    }

    return true;
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
        // Backfills state.personalInfo (core fields: name/address/age/
        // height) and state.personalInfoExtra (per-plugin dynamic fields,
        // see getPluginPersonalInfo below) onto any save from before the
        // Settings "Personal Information" section existed - no-ops once
        // both are there. Same reasoning as every other backfill above.
        if (!this.state.personalInfo) {
            this.state.personalInfo = {};
            this.save();
        }
        if (!this.state.personalInfoExtra) {
            this.state.personalInfoExtra = {};
            this.save();
        }
        return this.state;
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
            const personalResponse = await fetch(`${rootPrefix}/src/core/data.personal.json`);
            if (personalResponse.ok) {
                const data = await personalResponse.json();
                data.blueprintSource = 'personal';
                return data;
            }
        } catch (error) {
            // No personal blueprint on this machine - fall through to the generic one.
        }

        const response = await fetch(`${rootPrefix}/src/core/data.json`);
        const data = await response.json();
        data.blueprintSource = 'generic';
        return data;
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
            if (!bee.element || !BEE_ELEMENTS[bee.element]) {
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
            dexNumber: this.getColonyBees().length + 1,
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
        if (!bee || bee.rarity === 'Named') return null;
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
        if (!bee || bee.rarity === 'Named' || bee.customNamed) return null;
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
            dueToday: isDailyDueOn(task, today)
        }));
    }

    // Generic feed for the sitewide Reminders engine (src/core/reminders/) -
    // that module is core infra loaded on every page and must never know a
    // "daily task" exists; this is the one place allowed to make that
    // translation, since Vault is already the accepted single spot every
    // feature's real data shape lives. Shape is deliberately minimal and
    // feature-agnostic: { id, label, reminders: [{ id, time }] }. Only
    // Dailies feeds this today, but any future feature with its own
    // due-now + reminder-times data (a Quests deadline, a Habits plugin
    // entry, etc.) could be folded into this same list later without
    // reminders.js ever changing.
    getDueReminderItems() {
        return this.getDailyTasks()
            .filter(task => task.dueToday && !task.completedToday)
            .map(task => ({ id: task.id, label: task.label, reminders: task.reminders || [] }));
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

        this.state.dailyTasks.push({
            id: `daily-${Date.now()}`,
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

        return computeSkillMatrixDP(this.state.dailyTasks, this.state.dictionary, this.state.quests).map(entry => {
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

        return computeSkillContributions(this.state.dailyTasks, this.state.dictionary, this.state.quests)
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

        const matrixEntry = computeSkillMatrixDP(this.state.dailyTasks, this.state.dictionary, this.state.quests)
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
    importFullState(jsonString) {
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

        localStorage.setItem(this.storageKey, JSON.stringify(parsed));
        return { ok: true };
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

    // 7c. Logic: Personal Information. Two tiers, matching how plugins.js's
    // PLUGIN_CATALOG already splits "core app" from "optional expansion":
    //
    // - state.personalInfo: the small, always-present core set (name,
    //   address, age, height) every install asks for, regardless of which
    //   plugins are on.
    // - state.personalInfoExtra: keyed by plugin id, holds whatever EXTRA
    //   fields that specific plugin needs to actually be useful (e.g. Study
    //   wants your daily availability so it can help you schedule sessions
    //   around it; a future Fitness plugin will want fastest-mile time and
    //   training availability instead). A plugin declares its own fields as
    //   a `personalInfoFields` array on its PLUGIN_CATALOG entry (see
    //   plugins.js) - Settings reads that catalog directly and only renders
    //   a plugin's section once the plugin is actually enabled, so this
    //   grows organically as plugins go from 'coming-soon' to 'available'
    //   rather than needing a hardcoded field list here.
    getPersonalInfo() {
        return this.state ? (this.state.personalInfo || {}) : {};
    }

    // Shallow-merges `partial` onto the existing object rather than
    // replacing it wholesale, so Settings can save just the core fields
    // without needing to know about (or accidentally wipe) anything else
    // that might get added to this same object later.
    setPersonalInfo(partial) {
        if (!this.state) return null;
        this.state.personalInfo = { ...(this.state.personalInfo || {}), ...(partial || {}) };
        this.save();
        return this.state.personalInfo;
    }

    getPluginPersonalInfo(pluginId) {
        if (!this.state || !this.state.personalInfoExtra) return {};
        return this.state.personalInfoExtra[pluginId] || {};
    }

    setPluginPersonalInfo(pluginId, partial) {
        if (!this.state) return null;
        if (!this.state.personalInfoExtra) this.state.personalInfoExtra = {};
        this.state.personalInfoExtra[pluginId] = {
            ...(this.state.personalInfoExtra[pluginId] || {}),
            ...(partial || {})
        };
        this.save();
        return this.state.personalInfoExtra[pluginId];
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
