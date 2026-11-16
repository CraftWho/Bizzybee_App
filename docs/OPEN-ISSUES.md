# Open issues

Known problems that are **not fixed**. Newest first.

## Eve is off and can't reach Ollama on the PC (Nov 16 2026)

**Status:** open, saved for later. Eve works on the PC browser only for now. The phone app uses the Eve skill instead (see `eve-add-quest`).

**What was checked on the PC**
- Ollama is the AMD AI bundle build (`...\AMD\ai_bundle\ollama\`). Its app opens on an Apps launcher, not a chat. It had stopped; opening the app brought it back.
- It answers at `localhost:11434` and still has `qwen2.5:7b-instruct`. No new model is needed.
- Chrome's "Local network access" for the BizzyBee site is now allowed.
- A real request from the BizzyBee page still fails, so Ollama is refusing the site's address.

**Steps to finish (for later)**
1. In PowerShell: `setx OLLAMA_ORIGINS "https://bizzybeee.netlify.app,http://localhost:*"`
2. Quit Ollama from the tray icon, then open it again from the Start menu.
3. Rerun the check from the site (`fetch('http://localhost:11434/api/tags')` should list the model).
4. Leave Ollama's "Expose Ollama to the network" switch off. It opens Ollama to the whole Wi-Fi.
5. Then build, after approval: the new Eve and Adam persona, a Settings address field with a Test button that names the cause, Eve on for the PC only (`EEVEE_PAUSED` in `src/core/ui/llm-engine/llm-engine.js` hides "Chat with Eve" while true), and the live hive summary for her prompt.
6. Data plan chosen: manual export plus `workshop/eve-notes.md`, the live hive summary, and a weekly Discord drop box.

## Web reminders and notifications — removed, not solved (Oct 31 2026)

**Status:** open. Reminders only ring in the Android app (phone alarms, `src/core/services/native/native.js`).
The website (browser and installed web app) sends **no** reminders or notifications.

**Why it was removed**
- The in-tab timer (`reminders.js`) only fired if a check ran during that exact minute. Sleeping tabs missed it,
  and it never worked in Chrome on Android.
- Web push (`push.js` + the `push-send` server function) needed a Netlify timer running all day
  (every 5–15 min, ~100–288 runs a day) even with no users, so it used up Netlify credits.
  It also sent reminders for tasks already finished on another device, and could arrive up to 15 min early.

**Where the old code is:** git tag `web-reminders-archive` (the last working version).
Removed: `src/core/services/reminders/reminders.js`, `src/core/services/push/push.js`,
`netlify/functions/push-send.mjs`, `netlify/functions/push-subscribe.mjs`, `netlify/lib/push-store.mjs`,
`tests/push.test.mjs`, the `web-push` package, and the push handlers in `sw.js`.
Kept: `src/core/services/notify/notify.js` (the reminder planner the APK uses) and the reminder fields in task forms.

**Leftover cleanup (manual):** the Netlify environment variables `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
`VAPID_SUBJECT` are no longer used and can be deleted in Netlify › Site configuration › Environment variables.

**Free options to look at later (not chosen yet)**
- **OneSignal** (onesignal.com): web push service. The pricing page lists unlimited web push sends and up to
  10,000 subscribers per send on the free plan, but "time delayed sends" are not listed for free, so scheduled
  reminders may need a paid plan. Check before choosing.
- **ntfy** (ntfy.sh): free, open-source push. Supports delayed/scheduled messages on the free server
  (limits apply). The user installs the ntfy app or keeps its web page open; it isn't branded as BizzyBee.
- Whatever is chosen should be scheduled **when the reminder is set** (no timer polling all day), so it costs
  no Netlify runs.
