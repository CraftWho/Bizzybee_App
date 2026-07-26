console.log("/// VAULT (DB) INITIALIZED ///");

// Bump this whenever data.json/data.personal.json's shape changes (new
// fields, renamed fields, etc.). A cached Vault from an older version gets
// discarded and re-fetched automatically - no manual localStorage clearing.
const VAULT_SCHEMA_VERSION = 2;

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

    // 2. Fetch the default data.json if starting fresh
    // data.personal.json is gitignored - if it exists (your own machine), it wins.
    // Everyone else silently falls back to the generic data.json.
    async loadBlueprint() {
        // Pages under src/features/* are two levels deep; the root index.html is not.
        const rootPrefix = window.location.pathname.includes('features') ? '../../..' : '.';

        try {
            const personalResponse = await fetch(`${rootPrefix}/src/core/data.personal.json`);
            if (personalResponse.ok) {
                this.state = await personalResponse.json();
                this.state.schemaVersion = VAULT_SCHEMA_VERSION;
                this.save();
                console.log("Vault: Personal blueprint loaded and secured.");
                return;
            }
        } catch (error) {
            // No personal blueprint on this machine - fall through to the generic one.
        }

        try {
            const response = await fetch(`${rootPrefix}/src/core/data.json`);
            this.state = await response.json();
            this.state.schemaVersion = VAULT_SCHEMA_VERSION;
            this.save();
            console.log("Vault: Blueprint loaded and secured.");
        } catch (error) {
            console.error("Vault Error: Could not load data.json blueprint.", error);
        }
    }

    // 3. Save current state to the browser
    save() {
        if (this.state) {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        }
    }

    // 4. Getters
    getUser() {
        return this.state ? this.state.user : null;
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

    // 5. Logic: Add Points (amount can be negative, e.g. un-checking a task)
    addDP(amount) {
        if (!this.state) return;
        this.state.user.currentXP += amount;
        this.state.user.totalDP += amount;

        if (this.state.user.currentXP >= this.state.user.nextLevelXP) {
            this.state.user.level += 1;
            this.state.user.currentXP -= this.state.user.nextLevelXP;
            this.state.user.nextLevelXP = Math.floor(this.state.user.nextLevelXP * 1.5);
        }

        // Simple floor - no level-down mechanic yet, just avoid negative totals.
        if (this.state.user.currentXP < 0) this.state.user.currentXP = 0;
        if (this.state.user.totalDP < 0) this.state.user.totalDP = 0;

        this.save();
    }

    // 5b. Logic: Toggle a quest's task, awarding/revoking its DP in real time.
    // When every task on a quest is done, the quest auto-completes; unchecking
    // any task on a completed quest re-opens it.
    toggleTask(questId, taskId) {
        if (!this.state) return null;

        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest || !quest.tasks) return null;

        const task = quest.tasks.find(t => t.id === taskId);
        if (!task) return null;

        task.completed = !task.completed;
        task.dateCompleted = task.completed ? new Date().toISOString().slice(0, 10) : null;

        this.addDP(task.completed ? task.dp : -task.dp);

        quest.status = quest.tasks.every(t => t.completed) ? 'completed' : 'active';

        this.save();
        return quest;
    }

    // 5c. Logic: Task management (add/edit/remove) - the LLM or the user can
    // both shape a quest's tasks this way, not just check them off.
    addTask(questId, { label, dp }) {
        if (!this.state) return null;

        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest) return null;

        if (!quest.tasks) quest.tasks = [];
        quest.tasks.push({
            id: `${questId.toLowerCase()}-t${Date.now()}`,
            label,
            dp: Number(dp) || 0,
            completed: false,
            dateCompleted: null
        });

        this.save();
        return quest;
    }

    updateTask(questId, taskId, { label, dp }) {
        if (!this.state) return null;

        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest || !quest.tasks) return null;

        const task = quest.tasks.find(t => t.id === taskId);
        if (!task) return null;

        if (label !== undefined) task.label = label;
        if (dp !== undefined) task.dp = Number(dp) || 0;

        this.save();
        return quest;
    }

    removeTask(questId, taskId) {
        if (!this.state) return null;

        const quest = (this.state.quests || []).find(q => q.id === questId);
        if (!quest || !quest.tasks) return null;

        const task = quest.tasks.find(t => t.id === taskId);
        if (!task) return null;

        // Revoke any DP this task had already earned before removing it.
        if (task.completed) this.addDP(-task.dp);

        quest.tasks = quest.tasks.filter(t => t.id !== taskId);
        quest.status = quest.tasks.length > 0 && quest.tasks.every(t => t.completed) ? 'completed' : 'active';

        this.save();
        return quest;
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