// Nov 21 2026 (Craft): 30-day hive simulation (6 hives, 5-60 bees). Prints ISSUE lines for broken states.
// Run: node --experimental-test-module-mocks --test tools/hive-sim.test.mjs
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8');
const today = new Date().toLocaleDateString('sv-SE');
function world(seed, opts = {}) {
    let s = seed; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const jobs = ['nurse', 'honeymaker', 'collector', 'rescue', 'receiver', 'fanner', 'cleaner', 'guardian', 'scout', 'architect', 'watercarrier', 'attendant', 'undertaker'];
    const bees = [];
    for (let i = 0; i < (opts.n || 24); i++) {
        const t = jobs[i % jobs.length];
        bees.push({ id: 'b' + i, name: 'B' + i, rarity: i === 0 ? 'Rare' : 'Common', class: i < 13 ? t : null, sex: 'f', talent: t, stats: { level: 1, hp: 30, offense: 10, defense: 10, speed: 10, power: 10 }, element: 'fire', dexNumber: 1, weight: 1,
            life: { health: 40 + Math.floor(rnd() * 60), stamina: 20 + Math.floor(rnd() * 80), fullness: 30 + Math.floor(rnd() * 70), happiness: 70, fatigue: Math.floor(rnd() * 60), bornAt: '2026-01-01', faintedAt: null, birthTrait: null } });
    }
    const todos = Array.from({ length: 30 }, (_, i) => ({ id: 'td' + i, label: 'T' + i, xp: 5, completed: i < 20, completedAt: Date.now() - (i + 1) * 86400000 }));
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], todos, bonusXP: [{ xp: 5000 }], hive: { bees, tickets: 0, vitalsAt: Date.now(), lifeTick: today, honey: opts.honey ?? 40, autoManage: { on: opts.auto !== false }, talentJobsV1: true, newJobsV1: true }, inventory: { materials: {} } };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const ls = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const ctx = vm.createContext({ localStorage: ls, console: { log() {}, error() {} }, Event, window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(src + '\nglobalThis.vault = Vault; globalThis.__setRand = f => { Math.random = f; };', ctx);
    ctx.__setRand(rnd);
    return { v: ctx.vault, g: c => vm.runInContext(c, ctx) };
}
async function run(label, seed, opts) {
    const { v, g } = world(seed, opts); await v.init();
    v.state.hive.bees = v.state.hive.bees.filter(b => !String(b.id).startsWith('bee-'));
    if (opts.auto === false) v.state.hive.autoManage = { on: false };
    if (opts.whistle) { v._ensureQueen().bonus = 100000; v.purchaseStoreItem('queens-whistle'); }
    if (opts.ret) v.setAutoSwap({ returnPct: opts.ret });
    const issues = new Map(); const add = (k, d) => { if (!issues.has(k)) issues.set(k, d); };
    const T = {}; const tr = (k) => T[k] = (T[k] || 0) + 1;
    const start = Date.now(); const restStart = {}, readyStart = {}, hungryStart = {}, breakStart = {};
    for (let h = 1; h <= 24 * (opts.days || 30); h++) {
        const at = new Date(start + h * 3600000);
        v._fcAt = at;   // so play breaks count in simulated time
        v._lifeHour(at); v._tendHive(at);
        for (const b of v._lifeBees()) {
            const L = b.life;
            for (const k of ['health', 'stamina', 'fullness', 'happiness', 'fatigue']) if (!(L[k] >= 0 && L[k] <= 100)) add('vital out of range: ' + k, `${b.id} ${k}=${L[k]}`);
            if (L.nursery && L.recuperate) add('nursery AND recuperate', `${b.id} h${h}`);
            if (b.class && L.recuperate) add('job AND recuperate', `${b.id}`);
            // Nov 21 2026: a title-locked bee keeps its job on a play break, but must not work during it
            if (b.class && L.playUntil && Date.parse(L.playUntil) > at.getTime() && v._workers(b.class).some(w => w.id === b.id)) add('works while on a play break', `${b.id}`);
            if (L.recuperate && !L.faintedAt) { restStart[b.id] ??= h; if (h - restStart[b.id] > 24 * 4) add('resting 4+ days straight', `${b.id} hp${Math.round(L.health)} st${Math.round(L.stamina)} full${Math.round(L.fullness)} fat${Math.round(L.fatigue)}`); } else delete restStart[b.id];
            if (v.beeIsReady(b)) { tr('readyHours'); readyStart[b.id] ??= h; if (h - readyStart[b.id] > 72) add('Ready 3+ days, never back to work', `${b.id} from=${L.restFrom} ${v.jobHolders(L.restFrom).length}/${v.jobSlots(L.restFrom)} block="${v.jobBlock(b, L.restFrom)}"`); } else delete readyStart[b.id];
            if (L.fullness < 40 && !L.faintedAt && v.state.hive.honey >= 1 && !g('isNightHour')(at.getHours())) { hungryStart[b.id] ??= h; if (h - hungryStart[b.id] > 3) add('hungry 3+ day-hours with honey', `${b.id}`); } else delete hungryStart[b.id];
            if (L.playUntil && !b.class) { breakStart[b.id] ??= h; if (h - breakStart[b.id] > 48) add('play break never ended (no job 2+ days)', `${b.id}`); } else delete breakStart[b.id];
            if (b.class && g('beeWorkBored')(b, g('isoLocalDate')(at))) tr('boredWorkHours');
            if (L.faintedAt) tr('faintHours');
            if (b.class && L.stamina < 10) tr('worker<10');
            if (L.happiness < 30) tr('unhappyHours');
        }
        for (const j of v.hiveOpenJobs()) if (v.jobHolders(j).length > v.jobSlots(j)) add('more holders than slots', `${j}`);
        v._fcAt = null;
        const bd = v.nurseryBeds(); if (bd.used > bd.total) add('beds used > total', `${bd.used}/${bd.total}`);
    }
    const bees = v._lifeBees();
    const sum = { working: bees.filter(b => b.class).length, resting: bees.filter(b => b.life.recuperate).length, playing: bees.filter(b => !b.class && !b.life.recuperate && !b.life.nursery).length, fainted: bees.filter(b => b.life.faintedAt).length, todosLeft: v.state.todos.length, pollen: v.state.inventory.materials.pollen || 0, avgHappy: Math.round(bees.reduce((n, b) => n + b.life.happiness, 0) / bees.length) };
    console.log(`\n== ${label} ==`, JSON.stringify(sum), JSON.stringify(T)); for (const [k, d] of issues) console.log('  ISSUE', k, '|', d);
}
test('sim', async () => {
    await run('24 bees, auto + swap', 1, { whistle: true });
    await run('24 bees, auto + swap, return 70', 2, { whistle: true, ret: 70 });
    await run('60 bees, auto + swap', 7, { whistle: true, n: 60 });
    await run('24 bees, auto, no swap', 3, {});
    await run('24 bees, manual', 4, { auto: false });
    await run('5 bees, auto + swap', 6, { whistle: true, n: 5 });
});
