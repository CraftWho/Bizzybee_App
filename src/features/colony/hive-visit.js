// Visiting a friend's hive (Oct 29 2026, approved demo). Built from their
// hive card (Social, hive.mjs): level, bee names and looks, eggs, the Queen.
// No quests, tasks, jobs, vitals, decay or when they last played. Nothing
// here saves: the page works on a copy, and your own save is never touched.
(() => {
    const code = new URLSearchParams(location.search).get('code');
    const findCard = (list) => ((list || []).find(f => f.code === code && f.status === 'ok') || {}).card || null;
    let CARD = null;
    const realInit = Vault.init.bind(Vault);
    Vault.init = async function () {
        await realInit();
        CARD = findCard((Social.cachedFriends() || {}).list);
        if (!CARD) { try { CARD = findCard((await Social.friends(true)).list); } catch { /* offline or signed out */ } }
        this.save = () => {};                        // look only
        document.body.classList.add('hive-visit');
        if (!CARD) {
            document.querySelector('main').innerHTML = `<div class="hv-missing"><p>This hive isn't shared with you right now.</p><p><a href="../friends/friends.html">← Friends' hives</a></p></div>`;
            throw new Error('no card');              // stops the rest of the page quietly
        }
        const tpl = (this.state.colony.bees || []).find(b => b.rarity !== 'Royal') || { stats: { level: 1 }, life: {} };
        const copy = (o) => JSON.parse(JSON.stringify(o));
        const bees = CARD.bees.map((b, i) => ({
            ...copy(tpl), id: `visit-${i}`, name: b.n, rarity: b.r, element: b.e,
            class: b.egg ? null : (i % 3 === 2 ? null : 'visiting'),   // some wander, some rest
            life: b.egg ? { hatchOn: shiftISODate(todayISO(), 3) } : { health: 100, stamina: 100, fullness: 100, happiness: 100 },
        }));
        this.state = { ...this.state, colony: { ...this.state.colony, bees } };
        const user = { ...this.getUser(), level: CARD.level };
        this.getUser = () => user;
        this.getRoyalBee = () => null;
        const n = bees.filter(b => !beeIsBrood(b)).length;
        this.getHiveHoney = () => {
            const lit = Math.min(COLONY_HIVE_CAPACITY, Math.max(8 + CARD.level * 3, n + 2));
            return { lit, capacity: COLONY_HIVE_CAPACITY, decay: 0, lapses: 0, lapseIds: [], level: CARD.level, bees: n };
        };
        const who = CARD.owner.toUpperCase();
        document.getElementById('hv-title').textContent = `👀 ${who}'S HIVE`;
        document.getElementById('hv-title-in').textContent = `🍯 INSIDE ${who}'S HIVE`;
        document.title = `👀 ${CARD.owner}'s hive`;
    };
    // Look only: no cards, no Queen panel, no mood faces.
    window.openColonyBeeCard = () => {};
    window.openColonyQueenPanel = () => {};
    window.colonyExteriorFaces = () => {};
    window.colonyHiveView = () => 'classic';
    window.colonyBeesToHatch = () => [];
    window.colonyRoyal = () => (CARD && CARD.queen ? { kind: CARD.queen.king ? 'king' : 'queen', name: CARD.queen.name } : null);
    window.renderColonyStats = () => {
        const host = document.getElementById('cm-stats');
        if (!host || !CARD) return;
        const eggs = CARD.bees.filter(b => b.egg).length;
        host.innerHTML = `<span><b>⭐ ${CARD.level}</b><small>Level</small></span><span><b>🐝 ${CARD.bees.length - eggs}</b><small>${eggs ? `+${eggs} egg${eggs === 1 ? '' : 's'}` : 'Bees'}</small></span>`;
    };
})();
