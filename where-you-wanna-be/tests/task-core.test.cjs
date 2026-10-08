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
  ["future version", { v: 3 }], ["string version", { v: "1" }], ["invalid ID", { id: "not-an-id" }], ["unknown field", { remoteURL: "https://example.org" }],
  ["missing title", { title: undefined }], ["empty title", { title: " \n " }], ["long title", { title: "a".repeat(49) }], ["title newline", { title: "one\ntwo" }], ["C1 control", { title: "x\u0085y" }], ["bidi override", { title: "x\u202Ey" }], ["bidi isolate", { firstStep: "x\u2066y" }],
  ["long first step", { firstStep: "a".repeat(161) }], ["long smaller step", { smallerStep: "a".repeat(161) }], ["too many steps", { steps: Array(31).fill("one") }], ["empty step", { steps: [" "] }], ["nonstring step", { steps: [5] }], ["long step", { steps: ["a".repeat(161)] }],
  ["zero minutes", { minutes: 0 }], ["too many minutes", { minutes: 1441 }], ["fractional minutes", { minutes: 1.5 }], ["string minutes", { minutes: "10" }], ["missing flexible", { flexible: undefined }],
  ["invalid day", { day: "2026-02-30" }], ["year zero", { day: "0000-01-01" }], ["nonleap day", { day: "2025-02-29" }], ["nonUTC timestamp", { start: "2026-10-05T14:00:00-07:00" }], ["normalized invalid timestamp", { start: "2026-02-30T21:00:00Z" }], ["24-hour timestamp", { start: "2026-10-05T24:00:00Z" }], ["invalid zone", { timezone: "Not/A_Timezone" }], ["mismatched day and time", { day: "2026-10-06" }]
]) test(`reject ${name}`, () => assert.throws(() => task.validate({ ...sample, ...patch })));
test("valid leap day", () => assert.equal(task.validate({ ...sample, day: "2024-02-29", start: undefined }).day, "2024-02-29"));
test("day and time match in UTC when time zone is omitted", () => assert.equal(task.validate({ ...sample, timezone: undefined }).day, "2026-10-05"));
test("reject mismatched UTC day without a time zone", () => assert.throws(() => task.validate({ ...sample, day: "2026-10-06", timezone: undefined })));
for (const patch of [{ title: "x\ud800" }, { firstStep: "x\udfff" }, { smallerStep: "\udc00" }, { steps: ["\ud800"] }]) test(`reject lone UTF-16 surrogate ${checks}`, () => assert.throws(() => task.decode(raw({ ...sample, ...patch }))));
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
const nodeID = number => `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
const branch = { v: 2, id: sample.id, title: "Prepare for the trip", firstStep: "Keep this reference note", minutes: 10, flexible: false, kind: "group", subtasks: [
  { id: nodeID(1), parentID: sample.id, kind: "group", title: "Pack bag", minutes: 10, flexible: false, steps: ["Original reference step"] },
  { id: nodeID(2), parentID: nodeID(1), kind: "task", title: "Put charger in bag", firstStep: "Find the charger", minutes: 2, flexible: true },
  { id: nodeID(3), parentID: sample.id, kind: "task", title: "Book train", minutes: 5, flexible: false, day: sample.day, start: sample.start, timezone: sample.timezone }
] };
const clone = value => JSON.parse(JSON.stringify(value));
function editedBranch(edit) { const value = clone(branch); edit(value); return value; }
function chain(depth) {
  return { v: 2, id: nodeID(1000), title: "Goal", minutes: 1, flexible: true, kind: "group", subtasks: Array.from({ length: depth - 1 }, (_, i) => ({ id: nodeID(1001 + i), parentID: nodeID(1000 + i), kind: i === depth - 2 ? "task" : "group", title: `Level ${i + 2}`, minutes: 1, flexible: true })) };
}
test("v2 branch round trip preserves wire ordering and canonical IDs", () => { const clean = task.validate(branch); assert.deepEqual(task.decode(task.encode(branch)), clean); assert.equal(clean.id, sample.id.toLowerCase()); assert.equal(clean.subtasks[0].parentID, sample.id.toLowerCase()); assert.deepEqual(clean.subtasks.map(n => n.id), branch.subtasks.map(n => n.id)); });
test("v2 root and nested group flexible is canonicalized true", () => { const clean = task.validate(branch); assert.equal(clean.flexible, true); assert.equal(clean.subtasks[0].flexible, true); assert.equal(clean.subtasks[2].flexible, false); });
test("v2 empty group is readable and has no calendar task", () => { const empty = { ...branch, subtasks: [] }; assert.equal(task.rows(empty).length, 1); assert.throws(() => task.calendarTask(empty, empty.id)); });
test("v2 exact ten-level branch accepts and eleventh level rejects", () => { assert.equal(task.rows(task.decode(task.encode(chain(10)))).at(-1).depth, 10); assert.throws(() => task.validate(chain(11)), /10 levels/); });
test("v2 children may precede parents without changing wire order", () => { const value = editedBranch(b => b.subtasks.reverse()); assert.deepEqual(task.validate(value).subtasks.map(n => n.id), value.subtasks.map(n => n.id)); assert.deepEqual(task.rows(value).map(r => r.item.title), ["Prepare for the trip", "Book train", "Pack bag", "Put charger in bag"]); });
test("v2 row context includes the exact immediate parent and relative depth", () => { const row = task.rows(branch).find(r => r.item.id === nodeID(2)); assert.equal(row.depth, 3); assert.equal(row.parent.title, "Pack bag"); });
for (const [name, edit] of [
  ["missing root kind", b => delete b.kind], ["leaf root kind", b => b.kind = "task"], ["missing subtasks", b => delete b.subtasks], ["nonarray subtasks", b => b.subtasks = {}],
  ["root proposed day", b => b.day = sample.day], ["root proposed time", b => b.start = sample.start], ["root unknown field", b => b.completed = true], ["root null note", b => b.firstStep = null],
  ["root null timezone", b => b.timezone = null], ["null node", b => b.subtasks[0] = null], ["array node", b => b.subtasks[0] = []],
  ["node unknown field", b => b.subtasks[1].reminder = true], ["node nested version", b => b.subtasks[1].v = 1], ["node nested subtasks", b => b.subtasks[1].subtasks = []],
  ["missing node parent", b => delete b.subtasks[1].parentID], ["malformed node parent", b => b.subtasks[1].parentID = "bad"], ["missing node kind", b => delete b.subtasks[1].kind],
  ["unknown node kind", b => b.subtasks[1].kind = "appointment"], ["group proposed day", b => b.subtasks[0].day = sample.day], ["group proposed time", b => b.subtasks[0].start = sample.start],
  ["node null optional", b => b.subtasks[1].steps = null], ["node long title", b => b.subtasks[1].title = "a".repeat(49)], ["node hidden control", b => b.subtasks[1].title = "x\u202Ey"],
  ["node invalid minutes", b => b.subtasks[1].minutes = 0], ["node nonboolean flexible", b => b.subtasks[1].flexible = "true"], ["node mismatched day", b => b.subtasks[2].day = "2026-10-06"],
  ["duplicate node ID", b => b.subtasks[2].id = b.subtasks[1].id], ["duplicate root ID", b => b.subtasks[1].id = b.id.toLowerCase()],
  ["orphan node", b => b.subtasks[1].parentID = nodeID(900)], ["leaf as parent", b => b.subtasks[1].parentID = b.subtasks[2].id], ["self cycle", b => b.subtasks[0].parentID = b.subtasks[0].id],
  ["disconnected group cycle", b => { b.subtasks[1].kind = "group"; b.subtasks[0].parentID = b.subtasks[1].id; }]
]) test(`reject v2 ${name}`, () => assert.throws(() => task.validate(editedBranch(edit))));
test("v2 total row cap includes the root and keeps byte cap independent", () => {
  const value = { ...branch, subtasks: Array.from({ length: 199 }, (_, i) => ({ id: nodeID(2000 + i), parentID: branch.id, kind: "task", title: "x", minutes: 1, flexible: true })) };
  assert.throws(() => task.validate(value), /too long/, "200 individually valid rows exceed the unchanged16KiB transport limit.");
  value.subtasks.push({ ...value.subtasks[0], id: nodeID(3000) }); assert.throws(() => task.validate(value), /shared task group/);
});
test("v2 byte limit accepts exactly16KiB and rejects one extra combining character", () => {
  const value = task.validate({ ...branch, subtasks: [] }); value.firstStep = "a";
  const remaining = 16384 - Buffer.byteLength(JSON.stringify(value));
  value.firstStep += "\u0301".repeat(Math.floor(remaining / 2)) + (remaining % 2 ? "b" : "");
  assert.equal(Buffer.byteLength(JSON.stringify(value)), 16384); assert.equal(task.decode(task.encode(value)).v, 2);
  value.firstStep += "\u0301"; assert.throws(() => task.encode(value), /too long/);
});
test("v2 node Unicode and HTML remain plain text", () => { const value = editedBranch(b => b.subtasks[1].title = "<img> 👨‍👩‍👧‍👦 café e\u0301"); assert.equal(task.decode(task.encode(value)).subtasks[1].title, value.subtasks[1].title); });
test("v2 group copied as a plain indented tree with no invented date", () => { const value = editedBranch(b => b.subtasks[2].day = undefined); delete value.subtasks[2].start; const text = task.plainText(value); assert.match(text, /^Prepare for the trip \(bigger task\)/); assert.match(text, /\n  Pack bag \(bigger task\)/); assert.match(text, /\n    Put charger in bag/); assert.match(text, /Reference step 1: Original reference step/); assert.doesNotMatch(text, /Suggested/); });
test("v1 copied details retain optional steps and explicit suggested time", () => { const text = task.plainText(sample); assert.match(text, /About 10 minutes/); assert.match(text, /Suggested: 2026-10-05T21:00:00Z/); assert.match(text, /Step 2: Hang jackets/); });
test("v2 calendar requires a selected individual leaf", () => { const date = new Date("2026-10-06T00:00:00Z"); assert.throws(() => task.calendarFile(branch, date)); assert.throws(() => task.calendarFile(branch, date, date, branch.id)); assert.throws(() => task.calendarFile(branch, date, date, nodeID(1))); assert.throws(() => task.calendarFile(branch, date, date, nodeID(900))); });
test("v2 explicit leaf calendar copy includes exactly one event and leaf details", () => { const date = new Date("2026-10-06T00:00:00Z"), file = task.calendarFile(branch, date, date, nodeID(2)); assert.equal(file.match(/BEGIN:VEVENT/g).length, 1); assert.match(file, /SUMMARY:Put charger in bag/); assert.match(file, /DESCRIPTION:Find the charger/); assert.match(file, /DTEND:20261006T000200Z/); assert.doesNotMatch(file, /Pack bag|Book train|VALARM|ATTENDEE/); });
test("v2 leaf-only calendar metadata never inherits group notes or day", () => { const leaf = task.calendarTask(branch, nodeID(2)); assert.equal(leaf.day, undefined); assert.equal(leaf.start, undefined); assert.equal(leaf.firstStep, "Find the charger"); assert.equal(leaf.kind, undefined); assert.equal(leaf.parentID, undefined); assert.equal(leaf.v, 1); });
test("v2 missing calendar date still rejects instead of inferring today", () => assert.throws(() => task.calendarFile(branch, new Date(NaN), new Date(), nodeID(2))));
test("v2 app and web links contain the identical reviewed whole group", () => { assert.deepEqual(task.fromLink(task.link(branch)), task.validate(branch)); assert.deepEqual(task.decode(new URL(task.appLink(branch)).searchParams.get("data")), task.validate(branch)); });
test("shared Core v2 interoperability fixture accepts seconds and Foundation fractions", () => {
  const fixture = JSON.parse('{"v":2,"id":"00000000-0000-4000-8000-000000000001","kind":"group","title":"Morning","minutes":10,"flexible":true,"subtasks":[{"id":"00000000-0000-4000-8000-000000000002","parentID":"00000000-0000-4000-8000-000000000001","kind":"task","title":"Drink water","minutes":2,"flexible":true},{"id":"00000000-0000-4000-8000-000000000003","parentID":"00000000-0000-4000-8000-000000000001","kind":"task","title":"Take a walk","minutes":10,"flexible":false,"day":"2026-10-07","start":"2026-10-07T09:00:00Z","timezone":"UTC"}]}');
  assert.deepEqual(task.decode(raw(fixture)), task.validate(fixture));
  fixture.subtasks[1].start = "2026-10-07T09:00:00.000Z";
  assert.equal(task.decode(raw(fixture)).subtasks[1].start, fixture.subtasks[1].start);
});
test("named v1 attachment and existing web link carry the same identity and fields", () => { const data = task.fileData(sample); assert.deepEqual(task.fromFileData(data), task.fromLink(task.link(sample))); assert.equal(task.fileName(sample), "put-the-laundry-away.wannabetask"); assert.equal(task.fileMIME, "application/vnd.zestyts.wannabe-task+json"); });
test("v2 attachment keeps the whole branch, ordering and Unicode as raw task JSON", () => { const value = editedBranch(b => b.subtasks[1].title = "Read 📚 — café e\u0301"); const bytes = task.fileData(value); assert.equal(bytes[0], 123); assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)), task.fromFileData(bytes)); assert.deepEqual(task.fromFileData(bytes), task.fromLink(task.link(value))); });
test("ten-level attachment accepts without flattening its parent relationships", () => { const decoded = task.fromFileData(task.fileData(chain(10))); assert.equal(task.rows(decoded).at(-1).depth, 10); });
test("attachment filename cannot contain a path, URL or executable suffix", () => { assert.equal(task.fileName({ ...sample, title: "../../résumé / notes? <script>.exe" }), "resume-notes-script-exe.wannabetask"); assert.equal(task.fileName({ ...sample, title: "📚 日本語" }), "task.wannabetask"); });
test("attachment accepts exactly16KiB and rejects raw padding one byte over", () => { const rawBytes = Buffer.from(JSON.stringify(task.validate(sample))); const exact = Buffer.concat([rawBytes, Buffer.alloc(16384 - rawBytes.length, 32)]); assert.equal(task.fromFileData(exact).id, sample.id.toLowerCase()); assert.throws(() => task.fromFileData(Buffer.concat([exact, Buffer.from(" ")])), /16 KB/); });
for (const [name, bytes] of [
  ["empty", new Uint8Array()], ["invalid UTF8", Uint8Array.from([0xc3, 0x28])], ["UTF8 BOM", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(sample))])],
  ["UTF16 JSON", Buffer.from(JSON.stringify(sample), "utf16le")], ["not JSON", Buffer.from("<html>not a task</html>")], ["array root", Buffer.from(JSON.stringify([sample]))],
  ["unknown field", Buffer.from(JSON.stringify({ ...sample, completed: true }))], ["unsupported version", Buffer.from(JSON.stringify({ ...sample, v: 3 }))], ["eleventh level", Buffer.from(JSON.stringify(chain(11)))]
]) test(`reject malformed attachment ${name}`, () => assert.throws(() => task.fromFileData(bytes)));
test("attachment decoder accepts an ArrayBuffer without reading unrelated bytes", () => { const bytes = task.fileData(sample); assert.deepEqual(task.fromFileData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), task.validate(sample)); const padded = new Uint8Array(bytes.length + 4); padded.set(bytes, 2); assert.deepEqual(task.fromFileData(padded.subarray(2, -2)), task.validate(sample)); });
console.log(`${checks} task codec/calendar checks passed.`);
