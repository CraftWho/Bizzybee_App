console.log("/// PROFILE PROTOCOLS INITIALIZED ///");

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const user = Vault.getUser();

    if (!user) {
        console.warn("Profile: No Vault data available yet.");
        return;
    }

    document.getElementById('user-class').textContent = user.class;
    document.getElementById('user-level').textContent = user.level;
    document.getElementById('user-title').textContent = user.title;
    document.getElementById('user-dp').textContent = user.totalDP.toLocaleString();
    document.getElementById('next-level-dp').textContent = user.nextLevelXP.toLocaleString();

    const progressPercentage = (user.currentXP / user.nextLevelXP) * 100;
    const progressBar = document.getElementById('dp-progress-bar');

    setTimeout(() => {
        progressBar.style.width = `${progressPercentage}%`;
    }, 300);
});
