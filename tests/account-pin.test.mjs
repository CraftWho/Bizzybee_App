// Account PIN (Oct 2026): salted PBKDF2 check, old SHA-256 hashes upgrade
// on the first correct unlock, and Forgot PIN erases the encrypted info.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';

function harness(state) {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], colony: { bees: [], tickets: 0 }, ...state };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const context = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event, crypto: webcrypto, TextEncoder, atob, btoa, Uint8Array,
        window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', context);
    return context.vault;
}

test('account pin: new PINs use a salted check, never a plain hash', async () => {
    const v = harness({});
    await v.init();
    assert.equal(v.hasAccountPin(), false);
    await v.setAccountPin('123456');
    assert.equal(v.state.accountPinHash, undefined);
    assert.equal(v.state.accountPinCheck.v, 2);
    assert.ok(await v.verifyAccountPin('123456'));
    assert.equal(await v.verifyAccountPin('654321'), false);
});

test('account pin: an old hash still unlocks once, then upgrades', async () => {
    const old = createHash('sha256').update('246810').digest('hex');
    const v = harness({ accountPinHash: old });
    await v.init();
    assert.ok(v.hasAccountPin());
    assert.equal(await v.verifyAccountPin('111111'), false);
    assert.ok(await v.verifyAccountPin('246810'));
    assert.equal(v.state.accountPinHash, undefined);
    assert.ok(v.state.accountPinCheck);
    assert.ok(await v.verifyAccountPin('246810'));
});

test('account pin: forgot PIN clears the PIN and the encrypted info only', async () => {
    const v = harness({ accountPinHash: 'abc', personalInfoEncrypted: '{"bizzybeeEncrypted":true}' });
    await v.init();
    assert.ok(v.resetAccountPin());
    assert.equal(v.hasAccountPin(), false);
    assert.equal(v.state.personalInfoEncrypted, null);
    assert.equal(v.state.user.name, 'T');
});
