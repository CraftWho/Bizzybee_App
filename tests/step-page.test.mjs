// Steps page (Nov 21 2026, Craft): Step stats numbers, hourly steps from
// Health Connect, our own hourly count when the step app only saves day
// totals, and the 30-day fill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return ymd(d); };
const today = day(0);

function harness(state, { health } = {}) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], dailyTasks: [], hive: { bees: [], tickets: 0, lifeTick: today }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const window = { location: { pathname: '/' }, dispatchEvent() {}, addEventListener() {},
        Capacitor: health ? { isNativePlatform: () => true, Plugins: { Health: health } } : undefined };
    const document = { readyState: 'loading', addEventListener() {}, getElementById: () => null };
    const ctx = vm.createContext({ localStorage, console: { log() {}, error() {}, warn() {} }, Event, window, document, location: window.location, fetch: async () => ({ ok: false }), setTimeout, clearTimeout });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; Math.random = () => 0.5;', ctx);
    if (health) vm.runInContext(readFileSync(new URL('../src/core/services/phone/phone.js', import.meta.url), 'utf8') + '\nglobalThis.phone = BizzyPhone;', ctx);
    return { v: ctx.vault, phone: ctx.phone, data };
}

test('step page: streaks, records, XP and history', async () => {
    const steps = { [day(-9)]: 9000, [day(-8)]: 9100, [day(-7)]: 9200, [day(-6)]: 100, [day(-3)]: 8000, [day(-2)]: 8500, [day(-1)]: 12000, [today]: 2319 };
    const { v } = harness({ steps, stepGoal: 8000, bonusXP: [{ key: `steps:${day(-1)}`, date: day(-1), xp: 120 }, { key: `stepgoal:${day(-1)}`, date: day(-1), xp: 25 }, { key: 'other', date: day(-1), xp: 999 }] });
    await v.init();
    const P = v.getStepPage(today);
    assert.equal(P.today.steps, 2319);
    assert.equal(P.today.min, 23);
    assert.equal(P.today.toGoal, 8000 - 2319);
    assert.equal(P.streak.cur, 3);                     // -3, -2, -1 (today not done yet doesn't break it)
    assert.equal(P.streak.best, 3);
    assert.equal(P.days[0].day, today);                // newest first
    assert.equal(P.days.length, 8);
    assert.equal(P.days.find(x => x.day === day(-1)).xp, 145);   // from the real XP entries only
    assert.equal(P.days.find(x => x.day === day(-2)).xp, 85 + 25); // no entries: steps/100 + goal bonus
    assert.equal(P.records.bestDay.steps, 12000);
    assert.equal(P.records.total, Object.values(steps).reduce((a, b) => a + b, 0));
    assert.equal(P.records.goalDays, 6);
    assert.equal(P.records.since, day(-9));
    assert.ok(P.records.bestWeek.steps >= 12000);
    // a gap day breaks the best-streak run
    const { v: v2 } = harness({ steps: { [day(-5)]: 9000, [day(-3)]: 9000, [day(-2)]: 9000 }, stepGoal: 8000 });
    await v2.init();
    const P2 = v2.getStepPage(today);
    assert.equal(P2.streak.best, 2);
    assert.equal(P2.streak.bestFrom, day(-3));
    assert.equal(P2.streak.cur, 0);                    // yesterday missed
});

test('step page: empty save works', async () => {
    const { v } = harness({});
    await v.init();
    const P = v.getStepPage(today);
    assert.equal(P.today.steps, 0);
    assert.equal(P.streak.cur, 0);
    assert.equal(P.records.total, 0);
    assert.equal(P.days.length, 1);
});

function fakeHealth({ hourly, total, past = {} }) {
    return {
        isAvailable: async () => ({ available: true }),
        checkAuthorization: async () => ({ readAuthorized: ['steps'] }),
        async queryAggregated({ startDate, endDate, bucket }) {
            const s = new Date(startDate), e = new Date(endDate);
            const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
            if (s >= midnight) {   // today
                if (bucket === 'day') return { samples: [{ startDate, endDate, value: total() }] };
                return { samples: hourly().map((v, h) => { const t = new Date(midnight); t.setHours(h); return { startDate: t.toISOString(), value: v }; }).filter(x => x.value) };
            }
            const out = [];
            for (const [k, v] of Object.entries(past)) {
                const t = new Date(k + 'T00:00:00');
                if (t < s || t >= e) continue;
                if (bucket === 'day') out.push({ startDate: t.toISOString(), value: v.total });
                else v.hours.forEach((n, h) => { if (n) { const x = new Date(t); x.setHours(h); out.push({ startDate: x.toISOString(), value: n }); } });
            }
            return { samples: out };
        },
    };
}

test('hourly steps: real Health Connect hours are kept', async () => {
    const nowH = new Date().getHours();
    const arr = new Array(24).fill(0); arr[0] = 0; for (let h = 0; h <= nowH; h++) arr[h] = 100 + h;
    const total = arr.reduce((a, b) => a + b, 0);
    const { v, phone } = harness({}, { health: fakeHealth({ hourly: () => arr, total: () => total }) });
    await v.init();
    assert.equal(await phone.Steps.sync(), total);
    const h = v.state.stepHours[today];
    assert.equal(h.src, 'hc');
    assert.equal(JSON.stringify(h.h), JSON.stringify(arr));
    const P = v.getStepPage(today);
    assert.equal(P.today.span.busy, nowH);
});

test('hourly steps: an all-day block falls back to our own count', async () => {
    let total = 1000;
    const nowH = new Date().getHours();
    const block = () => { const a = new Array(24).fill(0); a[0] = total; return a; };   // Samsung-style midnight block
    const { v, phone } = harness({}, { health: fakeHealth({ hourly: block, total: () => total }) });
    await v.init();
    await phone.Steps.sync();
    let h = v.state.stepHours[today];
    if (nowH >= 2) {
        assert.equal(h.src, 'snap');
        assert.equal(h.pre, 1000);                     // first check: "1,000 steps before <hour>", not dumped in this hour
        assert.equal(h.from, nowH);
        assert.equal(h.h[nowH], 0);
        let sp = v.getStepPage(today).today.span;
        assert.equal(sp.pre, 1000); assert.equal(sp.busy, null);
        total = 1500; await phone.Steps.sync();
        h = v.state.stepHours[today];
        assert.equal(h.h[nowH], 500);                  // +500 new steps this hour
        assert.equal(h.last, 1500);
        await phone.Steps.sync();
        assert.equal(v.state.stepHours[today].h[nowH], 500);   // no double count
        sp = v.getStepPage(today).today.span;
        assert.equal(sp.busy, nowH); assert.equal(sp.pre, 1000);
    }
});

test('hourly steps: steps after "now" or not adding up are not trusted', async () => {
    const nowH = new Date().getHours();
    if (nowH > 21) return;
    const bad = new Array(24).fill(0); bad[nowH] = 300; bad[23] = 300;
    const { v, phone } = harness({}, { health: fakeHealth({ hourly: () => bad, total: () => 600 }) });
    await v.init();
    await phone.Steps.sync();
    assert.equal(v.state.stepHours[today].src, 'snap');
});

test('30-day fill: past totals and hours, no XP, never lowers a day, once a day', async () => {
    const hrs = new Array(24).fill(0); hrs[8] = 3000; hrs[18] = 6000;
    const past = { [day(-2)]: { total: 9000, hours: hrs }, [day(-3)]: { total: 4000, hours: new Array(24).fill(0) }, [day(-40)]: { total: 7000, hours: hrs } };
    const { v, phone, data } = harness({ steps: { [day(-3)]: 5000 } }, { health: fakeHealth({ hourly: () => [], total: () => 0, past }) });
    await v.init();
    const xpBefore = JSON.stringify(v.state.bonusXP || []);
    await phone.Steps.sync();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(v.state.steps[day(-2)], 9000);
    assert.equal(v.state.steps[day(-3)], 5000);        // kept the higher number we had
    assert.equal(v.state.steps[day(-40)], undefined);  // older than 30 days
    assert.equal(v.state.stepHours[day(-2)].src, 'hc');
    assert.equal(v.state.stepHours[day(-2)].h[18], 6000);
    assert.equal(JSON.stringify(v.state.bonusXP || []), xpBefore);   // past days pay nothing
    assert.equal(data.get('bb_steps_backfill'), today);
    const P = v.getStepPage(today);
    assert.equal(P.days.find(x => x.day === day(-2)).span.first, 8);
    assert.equal(P.days.find(x => x.day === day(-2)).span.last, 18);
});

// Samsung Health can save one midnight-to-midnight block per day, and Health
// Connect then spreads it evenly over the hours (here 9,600 steps = 400 an hour).
test('hourly steps: Samsung\'s even spread is not used as step times', async () => {
    const even = (n) => new Array(24).fill(0).map((_, h) => (h <= n ? 400 : 0));
    const nowH = new Date().getHours();
    // today: spread over the hours so far, but the day total is the whole block
    const { v, phone } = harness({}, { health: fakeHealth({ hourly: () => even(nowH), total: () => 9600 }) });
    await v.init();
    await phone.Steps.sync();
    assert.equal(v.state.stepHours[today].src, 'snap');
    // a past day: 24 even hours that add up exactly
    const past = { [day(-1)]: { total: 9600, hours: even(23) } };
    const h2 = harness({}, { health: fakeHealth({ hourly: () => [], total: () => 0, past }) });
    await h2.v.init();
    await h2.phone.Steps.sync();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(h2.v.state.steps[day(-1)], 9600);          // the day total still fills in
    assert.equal(h2.v.state.stepHours[day(-1)], undefined);  // but no fake times
});
