// Nov 24 2026 (Craft): the auto-update switch (src/core/services/web-update/web-update.js).
// On: a ready update loads by itself, safely. Off: it waits for the Update button, as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/core/services/web-update/web-update.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = src.replace(/\nWebUpdate\.start\(\);\s*$/, '\n') + '\nglobalThis.WU = WebUpdate;';

// A tiny Android app: the BeeWeb plugin, the site's version.json, storage, and one page.
function app({ mine = 'v1', remote = 'v2', auto, updateFails = false } = {}) {
    const store = new Map();
    if (auto !== undefined) store.set('bb_web_update_auto', auto ? 'true' : 'false');
    const calls = { update: 0, restart: 0, toasts: [] };
    const page = { active: null, bodyClass: '', overlay: false, visibility: 'visible' };
    const plugin = {
        info: async () => ({ version: mine }),
        update: async () => { calls.update++; if (updateFails) throw new Error('No connection'); return { version: remote, downloaded: 3 }; },
        restart: () => { calls.restart++; },
        confirm: async () => {},
    };
    const el = (sel) => ({ matches: (q) => q.split(',').some(s => sel.includes(s.trim())), isContentEditable: false });
    const ctx = vm.createContext({
        window: { Capacitor: { Plugins: { BeeWeb: plugin } }, BB_SITE: 'https://site.test', BB_PERSONAL: false, BB_APP_COPY: true },
        localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
        navigator: { onLine: true },
        location: { pathname: '/src/features/home/home.html' },
        document: {
            get visibilityState() { return page.visibility; },
            get activeElement() { return page.active ? el(page.active) : null; },
            get body() { return { matches: (q) => !!page.bodyClass && q.includes(page.bodyClass) }; },
            querySelector: () => (page.overlay ? {} : null),
            addEventListener() {},
        },
        fetch: async (url) => ({ json: async () => (String(url).startsWith('https://site.test') ? { version: remote, batch: 'Version 1.1.0' } : { version: mine }) }),
        Toast: { show: (m) => calls.toasts.push(m) },
        setTimeout: (fn) => { fn(); return 0; }, Date, JSON, Promise, Number, String, Array, console,
    });
    vm.runInContext(code, ctx);
    return { WU: ctx.WU, calls, page, store };
}

test('auto-update: on by default, a ready update downloads and restarts by itself', async () => {
    const a = app();
    assert.equal(a.WU.autoOn(), true);
    await a.WU.check({ force: true });
    assert.equal(await a.WU.autoApply(), true);
    assert.equal(a.calls.update, 1);
    assert.equal(a.calls.restart, 1);
    assert.ok(a.calls.toasts.some(t => /Updating to/.test(t)), a.calls.toasts.join(' | '));
    assert.ok(!a.calls.toasts.some(t => /Update ready/.test(t)));   // no "tap to update" nag when it does it itself
});

test('auto-update: off, the update waits for the button', async () => {
    const a = app({ auto: false });
    await a.WU.check({ force: true });
    assert.equal(await a.WU.autoApply(), false);
    assert.equal(a.calls.update, 0);
    assert.ok(a.WU.ready());                                         // still offered on the Updates page
    assert.ok(a.calls.toasts.some(t => /Update ready/.test(t)));
});

test('auto-update: never restarts while you type, on a form, with a pop-up open, or in the background', async () => {
    const a = app();
    await a.WU.check({ force: true });
    a.page.active = 'input'; assert.equal(await a.WU.autoApply(), false);
    a.page.active = null; a.page.bodyClass = '.task-form-page'; assert.equal(await a.WU.autoApply(), false);
    a.page.bodyClass = ''; a.page.overlay = true; assert.equal(await a.WU.autoApply(), false);
    a.page.overlay = false; a.page.visibility = 'hidden'; assert.equal(await a.WU.autoApply(), false);
    assert.equal(a.calls.update, 0);
    a.page.visibility = 'visible';
    assert.equal(await a.WU.autoApply(), true);                      // free again: it goes
    assert.equal(a.calls.update, 1);
});

test('auto-update: gives up after 2 tries of the same version, and the button still works', async () => {
    const a = app({ updateFails: true });
    await a.WU.check({ force: true });
    assert.equal(await a.WU.autoApply(), false);
    assert.equal(await a.WU.autoApply(), false);
    assert.equal(await a.WU.autoApply(), false);
    assert.equal(a.calls.update, 2);                                 // the third time it did not even try
    assert.ok(a.WU.ready());
});

test('auto-update: nothing to do when the app is already on the newest files', async () => {
    const a = app({ mine: 'v2', remote: 'v2' });
    await a.WU.check({ force: true });
    assert.equal(await a.WU.autoApply(), false);
    assert.equal(a.calls.update, 0);
});

test('auto-update: turning the switch back on clears the give-up count', async () => {
    const a = app({ updateFails: true });
    await a.WU.check({ force: true });
    await a.WU.autoApply(); await a.WU.autoApply();
    a.WU.setAuto(false); assert.equal(a.WU.autoOn(), false);
    a.WU.setAuto(true);
    await a.WU.autoApply();
    assert.equal(a.calls.update, 3);
});

// Nov 25 2026 (Craft): the app could never see an update. Its copy runs at https://localhost and reads
// version.json from the site, and the site did not allow that. The Updates page then said "newest version".
test('update check: the site lets the app read version.json from another address', () => {
    const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const block = toml.split('[[headers]]').find(b => /for = "\/version\.json"/.test(b)) || '';
    assert.match(block, /Access-Control-Allow-Origin = "\*"/);
    assert.match(block, /Cache-Control = "no-store"/);
});

test('update check: a failed check says so on the Updates page, not "newest version"', async () => {
    const page = readFileSync(new URL('../src/features/app-updates/app-updates.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const els = {};
    const el = (id) => (els[id] = els[id] || { id, innerHTML: '', hidden: false, checked: false, textContent: '' });
    const run = async (check, last) => {
        for (const k of Object.keys(els)) delete els[k];
        const ctx = vm.createContext({
            document: { getElementById: el },
            WebUpdate: { isApp: () => true, current: async () => ({ label: 'Version 1.1.0 · Nov 21' }), check, ready: () => null, last: () => last, autoOn: () => true, setAuto() {} },
            Date, String, Number, Promise, console,
        });
        vm.runInContext(page, ctx);
        await new Promise(r => setTimeout(r, 20));
        return els['up-now'].innerHTML;
    };
    assert.match(await run(async () => null, { state: 'failed', note: 'Failed to fetch' }), /Could not check for updates \(Failed to fetch\)/);
    assert.match(await run(async () => ({ current: true }), { state: 'current' }), /You have the newest version/);
    assert.match(await run(async () => ({ offline: true }), { state: 'skipped' }), /Offline/);
});

// Nov 25 2026 (Craft): ONE Check for updates on About: the APK and the app files together.
const upd = readFileSync(new URL('../src/core/ui/updates/updates.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => upd.slice(upd.indexOf(from), upd.indexOf(to, upd.indexOf(from)));
const sumCtx = vm.createContext({});
vm.runInContext(cut('    function problemText(state) {', '    async function autoCheck()') + cut('    function updateSummary(', '    // </UpdateSummary>') + '; globalThis.S = updateSummary;', sumCtx);
const S = (o) => sumCtx.S(o);

test('one check: new app files are found even when the APK is current', () => {
    const r = S({ apk: { state: 'current' }, files: { ready: { label: 'Version 1.1.0 · Nov 25' } } });
    assert.match(r.text, /App files: update ready \(Version 1\.1\.0 · Nov 25\)/);
    assert.equal(r.kind, 'files');
    assert.doesNotMatch(r.text, /newest version/);
});

test('one check: "newest version" only when both the APK and the files are current', () => {
    assert.match(S({ apk: { state: 'current' }, files: { current: true } }).text, /newest version/);
    assert.equal(S({ apk: { state: 'current' }, files: { current: true } }).kind, null);
    assert.match(S({ apk: { state: 'current' }, files: null }).text, /newest version/);   // not the app's own copy
});

test('one check: a failed file check says so, and never claims "newest version"', () => {
    const r = S({ apk: { state: 'current' }, files: { failed: 'Failed to fetch' } });
    assert.match(r.text, /App files: could not check \(Failed to fetch\)/);
    assert.doesNotMatch(r.text, /newest version/);
    assert.equal(r.kind, null);
});

test('one check: a new APK alone offers the installer; both ready loads the files first', () => {
    const apk = { state: 'available', latest: { version: '1.1.1' } };
    const a = S({ apk, files: { current: true } });
    assert.match(a.text, /App 1\.1\.1 is ready to install/); assert.equal(a.kind, 'apk');
    const b = S({ apk, files: { ready: { label: 'Nov 25' } } });
    assert.match(b.text, /App files: update ready/); assert.match(b.text, /App 1\.1\.1 is ready/); assert.equal(b.kind, 'files');
});

test('one check: an APK check that could not reach GitHub is named, the file result still shows', () => {
    const r = S({ apk: { state: 'offline' }, files: { ready: { label: 'Nov 25' } } });
    assert.match(r.text, /App files: update ready/); assert.match(r.text, /App: Couldn't reach GitHub/);
    assert.equal(r.kind, 'files');
});

test('one check: About has one Check row and no GitHub token row', () => {
    assert.doesNotMatch(upd, /ab-token/);
    assert.match(upd, /id="ab-auto"/);
    assert.equal((upd.match(/id="ab-check"/g) || []).length, 1);
});
