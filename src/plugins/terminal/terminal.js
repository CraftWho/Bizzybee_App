console.log("/// TERMINAL ONLINE ///");

// Bizzybee Terminal (Oct 2026) - a support console. When an update breaks
// someone's save, they open the Terminal, type `request <what happened>`,
// and an owner grants access (netlify/functions/terminal-access.mjs):
//   user      - repair commands on their real save, for 48 hours
//   moderator - user commands + Test Mode and test commands, until revoked
//   owner     - everything + grant / revoke / requests / grants / logs
// The server decides the level, so editing this page can't unlock it.
// Commands map to safe Vault functions (no raw code). Anything that
// changes a save makes a backup first; risky ones ask for YES. Typed only,
// max 20 commands a minute, and a user's repair commands run once per
// 10 minutes each. Commands run with access are logged for the owner.
const TERM_RANK = { none: 0, user: 1, moderator: 2, owner: 3 };
const TERM_TEST_KEY = 'bizzybee_dev_test';
const TERM_LOG_KEY = 'bizzybee_terminal_log';
const termHost = location.hostname;
const termIsLocal = termHost === '' || termHost === 'localhost' || termHost === '127.0.0.1' || termHost === '[::1]' || /^(10|192\.168)\./.test(termHost) || termHost.endsWith('.local');
let termLevel = 'none';
let termExpires = null;
let termSignedIn = false;
let termPending = null;
let termCloudList = [];
let termRequests = [];
const termHistory = [];
let termHistoryAt = -1;

const termRankOf = (lvl) => TERM_RANK[lvl] || 0;
const termCan = (need) => termRankOf(termLevel) >= termRankOf(need);

function termPrint(text, kind = '') {
    const out = document.getElementById('tm-out');
    const line = document.createElement('div');
    line.className = 'tm-line' + (kind ? ' tm-' + kind : '');
    line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
}
function termLocalLog(cmd, ok) {
    let log = [];
    try { log = JSON.parse(localStorage.getItem(TERM_LOG_KEY) || '[]'); } catch { log = []; }
    log.unshift({ at: new Date().toISOString(), cmd, ok });
    try { localStorage.setItem(TERM_LOG_KEY, JSON.stringify(log.slice(0, 50))); } catch { /* storage full */ }
}
function termBackup(why) {
    try { Vault.createLocalBackup(`Terminal: ${why}`); return true; } catch { return false; }
}
function termWaitForCloud(ms = 8000) {
    return new Promise(resolve => {
        const start = Date.now();
        (function check() {
            if (typeof CloudSyncAuto !== 'undefined') return resolve(CloudSyncAuto);
            if (Date.now() - start > ms) return resolve(null);
            setTimeout(check, 200);
        })();
    });
}
async function termServer(body) {
    const cloud = await termWaitForCloud();
    if (!cloud) throw new Error('Cloud is not connected. Sign in on the login screen first.');
    return cloud.request('terminal-access', body);
}
function findBee(name) {
    const q = String(name || '').trim().toLowerCase();
    if (!q) return null;
    const bees = Vault.getColonyBees().filter(b => b.rarity !== 'Royal');
    return bees.find(b => b.name.toLowerCase() === q) || bees.find(b => b.name.toLowerCase().includes(q)) || null;
}
function materialId(word) {
    const w = String(word || '').toLowerCase();
    if (w === 'honey') return 'honey-drop';
    if (w === 'nectar') return 'royal-nectar';
    if (w === 'jelly') return 'royal-jelly';
    const m = (typeof MATERIAL_CATALOG !== 'undefined' ? MATERIAL_CATALOG : []).find(x => x.id === w || x.label.toLowerCase() === w);
    return m ? m.id : null;
}

// ---- anti-spam ------------------------------------------------------------
const termRecent = [];
const TERM_COOLDOWN_MS = 10 * 60 * 1000;
function termRateLimited() {
    const now = Date.now();
    while (termRecent.length && now - termRecent[0] > 60000) termRecent.shift();
    if (termRecent.length >= 20) return true;
    termRecent.push(now);
    return false;
}
function termCooldowns() { try { return JSON.parse(localStorage.getItem('bizzybee_terminal_cooldowns') || '{}'); } catch { return {}; } }
function termCooldownLeft(name) { const left = (termCooldowns()[name] || 0) + TERM_COOLDOWN_MS - Date.now(); return left > 0 ? Math.ceil(left / 60000) : 0; }
function termStartCooldown(name) { const m = termCooldowns(); m[name] = Date.now(); try { localStorage.setItem('bizzybee_terminal_cooldowns', JSON.stringify(m)); } catch { /* full */ } }

// ---- commands -------------------------------------------------------------
// need: lowest level that can run it. test: Test Mode only. cooldown: a
// user can run it once per 10 min. confirm: asks for YES (backup first).
const TERM_COMMANDS = [
    { name: 'help', need: 'none', help: 'List the commands you can use.', run: () => {
        const rows = TERM_COMMANDS.filter(c => termCan(c.need) && (!c.test || Vault.devTest)).map(c => `  ${(c.usage || c.name).padEnd(20)}${c.help}`);
        const out = [[termLevel === 'none' ? 'This Terminal is locked.' : `Access: ${termLevel.toUpperCase()}${termExpires ? ' until ' + new Date(termExpires).toLocaleString() : ''}`, 'head'], ...rows.map(r => [r])];
        if (termLevel === 'none') out.push(['Something broken? Type: request <what happened>', 'warn'], ['The team will unlock repair commands for you.', 'dim']);
        if (termCan('moderator') && !Vault.devTest) out.push(['Test commands appear in Test Mode: testmode on', 'dim']);
        return out;
    } },
    { name: 'request', usage: 'request <message>', need: 'none', args: true, help: 'Ask the team for help with your save.', run: async (a, raw) => {
        if (!termSignedIn) return [['Sign in to your cloud account first, so the team can find your save.', 'err']];
        const message = raw.replace(/^request\s*/i, '');
        await termServer({ action: 'request', message });
        return [['Sent! The team will look at it and unlock repair commands for you.', 'ok'], ['Come back to this Terminal later and type help.', 'dim']];
    } },
    { name: 'status', need: 'none', help: 'Your save, level, bees and sync.', run: () => {
        const s = Vault.state, user = Vault.getUser() || {};
        const bees = Vault.getColonyBees().filter(b => b.rarity !== 'Royal');
        const size = (localStorage.getItem(Vault.storageKey) || '').length;
        return [
            [`Save      ${(size / 1024).toFixed(0)} KB · schema ${s.schemaVersion}${Vault.devTest ? ' · TEST MODE' : ''}`],
            [`Level     ${user.level} · ${Math.round(user.totalXP || 0)} XP`],
            [`Bees      ${bees.length} · ${bees.filter(b => b.life && b.life.faintedAt).length} fainted · ${bees.filter(b => b.class).length} working`],
            [`Tickets   ${Vault.getTicketCount()}`],
            [`Cloud     ${termSignedIn ? 'signed in' : 'not signed in'}`],
            [`Backups   ${Vault.getLocalBackups().length} on this device`]
        ];
    } },
    { name: 'clear', need: 'none', help: 'Clear the screen.', run: () => { document.getElementById('tm-out').innerHTML = ''; return []; } },

    // ---- user: repair your real save ----
    { name: 'repair', need: 'user', cooldown: true, help: 'Re-run every save fix (safe).', run: () => {
        termBackup('repair');
        const steps = ['_ensurePluginData', '_ensureBeeCardData', '_ensureSkillTreeData', '_ensureDailyTaskScheduleData', '_ensureOnboardingData', '_ensureBeeLife', '_refreshTaskXP'];
        const done = [];
        steps.forEach(fn => {
            try { if (typeof Vault[fn] === 'function') { Vault[fn](); done.push(fn.replace(/^_ensure|^_refresh/, '')); } }
            catch (e) { done.push(fn.replace(/^_ensure|^_refresh/, '') + ' (failed)'); }
        });
        Vault.save();
        try { Vault.validateFullState(Vault.state); } catch (e) { return [['Repaired, but the save still has a problem: ' + e.message, 'err']]; }
        return [[`Repaired: ${done.join(', ')}.`, 'ok'], ['Your save checks out.', 'ok']];
    } },
    { name: 'fix xp', need: 'user', cooldown: true, help: 'Recount XP from your tasks.', run: () => {
        termBackup('fix xp');
        const before = Math.round(Vault.getUser().totalXP);
        Vault._refreshTaskXP(); Vault.save();
        return [[`XP recounted: ${before} → ${Math.round(Vault.getUser().totalXP)}. Level ${Vault.getUser().level}.`, 'ok']];
    } },
    { name: 'fix bees', need: 'user', cooldown: true, help: 'Repair missing bee data.', run: () => {
        termBackup('fix bees');
        Vault._ensureBeeCardData(); if (Vault._ensureBeeLife) Vault._ensureBeeLife(); Vault.save();
        return [[`Checked ${Vault.getColonyBees().length} bees. Missing data filled in.`, 'ok']];
    } },
    { name: 'sync', need: 'user', help: 'Compare this device with the cloud.', run: async () => {
        const cloud = await termWaitForCloud();
        if (!cloud) return [['Cloud is not connected.', 'err']];
        const c = await cloud.peekCloud();
        if (!c.hasData) return [['No cloud save yet. Use sync now.', 'warn']];
        const local = Vault.getLastLocalUpdate(), diff = new Date(local).getTime() - new Date(c.updatedAt).getTime();
        return [[`Device ${new Date(local).toLocaleString()}`], [`Cloud  ${new Date(c.updatedAt).toLocaleString()}`],
            [Math.abs(diff) < 5000 ? 'In sync.' : diff > 0 ? 'This device is newer. Run sync now.' : 'The cloud is newer. Load it in Settings.', Math.abs(diff) < 5000 ? 'ok' : 'warn']];
    } },
    { name: 'sync now', need: 'user', cooldown: true, help: 'Upload this device to the cloud.', run: async () => {
        const cloud = await termWaitForCloud();
        if (!cloud) return [['Cloud is not connected.', 'err']];
        await cloud.pushNow();
        return [['Uploaded to the cloud.', 'ok']];
    } },
    { name: 'backup', need: 'user', help: 'Make a recovery copy on this device.', run: () => (termBackup('manual') ? [['Recovery copy saved.', 'ok']] : [['Could not make a copy (storage full?).', 'err']]) },
    { name: 'restore list', need: 'user', help: 'Recovery copies on this device.', run: () => {
        const list = Vault.getLocalBackups();
        if (!list.length) return [['No recovery copies yet.', 'dim']];
        return list.map((b, i) => [`  ${i + 1}. ${b.reason} · ${new Date(b.createdAt).toLocaleString()}`]).concat([['Put one back with: restore 1', 'dim']]);
    } },
    { name: 'restore', usage: 'restore <n>', need: 'user', args: true, confirm: true, cooldown: true, help: 'Put a device recovery copy back.', run: (a) => {
        const item = Vault.getLocalBackups()[(parseInt(a[0], 10) || 0) - 1];
        if (!item) return [['Pick a number from restore list.', 'err']];
        const r = Vault.importFullState(item.data);
        if (!r.ok) return [[r.error || 'Restore failed.', 'err']];
        setTimeout(() => location.reload(), 1200);
        return [[`Restored "${item.reason}". Reloading…`, 'ok']];
    } },
    { name: 'cloud backups', need: 'user', help: 'Your automatic cloud backups.', run: async () => {
        const cloud = await termWaitForCloud();
        if (!cloud) return [['Cloud is not connected.', 'err']];
        const r = await cloud.request('backups');
        termCloudList = r.backups || [];
        if (!termCloudList.length) return [['No cloud backups yet.', 'dim']];
        return termCloudList.slice(0, 15).map((b, i) => [`  ${i + 1}. ${new Date(b.createdAt).toLocaleString()}`]).concat([['Put one back with: cloud restore 1', 'dim']]);
    } },
    { name: 'cloud restore', usage: 'cloud restore <n>', need: 'user', args: true, confirm: true, cooldown: true, help: 'Put a cloud backup back.', run: async (a) => {
        if (!termCloudList.length) return [['Run cloud backups first.', 'err']];
        const item = termCloudList[(parseInt(a[0], 10) || 0) - 1];
        if (!item) return [['Pick a number from cloud backups.', 'err']];
        await (await termWaitForCloud()).restoreBackup(item.id);
        setTimeout(() => location.reload(), 1500);
        return [[`Restored the backup from ${new Date(item.createdAt).toLocaleString()}. Reloading…`, 'ok']];
    } },
    { name: 'unstuck', need: 'user', help: 'Leave a stuck screen and go Home.', run: () => {
        setTimeout(() => { location.href = '../../features/home/home.html'; }, 900);
        return [['Going Home…', 'ok']];
    } },
    { name: 'log', need: 'user', help: 'Commands you ran here.', run: () => {
        let log = []; try { log = JSON.parse(localStorage.getItem(TERM_LOG_KEY) || '[]'); } catch { /* none */ }
        return log.length ? log.slice(0, 12).map(l => [`  ${new Date(l.at).toLocaleString()}  ${l.ok ? '✓' : '✗'} ${l.cmd}`]) : [['Nothing yet.', 'dim']];
    } },

    // ---- moderator: Test Mode ----
    { name: 'testmode', usage: 'testmode on|off|fresh', need: 'moderator', args: true, help: 'Test on a copy of your hive.', run: (a) => {
        const want = a[0];
        if (want === 'on' || want === 'fresh') {
            if (Vault.devTest && want === 'on') return [['Test Mode is already on.', 'dim']];
            if (want === 'fresh') Object.keys(localStorage).filter(k => k.startsWith('bizzybee_user_data:devtest')).forEach(k => localStorage.removeItem(k));
            else localStorage.setItem('bizzybee_user_data:devtest', localStorage.getItem(Vault.storageKey) || '');
            localStorage.setItem(TERM_TEST_KEY, '1');
            setTimeout(() => location.reload(), 900);
            return [[want === 'fresh' ? 'Starting Test Mode with a new egg…' : 'Copying your hive into Test Mode…', 'ok'], ['Nothing in Test Mode touches the real save.', 'dim']];
        }
        if (want === 'off') {
            if (!Vault.devTest) return [['Test Mode is already off.', 'dim']];
            localStorage.removeItem(TERM_TEST_KEY);
            setTimeout(() => location.reload(), 900);
            return [['Leaving Test Mode. Your real save is back.', 'ok']];
        }
        return [[`Test Mode is ${Vault.devTest ? 'ON' : 'OFF'}. Use: testmode on · off · fresh`, 'dim']];
    } },
    { name: 'add tickets', usage: 'add tickets <n>', need: 'moderator', test: true, args: true, help: 'Give gacha tickets.', run: (a) => {
        const n = Math.max(1, Math.min(100, parseInt(a[0], 10) || 1));
        Vault.state.colony.tickets = (Vault.state.colony.tickets || 0) + n; Vault.save();
        return [[`+${n} tickets (now ${Vault.getTicketCount()}).`, 'ok']];
    } },
    { name: 'add', usage: 'add <item> <n>', need: 'moderator', test: true, args: true, help: 'pollen, nectar, honey, jelly.', run: (a) => {
        const id = materialId(a[0]);
        if (!id) return [['Unknown item. Try: pollen, nectar, honey, jelly.', 'err']];
        const n = Math.max(1, Math.min(999, parseInt(a[1], 10) || 1));
        const total = Vault._addMaterial(id, n); Vault.save();
        return [[`+${n} ${id} (now ${total}).`, 'ok']];
    } },
    { name: 'tick', usage: 'tick <days>', need: 'moderator', test: true, args: true, help: 'Run hive life for N days.', run: (a) => {
        const n = Math.max(1, Math.min(14, parseInt(a[0], 10) || 1));
        Vault.state.colony.lifeTick = shiftISODate(todayISO(), -n);
        const events = Vault.hiveDailyTick();
        return [[`Ran ${n} day${n === 1 ? '' : 's'} of hive life.`, 'ok'], ...(events.length ? events.map(e => [`  ${e.text}`]) : [['  Nothing notable happened.', 'dim']])];
    } },
    { name: 'faint', usage: 'faint <bee>', need: 'moderator', test: true, args: true, help: 'Make a bee faint.', run: (a) => {
        const b = findBee(a.join(' ')); if (!b || !b.life) return [['No bee by that name.', 'err']];
        Object.assign(b.life, { health: 0, faintedAt: todayISO() }); Vault.save();
        return [[`${b.name} fainted.`, 'ok']];
    } },
    { name: 'heal', usage: 'heal <bee|all>', need: 'moderator', test: true, args: true, help: 'Wake and fully heal.', run: (a) => {
        const list = a[0] === 'all' ? Vault.getColonyBees().filter(b => b.life) : [findBee(a.join(' '))].filter(Boolean);
        if (!list.length) return [['No bee by that name.', 'err']];
        list.forEach(b => Object.assign(b.life, { health: 100, stamina: 100, fullness: 100, happiness: 90, faintedAt: null })); Vault.save();
        return [[`Healed ${list.length} bee${list.length === 1 ? '' : 's'}.`, 'ok']];
    } },
    { name: 'raid', need: 'moderator', test: true, help: 'Force a raid now.', run: () => { Vault._raid(todayISO()); Vault.save(); return [[Vault.getLifeEvents()[0].text, 'ok']]; } },
    { name: 'death', usage: 'death on|off', need: 'moderator', test: true, args: true, help: 'Bee death on/off (this visit).', run: (a) => {
        if (!['on', 'off'].includes(a[0])) return [[`Death is ${LIFE.deathEnabled ? 'ON' : 'OFF'}.`, 'dim']];
        LIFE.deathEnabled = a[0] === 'on';
        return [[`Death is now ${LIFE.deathEnabled ? 'ON' : 'OFF'} until you reload.`, 'warn']];
    } },

    // ---- owner: support desk ----
    { name: 'requests', need: 'owner', help: 'Help requests from users.', run: async () => {
        const r = await termServer({ action: 'requests' });
        termRequests = r.requests || [];
        if (!termRequests.length) return [['No requests.', 'dim']];
        return termRequests.slice(0, 15).map((q, i) => [`  ${i + 1}. ${q.email} · ${new Date(q.at).toLocaleString()}\n     "${q.message}"`])
            .concat([['Unlock with: grant <email>   ·   clear one with: dismiss <n>', 'dim']]);
    } },
    { name: 'dismiss', usage: 'dismiss <n>', need: 'owner', args: true, help: 'Remove a request from the list.', run: async (a) => {
        const q = termRequests[(parseInt(a[0], 10) || 0) - 1];
        if (!q) return [['Run requests first, then pick a number.', 'err']];
        await termServer({ action: 'dismiss', id: q.id });
        return [[`Dismissed the request from ${q.email}.`, 'ok']];
    } },
    { name: 'grant', usage: 'grant <email> [mod|hours]', need: 'owner', args: true, help: 'Unlock the Terminal for someone.', run: async (a) => {
        const mod = a[1] === 'moderator' || a[1] === 'mod';
        const r = await termServer({ action: 'grant', email: a[0], level: mod ? 'moderator' : 'user', hours: mod ? null : parseInt(a[1], 10) || 48 });
        return [[`${r.email} is now ${r.grant.level.toUpperCase()}${r.grant.expiresAt ? ' until ' + new Date(r.grant.expiresAt).toLocaleString() : ' until revoked'}.`, 'ok']];
    } },
    { name: 'revoke', usage: 'revoke <email>', need: 'owner', args: true, help: 'Take Terminal access away.', run: async (a) => {
        await termServer({ action: 'revoke', email: a[0] });
        return [[`Access removed for ${a[0]}.`, 'ok']];
    } },
    { name: 'grants', need: 'owner', help: 'Who has access right now.', run: async () => {
        const r = await termServer({ action: 'grants' });
        if (!r.grants.length) return [['Nobody has access right now.', 'dim']];
        return r.grants.map(g => [`  ${g.email} · ${g.level}${g.expiresAt ? ' · until ' + new Date(g.expiresAt).toLocaleString() : ''}`]);
    } },
    { name: 'logs', need: 'owner', help: 'What people ran in their Terminals.', run: async () => {
        const r = await termServer({ action: 'logs', limit: 25 });
        if (!r.log.length) return [['No activity yet.', 'dim']];
        return r.log.map(l => [`  ${new Date(l.at).toLocaleString()}  ${l.ok ? '✓' : '✗'} ${l.email}: ${l.cmd}`]);
    } }
];

// Longest name first, so "cloud restore 2" and "add tickets 5" match first.
function termMatch(input) {
    const text = input.trim().replace(/\s+/g, ' ');
    const lower = text.toLowerCase();
    const sorted = TERM_COMMANDS.slice().sort((a, b) => b.name.length - a.name.length);
    for (const c of sorted) {
        if (lower === c.name || (c.args && lower.startsWith(c.name + ' '))) return { cmd: c, args: text.slice(c.name.length).trim().split(' ').filter(Boolean) };
    }
    return null;
}

async function termRun(raw) {
    const input = raw.trim();
    if (!input) return;
    termPrint('> ' + input, 'cmd');
    termHistory.unshift(input); termHistoryAt = -1;
    if (termRateLimited()) { termPrint('Too many commands. Wait a minute.', 'err'); return; }
    if (termPending) {
        const p = termPending; termPending = null;
        if (input === 'YES') return termExec(p.cmd, p.args, p.raw);
        termPrint('Cancelled.', 'dim'); return;
    }
    const m = termMatch(input);
    // Commands above your level look like unknown commands.
    if (!m || !termCan(m.cmd.need)) {
        termPrint(`Unknown command "${input}". Type help.`, 'err');
        termLocalLog(input, false); return;
    }
    if (m.cmd.test && !Vault.devTest) { termPrint('That command only works in Test Mode: testmode on', 'warn'); return; }
    if (m.cmd.cooldown && termLevel === 'user') {
        const left = termCooldownLeft(m.cmd.name);
        if (left) { termPrint(`"${m.cmd.name}" can run again in ${left} min.`, 'warn'); return; }
    }
    if (m.cmd.confirm) { termPending = { ...m, raw: input }; termPrint('This changes your save. A backup is made first. Type YES to go on.', 'warn'); return; }
    return termExec(m.cmd, m.args, input);
}

async function termExec(cmd, args, raw) {
    let ok = true;
    try {
        if (cmd.confirm) termBackup(raw);
        if (cmd.cooldown && termLevel === 'user') termStartCooldown(cmd.name);
        const lines = await cmd.run(args, raw);
        (lines || []).forEach(([t, k]) => termPrint(t, k));
    } catch (error) {
        ok = false;
        termPrint('Error: ' + (error.message || error), 'err');
    }
    termLocalLog(raw, ok);
    // Owners can see what people ran (best effort, never blocks).
    if (termLevel !== 'none' && termSignedIn && !['help', 'clear', 'status'].includes(cmd.name)) {
        termServer({ action: 'log', cmd: raw, ok }).catch(() => {});
    }
}

async function termLoadAccess() {
    // This computer with the Hacker login = owner, offline.
    if (termIsLocal && localStorage.getItem('bizzybee_dev') === '1') { termLevel = 'owner'; return; }
    termSignedIn = localStorage.getItem('bizzybee_session') === 'identity';
    if (!termSignedIn) return;
    try {
        const r = await termServer();
        termLevel = r.level || 'none';
        termExpires = r.expiresAt || null;
    } catch (error) {
        termPrint('Could not check your access: ' + error.message, 'err');
    }
}

function termModeLabel() {
    const label = termLevel === 'none' ? 'LOCKED' : termLevel.toUpperCase();
    document.getElementById('tm-mode').textContent = Vault.devTest ? `${label} · TEST MODE` : label;
}

document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    Waggle.setActions(baseWaggleActions());
    const installed = typeof Plugins !== 'undefined' && Plugins.isEnabled('terminal');
    document.getElementById('terminal-not-installed').hidden = installed;
    document.getElementById('terminal-app').hidden = !installed;
    if (!installed) return;

    termPrint('BIZZYBEE OS v1 · hive support console', 'head');
    termPrint('Checking your access…', 'dim');
    await termLoadAccess();
    termModeLabel();
    if (termLevel === 'none') {
        termPrint('This Terminal is locked.', 'warn');
        termPrint('If an update broke your save, type: request <what happened>', 'dim');
    } else {
        termPrint(`Access: ${termLevel.toUpperCase()}${termExpires ? ' until ' + new Date(termExpires).toLocaleString() : ''}. Type help.`, 'ok');
    }
    if (Vault.devTest) termPrint('TEST MODE: changes here never touch the real save. testmode off to leave.', 'warn');

    const box = document.getElementById('tm-chips');
    box.innerHTML = '<button type="button" class="tm-chip" data-cmd="help">help</button><span class="tm-tip">Type a command and press Enter.</span>';
    box.hidden = false;
    box.querySelector('[data-cmd]').addEventListener('click', () => termRun('help'));

    const input = document.getElementById('tm-input');
    document.getElementById('tm-form').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; termRun(v); });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' && termHistory.length) { termHistoryAt = Math.min(termHistory.length - 1, termHistoryAt + 1); input.value = termHistory[termHistoryAt]; e.preventDefault(); }
        if (e.key === 'ArrowDown') { termHistoryAt = Math.max(-1, termHistoryAt - 1); input.value = termHistoryAt < 0 ? '' : termHistory[termHistoryAt]; e.preventDefault(); }
    });
});
