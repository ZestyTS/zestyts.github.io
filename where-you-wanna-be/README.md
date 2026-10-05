# Where You Wanna Be website

Support, privacy, and task-sharing pages for the iPhone and iPad app, currently in testing.

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
