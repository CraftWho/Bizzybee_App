// Daily bonus (Nov 1 2026, Craft): a 7-day week; missing a day restarts at day 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness() {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], hive: { bees: [], tickets: 0 }, onboarding: { stage: 'done' } };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', context);
    return context.vault;
}

test('daily bonus: once a day, days in a row move along, a miss restarts', async () => {
    const v = harness();
    await v.init();
    const coins = v.getCoins();
    assert.equal(v.claimDailyBonus('2026-11-01').qty, 5);               // day 1: 5 coins
    assert.equal(v.getCoins(), coins + 5);
    assert.equal(v.claimDailyBonus('2026-11-01'), null);                // once a day
    assert.equal(v.claimDailyBonus('2026-11-02').day, 1);               // day 2
    for (const d of ['03', '04', '05', '06']) v.claimDailyBonus(`2026-11-${d}`);
    const t = v.getTicketCount();
    assert.equal(v.claimDailyBonus('2026-11-07').kind, 'ticket');      // day 7
    assert.equal(v.getTicketCount(), t + 1);
    assert.equal(v.claimDailyBonus('2026-11-08').day, 0);               // new week
    assert.equal(v.getDailyBonus('2026-11-10').day, 0);                 // missed the 9th: day 1 again
});
