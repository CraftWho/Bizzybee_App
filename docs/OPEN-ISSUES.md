# Open issues

Known problems that are **not fixed**. Newest first.

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
