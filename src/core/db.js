console.log("/// VAULT (DB) INITIALIZED ///");

// Bump this whenever data.json/data.personal.json's shape changes (new
// fields, renamed fields, etc.). A cached Vault from an older version gets
// discarded and re-fetched automatically - no manual localStorage clearing.
const VAULT_SCHEMA_VERSION = 6;

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
            // blueprint content either.
            this.state.colony = { bees: [] };
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

        task.completed = !task.completed;
        // Full timestamp (not just the date) so the UI can show exactly when
        // a task was actually checked off, not just which day. Quest-level
        // dateCompleted (below) stays date-only - this is scoped to tasks.
        task.dateCompleted = task.completed ? new Date().toISOString() : null;

        this._updateQuestCompletionState(quest);

        this.save();
        return quest;
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

        if (index === -1) {
            task.completedDates.push(today);
        } else {
            task.completedDates.splice(index, 1);
        }

        this.save();
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
