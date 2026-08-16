console.log("/// HABITICA API CLIENT ONLINE ///");

// Thin wrapper around Habitica's public v3 REST API - read-only calls used
// by src/features/account-info/'s "Import from Habitica" panel. No SDK, no
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
    // response envelope into one place, so both getUser/getTasks below
    // throw a real, readable Error instead of each having to duplicate
    // this response-shape handling.
    async _get(path, userId, apiToken) {
        let response;
        try {
            response = await fetch(`${HabiticaAPI.BASE_URL}${path}`, {
                method: 'GET',
                headers: HabiticaAPI._headers(userId, apiToken)
            });
        } catch (error) {
            // Network failure OR a CORS rejection both land here - fetch()
            // can't distinguish them, so the message stays generic on
            // purpose rather than guessing which one it was.
            throw new Error('Could not reach Habitica - check your connection, or Habitica may be blocking this request.');
        }

        let body;
        try {
            body = await response.json();
        } catch (error) {
            throw new Error(`Habitica returned an unreadable response (HTTP ${response.status}).`);
        }

        if (!response.ok || body.success === false) {
            throw new Error(body.message || `Habitica rejected the request (HTTP ${response.status}). Check your User ID and API Token.`);
        }

        return body.data;
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
    }
};
