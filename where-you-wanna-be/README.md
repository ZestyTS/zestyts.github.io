# Where You Wanna Be website

Product information, support, privacy, and browser task tools for Wanna Be on iPhone, iPad, and Android. The app is in testing; these source files do not establish TestFlight or APK availability.

## Stable public URLs

- Overview and support: https://zestyts.github.io/where-you-wanna-be/
- Privacy: https://zestyts.github.io/where-you-wanna-be/privacy.html
- Browser task tools: https://zestyts.github.io/where-you-wanna-be/task.html

Keep these URLs stable because the apps and App Store listing use them. All three pages use the site-wide `../styles.css`, global ZestyTS navigation, and the product navigation. Product-specific styles extend the shared stylesheet rather than copying a separate color palette. The homepage project list, privacy index, and sitemap link back to this product.

## Native sharing and browser fallback

Sharing starts in the app with **Today → Send a task**. A recipient can open a `.wannabetask` attachment with Wanna Be or use **Today → Import task**. The website is a fallback for people without the app and supports local composition or review; it is not a required step between apps.

The default browser share is a named `.wannabetask` file. Web links remain available as an explicit alternative. Version 1 contains a single task; version 2 contains a bigger task and its independent subtasks, preserving up to ten levels. Both formats are bounded to 16 KiB of strict UTF-8 JSON. Completion, reminders, history, and unrelated tasks do not transfer. Recipients review a separate copy; later changes do not sync.

Task details stay in the browser: no task backend, inbox, accounts, analytics, cookies, remote task requests, or browser persistence. Link details are in a `#task=` Base64URL fragment, which is not sent to GitHub Pages in a page request. Anyone with the file or link can read its contents. The task page has a restrictive Content Security Policy and no-referrer policy.

The explicit `wannabe://task?data=` link offers app handoff for browser review. Calendar export requires the recipient to choose a day and time; a group also requires one individual subtask. The `.ics` file contains no attendees or automatic alarms. Calendar applications handle review, import, and reminders. Google Calendar documents `.ics` import on a computer; copying details is available for manual mobile entry.

## Validation and preview

From the repository root:

```sh
node where-you-wanna-be/tests/task-core.test.cjs
node where-you-wanna-be/tests/task-page.test.cjs
python3 -m http.server 8765 --bind 127.0.0.1
```

The October 8 source checkpoint passed 143 codec/calendar checks and 27 DOM-flow checks, including malformed inputs, exact byte/depth boundaries, plain-text rendering, draft protection, and asynchronous file-selection races. Native app and cross-platform delivery checks are tracked with the app sources separately.
