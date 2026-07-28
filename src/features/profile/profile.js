console.log("/// PROFILE PROTOCOLS INITIALIZED ///");

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
    document.getElementById('next-level-dp').textContent = user.nextLevelXP.toLocaleString();

    // (user.skills || []) guards a stale cached user from before this field
    // existed - additive content field, not worth a schema bump/reset for.
    const skillsList = document.getElementById('skills-unlocked-list');
    const skills = user.skills || [];
    skillsList.innerHTML = skills.length > 0
        ? skills.map(skill => `<li>${escapeHTML(skill)}</li>`).join('')
        : '<li class="quest-empty-state">No skills unlocked yet.</li>';

    const progressPercentage = (user.currentXP / user.nextLevelXP) * 100;
    const progressBar = document.getElementById('dp-progress-bar');

    setTimeout(() => {
        progressBar.style.width = `${progressPercentage}%`;
    }, 300);

    HiveMind.setActions(baseHiveMindActions());
});
