console.log("/// STUDY PLUGIN PROTOCOLS INITIALIZED ///");

// A running queue of courses/topics/goals, same shape as the old Codex
// tracker's studyQueue (topic/type/priority/status/link) - see db.js's
// "5l" section for the Vault methods. Ships empty; this is purely
// user-authored local content, same as Dictionary/Calendar events.

function escapeStudyHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

function escapeStudyAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const STUDY_PRIORITY_DOT_COLOR = { high: 'red', medium: 'yellow', low: 'green' };
const STUDY_STATUS_ORDER = ['In Progress', 'Pending', 'Complete'];

function renderStudyList() {
    const container = document.getElementById('study-list');
    const items = Vault.getStudyQueue();

    if (items.length === 0) {
        container.innerHTML = '<p class="study-empty-state">Nothing queued yet - add your first topic above.</p>';
        return;
    }

    const byStatus = {};
    items.forEach(item => {
        const status = STUDY_STATUS_ORDER.includes(item.status) ? item.status : 'Pending';
        if (!byStatus[status]) byStatus[status] = [];
        byStatus[status].push(item);
    });

    const priorityRank = { High: 0, Medium: 1, Low: 2 };
    const groups = STUDY_STATUS_ORDER.filter(s => byStatus[s] && byStatus[s].length > 0);

    container.innerHTML = groups.map(status => {
        const groupItems = byStatus[status].sort((a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1));
        return `
            <div class="study-status-group">
                <h4 class="study-status-heading">${escapeStudyHTML(status)}</h4>
                ${groupItems.map(item => `
                    <div class="study-item-row" data-item-id="${item.id}">
                        ${StatusDot.html(STUDY_PRIORITY_DOT_COLOR[(item.priority || 'medium').toLowerCase()] || 'gray', { title: `${item.priority} priority`, large: true })}
                        <div class="study-item-main">
                            ${item.link
                                ? `<a class="study-item-topic study-item-topic--link" href="${escapeStudyAttr(item.link)}" target="_blank" rel="noopener noreferrer">${escapeStudyHTML(item.topic)}</a>`
                                : `<span class="study-item-topic">${escapeStudyHTML(item.topic)}</span>`
                            }
                            <span class="study-item-type">${escapeStudyHTML(item.type)}</span>
                        </div>
                        <select class="study-item-status-select" data-role="status">
                            ${STUDY_STATUS_ORDER.map(s => `<option value="${s}"${s === status ? ' selected' : ''}>${s}</option>`).join('')}
                        </select>
                        <button type="button" class="study-item-remove" data-role="remove" aria-label="Remove from queue">🗑️</button>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-role="status"]').forEach(select => {
        select.addEventListener('change', () => {
            const row = select.closest('.study-item-row');
            Vault.updateStudyItem(row.dataset.itemId, { status: select.value });
            renderStudyList();
        });
    });

    container.querySelectorAll('[data-role="remove"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('.study-item-row');
            const item = items.find(i => i.id === row.dataset.itemId);
            if (!item) return;
            if (!confirm(`Remove "${item.topic}" from your queue?`)) return;
            Vault.removeStudyItem(item.id);
            renderStudyList();
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();

    // Same "renders even if reached directly without installing first"
    // courtesy as the Calendar plugin - see calendar.js.
    const installed = typeof Plugins !== 'undefined' && Plugins.isEnabled('study');
    document.getElementById('study-not-installed').hidden = installed;
    document.getElementById('study-app').hidden = !installed;

    if (!installed) return;

    renderStudyList();
    Waggle.setActions(baseWaggleActions());

    document.getElementById('study-add-btn').addEventListener('click', () => {
        const topicInput = document.getElementById('study-topic-input');
        const typeSelect = document.getElementById('study-type-select');
        const prioritySelect = document.getElementById('study-priority-select');
        const linkInput = document.getElementById('study-link-input');

        const topic = topicInput.value.trim();
        if (!topic) {
            Toast.show('Give it a topic first.', 'negative');
            return;
        }

        const added = Vault.addStudyItem({
            topic,
            type: typeSelect.value,
            priority: prioritySelect.value,
            link: linkInput.value.trim()
        });

        if (!added) {
            Toast.show('Could not add that to the queue.', 'negative');
            return;
        }

        Toast.show(`🎓 Added "${added.topic}" to your queue`, 'positive');
        topicInput.value = '';
        linkInput.value = '';
        renderStudyList();
    });
});
