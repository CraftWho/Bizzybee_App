// Nov 24 2026 (Craft): the Settings card that compares this device with the cloud copy.
// The cloud time is the server's upload time, so it must never call the cloud "newer"
// just because this device uploaded a moment after its last change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/features/settings/cloud-controls.js', import.meta.url), 'utf8');
const start = src.indexOf('function syncVerdict(');
const end = src.indexOf('\n}\n', start) + 3;
const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(start, end) + '; globalThis.syncVerdict = syncVerdict;', ctx);
const v = ctx.syncVerdict;
const a = '2026-11-24T16:47:46Z', b = '2026-11-24T16:48:34Z';   // device change, then the upload 48 seconds later
const lv = (level, xp, device) => ({ level, xp, device });

test('sync card: this device\'s own upload is In sync, even though the cloud time is later', () => {
    assert.match(v({ localUpdatedAt: a, cloudUpdatedAt: b, mine: true, unsent: false, local: lv(13, 426), cloud: lv(13, 426) }), /In sync/);
    assert.match(v({ localUpdatedAt: b, cloudUpdatedAt: a, mine: true, unsent: true, local: lv(13, 430), cloud: lv(13, 426) }), /not sent yet/);
});

test('sync card: a copy from another device names it and says which has more progress', () => {
    const newer = v({ localUpdatedAt: a, cloudUpdatedAt: b, mine: false, unsent: false, local: lv(13, 426), cloud: lv(12, 300, 'PC browser') });
    assert.match(newer, /saved by PC browser/); assert.match(newer, /This device has more progress/); assert.match(newer, /before you use Load from Cloud/);
    assert.match(v({ localUpdatedAt: a, cloudUpdatedAt: b, mine: false, unsent: false, local: lv(12, 300), cloud: lv(13, 426, 'PC browser') }), /cloud copy has more progress/);
    assert.match(v({ localUpdatedAt: a, cloudUpdatedAt: b, mine: false, unsent: false, local: lv(13, 426), cloud: lv(13, 426) }), /same on both/);
    assert.match(v({ localUpdatedAt: b, cloudUpdatedAt: a, mine: false, unsent: true, local: lv(13, 426), cloud: lv(13, 400) }), /This device is newer/);
    assert.match(v({ localUpdatedAt: null, cloudUpdatedAt: b, mine: false }), /Comparison unavailable/);
});
