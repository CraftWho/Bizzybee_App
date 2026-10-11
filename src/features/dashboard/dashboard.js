console.log("/// DASHBOARD PROTOCOLS INITIALIZED ///");

// Real skill breakdown now: Vault.getSkillMatrix() derives categories fresh
// from Dictionary terms x completed/tagged Dailies AND completed Quest work
// whose title/objective/task label mentions a Dictionary term by name (see
// computeSkillMatrixXP in db.js). No fixed category list - the palette
// below just rotates by row position so a brand-new category still gets a
// distinct look without needing a hand-picked entry.
//
// The bars themselves (fill/shake/Level Up button/celebration) are the
// shared LevelBar component (src/core/level-bar/) - this file only maps
// Vault's skill data into LevelBar's generic Row/Reward shapes. See
// home.js/profile.js for the character-level bar using that same module.
const SKILL_ICONS = ['🏗️', '🎨', '⚡', '🧠', '🔧', '📐', '🌐', '🛠️', '📊', '🧪'];
const SKILL_STYLES = [
    { gradient: 'linear-gradient(90deg, var(--gold-end), var(--gold-start))', shadow: '0 0 10px var(--gold-glow)' },
    { gradient: 'linear-gradient(90deg, #8b0000, var(--danger-red))', shadow: '0 0 10px rgba(255, 68, 68, 0.5)' },
    { gradient: 'linear-gradient(90deg, #444, #aaa)', shadow: 'none' },
    { gradient: 'linear-gradient(90deg, #1a5276, #3498db)', shadow: '0 0 10px rgba(52, 152, 219, 0.5)' },
    { gradient: 'linear-gradient(90deg, #145a32, #27ae60)', shadow: '0 0 10px rgba(39, 174, 96, 0.5)' }
];

function escapeSkillHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// icon/label lookup for the optional bonus material - MATERIAL_CATALOG is
// a plain global from db.js (loaded before this file), same as Eevee.
function materialDisplay(materialId) {
    const material = (typeof MATERIAL_CATALOG !== 'undefined' ? MATERIAL_CATALOG : []).find(m => m.id === materialId);
    return material ? `${material.icon} ${material.label}` : materialId;
}

function skillMatrixToRows(matrix) {
    return matrix.map((skill, i) => ({
        key: skill.category,
        icon: SKILL_ICONS[i % SKILL_ICONS.length],
        label: escapeSkillHTML(skill.category),
        levelBadge: `Lv. ${skill.level}`,
        xpIntoLevel: skill.xpIntoLevel,
        cap: skill.cap,
        percentage: skill.percentage,
        maxed: skill.maxed,
        gradient: SKILL_STYLES[i % SKILL_STYLES.length].gradient,
        shadow: SKILL_STYLES[i % SKILL_STYLES.length].shadow
    }));
}

function renderSkillMatrix() {
    const container = document.getElementById('skill-container');
    const subtitle = document.getElementById('skill-matrix-subtitle');
    if (!container) return;

    const matrix = Vault.getSkillMatrix();

    if (subtitle) {
        subtitle.textContent = matrix.length
            ? 'Live from Dictionary + Dailies + Quests'
            : 'No skills tracked yet';
    }

    LevelBar.renderRows(container, {
        getRows: () => skillMatrixToRows(Vault.getSkillMatrix()),
        emptyMessage: 'No skills tracked yet - complete a tagged Daily, finish a Quest task that mentions a Dictionary term, or add a term in the Dictionary to get started.',
        onLevelUp: async (category) => {
            const reward = await Vault.levelUpSkill(category);
            if (!reward) return null;

            if (subtitle) subtitle.textContent = 'Live from Dictionary + Dailies + Quests';

            return {
                title: `${escapeSkillHTML(reward.category)} reached Level ${reward.newLevel}!`,
                lines: [
                    `🌼 +${reward.pollen} Pollen`,
                    ...(reward.bonusMaterialId ? [`${materialDisplay(reward.bonusMaterialId)} +1`] : []),
                    '🎟️ +1 Gacha Ticket - unwrap it from the Pollination Chamber'
                ]
            };
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const user = Vault.getUser();

    if (user) {
        document.getElementById('dash-total-xp').textContent = user.totalXP.toLocaleString();
        document.getElementById('dash-level').textContent = user.level;
    }

    renderSkillMatrix();

    Waggle.setActions(baseWaggleActions());
});
