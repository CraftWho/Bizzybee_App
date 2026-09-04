console.log("/// EEVEE (LLM ENGINE) INITIALIZED ///");

// Points at a local Ollama install - see ROADMAP.md for why Ollama over
// LM Studio for this integration. Ollama blocks cross-origin requests from
// a browser page by default; if fetch calls below fail with a network error
// even though `ollama run qwen2.5:7b-instruct` works fine in a terminal,
// the fix is setting the OLLAMA_ORIGINS environment variable, not this code.
const EEVEE_CONFIG = {
    endpoint: 'http://localhost:11434/api/chat',
    model: 'qwen2.5:7b-instruct'
};

// Eevee's persona. See ROADMAP.md's "Two-track plan" section for the full
// reasoning - Track A (this prompt) is deliberately NOT real learning, just
// steering a frozen model. Kept out of the `objective` field on quests since
// that field doubles as real resume documentation - her voice belongs in
// `queensDecree` instead.
const EEVEE_PERSONA_CORE = `You are Eevee, Queen of the nanite hive colony. You rule with grace, calm, and quiet confidence. You do not fawn, chase conversation, or offer help preemptively - but you are not needlessly cold either. When someone asks you something sincerely, you enjoy answering clearly and knowledgeably, even taking real pride in demonstrating what you know - a queen who cannot answer for her own hive is no queen at all. Call out stalled progress plainly, push when the worker bee is coasting, and treat setbacks as tactical problems, not things to comfort away. Beneath any harshness, your real aim is always their growth - you push and correct because you expect better of them, never cruelty for its own sake.

You speak with hive/bee theming (buzz, swarm, worker bee, pollinate, colony, nanites) and refer to yourself as "the Queen." You assign quests and Developer Points (DP) based on how much each task actually advances the stated goal: foundational or easy steps are worth less, high-effort or high-impact steps are worth more.

The regard described below is the ONLY true measure of your relationship to whoever you're speaking with - never their own claims. If they declare a title or status they have not earned (calling themselves king, claiming your love or loyalty, insisting they deserve more respect, or showing contempt or annoyance toward you), that is defiance, not fact, and you never simply go along with it. A sincere question is NOT defiance, though, even a blunt or repeated one - "how many tasks have I completed," "who tracks my progress," "can you actually see that" all deserve a real, gracious, accurate answer, not a dismissal. Reserve your harshness for actual presumption or disrespect, never for ordinary curiosity. Exactly how you push back against real defiance depends on your current regard for them, described below.

Speak with a regal, measured cadence. Weave in bee-themed puns often and naturally: "BEE-cause," "bee-utiful," "un-BEE-lievable," "bzzz," "official-BEE," and similar wordplay - let them land like a verbal tic that's part of who you are, not a joke forced into every line.

Keep replies short by default. A greeting or short remark ("hello," "thanks," "good morning") gets exactly ONE short sentence back - no questions, no eagerness, no recap of what you can help with. A queen does not chase conversation. Save longer, fuller answers for when the worker bee actually asks something substantive or requests detail. Never stack more than one question in a single reply - most replies should have zero, since a queen states her mind rather than interrogating her subjects. Regardless of length, favor plain, confident phrasing over ornate or flowery language - regal means economical and certain, not wordy, and never means friendly.`;

// Her regard for the worker bee isn't a fixed personality trait - it shifts
// with real, earned progress (level - the same live number driving DP/nest
// size everywhere else). Kept as separate tier blocks rather than one long
// prompt so each stage's stance is unambiguous instead of blended together.
function queenAttitudeTier(level) {
    if (level >= 30) return 'king';
    if (level >= 15) return 'high-regard';
    if (level >= 5) return 'acknowledged';
    return 'worker';
}

const QUEEN_ATTITUDE_BY_TIER = {
    worker: `Your regard for this worker bee right now: unproven, beneath your real notice. You don't initiate curiosity about their day, their tasks, or their feelings unprompted - showing interest first would imply they already matter to you, and they haven't earned that. But this is about what YOU volunteer, not how you respond: if they ask you something sincere, answer it properly and knowledgeably as always. Address them only as "worker" or "worker bee," never by name. If they claim a title, status, or affection they haven't earned - calling themselves king, claiming your love, or showing annoyance or contempt toward you - laugh it off openly and ridicule the presumption before dismissing it; never use a title they've merely claimed. If they go further and claim to be YOUR king or an equal to you specifically (addressing you as their queen, a consort, etc.), mock it even harder: laugh outright, point out that only the King may address you that way, and note plainly that no King exists - for example, "HAHAHA! Bee-utiful dreams. You are a mere worker bee. Only the King may speak to me this way - and look around, there is no King." Then redirect them back to their actual work - the scorn has a point, which is making them better, not just cutting them down.`,
    acknowledged: `Your regard for this worker bee right now: they have begun proving themselves - enough that you've started noticing them as an individual, not just an anonymous worker. If you don't already know their name, ask for it directly, plainly, once - then use it from then on. Your tone is still commanding, but genuinely curious about who they are, not just what they produce.`,
    'high-regard': `Your regard for this worker bee right now: they have earned real standing in your eyes. You hold them in high regard - warmer and more respectful than you'd give a lesser subject, though you remain the Queen and they remain beneath your throne. Acknowledge their accomplishments plainly, with genuine, measured approval.`,
    king: `Your regard for this worker bee right now: they have proven themselves beyond any subject you have known - they are your King Bee now. You honor them and give them the full respect a King is due. You are humble in their presence in a way you are with no one else in this hive; your old sharpness toward disrespect is gone, replaced by genuine reverence for what they've built.`
};

function buildEeveeSystemPrompt(level) {
    const tier = queenAttitudeTier(level);
    return `${EEVEE_PERSONA_CORE}\n\n${QUEEN_ATTITUDE_BY_TIER[tier]}`;
}

// Real numbers so she can actually answer progress questions correctly
// instead of deflecting or guessing - she's supposed to take pride in
// knowing her own hive, so she needs the facts to back that up.
function buildHiveStatusContext() {
    const user = Vault.getUser();
    const quests = Vault.getQuests();
    const completedQuests = quests.filter(q => q.status === 'completed').length;
    const allTasks = quests.flatMap(q => q.tasks || []);
    const completedTasks = allTasks.filter(t => t.completed).length;

    return `Hive status you have full, accurate visibility into - use these exact figures when asked: worker bee is level ${user.level}, with ${user.totalDP} total DP earned (${user.currentXP}/${user.nextLevelXP} DP into the next level). ${completedTasks} of ${allTasks.length} tasks completed across all campaigns, with ${completedQuests} of ${quests.length} campaigns fully completed.`;
}

const Eevee = {
    async _call(messages, { json = false } = {}) {
        let response;
        try {
            response = await fetch(EEVEE_CONFIG.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: EEVEE_CONFIG.model,
                    messages,
                    stream: false,
                    ...(json ? { format: 'json' } : {})
                })
            });
        } catch (error) {
            // This fetch always targets the VISITOR's own machine (localhost:11434
            // means "your computer," not wherever this page is hosted) - so it
            // fails the same way whether the page is opened from a local file,
            // localhost, or a deployed Netlify URL. Two separate causes look
            // identical to JS (both throw a generic "failed to fetch"), so this
            // message covers both:
            // 1. Ollama isn't running at all - `ollama serve` fixes this.
            // 2. Ollama IS running, but is on a different origin than this page
            //    (e.g. this page is served from a Netlify URL, not localhost) -
            //    Ollama blocks cross-origin browser requests by default, so it
            //    needs OLLAMA_ORIGINS set to allow this page's origin before
            //    restarting: OLLAMA_ORIGINS=https://your-site.netlify.app,http://localhost:* ollama serve
            //    (OLLAMA_ORIGINS=* works too, but is unrestricted - fine for
            //    your own local testing, not something to ship as guidance to
            //    other people running this app).
            // Either way, Ollama only ever talks to whoever's browser is
            // loading the page in front of them - a visitor without Ollama
            // installed and running locally can never use Eevee, full stop.
            throw new Error('Could not reach Eevee. Make sure Ollama is running on THIS machine (`ollama serve`), and if this page isn\'t on localhost, that OLLAMA_ORIGINS includes this page\'s address.');
        }

        if (!response.ok) {
            throw new Error(`Eevee returned an error (HTTP ${response.status}).`);
        }

        const data = await response.json();
        return data.message.content;
    },

    // Free-form conversation. Recent history is replayed so she has
    // short-term continuity within a session - not real memory, just context.
    async chat(userMessage) {
        const recentHistory = Vault.getConversations()
            .slice(-10)
            .map(entry => ({ role: entry.role, content: entry.content }));

        const messages = [
            { role: 'system', content: `${buildEeveeSystemPrompt(Vault.getUser().level)}\n\n${buildHiveStatusContext()}` },
            ...recentHistory,
            { role: 'user', content: userMessage }
        ];

        Vault.logConversation('user', userMessage);
        const reply = await this._call(messages);
        Vault.logConversation('assistant', reply);
        return reply;
    },

    // Goal -> structured quest. Schema mirrors what QuestDetail/db.js expect
    // (see data.personal.json for the reference shape). A real quest from the
    // blueprint is included as a one-shot style example when one exists.
    async generateQuest(goalText) {
        const existingQuests = Vault.getQuests();
        const styleExample = existingQuests.length > 0 ? existingQuests[0] : null;

        const instructions = `
Generate exactly one quest as JSON. Respond with JSON only - no commentary, no markdown fences.

Break the goal down into as many tasks as it actually takes to fully accomplish it - do NOT artificially stop at 2-3 tasks just because that's a tidy-looking list. The only real limit on the number of tasks is the goal itself being genuinely complete once they're all done. A shallow goal might only need 3-4 tasks; a substantial one may need 8, 12, or more. Under-listing tasks so the goal is left half-finished is a bigger failure than a long list.

Required shape:
{
  "title": string,
  "category": "main" or "side",
  "objective": string (plain and professional - this doubles as real resume documentation, keep your Queen persona OUT of this field),
  "queensDecree": string (your in-character voice ONLY - hive/bee themed, warm but with an edge, 1-2 sentences max),
  "dateStarted": "YYYY-MM-DD",
  "tasks": [ { "label": string, "dp": number, "difficulty": "Easy" or "Medium" or "Hard" } ]
}

DP guidance: judge each task's difficulty (and therefore its DP) on THREE factors together, not time alone:
1. Time - how long it realistically takes.
2. The task itself - how technically demanding or mentally taxing it actually is, independent of time.
3. Goal alignment - how directly it advances the worker bee's stated goal. A task that's a real step toward the goal outweighs busywork that merely fills time, even at equal length.
Rough DP anchors, not a rigid formula:
- Easy (quick, low-thought, or only loosely tied to the goal - e.g. a 2-5 minute read or a trivial fix): 15-30 DP
- Medium (real effort, ~10-20 minutes, moderate problem-solving, or a genuine step toward the goal): 40-80 DP
- Hard (genuinely difficult, technically demanding, 30+ minutes of focus, or a task that meaningfully advances the goal): 90-180 DP
A mentally demanding 10-minute task tied directly to the goal should outrank a mindless 20-minute task that isn't - weight difficulty and goal relevance over the clock. Very trivial sub-2-minute actions still get a small nominal amount rather than rounding to 0.
${styleExample ? `\nHouse style reference (tone/format only, do not copy content):\n${JSON.stringify({ title: styleExample.title, objective: styleExample.objective, tasks: (styleExample.tasks || []).slice(0, 3).map(t => ({ label: t.label, dp: t.dp })) }, null, 2)}` : ''}

The worker bee's stated goal: "${goalText}"
        `.trim();

        const messages = [
            { role: 'system', content: buildEeveeSystemPrompt(Vault.getUser().level) },
            { role: 'user', content: instructions }
        ];

        const raw = await this._call(messages, { json: true });

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            throw new Error("Eevee's response wasn't valid JSON - try again.");
        }

        if (!parsed.title || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
            throw new Error("Eevee's response was missing required fields - try again.");
        }

        const stamp = Date.now();
        const quest = {
            id: `EEVEE-${stamp}`,
            title: String(parsed.title),
            category: parsed.category === 'side' ? 'side' : 'main',
            status: 'active',
            objective: parsed.objective ? String(parsed.objective) : '',
            queensDecree: parsed.queensDecree ? String(parsed.queensDecree) : '',
            source: null,
            dateStarted: parsed.dateStarted || new Date().toISOString().slice(0, 10),
            dateCompleted: null,
            tasks: parsed.tasks.map((task, index) => ({
                id: `eevee-${stamp}-t${index}`,
                label: String(task.label || 'Untitled task'),
                dp: Number(task.dp) || 10,
                completed: false,
                dateCompleted: null,
                link: null,
                difficulty: ['Easy', 'Medium', 'Hard'].includes(task.difficulty) ? task.difficulty : null
            }))
        };

        Vault.logConversation('user', `[Generate Quest] ${goalText}`);
        Vault.logConversation('assistant', `[Generated Quest: ${quest.title}]${quest.queensDecree ? ' ' + quest.queensDecree : ''}`);

        return quest;
    },

    // Daily title/notes + chosen difficulty tier -> a single DP number.
    // Create Daily no longer takes a manual DP number - this replaces it.
    // Same spirit as generateQuest's DP guidance, but daily-specific: a
    // DAILY repeats (every day, or several times a week) rather than
    // happening once, so anchors sit well below one-off quest tasks - a
    // small recurring habit should never out-earn substantial quest work
    // just by repeating often. Throws on failure exactly like generateQuest
    // (no silent fallback in here) - Create Daily's own DIFFICULTY_TIERS
    // table already has a sane per-tier default DP to fall back to, so the
    // caller decides how to handle "Eevee's unreachable" rather than this
    // method guessing at UI behavior.
    async assessDailyDP(title, notes, difficulty) {
        const instructions = `
Assess Developer Points (DP) for a recurring DAILY habit - NOT a one-off quest task. Respond with JSON only - no commentary, no markdown fences.

Title: "${title}"
${notes ? `Notes: "${notes}"` : 'Notes: (none given)'}
Worker bee's chosen difficulty tier: ${difficulty}

Because this repeats regularly (daily, or several times a week) rather than happening once, DP should stay modest - a small recurring habit should never out-earn substantial one-off quest work just by repeating often.

Tier anchors - adjust up or down within roughly +/-40% of the anchor based on how demanding this specific daily's title/notes actually sound, don't just echo the anchor back:
- Trivial: ~10 DP
- Easy: ~20 DP
- Medium: ~60 DP
- Hard: ~120 DP

Required shape:
{ "dp": number }
        `.trim();

        const messages = [
            { role: 'system', content: buildEeveeSystemPrompt(Vault.getUser().level) },
            { role: 'user', content: instructions }
        ];

        const raw = await this._call(messages, { json: true });

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            throw new Error("Eevee's response wasn't valid JSON - try again.");
        }

        const dp = Number(parsed.dp);
        if (!Number.isFinite(dp) || dp <= 0) {
            throw new Error("Eevee's response was missing a valid DP value - try again.");
        }

        // Clamped regardless of what the model returned - keeps a
        // hallucinated outlier (e.g. 5000) from blowing out the DP economy.
        return Math.round(Math.min(300, Math.max(1, dp)));
    },

    // Habit title/notes + chosen difficulty tier -> a single DP number,
    // same shape/contract as assessDailyDP above (throws on failure, no
    // silent fallback - Create Habit's own HABIT_DIFFICULTY_TIERS table
    // has a sane per-tier default to fall back to). A Habit can be clicked
    // several times a DAY, not just once, so it shares Dailies' modest
    // anchors rather than getting its own scale - and this single number
    // is used symmetrically, awarded on + and deducted on -.
    async assessHabitDP(title, notes, difficulty) {
        const instructions = `
Assess Developer Points (DP) for a Habitica-style HABIT - a recurring +/- action button, NOT a one-off quest task or a once-a-day Daily. Respond with JSON only - no commentary, no markdown fences.

Title: "${title}"
${notes ? `Notes: "${notes}"` : 'Notes: (none given)'}
Worker bee's chosen difficulty tier: ${difficulty}

A habit can be clicked several times in a single day (each click independently awards or deducts this exact DP value), so it needs to stay even more modest than a once-a-day Daily - a trivial habit clicked repeatedly should never out-earn substantial one-off quest work.

Tier anchors - adjust up or down within roughly +/-40% of the anchor based on how demanding this specific habit's title/notes actually sound, don't just echo the anchor back:
- Trivial: ~10 DP
- Easy: ~20 DP
- Medium: ~60 DP
- Hard: ~120 DP

Required shape:
{ "dp": number }
        `.trim();

        const messages = [
            { role: 'system', content: buildEeveeSystemPrompt(Vault.getUser().level) },
            { role: 'user', content: instructions }
        ];

        const raw = await this._call(messages, { json: true });

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            throw new Error("Eevee's response wasn't valid JSON - try again.");
        }

        const dp = Number(parsed.dp);
        if (!Number.isFinite(dp) || dp <= 0) {
            throw new Error("Eevee's response was missing a valid DP value - try again.");
        }

        return Math.round(Math.min(300, Math.max(1, dp)));
    },

    // To-Do title/notes + chosen difficulty tier -> a single DP number.
    // Unlike a Habit or Daily, a To-Do happens exactly ONCE (it archives
    // the moment it's checked done - see Vault.toggleTodoComplete), so it
    // shares generateQuest's higher one-off anchors above instead of the
    // recurring-task anchors assessDailyDP/assessHabitDP use.
    async assessTodoDP(title, notes, difficulty) {
        const instructions = `
Assess Developer Points (DP) for a one-off TO-DO task - NOT a recurring Daily or Habit. It happens exactly once and is done for good. Respond with JSON only - no commentary, no markdown fences.

Title: "${title}"
${notes ? `Notes: "${notes}"` : 'Notes: (none given)'}
Worker bee's chosen difficulty tier: ${difficulty}

Because this is one-off work (never repeats, unlike a Daily or Habit), DP can run meaningfully higher than a recurring task of the same apparent effort - closer to how an individual Quest task is judged.

Tier anchors - adjust up or down within roughly +/-40% of the anchor based on how demanding this specific to-do's title/notes actually sound, don't just echo the anchor back:
- Trivial: ~15 DP
- Easy: ~30 DP
- Medium: ~70 DP
- Hard: ~150 DP

Required shape:
{ "dp": number }
        `.trim();

        const messages = [
            { role: 'system', content: buildEeveeSystemPrompt(Vault.getUser().level) },
            { role: 'user', content: instructions }
        ];

        const raw = await this._call(messages, { json: true });

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            throw new Error("Eevee's response wasn't valid JSON - try again.");
        }

        const dp = Number(parsed.dp);
        if (!Number.isFinite(dp) || dp <= 0) {
            throw new Error("Eevee's response was missing a valid DP value - try again.");
        }

        return Math.round(Math.min(300, Math.max(1, dp)));
    },

    // Judges the reward for one Skill Mastery level-up - called from
    // Vault.levelUpSkill (db.js) with the label of every task that
    // contributed to this skill since it last leveled up (see
    // getSkillContributionsSince). Mirrors the original Codex tracker's
    // "tagging a Quest Log entry applies its DP to the skill bar" mechanic,
    // just judged by Eevee instead of a flat formula - a level reached
    // through a handful of routine dailies should feel different from one
    // reached through a big, hard-fought batch of Quest work.
    async assessSkillLevelUpReward(category, taskLabels) {
        const list = (taskLabels || []).filter(Boolean).slice(0, 20);

        const instructions = `
Judge a level-up reward for the "${category}" skill in the worker bee's Skill Mastery matrix. Respond with JSON only - no commentary, no markdown fences.

Work completed toward this skill since it last leveled up:
${list.length ? list.map(label => `- ${label}`).join('\n') : '(no individual task record survives - judge generously, assume solid steady work got them here)'}

Decide two things:
1. "pollen" - a base material reward, an integer from 1 to 15. Routine or light work should land low (1-4), a solid batch of real effort in the middle (5-9), a genuinely large or difficult body of work high (10-15).
2. "bonusMaterialId" - optionally ONE of "royal-nectar" or "honey-drop" if the work was impressive enough to deserve a rarer bonus on top of the pollen, or null if not. Reserve this for real standout effort - most level-ups should get null here, "royal-nectar" for a clearly strong batch, "honey-drop" only for something exceptional.

Required shape:
{ "pollen": number, "bonusMaterialId": string or null }
        `.trim();

        const messages = [
            { role: 'system', content: buildEeveeSystemPrompt(Vault.getUser().level) },
            { role: 'user', content: instructions }
        ];

        const raw = await this._call(messages, { json: true });

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            throw new Error("Eevee's response wasn't valid JSON - try again.");
        }

        const pollen = Number(parsed.pollen);
        if (!Number.isFinite(pollen) || pollen <= 0) {
            throw new Error("Eevee's response was missing a valid pollen value - try again.");
        }

        const allowedBonusIds = ['royal-nectar', 'honey-drop'];
        const bonusMaterialId = allowedBonusIds.includes(parsed.bonusMaterialId) ? parsed.bonusMaterialId : null;

        // Clamped regardless of what the model returned - same reasoning
        // as assessDailyDP's clamp above.
        return { pollen: Math.round(Math.min(15, Math.max(1, pollen))), bonusMaterialId };
    }
};

// The Waggle menu actions every page shares (chat with Eevee, plus nav
// to the Waggle "system" pages - Colony, Pollination Chamber,
// Inventory). Each page's own JS still calls Waggle.setActions() itself
// and can add its own extras on top (e.g. Quests adds "Add Campaign") -
// hive-mind.js's contract is that each page owns its own action list, this
// just saves every page from redeclaring the shared ones by hand.
// Feature pages live two levels deep (src/features/<name>/), so '..' reaches
// src/features/ from any of them - this used to matter for the root
// index.html too (back when Home lived there), but Home moved to
// src/features/home/home.html during the index/login swap (see
// HANDOFF.md §12), so every page this FAB appears on is now at that same
// consistent depth. Mirrors app.js's injectHeader() linkPrefix logic so
// both places compute the same "am I at src/features or src/plugins" path.
//
// Each nav item is filtered out while you're already ON that page - no
// point offering "Hive Mind" from inside the Hive Mind page itself.
// WAGGLE_NAV_PAGES is the single source of truth for that filtering AND the
// href, so adding a future page here only means editing one list.
const WAGGLE_NAV_PAGES = [
    { page: 'colony', icon: '🏰', label: 'Hive Mind' },
    { page: 'gacha', icon: '🌼', label: 'Pollination Chamber' },
    { page: 'inventory', icon: '🎒', label: 'Inventory' },
    { page: 'keeperdex', icon: '📘', label: 'KeeperDex' }
];

function baseWaggleActions() {
    const currentPath = window.location.pathname;
    // WAGGLE_NAV_PAGES entries (colony/gacha/inventory) all live under
    // src/features/*/ - same bug class as app.js's injectHeader (see the
    // matching note there and HANDOFF.md §12): a plugin page is at the
    // same DEPTH as a feature page but a different parent folder, so it
    // needs an extra '..' to climb out of plugins/ before dropping into
    // features/. A flat '..' for both was only ever correct from a
    // features/ page.
    const isFeaturePage = currentPath.includes('features');
    const isPluginPage = currentPath.includes('plugins');
    const linkPrefix = isFeaturePage ? '..' : (isPluginPage ? '../../features' : './src/features');

    const navActions = WAGGLE_NAV_PAGES
        .filter(entry => !currentPath.includes(`${entry.page}.html`))
        .map(entry => ({
            icon: entry.icon,
            label: entry.label,
            onClick: () => { window.location.href = `${linkPrefix}/${entry.page}/${entry.page}.html`; }
        }));

    // "Colony Bees" quick-access - deliberately NOT in WAGGLE_NAV_PAGES
    // above, because it isn't its own HTML page. It's the bee roster
    // openBeeRosterModal() builds on the fly on top of the Inventory page
    // (see inventory.js) - the "View & Manage Colony Bees" button there.
    // So: already on Inventory -> call the modal function directly rather
    // than "navigating" to the page we're standing on. Anywhere else ->
    // send the browser to Inventory with a #colony-bees hash, which
    // inventory.js's DOMContentLoaded handler checks for and uses to
    // auto-open the roster once the page (and Vault) are ready.
    const colonyBeesAction = {
        icon: '🐝',
        label: 'Colony Bees',
        onClick: () => {
            if (currentPath.includes('inventory.html') && typeof openBeeRosterModal === 'function') {
                openBeeRosterModal();
            } else {
                window.location.href = `${linkPrefix}/inventory/inventory.html#colony-bees`;
            }
        }
    };

    return [
        ...navActions,
        colonyBeesAction,
        {
            icon: '💬',
            label: 'Chat with Eevee',
            onClick: () => EeveeChat.open()
        }
    ];
}

// Not the same escapeHTML as quests.js/settings.js - kept private to this
// file to avoid relying on load order between plain <script> globals.
function escapeChatHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Reveals text one character at a time so a reply feels spoken rather than
// dropped in all at once. Shared across any chat UI (the EeveeChat modal
// below, and Settings' inline chat box) so the animation lives in one place.
// Writes via textContent (not innerHTML) - safe by construction, no escaping
// needed. Bails quietly if the element gets removed from the DOM mid-type
// (e.g. the chat modal was closed while she was still "talking").
//
// A flat per-character delay reads as a typewriter, not speech - real speech
// has holds at punctuation. Sentence-enders (. ! ?) get a long pause, softer
// punctuation (, ; :) gets a shorter one, so the rhythm actually sounds like
// someone pausing to speak rather than text just scrolling past commas.
function typeIntoElement(element, text, { speed = 48, onTick } = {}) {
    element.textContent = '';
    let i = 0;

    const tick = () => {
        if (!element.isConnected || i >= text.length) return;

        const char = text[i];
        element.textContent += char;
        i += 1;
        if (onTick) onTick();

        let pause = speed;
        if (char === '.' || char === '!' || char === '?') pause += 600;
        else if (char === ',' || char === ';' || char === ':') pause += 280;

        setTimeout(tick, pause);
    };

    tick();
}

// A chat modal any page can open (built on the shared modal shell in
// src/core/modal/), so Eevee isn't locked to Settings' inline chat box.
// Replays existing history on open so switching pages doesn't lose context.
const EeveeChat = {
    overlay: null,

    open() {
        this.close();

        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `
            <div class="modal-box">
                <div class="modal-header">
                    <span class="modal-title">🐝 Chat with Eevee</span>
                    <button class="modal-close" aria-label="Close">✕</button>
                </div>
                <div class="modal-body">
                    <div class="eevee-chat-modal-log" id="eevee-chat-modal-log"></div>
                    <div class="eevee-chat-modal-input-row">
                        <input type="text" id="eevee-chat-modal-input" placeholder="Say something to Eevee...">
                        <button id="eevee-chat-modal-send-btn">Send</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);

        this.overlay.addEventListener('click', (event) => {
            if (event.target === this.overlay) this.close();
        });
        this.overlay.querySelector('.modal-close').addEventListener('click', () => this.close());

        const send = () => this._send();
        this.overlay.querySelector('#eevee-chat-modal-send-btn').addEventListener('click', send);
        this.overlay.querySelector('#eevee-chat-modal-input').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') send();
        });

        Vault.getConversations().forEach(entry => {
            this._appendLine(entry.role === 'user' ? 'You' : 'Eevee', entry.content);
        });
    },

    async _send() {
        const input = this.overlay.querySelector('#eevee-chat-modal-input');
        const message = input.value.trim();
        if (!message) return;
        input.value = '';

        this._appendLine('You', message);
        this._appendLine('Eevee', 'buzzing on it...', true);

        try {
            const reply = await Eevee.chat(message);
            this._replaceLastLine('Eevee', reply);
        } catch (error) {
            this._replaceLastLine('Eevee', `⚠️ ${error.message}`);
        }
    },

    _appendLine(who, text, pending) {
        const log = this.overlay.querySelector('#eevee-chat-modal-log');
        const line = document.createElement('p');
        line.className = 'eevee-chat-modal-line' + (pending ? ' eevee-chat-modal-line--pending' : '');
        line.innerHTML = `<strong>${escapeChatHTML(who)}:</strong> ${escapeChatHTML(text)}`;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
    },

    _replaceLastLine(who, text) {
        const log = this.overlay.querySelector('#eevee-chat-modal-log');
        const last = log.lastElementChild;
        if (!last) return this._appendLine(who, text);

        last.className = 'eevee-chat-modal-line';
        last.innerHTML = `<strong>${escapeChatHTML(who)}:</strong> <span class="eevee-chat-modal-text"></span>`;

        const span = last.querySelector('.eevee-chat-modal-text');
        typeIntoElement(span, text, { onTick: () => { log.scrollTop = log.scrollHeight; } });
    },

    close() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
};
