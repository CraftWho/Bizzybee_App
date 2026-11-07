console.log("/// VAULT (DB) INITIALIZED ///");

// Bump this whenever data.json/data.personal.json's shape changes (new
// fields, renamed fields, etc.). Older saves are backed up and migrated
// through the additive initialization backfills; never discard progress.
// v7: added the "profile" block (projects/serviceRecord) - this used to be
// hardcoded directly in profile.html, which meant the real (personal)
// content shipped in the tracked base template. Now it's blueprint content
// like everything else, so data.json/data.personal.json stay properly split.
const VAULT_SCHEMA_VERSION = 8;

// Schema 8 (2026-10-10, Craft): points were renamed from DP ("developer
// points") to XP everywhere - in the code AND in saves. Saves from schema 7
// and older store each task's points under the key "dp"; this renames that
// key to "xp" anywhere in the save (habits, dailies, to-dos, quest tasks).
// Runs on every way a save comes in - opening the app, a cloud download, a
// backup restore, an imported file - via validateFullState below, so an old
// save never reaches the rest of the app. Values are never changed, only
// the key. Encrypted personal info is a string and is left alone.
// Oct 31 2026 (Craft): "Colony" was renamed "Hive Mind" everywhere. Saves
// made before keep the bees, tickets, honey and hive life under "colony";
// this moves them to "hive", and renames the page keys kept in the save
// (Home tile order, seen hints). Runs on load, import, cloud load and
// backup restore (validateFullState), so old files keep working. Returns
// true when it changed something.
const HIVE_PAGE_KEYS = { colony: 'hive-mind', 'colony-bees': 'hive-bees' };
function migrateHiveKey(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    let changed = false;
    if (s.colony && typeof s.colony === 'object' && !s.hive) { s.hive = s.colony; changed = true; }
    if (Object.prototype.hasOwnProperty.call(s, 'colony')) { delete s.colony; changed = true; }
    if (Array.isArray(s.homeAppOrder) && s.homeAppOrder.some(k => HIVE_PAGE_KEYS[k])) {
        s.homeAppOrder = s.homeAppOrder.map(k => HIVE_PAGE_KEYS[k] || k); changed = true;
    }
    if (s.hints && typeof s.hints === 'object') {
        ['seen', 'snooze'].forEach(field => {
            const o = s.hints[field];
            if (!o || typeof o !== 'object') return;
            Object.keys(HIVE_PAGE_KEYS).forEach(k => {
                if (!Object.prototype.hasOwnProperty.call(o, k)) return;
                if (!(HIVE_PAGE_KEYS[k] in o)) o[HIVE_PAGE_KEYS[k]] = o[k];
                delete o[k]; changed = true;
            });
        });
    }
    return changed;
}
// Device-only settings that used the old name (bee hatch memory, list view).
// Oct 31 2026 (Craft): every bee gets a serial number when it's made (or the
// first time an older save loads), so each card can be tracked later. It never
// changes. Format BZ-XXXX-XXXX (no 0/O/1/I/L, so it reads clearly).
const SERIAL_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function newBeeSerial(taken) {
    for (let tries = 0; tries < 20; tries++) {
        const n = new Uint8Array(8);
        try { crypto.getRandomValues(n); } catch { for (let i = 0; i < 8; i++) n[i] = Math.floor(Math.random() * 256); }
        const c = [...n].map(x => SERIAL_CHARS[x % SERIAL_CHARS.length]).join('');
        const serial = `BZ-${c.slice(0, 4)}-${c.slice(4)}`;
        if (!taken || !taken.has(serial)) return serial;
    }
    return `BZ-${Date.now().toString(36).toUpperCase()}`;
}
// Oct 31 2026 (Craft): also fills height and Recovery, and gives a new
// Rare-or-better bee its memory: when it came, how (its source), and the last
// task you finished. fresh = called from save(), so a bee without a serial is
// brand new; bees in an older save (on load) get no memory ("before memories").
function ensureBeeSerials(s, fresh = false) {
    const bees = s && s.hive && Array.isArray(s.hive.bees) ? s.hive.bees : [];
    if (!bees.some(b => b && (!b.serial || b.height == null || b.recovery == null))) return false;
    const taken = new Set(bees.map(b => b && b.serial).filter(Boolean));
    bees.forEach(b => {
        if (!b) return;
        if (!b.serial) {
            if (fresh && b.rarity !== 'Common' && !b.memory) {
                const last = s.lastTaskDone;
                b.memory = { at: b.obtainedAt || new Date().toISOString(), how: b.source || 'gacha',
                    level: s.characterLevelBar && s.characterLevelBar.acknowledgedLevel || null,
                    task: last ? { kind: last.kind, label: last.label } : null };
            }
            b.serial = newBeeSerial(taken); taken.add(b.serial);
        }
        if (b.height == null) b.height = rollBeeHeight(b.rarity);
        if (b.recovery == null) b.recovery = rollBeeRecovery(b.rarity);
    });
    return true;
}
function migrateHiveStorage() {
    if (typeof localStorage === 'undefined') return;
    [['bizzybee_colony_hatched', 'bizzybee_hive_hatched'], ['bizzybee_colony_bees_view', 'bizzybee_hive_bees_view']].forEach(([from, to]) => {
        try { const v = localStorage.getItem(from); if (v !== null && localStorage.getItem(to) === null) localStorage.setItem(to, v); } catch { /* storage off */ }
    });
}

function upgradeLegacyPoints(state) {
    const LEGACY = 'dp';
    const walk = (node) => {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (!node || typeof node !== 'object') return;
        if (Object.prototype.hasOwnProperty.call(node, LEGACY)) {
            if (!Object.prototype.hasOwnProperty.call(node, 'xp')) node.xp = node[LEGACY];
            delete node[LEGACY];
        }
        Object.values(node).forEach(walk);
    };
    walk(state);
    return state;
}

// Habitica difficulty -> Bizzybee difficulty. The Habitica import stores
// XP 25/50/75/100 for Habitica's trivial/easy/medium/hard (account-info.js's
// habiticaPriorityToXp), so the XP alone says which one it was.
function habiticaDifficultyFromXp(xp) {
    const n = Number(xp) || 0;
    if (n >= 100) return 'Hard';
    if (n >= 75) return 'Medium';
    if (n >= 50) return 'Easy';
    return 'Trivial';
}

// Pure, stateless: total XP is always the live sum of every completed
// task's current xp value, across every quest - never a stored running
// total. This means editing a task's xp (even after it's been completed),
// adding a new quest, or a future conditionally-generated quest all just
// work automatically, with no ledger to drift out of sync.
// Ghost Log entries (optional, see 5m below) count the exact same way a
// task does - any entry not sitting at 'pending' contributes its own xp,
// same live-not-a-ledger philosophy, since a Ghost Log's own status/xp can
// be edited after the fact too (correcting a partial-credit call, say) and
// the total should just reflect that immediately.
// ---- TIME-BASED XP (Oct 2026) ------------------------------------------
// XP is time now: 1 minute of practice = 1 XP, times an effort bonus.
// Every Daily, Habit, To-Do and Quest task has PLANNED minutes (set on the
// form, found in its title like "for 20 minutes", or a default by
// difficulty). When you check one off you can log the REAL minutes; that
// completion then counts what you logged. Skill mastery counts minutes
// only (no effort bonus), so its hours stay honest.
const TASK_DEFAULT_MINUTES = { Trivial: 3, Easy: 15, Medium: 45, Hard: 90 };
const TASK_EFFORT = { Trivial: 0.75, Easy: 1, Medium: 1.25, Hard: 1.5 };
const TASK_TIME_CHIPS = [2, 5, 15, 30, 45, 60, 90, 120];

// "Scrimba study for 20 minutes" -> 20, "2 hours a day" -> 120, "1.5h" -> 90.
function minutesFromText(text) {
    const t = String(text || '').toLowerCase();
    let m = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
    if (m) return Math.min(600, Math.round(parseFloat(m[1]) * 60)) || null;
    m = t.match(/(\d+)\s*(?:minutes?|mins?|m)\b/);
    if (m) return Math.min(600, parseInt(m[1], 10)) || null;
    return null;
}

// A task's planned minutes: set by you > in its title > imported history
// (its old points, ~1 min each) > by difficulty > from its old XP.
function plannedMinutes(task) {
    if (!task) return 15;
    const set = Number(task.minutes);
    if (set > 0) return set;
    const found = minutesFromText(task.label);
    if (found) return found;
    if (Number(task.historyXP) > 0) return Number(task.historyXP);
    if (TASK_DEFAULT_MINUTES[task.difficulty]) return TASK_DEFAULT_MINUTES[task.difficulty];
    const old = Number(task.xp);
    return old > 0 ? Math.max(1, Math.min(240, Math.round(old))) : 15;
}

function xpForMinutes(minutes, difficulty) {
    return Math.max(1, Math.round((Number(minutes) || 0) * (TASK_EFFORT[difficulty] || 1)));
}
// What one completion is worth: logged minutes if you logged them, else planned.
const completionMinutes = (task, logged) => (Number(logged) > 0 ? Number(logged) : plannedMinutes(task));
const completionXP = (task, logged) => xpForMinutes(completionMinutes(task, logged), task && task.difficulty);
// A bad-habit tap costs half of what the habit is worth.
const habitPenaltyXP = (habit) => Math.max(1, Math.round(xpForMinutes(plannedMinutes(habit), habit.difficulty) / 2));

function computeTotalXP(quests) {
    return (quests || []).reduce((sum, quest) => {
        const taskXP = (quest.tasks || [])
            .filter(t => t.completed)
            .reduce((s, t) => s + completionXP(t, t.minutesSpent), 0);
        const ghostLogXP = (quest.ghostLogs || [])
            .filter(g => g.status && g.status !== 'pending')
            .reduce((s, g) => s + (g.xp || 0), 0);
        return sum + taskXP + ghostLogXP;
    }, 0);
}

// Same "live, not a ledger" philosophy as computeTotalXP: a daily task's XP
// contribution is however many days it's been checked off (completedDates
// stores a list of "YYYY-MM-DD" strings) times its CURRENT xp value - so
// editing a daily task's xp retroactively reflects across all its past
// completions too, same as editing a quest task's xp does.
function computeDailyXP(dailyTasks) {
    return (dailyTasks || []).reduce((sum, task) => {
        const log = task.minutesLog || {};
        return sum + (task.completedDates || []).reduce((s, d) => s + completionXP(task, log[d]), 0);
    }, 0);
}

// Same "live, not a ledger" philosophy again, just bidirectional: a
// Habit's `history` is a permanent log of every +/- click (see
// Vault.bumpHabit below) - this sums positive clicks and SUBTRACTS
// negative ones, both at the habit's CURRENT xp value, so editing a
// habit's xp later reflects across every past click, in both directions,
// exactly like a Daily's completedDates does for its own xp.
function computeHabitXP(habits) {
    return (habits || []).reduce((sum, habit) => {
        const history = habit.history || [];
        const plus = history.filter(h => h.direction === 'positive').reduce((s, h) => s + completionXP(habit, h.minutes), 0);
        const minus = history.filter(h => h.direction === 'negative').length * habitPenaltyXP(habit);
        return sum + plus - minus;
    }, 0);
}

// Same live-not-a-ledger philosophy as computeTotalXP's quest tasks: a
// To-Do only ever contributes its CURRENT xp, and only once - the moment
// `completed` flips true (see Vault.toggleTodoComplete below). Unlike a
// Daily/Habit there's no repeat count to multiply by; a To-Do happens
// exactly once by definition.
function computeTodoXP(todos) {
    return (todos || []).filter(t => t.completed).reduce((sum, t) => sum + completionXP(t, t.minutesSpent), 0);
}

// Oct 2026: dates are YOUR day, not UTC's. toISOString() switched days at
// UTC midnight (late afternoon/evening in the US), so Start My Day, streaks
// and dailies rolled over early. A new day now starts at your 12 am.
function localISO(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Oct 31 2026 (Craft): the LOCAL day of a stored date. Quest tasks store
// the exact moment (UTC ISO time), so slicing the first 10 characters gave
// the UTC day: after 8 PM in redacted that's already tomorrow. This uses the
// device's own clock and time zone. Plain dates ("2026-10-31") pass through.
function localDayOf(value) {
    if (!value) return '';
    const s = String(value);
    if (s.length <= 10) return s.slice(0, 10);
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? s.slice(0, 10) : localISO(new Date(ms));
}
function todayISO() {
    return localISO();
}

// Start-of-current-period ISO date for a Habit's Reset Counter cadence -
// used only to derive a display-only "this period" tally (see getHabits
// below). Purely additive: the permanent `history` log (and everything
// computed from it - XP totals, Skill Matrix contributions) is never
// filtered by this and never resets. Week starts Sunday, matching the
// daysOfWeek 0=Sun convention Dailies already use elsewhere in this file.
function habitPeriodStartISO(resetCounter, now = new Date()) {
    if (resetCounter === 'weekly') {
        const start = new Date(now);
        start.setDate(start.getDate() - start.getDay());
        return localISO(start);
    }
    if (resetCounter === 'monthly') {
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    return localISO(now);
}

// Word-boundary-ish, case-insensitive "does this term appear in this text"
// check - shared by computeSkillMatrixXP's Quest-matching pass below and
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
// "live, not a ledger" philosophy as computeTotalXP/computeDailyXP above,
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
// this app's real, historical XP lives in completed Quest tasks, not
// Dailies (a brand-new feature) - so counting Dailies alone left the
// matrix empty despite plenty of already-earned mastery. This mirrors how
// the original Codex tracker worked: tagging a Quest Log entry applied its
// earned XP straight to the matching skill bars (see "Tags: [React, CSS]"
// in leveling-system.md's Skill Proficiency Tracks) - here it's fully
// automatic instead of hand-tagged: a completed task's XP counts toward
// every Dictionary term that appears as a whole word in its own quest's
// title, objective, or the task's own label. Unlike Daily tags, an
// unmatched word does NOT become its own category here - quest text is
// free-form prose, not a deliberate tag, so only a real Dictionary-term
// match counts (avoids turning entire sentences into bogus "categories").
// Every individual contribution behind the matrix - one entry per (tag or
// matched Dictionary term) x (completion), each carrying its own date. This
// is the single source of truth computeSkillMatrixXP aggregates below AND
// what getSkillContributionsSince (see the Vault class) filters by date to
// hand Eve a real batch of "what actually happened" for a level-up
// assessment - keeping both in exact sync instead of two copies of the same
// matching logic that could quietly drift apart.
// Oct 2026: every kind of task (Dailies, Habits, To-Dos, Quest tasks)
// counts toward a skill two ways - its tags, and any Dictionary word that
// appears as a whole word in its text (a quest task also checks its
// quest's title and objective). A tag that isn't a Dictionary word becomes
// its own skill. Each contribution carries real MINUTES (for mastery
// hours) and XP. Imported Codex history counts like any finished task.
// ---- Everyday skills (Oct 29 2026, approved demo) ----
// A library of common skills with plain words, so "Wake up on time" counts
// toward Time Management without typing any tags. measure: 'time' = real
// hours; 'times' = how often you do it (time doesn't matter for it).
const SKILL_LIBRARY = [
    { name: 'Time Management', icon: '⏰', color: '#ffb000', measure: 'times', words: ['wake up', 'wake', 'alarm', 'on time', 'early', 'bedtime', 'schedule', 'planner', 'routine', 'calendar', 'agenda', 'organize'] },
    { name: 'Fitness', icon: '💪', color: '#3ddc84', measure: 'times', words: ['run', 'running', 'jog', 'gym', 'workout', 'walk', 'yoga', 'stretch', 'push-ups', 'lift', 'swim', 'bike', 'steps'] },
    { name: 'Health', icon: '❤️', color: '#ff6a8a', measure: 'times', words: ['water', 'vitamins', 'vitamin', 'sleep', 'floss', 'brush teeth', 'doctor', 'dentist', 'skincare', 'medicine'] },
    { name: 'Study', icon: '📚', color: '#5aa9ff', measure: 'time', words: ['study', 'read', 'reading', 'homework', 'lecture', 'exam', 'flashcards', 'course', 'lesson'] },
    { name: 'Coding', icon: '💻', color: '#e3304a', measure: 'time', words: ['code', 'coding', 'javascript', 'html', 'css', 'python', 'react', 'debug', 'github', 'leetcode'] },
    { name: 'Cooking', icon: '🍳', color: '#ff8a3d', measure: 'times', words: ['cook', 'cooking', 'meal prep', 'recipe', 'bake', 'dinner', 'lunch', 'breakfast'] },
    { name: 'Work', icon: '💼', color: '#9aa6b6', measure: 'time', words: ['meeting', 'email', 'emails', 'report', 'client', 'deadline', 'presentation'] },
    { name: 'Mindfulness', icon: '🧘', color: '#c99bff', measure: 'times', words: ['meditate', 'meditation', 'journal', 'breathe', 'gratitude', 'mindful', 'pray'] },
    { name: 'Home', icon: '🏠', color: '#d9a441', measure: 'times', words: ['clean', 'laundry', 'dishes', 'vacuum', 'tidy', 'groceries', 'chores', 'trash'] },
    { name: 'Creative', icon: '🎨', color: '#ff7ad9', measure: 'time', words: ['draw', 'paint', 'writing', 'design', 'sketch', 'photo'] },
    { name: 'Music', icon: '🎵', color: '#7fe08a', measure: 'time', words: ['guitar', 'piano', 'sing', 'song', 'drums', 'music'] },
    { name: 'Money', icon: '💰', color: '#ffd700', measure: 'times', words: ['budget', 'bills', 'savings', 'invest', 'expenses', 'taxes'] },
    { name: 'Language', icon: '🗣️', color: '#5fd6ff', measure: 'time', words: ['spanish', 'french', 'duolingo', 'vocab', 'japanese', 'german'] },
    { name: 'Social', icon: '🤝', color: '#ffa24a', measure: 'times', words: ['call mom', 'call dad', 'friend', 'friends', 'family', 'visit', 'date night'] },
];
const SKILL_PALETTE = ['#ffcc00', '#5aa9ff', '#3ddc84', '#ff8a3d', '#c99bff', '#ff6a8a', '#5fd6ff', '#ffa24a', '#7fe08a', '#e3304a', '#ff7ad9', '#9aa6b6'];
// A "times done" skill counts each completion as this many minutes toward its level.
const TIMES_UNIT_MIN = { Trivial: 5, Easy: 10, Medium: 20, Hard: 30 };
const SKILL_AUTO_AFTER = 2;   // check-offs of any kind before a library skill makes itself

// Skill paths (Oct 29 2026, approved demo): each skill has its own row of
// milestones, in place of the separate skill tree. Times-done skills count
// check-offs; time skills count hours (real + estimated). Your Codex tree
// nodes become steps on the path of the skill they need (Codex Architect
// goes on HTML). Each milestone's reward is claimed once.
const SKILL_PATHS = {
    'Fitness': { times: [['👟', 'First Steps', 5], ['🔁', 'Regular', 25], ['🏃', 'Athlete', 50], ['🦾', 'Iron Bee', 100], ['🏆', 'Legend', 365]] },
    'Time Management': { times: [['🌅', 'Early Bird', 5], ['🗓️', 'Planner', 15], ['⚙️', 'Clockwork', 40], ['⏳', 'Time Lord', 100], ['👑', 'Master of Hours', 365]] },
};
const SKILL_PATH_DEFAULT = {
    time: [['🌱', 'Starter', 2], ['🌿', 'Steady', 10], ['🌳', 'Skilled', 50], ['⭐', 'Expert', 100], ['👑', 'Master', 500]],
    times: [['🌱', 'Started', 5], ['🌿', 'Habit', 25], ['🌳', 'Routine', 50], ['⭐', 'Second Nature', 100], ['👑', 'Master', 365]],
};
function skillPathSteps(category, measure, has = () => false) {
    const mk = ([icon, name, need]) => ({ id: 'p-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), icon, name, need });
    const custom = (SKILL_PATHS[category] || {})[measure];
    if (custom) return { from: null, list: custom.map(mk) };
    const gen = SKILL_PATH_DEFAULT[measure === 'times' ? 'times' : 'time'].map(mk);
    if (measure === 'times') return { from: null, list: gen };
    const key = String(category).toLowerCase();
    // A node with two skills (HTML + Tools) goes on the first one you have.
    const owner = (e) => { const k = e.needs.skills || []; return String(k.find(x => has(x)) || k[0] || '').toLowerCase(); };
    const codex = SKILL_TREE_CATALOG.filter(e => e.needs && (e.needs.total ? key === 'html' : owner(e) === key))
        .map(e => ({ id: e.id, icon: e.icon, name: e.name, need: e.needs.hours, description: e.description }));
    if (!codex.length) return { from: null, list: gen };
    const list = [...codex, ...gen.filter(g => !codex.some(c => c.need === g.need))].sort((a, b) => a.need - b.need);
    return { from: 'your Codex tree', list };
}
const SKILL_PATH_REWARDS = {
    pollen: { kind: 'material', id: 'pollen', qty: 5, icon: '🌼', name: 'Pollen' },
    nectar: { kind: 'material', id: 'royal-nectar', qty: 1, icon: '✨', name: 'Royal Nectar' },
    ticket: { kind: 'tickets', qty: 1, icon: '🎟️', name: 'Gacha ticket' },
    drop: { kind: 'material', id: 'honey-drop', qty: 1, icon: '🍯', name: 'Honey Drop' },
    bee: { kind: 'bee', qty: 1, icon: '🐝', name: 'New bee' },
    jelly: { kind: 'material', id: 'royal-jelly', qty: 1, icon: '👑', name: 'Royal Jelly' },
};
// Last step = Royal Jelly, the one before = a bee, the rest climb from Pollen.
function skillPathReward(i, n) {
    const R = SKILL_PATH_REWARDS;
    if (i === n - 1) return R.jelly;
    if (i === n - 2) return R.bee;
    return [R.pollen, R.nectar, R.ticket, R.drop][Math.min(i, 3)];
}
function skillLibEntry(name) { const n = String(name || '').toLowerCase(); return SKILL_LIBRARY.find(s => s.name.toLowerCase() === n) || null; }
function skillColorFor(name) {
    const lib = skillLibEntry(name);
    if (lib) return lib.color;
    let h = 7; for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) | 0;
    return SKILL_PALETTE[Math.abs(h) % SKILL_PALETTE.length];
}
const _libWordRe = new Map();
function libraryMatches(text) {
    const hay = ` ${String(text || '').toLowerCase()} `;
    return SKILL_LIBRARY.filter(s => s.words.some(w => {
        if (!_libWordRe.has(w)) _libWordRe.set(w, new RegExp(`(?:^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`));
        return _libWordRe.get(w).test(hay);
    }));
}
// Was this completion's time entered by you (real) or the planned guess?
const completionIsReal = (task, logged) => Number(logged) > 0 || Number(task && task.minutes) > 0 || !!minutesFromText(task && task.label);

function skillMatcher(dictionaryTerms) {
    const terms = (dictionaryTerms || []).filter(t => t && t.name && String(t.name).trim().length >= 2)
        .map(t => ({ name: String(t.name).trim(), category: t.category || t.name,
            re: new RegExp(`(?:^|[^a-z0-9])${String(t.name).trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`) }));
    const byName = {};
    terms.forEach(t => { byName[t.name.toLowerCase()] = t.category; });
    // -> [{ category, via }] for a piece of text plus its tags
    return (text, tags) => {
        const out = new Map();
        (tags || []).forEach(tag => {
            const name = String(tag || '').trim();
            if (!name) return;
            const cat = byName[name.toLowerCase()] || name;
            if (!out.has(cat)) out.set(cat, `tag ${name}`);
        });
        const hay = ` ${withHashtagWords(String(text || '')).toLowerCase()} `;
        terms.forEach(t => { if (!out.has(t.category) && t.re.test(hay)) out.set(t.category, `"${t.name}"`); });
        return [...out].map(([category, via]) => ({ category, via }));
    };
}
// Oct 2026: which words decide a QUEST task's skills. A task inside a
// chapter (a course module) is matched on its chapter + sub-chapter names,
// not the quest's whole description - a course description names every
// skill, which made every lesson count toward all of them. Quest tags
// (typed on the quest form) and a chapter's tags (quest.moduleTags) count
// for every task they cover.
function questSkillText(quest, task) {
    if (!quest) return '';
    if (task && task.module) return [task.module, task.section].filter(Boolean).join(' ');
    return `${quest.title || ''} ${quest.objective || ''}`;
}
function questSkillTags(quest, task) {
    if (!quest) return [];
    const mod = task && task.module && quest.moduleTags ? (quest.moduleTags[task.module] || []) : [];
    return [...(quest.tags || []), ...mod];
}

// Which skills a task would count toward (create forms show these as chips).
function skillsForTask(task, dictionaryTerms, quest) {
    const text = [questSkillText(quest, task), task.label, task.notes].filter(Boolean).join(' ');
    return skillMatcher(dictionaryTerms)(text, [...((task.skillsOff ? [] : task.tags) || []), ...questSkillTags(quest, task)])
        .filter(s => !(task.skillsOff || []).includes(s.category));
}

function computeSkillContributions(dailyTasks, dictionaryTerms, quests, habits, todos) {
    const match = skillMatcher(dictionaryTerms);
    const contributions = [];
    const skillsOf = (task, extra, extraTags) => match([extra, task.label, task.notes].filter(Boolean).join(' '), [...(task.tags || []), ...(extraTags || [])])
        .filter(s => !(task.skillsOff || []).includes(s.category));
    const push = (cats, task, minutes, date, source, real) => cats.forEach(({ category }) => contributions.push({
        category, label: task.label, minutes, xp: xpForMinutes(minutes, task.difficulty), date, source, real: !!real, difficulty: task.difficulty }));

    (dailyTasks || []).forEach(task => {
        const cats = skillsOf(task);
        if (!cats.length) return;
        const log = task.minutesLog || {};
        (task.completedDates || []).forEach(d => push(cats, task, completionMinutes(task, log[d]), d, 'daily', completionIsReal(task, log[d])));
    });
    // Habits: only good (+) taps are practice.
    (habits || []).forEach(habit => {
        const cats = skillsOf(habit);
        if (!cats.length) return;
        (habit.history || []).filter(h => h.direction === 'positive')
            .forEach(h => push(cats, habit, completionMinutes(habit, h.minutes), h.date, 'habit', completionIsReal(habit, h.minutes)));
    });
    (todos || []).forEach(todo => {
        if (!todo.completed) return;
        push(skillsOf(todo), todo, completionMinutes(todo, todo.minutesSpent), todo.completedDate || null, 'todo', completionIsReal(todo, todo.minutesSpent));
    });
    (quests || []).forEach(quest => {
        (quest.tasks || []).forEach(task => {
            if (!task.completed) return;
            const source = Number(task.historyXP) > 0 ? 'history' : 'quest';
            push(skillsOf(task, questSkillText(quest, task), questSkillTags(quest, task)), task, completionMinutes(task, task.minutesSpent), task.dateCompleted || null, source, source === 'history' || completionIsReal(task, task.minutesSpent));
        });
    });
    return contributions;
}

// All practice minutes, each completion counted once (not per skill).
function computeTotalPracticeMinutes(dailyTasks, quests, habits, todos) {
    let m = 0;
    (dailyTasks || []).forEach(t => { const log = t.minutesLog || {}; (t.completedDates || []).forEach(d => { m += completionMinutes(t, log[d]); }); });
    (habits || []).forEach(h => (h.history || []).filter(x => x.direction === 'positive').forEach(x => { m += completionMinutes(h, x.minutes); }));
    (todos || []).filter(t => t.completed).forEach(t => { m += completionMinutes(t, t.minutesSpent); });
    (quests || []).forEach(q => (q.tasks || []).filter(t => t.completed).forEach(t => { m += completionMinutes(t, t.minutesSpent); }));
    return m;
}

function computeSkillMatrixXP(dailyTasks, dictionaryTerms, quests, habits, todos) {
    const by = {};
    computeSkillContributions(dailyTasks, dictionaryTerms, quests, habits, todos).forEach(c => {
        const e = by[c.category] || (by[c.category] = { category: c.category, xp: 0, minutes: 0, bySource: {}, count: 0, realMinutes: 0, estMinutes: 0, timesMinutes: 0 });
        e.xp += c.xp; e.minutes += c.minutes; e.count++;
        if (c.real) e.realMinutes += c.minutes; else e.estMinutes += c.minutes;
        e.timesMinutes += TIMES_UNIT_MIN[c.difficulty] || 10;
        e.bySource[c.source] = (e.bySource[c.source] || 0) + c.minutes;
    });
    return Object.values(by).map(e => ({ ...e, hours: e.minutes / 60 })).sort((a, b) => b.minutes - a.minutes);
}

// Skill levels (Oct 2026): real hours, same curve as your character level -
// level L is reached at L x (L - 1) hours (level 5 = 20 h, 10 = 90 h,
// 100 = 9,900 h). Stages name the road to 10,000 hours. The bar fills to
// the ACKNOWLEDGED level's cap and waits there until you press Level Up
// (levelUpSkill), which is where rewards are handed out.
const SKILL_STAGES = [
    { name: 'Novice', from: 0, to: 20, color: '#a69a80' },
    { name: 'Apprentice', from: 20, to: 100, color: '#7fc0ff' },
    { name: 'Practitioner', from: 100, to: 1000, color: '#4fb83a' },
    { name: 'Expert', from: 1000, to: 5000, color: '#c99bff' },
    { name: 'Master', from: 5000, to: 10000, color: '#ff6a5a' },
    { name: 'Grandmaster', from: 10000, to: Infinity, color: '#ffd700' }
];
const skillStageOf = (hours) => SKILL_STAGES.find(st => hours < st.to) || SKILL_STAGES[SKILL_STAGES.length - 1];
const skillHoursToReach = (level) => level * (level - 1);
function skillLevelFromHours(hours) {
    let level = 1;
    while (hours >= skillHoursToReach(level + 1)) level++;
    return level;
}

function computeSkillLevelState(minutes, acknowledgedLevel) {
    const hours = (Number(minutes) || 0) / 60;
    const level = acknowledgedLevel || 1;
    const from = skillHoursToReach(level), cap = skillHoursToReach(level + 1) - from;
    const into = Math.min(cap, Math.max(0, hours - from));
    const stage = skillStageOf(hours);
    return {
        level,
        liveLevel: skillLevelFromHours(hours),
        hours,
        hoursIntoLevel: into,
        hoursCap: cap,
        // older pages read these two: minutes into the level / its size
        xpIntoLevel: Math.round(into * 60),
        cap: cap * 60,
        percentage: Math.min(100, into / cap * 100),
        maxed: hours >= skillHoursToReach(level + 1),
        stage: stage.name,
        stageColor: stage.color,
        nextStage: (SKILL_STAGES[SKILL_STAGES.indexOf(stage) + 1] || {}).name || null,
        hoursToNextStage: stage.to === Infinity ? 0 : stage.to - hours
    };
}

// Skill level-up rewards: 1 material every level, tickets every 5th level
// (level / 5: Lv 5 -> 1, Lv 10 -> 2, Lv 20 -> 4), 1 bee for a new stage.
function skillLevelReward(newLevel, stageUp) {
    return { materials: 1, tickets: newLevel % 5 === 0 ? newLevel / 5 : 0, bees: stageUp ? 1 : 0 };
}

// Starter Dictionary terms, seeded once (see _ensureDictionarySeeded below)
// so the Skill Mastery Matrix has real categories to bucket into from day
// one instead of waiting on a manually-added Dictionary entry. These match
// the genesis-tier skill tree this tracker already used (Semantic HTML,
// CSS Fundamentals, JavaScript Essentials, DOM Manipulation, React,
// WordPress - see skill-tree.md / the Genesis quest titles), so existing
// completed Quest tasks that already mention these by name light up
// immediately via computeSkillMatrixXP's Quest-matching pass above.
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
    // Synced from Habitica: its own "due today" answer wins for that day,
    // so the two apps never disagree about what is grayed out.
    const hd = daily.habiticaDue;
    if (hd && hd.day === dateStr && typeof hd.due === 'boolean') return hd.due;
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
    // savedDates: days a Guard Bee or Streak Charm saved (Start My Day) -
    // they keep the streak going but give no XP.
    const done = new Set([...(task.completedDates || []), ...(task.savedDates || [])]);
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

// Hive Mind bee rarities - lives here (not hive-mind.js) because bees are now
// awarded on level-up too (see toggleTask/toggleDailyTask below), which
// happens from Home/Quests/Dailies, not just the Hive Mind page itself.
// hive-mind.js's rendering re-uses this exact same table so a bee's color is
// identical everywhere it's shown, no matter how it was earned.
// weight: 0 on Named is deliberate - rollBeeRarity() below can never
// select it (see the loop: `if (roll < entry.weight) return entry` is
// never true for a 0-weight entry). The ONLY way to get a Named Beast is
// unwrapTicket() below, which builds one directly and skips this table's
// weighting entirely.
// Oct 2026: rare tiers made almost non-existent (Common 92%, Rare 7%,
// Epic 0.9%, Legendary 0.1%) - the grind is in a bee's stats now.
const BEE_RARITIES = [
    { rarity: 'Common', weight: 920, color: '#aaaaaa' },
    { rarity: 'Rare', weight: 70, color: '#4aa3ff' },
    { rarity: 'Epic', weight: 9, color: '#b06bff' },
    { rarity: 'Legendary', weight: 1, color: 'var(--gold-start)' },
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

// Named Beast titles (Oct 2026, approved demo): every bee has a real name
// now, so a Named Beast keeps its own name and gets a TITLE - e.g. Kin
// "The Guardian". One random title, given when it becomes Named. Each title
// has a small power that works while the bee does the matching job (job:
// null = any job). Older Named Beasts ("Comet The Relentless") are split
// into name + title once (_splitNamedTitles).
const NAMED_TITLES = {
    guardian: { label: 'The Guardian', icon: '🛡️', power: 'Unbreakable', text: '+15% raid defense while a Guard Bee.', job: 'guardian', quote: 'No raider passes while {n} stands at the gate.' },
    collector: { label: 'The Collector', icon: '🌾', power: 'Deep Pockets', text: 'Brings back materials 10% more often while a Forager.', job: 'collector', quote: '{n} never comes home empty.' },
    swift: { label: 'The Swift', icon: '💨', power: 'Tailwind', text: 'Scout ticket finds +2% while a Scout.', job: 'scout', quote: 'Faster than the morning breeze.' },
    keeper: { label: 'The Keeper', icon: '🍯', power: 'Honeyhand', text: 'Makes Honey Drops more often while a Honey Maker.', job: 'honeymaker', quote: 'The hive eats well because of {n}.' },
    healer: { label: 'The Healer', icon: '💗', power: 'Soft Touch', text: 'Counts as two Nurses for healing while a Nurse Bee.', job: 'nurse', quote: 'Every bruise mends under {n}\u2019s care.' },
    architect: { label: 'The Architect', icon: '🏗️', power: 'Master Builder', text: '+1 quest loot roll while a Comb Builder (still max 3).', job: 'architect', quote: 'Every cell {n} builds stands for a hundred seasons.' },
    relentless: { label: 'The Relentless', icon: '🔥', power: 'Never Tired', text: 'Loses stamina 25% slower on any job.', job: null, quote: '{n} works until the work is done.' },
    bright: { label: 'The Bright', icon: '✨', power: 'Lucky Star', text: '+3% chance of a gacha ticket when you finish a task.', job: null, quote: 'Luck follows {n} like pollen.' },
    champ: { label: 'The Champ', icon: '🏆', power: 'Main Event', text: '+15% power in counter-raids.', job: null, quote: '{n} has never lost a fight worth winning.' },
    bold: { label: 'The Bold', icon: '🦁', power: 'Fearless', text: 'Never hurt when a raid gets in.', job: null, quote: '{n} flies straight at the hornets.' },
    wanderer: { label: 'The Wanderer', icon: '🧭', power: 'Far Flyer', text: 'Counts as two Scouts when guiding Foragers to rare finds.', job: 'scout', quote: '{n} knows every flower for a mile.' },
    unyielding: { label: 'The Unyielding', icon: '🧱', power: 'Iron Seal', text: '+15% raid defense while a Propolis Sealer.', job: 'barrier', quote: 'Cracks close wherever {n} goes.' },
    // Limited titles (Oct 29 2026, back Nov 1) belong to one limited bee and are never rolled.
    reaper: { label: 'The Reaper', icon: '💀', power: 'Soul Harvest', text: 'While an Undertaker, every fallen bee also leaves a Honey Drop.', job: 'undertaker', quote: 'When the moon is full, {n} comes to collect.', limited: true }
};
const NAMED_TITLE_IDS = Object.keys(NAMED_TITLES).filter(id => !NAMED_TITLES[id].limited);

// Limited editions (Oct 29 2026, Craft; back Nov 1 2026): numbered bees, 50
// in the world. The number comes from the server (netlify/functions/
// limited.mjs), which keeps the official list (number -> account); #001 is
// the creator's. Given as a gift with a letter (Mailbox) or claimed on the
// event day. Limited bees never die, can't be renamed, released or combined.
const LIMITED_EDITIONS = {
    'grimzy-2026': {
        id: 'grimzy-2026', label: 'Halloween 2026', name: 'Grimzy', title: 'reaper', element: 'fire', of: 50,
        art: 'grimzy', scene: 'halloween', month: 10, day: 31
    }
};
const beeIsLimited = (b) => !!(b && b.limited && b.limited.serial);
const rollNamedTitle = () => NAMED_TITLE_IDS[Math.floor(Math.random() * NAMED_TITLE_IDS.length)];
// True when this bee's title power is switched on (its job matches).
function beeTitlePower(bee, titleId) {
    if (!bee || bee.rarity !== 'Named' || bee.title !== titleId) return false;
    const t = NAMED_TITLES[titleId];
    if (!t) return false;
    if (!t.job) return true;
    return bee.class === t.job;
}
// Oct 2026: a Named Beast's job is fixed by its title (The Guardian is
// always a Guard Bee). Titles with no job (Relentless, Bright, Champ, Bold)
// leave the job free. null = not locked.
function beeLockedJob(bee) {
    if (!bee || bee.rarity !== 'Named' || !bee.title) return null;
    const t = NAMED_TITLES[bee.title];
    return t && t.job ? t.job : null;
}
// Natural talent (Oct 2026): every normal bee is born best at one job.
// Doing that job = +20% at it (BEE_TALENT_BOOST). Named Beasts have titles
// instead; the Queen has neither.
const BEE_TALENT_BOOST = 1.2;
function beeTalentBoost(bee) {
    const talent = bee && bee.talent && bee.class === bee.talent && bee.rarity !== 'Named' ? BEE_TALENT_BOOST : 1;
    // Oct 28 2026: a bee that isn't well works and fights worse (beeWellFactor).
    return talent * (typeof beeWellFactor === 'function' ? beeWellFactor(bee) : 1);
}
function pickBeeTalent(bee, rand = Math.random) {
    if (bee.sex === 'm') return 'drone';
    const jobs = Object.keys(BEE_CLASSES).filter(k => !BEE_CLASSES[k].maleOnly);
    // Nov 3 2026 (Craft): random, with real-hive odds (more Collectors and Nurses).
    const w = k => (typeof HIVE_JOB_SHARES !== 'undefined' && HIVE_JOB_SHARES[k]) || 1;
    let r = rand() * jobs.reduce((n, k) => n + w(k), 0);
    for (const k of jobs) { r -= w(k); if (r < 0) return k; }
    return jobs[jobs.length - 1];
}
// Bee Models keys this bee counts toward (see Vault.getSeenModels).
function beeModelKeys(bee) {
    if (!bee) return [];
    const k = [];
    if (bee.rarity === 'Royal') { k.push('rar:Royal'); if (bee.royal) k.push('royal:' + bee.royal); return k; }
    if (bee.rarity) k.push('rar:' + bee.rarity);
    if (bee.element) k.push('el:' + bee.element);
    if (bee.rarity === 'Named' && bee.title) k.push('title:' + bee.title);
    if (bee.sex === 'm') k.push('life:drone');
    return k;
}
// "Kin \u201cThe Guardian\u201d" for a Named Beast, the plain name otherwise.
function beeFullName(bee) {
    if (!bee) return '';
    const t = bee.rarity === 'Named' && bee.title && NAMED_TITLES[bee.title];
    return t ? `${bee.name} \u201c${t.label}\u201d` : bee.name;
}

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
// distinct swarm animation for now (hive-mind.js reads bee.class to pick
// which - see hive-mind.css's hive-mind-patrol/hive-mind-forage/hive-mind-fortify/
// hive-mind-build/hive-mind-tend keyframes), same intentional "groundwork
// before mechanics" spirit as the numeric stats note used to be here.
// Oct 2026 (Hive Life): real honeybee jobs. Keys stay the same for saves
// made before (collector/guardian/barrier/architect/nurse) - only the
// names changed. zone = where the bee works in the hive view. stat = what
// makes it better at the job. maleOnly: only male bees (Drones). Every other
// job is done by female workers, like a real hive.
const BEE_CLASSES = {
    collector: { label: 'Forager', icon: '🌾', category: 'Gathering', zone: 'outside', stat: 'speed', description: 'Flies out to the flowers and brings back materials when you finish a task or daily.' },
    scout: { label: 'Scout', icon: '🔭', category: 'Gathering', zone: 'outside', stat: 'speed', description: 'Dances to show Foragers the best flowers: better odds of rare materials. Small chance of a gacha ticket when you finish a task.' },
    guardian: { label: 'Guard Bee', icon: '🛡️', category: 'Defense', zone: 'entrance', stat: 'defense', description: 'Fights raids at the entrance. Each Guard forgives one missed day of dailies per week (max 2).' },
    barrier: { label: 'Propolis Sealer', icon: '🟫', category: 'Defense', zone: 'entrance', stat: 'hp', description: 'Seals cracks with propolis (bee glue). Adds to raid defense.' },
    undertaker: { label: 'Undertaker', icon: '⚰️', category: 'Defense', zone: 'entrance', stat: 'hp', description: 'Carries fallen bees out of the hive. Each fallen bee leaves a little Pollen behind.' },
    architect: { label: 'Comb Builder', icon: '🏗️', category: 'Hive Management', zone: 'comb', stat: 'power', description: 'Builds new comb from wax. +1 loot roll when a quest finishes (max 3).' },
    cleaner: { label: 'Cleaner', icon: '🧹', category: 'Hive Management', zone: 'comb', stat: 'defense', description: 'Cleans cells and other bees. A lost raid hurts happiness less.' },
    honeymaker: { label: 'Honey Maker', icon: '🍯', category: 'Hive Management', zone: 'honey', stat: 'power', description: 'Ripens nectar into honey. Some days turns 3 Pollen into 1 Honey Drop.' },
    watercarrier: { label: 'Water Carrier', icon: '💧', category: 'Hive Management', zone: 'honey', stat: 'speed', description: 'Brings water to cool the hive. Working bees tire more slowly.' },
    nurse: { label: 'Nurse Bee', icon: '🥚', category: 'Hive Management', zone: 'brood', stat: 'offense', description: 'Feeds the young and the sick. Every bee heals a little faster.' },
    attendant: { label: "Queen's Attendant", icon: '👑', category: 'Royal Court', zone: 'royal', stat: 'power', description: 'Grooms and feeds your Queen. +1 Royal Nectar on each level-up.' },
    drone: { label: 'Drone', icon: '♂️', category: 'Royal Court', zone: 'royal', stat: null, maleOnly: true, description: 'Male bee. Mates with your Queen - some days your next gacha pull gets a better shot at Rare.' }
};

// What a Collector bee can bring back. Flat, deliberately small catalog -
// the Inventory page (src/features/inventory/) lists every entry here
// regardless of whether you've obtained any yet, so it reads as a full
// "collection dex," not just a list of what you happen to own.
const MATERIAL_CATALOG = [
    { id: 'pollen', label: 'Pollen', icon: '🌼', rarity: 'Common', description: 'Common material - nearly every Collector run has a shot at this.' },
    { id: 'royal-nectar', label: 'Royal Nectar', icon: '✨', rarity: 'Rare', description: 'Rare material - a refined drop straight from the queen\'s own stores.' },
    { id: 'honey-drop', label: 'Honey Drop', icon: '🍯', rarity: 'Epic', description: 'Epic-grade material - an exceptionally dense, solidified drop of pure hive honey. The hardest material to find.' },
    // Hive Life (Oct 2026): never dropped - made from 5 Honey Drops. Lets a bee live far longer.
    { id: 'royal-jelly', label: 'Royal Jelly', icon: '👑', rarity: 'Legendary', description: 'The food that turns a bee into a queen. Given to a bee, it lives about 120 days instead of 42. Made from 5 Honey Drops.' }
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

// A quest's total XP (sum of every task's xp) has to clear this to count
// as "accomplishes a great deal" and earn a gacha ticket on completion -
// matches the upper end of llm-engine.js's own "Hard task" XP anchors
// (90-180), so this is roughly "a whole quest's worth of hard work," not
// any quest at all.
const QUEST_TICKET_XP_THRESHOLD = 150;

// --- EVOLUTION ITEMS ------------------------------------------------------
// A second, rarer loot category alongside MATERIAL_CATALOG above - these
// aren't "collectibles," they're consumed to change a bee (see evolveBee/
// applyTraitItem below). Nanite-flavored on purpose (bolts/screws, drills)
// since the hive is explicitly mechanical, not organic - matches the
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
    // Start My Day (Oct 2026): saves one daily's streak on a miss, used
    // automatically. Paid in Honey coins, not materials.
    // Nov 1 2026 (Craft): unlocks Auto-swap for good (it also comes with auto-manage). One per hive.
    { id: 'queens-whistle', label: "Queen's Whistle", icon: '📯', kind: 'unlock', rarity: 'Legendary', price: { currency: 'coins', amount: 600 }, description: 'One blow and your hive swaps tired bees out by itself. Yours for good.' },
    { id: 'streak-charm', label: 'Streak Charm', icon: '🎁', kind: 'charm', rarity: 'Rare', price: { currency: 'coins', amount: 25 }, description: "Saves one daily's streak when you miss it. Used up automatically in the morning, after your Guard Bees, and only on streaks of 2 days or more." },
    // Held items (Oct 28 2026, approved demo): Rare and up hold them (see
    // beeItemSlots). 'use' items fire on their own when needed and are used
    // up; 'gear' stays on. Give one from the bee's card.
    { id: 'honey-extract', label: 'Honey Extract', icon: '🍯', kind: 'held', rarity: 'Common', hold: { type: 'use', when: 'hungry', gives: { fullness: 40 } }, price: { materialId: 'pollen', amount: 3 }, description: 'Held. When fullness drops below 40: +40 fullness. Used up.' },
    { id: 'nectar-shot', label: 'Nectar Shot', icon: '⚡', kind: 'held', rarity: 'Rare', hold: { type: 'use', when: 'tired', gives: { stamina: 40 } }, price: { materialId: 'royal-nectar', amount: 1 }, description: 'Held. When stamina drops below 25: +40 stamina. Used up.' },
    { id: 'propolis-bandage', label: 'Propolis Bandage', icon: '🩹', kind: 'held', rarity: 'Common', hold: { type: 'use', when: 'hurt', gives: { health: 30 } }, price: { materialId: 'pollen', amount: 4 }, description: 'Held. When hurt (health below 65): +30 health at once. Used up.' },
    { id: 'pollen-tonic', label: 'Pollen Tonic', icon: '🧪', kind: 'held', rarity: 'Rare', hold: { type: 'use', when: 'sick', gives: { cure: true } }, price: { materialId: 'pollen', amount: 5 }, description: 'Held. When sick: cures it. Used up.' },
    { id: 'boxing-gloves', label: 'Boxing Gloves', icon: '🥊', kind: 'held', rarity: 'Epic', hold: { type: 'gear', boost: { combat: 1.15 } }, price: { materialId: 'honey-drop', amount: 2 }, description: 'Held gear. +15% to this bee in raid fights. Stays on.' },
    { id: 'wax-shield', label: 'Wax Shield', icon: '🛡️', kind: 'held', rarity: 'Epic', hold: { type: 'gear', boost: { defense: 1.15 } }, price: { materialId: 'honey-drop', amount: 2 }, description: 'Held gear. +15% defense. Stays on.' },
    { id: 'wing-wax', label: 'Wing Wax', icon: '🪽', kind: 'held', rarity: 'Rare', hold: { type: 'gear', boost: { speed: 1.1 } }, price: { materialId: 'honey-drop', amount: 1 }, description: 'Held gear. +10% speed: forages more. Stays on.' },
    { id: 'identity-card', label: 'Identity Card', icon: '🪪', kind: 'identity', rarity: 'Legendary', price: { materialId: 'royal-nectar', amount: 3 }, description: "Guarantees a bee evolves straight into a full Named Beast. It keeps its name and earns a random title with a small power." }
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
// Oct 2026: each node is MASTERED automatically once its skill has enough
// real hours (needs.skills = any of these skills; needs.total = all your
// practice), and its parent is mastered. Once mastered it stays mastered.
const SKILL_TREE_CATALOG = [
    { id: 'codex-architect', parentId: null, name: 'Codex Architect', icon: '🧑🏾‍💼', description: 'The Core System. Current Status: Level 5 Web Developer. Ready for React integration.', needs: { total: true, hours: 10 } },

    { id: 'semantic-html', parentId: 'codex-architect', name: 'Semantic HTML Fluency', icon: '🧱', description: 'Mastery of meaningful HTML tags (header, nav, main) for better accessibility and SEO.', needs: { skills: ['HTML'], hours: 20 } },
    { id: 'modular-repo', parentId: 'semantic-html', name: 'Modular Repo Scaffolding', icon: '🏗️', description: 'Ability to set up clean, scalable project structures with organized folder hierarchies.', needs: { skills: ['HTML', 'Tools'], hours: 60 } },
    { id: 'github-pages', parentId: 'modular-repo', name: 'GitHub Pages Deployment', icon: '🚀', description: 'Pipeline established for publishing live projects directly to the web for recruiter access.', needs: { skills: ['Tools', 'HTML'], hours: 100 } },

    { id: 'css-fundamentals', parentId: 'codex-architect', name: 'CSS Fundamentals', icon: '🎨', description: 'The visual styling engine. Control over colors, typography, and the box model.', needs: { skills: ['CSS'], hours: 20 } },
    { id: 'responsive-design', parentId: 'css-fundamentals', name: 'Responsive Design', icon: '📱', description: 'Ensuring layouts adapt fluidly to mobile, tablet, and desktop screens.', needs: { skills: ['CSS'], hours: 60 } },
    { id: 'flexbox-grid', parentId: 'css-fundamentals', name: 'Flexbox/Grid', icon: '📐', description: 'Advanced layout modules for controlling complex positioning and alignment.', needs: { skills: ['CSS'], hours: 100 } },

    { id: 'js-essentials', parentId: 'codex-architect', name: 'JavaScript Essentials', icon: '🧠', description: 'The logic layer. Variables, functions, loops, and data types.', needs: { skills: ['JavaScript'], hours: 20 } },
    { id: 'dom-manipulation', parentId: 'js-essentials', name: 'DOM Manipulation', icon: '⚡', description: 'Ability to use JS to target HTML elements and change them dynamically.', needs: { skills: ['JavaScript', 'DOM'], hours: 60 } },
    { id: 'react-fundamentals', parentId: 'js-essentials', name: 'React Fundamentals', icon: '⚛️', description: 'Component-based UI architecture. The ability to build reusable, state-driven interfaces.', needs: { skills: ['React'], hours: 20 } }
];

// The chance a Common/Rare bee jumps to Epic when a 'trait' store item is
// applied to it - separate from (and in addition to) TRAIT_GRANT_CHANCE
// above, since the item always attempts the trait roll regardless of
// rarity, but only attempts THIS roll when there's actually room to climb.
const STORE_EVOLVE_TO_EPIC_CHANCE = 0.05;   // was 0.4 - rare tiers stay rare (Oct 2026)

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
// 1 material roll per QUEST_LOOT_XP_DIVISOR of the quest's total XP
// (minimum 1), plus a speed bonus for finishing fast - same-day earns the
// biggest bonus, within a few days still earns a smaller one.
const QUEST_LOOT_XP_DIVISOR = 100;
const QUEST_SPEED_INSTANT_DAYS = 0;
const QUEST_SPEED_INSTANT_BONUS_ROLLS = 2;
const QUEST_SPEED_FAST_DAYS = 2;
const QUEST_SPEED_FAST_BONUS_ROLLS = 1;

// #word capture (Oct 2026): typing #Closure (or #event-loop) in any task's
// title, notes or checklist adds that term to the Dictionary plugin, under
// the task's first skill tag (or General), definition left to fill in.
// Only words NEW to that text count, so deleting a term from the
// Dictionary doesn't bring it back on the next edit.
// Oct 2026: a capital starts a new word - #TimeManagement is "Time
// Management", #CSSGrid is "CSS Grid", #HTML stays "HTML".
function splitTagWords(name) {
    return String(name || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/\s+/g, ' ').trim();
}
function findHashtags(text) {
    const out = [];
    const re = /(^|[\s(\[,;:])#([A-Za-z][A-Za-z0-9_+.\-]{0,39})/g;
    let m;
    while ((m = re.exec(String(text || '')))) {
        const name = splitTagWords(m[2].replace(/[.\-_]+$/, '').replace(/[-_]+/g, ' ')).trim();
        if (name) out.push(name);
    }
    return out;
}
// Text plus its #words written out ("#TimeManagement" -> "Time Management"),
// so a Dictionary term still matches the task it was typed in.
function withHashtagWords(text) {
    const tags = findHashtags(text);
    return tags.length ? `${text} \n ${tags.join(' \n ')}` : String(text || '');
}
function hashtagTextOf(item) {
    if (!item) return '';
    return [item.label, item.notes, ...(item.checklist || []).map(c => c && (c.text || c.label))].filter(Boolean).join(' \n ');
}

const GACHA_PITY_PULLS = 6;        // 6th pull is Rare or better
const NAMED_BEAST_TICKETS = 10;    // a guaranteed Named Beast costs 10 tickets

// Level-up bee reward: a flat 1 bee per level-up (Oct 2026 - it used to
// grow 1, 1.5, 2, 2.5... per level, which flooded the hive).
function beesForLevel(level) {
    return 1;
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
    Common: { hp: [20, 40], offense: [4, 14], defense: [4, 14], speed: [4, 14], power: [4, 14] },
    Rare: { hp: [35, 55], offense: [10, 18], defense: [10, 18], speed: [10, 18], power: [10, 18] },
    Epic: { hp: [50, 75], offense: [16, 26], defense: [16, 26], speed: [16, 26], power: [16, 26] },
    Legendary: { hp: [70, 100], offense: [24, 36], defense: [24, 36], speed: [24, 36], power: [24, 36] },
    Named: { hp: [90, 130], offense: [32, 48], defense: [32, 48], speed: [32, 48], power: [32, 48] }
};

function rollStatValue([min, max]) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

// Every bee also rolls a FOCUS (one stat x1.5) and a WEAK spot (another
// stat x0.7), like a Pokemon nature - so two Commons really differ: a
// fast one, a tough one, a hard hitter. The card's theme follows the top
// stat (bee-card.js dominantStatKey), so the difference shows.
const BEE_SKILL_STATS = ['offense', 'defense', 'speed', 'power'];
function rollBeeStats(rarity) {
    const ranges = BEE_STAT_RANGES[rarity] || BEE_STAT_RANGES.Common;
    const stats = {
        level: 1,
        hp: rollStatValue(ranges.hp),
        offense: rollStatValue(ranges.offense),
        defense: rollStatValue(ranges.defense),
        speed: rollStatValue(ranges.speed),
        power: rollStatValue(ranges.power)
    };
    const focus = BEE_SKILL_STATS[Math.floor(Math.random() * 4)];
    const others = BEE_SKILL_STATS.filter(k => k !== focus);
    const weak = others[Math.floor(Math.random() * 3)];
    stats[focus] = Math.round(stats[focus] * 1.5);
    stats[weak] = Math.max(1, Math.round(stats[weak] * 0.7));
    return stats;
}

// How high merging can push a stat: 1.6x the best fresh roll of the tier.
function beeStatCap(rarity, key) {
    const ranges = BEE_STAT_RANGES[rarity] || BEE_STAT_RANGES.Common;
    return Math.round(ranges[key][1] * 1.6);
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

// Oct 31 2026 (Craft): height (cm) and Recovery (1-100, how well a bee
// recovers; shown on the card only for now, no game effect yet).
const BEE_HEIGHT_RANGES = { Common: [1.0, 1.4], Rare: [1.2, 1.7], Epic: [1.4, 2.0], Legendary: [1.7, 2.4], Named: [1.8, 2.6], Royal: [2.2, 2.8] };
const BEE_RECOVERY_RANGES = { Common: [20, 60], Rare: [30, 70], Epic: [40, 80], Legendary: [55, 90], Named: [60, 95], Royal: [70, 100] };
function rollBeeHeight(rarity) {
    const [min, max] = BEE_HEIGHT_RANGES[rarity] || BEE_HEIGHT_RANGES.Common;
    return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}
function rollBeeRecovery(rarity) {
    const [min, max] = BEE_RECOVERY_RANGES[rarity] || BEE_RECOVERY_RANGES.Common;
    return Math.round(min + Math.random() * (max - min));
}
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
    // Oct 31 2026 (Craft): each skill has a short line shown on the card.
    fire: [{ name: 'Ember Sting', power: 10, text: 'A hot jab that leaves a burn.' }, { name: 'Wax Melt', power: 20, text: 'Softens the foe\'s armor.' }],
    water: [{ name: 'Dew Drop', power: 10, text: 'A cool splash that refreshes.' }, { name: 'Cool Mist', power: 20, text: 'A haze that slows the foe.' }],
    earth: [{ name: 'Root Bind', power: 10, text: 'Roots hold the foe in place.' }, { name: 'Pollen Dust', power: 20, text: 'A cloud that makes foes sneeze.' }],
    wind: [{ name: 'Gale Buzz', power: 10, text: 'A gust from fast wings.' }, { name: 'Tailwind', power: 20, text: 'Speeds up the whole swarm.' }]
};

const KEEPERDEX_RARITY_SIGNATURE_SKILL = {
    Epic: { name: 'Overdrive Buzz', power: 35, text: 'Wings at full power for one big hit.' },
    Legendary: { name: 'Radiant Sting', power: 50, text: 'A blinding, glowing strike.' },
    Named: { name: 'Unbound Fury', power: 65, text: 'All its strength at once.' }
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
        // Oct 31 2026 (Craft): your Royal has no element, so its 4 cards could
        // never be found and 100% was impossible. Royal is last, so no other
        // card's number changes.
        if (rarityInfo.rarity === 'Royal') return;
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

// Combining always consumes both bees and always produces a new one.
// Oct 2026: it's mostly about STATS now - the result keeps the best of
// each stat from both parents plus a small boost (see combineBees). A
// rarity climb is a small chance, by the higher parent's tier:
const COMBINE_UPGRADE_CHANCE = { Common: 0.04, Rare: 0.015, Epic: 0.004, Legendary: 0 };

// Pure, stateless: derives level/currentXP/nextLevelXP from a total XP
// figure. Recomputed fresh every call instead of stored, for the same
// reason as computeTotalXP above.
//
// REBALANCED TWICE. v1 (original): starts at 1000, x1.5 compounding - by
// level 20 that demands over 2 million XP for a single level, which is why
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
// Oct 2026: tied to time. Reaching level L takes 60 x L x (L - 1) XP -
// about L x (L - 1) hours (level 5 = 20 h, 10 = 90 h, 20 = 380 h,
// 100 = 9,900 h ~ 10,000 hours). Each level costs 120 x L XP.
// Oct 27 2026 (Craft): "Gentle" curve. Quick to level 10, then each level
// costs a little more (about a week each for a casual ~90 XP/day player).
// Level 50 is the cap; after it the player reaches Prestige. Every TIER_XP
// is a Prestige Tier (internal level 51 = Tier 1, 52 = Tier 2...). The level
// keeps counting in the background, but Tiers are what the player sees.
// Each Tier has its own reward (levelUpCharacterBar).
const LEVEL_CAP = 50, TIER_XP = 6000;
const levelCost = (L) => L >= LEVEL_CAP ? TIER_XP : L < 10 ? 120 + 60 * (L - 1) : 660 + 15 * (L - 10);
const _xpToReach = [0, 0];
const characterXPToReach = (level) => {
    if (level <= 1) return 0;
    for (let l = _xpToReach.length; l <= level; l++) _xpToReach[l] = _xpToReach[l - 1] + levelCost(l - 1);
    return _xpToReach[level];
};
// "LV 23". Oct 31 2026 (Craft): past level 50 the chip keeps the level
// number (LV 53); the Tier (5 levels each since Nov 1 2026) is your RANK now, see RANKS.
function levelLabel(level) {
    return `LV ${level}`;
}
function levelName(level) {
    return `Level ${level}`;
}
// The level bar changes colour every 10 levels; Tiers are purple-pink.
const LEVEL_COLORS = [['#ffd84a', '#e6b52c'], ['#ffb347', '#ff7a1a'], ['#ff6b6b', '#dc143c'], ['#6fc3ff', '#2f7de1'], ['#7ef0a8', '#22a866']];
function levelColor(level) {
    if (level > LEVEL_CAP) return ['#d38bff', '#ff2d78'];
    return LEVEL_COLORS[Math.min(LEVEL_COLORS.length - 1, Math.floor((Math.max(1, level) - 1) / 10))];
}

function computeLevelProgress(totalXP) {
    let level = 1;
    while (totalXP >= characterXPToReach(level + 1)) level++;
    return { level, currentXP: totalXP - characterXPToReach(level), nextLevelXP: characterXPToReach(level + 1) - characterXPToReach(level) };
}

// Same curve, but for the ACKNOWLEDGED level: the bar can be full and wait
// for you to press Level Up (levelUpCharacterBar).
function computeCharacterLevelBandState(totalXP, acknowledgedLevel) {
    const level = acknowledgedLevel || 1;
    const from = characterXPToReach(level), cap = characterXPToReach(level + 1) - from;
    const xpIntoLevel = Math.min(cap, Math.max(0, totalXP - from));
    return {
        level,
        xpIntoLevel,
        cap,
        percentage: Math.min(100, (xpIntoLevel / cap) * 100),
        maxed: totalXP >= from + cap
    };
}

// Character level-up tickets grow: 1, plus 1 more per 10 levels.
const ticketsForLevel = (level) => 1 + Math.floor(level / 10);
function expectedLevelTickets(level) {
    let n = 0;
    for (let l = 2; l <= level; l++) n += ticketsForLevel(l);
    return n;
}


// ============================================================================
// HIVE LIFE (Oct 2026, approved demo) - real bee roles, vitals, faint/death,
// old age, raids and counter-raids. Pure helpers first, then Vault methods
// (attached to DatabaseManager.prototype below the class).
//
// Every non-royal bee gets bee.sex ('f'/'m', 1 in 10 male - only males can
// be Drones) and bee.life:
//   { health, stamina, fullness, happiness  (0-100)
//     bornAt (YYYY-MM-DD), faintedAt (date|null), royalJelly (bool),
//     birthTrait (null | BIRTH_TRAITS id - rare, set at birth) }
// Mood isn't stored - it follows the vitals and your daily streak.
// Once a day (on app open) hiveDailyTick() runs every missed day (max 14):
// hunger, stamina, health, happiness, faint -> death after LIFE.faintDays,
// old age, Honey Makers, Drones and a random raid (more likely on a bad
// streak). Finishing a task/daily feeds every bee (_feedHive).
// ============================================================================
// Daily bonus week (Nov 1 2026, Craft): day 1 -> day 7.
const DAILY_BONUS = [
    { kind: 'coins', qty: 5, icon: '🪙', name: 'Honey coins' },
    { kind: 'coins', qty: 10, icon: '🪙', name: 'Honey coins' },
    { kind: 'pollen', qty: 2, icon: '🌼', name: 'Pollen' },
    { kind: 'coins', qty: 15, icon: '🪙', name: 'Honey coins' },
    { kind: 'pollen', qty: 3, icon: '🌼', name: 'Pollen' },
    { kind: 'royal-nectar', qty: 1, icon: '✨', name: 'Royal Nectar' },
    { kind: 'ticket', qty: 1, icon: '🎟️', name: 'Gacha ticket' }
];
const STREAK_GOAL = 5;   // Nov 1 2026 (Craft): tasks a day needs to count toward your streak
// Nov 1 2026 (Craft): + a weekly bonus every Sunday while your streak is 7+
// days, so there's always one coming (7 to 30 days was a long wait).
const STREAK_BONUS = { allDailies: 20, weekly: 75, milestones: [[3, 30], [30, 300], [100, 1000]] };

const LIFE = {
    // Death is paused (Craft, Oct 2026): bees still faint and can be
    // revived, but nobody dies of neglect or old age. Flip to true to bring
    // death, old age and Royal Jelly back - all the code is still here.
    deathEnabled: false,
    lifespan: 42, jellyLifespan: 120, faintDays: 3, maxCatchUp: 14,
    reviveCost: 10, jellyCost: 5, maleChance: 0.1, traitChance: 0.08,
    hungerPerDay: 15, feedPerTask: 4, eventsKept: 30,
    // Oct 27 2026 (Craft): missed tasks hurt the whole hive, and a Fatigue
    // stat makes worn-out bees rest. Fatigue climbs while working and drops
    // while resting; at 100 the bee must rest for restDays.
    fatiguePerWorkDay: 12, fatigueRest: 30, restDays: 2, sickDays: 3, injuredDays: 2,
    // Oct 28 2026 (Craft): bees in the Rest Comb eat. Resting refills fullness.
    restFeedPerDay: 25,
    // Comb rooms (Oct 2026): new bees start as eggs in the Nursery for
    // broodDays (5, Craft Oct 2026; a working Nurse Bee takes a day off). A bee with no job
    // for idleUpsetDays gets upset.
    // Oct 28 2026 (Craft): eggs take 7 days, so the Egg Incubator has a job.
    broodDays: 7, idleUpsetDays: 3
};
// Bee names (Oct 2026): new bees get a real name instead of "Common Bee
// #12", so they're easy to tell apart. Old bees still on that default name
// get one once (never a bee you renamed). randomBeeName() skips names
// already in your hive; when all are used it adds II, III...
const BEE_NAME_POOL = ['Buzz', 'Honey', 'Clover', 'Pip', 'Bramble', 'Fern', 'Moss', 'Sage', 'Nectar', 'Pollen', 'Wax', 'Amber', 'Maple', 'Hazel', 'Juniper',
    'Willow', 'Poppy', 'Daisy', 'Marigold', 'Thistle', 'Basil', 'Saffron', 'Ginger', 'Nutmeg', 'Cinnamon', 'Biscuit', 'Waffle', 'Muffin', 'Toffee', 'Caramel',
    'Butterscotch', 'Sunny', 'Goldie', 'Dandelion', 'Buttercup', 'Bluebell', 'Heather', 'Lavender', 'Rosemary', 'Thyme', 'Mint', 'Olive', 'Peaches', 'Plum',
    'Apricot', 'Quince', 'Acorn', 'Pebble', 'Flint', 'Rusty', 'Copper', 'Bronze', 'Nugget', 'Sparky', 'Zippy', 'Dash', 'Comet', 'Blitz', 'Zoom', 'Whizz',
    'Hum', 'Bumble', 'Fuzzy', 'Velvet', 'Stripes', 'Dot', 'Freckle', 'Speckle', 'Twig', 'Bark', 'Pine', 'Cedar', 'Birch', 'Rowan', 'Aspen', 'Hollis',
    'Wren', 'Robin', 'Finch', 'Lark', 'Sparrow', 'Echo', 'Nova', 'Luna', 'Sol', 'Orbit', 'Pixel', 'Bolt', 'Gizmo', 'Widget', 'Rivet', 'Sprocket', 'Cog',
    'Gadget', 'Turbo', 'Jet', 'Rocket', 'Ziggy', 'Bingo', 'Pippin', 'Tansy', 'Yarrow', 'Sorrel', 'Briar', 'Hawthorn', 'Elder', 'Linden', 'Laurel', 'Ivy',
    'Holly', 'Bramblebee', 'Mallow', 'Primrose', 'Petal', 'Blossom', 'Bud', 'Sprout', 'Meadow', 'Brook', 'River', 'Misty', 'Cloud', 'Storm', 'Thunder',
    'Breeze', 'Gale', 'Ember', 'Blaze', 'Cinder', 'Ash', 'Frost', 'Glacier', 'Pearl', 'Opal', 'Jade', 'Ruby', 'Topaz', 'Garnet', 'Onyx', 'Quartz',
    'Mochi', 'Dumpling', 'Noodle', 'Pickle', 'Nacho', 'Pretzel', 'Crumpet', 'Scone', 'Truffle', 'Fudge', 'Gumdrop', 'Jellybean', 'Sprinkles', 'Cupcake'];
const DEFAULT_BEE_NAME = /^(Common|Rare|Epic|Legendary|Worker) Bee #\d+$/;
function randomBeeName(taken = [], rand = Math.random) {
    const used = new Set(taken.map(n => String(n).toLowerCase()));
    const free = BEE_NAME_POOL.filter(n => !used.has(n.toLowerCase()));
    if (free.length) return free[Math.floor(rand() * free.length)];
    const base = BEE_NAME_POOL[Math.floor(rand() * BEE_NAME_POOL.length)];
    for (const tag of ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']) if (!used.has(`${base} ${tag}`.toLowerCase())) return `${base} ${tag}`;
    return `${base} ${Math.floor(rand() * 900) + 100}`;
}

// Where new bees come from as eggs. Combined bees are grown-ups already.
// ============================================================================
// QUEEN STATS + START MY DAY (Oct 2026, approved demo) - Habitica-style
// health, XP and Honey coins for your Queen (or King), shown on Home.
// state.queen = { since, hp, spent, lost, xpLost, healed[], reviewedOn,
//                 guardLog[{beeId, date}] }
// - Coins are counted live from what you finish since `since` (the day this
//   arrived), so un-checking a task takes its coins back. spent = shop,
//   lost = fainting.
// - Health: a missed daily (Start My Day) or a bad-habit tap hurts by
//   difficulty; finishing a daily/to-do/quest task heals 1 (once per task
//   per day); level-up refills it. At 0 the Queen faints: -10% coins, this
//   level's XP progress is lost (never a level), health back to half, bees
//   get sad.
// - Start My Day: the first open of a new day asks about YESTERDAY's dailies
//   and to-dos. Anything not done is missed: health damage, and its streak
//   is lost unless a Guard Bee (2 saves a week each, after 3 days on the
//   job) or a Streak Charm (Honey Store, 2+ day streaks) saves it.
// ============================================================================
const QUEEN = {
    maxHp: 50,
    hit: { Trivial: 1, Easy: 2, Medium: 4, Hard: 7 },
    coin: { Trivial: 1, Easy: 2, Medium: 3, Hard: 5 },
    heal: 1, guardSaves: 2, guardDays: 3, charmMinStreak: 2,
    // Nov 7 2026 (Craft): Batch 24. A faint no longer takes coins or XP. It gives a
    // timed XP debuff instead: -20% XP for 1 hour. A second faint resets the timer.
    debuffMs: 60 * 60 * 1000, debuffMult: 0.8
};
function queenDifficulty(task) {
    const d = String((task && task.difficulty) || '').toLowerCase();
    return d === 'trivial' ? 'Trivial' : d === 'medium' ? 'Medium' : d === 'hard' ? 'Hard' : 'Easy';
}
const queenHit = (task) => QUEEN.hit[queenDifficulty(task)];
const queenCoin = (task) => QUEEN.coin[queenDifficulty(task)];
// Coins earned from everything finished on or after `since`.
function computeQueenCoins(state, since) {
    if (!state || !since) return 0;
    let n = 0;
    (state.dailyTasks || []).forEach(t => { n += (t.completedDates || []).filter(d => d >= since).length * queenCoin(t); });
    (state.todos || []).forEach(t => { if (t.completed && t.completedDate && t.completedDate >= since) n += queenCoin(t); });
    (state.habits || []).forEach(h => { n += (h.history || []).filter(x => x.direction === 'positive' && x.date >= since).length * queenCoin(h); });
    (state.quests || []).forEach(q => (q.tasks || []).forEach(t => { if (t.completed && t.dateCompleted && localDayOf(t.dateCompleted) >= since) n += queenCoin(t);   /* Oct 31 2026 (Craft): local day */ }));
    return n;
}

// PBKDF2 rounds for the Account PIN check (see setAccountPin).
const PIN_CHECK_ITER = 200000;
const BROOD_SOURCES = ['gacha', 'levelup', 'skill'];
const BIRTH_TRAITS = {
    'stout-heart': { label: 'Stout Heart', text: '+2% hive happiness when full' },
    'deep-stomach': { label: 'Deep Stomach', text: 'Gets hungry 25% slower' },
    'swift-wings': { label: 'Swift Wings', text: 'Foraging finds 10% more' },
    'iron-shell': { label: 'Iron Shell', text: '+10 raid defense' },
    'long-lived': { label: 'Long-Lived', text: 'Lives 25% longer' }
};
// ---- Hour by hour (Oct 28 2026, approved demo) ----
// Vitals change every hour, not once a night. Bees work 7 AM - 10 PM and
// everyone sleeps 10 PM - 7 AM. Per working hour, by job:
// [stamina, fullness, happiness, fatigue]. Tune here.
const JOB_RATES = {
    collector: [-6, -4, -1, 3], scout: [-7, -4, 0, 3.5], guardian: [-4, -3, -1.5, 2.5], barrier: [-4, -3, -1, 2],
    undertaker: [-3, -2, -2, 2], architect: [-5, -4, -1, 3], cleaner: [-3, -2, -1, 1.5], honeymaker: [-3, -3, 0.5, 2],
    watercarrier: [-5, -3, -0.5, 2.5], nurse: [-3, -2, 0.5, 2], attendant: [-2, -2, 1, 1.5], drone: [-1, -3, 0, 0.5]
};
// Per hour not working: [stamina, fullness, happiness, fatigue, health (if fullness 50+)].
const REST_RATES = {
    day: [4, 2.5, 1, -3, 1],          // resting or recuperating by day: helps, less than sleep
    night: [7, 2.5, 1, -6, 2],        // everyone's sleep
    nursery: [4, 2.5, 1, -3, 4]       // a Nursery bed: heals 4x faster (+1 per working Nurse, max +3)
};
// Nov 1 2026 (Craft): Hive Life combs and the jobs done in each (same as
// HiveLife.COMBS). Used by the comb strength and by auto-manage.
// Nov 1 2026 (Craft): the hive grows with your level. One new job slot
// every 1-2 levels (the Lv 1 job becomes your first bee's talent).
let HIVE_JOB_RULES = true;   // tests of the older job mechanics turn this off
// Nov 3 2026 (Craft; approved demo): like a real colony. About 4 in 5
// adult bees work; each open job takes its share of them (at least 1).
// The same shares are the odds of a new bee's talent. Drones: every male.
const HIVE_JOB_SHARES = { collector: 22, nurse: 18, honeymaker: 14, cleaner: 12, architect: 10, watercarrier: 8, scout: 6, guardian: 6, attendant: 4, barrier: 3, undertaker: 3 };
const HIVE_WORK_SHARE = 0.8;
const MERGE_GAP_CHANCE = 0.35;   // a merged bee may get a talent the hive is missing
const HIVE_JOB_LADDER = [
    { lv: 1, job: 'nurse' }, { lv: 2, job: 'honeymaker' }, { lv: 4, job: 'collector' }, { lv: 5, job: 'guardian' },
    { lv: 7, job: 'watercarrier' }, { lv: 8, job: 'architect' }, { lv: 10, job: 'attendant' }, { lv: 11, job: 'cleaner' },
    { lv: 13, job: 'scout' }, { lv: 14, job: 'drone' }, { lv: 16, job: 'barrier' }, { lv: 17, job: 'undertaker' }
];
const HIVE_COMB_JOBS = {
    royal: { name: 'Royal Chamber', jobs: ['attendant', 'drone'] },
    nursery: { name: 'Nursery', jobs: ['nurse'] },
    honey: { name: 'Honey Store', jobs: ['honeymaker', 'watercarrier'] },
    workshop: { name: 'Workshop', jobs: ['architect', 'cleaner'] },
    entrance: { name: 'Entrance', jobs: ['guardian', 'barrier', 'undertaker', 'collector', 'scout'] }
};
// How good a bee is at a job, about 1-100 (from 1.0.7's WorkerCard). The
// job's stat, +20% for its talent, less if it's not well or tired.
function beeJobScore(bee, job) {
    const info = BEE_CLASSES[job];
    if (!bee || !info) return 0;
    let s = info.stat ? Number((bee.stats || {})[info.stat]) || 40 : 40;
    if (info.stat === 'hp') s = s / 3;   // hp runs ~3x the other stats
    if (bee.talent === job) s *= 1.2;
    const probs = beeProblems(bee);
    if (probs) s *= probs >= 2 ? 0.7 : 0.85;
    const L = bee.life || {};
    if (L.stamina != null) s *= 0.6 + 0.4 * Math.min(1, L.stamina / 60);
    return Math.max(1, Math.min(100, Math.round(s)));
}
const COMB_FULL_TEAM = 3;   // three good workers = 100%
function combPower(bees, jobs) {
    const total = bees.reduce((n, b) => n + (jobs.includes(b.class) ? beeJobScore(b, b.class) : 0), 0);
    return Math.min(100, Math.round(total / (COMB_FULL_TEAM * 70) * 100));
}

const WORK_HOURS = [7, 22];           // 7 AM to 10 PM
const isNightHour = (h) => h < WORK_HOURS[0] || h >= WORK_HOURS[1];
// Hurt levels from health (replaces "Injured"): 0 fine, 1 Hurt, 2 Badly hurt, 3 Severely hurt (can't work).
const HURT_LEVELS = [null, { key: 'hurt', label: 'Hurt', icon: '🩹', below: 65 }, { key: 'badly', label: 'Badly hurt', icon: '🤕', below: 50 }, { key: 'severe', label: 'Severely hurt', icon: '🚑', below: 30 }];
function beeHurtLevel(bee) {
    const h = bee && bee.life ? bee.life.health : 100;
    return h < 30 ? 3 : h < 50 ? 2 : h < 65 ? 1 : 0;
}
// How many "not well" problems: hungry, tired, sick, hurt (badly hurt counts 2).
function beeProblems(bee) {
    const L = bee && bee.life;
    if (!L || L.hatchOn || L.faintedAt) return 0;
    const hurt = beeHurtLevel(bee);
    return (L.fullness < 40 ? 1 : 0) + (L.stamina < 30 ? 1 : 0) + (L.sickUntil ? 1 : 0) + (hurt >= 2 ? 2 : hurt);
}
// Stats, perks and work: -15% with 1 problem, -30% with 2 or more.
function beeWellFactor(bee) {
    const n = beeProblems(bee);
    return n >= 2 ? 0.7 : n === 1 ? 0.85 : 1;
}
// Fatigue builds 2x faster with 1 problem, 3x with 2 or more.
function beeFatigueFactor(bee) {
    const n = beeProblems(bee);
    return n >= 2 ? 3 : n === 1 ? 2 : 1;
}
const NURSERY_BEDS = 2;               // + 1 per working Nurse
// Held item slots: Common 0, Rare and Epic 1, Legendary and Named 2.
function beeItemSlots(bee) {
    const r = bee && bee.rarity;
    return r === 'Legendary' || r === 'Named' ? 2 : r === 'Rare' || r === 'Epic' ? 1 : 0;
}
// Gear multiplier for a stat ('combat' | 'defense' | 'speed'), 1 = none.
function beeGear(bee, key) {
    return (bee && Array.isArray(bee.held) ? bee.held : []).reduce((m, id) => {
        const it = id && STORE_ITEM_CATALOG.find(i => i.id === id);
        return m * (it && it.hold && it.hold.type === 'gear' && it.hold.boost[key] ? it.hold.boost[key] : 1);
    }, 1);
}

// Egg Incubator (Oct 28 2026, approved demo; plugin src/plugins/incubator/).
// Bought with Honey coins. Every egg inside loses 1 day each time you reach
// the step goal, and every INCUBATOR_DAILIES finished dailies also count
// (so it works on the website too). At most `cap` days off a day.
// Extras on hatch: full (no hunger), happy, and a better birth-trait chance.
const INCUBATORS = {
    basic: { label: 'Basic Incubator', icon: '🪺', price: 150, slots: 1, goal: 5000, cap: 2, full: false, happy: false, trait: 0 },
    warm: { label: 'Warm Incubator', icon: '🔆', price: 400, slots: 2, goal: 4000, cap: 2, full: true, happy: false, trait: 0 },
    honey: { label: 'Honeycomb Incubator', icon: '🍯', price: 900, slots: 3, goal: 3000, cap: 2, full: true, happy: true, trait: .05 },
    royal: { label: 'Royal Incubator', icon: '👑', price: 2000, slots: 3, goal: 3000, cap: 3, full: true, happy: true, trait: .15 }
};
const INCUBATOR_ORDER = ['basic', 'warm', 'honey', 'royal'];
const INCUBATOR_DAILIES = 4;

const RAID_ENEMIES = [
    { id: 'hornets', label: 'Hornet raid', icon: '🦟', power: 1.2 },
    { id: 'wasps', label: 'Wasp raid', icon: '🐝', power: 1.0 },
    { id: 'robbers', label: 'Robber bees', icon: '🏴', power: 0.8 },
    { id: 'mites', label: 'Mite outbreak', icon: '🦠', power: 0.9 }
];
// frac = keep one decimal (hourly changes like +0.2 add up); shown rounded.
const clampVital = (n, frac) => Math.max(0, Math.min(100, frac ? Math.round(n * 10) / 10 : Math.round(n)));
const isoLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lifeRand = () => Math.random();

// Stable 1-in-10 for bees that existed before Hive Life, so a reload never
// changes anyone's sex. A bee that already has a job stays female (only
// Drones can be male).
function backfillBeeSex(bee) {
    if (bee.class && bee.class !== 'drone') return 'f';
    let h = 0;
    for (const ch of String(bee.id || bee.name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 10 === 0 ? 'm' : 'f';
}

function freshBeeLife(today, rand = lifeRand) {
    const traits = Object.keys(BIRTH_TRAITS);
    return {
        health: 100, stamina: 100, fullness: 80, happiness: 70, fatigue: 0,
        bornAt: today, faintedAt: null, royalJelly: false,
        birthTrait: rand() < LIFE.traitChance ? traits[Math.floor(rand() * traits.length)] : null
    };
}

// Adds sex + life to a bee that doesn't have them. Returns true if changed.
function ensureBeeLife(bee, today = todayISO(), { isNew = false } = {}) {
    if (!bee || bee.rarity === 'Royal') return false;
    let changed = false;
    if (bee.sex !== 'f' && bee.sex !== 'm') {
        bee.sex = isNew ? (bee.class ? (bee.class === 'drone' ? 'm' : 'f') : (lifeRand() < LIFE.maleChance ? 'm' : 'f')) : backfillBeeSex(bee);
        changed = true;
    }
    if (!bee.life || typeof bee.life !== 'object') {
        bee.life = freshBeeLife(today);
        if (isNew && BROOD_SOURCES.includes(bee.source)) bee.life.hatchOn = shiftISODate(today, LIFE.broodDays);
        changed = true;
    }
    if (!bee.class && !bee.life.hatchOn && !bee.life.idleSince) { bee.life.idleSince = today; changed = true; }
    if (!bee.talent && bee.rarity !== 'Named') {
        // Old bees get a stable talent from their id; new ones a random one.
        let h = 7;
        for (const ch of String(bee.id || bee.name || '')) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
        bee.talent = pickBeeTalent(bee, isNew ? Math.random : () => (h % 1000) / 1000);
        changed = true;
    }
    return changed;
}

function beeLifespan(bee) {
    const base = bee.life && bee.life.royalJelly ? LIFE.jellyLifespan : LIFE.lifespan;
    return Math.round(base * (bee.life && bee.life.birthTrait === 'long-lived' ? 1.25 : 1));
}

function beeAgeDays(bee, today = todayISO()) {
    if (!bee.life || !bee.life.bornAt) return 0;
    return Math.max(0, daysBetween(bee.life.bornAt, today) || 0);
}

function beeIsFainted(bee) { return !!(bee.life && bee.life.faintedAt); }
// Able to do its job: alive, awake and not exhausted.
function beeCanWork(bee, today = todayISO()) {
    const L = bee.life;
    return !!(L && !L.faintedAt && !L.hatchOn && L.stamina >= 10 && L.health >= 30 && !beeOutOfAction(bee, today));
}
// Sick, injured or forced to rest (the reason), or null if fine.
function beeOutOfAction(bee, today = todayISO()) {
    const L = bee && bee.life;
    if (!L) return null;
    if (L.nursery) return 'nursery';
    if (L.sickUntil && L.sickUntil > today) return 'sick';
    if (L.restUntil && L.restUntil > today) return 'resting';
    return null;
}
// Still an egg in the Nursery.
function beeIsBrood(bee) { return !!(bee && bee.life && bee.life.hatchOn); }
function broodDaysLeft(bee, today = todayISO(), nurses = 0) {
    if (!beeIsBrood(bee)) return 0;
    return Math.max(0, (daysBetween(today, bee.life.hatchOn) || 0) - (nurses > 0 ? 1 : 0));
}
// What pops out of a bee: happy (has a job, all good), sad (hungry, tired
// or hurt), upset (no job for LIFE.idleUpsetDays+), calm (no job yet).
function beeFeeling(bee, today = todayISO()) {
    const L = bee && bee.life;
    if (!L) return { key: 'calm', face: '🙂', why: 'Doing fine' };
    if (L.hatchOn) return { key: 'egg', face: '🥚', why: 'Still an egg' };
    if (L.faintedAt) return { key: 'fainted', face: '😵', why: 'Fainted' };
    const idle = !bee.class && L.idleSince ? (daysBetween(L.idleSince, today) || 0) : 0;
    if (!bee.class && idle >= LIFE.idleUpsetDays) return { key: 'upset', face: '😠', why: `No job for ${idle} days` };
    const out = beeOutOfAction(bee, today);
    if (out === 'nursery') return { key: 'calm', face: '🛏️', why: 'In the Nursery' };
    if (out === 'sick') return { key: 'sad', face: '🤒', why: 'Sick' };
    const hurt = beeHurtLevel(bee);
    if (hurt) return { key: 'sad', face: HURT_LEVELS[hurt].icon, why: HURT_LEVELS[hurt].label + (hurt === 3 ? ', can\'t work' : '') };
    if (out === 'resting') return { key: 'calm', face: '😴', why: 'Exhausted, resting' };
    const lack = [L.fullness < 40 && 'Hungry', L.stamina < 30 && 'Tired', (L.fatigue || 0) >= 80 && 'Worn out', L.happiness < 30 && 'Unhappy'].filter(Boolean);
    if (lack.length) return { key: 'sad', face: '😢', why: lack.join(', ') };
    if (L.recuperate) return { key: 'calm', face: '💤', why: 'Recuperating' };
    if (!bee.class) return { key: 'calm', face: '🙂', why: 'Waiting for a job' };
    return { key: 'happy', face: '😊', why: 'All good' };
}

// Exactly what a bee needs, with numbers and the fix (Oct 28 2026, Craft:
// "no guess work"). [] = nothing.
function beeNeeds(bee, today = todayISO()) {
    const L = bee && bee.life;
    if (!L || L.hatchOn) return [];
    if (L.faintedAt) return [{ need: 'Fainted', value: `health ${Math.round(L.health)}/100`, fix: 'Revive it from its card (Honey Drops).' }];
    const out = [];
    const idle = !bee.class && L.idleSince ? (daysBetween(L.idleSince, today) || 0) : 0;
    if (!bee.class && !L.recuperate && idle >= LIFE.idleUpsetDays) out.push({ need: 'No job', value: `${idle} days`, fix: 'Give it a job, or set it to Recuperate.' });
    const inBed = !!L.nursery;
    if (L.sickUntil) out.push({ need: 'Sick', value: `until ${L.sickUntil}`, fix: inBed ? 'In the Nursery: it heals 2× faster.' : 'Send it to the Nursery to heal 2× faster.' });
    const hurt = beeHurtLevel(bee);
    if (hurt) out.push({ need: HURT_LEVELS[hurt].label, value: `health ${Math.round(L.health)}/100`, fix: inBed ? 'In the Nursery: +4 health an hour.' : hurt === 3 ? 'Can\'t work. Send it to the Nursery (+4 an hour) or set it to Recuperate (+1 an hour).' : 'Nursery: +4 health an hour. Recuperate: +1 an hour.' });
    if (L.fullness < 40) out.push({ need: 'Hungry', value: `fullness ${Math.round(L.fullness)}/100`, fix: 'Finish tasks (+4 each), or let it recuperate (eats +2.5 an hour).' });
    if (L.stamina < 30) out.push({ need: 'Tired', value: `stamina ${Math.round(L.stamina)}/100`, fix: 'Recuperate: +4 an hour by day, +7 asleep at night.' });
    if ((L.fatigue || 0) >= 80) out.push({ need: 'Worn out', value: `fatigue ${Math.round(L.fatigue)}/100`, fix: 'Recuperate: −3 an hour by day, −6 at night. At 100 it must rest 2 days.' });
    if (L.happiness < 30) out.push({ need: 'Unhappy', value: `happiness ${Math.round(L.happiness)}/100`, fix: 'Finish all your dailies. A streak cheers the hive up.' });
    return out;
}

// Hive streak from your Dailies: +N = N days in a row with every due daily
// done, -N = N days in a row missing one. Today doesn't count yet. Each
// working Guard Bee forgives one missed day per week (max 2).
function computeHiveStreak(dailies, today = todayISO(), guards = 0) {
    const list = dailies || [];
    if (!list.length) return 0;
    let forgive = Math.min(2, guards);
    let streak = 0, sign = 0;
    for (let i = 1; i <= 14; i++) {
        const day = shiftISODate(today, -i);
        const due = list.filter(d => (!d.startDate || d.startDate <= day) && isDailyDueOn(d, day));
        if (!due.length) continue;
        let ok = due.every(d => (d.completedDates || []).includes(day));
        if (!ok && i <= 7 && forgive > 0) { forgive--; ok = true; }
        const s = ok ? 1 : -1;
        if (sign === 0) sign = s;
        if (s !== sign) break;
        streak += s;
    }
    return streak;
}

function beeMood(bee, streak = 0) {
    if (!bee.life) return { label: 'Content', face: '🙂', score: 60 };
    if (bee.life.faintedAt) return { label: 'Fainted', face: '😵', score: 0 };
    const score = (bee.life.health + bee.life.fullness + bee.life.happiness) / 3 + streak * 4;
    if (score > 80) return { label: 'Joyful', face: '😄', score };
    if (score > 60) return { label: 'Content', face: '🙂', score };
    if (score > 40) return { label: 'Uneasy', face: '😐', score };
    if (score > 20) return { label: 'Miserable', face: '😟', score };
    return { label: 'Despairing', face: '😫', score };
}

// Raid chance per day: ~12% normally, higher on a bad streak (max 45%).
function raidChance(streak) { return Math.max(0.03, Math.min(0.45, 0.12 - streak * 0.03)); }


// Oct 31 2026 (Craft): is this the PC LOCAL test copy? (see DatabaseManager)
function isPcLocalHost() {
    if (typeof location === 'undefined') return false;
    const host = location.hostname || '';
    if (location.protocol === 'file:') return true;
    // Nov 1 2026 (Craft): https://localhost with no port is the Android app's own copy, not PC LOCAL.
    if (location.protocol === 'https:' && host === 'localhost' && !location.port) return false;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local')
        || /^(10|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
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
        // Oct 31 2026 (Craft): PC LOCAL. On this computer (localhost, a local
        // network address, or a file opened directly) the app runs a local
        // test account under its own key: name "Developer", King "Test Bee".
        // No login, no cloud, dev tools always on. It can't reach your real
        // save. Counts as a test save everywhere (devTest), so every
        // "never sync / never back up" guard applies.
        this.pcLocal = isPcLocalHost();
        if (this.pcLocal) {
            this.devTest = true;
            this.storageKey = 'bizzybee_user_data:pclocal';
            // Oct 31 2026 (Craft): pages hide cloud controls on PC LOCAL (no cloud here).
            if (typeof document !== 'undefined' && document.documentElement) document.documentElement.classList.add('pc-local');
            if (localStorage.getItem('bizzybee_session') !== 'local') localStorage.setItem('bizzybee_session', 'local');
        } else if (this.devTest) {
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
            const response = await fetch((typeof window !== 'undefined' && window.BB_SITE || '') + '/.netlify/functions/load-state', {   // Nov 1 2026 (Craft)
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
        // Oct 31 2026 (Craft): Colony -> Hive Mind. Keep a device copy of the
        // save as it was, then move "colony" to "hive" (see migrateHiveKey).
        migrateHiveStorage();
        let hiveRenamed = false;
        if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'colony')) {
            try { this.createLocalBackup('Before Hive Mind rename'); } catch { /* full: the move is safe anyway */ }
            hiveRenamed = migrateHiveKey(parsed);
        }
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
            else if (hiveRenamed) { try { localStorage.setItem(this.storageKey, JSON.stringify(parsed)); } catch { /* next save writes it */ } }
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
        // One-time switch to time-based XP (Oct 2026).
        this._ensureTimeXP();
        // Hive Life (Oct 2026): sex + vitals on every bee, then the daily tick.
        this._ensureBeeLife();
        this._nameDefaultBees();
        this._splitNamedTitles();
        this._splitHashtagTerms();
        this._ensureQueen();
        if (this.pcLocal && !this.state.pcLocalSeeded) this._seedPcLocal();   // Oct 31 2026 (Craft)
        this.hiveHourlyTick();
        this._pendingLifeEvents = this.hiveDailyTick();
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
        if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) || window.BB_APP_COPY   // Nov 1 2026 (Craft): not in the app's own copy
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
            // Eve's memory isn't part of the blueprint (it's generated locally,
            // not authored) - always starts fresh here since loadBlueprint is
            // used by both first-run init and a full Reset.
            this.state.eevee = { conversations: [] };
            // Same reasoning for the hive's gacha-pulled bees - these are
            // random results that can't be recomputed from a formula (unlike
            // XP/level), so they have to actually be stored, but they're not
            // blueprint content either. The hive always starts with the
            // Queen (a fixed, separate visual - see hive-mind.js, never stored
            // here) plus exactly one Common Worker Bee, so the collection
            // isn't empty on a fresh start. Only runs on first init or a
            // full Reset - an existing player's already-earned bees are
            // never touched or retroactively seeded.
            this.state.hive = {
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
            // Not blueprint content (random results, same reasoning as hive
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
            // content, same reasoning as hive/inventory above. Keyed by
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
            // its own thing, see computeHabitXP/bumpHabit). Ships empty,
            // same "local content, only ever comes from adding it through
            // the page" reasoning as studyQueue above.
            this.state.habits = [];
            // To-Dos (core feature, src/features/todos/) - one-off tasks, same
            // shape family as dailyTasks (title/notes/checklist/
            // difficulty/xp/tags/reminders) minus a repeat schedule, plus
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
    // task labels/xp/links, new or removed quests/tasks) from the blueprint
    // while keeping your progress - task completion, dates, activeQuestId.
    // Blueprint is authoritative for "what exists and what it's called";
    // localStorage is authoritative for "what you've done." XP/level need
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

        // Same merge philosophy as quests: blueprint wins for label/xp,
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
            ensureBeeSerials(this.state, true);   // Oct 31 2026 (Craft): new bees get their serial (and memory)
            try { this._checkTaskStreak(); } catch (e) { /* never blocks a save */ }   // Nov 1 2026 (Craft)
            try {
                // Stamped on every real mutation that goes through this method -
                // NOT touched by importFullState() below, which writes straight
                // to localStorage and never calls save(), so a cloud pull or a
                // Full Save Transfer import correctly inherits the timestamp the
                // source device already stamped on it, rather than this device
                // claiming "just now" for data it didn't actually author. This
                // is what Settings' Cloud-vs-Local comparison reads to tell you
                // which copy is actually newer (see getLastLocalUpdate() below).
                // Save merge (Oct 28 2026): stamp what changed since the last save.
                if (this._shadow === undefined) {
                    try { const prev = JSON.parse(localStorage.getItem(this.storageKey) || 'null'); this._shadow = prev ? stampSaveChanges(prev, null) : null; } catch { this._shadow = null; }
                }
                this._shadow = stampSaveChanges(this.state, this._shadow);
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

    // Oct 31 2026 (Craft): a save that is NOT an edit. The hive's hourly clock
    // (bee vitals) used this.save(), which marked the save "changed" every
    // hour, so opening a second device always looked like a conflict (merge,
    // cloud backup, reload). This writes the device copy only: no "dirty"
    // flag, no new updatedAt, no upload. The hourly result reaches the cloud
    // with your next real change.
    saveQuiet() {
        if (!this.state) return;
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.state)); } catch { /* storage full: next real save warns */ }
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
        migrateHiveKey(parsed);   // Oct 31 2026 (Craft): colony -> hive
        ensureBeeSerials(parsed);   // Oct 31 2026 (Craft): serial numbers
        // Old saves (schema 7 and older) still say "dp" - rename to "xp" first.
        if (object(parsed) && (parsed.schemaVersion == null || parsed.schemaVersion < 8)) upgradeLegacyPoints(parsed);
        if (!object(parsed) || !object(parsed.user) || !Array.isArray(parsed.quests)) throw new Error('That is not a Bizzybee save file.');
        if (parsed.schemaVersion != null && (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion > VAULT_SCHEMA_VERSION || parsed.schemaVersion < 1)) throw new Error('This save uses an unsupported schema version. Update the app before importing it.');
        for (const field of ['dailyTasks', 'habits', 'todos', 'dictionary', 'studyQueue', 'calendarEvents']) {
            if (parsed[field] != null && !Array.isArray(parsed[field])) throw new Error(`Invalid ${field} in save.`);
        }
        for (const quest of parsed.quests) {
            if (!object(quest) || typeof quest.id !== 'string' || !Array.isArray(quest.tasks)) throw new Error('Invalid quest in save.');
            for (const task of quest.tasks) if (!object(task) || typeof task.xp !== 'number' || !Number.isFinite(task.xp)) throw new Error('Invalid task points in save.');
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

    // Time-based XP (Oct 2026), once per save:
    //  - imported history tasks start counting (their old points become
    //    minutes, so they now give XP too)
    //  - the character level is recalculated on the new curve: if it came
    //    out LOWER it drops to the real level; if HIGHER, the bar waits full
    //    so you claim each level (and its rewards) yourself
    //  - level-up reward counters are trimmed so nothing is granted twice
    //  - skill levels restart at 1, so every skill level your hours already
    //    reach can be claimed with its rewards
    //  - every task's shown XP is refreshed from its minutes
    _ensureTimeXP() {
        const s = this.state;
        if (!s || s.timeXPVersion >= 1) return;
        // Recovery copy first - unless there's nothing to lose yet, or one
        // was just taken (e.g. by a schema upgrade a moment ago).
        const hasWork = (s.dailyTasks || []).some(t => (t.completedDates || []).length) || (s.habits || []).some(h => (h.history || []).length)
            || (s.todos || []).some(t => t.completed) || (s.quests || []).some(q => (q.tasks || []).some(t => t.completed));
        const last = this.getLocalBackups()[0];
        const fresh = last && Date.now() - Date.parse(last.createdAt) < 60000;
        if (hasWork && !fresh) { try { this.createLocalBackup('Before time-based XP'); } catch { /* best effort */ } }
        this._refreshTaskXP();
        const live = this.getUser().level;
        if (!s.characterLevelBar) s.characterLevelBar = { acknowledgedLevel: live, leveledUpAt: null };
        const ack = Math.min(s.characterLevelBar.acknowledgedLevel || 1, live);
        s.timeXPRecalc = { at: new Date().toISOString(), levelBefore: s.characterLevelBar.acknowledgedLevel || 1, liveLevel: live };
        s.characterLevelBar.acknowledgedLevel = ack;
        if (s.hive) {
            let bees = 0;
            for (let l = 2; l <= ack; l++) bees += beesForLevel(l);
            s.hive.levelUpBeesAwarded = Math.min(Number(s.hive.levelUpBeesAwarded) || 0, bees);
            s.hive.ticketsAwarded = Math.min(Number(s.hive.ticketsAwarded) || 0, expectedLevelTickets(ack));
            s.hive.materialsAwardedForLevels = Math.min(Number(s.hive.materialsAwardedForLevels) || 0, Math.max(0, ack - 1));
            s.hive.beeRateOct2026 = true;
        }
        s.skillLevels = {};
        s.timeXPVersion = 1;
        this.save();
    }

    // Keeps each task's shown XP (task.xp) in step with its minutes.
    _refreshTaskXP() {
        const s = this.state;
        if (!s) return;
        const set = (t) => { if (t) t.xp = xpForMinutes(plannedMinutes(t), t.difficulty); };
        (s.dailyTasks || []).forEach(set);
        (s.habits || []).forEach(set);
        (s.todos || []).forEach(set);
        (s.quests || []).forEach(q => (q.tasks || []).forEach(set));
    }

    // The check-off pop-up: how long it really took. kind = 'daily' |
    // 'habit' | 'todo' | 'quest'. For a daily it's today's completion, for a
    // habit its latest + tap. Returns the XP that completion is now worth.
    logCompletionMinutes(kind, id, minutes, { questId } = {}) {
        const s = this.state;
        const m = Math.max(1, Math.min(1440, Math.round(Number(minutes) || 0)));
        if (!s || !m) return null;
        let task = null;
        if (kind === 'daily') {
            task = (s.dailyTasks || []).find(t => t.id === id);
            if (!task) return null;
            task.minutesLog = { ...(task.minutesLog || {}), [todayISO()]: m };
        } else if (kind === 'habit') {
            task = (s.habits || []).find(h => h.id === id);
            const last = task && [...(task.history || [])].reverse().find(h => h.direction === 'positive');
            if (!last) return null;
            last.minutes = m;
        } else if (kind === 'todo') {
            task = (s.todos || []).find(t => t.id === id);
            if (!task) return null;
            task.minutesSpent = m;
        } else if (kind === 'quest') {
            const quest = (s.quests || []).find(q => q.id === questId);
            task = quest && (quest.tasks || []).find(t => t.id === id);
            if (!task) return null;
            task.minutesSpent = m;
        }
        this.save();
        this._syncLevelUpBees();
        return xpForMinutes(m, task && task.difficulty);
    }

    // Nov 7 2026 (Craft): Batch 24. Total XP before any floor: tasks + streak bonuses
    // + the debuff and floor entries kept in state.bonusXP.
    _rawXP() {
        if (!this.state) return 0;
        return computeTotalXP(this.state.quests)
            + computeDailyXP(this.state.dailyTasks)
            + computeHabitXP(this.state.habits)
            + computeTodoXP(this.state.todos)
            + (this.state.bonusXP || []).reduce((n, b) => n + (Number(b.xp) || 0), 0);
    }

    // 4. Getters
    getUser() {
        if (!this.state) return null;

        // Nov 7 2026 (Craft): Batch 24. XP never goes below 0 (see _floorXP), and a faint no
        // longer takes XP, so the old "lost when the Queen faints" subtraction is gone.
        const totalXP = Math.max(0, this._rawXP());
        const { level, currentXP, nextLevelXP } = computeLevelProgress(totalXP);

        return {
            ...this.state.user,
            // The name you gave while raising your egg wins over the
            // blueprint's placeholder ("Worker Bee").
            name: this.state.displayName || (this.state.user && this.state.user.name),
            totalXP,
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
    // History import (Oct 2026): merges a 'bizzybee-history' file - e.g. the
    // old Codex Career Terminal, built by workshop/tools/build-codex-history.py
    // - into this save. Never overwrites: quests with an existing id, and
    // terms / projects / study items / timeline lines that already exist,
    // are skipped. Finished work arrives with 0 XP (history only); its old
    // value is kept on the task as historyXP. dryRun: just count.
    importHistoryPack(pack, { dryRun = false } = {}) {
        if (!this.state) return null;
        if (!pack || pack.kind !== 'bizzybee-history' || !Array.isArray(pack.quests)) throw new Error('Not a Bizzybee history file.');
        const s = this.state;
        const low = (v) => String(v || '').trim().toLowerCase();
        const counts = { quests: 0, tasks: 0, terms: 0, projects: 0, timeline: 0, titles: 0, study: 0, skipped: 0 };
        const quests = s.quests || [];
        const newQuests = [];
        pack.quests.forEach(q => {
            if (!q || !q.id || !q.title || quests.some(x => x.id === q.id)) { counts.skipped++; return; }
            const tasks = (q.tasks || []).filter(t => t && t.label).map((t, i) => ({
                id: t.id || `${String(q.id).toLowerCase()}-t${i + 1}`,
                label: String(t.label),
                xp: Number(t.xp) || 0,
                historyXP: Number(t.historyXP) || 0,
                completed: !!t.completed,
                dateCompleted: t.dateCompleted || null,
                link: t.link || null,
                difficulty: t.difficulty || null
            }));
            counts.quests++; counts.tasks += tasks.length;
            newQuests.push({ ...q, category: q.category === 'side' ? 'side' : 'main', status: q.status === 'completed' ? 'completed' : 'active', tasks, importedFrom: pack.source || 'history file' });
        });
        const dict = s.dictionary || [];
        const terms = (pack.dictionary || []).filter(t => t && t.name && !dict.some(d => low(d.name) === low(t.name)));
        counts.terms = terms.length;
        const profile = s.profile || { projects: [], serviceRecord: [] };
        const realProjects = (profile.projects || []).filter(p => p.name !== 'Your First Project');
        const projects = (pack.projects || []).filter(p => p && p.name && !realProjects.some(x => low(x.name) === low(p.name)));
        counts.projects = projects.length;
        const record = (profile.serviceRecord || []).filter(r => r.date !== '—');
        const lines = (pack.timeline || []).filter(t => t && t.date && t.note && !record.some(r => r.date === t.date && low(r.note) === low(t.note)));
        counts.timeline = lines.length;
        const haveTitles = s.titles || [];
        const titles = (pack.titles || []).filter(t => t && t.title && !haveTitles.some(x => low(x.title) === low(t.title)));
        counts.titles = titles.length;
        const queue = s.studyQueue || [];
        const study = (pack.studyQueue || []).filter(i => i && i.topic && !queue.some(x => low(x.topic) === low(i.topic)));
        counts.study = study.length;
        if (dryRun) return counts;

        s.quests = [...quests, ...newQuests];
        s.dictionary = [...dict, ...terms.map(t => ({ id: `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: String(t.name), definition: String(t.definition || ''), category: String(t.category || 'General'), createdAt: new Date().toISOString(), source: 'history' }))];
        s.profile = {
            ...profile,
            projects: [...realProjects, ...projects.map(p => ({ name: p.name, status: p.status || '', liveLink: p.liveLink || null, repoLink: p.repoLink || null, tech: p.tech || [] }))],
            serviceRecord: [...record, ...lines.map(t => ({ date: t.date, note: t.note }))].sort((a, b) => String(b.date).localeCompare(String(a.date)))
        };
        s.titles = [...haveTitles, ...titles.map(t => ({ title: t.title, ability: t.ability || '', date: t.date || null }))];
        s.studyQueue = [...queue, ...study.map(i => ({ id: `study-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, topic: i.topic, type: i.type || 'Article', priority: i.priority || 'Medium', status: i.status || 'Pending', link: i.link || null }))];
        if (pack.activeQuestId && newQuests.some(q => q.id === pack.activeQuestId)) s.activeQuestId = pack.activeQuestId;
        s.historyImports = [...(s.historyImports || []), { source: pack.source || 'history file', at: new Date().toISOString(), counts }];
        this.save();
        return counts;
    }

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
            quest.dateCompleted = todayISO();
        } else if (!allDone) {
            quest.dateCompleted = null;
        }
    }

    // 5. Logic: Toggle a quest's task. XP needs no updating here at all -
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
        // Quests finished before Oct 31 2026 already paid out: remember that.
        if (wasQuestCompleted && !quest.rewardedAt) quest.rewardedAt = quest.dateCompleted || todayISO();

        task.completed = !task.completed;
        // Full timestamp (not just the date) so the UI can show exactly when
        // a task was actually checked off, not just which day. Quest-level
        // dateCompleted (below) stays date-only - this is scoped to tasks.
        task.dateCompleted = task.completed ? new Date().toISOString() : null;
        if (task.completed) this._queenHeal(`quest:${task.id}`);
        if (task.completed) this._noteDone('Quest', task.label);   // Oct 31 2026 (Craft): card memories

        this._updateQuestCompletionState(quest);

        this.save();
        this._syncLevelUpBees();
        if (task.completed) this._collectMaterialsOnCompletion(`quest:${task.id}`);
        // Oct 31 2026 (Craft): a quest pays out once. Unchecking its last task
        // and checking it again used to pay the loot and ticket again.
        if (!wasQuestCompleted && quest.status === 'completed' && !quest.rewardedAt) {
            quest.rewardedAt = new Date().toISOString();
            this._awardQuestTicketIfSignificant(quest);
            this._awardLootOnQuestCompletion(quest);
            this.save();
        }
        return quest;
    }

    // Tops up level-up bee/ticket/material rewards (see beesForLevel above)
    // to match the character level bar's ACKNOWLEDGED level - not the live
    // level. Character leveling is gated exactly like Skill Mastery now
    // (see computeCharacterLevelBandState above and levelUpCharacterBar
    // below): totalXP can run ahead, but nothing is actually granted until
    // levelUpCharacterBar() advances acknowledgedLevel, which is the only
    // thing that changes the `level` this function syncs against. Still
    // called on every init() and after anything that can change XP
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
        if (!this.state.hive) this.state.hive = { bees: [], levelUpBeesAwarded: 0, tickets: 0, ticketsAwarded: 0 };
        if (typeof this.state.hive.levelUpBeesAwarded !== 'number') this.state.hive.levelUpBeesAwarded = 0;
        if (typeof this.state.hive.tickets !== 'number') this.state.hive.tickets = 0;
        if (typeof this.state.hive.ticketsAwarded !== 'number') this.state.hive.ticketsAwarded = 0;
        if (typeof this.state.hive.materialsAwardedForLevels !== 'number') this.state.hive.materialsAwardedForLevels = 0;
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
        // Oct 2026 rate change: saves that got more bees under the old,
        // faster formula keep them, and still get 1 bee on their next level.
        if (!this.state.hive.beeRateOct2026) {
            this.state.hive.levelUpBeesAwarded = Math.min(this.state.hive.levelUpBeesAwarded, expectedBees);
            this.state.hive.beeRateOct2026 = true;
        }
        const beeDeficit = expectedBees - this.state.hive.levelUpBeesAwarded;

        // Tickets per level-up grow with the level (ticketsForLevel).
        const expectedTickets = expectedLevelTickets(level);
        const ticketDeficit = expectedTickets - this.state.hive.ticketsAwarded;

        // 1 material roll per level-up too - flat, unlike the escalating
        // bee formula, since this is meant to be a small steady trickle
        // rather than the main reward for leveling.
        const expectedMaterialRolls = Math.max(0, level - 1);
        const materialDeficit = expectedMaterialRolls - this.state.hive.materialsAwardedForLevels;

        if (beeDeficit <= 0 && ticketDeficit <= 0 && materialDeficit <= 0) {
            return { awardedBees: [], ticketsGranted: 0, awardedMaterials: [] };
        }

        const awardedBees = [];
        if (beeDeficit > 0) {
            for (let i = 0; i < beeDeficit; i++) awardedBees.push(this.awardBee('levelup'));
            this.state.hive.levelUpBeesAwarded = expectedBees;
        }

        if (ticketDeficit > 0) {
            this.state.hive.tickets += ticketDeficit;
            this.state.hive.ticketsAwarded = expectedTickets;
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
            this.state.hive.materialsAwardedForLevels = expectedMaterialRolls;
        }

        this.save();

        if (!silent && typeof Toast !== 'undefined') {
            if (awardedBees.length > 0) {
                const label = awardedBees.length === 1 ? awardedBees[0].name : `${awardedBees.length} bees`;
                Toast.show(`🐝 ${label} joined your hive!`, 'positive');
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

        const totalXP = this.getUser().totalXP;
        const bandState = computeCharacterLevelBandState(totalXP, this.state.characterLevelBar.acknowledgedLevel);
        if (!bandState.maxed) return null;

        this.state.characterLevelBar.acknowledgedLevel += 1;
        this.state.characterLevelBar.leveledUpAt = new Date().toISOString();
        this._ensureQueen();
        this.state.queen.hp = QUEEN.maxHp;                      // level up = full health
        this.save();

        let { awardedBees, ticketsGranted, awardedMaterials } = this._syncLevelUpBees({ silent: true });
        // Hive Life: each working Queen's Attendant adds 1 Royal Nectar.
        this._workers('attendant').forEach((b) => {
            this._addMaterial('royal-nectar', 1); awardedMaterials.push('royal-nectar');
            if (beeTalentBoost(b) > 1 && lifeRand() < 0.2) { this._addMaterial('royal-nectar', 1); awardedMaterials.push('royal-nectar'); }   // talent: 20% for one more
        });
        if (this._workers('attendant').length) this.save();
        // Tiers (past level 50): a guaranteed Epic bee, 5 tickets and a Royal Jelly.
        const reached = this.state.characterLevelBar.acknowledgedLevel;
        if (reached > LEVEL_CAP) {
            const epic = this.awardBee('tier', 'Epic');
            if (epic) awardedBees.push(epic);
            this.state.hive.tickets = (this.state.hive.tickets || 0) + 5;
            ticketsGranted += 5;
            this._addMaterial('royal-jelly', 1); awardedMaterials.push('royal-jelly');
            this.save();
        }

        return {
            newLevel: this.state.characterLevelBar.acknowledgedLevel,
            awardedBees,
            ticketsGranted,
            awardedMaterials
        };
    }

    // The Home/Profile character-level bar reads this directly - same
    // pre-merged shape as getSkillMatrix() (level/xpIntoLevel/cap/
    // percentage/maxed), just for the one character-level band instead of
    // a whole matrix of skill categories.
    getCharacterLevelBar() {
        if (!this.state) return null;
        if (!this.state.characterLevelBar) {
            this.state.characterLevelBar = { acknowledgedLevel: this.getUser().level, leveledUpAt: null };
            this.save();
        }
        this._floorXP();
        return computeCharacterLevelBandState(this.getUser().totalXP, this.state.characterLevelBar.acknowledgedLevel);
    }

    // Nov 7 2026 (Craft): Batch 24. No XP debt. If bad habits, unchecks or deleting a task
    // would push XP below where this level starts, a small bonusXP entry lifts it back to
    // exactly the level start. Your level never drops and you never have to "catch up".
    // It also clears any debt already in a save.
    _floorXP() {
        const S = this.state;
        if (!S || !S.characterLevelBar) return false;
        const from = characterXPToReach(S.characterLevelBar.acknowledgedLevel || 1);
        const gap = Math.round(from - this._rawXP());
        if (!(gap > 0)) return false;
        if (!Array.isArray(S.bonusXP)) S.bonusXP = [];
        S.bonusXP.push({ key: `xp-floor:${Date.now()}`, date: todayISO(), xp: gap, why: 'floor' });
        this.save();
        return true;
    }

    // Nov 7 2026 (Craft): Batch 24. XP buffs and debuffs that are active right now, for the
    // bar colour. Today only the faint debuff exists; more can be added here later.
    // [{ id, kind: 'debuff'|'buff', label, pct, until, msLeft }]
    getXPBuffs() {
        const q = this.state && this.state.queen;
        const out = [];
        if (q && q.debuff) {
            const left = Number(q.debuff.until) - Date.now();
            if (left > 0) out.push({ id: q.debuff.id || 'faint', kind: 'debuff', label: 'Queen fainted', pct: Math.round((q.debuff.mult - 1) * 100), until: q.debuff.until, msLeft: left });
            else { delete q.debuff; this.save(); }
        }
        return out;
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
        // Dictionary became a plugin on 2026-10-11 (it was core). Saves that
        // already existed keep it installed; new players start without it
        // and can turn it on in Plugin Hub. One-time flag, same reason as
        // habitsTodosDefaultInstalled above.
        if (!this.state.dictionaryPluginMigrated) {
            const existingSave = !!this.state.dictionarySeeded || (this.state.dictionary || []).length > 0;
            if (this.state.plugins.dictionary === undefined) this.state.plugins.dictionary = existingSave;
            this.state.dictionaryPluginMigrated = true;
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
    // task (which only ever ships label/xp/difficulty, never these).
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
        if (!this.state || !this.state.hive) return;
        let changed = false;

        // Backfills the fragments bucket onto any save from before the
        // fragment system existed - same additive philosophy as the rest
        // of this method, just at the inventory level instead of per-bee.
        if (this.state.inventory && !this.state.inventory.fragments) {
            this.state.inventory.fragments = {};
            changed = true;
        }

        (this.state.hive.bees || []).forEach((bee, index) => {
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
    // Oct 31 2026 (Craft): key = the task. Each task rolls these rewards once
    // per day, so checking it off/on again can't farm materials or tickets.
    _collectMaterialsOnCompletion(key) {
        if (!this.state) return;
        if (key) {
            const day = todayISO();
            if (!this.state.lootDay || this.state.lootDay.day !== day) this.state.lootDay = { day, keys: [] };
            if (this.state.lootDay.keys.includes(key)) return;
            this.state.lootDay.keys.push(key);
        }
        // Hive Life: every finished task feeds the hive; Scouts may find a ticket.
        this._feedHive();
        this._workers('scout').forEach(scout => {
            if (lifeRand() < (0.03 + (beeTitlePower(scout, 'swift') ? 0.02 : 0)) * beeTalentBoost(scout)) {
                this.state.hive.tickets = (this.state.hive.tickets || 0) + 1;
                if (typeof Toast !== 'undefined') Toast.show(`🎟️ ${scout.name} the Scout found a gacha ticket!`, 'positive');
            }
        });
        // Foragers (collectors) only work while awake and rested; Speed helps.
        const collectors = this.getHiveBees().filter(b => b.class === 'collector' && (!b.life || beeCanWork(b)));
        // Title "The Bright": +3% gacha ticket chance on every finished task.
        this._lifeBees().filter(b => beeTitlePower(b, 'bright') && beeCanWork(b)).forEach(b => {
            if (lifeRand() < 0.03) {
                this.state.hive.tickets = (this.state.hive.tickets || 0) + 1;
                if (typeof Toast !== 'undefined') Toast.show(`🎟️ ${b.name} \u201cThe Bright\u201d found a gacha ticket!`, 'positive');
            }
        });
        if (collectors.length === 0) { this.save(); return; }

        if (!this.state.inventory) this.state.inventory = { materials: {} };
        if (!this.state.inventory.materials) this.state.inventory.materials = {};

        const drops = [];
        const guides = this._workers('scout').reduce((n, b) => n + (beeTitlePower(b, 'wanderer') ? 2 : 1) * beeTalentBoost(b), 0);
        collectors.forEach(bee => {
            const speed = ((bee.stats && bee.stats.speed) || 0) * beeGear(bee, 'speed');
            const chance = (COLLECTOR_DROP_CHANCE - 0.1 + Math.min(0.25, speed / 120)) * (bee.life && bee.life.birthTrait === 'swift-wings' ? 1.1 : 1)
                * (beeTitlePower(bee, 'collector') ? 1.1 : 1) * beeTalentBoost(bee);
            if (Math.random() < chance) {
                // Scouts guide Foragers to better flowers: a chance to roll
                // twice and keep the rarer material (12% per Scout, max 45%).
                let materialId = rollMaterialDrop();
                if (Math.random() < Math.min(0.45, guides * 0.12)) {
                    const second = rollMaterialDrop();
                    const rank = (id) => MATERIAL_DROP_TABLE.findIndex(m => m.id === id);
                    if (rank(second) > rank(materialId)) materialId = second;
                }
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
    // its total XP clears QUEST_TICKET_XP_THRESHOLD - "certain quests that
    // accomplish a great deal," per redacted's own framing, not every quest.
    _awardQuestTicketIfSignificant(quest) {
        if (!this.state) return;
        const totalXP = (quest.tasks || []).reduce((sum, t) => sum + t.xp, 0);
        if (totalXP < QUEST_TICKET_XP_THRESHOLD) return;

        if (!this.state.hive) this.state.hive = { bees: [], levelUpBeesAwarded: 0, tickets: 0, ticketsAwarded: 0 };
        if (typeof this.state.hive.tickets !== 'number') this.state.hive.tickets = 0;
        this.state.hive.tickets += 1;
        this.save();

        if (typeof Toast !== 'undefined') {
            Toast.show(`🎟️ Gacha ticket earned for completing "${quest.title}"!`, 'positive');
        }
    }

    // Awards material (and, on a smaller chance, Evolution Item) loot
    // every time ANY quest transitions into completed - unlike the ticket
    // above, this isn't gated behind an XP threshold, just SCALED by it:
    // bigger quests drop more material rolls (QUEST_LOOT_XP_DIVISOR), and
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

        const totalXP = (quest.tasks || []).reduce((sum, t) => sum + t.xp, 0);
        const baseRolls = Math.max(1, Math.floor(totalXP / QUEST_LOOT_XP_DIVISOR));

        const daysElapsed = daysBetween(quest.dateStarted, quest.dateCompleted);
        let speedBonusRolls = 0;
        if (daysElapsed !== null) {
            if (daysElapsed <= QUEST_SPEED_INSTANT_DAYS) speedBonusRolls = QUEST_SPEED_INSTANT_BONUS_ROLLS;
            else if (daysElapsed <= QUEST_SPEED_FAST_DAYS) speedBonusRolls = QUEST_SPEED_FAST_BONUS_ROLLS;
        }

        const totalRolls = baseRolls + speedBonusRolls + Math.min(3, this._workers('architect').reduce((n, b) => n + (beeTitlePower(b, 'architect') ? 2 : 1), 0));
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
    addTask(questId, { label, xp, difficulty, minutes }) {
        if (!this.state) return null;

        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest) return null;

        if (!quest.tasks) quest.tasks = [];
        quest.tasks.push({
            id: `${questId.toLowerCase()}-t${Date.now()}`,
            label,
            xp: Number(xp) || 0,
            completed: false,
            dateCompleted: null,
            link: null,
            difficulty: difficulty || null,
            minutes: Number(minutes) > 0 ? Number(minutes) : null
        });
        this._captureHashtags(quest.tasks[quest.tasks.length - 1]);
        this._refreshTaskXP();

        this._updateQuestCompletionState(quest);
        this.save();
        return quest;
    }

    updateTask(questId, taskId, { label, xp, difficulty, minutes }) {
        if (!this.state) return null;

        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest || !quest.tasks) return null;

        const task = quest.tasks.find(t => t.id === taskId);
        if (!task) return null;

        if (label !== undefined) task.label = label;
        if (xp !== undefined) task.xp = Number(xp) || 0;
        if (difficulty !== undefined) task.difficulty = difficulty || null;
        if (minutes !== undefined) task.minutes = Number(minutes) > 0 ? Number(minutes) : null;
        this._refreshTaskXP();

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
    // full), each carrying its own xp value the author set for that entry
    // (not auto-scaled from a "full" value - see computeTotalXP above for
    // how a non-pending entry's xp counts toward the live total, same as a
    // completed task). Optional field, absent entirely on quests that don't
    // use it - nothing renders or breaks for those.
    getGhostLogs(questId) {
        const quest = (this.state && this.state.quests || []).find(q => q.id === questId);
        return quest ? (quest.ghostLogs || []) : [];
    }

    addGhostLog(questId, { name, xp }) {
        if (!this.state) return null;
        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest) return null;
        if (!quest.ghostLogs) quest.ghostLogs = [];

        const entry = {
            id: `${questId.toLowerCase()}-gl${Date.now()}`,
            name: name || 'Untitled Challenge',
            status: 'pending',
            xp: Number(xp) || 0,
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
    // via Dev Edit or a future Eve-generated quest). The reverse
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

    // 5e. Logic: Eve generates a whole new quest (goal -> structured
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
    saveQuestForm(questId, { title, objective, category, source, tasks, makeActive, tags, deadline }) {
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
        if (Array.isArray(tags)) quest.tags = [...new Set(tags.map(t => String(t).trim()).filter(Boolean))];
        // Nov 1 2026 (Craft): optional deadline (YYYY-MM-DD).
        if (deadline !== undefined) { if (/^\d{4}-\d{2}-\d{2}$/.test(String(deadline || ''))) quest.deadline = deadline; else delete quest.deadline; }
        quest.tasks = (tasks || []).map((row, index) => {
            const prev = row.id && old.find(t => t.id === row.id);
            const minutes = Number(row.minutes) > 0 ? Number(row.minutes) : (prev ? prev.minutes || null : null);
            const module = row.module || null;
            if (prev) {
                const next = { ...prev, label: row.label, difficulty: row.difficulty || null, minutes, xp: Number(row.xp) || 0, module };
                if (!module || module !== prev.module) delete next.section;   // moved chapter: drop the old sub-chapter
                if (!module) delete next.module;
                return next;
            }
            return {
                id: `${quest.id.toLowerCase()}-t${stamp}-${index}`,
                label: row.label,
                ...(module ? { module } : {}),
                minutes,
                xp: Number(row.xp) || 0,
                completed: false,
                dateCompleted: null,
                link: null,
                difficulty: row.difficulty || null
            };
        });
        this._refreshTaskXP();
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

    // 5f. Logic: Eve's memory. Every real exchange (chat, or a quest
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

    // 5g. Logic: the hive's gacha-pulled bees (src/features/hive-mind/). Each
    // pull's rarity/name is random, so - unlike XP/level - there's no formula
    // to recompute it from; it has to be stored as its own fact.
    getHiveBees() {
        return this.state && this.state.hive ? (this.state.hive.bees || []) : [];
    }

    // Limited editions (Nov 1 2026): adds the numbered bee once the server
    // has given it its number. One per edition; a second call keeps it.
    addLimitedBee(editionId, serial) {
        const ed = LIMITED_EDITIONS[editionId];
        if (!this.state || !ed || !(Number.isInteger(serial) && serial >= 1 && serial <= ed.of)) return null;
        const have = this.getHiveBees().find(b => b.limited && b.limited.edition === editionId);
        if (have) { have.limited.serial = serial; this.save(); return have; }
        return this.addHiveBee({
            id: generateBeeId(), name: ed.name, rarity: 'Named', title: ed.title,
            obtainedAt: new Date().toISOString(), source: 'limited', stats: rollBeeStats('Named'), weight: rollBeeWeight('Named'),
            dexNumber: this.getHiveBees().filter(b => b.rarity !== 'Royal').length + 1, element: ed.element,
            customNamed: true, art: ed.art, scene: ed.scene, class: NAMED_TITLES[ed.title].job || null,
            limited: { edition: editionId, serial, of: ed.of, label: ed.label, claimedAt: new Date().toISOString() }
        });
    }

    addHiveBee(bee) {
        if (!this.state) return null;
        if (!this.state.hive) this.state.hive = { bees: [] };

        ensureBeeLife(bee, todayISO(), { isNew: true });
        this.state.hive.bees.push(bee);
        this._noteModels(beeModelKeys(bee));
        this.save();
        return bee;
    }

    // ---- Bee Models (Oct 2026): which kinds of bee you've met ----------------
    // hive.seenModels = { key: 'YYYY-MM-DD' } - kept even if the bee is later
    // destroyed or combined. hive.modelsViewed = keys you've tapped (NEW tag).
    _noteModels(keys) {
        if (!this.state || !this.state.hive || !keys.length) return false;
        const seen = this.state.hive.seenModels || (this.state.hive.seenModels = {});
        let changed = false;
        keys.forEach(k => { if (!seen[k]) { seen[k] = todayISO(); changed = true; } });
        return changed;
    }
    getSeenModels() {
        if (!this.state || !this.state.hive) return {};
        const c = this.state.hive, keys = [];
        (c.bees || []).forEach(b => keys.push(...beeModelKeys(b)));
        const working = (c.bees || []).filter(b => b.class && b.rarity !== 'Royal' && !(b.life && (b.life.hatchOn || b.life.faintedAt))).length;
        if (working > 0) keys.push('hive:worker');
        if (working >= 10) keys.push('hive:swarm');
        if ((c.lifeEvents || []).some(e => e.type === 'raid-won' || e.type === 'raid-lost')) keys.push('hive:raider');
        const o = this.getOnboarding ? this.getOnboarding() : null;
        const order = ['egg', 'larva', 'pupa', 'ready'];
        const at = !o || o.stage === 'done' ? order.length : Math.max(0, order.indexOf(o.stage)) + 1;
        order.slice(0, at).forEach(k => keys.push('life:' + k));
        if ((c.bees || []).some(b => b.life && b.life.hatchOn)) keys.push('life:egg');
        if (this._noteModels(keys)) this.save();
        return Object.assign({}, c.seenModels || {});
    }
    getViewedModels() {
        if (!this.state || !this.state.hive) return [];
        // First visit: everything you already have counts as seen, so only
        // later finds get the NEW tag.
        if (!this.state.hive.modelsViewed) { this.state.hive.modelsViewed = Object.keys(this.getSeenModels()); this.save(); }
        return this.state.hive.modelsViewed;
    }
    markModelViewed(key) {
        if (!this.state || !this.state.hive) return;
        const v = this.state.hive.modelsViewed || (this.state.hive.modelsViewed = []);
        if (!v.includes(key)) { v.push(key); this.save(); }
    }

    // Rolls a brand new bee via the shared rarity table and stores it -
    // shared by the Pollination Chamber gacha (hive-mind.js, after its spin
    // animation finishes) and the automatic level-up reward in
    // toggleTask/toggleDailyTask below. `source` is purely informational
    // ('gacha' / 'levelup' / 'starter') in case that's ever worth surfacing
    // in the UI later - nothing currently branches on it.
    awardBee(source, forcedRarity) {
        const rarityInfo = (forcedRarity && BEE_RARITIES.find(r => r.rarity === forcedRarity)) || rollBeeRarity();
        const dexNumber = this.getHiveBees().filter(b => b.rarity !== 'Royal').length + 1;
        const bee = {
            id: generateBeeId(),
            name: randomBeeName(this.getHiveBees().map(b => b.name)),
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
        return this.addHiveBee(bee);
    }

    // Renames a bee - works on any bee regardless of rarity/source, not
    // just Named Beasts (their generated "<Noun> The <Title>" name is just
    // a starting point). Trimmed and length-capped so a swarm name label
    // can't grow unboundedly.
    renameBee(beeId, newName) {
        if (!this.state || !this.state.hive) return null;
        const bee = (this.state.hive.bees || []).find(b => b.id === beeId);
        if (!bee) return null;

        const trimmed = (newName || '').trim();
        if (!trimmed) return null;
        if (beeIsLimited(bee)) return null;   // limited bees keep their name (Nov 1 2026)

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
        if (!this.state || !this.state.hive) return null;
        const bee = (this.state.hive.bees || []).find(b => b.id === beeId);
        if (!bee) return null;
        // Recuperate (Oct 28 2026): no job, on purpose. Eats, sleeps, heals slowly. Never gets upset.
        if (className === 'recuperate') {
            if (beeIsBrood(bee) || beeLockedJob(bee)) return null;
            if (bee.class) bee.jobSince = todayISO();
            bee.class = null;
            if (bee.life) { bee.life.recuperate = true; delete bee.life.idleSince; }
            this.save();
            return bee;
        }
        if (className && !BEE_CLASSES[className]) return null;
        // Eggs can't get a job until they hatch (Oct 27 2026).
        if (className && beeIsBrood(bee)) return null;
        // Named Beasts: the title fixes the job.
        const locked = beeLockedJob(bee);
        if (locked && className !== locked) return null;
        // Nov 1 2026 (Craft): open jobs only, talent only, one bee per job.
        this.lastJobError = className ? this.jobBlock(bee, className) : '';
        if (this.lastJobError) return null;
        // Hive Life: only male bees can be Drones, and Drones do nothing else.
        if (className && bee.sex) {
            const maleOnly = !!BEE_CLASSES[className].maleOnly;
            if (maleOnly !== (bee.sex === 'm')) return null;
        }

        if ((bee.class || null) !== (className || null)) bee.jobSince = todayISO();   // Guard shields need 3 days on the job
        bee.class = className || null;
        // Comb rooms: how long a bee has gone without a job (upset at 3 days).
        if (bee.life) {
            delete bee.life.recuperate;
            if (bee.class) delete bee.life.idleSince;
            else if (!bee.life.hatchOn) bee.life.idleSince = todayISO();
        }
        this.autoJustUnlocked = this._autoUnlockCheck();   // Nov 1 2026 (Craft): auto-manage
        this.save();
        return bee;
    }

    // Gacha (Oct 2026): 1 ticket = 1 pull at the normal odds. Every 6th pull
    // without a Rare or better is a guaranteed Rare or better (pity).
    // Named Beasts now cost NAMED_BEAST_TICKETS tickets (unwrapTicket).
    getPityCount() {
        return this.state && this.state.hive ? (this.state.hive.pity || 0) : 0;
    }

    pullWithTicket() {
        if (!this.state || !this.state.hive || !(this.state.hive.tickets > 0)) return null;
        this.state.hive.tickets -= 1;
        const pity = (this.state.hive.pity || 0) + 1;
        let rarity = rollBeeRarity().rarity;
        const guaranteed = pity >= GACHA_PITY_PULLS && rarity === 'Common';
        if (guaranteed) {
            const pool = BEE_RARITIES.filter(r => r.weight > 0 && r.rarity !== 'Common');
            let roll = Math.random() * pool.reduce((n, r) => n + r.weight, 0);
            rarity = (pool.find(r => (roll -= r.weight) < 0) || pool[0]).rarity;
        }
        // Hive Life: a Drone's mating gives this pull a 50% shot at Rare.
        if (this.state.hive.droneBoost) {
            this.state.hive.droneBoost = false;
            if (rarity === 'Common' && lifeRand() < 0.5) rarity = 'Rare';
        }
        this.state.hive.pity = rarity === 'Common' ? pity : 0;
        const bee = this.awardBee('gacha', rarity);
        return { bee, guaranteed, pity: this.state.hive.pity };
    }

    getTicketCount() {
        return this.state && this.state.hive ? (this.state.hive.tickets || 0) : 0;
    }

    // Consumes 1 ticket and guarantees a Named Beast - the ONLY path that
    // can produce this rarity (see BEE_RARITIES' weight:0 comment on
    // 'Named' - normal rollBeeRarity() can never select it). Returns null
    // if there's no ticket to spend, so the caller (hive-mind.js's unwrap UI)
    // can guard the tear/reveal interaction on a real ticket existing.
    unwrapTicket() {
        if (!this.state || !this.state.hive) return null;
        if (!this.state.hive.tickets || this.state.hive.tickets < NAMED_BEAST_TICKETS) return null;

        this.state.hive.tickets -= NAMED_BEAST_TICKETS;
        const bee = {
            id: generateBeeId(),
            name: randomBeeName(this.getHiveBees().map(b => b.name)),
            title: rollNamedTitle(),
            sex: 'f',
            rarity: 'Named',
            class: null,
            obtainedAt: new Date().toISOString(),
            source: 'ticket',
            stats: rollBeeStats('Named'),
            weight: rollBeeWeight('Named'),
            dexNumber: this.getHiveBees().filter(b => b.rarity !== 'Royal').length + 1,
            element: rollBeeElement(),
            // Named Beasts from a ticket already have a generated themed
            // name (rollNamedBeeName above), but that's not a CUSTOM name
            // redacted picked - starts false like every other bee, same rule.
            customNamed: false
        };
        bee.class = beeLockedJob(bee);            // its title sets its job
        if (bee.class) bee.jobSince = todayISO();
        return this.addHiveBee(bee); // also saves - persists the ticket spend + the new bee together
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

    // ---- Held items (Oct 28 2026) ----
    giveBeeItem(beeId, itemId, slot = 0) {
        const bee = this.getHiveBees().find(b => b.id === beeId);
        const it = STORE_ITEM_CATALOG.find(i => i.id === itemId && i.kind === 'held');
        if (!bee || !it) return { ok: false, error: 'Unknown item.' };
        const slots = beeItemSlots(bee);
        if (!slots) return { ok: false, error: 'Only Rare bees and up can hold items.' };
        if (slot < 0 || slot >= slots) return { ok: false, error: 'No such slot.' };
        const items = this.state.inventory.items;
        if (!(items[itemId] > 0)) return { ok: false, error: `You don't have a ${it.label}. Make one in the Honey Store.` };
        if (!Array.isArray(bee.held)) bee.held = [];
        if (bee.held[slot]) items[bee.held[slot]] = (items[bee.held[slot]] || 0) + 1;   // old item back to the bag
        bee.held[slot] = itemId;
        items[itemId] -= 1;
        this.save();
        return { ok: true };
    }
    takeBeeItem(beeId, slot = 0) {
        const bee = this.getHiveBees().find(b => b.id === beeId);
        if (!bee || !Array.isArray(bee.held) || !bee.held[slot]) return false;
        const items = this.state.inventory.items;
        items[bee.held[slot]] = (items[bee.held[slot]] || 0) + 1;
        bee.held[slot] = null;
        this.save();
        return true;
    }
    // Use-up items fire when needed (called every hour).
    _useHeldItems(bee) {
        if (!Array.isArray(bee.held) || !bee.life) return;
        const L = bee.life;
        const need = { hungry: L.fullness < 40, tired: L.stamina < 25, hurt: L.health < 65, sick: !!L.sickUntil };
        bee.held.forEach((id, i) => {
            const it = id && STORE_ITEM_CATALOG.find(x => x.id === id);
            if (!it || !it.hold || it.hold.type !== 'use' || !need[it.hold.when]) return;
            const g = it.hold.gives;
            if (g.fullness) L.fullness = clampVital(L.fullness + g.fullness, true);
            if (g.stamina) L.stamina = clampVital(L.stamina + g.stamina, true);
            if (g.health) L.health = clampVital(L.health + g.health, true);
            if (g.cure) { delete L.sickUntil; delete L.sickProgress; }
            bee.held[i] = null;
            this._lifeEvent('item', `${it.icon} ${bee.name} used a ${it.label}.`, { beeId: bee.id });
        });
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
    // Each node: unlocked (mastered), masteredAt, progressHours, needHours,
    // status 'mastered' | 'progress' | 'locked'. Newly mastered nodes are
    // saved (they stay mastered) and listed in this.lastMastered so a page
    // can celebrate them.
    getSkillTree() {
        if (!this.state) return SKILL_TREE_CATALOG.map(e => ({ ...e, unlocked: false, status: 'locked', progressHours: 0, needHours: (e.needs || {}).hours || 0 }));
        if (!this.state.skillsMastered) this.state.skillsMastered = {};
        const done = this.state.skillsMastered;
        const s = this.state;
        const hoursBy = {};
        // Nov 7 2026 (Craft): real hours only.
        Object.entries(this.getRealBySkill()).forEach(([c, m]) => { hoursBy[c.toLowerCase()] = m / 60; });
        const totalHours = this.getRealMinutes() / 60;
        const fresh = [];
        const out = [];
        const byId = {};
        SKILL_TREE_CATALOG.forEach(entry => {   // parents come before children in the catalog
            const needs = entry.needs || { total: true, hours: 0 };
            const progress = needs.total ? totalHours : Math.max(0, ...(needs.skills || []).map(k => hoursBy[k.toLowerCase()] || 0));
            const parent = entry.parentId ? byId[entry.parentId] : null;
            const open = !parent || parent.unlocked;
            if (!done[entry.id] && open && progress >= needs.hours) { done[entry.id] = new Date().toISOString(); fresh.push(entry); }
            const node = { ...entry, unlocked: !!done[entry.id], masteredAt: done[entry.id] || null,
                progressHours: progress, needHours: needs.hours, needSkills: needs.total ? null : needs.skills,
                status: done[entry.id] ? 'mastered' : open ? 'progress' : 'locked' };
            byId[entry.id] = node;
            out.push(node);
        });
        this.lastMastered = fresh;
        if (fresh.length) this.save();
        return out;
    }

    isSkillUnlocked(skillId) {
        return this.state && this.state.skillsMastered ? !!this.state.skillsMastered[skillId] : false;
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
        if (!this.state || !this.state.hive) return null;
        if (itemId !== 'evo-stone' && itemId !== 'rebirth-stone') return null;

        const bee = (this.state.hive.bees || []).find(b => b.id === beeId);
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
        if (!this.state || !this.state.hive) return null;
        if (itemId === 'evo-stone' || itemId === 'rebirth-stone' || itemId === 'evo-stone-fragment') return null; // wrong item for this action

        const bee = (this.state.hive.bees || []).find(b => b.id === beeId);
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

        if (item.kind === 'unlock' && this.ownsUnlock(item.id)) return null;   // Nov 1 2026 (Craft): one per hive
        const { materialId, amount } = item.price;
        if (item.price.currency === 'coins') {
            if (!this.spendCoins(amount)) return null;
        } else {
            const owned = this.state.inventory.materials[materialId] || 0;
            if (owned < amount) return null;
            this.state.inventory.materials[materialId] = owned - amount;
        }
        if (item.kind === 'unlock') {
            if (!this.state.unlocks) this.state.unlocks = {};
            this.state.unlocks[item.id] = new Date().toISOString();
        } else this.state.inventory.items[itemId] = (this.state.inventory.items[itemId] || 0) + 1;

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
        if (!this.state || !this.state.hive) return null;
        const item = STORE_ITEM_CATALOG.find(i => i.id === itemId && i.kind === 'trait');
        if (!item) return null;

        const bee = (this.state.hive.bees || []).find(b => b.id === beeId);
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
        if (!this.state || !this.state.hive) return null;
        const item = STORE_ITEM_CATALOG.find(i => i.id === itemId && i.kind === 'identity');
        if (!item) return null;

        const bee = (this.state.hive.bees || []).find(b => b.id === beeId);
        if (!bee || bee.rarity === 'Named' || bee.rarity === 'Royal') return null;
        if (!this._consumeItem(itemId, 1)) return null;

        // Oct 2026: the bee keeps its name and earns a random title.
        bee.rarity = 'Named';
        bee.title = rollNamedTitle();
        const locked = beeLockedJob(bee);
        if (locked) {
            if (bee.class !== locked) { bee.class = locked; bee.jobSince = todayISO(); }
            bee.sex = 'f';
            if (bee.life) delete bee.life.idleSince;
        }
        bee.stats = rollBeeStats('Named');
        bee.weight = rollBeeWeight('Named');
        this._noteModels(beeModelKeys(bee));

        this.save();
        return { bee };
    }

    // Permanently removes a bee and grants material loot in exchange -
    // count scaled by rarity (DESTROY_LOOT_COUNT above), rolled from the
    // same table a live Collector bee drops from. Returns null if the bee
    // doesn't exist so the caller can guard against a stale selection.
    destroyBee(beeId) {
        if (!this.state || !this.state.hive) return null;
        const bees = this.state.hive.bees || [];
        const index = bees.findIndex(b => b.id === beeId);
        if (index === -1) return null;
        if (bees[index].rarity === 'Royal') return null;   // the founder stays
        if (beeIsLimited(bees[index])) return null;        // limited bees stay (Nov 1 2026)

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

    // Consumes two bees and produces one stronger one: each stat = the
    // better parent's + a small boost, capped per tier (beeStatCap). A
    // small chance (COMBINE_UPGRADE_CHANCE) to climb one rarity tier.
    // Keeps the stronger parent's element (and name, if you named it).
    // Never produces a Named Beast (see RARITY_ORDER's comment).
    // Returns null on an invalid pick (missing bee, or the same bee
    // picked for both slots) so the caller can guard the UI on it.
    combineBees(beeIdA, beeIdB) {
        if (!this.state || !this.state.hive || !beeIdA || !beeIdB || beeIdA === beeIdB) return null;

        const bees = this.state.hive.bees || [];
        const beeA = bees.find(b => b.id === beeIdA);
        const beeB = bees.find(b => b.id === beeIdB);
        if (!beeA || !beeB) return null;
        if (beeA.rarity === 'Royal' || beeB.rarity === 'Royal') return null;
        if (beeIsLimited(beeA) || beeIsLimited(beeB)) return null;   // Nov 1 2026

        const indexOf = (rarity) => {
            const idx = RARITY_ORDER.indexOf(rarity);
            return idx === -1 ? RARITY_ORDER.length - 1 : idx; // Named -> treated as topped-out
        };
        const baseIndex = Math.max(indexOf(beeA.rarity), indexOf(beeB.rarity));

        const baseRarity = RARITY_ORDER[baseIndex];
        const upgraded = baseIndex < RARITY_ORDER.length - 1 && Math.random() < (COMBINE_UPGRADE_CHANCE[baseRarity] || 0);
        const resultRarity = RARITY_ORDER[upgraded ? baseIndex + 1 : baseIndex];

        const sa = beeA.stats || {}, sb = beeB.stats || {};
        const total = s => BEE_SKILL_STATS.reduce((n, k) => n + (Number(s[k]) || 0), 0) + (Number(s.hp) || 0) / 4;
        const lead = total(sa) >= total(sb) ? beeA : beeB;
        const before = Math.max(total(sa), total(sb));
        const fresh = upgraded ? rollBeeStats(resultRarity) : {};
        const stats = { level: Math.max(Number(sa.level) || 1, Number(sb.level) || 1) };
        ['hp', ...BEE_SKILL_STATS].forEach(k => {
            const best = Math.max(Number(sa[k]) || 0, Number(sb[k]) || 0, Number(fresh[k]) || 0);
            const boost = k === 'hp' ? rollStatValue([1, 4]) : rollStatValue([0, 2]);
            stats[k] = Math.min(beeStatCap(resultRarity, k), best + boost);
        });

        // Nov 3 2026 (Craft; approved demo): the merged bee's talent. Two
        // males make a male (Drone). Otherwise a 35% chance of a talent the
        // hive is missing (an open job no bee can do), else a parent's.
        const male = beeA.sex === 'm' && beeB.sex === 'm';
        let talent = 'drone';
        if (!male) {
            const has = new Set(bees.filter(b => b.id !== beeIdA && b.id !== beeIdB && b.talent).map(b => b.talent));
            const missing = HIVE_JOB_RULES ? this.hiveOpenJobs().filter(j => j !== 'drone' && !has.has(j)) : [];
            const parents = [beeA, beeB].map(b => b.talent).filter(t => t && t !== 'drone');
            talent = missing.length && Math.random() < MERGE_GAP_CHANCE ? missing[Math.floor(Math.random() * missing.length)]
                : parents.length ? parents[Math.floor(Math.random() * parents.length)] : pickBeeTalent({ sex: 'f' });
        }
        this.state.hive.bees = bees.filter(b => b.id !== beeIdA && b.id !== beeIdB);

        const dexNumber = this.getHiveBees().filter(b => b.rarity !== 'Royal').length + 1;
        const keepName = lead.customNamed && lead.rarity === resultRarity;
        const newBee = {
            id: generateBeeId(),
            name: keepName ? lead.name : randomBeeName(this.getHiveBees().map(b => b.name)),
            rarity: resultRarity,
            class: null,   // Nov 3 2026 (Craft): starts resting; its talent may differ from its parents'
            obtainedAt: new Date().toISOString(),
            source: 'combine',
            stats,
            weight: Math.round(Math.max(Number(beeA.weight) || 0, Number(beeB.weight) || 0, rollBeeWeight(resultRarity)) * 10) / 10,
            dexNumber,
            element: lead.element || rollBeeElement(),
            traits: [...new Set([...(beeA.traits || []), ...(beeB.traits || [])])],
            merges: (Number(beeA.merges) || 0) + (Number(beeB.merges) || 0) + 1,
            sex: male ? 'm' : 'f',
            talent,
            customNamed: !!keepName
        };

        this.addHiveBee(newBee); // also saves - persists the consumption + the new bee together
        return { newBee, upgraded, statGain: Math.round(total(stats) - before) };
    }

    // 5h. Logic: Daily Tasks (a Habitica-style "Dailies" checklist, distinct
    // from quest tasks - these reset every day rather than being one-off).
    // Blueprint-authored (label/xp), like quests, but Vault tracks a running
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

    // Tick or untick one checklist line on a daily (no XP - the daily
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

    // Generic feed for the sitewide Reminders engine (src/core/services/reminders/) -
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

        // Save merge: remember when this day was checked or unchecked.
        task._days = task._days || {};
        task._days[today] = { done: justCompleted, t: Date.now() };
        const cut = shiftISODate(today, -90);
        Object.keys(task._days).forEach(d => { if (d < cut) delete task._days[d]; });
        if (justCompleted) {
            task.completedDates.push(today);
        } else {
            task.completedDates.splice(index, 1);
        }

        if (justCompleted) this._queenHeal(`daily:${task.id}:${today}`);
        if (justCompleted) this._noteDone('Daily', task.label);   // Oct 31 2026 (Craft): card memories
        this._checkStreakBonus(today);
        if (justCompleted && typeof this.incubatorTick === 'function') this.incubatorTick(today);   // dailies warm the Egg Incubator
        this.save();
        this._syncLevelUpBees();
        if (justCompleted) this._collectMaterialsOnCompletion(`daily:${task.id}`);
        return task;
    }

    // Streak bonus XP (Oct 27 2026): +20 when every daily due today is done,
    // plus a one-time bonus when the hive streak reaches 3 / 7 / 30 / 100
    // days. Un-checking a daily takes today's bonuses back.
    // STREAK (Nov 1 2026, Craft): a day counts once you finish STREAK_GOAL (5)
    // tasks of any kind: dailies, To-Dos and quest tasks (not habits, Craft).
    // Not everything has to be done. The streak = days in a row that counted;
    // today joins once it reaches 5.
    tasksDoneOn(day = todayISO()) {
        return this.doneOn(day).filter(x => x.kind !== 'habit').length;
    }
    taskStreak(today = todayISO()) {
        if (!this.state) return 0;
        let n = this.tasksDoneOn(today) >= STREAK_GOAL ? 1 : 0;
        for (let i = 1; i <= 730; i++) {
            if (this.tasksDoneOn(shiftISODate(today, -i)) < STREAK_GOAL) break;
            n++;
        }
        return n;
    }
    // The 3 / 7 / 30 / 100-day bonuses, paid once on the day you reach them.
    // Dropping under 5 today takes today's bonus back.
    _checkTaskStreak(today = todayISO()) {
        if (!this.state) return;
        if (!this.state.bonusXP) this.state.bonusXP = [];
        const mine = this.state.bonusXP.filter(b => b.date === today && /^streak-(\d+|week):/.test(b.key));
        if (this.tasksDoneOn(today) < STREAK_GOAL) {
            if (mine.length) this.state.bonusXP = this.state.bonusXP.filter(b => !mine.includes(b));
            return;
        }
        if (mine.length) return;
        const streak = this.taskStreak(today);
        const add = [];
        STREAK_BONUS.milestones.forEach(([days, xp]) => { if (streak === days) add.push({ key: `streak-${days}:${today}`, date: today, xp, why: `${days}-day streak` }); });
        const [y, mo, d] = today.split('-').map(Number);
        if (streak >= 7 && new Date(y, mo - 1, d).getDay() === 0) add.push({ key: `streak-week:${today}`, date: today, xp: STREAK_BONUS.weekly, why: `Weekly streak (${streak} days)` });
        if (!add.length) return;
        this.state.bonusXP.push(...add);
        if (typeof Toast !== 'undefined') Toast.show(add.map(b => `🔥 +${b.xp} XP · ${b.why}`).join('  '), 'positive');
    }

    _checkStreakBonus(today = todayISO()) {
        if (!this.state.bonusXP) this.state.bonusXP = [];
        const due = (this.state.dailyTasks || []).filter(d => (!d.startDate || d.startDate <= today) && isDailyDueOn(d, today));
        const allDone = due.length > 0 && due.every(d => (d.completedDates || []).includes(today));
        const mine = this.state.bonusXP.filter(b => b.date === today);
        if (!allDone) {
            if (mine.some(b => b.key.startsWith('all-dailies:'))) this.state.bonusXP = this.state.bonusXP.filter(b => b.key !== `all-dailies:${today}`);
            return;
        }
        // Nov 1 2026 (Craft): the 3 / 7 / 30 / 100-day bonuses moved to the
        // task streak (_checkTaskStreak); this one is just "all dailies done".
        if (mine.some(b => b.key.startsWith('all-dailies:'))) return;
        const add = [{ key: `all-dailies:${today}`, date: today, xp: STREAK_BONUS.allDailies, why: 'All dailies done' }];
        this.state.bonusXP.push(...add);
        if (typeof Toast !== 'undefined') Toast.show(add.map(b => `🔥 +${b.xp} XP · ${b.why}`).join('  '), 'positive');
    }

    // 5i. Logic: Daily Task management (add/edit/remove) - mirrors
    // addTask/updateTask/removeTask for quest tasks above. Expanded past
    // just label/xp/difficulty to match the full Create/Edit Daily page
    // (see src/features/dailies/create-daily.js): notes, a checklist of
    // sub-items, a repeats schedule (see isDailyDueOn above), reminder
    // times, and free-text tags. Every new field has a safe fallback so
    // both callers can still pass just the original 3 fields if that's
    // all they have.
    addDailyTask({ label, xp, difficulty, notes, checklist, startDate, repeats, reminders, tags, minutes, skillsOff }) {
        if (!this.state) return null;
        if (!this.state.dailyTasks) this.state.dailyTasks = [];

        const id = `daily-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        this._lastDailyId = id;
        this.state.dailyTasks.push({
            id,
            label,
            xp: Number(xp) || 0,
            difficulty: difficulty || null,
            notes: notes || '',
            checklist: Array.isArray(checklist) ? checklist : [],
            startDate: startDate || todayISO(),
            repeats: repeats || { type: 'daily', every: 1, daysOfWeek: [] },
            reminders: Array.isArray(reminders) ? reminders : [],
            tags: Array.isArray(tags) ? tags : [],
            minutes: Number(minutes) > 0 ? Number(minutes) : null,
            skillsOff: Array.isArray(skillsOff) ? skillsOff : [],
            completedDates: []
        });
        this._refreshTaskXP();
        this._captureHashtags(this.state.dailyTasks[this.state.dailyTasks.length - 1]);

        this.save();
        return this.state.dailyTasks;
    }

    updateDailyTask(taskId, { label, xp, difficulty, notes, checklist, startDate, repeats, reminders, tags, minutes, skillsOff }) {
        if (!this.state) return null;

        const task = (this.state.dailyTasks || []).find(t => t.id === taskId);
        if (!task) return null;
        const textBefore = (task.tags || []).join('\n');   // tags before the edit (see _captureHashtags)

        if (label !== undefined) task.label = label;
        if (xp !== undefined) task.xp = Number(xp) || 0;
        if (difficulty !== undefined) task.difficulty = difficulty || null;
        if (notes !== undefined) task.notes = notes;
        if (checklist !== undefined) task.checklist = Array.isArray(checklist) ? checklist : [];
        const schedBefore = JSON.stringify([task.startDate, task.repeats]);
        if (startDate !== undefined) task.startDate = startDate;
        if (repeats !== undefined) task.repeats = repeats;
        // Schedule changed here: Habitica's old "due today" no longer applies.
        if (JSON.stringify([task.startDate, task.repeats]) !== schedBefore) delete task.habiticaDue;
        if (reminders !== undefined) task.reminders = Array.isArray(reminders) ? reminders : [];
        if (tags !== undefined) task.tags = Array.isArray(tags) ? tags : [];
        if (minutes !== undefined) task.minutes = Number(minutes) > 0 ? Number(minutes) : null;
        if (skillsOff !== undefined) task.skillsOff = Array.isArray(skillsOff) ? skillsOff : [];
        this._captureHashtags(task, textBefore);
        this._refreshTaskXP();

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
    // `history` log of every click (see computeHabitXP above for how that
    // log turns into a live XP total, never affected by resetCounter).
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
                // XP/totals above are still computed from the full history.
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
        // Queen health (Oct 2026): a bad habit hurts (half a missed daily).
        if (direction === 'negative') this._queenHurt(Math.ceil(queenHit(habit) / 2), `😖 ${habit.label}`);

        this.save();
        this._syncLevelUpBees();
        // Collector-bee material drops only fire on genuine accomplishment,
        // same reasoning as computeSkillContributions skipping negative
        // clicks for the matrix - a lapse shouldn't drop loot.
        if (direction === 'positive') this._collectMaterialsOnCompletion(`habit:${habit.id}`);
        if (direction === 'positive') this._noteDone('Habit', habit.label);   // Oct 31 2026 (Craft): card memories
        return habit;
    }

    addHabit({ label, xp, difficulty, notes, tags, positive, negative, resetCounter, minutes, skillsOff }) {
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
            xp: Number(xp) || 0,
            difficulty: difficulty || null,
            notes: notes || '',
            tags: Array.isArray(tags) ? tags : [],
            positive: hasPositive,
            negative: hasNegative,
            resetCounter: resetCounter || 'daily',
            minutes: Number(minutes) > 0 ? Number(minutes) : null,
            skillsOff: Array.isArray(skillsOff) ? skillsOff : [],
            history: []
        });
        this._refreshTaskXP();
        this._captureHashtags(this.state.habits[this.state.habits.length - 1]);

        this.save();
        return this.state.habits;
    }

    updateHabit(habitId, { label, xp, difficulty, notes, tags, positive, negative, resetCounter, minutes, skillsOff }) {
        if (!this.state) return null;

        const habit = (this.state.habits || []).find(h => h.id === habitId);
        if (!habit) return null;
        const textBefore = (habit.tags || []).join('\n');   // tags before the edit (see _captureHashtags)

        if (label !== undefined) habit.label = label;
        if (xp !== undefined) habit.xp = Number(xp) || 0;
        if (difficulty !== undefined) habit.difficulty = difficulty || null;
        if (notes !== undefined) habit.notes = notes;
        if (tags !== undefined) habit.tags = Array.isArray(tags) ? tags : [];
        if (positive !== undefined) habit.positive = positive !== false;
        if (negative !== undefined) habit.negative = negative !== false;
        if (resetCounter !== undefined) habit.resetCounter = resetCounter || 'daily';
        if (minutes !== undefined) habit.minutes = Number(minutes) > 0 ? Number(minutes) : null;
        if (skillsOff !== undefined) habit.skillsOff = Array.isArray(skillsOff) ? skillsOff : [];
        this._refreshTaskXP();
        // Same "can't have neither" guard as addHabit, re-checked after
        // applying whichever of positive/negative was just passed in.
        if (habit.positive === false && habit.negative === false) { habit.positive = true; habit.negative = true; }
        this._captureHashtags(habit, textBefore);

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
    // removes the newest clicks from this period. XP follows the clicks,
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
        todo.completedAt = todo.completed ? Date.now() : null;   // Oct 31 2026 (Craft, from 1.0.6): time for History
        if (todo.completed) this._queenHeal(`todo:${todo.id}`);
        if (todo.completed) this._noteDone('To-Do', todo.label);   // Oct 31 2026 (Craft): card memories

        this.save();
        this._syncLevelUpBees();
        if (todo.completed) this._collectMaterialsOnCompletion(`todo:${todo.id}`);
        return todo;
    }

    // Oct 31 2026 (Craft, from 1.0.6): everything finished on one day
    // (YYYY-MM-DD), newest first. One list for Home's XP today, Done today
    // and History, so they always match. Quest tasks use your local day; a
    // bad habit tap costs half (same math as the level bar). t = ms or 0.
    doneOn(day = todayISO()) {
        if (!this.state) return [];
        const out = [], S = this.state;
        (S.dailyTasks || []).forEach(t => { if ((t.completedDates || []).includes(day)) out.push({ kind: 'daily', icon: '☀️', what: 'Daily', id: t.id, label: t.label, xp: Number(t.xp) || 0, t: (t._days && t._days[day] && t._days[day].t) || 0 }); });
        (S.todos || []).forEach(t => { if (t.completed && t.completedDate === day) out.push({ kind: 'todo', icon: '✅', what: 'To-Do', id: t.id, label: t.label, xp: Number(t.xp) || 0, t: t.completedAt || t._mt || 0 }); });
        (S.quests || []).forEach(q => (q.tasks || []).forEach(t => {
            if (!t.completed || localDayOf(t.dateCompleted) !== day) return;
            const ms = String(t.dateCompleted || '').length > 10 ? (Date.parse(t.dateCompleted) || 0) : 0;
            out.push({ kind: 'quest', icon: '🗺️', what: q.title, id: q.id, extra: t.id, label: t.label, xp: Number(t.xp) || 0, t: ms });
        }));
        (S.habits || []).forEach(h => {
            const taps = (h.history || []).filter(x => x.date === day);
            const good = taps.filter(x => x.direction === 'positive'), minus = taps.length - good.length;
            const stamp = (x) => Number(String(x.id || '').split('-')[1]) || 0;
            const last = taps.length ? Math.max(...taps.map(stamp)) : 0;
            if (good.length) out.push({ kind: 'habit', icon: '🔁', what: `Habit${good.length > 1 ? ` ×${good.length}` : ''}`, id: h.id, label: h.label, xp: good.reduce((n, x) => n + completionXP(h, x.minutes), 0), t: last });
            if (minus) out.push({ kind: 'habit', icon: '😖', what: `Bad habit${minus > 1 ? ` ×${minus}` : ''}`, id: h.id, label: h.label, xp: -minus * habitPenaltyXP(h), t: last });
        });
        return out.sort((a, b) => b.t - a.t);
    }

    addTodo({ label, xp, difficulty, notes, checklist, dueDate, dueTime, reminders, tags, minutes, skillsOff }) {
        if (!this.state) return null;
        if (!this.state.todos) this.state.todos = [];

        this.state.todos.push({
            id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label,
            xp: Number(xp) || 0,
            difficulty: difficulty || null,
            notes: notes || '',
            checklist: Array.isArray(checklist) ? checklist : [],
            dueDate: dueDate || null,
            // Deadline time (Oct 27 2026), "HH:MM" or null. Smart Notifications count down to it.
            dueTime: dueDate && /^\d{2}:\d{2}$/.test(dueTime || '') ? dueTime : null,
            reminders: Array.isArray(reminders) ? reminders : [],
            tags: Array.isArray(tags) ? tags : [],
            minutes: Number(minutes) > 0 ? Number(minutes) : null,
            skillsOff: Array.isArray(skillsOff) ? skillsOff : [],
            completed: false,
            completedDate: null
        });
        this._captureHashtags(this.state.todos[this.state.todos.length - 1]);
        this._refreshTaskXP();

        this.save();
        return this.state.todos;
    }

    updateTodo(todoId, { label, xp, difficulty, notes, checklist, dueDate, dueTime, reminders, tags, minutes, skillsOff }) {
        if (!this.state) return null;

        const todo = (this.state.todos || []).find(t => t.id === todoId);
        if (!todo) return null;
        const textBefore = (todo.tags || []).join('\n');   // tags before the edit (see _captureHashtags)

        if (label !== undefined) todo.label = label;
        if (xp !== undefined) todo.xp = Number(xp) || 0;
        if (difficulty !== undefined) todo.difficulty = difficulty || null;
        if (notes !== undefined) todo.notes = notes;
        if (checklist !== undefined) todo.checklist = Array.isArray(checklist) ? checklist : [];
        if (dueDate !== undefined) todo.dueDate = dueDate || null;
        if (dueTime !== undefined) todo.dueTime = /^\d{2}:\d{2}$/.test(dueTime || '') ? dueTime : null;
        if (!todo.dueDate) todo.dueTime = null;
        if (reminders !== undefined) todo.reminders = Array.isArray(reminders) ? reminders : [];
        if (tags !== undefined) todo.tags = Array.isArray(tags) ? tags : [];
        if (minutes !== undefined) todo.minutes = Number(minutes) > 0 ? Number(minutes) : null;
        if (skillsOff !== undefined) todo.skillsOff = Array.isArray(skillsOff) ? skillsOff : [];
        this._captureHashtags(todo, textBefore);
        this._refreshTaskXP();

        this.save();
        return todo;
    }

    removeTodo(todoId) {
        if (!this.state || !this.state.todos) return false;

        this.state.todos = this.state.todos.filter(t => t.id !== todoId);
        this.save();
        return true;
    }

    // Tick or untick one checklist line on a to-do (no XP - the to-do
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

    // 5k. Logic: Dictionary Terms (src/plugins/dictionary/ - a plugin since 2026-10-11) - each term:
    // { id, name, definition, category, createdAt }. `category` is what
    // actually ties a term to the skill mastery matrix (see
    // computeSkillMatrixXP above) - defining a term under "CSS" is the
    // deliberate, curated action that makes that category real, rather
    // than every stray word you ever type anywhere silently becoming a
    // tracked skill. Create-Daily's auto-tagging only ever MATCHES against
    // term names that already exist here; it never creates new ones on
    // its own.
    getDictionaryTerms() {
        return this.state ? (this.state.dictionary || []) : [];
    }

    // See findHashtags above. `beforeText` = the item's text before this
    // edit (empty for a new item). Doesn't save - the caller does.
    // Oct 29 2026 (Craft): no more #words. A NEW tag on a task that also has
    // a skill tag becomes a Dictionary word of that skill ("Closure" on a task
    // tagged JavaScript). A lone new tag stays its own skill. `beforeText`
    // is the task's tags before the edit, one per line (only new ones count,
    // so a deleted Dictionary word doesn't come back on the next edit).
    _captureHashtags(item, beforeText = '') {
        if (!this.state || !this.state.plugins || !this.state.plugins.dictionary || !item) return [];
        if (!this.state.dictionary) this.state.dictionary = [];
        const was = new Set(String(beforeText || '').split('\n').map(x => x.trim().toLowerCase()).filter(Boolean));
        const have = new Set(this.state.dictionary.map(t => String(t.name || '').toLowerCase()));
        const cats = new Map(this.state.dictionary.map(t => [String(t.category || '').toLowerCase(), t.category]));
        const tags = (item.tags || []).map(t => String(t || '').trim()).filter(Boolean);
        const skill = tags.find(t => cats.has(t.toLowerCase()) || skillLibEntry(t));
        if (!skill) return [];
        // Oct 31 2026 (Craft): ask first. New words wait in state.offers and
        // a small card asks "Add to Dictionary?" (SkillMerge.ask). Nothing is
        // added until you say yes; a "No" isn't asked again.
        const offered = [];
        // "Java Script" is just JavaScript: compare without spaces or dashes too.
        const flat = (x) => String(x || '').toLowerCase().replace(/[\s\-_.]+/g, '');
        const known = new Set([...have, ...cats.keys(), skill.toLowerCase()].map(flat));
        tags.forEach(name => {
            const key = name.toLowerCase();
            if (name === skill || was.has(key) || have.has(key) || cats.has(key) || skillLibEntry(name) || known.has(flat(name))) return;
            have.add(key);
            if (this._offer({ kind: 'term', name, category: cats.get(skill.toLowerCase()) || skill })) offered.push(name);
        });
        return offered;
    }

    // ---- Ask-first offers (Oct 31 2026, Craft) ----
    // { kind: 'term', name, category } = add a word to the Dictionary
    // { kind: 'skill', name }          = make an everyday skill
    // Kept in the save, so a question asked as you leave a page shows on the next.
    _offer(o) {
        if (!this.state || !o || !o.name) return false;
        const id = `${o.kind}:${String(o.name).toLowerCase()}`;
        const no = this.state.offersDeclined || {};
        this.state.offers = this.state.offers || [];
        if (no[id] || this.state.offers.some(x => x.id === id)) return false;
        this.state.offers.push({ ...o, id, at: new Date().toISOString() });
        if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent !== 'undefined') setTimeout(() => window.dispatchEvent(new CustomEvent('bb-offers')), 0);
        return true;
    }
    getOffers() { return (this.state && this.state.offers) || []; }
    // yes = add it; no = drop it and don't ask again. Returns what was made.
    answerOffer(id, yes) {
        if (!this.state) return null;
        const o = this.getOffers().find(x => x.id === id);
        if (!o) return null;
        this.state.offers = this.getOffers().filter(x => x.id !== id);
        let made = null;
        if (yes && o.kind === 'term') {
            const have = (this.state.dictionary || []).some(t => String(t.name || '').toLowerCase() === o.name.toLowerCase());
            made = have ? null : this.addDictionaryTerm({ name: o.name, category: o.category, source: 'tag' });
        } else if (yes && o.kind === 'skill') {
            made = this.createLibrarySkill(o.name, { auto: true });
        } else if (!yes) {
            this.state.offersDeclined = { ...(this.state.offersDeclined || {}), [id]: new Date().toISOString() };
            if (o.kind === 'skill') this.state.skillDeclined = { ...(this.state.skillDeclined || {}), [o.name]: true };
        }
        this.save();
        return made;
    }

    addDictionaryTerm({ name, definition, category, ...more }) {
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
        this._termExtras(term, more);
        this.state.dictionary.push(term);
        this.save();
        return term;
    }

    // Starter skills (Oct 28 2026): each picked skill's word pack goes into
    // the Dictionary under that skill. null = skipped for now. Returns how
    // many words were added.
    setStarterSkills(list) {
        if (!this.state) return 0;
        if (!list) {
            this.state.starterSkills = { ...(this.state.starterSkills || {}), skipped: true, seen: true };
            this.save();
            return 0;
        }
        if (!this.state.dictionary) this.state.dictionary = [];
        const have = new Set(this.state.dictionary.map(t => String(t.name || '').toLowerCase()));
        let added = 0;
        list.forEach(({ name, words }) => (words || []).forEach(w => {
            const key = String(w).toLowerCase();
            if (!key || have.has(key)) return;
            have.add(key);
            this.state.dictionary.push({ id: `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: String(w), definition: '',
                category: String(name).trim(), createdAt: new Date().toISOString(), source: 'starter' });
            added++;
        }));
        this.state.starterSkills = { done: true, seen: true, picked: list.map(x => x.name) };
        this.save();
        return added;
    }

    // Rich terms (Oct 28 2026): full name, code, examples, picture, MDN and
    // W3Schools links. Empty values are removed so old terms stay small.
    _termExtras(term, more = {}) {
        ['full', 'code', 'image', 'mdnUrl', 'w3Url', 'source'].forEach(k => {
            if (more[k] === undefined) return;
            const v = String(more[k] ?? '').trim();
            if (v) term[k] = v.slice(0, k === 'code' ? 4000 : 600); else delete term[k];
        });
        if (more.examples !== undefined) {
            const ex = (Array.isArray(more.examples) ? more.examples : String(more.examples || '').split('\n')).map(x => String(x).trim()).filter(Boolean).slice(0, 10);
            if (ex.length) term.examples = ex; else delete term.examples;
        }
        return term;
    }

    updateDictionaryTerm(termId, { name, definition, category, ...more }) {
        if (!this.state || !this.state.dictionary) return null;

        const term = this.state.dictionary.find(t => t.id === termId);
        if (!term) return null;

        if (name !== undefined && String(name).trim()) term.name = String(name).trim();
        if (definition !== undefined) term.definition = String(definition).trim();
        if (category !== undefined) term.category = String(category).trim() || 'General';
        this._termExtras(term, more);

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
    // computeSkillMatrixXP above for how the raw xp is derived, and
    // computeSkillLevelState above for how that xp maps onto a level/bar.
    // Each entry comes back pre-merged with its level info so the Dashboard
    // never has to cross-reference two separate calls per row.
    // ---- Smart skills (Oct 29 2026, approved demo) ----
    // Icon, color and how a skill is measured ('time' or 'times').
    skillMeta(category) {
        const m = (this.state && this.state.skillMeta && this.state.skillMeta[category]) || {};
        const lib = skillLibEntry(category) || {};
        return { icon: m.icon || lib.icon || '🌱', color: m.color || lib.color || skillColorFor(category), measure: m.measure || lib.measure || 'time' };
    }
    setSkillMeasure(category, measure) {
        if (!this.state || !['time', 'times'].includes(measure)) return;
        this.state.skillMeta = this.state.skillMeta || {};
        this.state.skillMeta[category] = { ...(this.state.skillMeta[category] || {}), measure };
        this.save();
    }
    // Skill paths (see SKILL_PATHS). entry = this skill's getSkillMatrix row,
    // passed in when the caller already has it.
    getSkillPath(category, entry) {
        const meta = this.skillMeta(category);
        if (entry === undefined) entry = this.getSkillMatrix().find(m => m.category === category);
        const times = meta.measure === 'times';
        const progress = entry ? (times ? entry.count || 0 : entry.timeHours || 0) : 0;
        const claims = ((this.state && this.state.pathClaims) || {})[category] || {};
        const old = (this.state && this.state.skillsMastered) || {};
        const steps = skillPathSteps(category, meta.measure, (k) => this.hasSkill(k));
        return { category, measure: meta.measure, progress, from: steps.from,
            milestones: steps.list.map((st, i, all) => ({ ...st, reached: progress >= st.need || !!old[st.id], claimed: !!claims[st.id], reward: skillPathReward(i, all.length) })) };
    }
    skillPathWaiting(category, entry) {
        return this.getSkillPath(category, entry).milestones.filter(m => m.reached && !m.claimed).length;
    }
    // Hands out one reached milestone's reward, once. Null if not reached or taken.
    claimSkillMilestone(category, id) {
        if (!this.state) return null;
        const m = this.getSkillPath(category).milestones.find(x => x.id === id);
        if (!m || !m.reached || m.claimed) return null;
        const r = m.reward, bees = [];
        if (r.kind === 'material') this._addMaterial(r.id, r.qty);
        else if (r.kind === 'tickets') {
            if (!this.state.hive) this.state.hive = { bees: [], levelUpBeesAwarded: 0, tickets: 0, ticketsAwarded: 0 };
            this.state.hive.tickets = (Number(this.state.hive.tickets) || 0) + r.qty;
        } else if (r.kind === 'bee') bees.push(this.awardBee('skill'));
        this.state.pathClaims = this.state.pathClaims || {};
        this.state.pathClaims[category] = { ...(this.state.pathClaims[category] || {}), [id]: new Date().toISOString() };
        this.save();
        return { category, milestone: m, reward: r, bees };
    }
    // Every skill name you have: Dictionary categories, tags on tasks, levels.
    _skillNames() {
        const S = this.state || {}, names = new Set();
        const add = (t) => { if (t && String(t).trim()) names.add(String(t).trim().toLowerCase()); };
        (S.dictionary || []).forEach(t => add(t.category));
        [...(S.dailyTasks || []), ...(S.todos || []), ...(S.habits || [])].forEach(t => (t.tags || []).forEach(add));
        (S.quests || []).forEach(q => { (q.tags || []).forEach(add); (q.tasks || []).forEach(t => (t.tags || []).forEach(add)); });
        Object.keys(S.skillLevels || {}).forEach(add);
        return names;
    }
    hasSkill(name) { return this._skillNames().has(String(name || '').trim().toLowerCase()); }
    // A library skill that fits this text but that you don't have yet.
    librarySuggestion(text) {
        const declined = (this.state && this.state.skillDeclined) || {};
        const names = this._skillNames();
        return libraryMatches(text).find(s => !names.has(s.name.toLowerCase()) && !declined[s.name]) || null;
    }
    // Makes a library skill: its words go into the Dictionary under it.
    createLibrarySkill(name, { auto = false } = {}) {
        const lib = skillLibEntry(name);
        if (!this.state || !lib) return null;
        if (!this.state.dictionary) this.state.dictionary = [];
        const have = new Set(this.state.dictionary.map(t => String(t.name || '').toLowerCase()));
        lib.words.forEach(w => {
            if (have.has(w)) return;
            this.state.dictionary.push({ id: `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: w, definition: '', category: lib.name, createdAt: new Date().toISOString(), source: 'library' });
        });
        this.state.skillMeta = this.state.skillMeta || {};
        this.state.skillMeta[lib.name] = { icon: lib.icon, color: lib.color, measure: lib.measure, fromLibrary: true, auto };
        if (this.state.skillHits) delete this.state.skillHits[lib.name];
        if (this.state.skillDeclined) delete this.state.skillDeclined[lib.name];
        this.save();
        if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new CustomEvent('skill-created', { detail: { name: lib.name, auto } }));
        return lib.name;
    }
    declineLibrarySkill(name) {
        if (!this.state) return;
        this.state.skillDeclined = { ...(this.state.skillDeclined || {}), [name]: true };
        this.save();
    }
    // Called after any check-off. A library skill you keep doing makes itself
    // after SKILL_AUTO_AFTER check-offs of any kind. Returns names it made.
    noteCheckoff(task, extraText = '') {
        if (!this.state || !task) return [];
        const s = this.librarySuggestion([extraText, task.label, task.notes].filter(Boolean).join(' '));
        if (!s) return [];
        this.state.skillHits = this.state.skillHits || {};
        this.state.skillHits[s.name] = (this.state.skillHits[s.name] || 0) + 1;
        // Oct 31 2026 (Craft): asks first instead of making itself.
        if (this.state.skillHits[s.name] >= SKILL_AUTO_AFTER) this._offer({ kind: 'skill', name: s.name });
        this.save();
        return [];
    }
    // Old skills that the new one covers ("Time" inside "Time Management"),
    // with how many past tasks would move. Ones you said "Keep both" to are skipped.
    mergeCandidates(to) {
        if (!this.state || !to) return [];
        const skip = this.state.skillMergeSkip || {};
        const toWords = new Set(String(to).toLowerCase().split(/\s+/));
        const S = this.state, lower = String(to).toLowerCase();
        return [...this._skillNames()].filter(n => n !== lower && n.split(/\s+/).every(w => toWords.has(w)) && !skip[`${n}>${lower}`])
            .map(n => {
                const items = [...(S.dailyTasks || []), ...(S.todos || []), ...(S.habits || []), ...(S.quests || []).flatMap(q => q.tasks || [])];
                const count = items.filter(t => (t.tags || []).some(x => String(x).toLowerCase() === n)).length
                    + (S.dictionary || []).filter(t => String(t.category || '').toLowerCase() === n).length;
                const proper = (S.dictionary || []).map(t => t.category).concat(items.flatMap(t => t.tags || [])).find(x => String(x || '').toLowerCase() === n) || n;
                return { from: proper, to, count };
            });
    }
    skipMerge(from, to) {
        if (!this.state) return;
        this.state.skillMergeSkip = { ...(this.state.skillMergeSkip || {}), [`${String(from).toLowerCase()}>${String(to).toLowerCase()}`]: true };
        this.save();
    }
    // Merge skill/tag `from` into `to` everywhere (tasks, quests, Dictionary,
    // levels). Undo with undoMerge() right after (kept in memory only).
    mergeSkill(from, to) {
        if (!this.state || !from || !to || String(from).toLowerCase() === String(to).toLowerCase()) return 0;
        const S = this.state, f = String(from).toLowerCase();
        // Oct 31 2026 (Craft): a device copy first, so a merge can be undone
        // even after the app closes (Settings › device backups).
        try { this.createLocalBackup(`Before merging ${from} into ${to}`); } catch { /* storage full: Undo still works this session */ }
        this._mergeUndo = JSON.stringify({ dailyTasks: S.dailyTasks, todos: S.todos, habits: S.habits, quests: S.quests, dictionary: S.dictionary, skillLevels: S.skillLevels, skillMeta: S.skillMeta });
        let moved = 0;
        const fix = (arr) => {
            if (!Array.isArray(arr) || !arr.some(x => String(x).toLowerCase() === f)) return arr;
            moved++;
            const out = arr.filter(x => String(x).toLowerCase() !== f);
            if (!out.some(x => String(x).toLowerCase() === String(to).toLowerCase())) out.push(to);
            return out;
        };
        [...(S.dailyTasks || []), ...(S.todos || []), ...(S.habits || [])].forEach(t => { t.tags = fix(t.tags); if (t.skillsOff) t.skillsOff = fix(t.skillsOff); });
        (S.quests || []).forEach(q => {
            q.tags = fix(q.tags);
            if (q.moduleTags) Object.keys(q.moduleTags).forEach(k => { q.moduleTags[k] = fix(q.moduleTags[k]); });
            (q.tasks || []).forEach(t => { t.tags = fix(t.tags); });
        });
        (S.dictionary || []).forEach(t => { if (String(t.category || '').toLowerCase() === f) { t.category = to; moved++; } });
        if (S.skillLevels) {
            const key = Object.keys(S.skillLevels).find(k => k.toLowerCase() === f);
            if (key) {
                const a = S.skillLevels[key], b = S.skillLevels[to];
                if (!b || (a && a.level > b.level)) S.skillLevels[to] = a;
                delete S.skillLevels[key];
            }
        }
        if (S.skillMeta) Object.keys(S.skillMeta).filter(k => k.toLowerCase() === f).forEach(k => delete S.skillMeta[k]);
        this.save();
        return moved;
    }
    undoMerge() {
        if (!this.state || !this._mergeUndo) return false;
        Object.assign(this.state, JSON.parse(this._mergeUndo));
        this._mergeUndo = null;
        this.save();
        return true;
    }

    // Nov 7 2026 (Craft): a skill's hours, level, stage and path count REAL
    // minutes only (the time log: what you logged, quest timers, imported
    // history). Planned time is kept as plannedHours, and XP still uses it.
    // Levels can drop when this switches over; Craft OK'd that.
    getSkillMatrix() {
        if (!this.state) return [];
        if (!this.state.skillLevels) this.state.skillLevels = {};
        const realBy = typeof this.getRealBySkill === 'function' ? this.getRealBySkill() : {};
        // One time: skill levels earned on planned time drop to what your real
        // hours reach (Craft: "if I lose levels, it is what it is").
        if (!this.state.skillRealV1) {
            this.state.skillRealV1 = new Date().toISOString();
            Object.entries(this.state.skillLevels).forEach(([cat, st]) => {
                if (!st || this.skillMeta(cat).measure === 'times') return;
                const lv = skillLevelFromHours((realBy[cat] || 0) / 60);
                if ((st.level || 1) > lv) { this._changeLog && this._changeLog('edit', `Skill "${cat}" level ${st.level} → ${lv}`, 'Skills now count real hours only'); st.level = lv; }
            });
        }
        const rows = computeSkillMatrixXP(this.state.dailyTasks, this.state.dictionary, this.state.quests, this.state.habits, this.state.todos);
        const seen = new Set(rows.map(r => r.category.toLowerCase()));
        Object.keys(realBy).forEach(c => { if (!seen.has(c.toLowerCase())) rows.push({ category: c, xp: 0, minutes: 0, bySource: {}, count: 0, realMinutes: 0, estMinutes: 0, timesMinutes: 0, hours: 0 }); });
        return rows.map(entry => {
            const real = realBy[entry.category] || 0;
            const stored = this.state.skillLevels[entry.category];
            const meta = this.skillMeta(entry.category);
            // "Times done" skills level up by how often, not how long (Oct 29 2026).
            const levelState = computeSkillLevelState(meta.measure === 'times' ? entry.timesMinutes : real, stored ? stored.level : 1);
            return { ...entry, ...levelState, ...meta, plannedHours: entry.minutes / 60, minutes: real, hours: real / 60, realHours: real / 60, estHours: 0, timeHours: real / 60 };
        }).sort((a, b) => b.minutes - a.minutes);
    }

    // Every contribution toward `category` completed on or after `sinceISO`
    // (or ALL of them, if sinceISO is null/undefined - a skill's very first
    // level-up has no "since" yet). This is what gets handed to Eve in
    // levelUpSkill below so her reward judgment is based on the real batch
    // of work behind that level-up, not just a bare XP number. A
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
    // Rewards: always +1 gacha ticket (added to the existing Hive Mind ticket
    // pool - unwrap it from the Pollination Chamber like any other ticket),
    // plus Pollen and an optional rarer bonus material judged by Eve
    // against everything completed in this skill since its last level-up
    // (see getSkillContributionsSince above). If Eve's unreachable, the
    // level-up still goes through with a quiet flat fallback - a downed
    // Ollama server should never block the celebration itself.
    async levelUpSkill(category) {
        if (!this.state) return null;
        if (!this.state.skillLevels) this.state.skillLevels = {};

        // Nov 7 2026 (Craft): real minutes (getSkillMatrix), same as the bar.
        const matrixEntry = this.getSkillMatrix().find(entry => entry.category === category);
        // Oct 31 2026 (Craft): a "times done" skill levels by count, same as its bar.
        const minutes = matrixEntry ? (this.skillMeta(category).measure === 'times' ? matrixEntry.timesMinutes : matrixEntry.minutes) : 0;

        const stored = this.state.skillLevels[category] || { level: 1, leveledUpAt: null };
        const levelState = computeSkillLevelState(minutes, stored.level);
        if (!levelState.maxed) return null;
        if (this._levelingSkill === category) return null;   // no double tap
        this._levelingSkill = category;

        const contributions = this.getSkillContributionsSince(category, stored.leveledUpAt);

        let pollen = 3; // quiet fallback if Eve can't be reached
        let bonusMaterialId = null;
        try {
            const assessment = await Eve.assessSkillLevelUpReward(category, contributions.map(c => c.label));
            pollen = assessment.pollen;
            bonusMaterialId = assessment.bonusMaterialId;
        } catch (error) {
            // Silent fallback, same philosophy as create-daily's "Ask Eve"
            // button - a level-up should never be blocked by Ollama being down.
        }

        if (!this.state.inventory) this.state.inventory = { materials: {}, items: {}, fragments: {} };
        if (!this.state.inventory.materials) this.state.inventory.materials = {};
        this.state.inventory.materials.pollen = (this.state.inventory.materials.pollen || 0) + pollen;

        if (bonusMaterialId && MATERIAL_CATALOG.some(m => m.id === bonusMaterialId)) {
            this.state.inventory.materials[bonusMaterialId] = (this.state.inventory.materials[bonusMaterialId] || 0) + 1;
        } else {
            bonusMaterialId = null; // ignore anything Eve returned that isn't a real material id
        }

        // Oct 2026 rewards: 1 material every level, tickets every 5th level,
        // 1 bee when the skill reaches a new stage (see skillLevelReward).
        const newLevel = stored.level + 1;
        const stageBefore = skillStageOf(skillHoursToReach(stored.level)).name;
        const stageAfter = skillStageOf(skillHoursToReach(newLevel)).name;
        const reward = skillLevelReward(newLevel, stageAfter !== stageBefore);
        const materials = [];
        for (let i = 0; i < reward.materials; i++) {
            const id = rollMaterialDrop();
            this.state.inventory.materials[id] = (this.state.inventory.materials[id] || 0) + 1;
            materials.push(id);
        }
        if (!this.state.hive) this.state.hive = { bees: [], levelUpBeesAwarded: 0, tickets: 0, ticketsAwarded: 0 };
        if (typeof this.state.hive.tickets !== 'number') this.state.hive.tickets = 0;
        this.state.hive.tickets += reward.tickets;
        const bees = [];
        for (let i = 0; i < reward.bees; i++) bees.push(this.awardBee('skill'));

        this.state.skillLevels[category] = { level: newLevel, leveledUpAt: new Date().toISOString() };
        this._levelingSkill = null;
        this.save();

        return { category, newLevel, pollen, bonusMaterialId, ticketsGranted: reward.tickets, materials, bees,
            stage: stageAfter, stageUp: stageAfter !== stageBefore };
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

    // ---- Save types (Oct 31 2026, Craft) ----
    // REAL = your account, TEST = the 🛠 test save, PCLOCAL = this computer's
    // local test account. Shown in every save file name so you can tell them
    // apart at a glance: bizzybee-REAL-2026-10-31_08-15.json
    saveType() { return this.pcLocal ? 'PCLOCAL' : this.devTest ? 'TEST' : 'REAL'; }
    saveFileName(note = '') {
        const d = new Date(), pad = n => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
        return `bizzybee-${this.saveType()}-${note ? note + '-' : ''}${stamp}.json`;
    }
    // A save file you keep: the save plus its type, so importing it into a
    // different type of save asks first.
    exportForFile() {
        if (!this.state) return null;
        return JSON.stringify({ ...this.state, saveKind: this.saveType() }, null, 2);
    }
    // true = go ahead. Asks when the file's type doesn't match this save.
    confirmImportKind(text) {
        let kind = null;
        try { kind = JSON.parse(text).saveKind || null; } catch { return true; }
        const here = this.saveType();
        if (!kind || kind === here) return true;
        return confirm(`This is a ${kind} save file. Load it into your ${here} save?`);
    }

    // PC LOCAL: the local test account (name Developer, King Test Bee).
    _seedPcLocal() {
        if (!this.state.onboarding && typeof freshOnboardingRecord === 'function') this.state.onboarding = freshOnboardingRecord();
        this.completeOnboarding({ royal: 'king', name: 'Test Bee' });
        this.state.displayName = 'Developer';
        if (this.state.user) this.state.user.name = 'Developer';
        this.state.pcLocalSeeded = true;
        this.save();
    }

    // Returns { ok: true } on success or { ok: false, error } on failure.
    // Doesn't call save()/re-run init()'s backfills itself - the caller
    // (settings.js, login.js) reloads the page after a successful import so
    // Vault.init() re-runs fresh against the newly-loaded state, same as
    // any other schema-migration path.
    // Oct 31 2026 (Craft): backup:false skips the device copy. Routine cloud
    // pulls used to make one each time, which pushed out the 3 real copies.
    importFullState(jsonString, { fromCloud = false, backup = true } = {}) {
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
            if (backup) this.createLocalBackup('Before import or cloud restore');
            delete parsed.saveKind;   // Oct 31 2026 (Craft): file label only, not part of the save
            parsed.schemaVersion = VAULT_SCHEMA_VERSION;
            localStorage.setItem(this.storageKey + ':dirty', fromCloud ? 'false' : 'true');
            localStorage.setItem(this.storageKey, JSON.stringify(parsed));
            this.state = parsed;
            this._shadow = undefined;   // save merge: new baseline on the next save
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
    // (SHA-256 via Auth.sha256Hex - src/core/login/auth.js, loaded on every page
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
    // PIN check v2 (Oct 2026): state.accountPinCheck = { v: 2, salt, iter,
    // hash } - PBKDF2-SHA256 with a random salt and PIN_CHECK_ITER rounds,
    // so a copied save can't be turned back into the PIN in a second (the old
    // plain SHA-256 accountPinHash could). An old hash still works: the
    // first correct unlock upgrades it and deletes the old field.
    hasAccountPin() {
        return !!(this.state && (this.state.accountPinCheck || this.state.accountPinHash));
    }

    async _pinDerive(pin, saltB64, iter) {
        const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
        return btoa(String.fromCharCode(...new Uint8Array(bits)));
    }

    async setAccountPin(pin) {
        if (!this.state) return null;
        const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
        const iter = PIN_CHECK_ITER;
        this.state.accountPinCheck = { v: 2, salt, iter, hash: await this._pinDerive(pin, salt, iter) };
        delete this.state.accountPinHash;
        this.save();
        return true;
    }

    async verifyAccountPin(pin) {
        if (!this.state) return false;
        const c = this.state.accountPinCheck;
        if (c && c.salt && c.hash) return (await this._pinDerive(pin, c.salt, c.iter || PIN_CHECK_ITER)) === c.hash;
        if (!this.state.accountPinHash) return false;
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(pin)));
        const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
        if (hex !== this.state.accountPinHash) return false;
        await this.setAccountPin(pin);          // upgrade the old hash
        return true;
    }

    // Forgot PIN: the PIN is also the key to the encrypted personal info
    // (details + Habitica login), so that is erased with it. A local backup
    // is made first. Then a new PIN can be created.
    resetAccountPin() {
        if (!this.state) return false;
        try { this.createLocalBackup('Before PIN reset'); } catch { /* best effort */ }
        delete this.state.accountPinCheck;
        delete this.state.accountPinHash;
        this.state.personalInfoEncrypted = null;
        this.save();
        return true;
    }

    // An early version of the Habitica import put every Habitica Habit into
    // Dailies (note "Imported from Habitica (habit).") and every To-Do into
    // a standing "Imported from Habitica" quest. This moves them where they
    // belong - Habits and To-Dos - with no network needed, keeping each
    // To-Do's done state. Imported items with no difficulty get one from
    // their XP (the import set XP from Habitica's difficulty). Runs once per
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
                    xp: Number(t.xp) || 0,
                    difficulty: t.difficulty || habiticaDifficultyFromXp(t.xp),
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
                    xp: Number(t.xp) || 0,
                    difficulty: t.difficulty || habiticaDifficultyFromXp(t.xp),
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
            if (fromHabitica(t) && !t.difficulty) t.difficulty = habiticaDifficultyFromXp(t.xp);
        }));

        this.state.habiticaSorted = true;
        this.save();
        console.log(`Vault: sorted Habitica imports - ${oldHabits.length} habits out of Dailies, ${todos} quest tasks into To-Dos.`);
        return { habits: oldHabits.length, todos };
    }

    // 7e. Habitica: the old one-way import's id list (state.habiticaImportedIds)
    // is no longer used - two-way sync keeps state.habiticaLinks instead
    // (src/core/services/habitica-sync/). Old saves still carry the list; it's harmless.


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
    // second royal or duplicate starter habits. If a royal already exists
    // (the egg was restarted), it takes the gender and name just chosen -
    // before 2026-10-11 it kept the old one, so a Queen hatch on a save
    // that once had a King still showed the King.
    completeOnboarding({ royal, name } = {}) {
        if (!this.state || !this.state.onboarding) return null;
        const kind = royal === 'king' ? 'king' : 'queen';
        const label = kind === 'king' ? 'King' : 'Queen';
        if (!this.state.hive) this.state.hive = { bees: [] };
        const bees = this.state.hive.bees || (this.state.hive.bees = []);
        const existing = bees.find(b => b.rarity === 'Royal');
        if (existing) {
            existing.royal = kind;
            existing.name = (String(name || '').trim().slice(0, 24)) || label;
        } else {
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
                label: h.label, xp: 20, difficulty: 'Easy', notes: h.notes, tags: [],
                positive: true, negative: false, resetCounter: 'daily', history: [],
                ...(i === 0 ? { quoteOfWeek: true } : {})
            });
        });
        Object.assign(this.state.onboarding, { stage: 'done', royal: kind, name: String(name || '').trim().slice(0, 24), completedAt: new Date().toISOString() });
        this.save();
        return bees.find(b => b.rarity === 'Royal');
    }

    // The hive's honey and decay, shared by the Hive page and Home's hive
    // strip (moved here from hive-mind.js so both read the same numbers).
    //   honey  = base + 4 per bee card + 3 per level (XP counts partly)
    //   decay  = missed dailies, overdue To-Dos and bad-habit clicks in the
    //            last 14 days; it can hollow at most half the honey.
    getHiveHoney() {
        // Hive size comes from level only (Oct 2026): 8 cells + 3 per level.
        // It never drops below one home cell per bee (+ the royal cell).
        const CAP = 320, BASE = 8, PER_LEVEL = 3, DAYS = 14;
        const dayISO = n => shiftISODate(todayISO(), -n);
        const user = this.getUser() || { level: 1, currentXP: 0, nextLevelXP: 1 };
        const bees = this.getHiveBees();
        const ids = [];
        const today = dayISO(0), windowStart = dayISO(DAYS);
        const dailies = this.getDailyTasks ? this.getDailyTasks() : [];
        for (let d = 1; d <= DAYS; d++) {
            const day = dayISO(d);
            dailies.forEach(task => {
                if (!isDailyDueOn(task, day)) return;
                if ((task.completedDates || []).includes(day) || (task.savedDates || []).includes(day)) return;
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
        const fromCards = 0;
        const fromLevel = Math.floor(((user.level || 1) - 1 + xpPart) * PER_LEVEL);
        const lit = Math.min(CAP, Math.max(BASE + fromLevel, bees.length + 2));
        const decay = Math.min(ids.length, Math.floor(lit * 0.5));
        return { lit, capacity: CAP, fromCards, fromLevel, lapseIds: ids, lapses: ids.length, decay, level: user.level || 1, bees: bees.length };
    }

    getRoyalBee() {
        return this.getHiveBees().find(b => b.rarity === 'Royal') || null;
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

// ---- Hive Life: Vault methods (see the HIVE LIFE notes above the class) ----
Object.assign(DatabaseManager.prototype, {
    // Living, non-royal bees.
    _lifeBees() {
        return this.getHiveBees().filter(b => b.rarity !== 'Royal' && b.life);
    },
    _workers(role) {
        return this._lifeBees().filter(b => b.class === role && beeCanWork(b));
    },
    _lifeEvent(type, text, extra = {}) {
        const c = this.state.hive;
        if (!Array.isArray(c.lifeEvents)) c.lifeEvents = [];
        c.lifeEvents.unshift({ id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), type, text, ...extra });
        c.lifeEvents = c.lifeEvents.slice(0, LIFE.eventsKept);
    },
    _addMaterial(id, n = 1) {
        if (!this.state.inventory) this.state.inventory = { materials: {}, items: {}, fragments: {} };
        if (!this.state.inventory.materials) this.state.inventory.materials = {};
        const m = this.state.inventory.materials;
        m[id] = Math.max(0, (m[id] || 0) + n);
        return m[id];
    },

    // Backfills sex + life onto every bee (fair start: age counts from today).
    _ensureBeeLife() {
        if (!this.state || !this.state.hive) return;
        const today = todayISO();
        let changed = false;
        // One recovery copy of the save from before Hive Life touched it.
        if (!this.state.hive.lifeTick && (this.state.hive.bees || []).some(b => b.rarity !== 'Royal' && !b.life)) {
            try { this.createLocalBackup('Before Hive Life'); } catch { /* best effort */ }
        }
        (this.state.hive.bees || []).forEach(b => { if (ensureBeeLife(b, today)) changed = true; });
        if (!Array.isArray(this.state.hive.fallen)) { this.state.hive.fallen = []; changed = true; }
        if (!this.state.hive.lifeTick) { this.state.hive.lifeTick = today; changed = true; }
        if (changed) this.save();
    },

    // One time: bees still called "Common Bee #12" get a real name.
    _nameDefaultBees() {
        if (!this.state || !this.state.hive) return;
        const bees = this.state.hive.bees || [];
        const todo = bees.filter(b => b.rarity !== 'Royal' && !b.customNamed && DEFAULT_BEE_NAME.test(String(b.name || '')));
        if (!todo.length) return;
        todo.forEach(b => { b.name = randomBeeName(bees.map(x => x.name)); });
        this.save();
    },
    // One time: "Comet The Relentless" -> name "Comet", title relentless.
    // A Named Beast with any other name keeps it and gets a random title.
    // Oct 2026: Dictionary words made from #CamelCase get their spaces
    // ("TimeManagement" -> "Time Management"), and tags, skill categories
    // and skill levels that used the old name follow. Runs once per term.
    _splitHashtagTerms() {
        const dict = this.state && this.state.dictionary;
        if (!dict || !dict.length) return;
        const renames = {};
        for (const t of dict) {
            if (!t || t.source !== 'hashtag' || !t.name) continue;
            const split = splitTagWords(t.name);
            if (split !== t.name) renames[t.name.toLowerCase()] = split;
        }
        if (!Object.keys(renames).length) return;
        const fix = (n) => (n && renames[String(n).toLowerCase()]) || n;
        const seen = new Set();
        this.state.dictionary = dict.filter(t => {
            if (!t) return false;
            t.name = fix(t.name);
            t.category = fix(t.category);
            const key = String(t.name).toLowerCase();
            if (seen.has(key)) return false;          // "Time Management" already existed: keep one
            seen.add(key);
            return true;
        });
        const fixTags = (item) => { if (item && Array.isArray(item.tags)) item.tags = [...new Set(item.tags.map(fix))]; if (item && Array.isArray(item.skillsOff)) item.skillsOff = item.skillsOff.map(fix); };
        (this.state.dailyTasks || []).forEach(fixTags);
        (this.state.habits || []).forEach(fixTags);
        (this.state.todos || []).forEach(fixTags);
        (this.state.quests || []).forEach(q => (q.tasks || []).forEach(fixTags));
        const lv = this.state.skillLevels || {};
        Object.keys(lv).forEach(k => { const n = fix(k); if (n !== k && !lv[n]) { lv[n] = lv[k]; delete lv[k]; } });
        this.save();
    },

    _splitNamedTitles() {
        const bees = this.getHiveBees().filter(b => b.rarity === 'Named' && !b.title);
        if (!bees.length) return;
        bees.forEach(b => {
            const m = /^(.+?) (The \w+)$/.exec(String(b.name || ''));
            const id = m && NAMED_TITLE_IDS.find(k => NAMED_TITLES[k].label === m[2]);
            if (id) { b.name = m[1]; b.title = id; } else b.title = rollNamedTitle();
            const locked = beeLockedJob(b);
            if (locked && b.class !== locked) { b.class = locked; b.jobSince = todayISO(); b.sex = 'f'; if (b.life) delete b.life.idleSince; }
        });
        this.save();
    },
    randomBeeName() {
        return randomBeeName(this.getHiveBees().map(b => b.name));
    },

    // Missed dailies / late to-dos hit every bee: health and happiness drop,
    // fatigue rises, and some bees get sick (3 days) or injured (2 days).
    // Sick and injured bees can't work; a Nurse can cure sickness early.
    _hiveMissed(misses, today = todayISO()) {
        const out = { misses, sick: [], injured: [], hp: 0 };
        if (!misses || !this.state.hive) return out;
        out.hp = Math.min(30, 5 * misses);
        this._lifeBees().forEach(b => {
            const L = b.life;
            if (!L || L.hatchOn || L.faintedAt) return;
            L.health = clampVital(L.health - out.hp);
            L.happiness = clampVital(L.happiness - 4 * misses);
            L.fatigue = clampVital((L.fatigue || 0) + 5 * misses);
            if (L.health <= 0) { L.faintedAt = today; this._lifeEvent('faint', `😵 ${b.name} fainted.`, { beeId: b.id }); return; }
            if (!beeOutOfAction(b, today) && lifeRand() < Math.min(0.35, 0.06 * misses)) { L.sickUntil = shiftISODate(today, LIFE.sickDays); out.sick.push(b.name); }
            else if (b.class && !beeOutOfAction(b, today) && lifeRand() < Math.min(0.25, 0.04 * misses)) { L.health = clampVital(L.health - 20); out.injured.push(b.name); }   // hurt (Oct 28 2026: no more "Injured")
        });
        const extra = [out.sick.length && `${out.sick.join(', ')} got sick`, out.injured.length && `${out.injured.join(', ')} got hurt`].filter(Boolean).join('; ');
        this._lifeEvent('missed', `🌧️ ${misses} missed task${misses === 1 ? '' : 's'} hit the hive: every bee lost ${out.hp} health.${extra ? ' ' + extra + '.' : ''}`);
        return out;
    },

    getHiveStreak() {
        return computeHiveStreak(this.state ? this.state.dailyTasks : [], todayISO(), this._workers('guardian').length);
    },

    // Runs each day missed since the last visit (max LIFE.maxCatchUp).
    hiveDailyTick(today = todayISO()) {
        if (!this.state || !this.state.hive) return [];
        const c = this.state.hive;
        if (!c.lifeTick) { c.lifeTick = today; this.save(); return []; }
        let days = Math.min(LIFE.maxCatchUp, Math.max(0, daysBetween(c.lifeTick, today) || 0));
        const before = (c.lifeEvents || []).length ? c.lifeEvents[0].id : null;
        for (let i = days - 1; i >= 0; i--) this._lifeDay(shiftISODate(today, -i));
        if (days > 0) { c.lifeTick = today; this.save(); }
        const fresh = [];
        for (const ev of (c.lifeEvents || [])) { if (ev.id === before) break; fresh.push(ev); }
        return fresh;
    },

    // ---- Hive levels + auto-manage (Nov 1 2026, Craft; approved demos) ----
    // The hive grows with your level: HIVE_JOB_LADDER opens one job slot
    // every 1-2 levels. Your first bee's talent is the job that opens at
    // Lv 1, so every hive starts differently. One bee per job slot, and a
    // bee can only take the job that matches its talent (Named bees: the
    // job their title sets). Auto-manage unlocks when every open job is
    // filled and one worker is Rare or better (the Leader); then every hour
    // an empty open job gets a free bee with that talent. It pauses while a
    // working bee is tired and no other bee with that talent is free, or
    // while no Leader is working, and comes back by itself.
    hiveJobLadder() {
        const c = this.state && this.state.hive;
        if (!c) return HIVE_JOB_LADDER.slice();
        if (!c.firstJob) {
            const first = this._lifeBees().filter(b => b.rarity !== 'Named' && b.talent).sort((a, b) => String(a.obtainedAt || '').localeCompare(String(b.obtainedAt || '')))[0];
            if (first) c.firstJob = first.talent;
        }
        const f = c.firstJob;
        if (!f || f === HIVE_JOB_LADDER[0].job) return HIVE_JOB_LADDER.slice();
        const lv1 = HIVE_JOB_LADDER[0], other = HIVE_JOB_LADDER.find(x => x.job === f);
        if (!other) return HIVE_JOB_LADDER.slice();
        return HIVE_JOB_LADDER.map(x => x.job === f ? { lv: lv1.lv, job: f } : x === lv1 ? { lv: other.lv, job: lv1.job } : x).sort((a, b) => a.lv - b.lv);
    },
    hiveOpenJobs() {
        const lv = (this.getUser() || {}).level || 1;
        return this.hiveJobLadder().filter(x => x.lv <= lv).map(x => x.job);
    },
    // Every bee in a job (alive, not an egg).
    jobHolders(job) {
        return this._lifeBees().filter(b => b.class === job && !beeIsBrood(b) && !b.life.faintedAt);
    },
    // The first bee in a job, or null.
    jobHolder(job) {
        return this.jobHolders(job)[0] || null;
    },
    // Nov 3 2026 (Craft; approved demo): how many bees a job takes. Grows
    // with your adult bees: about 80% work, split by HIVE_JOB_SHARES over the
    // open jobs, at least 1 each. Drones: every adult male.
    jobSlots(job) {
        const open = this.hiveOpenJobs();
        if (!open.includes(job)) return 0;
        const adults = this._lifeBees().filter(b => !beeIsBrood(b));
        if (job === 'drone') return Math.max(1, adults.filter(b => b.sex === 'm').length);
        const females = adults.filter(b => b.sex !== 'm').length;
        const sum = open.reduce((n, j) => n + (HIVE_JOB_SHARES[j] || 0), 0) || 1;
        return Math.max(1, Math.round((HIVE_JOB_SHARES[job] || 0) / sum * females * HIVE_WORK_SHARE));
    },
    // Nov 3 2026 (Craft; approved demo): for the merge picker. 'work' = in a
    // job; 'spare' = resting while its job is full or not open; 'idle' = a
    // slot in its job is free; null = can't be merged (Queen, limited, egg).
    beeMergeStatus(bee) {
        if (!bee || bee.rarity === 'Royal' || beeIsLimited(bee) || beeIsBrood(bee)) return null;
        if (bee.class) return 'work';
        const job = beeLockedJob(bee) || bee.talent;
        if (!job || !this.hiveOpenJobs().includes(job)) return 'spare';
        return this.jobHolders(job).length >= this.jobSlots(job) ? 'spare' : 'idle';
    },
    beeFitsJob(bee, job) {
        const locked = beeLockedJob(bee);
        return locked ? locked === job : bee.talent === job;
    },
    // Why a bee can't take a job right now, or '' if it can.
    jobBlock(bee, job) {
        if (!job || job === 'recuperate' || !HIVE_JOB_RULES) return '';
        if (!this.hiveOpenJobs().includes(job)) return 'That job isn\'t open yet.';
        if (!this.beeFitsJob(bee, job)) return 'Only a bee with that talent can do this job.';
        const hs = this.jobHolders(job);
        if (!hs.some(h => h.id === bee.id) && hs.length >= this.jobSlots(job)) return 'This job is full.';
        return '';
    },
    // Every worker in this comb is Rare or better: they tire and get hungry 50% slower.
    combIsRare(id) {
        const w = this._combWorkers(id);
        return w.length > 0 && w.every(b => ['Rare', 'Epic', 'Legendary', 'Named'].includes(b.rarity));
    },
    _rareCombOf(bee) {
        const id = Object.keys(HIVE_COMB_JOBS).find(k => HIVE_COMB_JOBS[k].jobs.includes(bee.class));
        return !!id && this.combIsRare(id);
    },
    // Once (Nov 1 2026): bees working off-talent, in a job that isn't open,
    // or doubled up on a job go to rest.
    _talentJobsMigrate() {
        const c = this.state && this.state.hive;
        if (!c || c.talentJobsV1 || !HIVE_JOB_RULES) return;
        c.talentJobsV1 = true;
        const open = this.hiveOpenJobs();
        let moved = 0;
        const keep = {};
        this._lifeBees().filter(b => b.class && !beeIsBrood(b)).sort((a, b) => beeJobScore(b, b.class) - beeJobScore(a, a.class)).forEach(b => {
            if (open.includes(b.class) && this.beeFitsJob(b, b.class) && (keep[b.class] || 0) < this.jobSlots(b.class)) { keep[b.class] = (keep[b.class] || 0) + 1; return; }   // Nov 3 2026 (Craft): up to the job's slots
            b.class = null; b.jobSince = todayISO(); b.life.idleSince = todayISO(); moved++;
        });
        if (moved) this._lifeEvent('auto', `🐝 The hive reorganized. ${moved} bee${moved === 1 ? '' : 's'} went to rest.`);
        this.save();
    },
    _combWorkers(id) {
        const jobs = HIVE_COMB_JOBS[id].jobs;
        return this._lifeBees().filter(b => jobs.includes(b.class) && !beeIsBrood(b) && !b.life.faintedAt);
    },
    hiveLeader() {
        const RANK = { Rare: 1, Epic: 2, Legendary: 3, Named: 4 };
        const open = this.hiveOpenJobs();
        return this._lifeBees().filter(b => open.includes(b.class) && RANK[b.rarity] && !beeIsBrood(b) && beeCanWork(b))
            .sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || beeJobScore(b, b.class) - beeJobScore(a, a.class))[0] || null;
    },
    _autoReady(b) {
        return beeCanWork(b) && b.life.stamina >= 30 && b.life.health >= 50 && !b.life.recuperate && !b.life.nursery;
    },
    // Nov 3 2026 (Craft): "filled" = open jobs with at least one bee.
    hiveAutoStatus() {
        if (!this.state || !this.state.hive) return null;
        const open = this.hiveOpenJobs();
        const filled = open.filter(j => this.jobHolder(j)).length;
        const leader = this.hiveLeader();
        // A tired worker with nobody free to take its place pauses it.
        const free = this._lifeBees().filter(b => !b.class && !beeIsBrood(b) && this._autoReady(b));
        const stuck = open.flatMap(j => this.jobHolders(j)).find(b => b.life.stamina < 30 && !free.some(f => this.beeFitsJob(f, b.class))) || null;
        const on = !!(this.state.hive.autoManage && this.state.hive.autoManage.on);
        return { on, running: on && !!leader && !stuck, leader, stuck, open: open.length, filled };
    },
    // Called after a job change and every hour. Returns true when it just unlocked.
    _autoUnlockCheck() {
        const st = this.hiveAutoStatus();
        if (!st || st.on || st.filled < st.open || !st.leader) return false;
        this.state.hive.autoManage = { on: true, since: new Date().toISOString() };
        this._lifeEvent('auto', `🤖 Auto-manage unlocked. ${st.leader.name} leads the hive.`, { beeId: st.leader.id });
        return true;
    },
    // One auto-manage pass: an empty open job gets the best free bee with that talent.
    // ---- Auto-swap (Nov 1 2026, Craft; approved demo) ----
    // Comes with auto-manage, or the Queen's Whistle from the Honey Mart.
    // Each hour, a working bee whose stamina is below your % hands its job
    // to a rested bee with the same talent (automatic: the best rested one;
    // "I choose": only bees you picked). The tired bee rests.
    autoSwapUnlocked() {
        return !!(this.state && this.state.hive && ((this.state.hive.autoManage && this.state.hive.autoManage.on) || this.ownsUnlock('queens-whistle')));
    },
    autoSwapPrefs() {
        const c = this.state && this.state.hive;
        const a = (c && c.autoSwap) || {};
        return { on: a.on !== false, pct: Math.max(10, Math.min(60, Number(a.pct) || 30)), mode: a.mode === 'pick' ? 'pick' : 'auto', pool: Array.isArray(a.pool) ? a.pool : [] };
    },
    setAutoSwap(patch) {
        if (!this.state || !this.state.hive) return null;
        this.state.hive.autoSwap = { ...this.autoSwapPrefs(), ...patch };
        this.save();
        return this.autoSwapPrefs();
    },
    _autoSwapHour() {
        if (!this.autoSwapUnlocked()) return [];
        const P = this.autoSwapPrefs();
        if (!P.on) return [];
        const notes = [];
        this.hiveOpenJobs().forEach(j => this.jobHolders(j).forEach(h => {
            if (h.life.stamina >= P.pct || beeLockedJob(h)) return;
            const pick = this._lifeBees().filter(b => !b.class && !beeIsBrood(b) && this._autoReady(b) && b.life.stamina >= P.pct + 20 && this.beeFitsJob(b, j) && (P.mode === 'auto' || P.pool.includes(b.id)))
                .sort((a, b) => b.life.stamina - a.life.stamina || beeJobScore(b, j) - beeJobScore(a, j))[0];
            if (!pick) return;
            h.class = null; h.jobSince = todayISO(); delete h.life.idleSince;   // resting, not upset
            pick.class = j; pick.jobSince = todayISO(); delete pick.life.idleSince;
            this.state.hive.lastSwap = { in: pick.id, out: h.id, job: j, at: new Date().toISOString() };
            const text = `🔄 ${pick.name} took over the ${BEE_CLASSES[j].label} job. ${h.name} is resting.`;
            this._lifeEvent('auto', text, { beeId: pick.id });
            notes.push(text);
        }));
        return notes;
    },
    _autoManageHour() {
        const st = this.hiveAutoStatus();
        if (!st || !st.running) return [];
        const notes = [];
        this.hiveOpenJobs().forEach(j => {
            // Nov 3 2026 (Craft): fill every open slot, not just the first.
            let gap = this.jobSlots(j) - this.jobHolders(j).length;
            const picks = this._lifeBees().filter(b => !b.class && !beeIsBrood(b) && this._autoReady(b) && this.beeFitsJob(b, j))
                .sort((a, b) => beeJobScore(b, j) - beeJobScore(a, j));
            for (const pick of picks) {
                if (gap-- <= 0) break;
                pick.jobSince = todayISO(); pick.class = j; delete pick.life.idleSince;
                const text = `🐝 ${pick.name} took the ${BEE_CLASSES[j].label} job.`;
                this._lifeEvent('auto', text, { beeId: pick.id });
                notes.push(text);
            }
        });
        return notes;
    },

    // ---- Hour by hour (Oct 28 2026) ----
    // Catches up every whole hour since the last run (max 14 days).
    hiveHourlyTick(now = Date.now()) {
        if (!this.state || !this.state.hive) return 0;
        const c = this.state.hive;
        const HOUR = 3600000;
        this._talentJobsMigrate();   // Nov 1 2026 (Craft): once
        if (!c.vitalsAt) { c.vitalsAt = now; return 0; }
        const hours = Math.min(14 * 24, Math.floor((now - c.vitalsAt) / HOUR));
        if (hours <= 0) return 0;
        const bees = this._lifeBees();
        // Old saves: "Injured" is now just lower health.
        bees.forEach(b => { if (b.life && b.life.injuredUntil) { b.life.health = Math.min(b.life.health, 55); delete b.life.injuredUntil; } });
        for (let k = 1; k <= hours; k++) this._lifeHour(new Date(c.vitalsAt + k * HOUR));
        c.vitalsAt += hours * HOUR;
        // Nov 1 2026 (Craft): auto-manage, once per catch-up.
        this._autoUnlockCheck();
        this._autoManageHour();
        this._autoSwapHour();   // Nov 1 2026 (Craft)
        this.saveQuiet();   // Oct 31 2026 (Craft): the clock isn't an edit
        return hours;
    },

    _lifeHour(at) {
        const day = isoLocalDate(at);
        const night = isNightHour(at.getHours());
        const bees = this._lifeBees();
        const nurses = this._workers('nurse').length;
        const water = this._workers('watercarrier').length;
        bees.forEach(b => {
            const L = b.life;
            if (!L || L.faintedAt || L.hatchOn) return;
            if (L.fatigue == null) L.fatigue = 0;
            const relentless = beeTitlePower(b, 'relentless');
            const working = !night && !!b.class && !L.recuperate && beeCanWork(b, day);
            const hungerX = L.birthTrait === 'deep-stomach' ? 0.75 : 1;
            if (working) {
                const r = JOB_RATES[b.class] || [-4, -3, -1, 2.5];
                const rareX = HIVE_JOB_RULES && this._rareCombOf(b) ? 0.5 : 1;   // Nov 1 2026 (Craft): all Rare+ comb
                L.stamina = clampVital(L.stamina + r[0] * (relentless ? 0.75 : 1) * rareX, true);
                L.fullness = clampVital(L.fullness + r[1] * hungerX * rareX, true);
                L.happiness = clampVital(L.happiness + r[2], true);
                L.fatigue = clampVital(L.fatigue + r[3] * beeFatigueFactor(b) * (water ? 0.75 : 1) * (relentless ? 0.6 : 1), true);
                if (L.fullness >= 50) L.health = clampVital(L.health + 0.2, true);
                if (L.fatigue >= 100) {
                    L.restUntil = shiftISODate(day, LIFE.restDays);
                    this._lifeEvent('rest', `😴 ${b.name} is exhausted and must rest for ${LIFE.restDays} days.`, { beeId: b.id });
                }
            } else {
                const r = L.nursery ? REST_RATES.nursery : night ? REST_RATES.night : REST_RATES.day;
                L.stamina = clampVital(L.stamina + r[0], true);
                L.fullness = clampVital(L.fullness + r[1], true);
                L.happiness = clampVital(L.happiness + r[2], true);
                L.fatigue = clampVital(L.fatigue + r[3], true);
                const heal = r[4] + (L.nursery ? Math.min(3, nurses) : 0);
                if (L.nursery || L.fullness >= 50) L.health = clampVital(L.health + heal, true);
                // Nursery: sickness heals 2x faster (12 bed hours = 1 day off).
                if (L.nursery && L.sickUntil) {
                    L.sickProgress = (L.sickProgress || 0) + 1;
                    if (L.sickProgress >= 12) { L.sickProgress = 0; L.sickUntil = shiftISODate(L.sickUntil, -1); if (L.sickUntil <= day) delete L.sickUntil; }
                }
            }
            if (L.sickUntil) L.health = clampVital(L.health - 0.25, true);
            if (L.fullness <= 0) L.health = clampVital(L.health - 1, true);
            this._useHeldItems(b);
            if (L.stamina <= 0) L.health = clampVital(L.health - 0.2, true);
            // Healed: leave the Nursery and go back to the old job.
            if (L.nursery && !L.sickUntil && L.health >= 90) {
                delete L.nursery; delete L.sickProgress;
                this._lifeEvent('heal', `💗 ${b.name} is healed and left the Nursery.`, { beeId: b.id });
            }
            if (L.health <= 0) { L.faintedAt = day; delete L.nursery; this._lifeEvent('faint', `😵 ${b.name} fainted.`, { beeId: b.id }); }
        });
    },

    // Ready = an egg whose days are up (it waits for a tap).
    isEggReady(bee, today = todayISO()) {
        if (!beeIsBrood(bee)) return false;
        const nurses = this._workers('nurse').reduce((n, b) => n + (beeTitlePower(b, 'healer') ? 2 : 1) * beeTalentBoost(b), 0);
        return !!bee.life.readyAt || broodDaysLeft(bee, today, nurses) <= 0;
    },
    readyEggs() { return this._lifeBees().filter(b => this.isEggReady(b)); },
    // The player tapped it open. Returns the new bee, or null.
    hatchEgg(beeId) {
        const b = this.getHiveBees().find(x => x.id === beeId);
        if (!b || !this.isEggReady(b)) return null;
        this._hatchBee(b, todayISO());
        this.save();
        return b;
    },
    _hatchBee(b, day) {
        const inc = this.state.incubator;
        delete b.life.hatchOn;
        delete b.life.readyAt;
        b.life.bornAt = day;
        // Hatched in the Egg Incubator: its extras, then the slot is free.
        const T = inc && Array.isArray(inc.slots) && inc.slots.includes(b.id) ? INCUBATORS[inc.tier] : null;
        if (T) {
            if (T.full) b.life.fullness = 100;
            if (T.happy) b.life.happiness = 100;
            if (T.trait && !b.life.birthTrait && lifeRand() < T.trait) { const k = Object.keys(BIRTH_TRAITS); b.life.birthTrait = k[Math.floor(lifeRand() * k.length)]; }
            inc.slots = inc.slots.filter(id => id !== b.id);
            if (inc.applied) delete inc.applied[b.id];
        }
        if (!b.class) b.life.idleSince = day;
        const job = b.class && BEE_CLASSES[b.class] ? BEE_CLASSES[b.class].label : null;
        this._lifeEvent('hatch', job ? `🐣 ${b.name} hatched and started work as a ${job}.` : `🐣 ${b.name} hatched. Give ${b.sex === 'm' ? 'him' : 'her'} a job.`, { beeId: b.id });
    },

    nurseryBeds() {
        const used = this._lifeBees().filter(b => b.life.nursery).length;
        const total = NURSERY_BEDS + this._workers('nurse').length;
        return { used, total, free: Math.max(0, total - used) };
    },
    // Sick or hurt bees can take a Nursery bed (instead of needing a Nurse each).
    sendToNursery(beeId) {
        const b = this.getHiveBees().find(x => x.id === beeId);
        if (!b || !b.life || b.life.hatchOn || b.life.faintedAt) return { ok: false, error: 'This bee can\'t go to the Nursery.' };
        if (b.life.nursery) return { ok: true };
        if (!b.life.sickUntil && beeHurtLevel(b) === 0) return { ok: false, error: 'Only sick or hurt bees need a bed.' };
        if (!this.nurseryBeds().free) return { ok: false, error: 'No free bed. Each working Nurse adds one.' };
        b.life.nursery = true;
        this.save();
        return { ok: true };
    },
    leaveNursery(beeId) {
        const b = this.getHiveBees().find(x => x.id === beeId);
        if (!b || !b.life || !b.life.nursery) return false;
        delete b.life.nursery; delete b.life.sickProgress;
        this.save();
        return true;
    },

    _lifeDay(day) {
        const c = this.state.hive;
        const streak = this.getHiveStreak();
        const bees = this._lifeBees();
        if (!bees.length) return;
        const nurses = this._workers('nurse').reduce((n, b) => n + (beeTitlePower(b, 'healer') ? 2 : 1) * beeTalentBoost(b), 0);
        const water = this._workers('watercarrier').length;
        const avgFull = bees.reduce((n, b) => n + b.life.fullness, 0) / bees.length;
        const stoutBonus = avgFull >= 80 ? bees.filter(b => b.life.birthTrait === 'stout-heart').length * 2 : 0;

        // Eggs (Oct 28 2026): a ready egg waits for you to tap it (EggHatch).
        // Not tapped in 2 days? It hatches by itself.
        bees.filter(beeIsBrood).forEach(b => {
            if (broodDaysLeft(b, day, nurses) > 0) return;
            if (!b.life.readyAt) { b.life.readyAt = day; this._lifeEvent('egg-ready', `🥚 ${b.name} is ready to hatch! Tap it to help it out.`, { beeId: b.id }); return; }
            if ((daysBetween(b.life.readyAt, day) || 0) >= 2) this._hatchBee(b, day);
        });

        // Vitals now change hour by hour (hiveHourlyTick). Once a day: sickness
        // and forced rest end, a Nurse may cure sickness, and the streak sets the mood.
        bees.forEach(b => {
            const L = b.life;
            if (L.faintedAt || L.hatchOn) return;
            if (L.sickUntil && nurses > 0 && lifeRand() < Math.min(0.8, 0.4 * nurses)) { delete L.sickUntil; this._lifeEvent('heal', `💗 A Nurse nursed ${b.name} back to health.`, { beeId: b.id }); }
            if (L.sickUntil && L.sickUntil <= day) delete L.sickUntil;
            if (L.restUntil && L.restUntil <= day) delete L.restUntil;
            L.happiness = clampVital(L.happiness + (streak > 0 ? 4 : streak < 0 ? -6 : 0) + stoutBonus);
        });

        // Faint too long, or too old -> the bee dies (only while death is on).
        if (LIFE.deathEnabled) bees.slice().forEach(b => {
            const L = b.life;
            if (beeIsLimited(b)) { /* limited bees never die (Nov 1 2026) */ }
            else if (L.faintedAt && (daysBetween(L.faintedAt, day) || 0) >= LIFE.faintDays) this._beeDies(b, 'neglect', day);
            else if (beeAgeDays(b, day) >= beeLifespan(b)) this._beeDies(b, 'old age', day);
        });

        // Honey Makers: 40% each, 3 Pollen -> 1 Honey Drop.
        this._workers('honeymaker').forEach((hm) => {
            const m = (this.state.inventory && this.state.inventory.materials) || {};
            if (lifeRand() < (beeTitlePower(hm, 'keeper') ? 0.5 : 0.4) * beeTalentBoost(hm) && (m.pollen || 0) >= 3) { this._addMaterial('pollen', -3); this._addMaterial('honey-drop', 1); this._lifeEvent('honey', '🍯 Honey Makers turned 3 Pollen into a Honey Drop.'); }
        });
        // Drones: 30% each day, the next pull gets a better shot at Rare.
        if (this._workers('drone').length && !c.droneBoost && lifeRand() < 0.3) { c.droneBoost = true; this._lifeEvent('drone', '♂️ A Drone mated with your Queen. Your next pull has a better shot at Rare.'); }

        if (lifeRand() < raidChance(streak)) this._raid(day);
    },

    _beeDies(bee, cause, day = todayISO()) {
        const c = this.state.hive;
        c.bees = c.bees.filter(b => b.id !== bee.id);
        const undertakers = this._workers('undertaker').length;
        if (undertakers) this._addMaterial('pollen', Math.min(2, undertakers));
        c.fallen.unshift({ id: bee.id, name: bee.name, rarity: bee.rarity, element: bee.element, sex: bee.sex, role: bee.class, cause, diedAt: day, bornAt: bee.life && bee.life.bornAt, dexNumber: bee.dexNumber });
        this._lifeEvent('death', cause === 'old age' ? `🕯️ ${bee.name} died of old age.` : `🕯️ ${bee.name} died after being fainted too long.`, { beeId: bee.id });
    },

    // Raid defense vs a rolled attack. Lost raid: 1-2 bees take damage.
    _raid(day) {
        const enemy = RAID_ENEMIES[Math.floor(lifeRand() * RAID_ENEMIES.length)];
        const level = (this.getUser() || {}).level || 1;
        const def = 15
            + this._workers('guardian').reduce((n, b) => n + Math.round(((b.stats.defense || 0) * beeGear(b, 'defense') + (b.life.birthTrait === 'iron-shell' ? 10 : 0)) * (beeTitlePower(b, 'guardian') ? 1.15 : 1) * beeTalentBoost(b) * beeGear(b, 'combat')), 0)
            + this._workers('barrier').reduce((n, b) => n + Math.round((b.stats.hp || 0) * 0.4 * (beeTitlePower(b, 'unyielding') ? 1.15 : 1) * beeTalentBoost(b) * beeGear(b, 'combat') * beeGear(b, 'defense')), 0);
        const atk = Math.round((25 + level * 4 + lifeRand() * 40) * enemy.power);
        if (def >= atk) {
            this._workers('guardian').forEach(b => { b.life.stamina = clampVital(b.life.stamina - 15); });
            this._addMaterial('pollen', 1);
            this._noteModels(['hive:raider']);
            this._lifeEvent('raid-won', `${enemy.icon} ${enemy.label} repelled! Defense ${def} vs ${atk}. +1 🌼 Pollen.`);
            return;
        }
        const pool = this._lifeBees().filter(b => !b.life.faintedAt && !b.life.hatchOn && !beeTitlePower(b, 'bold'));
        const guards = pool.filter(b => b.class === 'guardian' || b.class === 'barrier');
        const hurt = [];
        for (let i = 0; i < Math.min(2, pool.length); i++) {
            const from = guards.length ? guards : pool;
            const b = from.splice(Math.floor(lifeRand() * from.length), 1)[0];
            if (!b) break;
            const p = pool.indexOf(b); if (p >= 0) pool.splice(p, 1);
            b.life.health = clampVital(b.life.health - 40);
            if (b.life.health <= 0) b.life.faintedAt = day;
            hurt.push(b);
        }
        const sad = this._workers('cleaner').length ? 4 : 10;
        this._lifeBees().forEach(b => { b.life.happiness = clampVital(b.life.happiness - sad); });
        this._noteModels(['hive:raider']);
        this._lifeEvent('raid-lost', `${enemy.icon} ${enemy.label} broke in (defense ${def} vs ${atk}). ${hurt.map(b => `${b.name}${b.life.faintedAt ? ' fainted' : ' was hurt'}`).join(', ') || 'Everyone is shaken'}.`);
    },

    // Finishing a task or daily feeds the hive.
    _feedHive() {
        this._lifeBees().forEach(b => {
            if (b.life.faintedAt) return;
            b.life.fullness = clampVital(b.life.fullness + LIFE.feedPerTask);
            b.life.happiness = clampVital(b.life.happiness + 1);
        });
    },

    // Once a day: your 3 strongest awake bees raid a nest.
    counterRaid() {
        if (!this.state || !this.state.hive) return { ok: false, error: 'No hive yet.' };
        const c = this.state.hive;
        const today = todayISO();
        if (c.lastCounterRaid === today) return { ok: false, error: 'Your bees already raided today. Try again tomorrow.' };
        const power = b => (b.stats.offense || 0) + (b.stats.speed || 0) + (b.stats.power || 0);
        const team = this._lifeBees().filter(b => !b.life.faintedAt && !b.life.hatchOn && b.life.stamina >= 30).sort((a, b) => power(b) - power(a)).slice(0, 3);
        if (!team.length) return { ok: false, error: 'No bee has the stamina to raid. Let them rest and eat.' };
        const level = (this.getUser() || {}).level || 1;
        const ours = Math.round(team.reduce((n, b) => n + power(b) * (beeTitlePower(b, 'champ') ? 1.15 : 1), 0));
        const theirs = Math.round(40 + level * 6 + lifeRand() * 60);
        const won = ours >= theirs;
        c.lastCounterRaid = today;
        team.forEach(b => {
            b.life.stamina = clampVital(b.life.stamina - (won ? 30 : 40));
            if (!won) { b.life.health = clampVital(b.life.health - 15); if (b.life.health <= 0) b.life.faintedAt = today; }
            else b.life.happiness = clampVital(b.life.happiness + 5);
        });
        if (won) this._addMaterial('royal-nectar', 2);
        const text = won ? `⚔️ Counter-raid won (${ours} vs ${theirs})! +2 ✨ Royal Nectar.` : `⚔️ Counter-raid failed (${ours} vs ${theirs}). The team came home hurt and tired.`;
        this._lifeEvent(won ? 'counter-won' : 'counter-lost', text);
        this.save();
        return { ok: true, won, ours, theirs, team: team.map(b => b.name), text };
    },

    reviveBee(beeId) {
        const bee = this.getHiveBees().find(b => b.id === beeId);
        if (!bee || !bee.life || !bee.life.faintedAt) return { ok: false, error: 'That bee is not fainted.' };
        const have = (this.state.inventory && this.state.inventory.materials && this.state.inventory.materials['honey-drop']) || 0;
        if (have < LIFE.reviveCost) return { ok: false, error: `Reviving costs ${LIFE.reviveCost} Honey Drops. You have ${have}.` };
        this._addMaterial('honey-drop', -LIFE.reviveCost);
        Object.assign(bee.life, { faintedAt: null, health: 40, stamina: 20, fullness: Math.max(bee.life.fullness, 40) });
        this._lifeEvent('revive', `💛 ${bee.name} was revived.`, { beeId });
        this.save();
        return { ok: true, bee };
    },

    craftRoyalJelly() {
        const have = (this.state.inventory && this.state.inventory.materials && this.state.inventory.materials['honey-drop']) || 0;
        if (have < LIFE.jellyCost) return { ok: false, error: `Royal Jelly takes ${LIFE.jellyCost} Honey Drops. You have ${have}.` };
        this._addMaterial('honey-drop', -LIFE.jellyCost);
        this._addMaterial('royal-jelly', 1);
        this.save();
        return { ok: true };
    },

    giveRoyalJelly(beeId) {
        const bee = this.getHiveBees().find(b => b.id === beeId);
        if (!bee || !bee.life) return { ok: false, error: 'Bee not found.' };
        if (bee.life.royalJelly) return { ok: false, error: `${bee.name} already had Royal Jelly.` };
        const have = (this.state.inventory && this.state.inventory.materials && this.state.inventory.materials['royal-jelly']) || 0;
        if (have < 1) return { ok: false, error: 'You have no Royal Jelly. Make it from 5 Honey Drops.' };
        this._addMaterial('royal-jelly', -1);
        bee.life.royalJelly = true;
        this.save();
        return { ok: true, bee };
    },

    getFallenBees() { return (this.state && this.state.hive && this.state.hive.fallen) || []; },
    getLifeEvents() { return (this.state && this.state.hive && this.state.hive.lifeEvents) || []; }
});


// ---- Queen stats + Start My Day: Vault methods (see QUEEN above) ----
Object.assign(DatabaseManager.prototype, {
    _ensureQueen() {
        if (!this.state) return null;
        if (!this.state.queen || typeof this.state.queen !== 'object') {
            // since = yesterday, so tasks credited in the first Start My Day earn coins too.
            this.state.queen = { since: shiftISODate(todayISO(), -1), hp: QUEEN.maxHp, spent: 0, lost: 0, xpLost: 0, healed: [], reviewedOn: null, guardLog: [] };
            this.save();
        }
        const q = this.state.queen;
        if (!Array.isArray(q.healed)) q.healed = [];
        if (!Array.isArray(q.guardLog)) q.guardLog = [];
        return q;
    },
    getQueenStats() {
        const q = this._ensureQueen();
        if (!q) return null;
        const earned = computeQueenCoins(this.state, q.since);
        // Nov 1 2026 (Craft): + q.bonus, coins given by the Daily bonus.
        return { hp: Math.max(0, Math.round(q.hp)), maxHp: QUEEN.maxHp, coins: Math.max(0, earned + (q.bonus || 0) - (q.spent || 0) - (q.lost || 0)), earned, fainted: q.faintedOn === todayISO() };
    },
    getCoins() { const s = this.getQueenStats(); return s ? s.coins : 0; },

    // ---- Daily bonus (Nov 1 2026, Craft, approved demo option A "7-day comb") ----
    // Open the app each day to move along a 7-day week. Miss a day and it
    // starts again at day 1. Day 7 is the big one (a Gacha ticket).
    // state.dailyBonus = { last: 'YYYY-MM-DD', step: 0-6 (the day last claimed) }.
    getDailyBonus(today = todayISO()) {
        if (!this.state) return null;
        const b = this.state.dailyBonus || {};
        const claimed = b.last === today;
        const next = claimed ? b.step : (b.last === shiftISODate(today, -1) && Number.isInteger(b.step) ? (b.step + 1) % 7 : 0);
        return { claimed, day: next, week: DAILY_BONUS.map(r => ({ ...r })) };
    },
    claimDailyBonus(today = todayISO()) {
        const info = this.getDailyBonus(today);
        if (!info || info.claimed) return null;
        const r = DAILY_BONUS[info.day];
        const give = (x) => {
            if (x.kind === 'coins') { const q = this._ensureQueen(); if (q) q.bonus = (q.bonus || 0) + x.qty; }
            else if (x.kind === 'ticket') { this.state.hive.tickets = (this.state.hive.tickets || 0) + x.qty; }
            else { for (let i = 0; i < x.qty; i++) this._addMaterial(x.kind, 1); }
        };
        give(r);
        const perk = this.titlePerk(today);   // Nov 1 2026 (Craft)
        if (perk) give(perk);
        this.state.dailyBonus = { last: today, step: info.day };
        this.save();
        return { day: info.day, ...r, perk };
    },

    // ---- Egg Incubator (Oct 28 2026) ----
    _incubator() {
        if (!this.state) return null;
        const i = this.state.incubator;
        if (!i || typeof i !== 'object') return null;
        if (!Array.isArray(i.slots)) i.slots = [];
        if (!Array.isArray(i.owned)) i.owned = i.tier ? [i.tier] : [];
        if (!i.applied || typeof i.applied !== 'object') i.applied = {};
        return i;
    },
    // Days off earned today: steps (Android app) + finished dailies (everywhere).
    incubatorEarnedToday(today = todayISO()) {
        const i = this._incubator();
        const T = i && INCUBATORS[i.tier];
        if (!T) return { off: 0, steps: 0, dailies: 0, cap: 0, goal: 0 };
        const steps = (this.state.steps && Number(this.state.steps[today])) || 0;
        const dailies = (this.state.dailyTasks || []).filter(t => (t.completedDates || []).includes(today)).length;
        const raw = Math.floor(steps / T.goal) + Math.floor(dailies / INCUBATOR_DAILIES);
        return { off: Math.min(T.cap, raw), steps, dailies, cap: T.cap, goal: T.goal,
            toNext: raw >= T.cap ? 0 : T.goal - (steps % T.goal), dailiesToNext: raw >= T.cap ? 0 : INCUBATOR_DAILIES - (dailies % INCUBATOR_DAILIES) };
    },
    getIncubator() {
        const i = this._incubator();
        const bees = (this.state && this.state.hive && this.state.hive.bees) || [];
        const eggs = bees.filter(b => beeIsBrood(b));
        return {
            tier: i ? i.tier : null, owned: i ? i.owned.slice() : [], info: i ? INCUBATORS[i.tier] : null,
            slots: i ? i.slots.map(id => bees.find(b => b.id === id)).filter(Boolean) : [],
            waiting: eggs.filter(b => !(i && i.slots.includes(b.id))),
            today: this.incubatorEarnedToday(), coins: this.getCoins()
        };
    },
    buyIncubator(tier) {
        const T = INCUBATORS[tier];
        if (!T || !this.state) return { ok: false, error: 'Unknown incubator.' };
        const i = this._incubator() || (this.state.incubator = { tier: null, owned: [], slots: [], applied: {} });
        if (i.owned.includes(tier)) return { ok: false, error: 'You already own it.' };
        if (!this.spendCoins(T.price)) return { ok: false, error: `Needs ${T.price} Honey coins.` };
        i.owned.push(tier);
        // A better one replaces the one in use.
        if (!i.tier || INCUBATOR_ORDER.indexOf(tier) > INCUBATOR_ORDER.indexOf(i.tier)) i.tier = tier;
        i.slots = i.slots.slice(0, INCUBATORS[i.tier].slots);
        this.incubatorTick();
        this.save();
        return { ok: true, tier };
    },
    useIncubator(tier) {
        const i = this._incubator();
        if (!i || !i.owned.includes(tier)) return false;
        i.tier = tier;
        i.slots = i.slots.slice(0, INCUBATORS[tier].slots);
        this.save();
        return true;
    },
    incubatorAdd(beeId) {
        const i = this._incubator(), T = i && INCUBATORS[i.tier];
        const bee = this.getHiveBees().find(b => b.id === beeId);
        if (!T || !bee || !beeIsBrood(bee)) return { ok: false, error: 'Only eggs go in the incubator.' };
        if (i.slots.includes(beeId)) return { ok: true };
        if (i.slots.length >= T.slots) return { ok: false, error: 'No free slot. A better incubator has more.' };
        i.slots.push(beeId);
        // Steps already walked today count for a new egg too.
        this.incubatorTick();
        this.save();
        return { ok: true };
    },
    incubatorRemove(beeId) {
        const i = this._incubator();
        if (!i) return false;
        i.slots = i.slots.filter(id => id !== beeId);
        this.save();
        return true;
    },
    // Takes today's earned days off every egg inside (once per day each).
    // Runs after steps sync, after a daily is checked, and when the page opens.
    incubatorTick(today = todayISO()) {
        const i = this._incubator();
        if (!i || !INCUBATORS[i.tier]) return 0;
        const bees = this.getHiveBees();
        i.slots = i.slots.filter(id => { const b = bees.find(x => x.id === id); return b && beeIsBrood(b); });
        const earned = this.incubatorEarnedToday(today).off;
        let moved = 0;
        i.slots.forEach(id => {
            const b = bees.find(x => x.id === id);
            const rec = i.applied[id] && i.applied[id].day === today ? i.applied[id] : { day: today, n: 0 };
            const delta = earned - rec.n;
            if (delta > 0) {
                let at = shiftISODate(b.life.hatchOn, -delta);
                if (at < today) at = today;
                if (at !== b.life.hatchOn) { b.life.hatchOn = at; moved++; }
            }
            i.applied[id] = { day: today, n: Math.max(rec.n, earned) };
        });
        Object.keys(i.applied).forEach(id => { if (!i.slots.includes(id)) delete i.applied[id]; });
        return moved;
    },
    spendCoins(n) {
        const q = this._ensureQueen();
        if (!q || this.getCoins() < n) return false;
        q.spent = (q.spent || 0) + n;
        return true;
    },
    // +1 health, once per task per day (so un-check/re-check can't farm it).
    // Oct 31 2026 (Craft): the last task you finished, so a Rare-or-better
    // card made next can remember what earned it (see ensureBeeSerials).
    _noteDone(kind, label) {
        if (!this.state || !label) return;
        this.state.lastTaskDone = { kind, label: String(label).slice(0, 80), at: new Date().toISOString() };
    },
    _queenHeal(key) {
        const q = this._ensureQueen();
        if (!q || q.healed.includes(key)) return;
        q.healed.push(key);
        if (q.healed.length > 300) q.healed = q.healed.slice(-300);
        q.hp = Math.min(QUEEN.maxHp, (q.hp || 0) + QUEEN.heal);
    },
    // Returns true if the Queen fainted.
    _queenHurt(n, why = '') {
        const q = this._ensureQueen();
        if (!q || !(n > 0)) return false;
        q.hp = Math.max(0, (q.hp || 0) - n);
        if (typeof Toast !== 'undefined' && why) Toast.show(`❤️ −${n} · ${why}`, 'negative');
        if (q.hp > 0) return false;
        // Nov 7 2026 (Craft): Batch 24. A faint costs no coins and no XP. It gives a timed
        // XP debuff (-20% for 1 hour). A faint while it runs resets the timer, it never stacks.
        q.debuff = { id: 'faint', until: Date.now() + QUEEN.debuffMs, mult: QUEEN.debuffMult };
        q.hp = Math.round(QUEEN.maxHp / 2);
        q.faintedOn = todayISO();
        this._lifeBees().forEach(b => { if (b.life) b.life.happiness = clampVital(b.life.happiness - 15); });
        this._lifeEvent('queen-faint', '😵 Your Queen fainted! XP is −20% for 1 hour. Your bees are sad.');
        if (typeof Toast !== 'undefined') Toast.show('😵 Your Queen fainted! XP −20% for 1 hour. Health is back to half.', 'negative');
        return true;
    },

    // Guard Bees that can shield a streak right now: working, 3+ days on
    // the job, under 2 saves in the last 7 days.
    _readyGuards(today = todayISO()) {
        const q = this._ensureQueen();
        const weekAgo = shiftISODate(today, -6);
        q.guardLog = q.guardLog.filter(g => g.date >= shiftISODate(today, -13));
        return this._workers('guardian')
            .filter(b => !b.jobSince || (daysBetween(b.jobSince, today) || 0) >= QUEEN.guardDays)
            .map(b => ({ bee: b, left: QUEEN.guardSaves - q.guardLog.filter(g => g.beeId === b.id && g.date >= weekAgo).length }))
            .filter(g => g.left > 0);
    },

    // What Start My Day asks about: yesterday's unfinished dailies and
    // to-dos that were due yesterday. null = nothing to ask (or done today).
    getDayReview(today = todayISO()) {
        const q = this._ensureQueen();
        if (!q || q.reviewedOn === today) return null;
        if (typeof this.isOnboarding === 'function' && this.isOnboarding()) return null;
        const y = shiftISODate(today, -1);
        const dailies = (this.state.dailyTasks || []).filter(t =>
            (!t.startDate || t.startDate <= y) && isDailyDueOn(t, y)
            && !(t.completedDates || []).includes(y) && !(t.savedDates || []).includes(y))
            .map(t => ({ id: t.id, label: t.label, difficulty: queenDifficulty(t), xp: t.xp, streak: computeDailyStreak(t, y), checklist: (t.checklist || []).map(i => ({ id: i.id, label: i.label })) }));
        const todos = (this.state.todos || []).filter(t => !t.completed && t.dueDate === y)
            .map(t => ({ id: t.id, label: t.label, difficulty: queenDifficulty(t), xp: t.xp }));
        const guards = this._readyGuards(today);
        const charms = (this.state.inventory && this.state.inventory.items && this.state.inventory.items['streak-charm']) || 0;
        // Oct 28 2026 (Craft): Start My Day shows every morning. With nothing
        // missed it's "Off to a good start" with what you did yesterday.
        return { today, yesterday: y, dailies, todos, perfect: !dailies.length && !todos.length,
            done: this._doneOn(y), plan: this._planFor(today), guards: guards.map(g => ({ id: g.bee.id, name: g.bee.name, left: g.left })), charms };
    },
    // Everything finished on a day: [{ icon, label, xp }], newest kinds first.
    _doneOn(day) {
        const S = this.state, out = [];
        (S.dailyTasks || []).forEach(t => { if ((t.completedDates || []).includes(day)) out.push({ icon: '☀️', label: t.label, xp: Number(t.xp) || 0 }); });
        (S.todos || []).forEach(t => { if (t.completed && t.completedDate === day) out.push({ icon: '✅', label: t.label, xp: Number(t.xp) || 0 }); });
        (S.quests || []).forEach(q => (q.tasks || []).forEach(t => { if (t.completed && localDayOf(t.dateCompleted) === day) out.push({ icon: '🗺️', label: t.label, xp: Number(t.xp) || 0 });   /* Oct 31 2026 (Craft): local day */ }));
        (S.habits || []).forEach(h => { const n = (h.history || []).filter(x => x.date === day && x.direction === 'positive').length; if (n) out.push({ icon: '🔁', label: h.label + (n > 1 ? ` ×${n}` : ''), xp: n * (Number(h.xp) || 0) }); });
        return out;
    },
    // Today at a glance for Start My Day.
    _planFor(day) {
        const S = this.state;
        const dailies = (S.dailyTasks || []).filter(t => (!t.startDate || t.startDate <= day) && isDailyDueOn(t, day));
        const todos = (S.todos || []).filter(t => !t.completed && t.dueDate === day);
        return { dailies: dailies.length, hard: dailies.filter(t => t.difficulty === 'Hard').length,
            todos: todos.map(t => ({ label: t.label, time: t.dueTime || '' })), eggs: typeof this.readyEggs === 'function' ? this.readyEggs().length : 0 };
    },

    // Applies Start My Day. doneDailyIds/doneTodoIds = what you did
    // yesterday. Returns { saves: [...], damage, fainted }.
    finishDayReview({ doneDailyIds = [], doneTodoIds = [] } = {}, today = todayISO()) {
        const q = this._ensureQueen();
        if (!q || q.reviewedOn === today) return { saves: [], damage: 0, fainted: false };
        const y = shiftISODate(today, -1);
        const done = new Set(doneDailyIds);
        const result = { saves: [], damage: 0, fainted: false, credited: 0 };
        const missed = [];
        (this.state.dailyTasks || []).forEach(t => {
            if ((t.startDate && t.startDate > y) || !isDailyDueOn(t, y)) return;
            if ((t.completedDates || []).includes(y) || (t.savedDates || []).includes(y)) return;
            if (done.has(t.id)) {
                if (!t.completedDates) t.completedDates = [];
                t.completedDates.push(y);
                this._queenHeal(`daily:${t.id}:${y}`);
                result.credited++;
            } else missed.push(t);
        });
        (this.state.todos || []).forEach(t => {
            if (!t.completed && doneTodoIds.includes(t.id)) {
                t.completed = true; t.completedDate = y;
                this._queenHeal(`todo:${t.id}`);
                result.credited++;
            }
        });
        // Savers: longest streaks first. Guard Bees, then Streak Charms.
        const guards = this._readyGuards(today);
        const items = (this.state.inventory && this.state.inventory.items) || {};
        missed.map(t => ({ t, streak: computeDailyStreak(t, y) }))
            .sort((a, b) => b.streak - a.streak)
            .forEach(({ t, streak }) => {
                result.damage += queenHit(t);
                if (streak <= 0) { result.saves.push({ id: t.id, label: t.label, streak, by: 'none' }); return; }
                const g = guards.find(x => x.left > 0);
                let by = 'lost';
                if (g) {
                    g.left--;
                    q.guardLog.push({ beeId: g.bee.id, date: today });
                    by = 'guard';
                } else if (streak >= QUEEN.charmMinStreak && (items['streak-charm'] || 0) > 0) {
                    items['streak-charm']--;
                    by = 'charm';
                }
                if (by !== 'lost') { if (!t.savedDates) t.savedDates = []; t.savedDates.push(y); }
                result.saves.push({ id: t.id, label: t.label, streak, by, guard: by === 'guard' ? g.bee.name : null });
            });
        q.reviewedOn = today;
        if (result.damage) result.fainted = this._queenHurt(result.damage);
        // The whole hive feels missed work (not the ones a Guard or Charm saved).
        const lost = result.saves.filter(x => x.by === 'lost' || x.by === 'none').length;
        const lateTodos = (this.state.todos || []).filter(t => !t.completed && t.dueDate && t.dueDate <= y && t.dueDate >= shiftISODate(y, -1)).length;
        result.hive = this._hiveMissed(lost + lateTodos, today);
        this.save();
        this._syncLevelUpBees();
        return result;
    }
});

// Hints + Hive Coach (Oct 27 2026, approved demo). state.hints keeps the
// on/off switch, which pages already showed their tips, and when the coach
// may ask about a task again. Lives in the save, so it follows you.
Object.assign(DatabaseManager.prototype, {
    _hints() {
        if (!this.state.hints) this.state.hints = { off: false, seen: {}, snooze: {} };
        const h = this.state.hints;
        h.seen = h.seen || {}; h.snooze = h.snooze || {};
        return h;
    },
    hintsOn() { return !(this.state && this.state.hints && this.state.hints.off); },
    setHintsOn(on) { if (!this.state) return; this._hints().off = !on; this.save(); },
    hintSeen(page) { return !!(this.state && this.state.hints && this.state.hints.seen && this.state.hints.seen[page]); },
    markHintSeen(page) { if (!this.state) return; this._hints().seen[page] = true; this.save(); },
    resetHints() { if (!this.state) return; const h = this._hints(); h.seen = {}; h.off = false; this.save(); },

    // A daily missed 4+ of its last 7 due days while you still got other
    // things done on (at least 3 of) those days. Not active = no card.
    getCoachSuggestion(today = todayISO()) {
        if (!this.state || !this.hintsOn()) return null;
        const snooze = (this.state.hints && this.state.hints.snooze) || {};
        const dailies = this.state.dailyTasks || [];
        const todos = this.state.todos || [];
        const activeOn = (day, except) => dailies.some(d => d !== except && (d.completedDates || []).includes(day))
            || todos.some(t => t.completed && t.completedDate === day);
        let best = null;
        dailies.forEach(t => {
            if ((snooze[t.id] || '') > today) return;
            const due = [];
            for (let i = 1; i <= 31 && due.length < 7; i++) {
                const day = shiftISODate(today, -i);
                if (t.startDate && t.startDate > day) break;
                if (isDailyDueOn(t, day)) due.push(day);
            }
            if (due.length < 5) return;
            const done = (d) => (t.completedDates || []).includes(d) || (t.savedDates || []).includes(d);
            const missed = due.filter(d => !done(d));
            if (missed.length < 4 || missed.filter(d => activeOn(d, t)).length < 3) return;
            if (!best || missed.length > best.missed) {
                best = { task: t, missed: missed.length, of: due.length, days: due.slice().reverse().map(d => ({ day: d, done: done(d) })) };
            }
        });
        return best;
    },

    // The coach's fixes. Any choice hides the card for that task for 2 weeks
    // ("later" = 1 week). Returns the line to show, or { go: url }.
    applyCoachFix(taskId, kind, today = todayISO()) {
        const t = this.state && (this.state.dailyTasks || []).find(x => x.id === taskId);
        if (!t) return null;
        const h = this._hints();
        h.snooze[taskId] = shiftISODate(today, kind === 'later' ? 7 : 14);
        let msg = '';
        if (kind === 'less') {
            const r = t.repeats || { type: 'daily', every: 1, daysOfWeek: [] };
            const cur = r.type === 'weekly' ? (r.daysOfWeek || []) : [0, 1, 2, 3, 4, 5, 6];
            const days = cur.length > 3 ? [1, 3, 5] : cur.slice(0, Math.max(1, cur.length - 1));
            this.updateDailyTask(taskId, { repeats: { type: 'weekly', every: 1, daysOfWeek: days } });
            msg = `Now due ${days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}.`;
        } else if (kind === 'time') {
            const m = plannedMinutes(t);
            const next = Math.min(240, Math.max(m * 2, m + 15));
            this.updateDailyTask(taskId, { minutes: next });
            msg = `Planned time is now ${next} min. It gives more XP too.`;
        } else if (kind === 'reminder') {
            this.updateDailyTask(taskId, { reminders: [...(t.reminders || []), { id: `rem-${Date.now().toString(36)}`, time: '18:30' }] });
            msg = 'Reminder set for 6:30 PM. Change it on the task any time.';
        } else if (kind === 'smaller') {
            this.save();
            return { go: `create-daily.html?id=${encodeURIComponent(taskId)}` };
        } else {
            msg = kind === 'later' ? "I'll check again next week." : "OK. I won't ask about this one for 2 weeks.";
        }
        this.save();
        return msg;
    },

    // Projects plugin (Oct 27 2026, approved demo). Uses the same list the
    // Profile page shows (state.profile.projects), with a few new fields.
    getProjects() {
        if (!this.state) return [];
        const list = (this.state.profile && this.state.profile.projects) || [];
        list.forEach((p, i) => { if (!p.id) p.id = `prj-${i}-${(p.name || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`; });
        return list.filter(p => p.name !== 'Your First Project');
    },
    saveProject(data) {
        if (!this.state) return null;
        if (!this.state.profile) this.state.profile = { projects: [], serviceRecord: [] };
        const list = this.state.profile.projects || (this.state.profile.projects = []);
        let p = data.id && list.find(x => x.id === data.id);
        if (!p) { p = { id: `prj-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, addedAt: new Date().toISOString() }; list.push(p); }
        const clean = (v) => String(v || '').trim();
        Object.assign(p, {
            name: clean(data.name) || 'Untitled', emoji: clean(data.emoji) || '🛠️', description: clean(data.description),
            liveLink: clean(data.liveLink) || null, repoLink: clean(data.repoLink) || null, localPath: clean(data.localPath) || null,
            tech: (data.tech || []).map(clean).filter(Boolean), status: p.status || '',
        });
        this.save();
        return p;
    },
    deleteProject(id) {
        if (!this.state || !this.state.profile) return;
        this.state.profile.projects = (this.state.profile.projects || []).filter(p => p.id !== id);
        this.save();
    },
    toggleProjectPin(id) {
        const p = this.getProjects().find(x => x.id === id);
        if (!p) return;
        p.pinned = !p.pinned;
        this.save();
    },
});

// ============================================================================
// RANKS (Oct 31 2026, Craft, approved demo "BizzyBee Ranks & Titles").
// A new rank every 5 levels, bee-themed, with an insignia: stripes, then
// pips, then wings, then the crown. Past level 50: Tier 1, Tier 2... (two
// levels each: 51-52 = T1, 53-54 = T2). Each rank up is CLAIMED (pressed)
// and pays its reward once (state.rankClaims). Ranks reached before this
// update count as already claimed (no back-pay).
// ============================================================================
const RANKS = [
    { lvl: 1, name: 'Larva', kind: 'stripes', n: 0 }, { lvl: 5, name: 'Hatchling', kind: 'stripes', n: 1 },
    { lvl: 10, name: 'Worker', kind: 'stripes', n: 2 }, { lvl: 15, name: 'Forager', kind: 'stripes', n: 3 },
    { lvl: 20, name: 'Scout', kind: 'pips', n: 1 }, { lvl: 25, name: 'Builder', kind: 'pips', n: 2 },
    { lvl: 30, name: 'Guardian', kind: 'pips', n: 3 }, { lvl: 35, name: 'Swarm Captain', kind: 'wings', n: 1 },
    { lvl: 40, name: 'Hive Commander', kind: 'wings', n: 2 }, { lvl: 45, name: 'Elder', kind: 'wings', n: 3 },
    { lvl: 50, name: 'Royal Keeper', kind: 'crown', n: 0 }
];
const RANK_REWARDS = {
    stripes: { tickets: 2, mats: [['pollen', 3]] },
    pips: { tickets: 3, mats: [['royal-nectar', 1]], egg: 'Rare' },
    wings: { tickets: 4, mats: [['royal-jelly', 1]], egg: 'Epic' },
    crown: { tickets: 5, mats: [['royal-jelly', 2]], egg: 'Legendary' },
    tier: { tickets: 5, mats: [['royal-jelly', 1]], egg: 'Epic' }
};
// The rank a level is in. { id, name, kind, n, from, tier? }
const TIER_STEP = 5;
function rankForLevel(level) {
    const L = Math.max(1, Number(level) || 1);
    // Nov 1 2026 (Craft): past 50, a Tier every 5 levels (55, 60, 65...).
    if (L >= LEVEL_CAP + TIER_STEP) {
        const t = Math.floor((L - LEVEL_CAP) / TIER_STEP);
        return { id: `tier-${t}`, name: `Tier ${t}`, kind: 'tier', n: t, tier: t, from: LEVEL_CAP + TIER_STEP * t };
    }
    let r = RANKS[0];
    for (const x of RANKS) if (L >= x.lvl) r = x;
    return { id: `rank-${r.lvl}`, name: r.name, kind: r.kind, n: r.n, from: r.lvl };
}
// Every rank reached up to a level, oldest first (Larva excluded: no reward).
function ranksUpTo(level) {
    const L = Math.max(1, Number(level) || 1), out = [];
    RANKS.forEach(r => { if (r.lvl > 1 && L >= r.lvl) out.push(rankForLevel(r.lvl)); });
    for (let lv = LEVEL_CAP + TIER_STEP; lv <= L; lv += TIER_STEP) out.push(rankForLevel(lv));
    return out;
}
function nextRank(level) {
    const L = Math.max(1, Number(level) || 1);
    if (L >= LEVEL_CAP) { const now = rankForLevel(L); const at = now.kind === 'tier' ? now.from + TIER_STEP : LEVEL_CAP + TIER_STEP; return { ...rankForLevel(at), at }; }
    const r = RANKS.find(x => x.lvl > L);
    return { ...rankForLevel(r.lvl), at: r.lvl };
}
Object.assign(DatabaseManager.prototype, {
    // Your rank by your claimed level (the top bar's level).
    getRank() {
        if (!this.state) return null;
        const bar = this.getCharacterLevelBar();
        const level = bar ? bar.level : 1;
        if (!Array.isArray(this.state.rankClaims)) {
            // First time: ranks already reached count as claimed (no back-pay).
            this.state.rankClaims = ranksUpTo(level).map(r => r.id);
            this.saveQuiet();
        }
        const claimed = new Set(this.state.rankClaims);
        const pending = ranksUpTo(level).filter(r => !claimed.has(r.id));
        return { level, rank: rankForLevel(level), next: nextRank(level), pending };
    },
    // Claims the oldest unclaimed rank up and pays its reward once.
    claimRankUp() {
        const info = this.getRank();
        if (!info || !info.pending.length) return null;
        const rank = info.pending[0];
        const pay = RANK_REWARDS[rank.kind] || RANK_REWARDS.stripes;
        this.state.rankClaims.push(rank.id);
        if (!this.state.hive) this.state.hive = { bees: [] };
        this.state.hive.tickets = (this.state.hive.tickets || 0) + pay.tickets;
        const awardedMaterials = [];
        pay.mats.forEach(([id, n]) => { for (let i = 0; i < n; i++) { this._addMaterial(id, 1); awardedMaterials.push(id); } });
        const awardedBees = [];
        if (pay.egg) { const bee = this.awardBee('rank', pay.egg); if (bee) awardedBees.push(bee); }
        this.save();
        return { rank, ticketsGranted: pay.tickets, awardedMaterials, awardedBees, pendingLeft: info.pending.length - 1 };
    }
});

// ============================================================================
// TITLES (Oct 31 2026, Craft, approved demo "BizzyBee Ranks & Titles").
// Earned by doing things; you wear one and it shows next to your rank
// ("Forager · Streak Keeper"). A title you haven't earned shows NOTHING: no
// name, no rule, no progress, only "???" (Craft). Quest titles (state.titles,
// from history imports and quest unlocks) count as earned. Perks come later.
// state.titleWorn = the id you wear, or null for rank only.
// ============================================================================
// Nov 1 2026 (Craft; approved demo): a worn special title adds its perk to
// every Daily bonus (Swarm Lord: Sundays only). Hidden until earned.
function titlePerkText(p) { return `+${p.qty} ${p.icon}${p.sunday ? ' every Sunday' : ''}`; }
const SPECIAL_TITLES = [
    { id: 'streak-keeper', icon: '🔥', name: 'Streak Keeper', how: 'Reach a 7-day streak', need: 1, perk: { kind: 'coins', qty: 5, icon: '🪙' },
        have: (S) => (S.bonusXP || []).some(b => /^streak-(7|30|100|week):/.test(b.key)) ? 1 : 0 },
    { id: 'faithful', icon: '🌅', name: 'Faithful', how: 'Finish something on 7 different days', need: 7, perk: { kind: 'pollen', qty: 1, icon: '🌼' },
        have: (S) => {
            const days = new Set();
            (S.dailyTasks || []).forEach(t => (t.completedDates || []).forEach(d => days.add(d)));
            (S.todos || []).forEach(t => { if (t.completed && t.completedDate) days.add(t.completedDate); });
            (S.habits || []).forEach(h => (h.history || []).forEach(x => { if (x.direction === 'positive') days.add(x.date); }));
            return days.size;
        } },
    { id: 'questmaster', icon: '🗺️', name: 'Questmaster', how: 'Finish 3 quests', need: 3, perk: { kind: 'coins', qty: 5, icon: '🪙' },
        have: (S) => (S.quests || []).filter(q => q.dateCompleted || ((q.tasks || []).length && q.tasks.every(t => t.completed))).length },
    { id: 'swarm-lord', icon: '🐝', name: 'Swarm Lord', how: 'Have 25 bees', need: 25, perk: { kind: 'royal-nectar', qty: 1, icon: '✨', sunday: true },
        have: (S) => ((S.hive && S.hive.bees) || []).filter(b => b.rarity !== 'Royal').length },
    { id: 'centurion', icon: '💯', name: 'Centurion', how: 'Finish 100 tasks', need: 100, perk: { kind: 'coins', qty: 10, icon: '🪙' },
        have: (S) => (S.dailyTasks || []).reduce((n, t) => n + (t.completedDates || []).length, 0) + (S.todos || []).filter(t => t.completed).length
            + (S.quests || []).reduce((n, q) => n + (q.tasks || []).filter(t => t.completed).length, 0) }
];
Object.assign(DatabaseManager.prototype, {
    getTitles() {
        if (!this.state) return null;
        const S = this.state;
        const special = SPECIAL_TITLES.map(t => { const earned = t.have(S) >= t.need; return earned
            ? { id: t.id, kind: 'special', icon: t.icon, name: t.name, how: t.how, earned: true, perk: t.perk ? titlePerkText(t.perk) : '' }
            : { id: t.id, kind: 'special', earned: false }; });   // locked: nothing about it leaves here
        const quest = (S.titles || []).map((t, i) => ({ id: `quest-${i}-${String(t.title || '').toLowerCase().replace(/\W+/g, '-')}`, kind: 'quest', icon: '📜', name: String(t.title || 'Title'), how: t.ability || 'Earned on a quest', earned: true }));
        const all = [...special, ...quest];
        const worn = all.find(t => t.earned && t.id === S.titleWorn) || null;
        return { all, earned: all.filter(t => t.earned), locked: all.filter(t => !t.earned).length, worn };
    },
    // id of an earned title, or null to show your rank only.
    // The worn special title's perk for today's Daily bonus, or null.
    titlePerk(today = todayISO()) {
        const T = this.getTitles();
        const w = T && T.worn && T.worn.kind === 'special' ? SPECIAL_TITLES.find(t => t.id === T.worn.id) : null;
        if (!w || !w.perk) return null;
        if (w.perk.sunday && new Date(today + 'T12:00').getDay() !== 0) return null;
        return { ...w.perk, title: w.name };
    },
    wearTitle(id) {
        if (!this.state) return null;
        if (id === null) { this.state.titleWorn = null; this.save(); return true; }
        const t = this.getTitles().all.find(x => x.id === id && x.earned);
        if (!t) return null;
        this.state.titleWorn = id;
        this.save();
        return t;
    }
});

// ============================================================================
// HONEY MART (Nov 1 2026, Craft; from 1.0.7's Store v3, approved demo): buy
// several at once (capped by what you can afford), sell for half its worth,
// and gifts between friends (hive.mjs, delivered to the Mailbox).
// Sell values: coins as-is; materials count as MAT_COIN coins each.
// ============================================================================
const MAT_COIN = { pollen: 4, 'royal-nectar': 15, 'honey-drop': 40, 'royal-jelly': 200 };
const SELL_RATE = 0.5;
function storePriceHave(vault, item) {
    if (item.price.currency === 'coins') return vault.getCoins();
    return vault.getMaterials()[item.price.materialId] || 0;
}
Object.assign(DatabaseManager.prototype, {
    ownsUnlock(id) { return !!(this.state && this.state.unlocks && this.state.unlocks[id]); },
    maxAffordable(itemId) {
        const item = STORE_ITEM_CATALOG.find(i => i.id === itemId);
        if (!item || !this.state) return 0;
        if (item.kind === 'unlock') return !this.ownsUnlock(item.id) && storePriceHave(this, item) >= item.price.amount ? 1 : 0;
        return Math.max(0, Math.min(99, Math.floor(storePriceHave(this, item) / item.price.amount)));
    },
    buyStoreItems(itemId, qty = 1) {
        if (!this.maxAffordable(itemId)) return null;
        const n = Math.max(1, Math.min(Math.floor(qty) || 1, this.maxAffordable(itemId)));
        let last = null;
        for (let i = 0; i < n; i++) { const r = this.purchaseStoreItem(itemId); if (!r) break; last = r; last.count = i + 1; }
        return last;
    },
    // What one of this sells for, in Honey coins (half its worth, at least 1).
    sellValue(id) {
        const item = STORE_ITEM_CATALOG.find(i => i.id === id);
        if (item) return Math.max(1, Math.floor((item.price.currency === 'coins' ? item.price.amount : item.price.amount * (MAT_COIN[item.price.materialId] || 4)) * SELL_RATE));
        if (MAT_COIN[id]) return Math.max(1, Math.floor(MAT_COIN[id] * SELL_RATE));
        return 0;
    },
    sellOwned(id, qty = 1) {
        if (!this.state || !this.state.inventory) return null;
        const inv = this.state.inventory, isMat = !!MAT_COIN[id] && !STORE_ITEM_CATALOG.some(i => i.id === id);
        const bag = isMat ? (inv.materials = inv.materials || {}) : (inv.items = inv.items || {});
        const have = bag[id] || 0, n = Math.max(1, Math.min(Math.floor(qty) || 1, have)), each = this.sellValue(id);
        if (!have || !each) return null;
        bag[id] = have - n;
        const q = this._ensureQueen(); if (q) q.bonus = (q.bonus || 0) + each * n;   // coins come in as a bonus (getQueenStats)
        this.save();
        return { n, coins: each * n };
    },
    // Gifts: held items only. Taken out before sending; put back if it fails.
    giftTakeOut(itemId) {
        const item = STORE_ITEM_CATALOG.find(i => i.id === itemId && i.kind === 'held');
        const items = this.getItems();
        if (!item || !(items[itemId] > 0)) return null;
        this.state.inventory.items[itemId] = items[itemId] - 1;
        this.save();
        return item;
    },
    giftPutIn(itemId, n = 1) {
        const item = STORE_ITEM_CATALOG.find(i => i.id === itemId && i.kind === 'held');
        if (!item || !this.state) return null;
        if (!this.state.inventory) this.state.inventory = { materials: {}, items: {} };
        if (!this.state.inventory.items) this.state.inventory.items = {};
        this.state.inventory.items[itemId] = (this.state.inventory.items[itemId] || 0) + Math.max(1, Math.min(5, n));
        this.save();
        return item;
    }
});

// =====================================================================
// SAVE MERGE (Oct 28 2026). Two copies of a save (this device + cloud)
// are combined instead of showing a conflict screen.
//  - Every item (daily, to-do, habit, quest, quest task, bee, term,
//    project) gets _mt, the time it last changed (stamped in save()).
//  - Same item changed on both: the newer change wins ("last action wins").
//  - Dailies: each day's check / uncheck has its own time (_days), so a
//    day done on one device and another day done on the other both stay.
//  - Habit taps from both devices are kept.
//  - Deleted items leave a tombstone (_tomb) so an old copy can't bring
//    them back.
//  - Everything else (hive stats, inventory, settings): the copy saved
//    most recently wins. The cloud keeps the replaced copy as a backup.
// =====================================================================
const MERGE_LISTS = [
    ['dailyTasks', (s) => s.dailyTasks],
    ['todos', (s) => s.todos],
    ['habits', (s) => s.habits],
    ['quests', (s) => s.quests],
    ['bees', (s) => s.hive && s.hive.bees],
    ['dictionary', (s) => s.dictionary],
    ['projects', (s) => s.profile && s.profile.projects],
];
const mergeKeyOf = (item) => item && (item.id || item.name || null);
const mergeStamp = (item) => Number(item && item._mt) || 0;
const mergeClone = (o) => JSON.parse(JSON.stringify(o));

// What counts as "this item changed" (nested quest tasks are tracked on their own).
function mergeFingerprint(kind, item) {
    if (kind === 'quests') {
        const { tasks, ghostLogs, _mt, ...rest } = item;
        void tasks; void ghostLogs; void _mt;
        return JSON.stringify(rest);
    }
    const { _mt, ...rest } = item;
    void _mt;
    return JSON.stringify(rest);
}

// Called from save(): stamps _mt on changed items and tombstones deleted ones.
function stampSaveChanges(state, shadow, now = Date.now()) {
    const next = {};
    state._tomb = state._tomb || {};
    const walk = (kind, list) => {
        if (!Array.isArray(list)) return;
        const seen = new Set();
        list.forEach(item => {
            const key = mergeKeyOf(item);
            if (!key) return;
            const id = `${kind}:${key}`;
            seen.add(id);
            const fp = mergeFingerprint(kind, item);
            if (shadow && shadow[id] !== undefined && shadow[id] !== fp) item._mt = now;
            else if (!item._mt && shadow && shadow[id] === undefined) item._mt = now;   // new item
            next[id] = fp;
            if (kind === 'quests') walk(`qt:${key}`, item.tasks);
        });
        if (shadow) Object.keys(shadow).forEach(id => {
            if (id.startsWith(`${kind}:`) && !seen.has(id)) state._tomb[id] = now;
        });
    };
    MERGE_LISTS.forEach(([kind, get]) => walk(kind, get(state)));
    // Tombstones older than 90 days are forgotten.
    const old = now - 90 * 86400000;
    Object.keys(state._tomb).forEach(k => { if (state._tomb[k] < old) delete state._tomb[k]; });
    return next;
}

// One daily from two copies: newer item wins, then each day's check/uncheck by its own time.
function mergeDaily(winner, other) {
    const out = mergeClone(winner);
    const days = { ...(other._days || {}) };
    Object.entries(winner._days || {}).forEach(([d, r]) => { if (!days[d] || r.t >= days[d].t) days[d] = r; });
    const set = new Set([...(winner.completedDates || []), ...(other.completedDates || [])]);
    Object.entries(days).forEach(([d, r]) => { if (r.done) set.add(d); else set.delete(d); });
    out.completedDates = [...set].sort();
    out.savedDates = [...new Set([...(winner.savedDates || []), ...(other.savedDates || [])])].sort();
    if (Object.keys(days).length) out._days = days;
    return out;
}

function mergeList(kind, a, b, tomb) {
    const A = Array.isArray(a) ? a : [], B = Array.isArray(b) ? b : [];
    const mapB = new Map(B.map(x => [mergeKeyOf(x), x]));
    const out = [];
    const dead = (item) => { const t = tomb[`${kind}:${mergeKeyOf(item)}`]; return t && t >= mergeStamp(item); };
    const both = (x, y) => {
        const win = mergeStamp(y) > mergeStamp(x) ? y : x, lose = win === x ? y : x;
        if (kind === 'dailyTasks') return mergeDaily(win, lose);
        let res = mergeClone(win);
        if (kind === 'habits') {
            const seen = new Set();
            res.history = [...(win.history || []), ...(lose.history || [])].filter(h => { const k = JSON.stringify(h); if (seen.has(k)) return false; seen.add(k); return true; });
        }
        if (kind === 'quests') {
            const key = mergeKeyOf(win);
            res.tasks = mergeList(`qt:${key}`, x.tasks, y.tasks, tomb);
            if (x.ghostLogs || y.ghostLogs) {
                const seen = new Set();
                res.ghostLogs = [...(x.ghostLogs || []), ...(y.ghostLogs || [])].filter(g => { const k = g.id || JSON.stringify(g); if (seen.has(k)) return false; seen.add(k); return true; });
            }
        }
        return res;
    };
    A.forEach(x => {
        const key = mergeKeyOf(x);
        const y = key != null ? mapB.get(key) : null;
        if (y) { mapB.delete(key); const r = both(x, y); if (!dead(r)) out.push(r); }
        else if (!dead(x)) out.push(mergeClone(x));
    });
    mapB.forEach(y => { if (!dead(y)) out.push(mergeClone(y)); });
    return out;
}

// Merge two whole saves (plain objects). Returns a new object.
function mergeSaves(a, b) {
    const ta = Date.parse(a.updatedAt || 0) || 0, tb = Date.parse(b.updatedAt || 0) || 0;
    const base = tb > ta ? b : a, other = base === a ? b : a;
    const out = mergeClone(base);
    const tomb = { ...(other._tomb || {}) };
    Object.entries(base._tomb || {}).forEach(([k, t]) => { if (!tomb[k] || t > tomb[k]) tomb[k] = t; });
    out._tomb = tomb;
    out.dailyTasks = mergeList('dailyTasks', base.dailyTasks, other.dailyTasks, tomb);
    out.todos = mergeList('todos', base.todos, other.todos, tomb);
    out.habits = mergeList('habits', base.habits, other.habits, tomb);
    out.quests = mergeList('quests', base.quests, other.quests, tomb);
    if (out.hive) out.hive.bees = mergeList('bees', base.hive && base.hive.bees, other.hive && other.hive.bees, tomb);
    if (base.dictionary || other.dictionary) out.dictionary = mergeList('dictionary', base.dictionary, other.dictionary, tomb);
    if (out.profile || other.profile) {
        out.profile = out.profile || mergeClone(other.profile);
        out.profile.projects = mergeList('projects', base.profile && base.profile.projects, other.profile && other.profile.projects, tomb);
    }
    // Steps per day: keep the higher count.
    if (base.steps || other.steps) {
        out.steps = { ...(other.steps || {}) };
        Object.entries(base.steps || {}).forEach(([d, n]) => { out.steps[d] = Math.max(n, out.steps[d] || 0); });
    }
    out.updatedAt = new Date(Math.max(ta, tb) || Date.now()).toISOString();
    return out;
}

// ============================================================================
// REAL TIME, ARCHIVE AND CHANGE LOG (Nov 7 2026, Craft; approved demo v2)
// - Real time: only minutes you actually log (the check-off pop-up, a quest
//   timer, imported history). Kept in state.timeLog, its own ledger, so
//   deleting or editing a task, bad habits or a fainted Queen never take it
//   away. Unchecking the SAME day removes that completion's time (you didn't
//   do it). This is the "10,000 hours" number.
// - "Fill in later": state.timePending, a red-dot list. Its time isn't real
//   until you add the minutes.
// - Planned time: what the plan said for every completion (for XP).
// - Archive: deleted habits, dailies, To-Dos, quests and quest tasks, with
//   their whole history. Restore puts them back.
// - Change log: every uncheck, edit, delete, restore and late fill-in that
//   touched your stats. Big after-the-fact changes get a flag. Can't be
//   edited or cleared.
// ============================================================================
const TIME_FLAG_MIN = 120;   // a logged-time change this big (or on another day) gets a ⚑
const CHANGE_LOG_MAX = 1000;
(() => {
    if (typeof DatabaseManager === 'undefined') return;   // tests that load only part of this file
    const P = DatabaseManager.prototype;
    const orig = {};
    ['logCompletionMinutes', 'toggleDailyTask', 'toggleTodoComplete', 'toggleTask', 'removeDailyTask', 'removeHabit', 'removeTodo',
        'removeTask', 'removeQuest', 'updateDailyTask', 'updateHabit', 'updateTodo', 'updateTask'].forEach(k => { orig[k] = P[k]; });
    const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const fmtMin = (m) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m} min`;

    Object.assign(P, {
        _rt() {
            const s = this.state;
            if (!s) return null;
            if (!Array.isArray(s.timeLog)) s.timeLog = [];
            if (!Array.isArray(s.timePending)) s.timePending = [];
            if (!Array.isArray(s.archive)) s.archive = [];
            if (!Array.isArray(s.changeLog)) s.changeLog = [];
            if (!s.timeLogV1) { s.timeLogV1 = new Date().toISOString(); this._seedTimeLog(); }
            return s;
        },
        _taskCats(task, quest) {
            try { return skillsForTask(task, this.getDictionaryTerms ? this.getDictionaryTerms() : (this.state.dictionary || []), quest).map(x => x.category); }
            catch { return []; }
        },
        _changeLog(type, text, note = '', flag = false) {
            const s = this.state;
            if (!s) return;
            if (!Array.isArray(s.changeLog)) s.changeLog = [];
            s.changeLog.unshift({ at: new Date().toISOString(), type, text, note, flag: !!flag });
            if (s.changeLog.length > CHANGE_LOG_MAX) s.changeLog.length = CHANGE_LOG_MAX;
        },
        // One-time: real time you already logged before the time log existed.
        _seedTimeLog() {
            const s = this.state, out = s.timeLog;
            const add = (key, kind, task, quest, date, min) => {
                if (!(min > 0)) return;
                out.push({ id: uid('t'), key, kind, taskId: task.id, questId: quest ? quest.id : null, label: task.label, date: String(date || '').slice(0, 10) || null, min: Math.round(min), cats: this._taskCats(task, quest), at: new Date().toISOString(), seeded: true });
            };
            (s.dailyTasks || []).forEach(t => { const log = t.minutesLog || {}; (t.completedDates || []).forEach(d => add(`daily:${t.id}:${d}`, 'daily', t, null, d, Number(log[d]))); });
            (s.habits || []).forEach(h => (h.history || []).filter(x => x.direction === 'positive').forEach(x => add(`habit:${h.id}:${x.id}`, 'habit', h, null, x.date, Number(x.minutes))));
            (s.todos || []).filter(t => t.completed).forEach(t => add(`todo:${t.id}`, 'todo', t, null, t.completedDate, Number(t.minutesSpent)));
            (s.quests || []).forEach(q => (q.tasks || []).filter(t => t.completed).forEach(t => {
                const m = Number(t.minutesSpent) > 0 ? Number(t.minutesSpent) : Number(t.durSec) > 0 ? Number(t.durSec) / 60 : Number(t.historyXP) > 0 ? Number(t.historyXP) : 0;
                add(`quest:${q.id}:${t.id}`, 'quest', t, q, t.dateCompleted, m);
            }));
        },
        _findTask(kind, id, questId) {
            const s = this.state || {};
            if (kind === 'daily') return { task: (s.dailyTasks || []).find(t => t.id === id) };
            if (kind === 'habit') return { task: (s.habits || []).find(t => t.id === id) };
            if (kind === 'todo') return { task: (s.todos || []).find(t => t.id === id) };
            const quest = (s.quests || []).find(q => q.id === questId);
            return { task: quest && (quest.tasks || []).find(t => t.id === id), quest };
        },
        // Which completion a check-off is: the key the time log uses.
        _completionKey(kind, task, questId, date = todayISO()) {
            if (kind === 'daily') return `daily:${task.id}:${date}`;
            if (kind === 'habit') { const last = [...(task.history || [])].reverse().find(h => h.direction === 'positive'); return last ? `habit:${task.id}:${last.id}` : null; }
            if (kind === 'todo') return `todo:${task.id}`;
            return `quest:${questId}:${task.id}`;
        },
        _putRealTime({ key, kind, task, quest, date, min, late = false }) {
            const s = this._rt();
            if (!s || !key || !(min > 0)) return;
            const m = Math.round(min);
            const was = s.timeLog.find(e => e.key === key);
            if (was) {
                if (was.min !== m) {
                    const big = Math.abs(was.min - m) >= TIME_FLAG_MIN || (was.date && was.date !== todayISO());
                    this._changeLog('edit', `Logged time on "${task.label}" ${fmtMin(was.min)} → ${fmtMin(m)}`, big ? 'Big change after the fact' : 'Real time updated', big);
                    was.min = m; was.edited = new Date().toISOString();
                }
            } else {
                s.timeLog.push({ id: uid('t'), key, kind, taskId: task.id, questId: quest ? quest.id : null, label: task.label, date: date || todayISO(), min: m, cats: this._taskCats(task, quest), at: new Date().toISOString() });
                if (late) this._changeLog('fill', `Filled in "${task.label}" ${fmtMin(m)}`, `${date === todayISO() ? "Today's" : date + "'s"} time, now in your real hours`, m >= TIME_FLAG_MIN * 2);
            }
            s.timePending = s.timePending.filter(p => p.key !== key);
        },
        _dropRealTime(key, label) {
            const s = this._rt();
            if (!s || !key) return 0;
            const e = s.timeLog.find(x => x.key === key);
            s.timePending = s.timePending.filter(p => p.key !== key);
            if (!e) return 0;
            if (e.date !== todayISO()) {
                this._changeLog('uncheck', `Unchecked "${label}"`, `Kept ${fmtMin(e.min)} real time: it was logged on ${e.date}`);
                return 0;
            }
            s.timeLog = s.timeLog.filter(x => x !== e);
            this._changeLog('uncheck', `Unchecked "${label}"`, `−${fmtMin(e.min)} real time (same day, so it comes off)`);
            return e.min;
        },

        // ---- check-off pop-up ----
        logCompletionMinutes(kind, id, minutes, opts = {}) {
            const xp = orig.logCompletionMinutes.call(this, kind, id, minutes, opts);
            if (xp == null) return xp;
            const { task, quest } = this._findTask(kind, id, opts.questId);
            if (task) this._putRealTime({ key: this._completionKey(kind, task, opts.questId), kind, task, quest, date: todayISO(), min: Math.max(1, Math.min(1440, Math.round(Number(minutes) || 0))) });
            this.save();
            return xp;
        },
        // "Fill in later": a red-dot list until you add the minutes.
        timeLater(kind, id, { questId } = {}) {
            const s = this._rt();
            const { task, quest } = this._findTask(kind, id, questId);
            if (!s || !task) return false;
            const key = this._completionKey(kind, task, questId);
            if (!key || s.timeLog.some(e => e.key === key) || s.timePending.some(p => p.key === key)) return false;
            s.timePending.unshift({ key, kind, taskId: task.id, questId: questId || null, label: task.label, date: todayISO(), planned: plannedMinutes(task), cats: this._taskCats(task, quest), at: new Date().toISOString() });
            this.save();
            return true;
        },
        getTimePending() { const s = this._rt(); return s ? s.timePending.slice() : []; },
        fillTimePending(key, minutes) {
            const s = this._rt();
            const p = s && s.timePending.find(x => x.key === key);
            const m = Math.max(1, Math.min(1440, Math.round(Number(minutes) || 0)));
            if (!p || !m) return false;
            const { task, quest } = this._findTask(p.kind, p.taskId, p.questId);
            // XP side: the completion's own minutes, if the task still exists.
            if (task) {
                if (p.kind === 'daily') task.minutesLog = { ...(task.minutesLog || {}), [p.date]: m };
                else if (p.kind === 'habit') { const bump = (task.history || []).find(h => key.endsWith(':' + h.id)); if (bump) bump.minutes = m; }
                else task.minutesSpent = m;
            }
            this._putRealTime({ key, kind: p.kind, task: task || { id: p.taskId, label: p.label }, quest, date: p.date, min: m, late: true });
            if (!task) { const e = s.timeLog.find(x => x.key === key); if (e) e.cats = p.cats || []; }
            this.save();
            this._syncLevelUpBees();
            return true;
        },
        dropTimePending(key) {
            const s = this._rt();
            if (!s) return;
            s.timePending = s.timePending.filter(p => p.key !== key);
            this.save();
        },

        // ---- totals ----
        getRealMinutes({ since } = {}) {
            const s = this._rt();
            return s ? s.timeLog.filter(e => !since || (e.date && e.date >= since)).reduce((n, e) => n + (e.min || 0), 0) : 0;
        },
        getRealBySkill() {
            const s = this._rt(), by = {};
            if (s) s.timeLog.forEach(e => (e.cats || []).forEach(c => { by[c] = (by[c] || 0) + (e.min || 0); }));
            return by;   // { category: minutes }
        },
        // What the plan said for every completion you have now (XP's time).
        getPlannedMinutes() {
            const s = this.state;
            if (!s) return 0;
            let m = 0;
            (s.dailyTasks || []).forEach(t => { m += (t.completedDates || []).length * plannedMinutes(t); });
            (s.habits || []).forEach(h => { m += (h.history || []).filter(x => x.direction === 'positive').length * plannedMinutes(h); });
            (s.todos || []).filter(t => t.completed).forEach(t => { m += plannedMinutes(t); });
            (s.quests || []).forEach(q => (q.tasks || []).filter(t => t.completed).forEach(t => { m += plannedMinutes(t); }));
            return m;
        },
        getArchive() { const s = this._rt(); return s ? s.archive.slice() : []; },
        getChangeLog() { const s = this._rt(); return s ? s.changeLog.slice() : []; },
        realMinutesFor(taskId) { const s = this._rt(); return s ? s.timeLog.filter(e => e.taskId === taskId).reduce((n, e) => n + e.min, 0) : 0; },

        // ---- unchecking ----
        toggleDailyTask(taskId) {
            const t = (this.state && this.state.dailyTasks || []).find(x => x.id === taskId);
            const wasDone = !!(t && (t.completedDates || []).includes(todayISO()));
            const r = orig.toggleDailyTask.call(this, taskId);
            if (r && wasDone) { this._dropRealTime(`daily:${taskId}:${todayISO()}`, t.label); this.save(); }
            return r;
        },
        toggleTodoComplete(todoId) {
            const t = (this.state && this.state.todos || []).find(x => x.id === todoId);
            const wasDone = !!(t && t.completed);
            const r = orig.toggleTodoComplete.call(this, todoId);
            if (r && wasDone) { this._dropRealTime(`todo:${todoId}`, t.label); this.save(); }
            return r;
        },
        toggleTask(questId, taskId) {
            const { task } = this._findTask('quest', taskId, questId);
            const wasDone = !!(task && task.completed);
            const r = orig.toggleTask.call(this, questId, taskId);
            if (!r || !task) return r;
            if (wasDone) { this._dropRealTime(`quest:${questId}:${taskId}`, task.label); this.save(); }
            else if (Number(task.durSec) > 0) { this._putRealTime({ key: `quest:${questId}:${taskId}`, kind: 'quest', task, quest: r, date: todayISO(), min: Number(task.durSec) / 60 }); this.save(); }   // the quest timer is real time
            return r;
        },

        // ---- deleting: into the Archive, real time kept ----
        _archive(kind, item, extra = {}) {
            const s = this._rt();
            if (!s || !item) return;
            s.archive.unshift({ id: uid('arc'), kind, item: clone(item), deletedAt: new Date().toISOString(), ...extra });
            const kept = kind === 'quest' ? (item.tasks || []).reduce((n, t) => n + this.realMinutesFor(t.id), 0) : this.realMinutesFor(item.id);
            const NAMES = { daily: 'Daily', habit: 'Habit', todo: 'To-Do', quest: 'Quest', task: 'Quest task' };
            this._changeLog('delete', `Deleted ${NAMES[kind]} "${item.label || item.title}"`, `${fmtMin(kept)} real time kept · in the Archive`);
        },
        removeDailyTask(id) { const it = (this.state && this.state.dailyTasks || []).find(x => x.id === id); const r = orig.removeDailyTask.call(this, id); if (r && it) { this._archive('daily', it); this.save(); } return r; },
        removeHabit(id) { const it = (this.state && this.state.habits || []).find(x => x.id === id); const r = orig.removeHabit.call(this, id); if (r && it) { this._archive('habit', it); this.save(); } return r; },
        removeTodo(id) { const it = (this.state && this.state.todos || []).find(x => x.id === id); const r = orig.removeTodo.call(this, id); if (r && it) { this._archive('todo', it); this.save(); } return r; },
        removeTask(questId, taskId) {
            const { task, quest } = this._findTask('quest', taskId, questId);
            const r = orig.removeTask.call(this, questId, taskId);
            if (r && task) { this._archive('task', task, { questId, questTitle: quest && quest.title }); this.save(); }
            return r;
        },
        removeQuest(id) { const it = (this.state && this.state.quests || []).find(x => x.id === id); const r = orig.removeQuest.call(this, id); if (r && it) { this._archive('quest', it); this.save(); } return r; },
        restoreArchived(arcId) {
            const s = this._rt();
            const a = s && s.archive.find(x => x.id === arcId);
            if (!a) return { ok: false, error: 'Not in the Archive.' };
            const LIST = { daily: 'dailyTasks', habit: 'habits', todo: 'todos', quest: 'quests' };
            if (a.kind === 'task') {
                const q = (s.quests || []).find(x => x.id === a.questId);
                if (!q) return { ok: false, error: 'Its quest was deleted. Restore the quest first.' };
                q.tasks = q.tasks || [];
                if (!q.tasks.some(t => t.id === a.item.id)) q.tasks.push(a.item);
                this._updateQuestCompletionState && this._updateQuestCompletionState(q);
            } else {
                const k = LIST[a.kind];
                s[k] = s[k] || [];
                if (!s[k].some(x => x.id === a.item.id)) s[k].push(a.item);
            }
            s.archive = s.archive.filter(x => x !== a);
            this._changeLog('restore', `Restored "${a.item.label || a.item.title}" from the Archive`, 'Back on your lists with its history');
            this.save();
            this._syncLevelUpBees();
            return { ok: true };
        },

        // ---- edits that change XP (never real time) ----
        _noteEdit(task, before) {
            if (!task) return;
            const bits = [];
            if (before.label !== task.label) bits.push(`renamed "${before.label}" → "${task.label}"`);
            if ((before.minutes || null) !== (task.minutes || null)) bits.push(`planned ${before.minutes ? fmtMin(before.minutes) : 'auto'} → ${task.minutes ? fmtMin(task.minutes) : 'auto'}`);
            if ((before.difficulty || null) !== (task.difficulty || null)) bits.push(`difficulty ${before.difficulty || '—'} → ${task.difficulty || '—'}`);
            if (bits.length) this._changeLog('edit', `Edited "${task.label}": ${bits.join(', ')}`, 'Planned XP changed. Real time not touched.');
        },
        updateDailyTask(id, patch) { const t = (this.state && this.state.dailyTasks || []).find(x => x.id === id); const b = t && { label: t.label, minutes: t.minutes, difficulty: t.difficulty }; const r = orig.updateDailyTask.call(this, id, patch); if (r && b) { this._noteEdit(t, b); this.save(); } return r; },
        updateHabit(id, patch) { const t = (this.state && this.state.habits || []).find(x => x.id === id); const b = t && { label: t.label, minutes: t.minutes, difficulty: t.difficulty }; const r = orig.updateHabit.call(this, id, patch); if (r && b) { this._noteEdit(t, b); this.save(); } return r; },
        updateTodo(id, patch) { const t = (this.state && this.state.todos || []).find(x => x.id === id); const b = t && { label: t.label, minutes: t.minutes, difficulty: t.difficulty }; const r = orig.updateTodo.call(this, id, patch); if (r && b) { this._noteEdit(t, b); this.save(); } return r; },
        updateTask(questId, taskId, patch) { const { task } = this._findTask('quest', taskId, questId); const b = task && { label: task.label, minutes: task.minutes, difficulty: task.difficulty }; const r = orig.updateTask.call(this, questId, taskId, patch); if (r && b) { this._noteEdit(task, b); this.save(); } return r; },
    });
})();

// ============================================================================
// XP DEBUFF (Nov 7 2026, Craft; Batch 24)
// While the Queen's faint debuff is active, XP you earn is cut by 20%. XP is worked
// out from your tasks, so the cut is kept as a small negative entry in state.bonusXP
// (key "debuff:..."), one per check-off. Unchecking that same check-off takes its
// entry away again. Wraps the four check-off methods; nothing else changes.
// ============================================================================
(() => {
    if (typeof DatabaseManager === 'undefined') return;   // tests that load only part of this file
    const P = DatabaseManager.prototype;
    ['toggleDailyTask', 'toggleTodoComplete', 'toggleTask', 'bumpHabit'].forEach(name => {
        const orig = P[name];
        if (typeof orig !== 'function') return;
        P[name] = function (...args) {
            if (!this.state) return orig.apply(this, args);
            const before = this._rawXP();
            const result = orig.apply(this, args);
            try {
                const gain = this._rawXP() - before;
                const src = `${name}:${args.join(':')}`;
                const list = Array.isArray(this.state.bonusXP) ? this.state.bonusXP : (this.state.bonusXP = []);
                if (gain > 0) {
                    const buff = this.getXPBuffs().find(b => b.kind === 'debuff');
                    if (buff) {
                        const cut = Math.round(gain * (-buff.pct / 100));
                        if (cut > 0) { list.push({ key: `debuff:${Date.now()}:${list.length}`, src, date: todayISO(), xp: -cut, why: buff.id }); this.save(); }
                    }
                } else if (gain < 0) {
                    // Unchecked: give back the cut that check-off paid.
                    for (let i = list.length - 1; i >= 0; i--) {
                        if (String(list[i].key).startsWith('debuff:') && list[i].src === src) { list.splice(i, 1); this.save(); break; }
                    }
                }
            } catch (error) { console.error('XP debuff failed', error); }
            return result;
        };
    });
})();

const Vault = new DatabaseManager();
