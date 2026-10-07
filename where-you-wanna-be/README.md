# Where You Wanna Be website

Support, privacy, and task-sharing pages for the iPhone and iPad app, currently in testing.

## Browser task-group source follow-up — October 6, 2026

**This browser source adds task-group compatibility.** Matching local app configuration remains **0.9.9 (development build 28)**; no new app upload is implied. **144 browser checks passed** (128 codec/Calendar checks and 16 page-interaction checks). Native app verification is tracked separately in [Validation](../../WSAD/VALIDATION.md).

The browser source keeps version-1 single-task composition and backward-compatible link review, and adds strict version-2 whole-branch review. A group shows all included descendants with task/group context and notes/reference steps; opening it creates no tasks, dates, reminders, or checkmarks. A compatible iPhone/iPad app offers one reviewed branch acceptance with dates off by default and an optional suggested-timing choice. Older builds need an update for group acceptance.

Android and other browsers can read both versions without an app account. For a group Calendar copy, the recipient chooses one actionable subtask and its date/time; the page does not invent a group event or download all children automatically. It can provide copied details or a reviewed `.ics` file. Calendar applications handle import and reminders. The source still has no task backend, inbox, live progress, remote requests, analytics, or browser persistence; anyone with a link can read its included details.

Run the dependency-free checks from `outputs/Store-Website`:

```sh
node where-you-wanna-be/tests/task-core.test.cjs
node where-you-wanna-be/tests/task-page.test.cjs
```

## Historical website source checkpoint — October 5, 2026

**Source updated October 5, 2026, for 0.9.9 (build 27).** The earlier September 20 privacy draft remains incorporated. Native task import requires an app build with task sharing; this file does not establish TestFlight status.

- Support: https://zestyts.github.io/where-you-wanna-be/
- Privacy: https://zestyts.github.io/where-you-wanna-be/privacy.html
- Task composer/reviewer: https://zestyts.github.io/where-you-wanna-be/task.html

Keep these URLs stable because the app and App Store listing use them. Task links have a `#task=` Base64URL JSON fragment; neither this page nor the app uses a sharing server, task inbox, or account. The recipient reviews a separate copy. The page supports Android/browser task composition and review, an explicit `wannabe://task?data=` app link, and a recipient-chosen `.ics` calendar copy. Google Calendar documents `.ics` imports on a computer; the page links to those instructions and offers copied details for manual mobile entry. Calendar copies have no sender, attendees, or alarms; users set reminders in their calendar.

`task-core.js` is a small browser/CommonJS module implementing bounded version-1 decoding and iCalendar generation. `task.js` provides the page interactions with `textContent`, no remote requests, analytics, external fonts, cookies, or browser persistence. The task page has a restrictive CSP and no-referrer policy. Browsers and messaging services can retain the full task link; anyone with it can read the task.

Run the dependency-free codec and calendar checks with:

```sh
node where-you-wanna-be/tests/task-core.test.cjs
```

Serving locally for browser review:

```sh
python3 -m http.server 8765
```

The public app version remains 0.9.9. Future beta uploads increment the build number only.
