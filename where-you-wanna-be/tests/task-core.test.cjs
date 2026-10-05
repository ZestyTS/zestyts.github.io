"use strict";
const assert = require("node:assert/strict");
const task = require("../task-core.js");
let checks = 0;
function test(name, action) { action(); checks++; process.stdout.write(`✓ ${name}\n`); }
const sample = { v: 1, id: "87D9BCC4-6821-43E5-969F-9E546F9D379C", title: "Put the laundry away", firstStep: "Carry the basket to the closet", steps: ["Fold shirts", "Hang jackets"], smallerStep: "Put away one thing", minutes: 10, flexible: false, day: "2026-10-05", start: "2026-10-05T21:00:00Z", timezone: "America/Los_Angeles" };
const raw = value => Buffer.from(JSON.stringify(value)).toString("base64url");
test("wire format round trip and canonical UUID", () => assert.deepEqual(task.decode(task.encode(sample)), { ...sample, id: sample.id.toLowerCase() }));
test("web link parser", () => assert.equal(task.fromLink(task.link(sample)).title, sample.title));
test("app link keeps the same payload", () => assert.deepEqual(task.decode(new URL(task.appLink(sample)).searchParams.get("data")), task.validate(sample)));
test("anytime task needs no day or permission", () => assert.deepEqual(task.validate({ v: 1, id: sample.id, title: "Drink water", minutes: 1, flexible: true }), { v: 1, id: sample.id.toLowerCase(), title: "Drink water", minutes: 1, flexible: true }));
test("same content ignores identity and trims text", () => assert.ok(task.sameContent(sample, { ...sample, id: "3926848e-c9b1-4cdb-9065-3e13f001dd14", title: ` ${sample.title} ` })));
test("changed task content requires a new shared snapshot", () => { assert.equal(task.sameContent(sample, { ...sample, title: "Different task" }), false); assert.equal(task.sameContent(sample, { ...sample, minutes: 20 }), false); assert.equal(task.sameContent(sample, { ...sample, steps: ["Different step"] }), false); });
test("empty optional values are omitted", () => assert.equal(task.validate({ ...sample, smallerStep: "  ", steps: [] }).smallerStep, undefined));
test("trim before checking visible character length", () => assert.equal(task.validate({ ...sample, title: ` ${"a".repeat(48)} ` }).title.length, 48));
test("Unicode emoji and combining marks survive round trip", () => { const value = { ...sample, title: "Read 📚 — café e\u0301", steps: ["👩‍👩‍👧‍👦 family time", "こんにちは"] }; assert.deepEqual(task.decode(task.encode(value)), task.validate(value)); });
test("grapheme count matches visible emoji", () => { const emoji = "👩‍👩‍👧‍👦"; assert.equal(task.count(emoji), 1); assert.equal(task.validate({ ...sample, title: emoji.repeat(48) }).title, emoji.repeat(48)); });
test("HTML stays ordinary text in payload", () => assert.equal(task.decode(task.encode({ ...sample, title: "<img src=x onerror=alert(1)>" })).title, "<img src=x onerror=alert(1)>"));
for (const [name, patch] of [
  ["future version", { v: 2 }], ["string version", { v: "1" }], ["invalid ID", { id: "not-an-id" }], ["unknown field", { remoteURL: "https://example.org" }],
  ["missing title", { title: undefined }], ["empty title", { title: " \n " }], ["long title", { title: "a".repeat(49) }], ["title newline", { title: "one\ntwo" }], ["C1 control", { title: "x\u0085y" }], ["bidi override", { title: "x\u202Ey" }], ["bidi isolate", { firstStep: "x\u2066y" }],
  ["long first step", { firstStep: "a".repeat(161) }], ["long smaller step", { smallerStep: "a".repeat(161) }], ["too many steps", { steps: Array(31).fill("one") }], ["empty step", { steps: [" "] }], ["nonstring step", { steps: [5] }], ["long step", { steps: ["a".repeat(161)] }],
  ["zero minutes", { minutes: 0 }], ["too many minutes", { minutes: 1441 }], ["fractional minutes", { minutes: 1.5 }], ["string minutes", { minutes: "10" }], ["missing flexible", { flexible: undefined }],
  ["invalid day", { day: "2026-02-30" }], ["year zero", { day: "0000-01-01" }], ["nonleap day", { day: "2025-02-29" }], ["nonUTC timestamp", { start: "2026-10-05T14:00:00-07:00" }], ["normalized invalid timestamp", { start: "2026-02-30T21:00:00Z" }], ["24-hour timestamp", { start: "2026-10-05T24:00:00Z" }], ["invalid zone", { timezone: "Not/A_Timezone" }], ["mismatched day and time", { day: "2026-10-06" }]
]) test(`reject ${name}`, () => assert.throws(() => task.validate({ ...sample, ...patch })));
test("valid leap day", () => assert.equal(task.validate({ ...sample, day: "2024-02-29", start: undefined }).day, "2024-02-29"));
test("Foundation fractional UTC timestamp", () => assert.equal(task.decode(raw({ ...sample, start: "2026-10-05T21:00:00.000Z" })).start, "2026-10-05T21:00:00.000Z"));
test("nanosecond fractional UTC timestamp", () => assert.equal(task.validate({ ...sample, start: "2026-10-05T21:00:00.123456789Z" }).start, "2026-10-05T21:00:00.123456789Z"));
test("receiver time zone day differs from UTC date", () => { const input = { ...sample, day: "2026-10-05", start: "2026-10-06T01:00:00Z" }; assert.equal(task.validate(input).day, "2026-10-05"); });
for (const encoded of ["", "!@#$", "a", "e30=", raw([sample]), raw(null), Buffer.from([0xc3, 0x28]).toString("base64url"), Buffer.from("{bad").toString("base64url"), "a".repeat(24577)]) test(`reject malformed encoding ${checks}`, () => assert.throws(() => task.decode(encoded)));
test("reject raw JSON larger than byte limit", () => assert.throws(() => task.decode(Buffer.from(JSON.stringify(sample) + " ".repeat(17000)).toString("base64url"))));
test("reject too many bytes even with a single grapheme", () => assert.throws(() => task.encode({ ...sample, title: "a" + "\u0301".repeat(9000) })));
for (const bad of ["https://evil.example/where-you-wanna-be/task.html", "https://zestyts.github.io.evil.example/where-you-wanna-be/task.html", "http://zestyts.github.io/where-you-wanna-be/task.html", "https://user@zestyts.github.io/where-you-wanna-be/task.html", "https://zestyts.github.io/other.html", "https://zestyts.github.io/where-you-wanna-be/task.html?x=1"]) test(`reject wrong link origin/path ${checks}`, () => assert.throws(() => task.fromLink(`${bad}#task=${task.encode(sample)}`)));
test("reject extra fragment parameters", () => assert.throws(() => task.fromLink(`${task.link(sample)}&other=x`)));
test("calendar UTC time and duration", () => { const file = task.calendarFile(sample, new Date("2026-10-06T01:30:00Z"), new Date("2026-10-05T00:00:00Z")); assert.match(file, /DTSTART:20261006T013000Z\r\nDTEND:20261006T014000Z/); assert.match(file, /DTSTAMP:20261005T000000Z/); assert.ok(file.endsWith("END:VCALENDAR\r\n")); });
test("calendar text escaping prevents event/property injection", () => { const value = { ...sample, title: "Read; paint, then rest\\", firstStep: "one\nBEGIN:VEVENT\nATTENDEE:evil" }; const file = task.calendarFile(value, new Date("2026-10-05T12:00:00Z")); assert.ok(file.includes("SUMMARY:Read\\; paint\\, then rest\\\\\r\n")); assert.ok(file.includes("DESCRIPTION:one\\nBEGIN:VEVENT\\nATTENDEE:evil")); assert.equal(file.split("\r\nBEGIN:VEVENT\r\n").length - 1, 1); });
test("calendar lines fold on UTF-8 bytes without splitting characters", () => { const value = { ...sample, firstStep: "🎨".repeat(100) }; const file = task.calendarFile(value, new Date("2026-10-05T12:00:00Z")); for (const line of file.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75); const unfolded = file.replace(/\r\n /g, ""); assert.ok(unfolded.includes(`DESCRIPTION:${value.firstStep}`)); });
test("calendar contains no automatic invitation, task URL, or alarm", () => { const file = task.calendarFile(sample, new Date("2026-10-05T12:00:00Z")); assert.doesNotMatch(file, /VALARM|ATTENDEE|ORGANIZER|METHOD:REQUEST|URL:/); });
test("calendar accepts 24-hour duration across midnight", () => { const file = task.calendarFile({ ...sample, minutes: 1440 }, new Date("2026-10-05T23:50:00Z")); assert.match(file, /DTEND:20261006T235000Z/); });
test("calendar end outside supported year is rejected", () => assert.throws(() => task.calendarFile({ ...sample, minutes: 1440 }, new Date("9999-12-31T23:50:00Z"))));
test("invalid calendar start is rejected", () => assert.throws(() => task.calendarFile(sample, new Date(NaN))));
test("local date and time are not silently normalized", () => assert.throws(() => task.localStart("2026-02-30", "12:00")));
test("local time rejects invalid hour", () => assert.throws(() => task.localStart("2026-10-05", "24:00")));
test("DST spring gap is rejected", () => { const old = process.env.TZ; process.env.TZ = "America/Los_Angeles"; try { assert.throws(() => task.localStart("2026-03-08", "02:30")); assert.equal(task.localStart("2026-03-08", "03:30").getHours(), 3); } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; } });
console.log(`${checks} task codec/calendar checks passed.`);
