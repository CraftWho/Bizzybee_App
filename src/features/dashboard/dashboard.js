console.log("/// DASHBOARD PROTOCOLS INITIALIZED ///");

// Sample skill breakdown until a real skills schema exists in data.json.
// TARGET_DP is the ceiling used to compute the fill percentage per node.
const TARGET_DP = 1000;
const SKILL_CATEGORIES = [
    {
        icon: '🏗️',
        name: '[HTML] Structure',
        currentDP: 440,
        gradient: 'linear-gradient(90deg, var(--gold-end), var(--gold-start))',
        shadow: '0 0 10px var(--gold-glow)'
    },
    {
        icon: '🎨',
        name: '[CSS] Presentation',
        currentDP: 390,
        gradient: 'linear-gradient(90deg, #8b0000, var(--danger-red))',
        shadow: '0 0 10px rgba(255, 68, 68, 0.5)'
    },
    {
        icon: '⚡',
        name: '[JS] Logic & Engine',
        currentDP: 40,
        gradient: 'linear-gradient(90deg, #444, #aaa)',
        shadow: 'none'
    }
];

function renderSkillMatrix() {
    const container = document.getElementById('skill-container');
    if (!container) return;

    container.innerHTML = SKILL_CATEGORIES.map(skill => {
        const displayDP = Math.min(skill.currentDP, TARGET_DP);
        const percentage = (displayDP / TARGET_DP) * 100;

        return `
            <div class="skill-row">
                <div class="skill-labels">
                    <span>${skill.icon} ${skill.name}</span>
                    <span class="text-gold">${displayDP} / ${TARGET_DP}</span>
                </div>
                <div class="hive-progress-track">
                    <div class="hive-progress-fill"
                         data-target-width="${percentage}%"
                         style="width: 0%; background: ${skill.gradient}; box-shadow: ${skill.shadow};"></div>
                </div>
            </div>
        `;
    }).join('');

    setTimeout(() => {
        container.querySelectorAll('.hive-progress-fill').forEach(fill => {
            fill.style.width = fill.getAttribute('data-target-width');
        });
    }, 150);
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const user = Vault.getUser();

    if (user) {
        document.getElementById('dash-total-dp').textContent = user.totalDP.toLocaleString();
        document.getElementById('dash-level').textContent = user.level;
    }

    renderSkillMatrix();
});
