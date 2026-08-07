console.log("/// PROFILE PROTOCOLS INITIALIZED ///");

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// icon/label lookup for awarded materials - MATERIAL_CATALOG is a plain
// global from db.js (loaded before this file), same as Eevee/Vault.
function materialDisplay(materialId) {
    const material = (typeof MATERIAL_CATALOG !== 'undefined' ? MATERIAL_CATALOG : []).find(m => m.id === materialId);
    return material ? `${material.icon} ${material.label}` : materialId;
}

// Same shared, gated LevelBar the Dashboard's Skill Mastery matrix and Home
// page use (src/core/level-bar/) instead of this page's own static fill
// bar. Duplicated from home.js rather than factored into a shared helper -
// this app keeps each feature page self-contained (see dailies.css's own
// note on the same tradeoff), and it's a small enough block that two
// copies is simpler than a new cross-page module for it.
function characterLevelBarToRows(bar) {
    return [{
        key: 'character',
        icon: '⚡',
        label: 'Character Level',
        levelBadge: `Lv. ${bar.level}`,
        dpIntoLevel: bar.dpIntoLevel,
        cap: bar.cap,
        percentage: bar.percentage,
        maxed: bar.maxed,
        gradient: 'linear-gradient(90deg, var(--gold-end), var(--gold-start))',
        shadow: '0 0 10px var(--gold-glow)'
    }];
}

function formatCharacterLevelReward(reward) {
    const lines = [];

    if (reward.awardedBees.length > 0) {
        const label = reward.awardedBees.length === 1 ? escapeHTML(reward.awardedBees[0].name) : `${reward.awardedBees.length} bees`;
        lines.push(`🐝 ${label} joined your colony!`);
    }
    if (reward.ticketsGranted > 0) {
        lines.push(`🎟️ +${reward.ticketsGranted} Gacha Ticket${reward.ticketsGranted === 1 ? '' : 's'}`);
    }
    if (reward.awardedMaterials.length > 0) {
        const counts = {};
        reward.awardedMaterials.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
        Object.entries(counts).forEach(([id, count]) => lines.push(`${materialDisplay(id)} +${count}`));
    }
    if (lines.length === 0) lines.push('Onward!');

    return { title: `Character reached Level ${reward.newLevel}!`, lines };
}

function renderCharacterLevelBar() {
    const container = document.getElementById('profile-level-bar');
    if (!container) return;

    LevelBar.renderRows(container, {
        getRows: () => characterLevelBarToRows(Vault.getCharacterLevelBar()),
        onLevelUp: async () => {
            const reward = await Vault.levelUpCharacterBar();
            return reward ? formatCharacterLevelReward(reward) : null;
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const user = Vault.getUser();

    if (!user) {
        console.warn("Profile: No Vault data available yet.");
        return;
    }

    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-class').textContent = user.class;
    document.getElementById('user-level').textContent = user.level;
    document.getElementById('user-title').textContent = user.title;
    document.getElementById('user-dp').textContent = user.totalDP.toLocaleString();

    renderCharacterLevelBar();

    // (user.skills || []) guards a stale cached user from before this field
    // existed - additive content field, not worth a schema bump/reset for.
    const skillsList = document.getElementById('skills-unlocked-list');
    const skills = user.skills || [];
    skillsList.innerHTML = skills.length > 0
        ? skills.map(skill => `<li>${escapeHTML(skill)}</li>`).join('')
        : '<li class="quest-empty-state">No skills unlocked yet.</li>';

    // Projects/service record - blueprint content (see db.js's
    // getProfileExtras), so the generic data.json ships placeholder text
    // and only a real data.personal.json shows actual project history.
    const { projects, serviceRecord } = Vault.getProfileExtras();

    const projectGrid = document.getElementById('profile-project-grid');
    projectGrid.innerHTML = (projects.length > 0 ? projects : [{ name: 'No projects logged yet', status: '' }])
        .map(project => `
            <div class="project-item">
                <h4>${escapeHTML(project.name)}</h4>
                ${project.status ? `<p>${escapeHTML(project.status)}</p>` : ''}
            </div>
        `).join('');

    const serviceRecordList = document.getElementById('profile-service-record');
    serviceRecordList.innerHTML = serviceRecord.length > 0
        ? serviceRecord.map(entry => `<li><span class="log-date">[${escapeHTML(entry.date)}]</span> ${escapeHTML(entry.note)}</li>`).join('')
        : '<li class="quest-empty-state">No service record entries yet.</li>';

    HiveMind.setActions(baseHiveMindActions());
});
