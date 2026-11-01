console.log("/// HABITICA API CLIENT ONLINE ///");

// Thin wrapper around Habitica's public v3 REST API, used by
// src/core/services/habitica-sync/ (two-way sync) and Account Info's Habitica panel. No SDK, no
// build step, just fetch() with the three headers Habitica's docs require:
//   x-api-user  - the player's Habitica User ID
//   x-api-key   - the player's Habitica API Token (found on habitica.com
//                 under Settings > API - functions like a password, which
//                 is why account-info.js only ever stores it inside the
//                 same encrypted personalInfo blob as everything else on
//                 that page, never in plain Settings)
//   x-client    - identifies the calling TOOL (not the player) to
//                 Habitica's servers; a fixed string is fine per their own
//                 docs ("Testing" is explicitly called out as acceptable
//                 for anything short of a published, widely-used tool)
//
// Habitica's API is meant to be called directly from client-side JS (their
// own docs show a jQuery AJAX example hitting habitica.com directly) - this
// sandbox's own network egress is allowlisted and can't reach habitica.com
// to prove that live, so the real browser round-trip (including whether
// Habitica's CORS headers behave as expected for this app's actual origin)
// still needs a real click-through. Every call below fails informatively
// rather than silently if that assumption turns out wrong.
const HabiticaAPI = {
    BASE_URL: 'https://habitica.com/api/v3',
    CLIENT_ID: 'bizzybee-terminal-import',

    _headers(userId, apiToken) {
        return {
            'Content-Type': 'application/json',
            'x-api-user': userId,
            'x-api-key': apiToken,
            'x-client': `${userId}-${HabiticaAPI.CLIENT_ID}`
        };
    },

    // Wraps fetch + Habitica's {success, data} / {success:false, message}
    // response envelope into one place, so every call below throws a real,
    // readable Error instead of each handling the response shape itself.
    async _request(method, path, userId, apiToken, body) {
        let response;
        try {
            response = await fetch(`${HabiticaAPI.BASE_URL}${path}`, {
                method,
                headers: HabiticaAPI._headers(userId, apiToken),
                body: body === undefined ? undefined : JSON.stringify(body)
            });
        } catch (error) {
            // Network failure OR a CORS rejection both land here - fetch()
            // can't distinguish them, so the message stays generic on
            // purpose rather than guessing which one it was.
            throw new Error('Could not reach Habitica - check your connection, or Habitica may be blocking this request.');
        }

        let parsed;
        try {
            parsed = await response.json();
        } catch (error) {
            throw new Error(`Habitica returned an unreadable response (HTTP ${response.status}).`);
        }

        if (!response.ok || parsed.success === false) {
            const err = new Error(parsed.message || `Habitica rejected the request (HTTP ${response.status}). Check your User ID and API Token.`);
            err.status = response.status;
            throw err;
        }

        return parsed.data;
    },

    _get(path, userId, apiToken) {
        return HabiticaAPI._request('GET', path, userId, apiToken);
    },

    // GET /user - profile, stats (level/class/hp/mp/gp), preferences, items.
    // Does NOT include tasks - see getTasks below for those.
    async getUser(userId, apiToken) {
        return HabiticaAPI._get('/user', userId, apiToken);
    },

    // GET /tasks/user - every Habit, Daily, To-Do, and Reward the account
    // has, all task types mixed together in one flat array (each entry's
    // own `type` field tells them apart: 'habit' | 'daily' | 'todo' | 'reward').
    async getTasks(userId, apiToken) {
        return HabiticaAPI._get('/tasks/user', userId, apiToken);
    },

    // ---- Two-way sync (src/core/services/habitica-sync/, 2026-10-10) ----

    // Completed To-Dos are NOT in getTasks - they come from this list.
    // Needed so a To-Do finished on Habitica isn't mistaken for a deleted one.
    async getCompletedTodos(userId, apiToken) {
        return HabiticaAPI._get('/tasks/user?type=completedTodos', userId, apiToken);
    },

    // needsCron: Habitica hasn't started the player's new day yet. Its own
    // apps run cron on open; scoring before that lands on the old day.
    async getCronState(userId, apiToken) {
        // Nov 1 2026 (Craft): + lastCron, so the sync can tell when Habitica is still on yesterday.
        return HabiticaAPI._get('/user?userFields=needsCron,lastCron', userId, apiToken);
    },
    async runCron(userId, apiToken) {
        return HabiticaAPI._request('POST', '/cron', userId, apiToken);
    },

    // tasks: one task object or an array (one request either way).
    async createTasks(userId, apiToken, tasks) {
        return HabiticaAPI._request('POST', '/tasks/user', userId, apiToken, tasks);
    },
    async updateTask(userId, apiToken, taskId, changes) {
        return HabiticaAPI._request('PUT', `/tasks/${encodeURIComponent(taskId)}`, userId, apiToken, changes);
    },
    async deleteTask(userId, apiToken, taskId) {
        return HabiticaAPI._request('DELETE', `/tasks/${encodeURIComponent(taskId)}`, userId, apiToken);
    },
    // direction 'up' = complete / + ; 'down' = un-complete / -
    async scoreTask(userId, apiToken, taskId, direction) {
        return HabiticaAPI._request('POST', `/tasks/${encodeURIComponent(taskId)}/score/${direction === 'down' ? 'down' : 'up'}`, userId, apiToken);
    }
};
