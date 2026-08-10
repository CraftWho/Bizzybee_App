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

// Resolves the avatar image, in priority order: a custom photo stored in
// the Vault (see db.js's getProfilePhoto - this is what makes the photo
// actually travel with a Full Save export/import) - then the old static-
// file convention (src/assets/images/me.jpg, gitignored, real photo on
// your own machine only) - then the generic placeholder if neither exists.
// Handled entirely in JS now (not an inline onerror= attribute) so this
// same logic can be re-run cleanly after an upload or a Remove Photo click,
// without fighting over whether the inline handler already fired once.
function applyAvatarImage() {
    const img = document.getElementById('profile-avatar-img');
    const removeBtn = document.getElementById('avatar-remove-btn');
    const customPhoto = Vault.getProfilePhoto();

    if (customPhoto) {
        img.onerror = null;
        img.src = customPhoto;
        removeBtn.hidden = false;
        return;
    }

    removeBtn.hidden = true;
    img.onerror = () => { img.onerror = null; img.src = '../../assets/images/avatar-placeholder.svg'; };
    img.src = '../../assets/images/me.jpg';
}

// Reads the picked file, draws it onto an offscreen canvas capped at
// maxDim on its longest edge, and re-exports as a JPEG data URL. This is
// what keeps a phone-camera-sized photo (often several MB) from bloating
// localStorage or a Full Save export file - a typical result here lands
// well under 200KB, against a localStorage quota that's usually 5-10MB.
function downscaleImageFile(file, maxDim = 640, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    if (width >= height) {
                        height = Math.round(height * (maxDim / width));
                        width = maxDim;
                    } else {
                        width = Math.round(width * (maxDim / height));
                        height = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('not-an-image'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('read-failed'));
        reader.readAsDataURL(file);
    });
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

    applyAvatarImage();

    // Edit button no longer opens the file picker directly - it opens this
    // small menu instead, so Change/Remove are both reachable from one
    // control rather than a permanently-visible separate "Remove photo"
    // link cluttering the card. Only "Change Photo" (below) ever triggers
    // the actual hidden file input.
    const editBtn = document.getElementById('avatar-edit-btn');
    const editMenu = document.getElementById('avatar-edit-menu');
    const editWrap = document.getElementById('avatar-edit-btn').closest('.avatar-edit-wrap');

    function closeAvatarMenu() { editMenu.hidden = true; }
    function toggleAvatarMenu() { editMenu.hidden = !editMenu.hidden; }

    editBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleAvatarMenu();
    });

    // Outside click / Escape closes the menu - standard popover behavior,
    // needed since this is a plain absolutely-positioned div, not a native
    // <dialog> or <details> element.
    document.addEventListener('click', (event) => {
        if (!editMenu.hidden && !editWrap.contains(event.target)) closeAvatarMenu();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeAvatarMenu();
    });

    document.getElementById('avatar-change-btn').addEventListener('click', () => {
        closeAvatarMenu();
        document.getElementById('profile-photo-input').click();
    });

    document.getElementById('profile-photo-input').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            Toast.show("That doesn't look like an image file.", 'negative');
            event.target.value = '';
            return;
        }

        try {
            const dataUrl = await downscaleImageFile(file);
            Vault.setProfilePhoto(dataUrl);
            applyAvatarImage();
            Toast.show("🖼️ Photo updated - it'll travel with your Full Save export now.", 'positive');
        } catch (error) {
            Toast.show('Could not process that image.', 'negative');
        } finally {
            event.target.value = '';
        }
    });

    document.getElementById('avatar-remove-btn').addEventListener('click', () => {
        closeAvatarMenu();
        if (!confirm("Remove your custom photo? This falls back to the default avatar.")) return;
        Vault.clearProfilePhoto();
        applyAvatarImage();
        Toast.show('Photo removed.', 'negative');
    });

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
