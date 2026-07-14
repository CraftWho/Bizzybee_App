console.log("/// VAULT (DB) INITIALIZED ///");

class DatabaseManager {
    constructor() {
        this.dbName = 'BizzybeeVault';
        this.storageKey = 'bizzybee_user_data';
        this.state = null;
    }

    // 1. Boot up the database
    async init() {
        const existingData = localStorage.getItem(this.storageKey);

        if (existingData) {
            console.log("Vault: Local data found. Loading state...");
            this.state = JSON.parse(existingData);
        } else {
            console.log("Vault: No local data found. Fetching Blueprint...");
            await this.loadBlueprint();
        }
        return this.state;
    }

    // 2. Fetch the default data.json if starting fresh
    async loadBlueprint() {
        try {
            const response = await fetch('../../core/data.json'); 
            const defaultData = await response.json();
            this.state = defaultData;
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

    // 4. Getter
    getUser() {
        return this.state ? this.state.user : null;
    }

    // 5. Logic: Add Points
    addDP(amount) {
        if (!this.state) return;
        this.state.user.currentXP += amount;
        this.state.user.totalDP += amount;
        
        if (this.state.user.currentXP >= this.state.user.nextLevelXP) {
            this.state.user.level += 1;
            this.state.user.currentXP -= this.state.user.nextLevelXP;
            this.state.user.nextLevelXP = Math.floor(this.state.user.nextLevelXP * 1.5);
        }
        this.save();
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