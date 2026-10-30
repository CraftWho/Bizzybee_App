// Redeem codes (FullHeal): 5 uses total, no time limit, then the record goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCode, redeemCode, CODE_MAX_USES } from '../netlify/lib/terminal-access.mjs';

test('redeem codes: 5 uses in total, then the code is removed', () => {
    let record = newCode('FullHeal', Date.parse('2026-10-30T12:00:00Z'));
    assert.equal(record.name, 'fullheal');
    assert.equal(record.max, CODE_MAX_USES);
    const lefts = [];
    for (let i = 0; i < CODE_MAX_USES; i++) {
        const r = redeemCode(record);
        lefts.push(r.left);
        record = r.next;
    }
    assert.deepEqual(lefts, [4, 3, 2, 1, 0]);
    assert.equal(record, null);
});

test('redeem codes: switched off or used up cannot be redeemed', () => {
    assert.throws(() => redeemCode({ ...newCode('fullheal'), active: false }), /not active/);
    assert.throws(() => redeemCode(undefined), /not active/);
    assert.throws(() => redeemCode({ ...newCode('fullheal'), uses: 5 }), /no uses left/);
});
