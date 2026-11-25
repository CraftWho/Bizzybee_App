// Nov 24 2026 (Craft): the one back rule (BBNav in src/core/app.js). Back is always one page, a finished
// form never stays behind you, and the phone's back key and the ← hexagon share one list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/core/app.js', import.meta.url), 'utf8');
const code = src.slice(src.indexOf('const BBNav = '), src.indexOf('try { BBNav.track(); }'));
const ORIGIN = 'https://bee.test';
const P = (name) => `/src/features/${name}`;

// A tiny browser: real history (entries + index), sessionStorage, and one "page" at a time.
function browser() {
    const store = new Map();
    const b = { entries: [], at: -1, navType: 'navigate', referrer: '', nav: null };
    const sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    const load = () => {
        const u = new URL(b.entries[b.at], ORIGIN);
        const location = { pathname: u.pathname, search: u.search, origin: ORIGIN, href: u.href, replace: (to) => b.go(to, true) };
        const history = { get length() { return b.entries.length; }, state: null, back: () => { if (b.at > 0) { b.at--; b.navType = 'back_forward'; b.referrer = b.refs[b.at]; load(); } } };
        const ctx = vm.createContext({ location, history, sessionStorage, URL, document: { referrer: b.referrer }, performance: { getEntriesByType: () => [{ type: b.navType }] } });
        vm.runInContext(code + '; globalThis.nav = BBNav;', ctx);
        b.nav = ctx.nav; b.history = history;
        b.nav.track();
    };
    b.refs = [];
    // A link tap (or location.href = ...), or a replace.
    b.go = (to, replace = false) => {
        const from = b.at >= 0 ? new URL(b.entries[b.at], ORIGIN).href : '';
        const path = to.startsWith('http') ? to.slice(ORIGIN.length) : to;
        if (replace) { b.entries[b.at] = path; b.refs[b.at] = from; }
        else { b.entries = b.entries.slice(0, b.at + 1); b.refs = b.refs.slice(0, b.at + 1); b.entries.push(path); b.refs.push(from); b.at++; }
        b.navType = 'navigate'; b.referrer = from;
        load();
    };
    b.here = () => b.entries[b.at];
    b.list = () => JSON.parse(store.get('bb_nav') || '[]');
    return b;
}

test('back: Home > Dailies > New Daily > Save lands on Dailies, and the next back is Home (not the form)', () => {
    const b = browser();
    b.go(P('home/home.html')); b.go(P('dailies/dailies.html')); b.go(P('dailies/create-daily.html'));
    b.nav.back({ fallback: './dailies.html' });                  // what the form does after Save
    assert.equal(b.here(), P('dailies/dailies.html'));
    b.nav.back();
    assert.equal(b.here(), P('home/home.html'));
    assert.equal(b.nav.back(), false);                           // on Home with nothing behind: nothing to do
    assert.equal(b.here(), P('home/home.html'));
});

test('back: a form opened from Home goes back to Home, not to the list', () => {
    const b = browser();
    b.go(P('home/home.html')); b.go(P('dailies/create-daily.html?id=d1'));
    b.nav.back({ fallback: './dailies.html' });
    assert.equal(b.here(), P('home/home.html'));
});

test('back: a form opened with nothing behind it opens its list in its place', () => {
    const b = browser();
    b.go(P('todos/create-todo.html'));
    b.nav.back({ fallback: './todos.html' });
    assert.equal(b.here(), P('todos/todos.html'));
    assert.deepEqual(b.entries, [P('todos/todos.html')]);        // replaced, so the form is gone
    assert.deepEqual(b.list(), [P('todos/todos.html')]);
});

test('back: three pages deep, each back is exactly one page', () => {
    const b = browser();
    b.go(P('home/home.html')); b.go(P('quests/quests.html')); b.go(P('quests/quest.html?id=q1')); b.go(P('guide/guide.html'));
    b.nav.back(); assert.equal(b.here(), P('quests/quest.html?id=q1'));
    b.nav.back(); assert.equal(b.here(), P('quests/quests.html'));
    b.nav.back(); assert.equal(b.here(), P('home/home.html'));
});

test('back: a new quest opens its page in place of the form; back from it is the quest list', () => {
    const b = browser();
    b.go(P('home/home.html')); b.go(P('quests/quests.html')); b.go(P('quests/create-quest.html'));
    b.nav.leaveTo('./quest.html?id=new1');
    assert.equal(b.here(), P('quests/quest.html?id=new1'));
    b.nav.back();
    assert.equal(b.here(), P('quests/quests.html'));
});

test('back: deleting a quest from its edit form forgets the quest page too', () => {
    const b = browser();
    b.go(P('home/home.html')); b.go(P('quests/quests.html')); b.go(P('quests/quest.html?id=q1')); b.go(P('quests/create-quest.html?id=q1'));
    b.nav.leaveTo('./quests.html', p => /\/quest\.html\?/.test(p) && p.includes('id=q1'));
    assert.equal(b.here(), P('quests/quests.html'));
    assert.deepEqual(b.list(), [P('home/home.html'), P('quests/quests.html')]);
    b.nav.back();
    assert.equal(b.here(), P('home/home.html'));                 // not the deleted quest, not the form
});

test('back: a page that replaced itself is skipped, and back does not loop', () => {
    const b = browser();
    b.go(P('home/home.html')); b.go(P('inventory/inventory.html')); b.go(P('hive-bees/hive-bees.html'), true);   // old link redirect
    b.nav.back();
    assert.equal(b.here(), P('home/home.html'));
});

test('back: with no page behind and not on Home, back opens Home', () => {
    const b = browser();
    b.go(P('guide/guide.html'));
    assert.equal(b.nav.back(), true);
    assert.equal(b.here(), P('home/home.html'));
});

test('back: a Settings group is closed first, without leaving the page', () => {
    const b = browser();
    b.go(P('home/home.html')); b.go(P('settings/settings.html'));
    let closed = 0;
    b.history.state = { st: 'cloud' }; b.history.back = () => { closed++; };
    b.nav.back();
    assert.equal(closed, 1);
    assert.deepEqual(b.list(), [P('home/home.html'), P('settings/settings.html')]);
});
