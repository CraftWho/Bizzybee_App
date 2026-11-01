// Ranks (Oct 31 2026, Craft): a rank every 5 levels, Tiers every 5 levels
// past 50; each rank up is claimed once; ranks reached before the update
// count as claimed (no back-pay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness(level) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], hive: { bees: [], tickets: 0 }, onboarding: { stage: 'done' }, characterLevelBar: { acknowledgedLevel: level, leveledUpAt: null } };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault; globalThis.rankForLevel = rankForLevel;', context);
    return { v: context.vault, rankForLevel: context.rankForLevel };
}

test('ranks: names by level, Tiers every 5 levels past 50 (Nov 1 2026)', () => {
    const { rankForLevel } = harness(1);
    assert.equal(rankForLevel(4).name, 'Larva');
    assert.equal(rankForLevel(15).name, 'Forager');
    assert.equal(rankForLevel(50).name, 'Royal Keeper');
    assert.equal(rankForLevel(54).name, 'Royal Keeper');
    assert.equal(rankForLevel(55).name, 'Tier 1');
    assert.equal(rankForLevel(59).name, 'Tier 1');
    assert.equal(rankForLevel(60).name, 'Tier 2');
});

test('ranks: old ranks count as claimed; a new rank pays once', async () => {
    const { v } = harness(12);
    await v.init();
    v.state.characterLevelBar.acknowledgedLevel = 12;
    assert.equal(v.getRank().rank.name, 'Worker');
    assert.equal(v.getRank().pending.length, 0);                 // Hatchling + Worker: no back-pay
    v.state.characterLevelBar.acknowledgedLevel = 15;            // reached Forager
    assert.equal(v.getRank().pending.length, 1);
    const tickets = v.getTicketCount();
    const r = v.claimRankUp();
    assert.equal(r.rank.name, 'Forager');
    assert.equal(v.getTicketCount(), tickets + 2);
    assert.equal(v.claimRankUp(), null);                         // paid once
    assert.equal(v.getRank().pending.length, 0);
});
