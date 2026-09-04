console.log("/// SKILL TREE PROTOCOLS INITIALIZED ///");

// Not the same escapeHTML/escapeAttr as other pages - kept private to this
// file, same reasoning as map.js's escapeMapAttr.
function escapeSkillHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Builds one <li> (node + label + its own children <ul>, recursively) from
// the flat SKILL_TREE_CATALOG + parentId edges. This is what replaces the
// old project's hand-authored nested <ul><li> markup - add a new catalog
// entry with a parentId and it just appears in the right branch, no HTML
// to hand-edit.
function buildSkillNodeHTML(skillId, skillTree) {
    const entry = skillTree.find(s => s.id === skillId);
    if (!entry) return '';

    const isRoot = entry.parentId === null;
    const rootClass = isRoot ? ' root-node' : '';
    const lockedClass = entry.unlocked ? '' : ' locked';
    const children = skillTree.filter(s => s.parentId === skillId);

    const childrenHTML = children.length
        ? `<ul>${children.map(c => buildSkillNodeHTML(c.id, skillTree)).join('')}</ul>`
        : '';

    return `
        <li>
            <button class="skill-node${rootClass}${lockedClass}" data-skill-id="${entry.id}">
                <span class="icon">${entry.icon}</span>
            </button>
            <div class="node-label">${escapeSkillHTML(entry.name)}</div>
            ${childrenHTML}
        </li>
    `;
}

function renderSkillTree() {
    const skillTree = Vault.getSkillTree();
    const root = skillTree.find(s => s.parentId === null);
    const treeEl = document.getElementById('skill-tree-tree');
    if (!root) {
        treeEl.innerHTML = '';
        return;
    }
    treeEl.innerHTML = `<ul>${buildSkillNodeHTML(root.id, skillTree)}</ul>`;
}

// Click-to-inspect (every node) + click-to-unlock (locked nodes whose
// prerequisite is already unlocked only). Unlike the old project, locked
// nodes stay clickable - the point now is that you CAN act on them, not
// just read a static "this is locked" message.
function showSkill(skillId) {
    const skillTree = Vault.getSkillTree();
    const entry = skillTree.find(s => s.id === skillId);
    const descEl = document.getElementById('skill-description');
    const actionEl = document.getElementById('skill-action');
    if (!entry) return;

    actionEl.innerHTML = '';

    if (entry.unlocked) {
        descEl.textContent = entry.description;
        return;
    }

    const parent = entry.parentId ? skillTree.find(s => s.id === entry.parentId) : null;
    const readyToUnlock = !entry.parentId || (parent && parent.unlocked);

    if (readyToUnlock) {
        descEl.textContent = `${entry.name} is locked, but its prerequisite is already mastered - ready to unlock.`;
        actionEl.innerHTML = `<button class="skill-unlock-btn" id="skill-unlock-btn">🌿 Mark Mastered</button>`;
        document.getElementById('skill-unlock-btn').addEventListener('click', () => {
            const unlocked = Vault.unlockSkill(skillId);
            if (unlocked) {
                Toast.show(`🌿 ${unlocked.name} unlocked!`, 'positive');
                renderSkillTree();
                showSkill(skillId);
            }
        });
    } else {
        descEl.textContent = `This skill is currently locked. You must first unlock "${parent ? parent.name : 'its prerequisite'}".`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    renderSkillTree();
    Waggle.setActions(baseWaggleActions());

    // Delegated so newly-rendered nodes (after an unlock re-render) never
    // need their own listener re-attached.
    document.getElementById('skill-tree-tree').addEventListener('click', (e) => {
        const btn = e.target.closest('.skill-node');
        if (!btn) return;
        showSkill(btn.dataset.skillId);
    });
});
