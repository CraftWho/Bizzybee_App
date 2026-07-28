console.log("/// MD VIEWER MODULE ONLINE ///");

// Renders a markdown file inline as a modal - not a page navigation.
// Builds on the generic modal shell in src/core/modal/ (.modal-overlay,
// .modal-box, .modal-btn-accent, .modal-textarea, etc.) - only markdown
// rendering and its two edit modes are specific to this module.
//
// If storageKey is given, two edit modes let the user rewrite the log and
// save it to localStorage; the saved copy takes over from the source file
// on every future open, with no server or VS Code round-trip required.
//
// - 'dev-edit': the full raw markdown, unrestricted.
// - 'edit': the same text, but everything up to (and including) the first
//   "---" divider renders locked/read-only - that's the title/stats block
//   quest logs open with. Only the narrative below it is editable.
const MDViewer = {
    overlay: null,
    currentStorageKey: null,
    rawText: '',
    mode: 'view',
    actions: [],
    mountExtra: null,

    // actions is optional: [{ label, onClick }]. MDViewer stays generic - it
    // has no idea what an action does, the caller (e.g. Quests) owns that.
    // mountExtra is optional: a function(container) handed a DOM node above
    // the markdown body, fully owned by the caller (e.g. a task checklist).
    // MDViewer never looks inside it.
    async open({ title, filePath, storageKey, actions = [], mountExtra = null }) {
        this.currentStorageKey = storageKey || null;
        this.actions = actions;
        this.mountExtra = mountExtra;
        this.mode = 'view';

        const saved = this.currentStorageKey ? localStorage.getItem(this.currentStorageKey) : null;

        if (saved !== null) {
            this.rawText = saved;
        } else if (filePath) {
            try {
                const response = await fetch(filePath);
                this.rawText = response.ok ? await response.text() : '*Log not found.*';
            } catch (error) {
                this.rawText = '*Log not found.*';
            }
        } else {
            this.rawText = '*No log linked to this quest yet.*';
        }

        this.build(title);
    },

    build(title) {
        this.close();

        const actionsHTML = this.actions.map((action, index) => `
            <button class="modal-btn-accent" data-action-index="${index}">${action.label}</button>
        `).join('');

        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `
            <div class="modal-box">
                <div class="modal-header">
                    <span class="modal-title">${title}</span>
                    <button class="modal-close" aria-label="Close">✕</button>
                </div>
                <div class="md-viewer-extra"></div>
                <div class="modal-body"></div>
                <div class="modal-footer">
                    <div class="modal-footer-actions">${actionsHTML}</div>
                    <div class="modal-footer-controls">
                        <button class="md-viewer-edit-btn">✏️ Edit</button>
                        <button class="md-viewer-dev-edit-btn modal-btn-muted">🛠️ Dev Edit</button>
                        <button class="md-viewer-preview-btn">👁️ Preview</button>
                        <button class="md-viewer-save">💾 Save</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);

        this.overlay.addEventListener('click', (event) => {
            if (event.target === this.overlay) this.close();
        });
        this.overlay.querySelector('.modal-close').addEventListener('click', () => this.close());
        this.overlay.querySelector('.md-viewer-edit-btn').addEventListener('click', () => this.enterMode('edit'));
        this.overlay.querySelector('.md-viewer-dev-edit-btn').addEventListener('click', () => this.enterMode('dev-edit'));
        this.overlay.querySelector('.md-viewer-preview-btn').addEventListener('click', () => this.returnToView());
        this.overlay.querySelector('.md-viewer-save').addEventListener('click', () => this.save());
        this.overlay.querySelectorAll('[data-action-index]').forEach((btn) => {
            const action = this.actions[Number(btn.dataset.actionIndex)];
            btn.addEventListener('click', () => action.onClick());
        });

        if (this.mountExtra) {
            this.mountExtra(this.overlay.querySelector('.md-viewer-extra'));
        }

        this.render();
    },

    // Splits raw text at the first "---" divider. Everything up to and
    // including it is "locked" (title, ID, DP, status, dates); everything
    // after is the editable narrative.
    splitFriendlyRegions(text) {
        const dividerMatch = text.match(/\n-{3,}\s*\n/);
        if (!dividerMatch) return { locked: '', editable: text };

        const splitIndex = dividerMatch.index + dividerMatch[0].length;
        return { locked: text.slice(0, splitIndex), editable: text.slice(splitIndex) };
    },

    render() {
        const body = this.overlay.querySelector('.modal-body');
        const editBtn = this.overlay.querySelector('.md-viewer-edit-btn');
        const devEditBtn = this.overlay.querySelector('.md-viewer-dev-edit-btn');
        const previewBtn = this.overlay.querySelector('.md-viewer-preview-btn');
        const saveBtn = this.overlay.querySelector('.md-viewer-save');
        const canEdit = !!this.currentStorageKey;

        editBtn.style.display = this.mode === 'view' && canEdit ? 'inline-block' : 'none';
        devEditBtn.style.display = this.mode === 'view' && canEdit ? 'inline-block' : 'none';
        previewBtn.style.display = this.mode !== 'view' ? 'inline-block' : 'none';
        saveBtn.style.display = this.mode !== 'view' && canEdit ? 'inline-block' : 'none';

        if (this.mode === 'view') {
            body.innerHTML = `<div class="md-viewer-rendered">${marked.parse(this.rawText)}</div>`;
        } else if (this.mode === 'dev-edit') {
            body.innerHTML = '<textarea class="modal-textarea"></textarea>';
            body.querySelector('.modal-textarea').value = this.rawText;
        } else if (this.mode === 'edit') {
            const { locked, editable } = this.splitFriendlyRegions(this.rawText);
            body.innerHTML = `
                ${locked ? `
                    <div class="md-viewer-rendered md-viewer-locked-region">${marked.parse(locked)}</div>
                    <p class="md-viewer-locked-note">🔒 Title and stats above are locked here - use Dev Edit if they need to change.</p>
                ` : ''}
                <textarea class="modal-textarea"></textarea>
            `;
            body.querySelector('.modal-textarea').value = editable;
        }
    },

    enterMode(mode) {
        this.mode = mode;
        this.render();
    },

    // Captures whatever is in the textarea back into rawText, without saving.
    captureTextarea() {
        const textarea = this.overlay.querySelector('.modal-textarea');
        if (!textarea) return;

        if (this.mode === 'edit') {
            const { locked } = this.splitFriendlyRegions(this.rawText);
            this.rawText = locked + textarea.value;
        } else if (this.mode === 'dev-edit') {
            this.rawText = textarea.value;
        }
    },

    returnToView() {
        this.captureTextarea();
        this.mode = 'view';
        this.render();
    },

    save() {
        this.captureTextarea();

        if (this.currentStorageKey) {
            localStorage.setItem(this.currentStorageKey, this.rawText);
        }

        this.mode = 'view';
        this.render();
    },

    close() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
};
