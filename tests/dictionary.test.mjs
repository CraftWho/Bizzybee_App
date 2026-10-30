// Rich dictionary terms (Oct 28 2026): extra fields save, update and clear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness() {
    const save = { schemaVersion: 8, user: { name: 'T' }, quests: [], dailyTasks: [], dictionary: [] };
    const data = new Map([['bizzybee_user_data', JSON.stringify(save)]]);
    const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
    const ctx = vm.createContext({ localStorage, console: { log() {}, error() {} }, Event, window: { location: { pathname: '/' }, dispatchEvent() {} }, fetch: async () => ({ ok: false }) });
    vm.runInContext(readFileSync(new URL('../src/core/db.js', import.meta.url), 'utf8') + '\nglobalThis.vault = Vault;', ctx);
    return ctx.vault;
}

test('dictionary: rich fields save, update and clear', async () => {
    const v = harness();
    await v.init();
    const t = v.addDictionaryTerm({ name: 'Flexbox', category: 'CSS', definition: 'A layout.', full: 'CSS Flexible Box Layout', code: 'display: flex;', examples: 'Center a button\n\nA nav bar', mdnUrl: 'https://developer.mozilla.org/x', source: 'mdn', image: '' });
    assert.equal(t.full, 'CSS Flexible Box Layout');
    assert.equal(t.examples.length, 2);                 // blank lines dropped
    assert.equal(t.source, 'mdn');
    assert.equal('image' in t, false);                  // empty = not stored
    v.updateDictionaryTerm(t.id, { code: '', w3Url: 'https://www.w3schools.com/css/css3_flexbox.asp' });
    const u = v.getDictionaryTerms().find(x => x.id === t.id);
    assert.equal('code' in u, false);
    assert.equal(u.w3Url, 'https://www.w3schools.com/css/css3_flexbox.asp');
    assert.equal(u.full, 'CSS Flexible Box Layout');    // untouched fields stay
    v.updateDictionaryTerm(t.id, { name: 'Flex' });     // old-style update still works
    assert.equal(v.getDictionaryTerms().find(x => x.id === t.id).name, 'Flex');
});
