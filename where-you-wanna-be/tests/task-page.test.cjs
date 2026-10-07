"use strict";
// Local DOM fixture: no browser, network, mail, Calendar, or clipboard write.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const api = require("../task-core.js");
const html = fs.readFileSync(path.join(__dirname, "../task.html"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "../task.js"), "utf8");
const id = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const leaf = { v: 1, id: id(1), title: "Drink water", minutes: 2, flexible: true };
const branch = { v: 2, id: id(10), title: "Prepare day", minutes: 10, flexible: true, kind: "group", subtasks: [
  { id: id(11), parentID: id(10), kind: "group", title: "Get ready", minutes: 5, flexible: true },
  { id: id(12), parentID: id(11), kind: "task", title: "Find clothes", minutes: 2, flexible: true, firstStep: "<img src=x onerror=alert(1)>" },
  { id: id(13), parentID: id(10), kind: "task", title: "Leave home", minutes: 5, flexible: false, day: "2026-10-07", start: "2026-10-07T16:00:00Z", timezone: "UTC" }
] };
class Element {
  constructor(tagName = "div", identifier = "") { this.tagName = tagName; this.id = identifier; this.children = []; this.listeners = new Map(); this.value = ""; this.hidden = false; this.disabled = false; this.required = false; this.checked = false; this.attributes = {}; this.validityMessage = ""; }
  set innerHTML(_) { throw new Error("Task HTML must never be assigned."); }
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children = elements; }
  querySelector(selector) { return this.children.find(child => child.tagName === selector) || null; }
  addEventListener(type, action) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(action); }
  async emit(type) { for (const action of this.listeners.get(type) || []) await action({ target: this, preventDefault() {} }); }
  click() { return this.emit("click"); }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  scrollIntoView() { this.scrolled = true; }
  getAttribute(name) { return this.attributes[name]; }
  setCustomValidity(message) { this.validityMessage = message; }
  reportValidity() { return !this.validityMessage; }
  remove() {}
}
function page(payload, hash = payload ? `#task=${api.encode(payload)}` : "") {
  const identifiers = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(identifiers).size, identifiers.length, "HTML identifiers are unique.");
  const elements = new Map(identifiers.map(identifier => [identifier, new Element("div", identifier)]));
  const get = identifier => { assert.ok(elements.has(identifier), `Element ${identifier} is declared in task.html.`); return elements.get(identifier); };
  for (const name of ["first-step-preview", "smaller-step-preview"]) get(name).append(new Element("h3"), new Element("p"));
  get("steps-preview").append(new Element("h3"), new Element("ol"));
  get("task-minutes").value = "10";
  get("task-form").reset = () => { for (const name of ["task-title", "first-step", "task-steps", "smaller-step", "suggested-day", "suggested-time"]) get(name).value = ""; get("task-minutes").value = "10"; get("suggest-time").checked = false; };
  const skip = new Element("a"), calendarJump = get("calendar-jump"); skip.attributes.href = "#main"; calendarJump.attributes.href = "#calendar-options";
  const location = { hash, pathname: "/where-you-wanna-be/task.html", search: "" }, downloads = [], blobs = [], events = new Map();
  const document = { getElementById: get, createElement: tag => { const element = new Element(tag); if (tag === "a") element.click = () => downloads.push(element.download); return element; }, body: new Element("body"), querySelectorAll: () => [skip, calendarJump], querySelector: selector => get(selector.slice(1)) };
  const context = { document, location, history: { replaceState() { location.hash = ""; } }, navigator: {}, crypto: { randomUUID: () => id(100 + blobs.length + downloads.length + ++context.uuidSequence) }, uuidSequence: 0, Intl, Date, Blob, URL: { createObjectURL(blob) { blobs.push(blob); return "blob:local-fixture"; }, revokeObjectURL() {} }, setTimeout() {} };
  context.window = { WannaBeTask: api, isSecureContext: true, addEventListener(type, action) { events.set(type, action); } };
  vm.runInNewContext(source, context, { filename: "task.js" });
  return { get, location, downloads, blobs, skip, events };
}
let checks = 0;
async function test(name, action) { await action(); checks++; process.stdout.write(`✓ ${name}\n`); }
(async () => {
  await test("v1 undated recipient has blank calendar date/time and no automatic download", () => { const p = page(leaf); assert.equal(p.get("calendar-day").value, ""); assert.equal(p.get("calendar-time").value, ""); assert.equal(p.get("calendar-task-field").hidden, true); assert.equal(p.downloads.length, 0); });
  await test("v1 blank calendar submit rejects instead of inferring today", async () => { const p = page(leaf); await p.get("calendar-form").emit("submit"); assert.equal(p.downloads.length, 0); assert.match(p.get("message").textContent, /Choose a calendar date and time/); });
  await test("v2 branch uses complete plain-text titles, real levels and immediate parents", () => { const p = page(branch), rows = p.get("branch-list").children; assert.equal(rows.length, 3); assert.equal(rows[0].children[0].textContent, "Get ready"); assert.match(rows[1].children[1].textContent, /Level 3 · Part of Get ready/); assert.equal(rows[1].children[2].children[1].textContent, "First small step: <img src=x onerror=alert(1)>"); });
  await test("ten-level browser review retains the deepest complete title and parent context", () => {
    const value = { ...branch, subtasks: Array.from({ length: 9 }, (_, i) => ({ id: id(100 + i), parentID: i ? id(99 + i) : branch.id, kind: i === 8 ? "task" : "group", title: i === 8 ? "Find the comfortable clothes for tomorrow" : `Part ${i + 2}`, minutes: 2, flexible: true })) };
    const rows = page(value).get("branch-list").children;
    assert.equal(rows.length, 9); assert.equal(rows[8].children[0].textContent, value.subtasks[8].title); assert.match(rows[8].children[1].textContent, /Level 10 · Part of Part 9/);
  });
  await test("v2 Calendar selection only contains leaves and begins unselected", () => { const p = page(branch), options = p.get("calendar-task").children; assert.deepEqual(options.map(option => option.value), ["", id(12), id(13)]); assert.equal(p.get("calendar-download").disabled, true); assert.equal(p.get("calendar-day").value, ""); assert.equal(p.get("calendar-time").value, ""); });
  await test("choosing an undated leaf never creates a date or event", async () => { const p = page(branch); p.get("calendar-task").value = id(12); await p.get("calendar-task").emit("change"); assert.equal(p.get("calendar-day").value, ""); assert.equal(p.get("calendar-time").value, ""); await p.get("calendar-form").emit("submit"); assert.equal(p.downloads.length, 0); });
  await test("dated leaf proposal prefill uses recipient local time without exporting", async () => { const p = page(branch); p.get("calendar-task").value = id(13); await p.get("calendar-task").emit("change"); const expected = new Date(branch.subtasks[2].start); assert.equal(p.get("calendar-day").value, api.localDay(expected)); assert.equal(p.get("calendar-time").value, `${String(expected.getHours()).padStart(2, "0")}:${String(expected.getMinutes()).padStart(2, "0")}`); assert.equal(p.downloads.length, 0); });
  await test("explicit leaf+day+time submit exports only that task", async () => { const p = page(branch); p.get("calendar-task").value = id(12); await p.get("calendar-task").emit("change"); p.get("calendar-day").value = "2026-10-08"; p.get("calendar-time").value = "12:30"; await p.get("calendar-form").emit("submit"); assert.equal(p.downloads.length, 1); const file = await p.blobs[0].text(); assert.equal(file.match(/BEGIN:VEVENT/g).length, 1); assert.match(file, /SUMMARY:Find clothes/); assert.doesNotMatch(file, /SUMMARY:Prepare day|SUMMARY:Get ready|VALARM|ATTENDEE/); });
  await test("switching selected leaf clears manually chosen dates rather than reusing them", async () => { const p = page(branch); p.get("calendar-task").value = id(13); await p.get("calendar-task").emit("change"); p.get("calendar-task").value = id(12); await p.get("calendar-task").emit("change"); assert.equal(p.get("calendar-day").value, ""); assert.equal(p.get("calendar-time").value, ""); });
  await test("empty shared group keeps review but hides Calendar action", () => { const p = page({ ...branch, subtasks: [] }); assert.equal(p.get("review").hidden, false); assert.equal(p.get("calendar-options").hidden, true); assert.equal(p.get("calendar-jump").hidden, true); assert.equal(p.get("branch-list").children[0].textContent, "No subtasks yet."); });
  await test("copy whole-group details preserves indentation and uses explicit fallback", async () => { const p = page(branch); await p.get("copy-details").emit("click"); assert.equal(p.get("details-fallback").hidden, false); assert.equal(p.get("task-details-text").value, api.plainText(branch)); assert.match(p.get("task-details-text").value, /\n    Find clothes/); assert.equal(p.downloads.length, 0); });
  await test("skip and Calendar anchors retain complete task fragment", async () => { const p = page(branch), original = p.location.hash; await p.skip.emit("click"); assert.equal(p.location.hash, original); assert.equal(p.get("main").focused, true); await p.get("calendar-jump").emit("click"); assert.equal(p.location.hash, original); assert.equal(p.get("calendar-options").scrolled, true); });
  await test("non-task anchor does not create an invalid-link error", () => { const p = page(null, "#main"); assert.equal(p.get("page-title").textContent, undefined); assert.equal(p.get("message").textContent, undefined); });
  await test("malformed branch link returns readable error without Calendar controls", () => { const p = page(null, "#task=bad!"); assert.equal(p.get("review").hidden, true); assert.equal(p.get("calendar-options").hidden, true); assert.match(p.get("message").textContent, /incomplete/); });
  await test("existing v1 composer still creates stable snapshots and renews edited identity", async () => { const p = page(null); p.get("task-title").value = "Read a chapter"; await p.get("task-form").emit("submit"); const first = api.fromLink(p.get("task-link").value); assert.equal(first.v, 1); assert.equal(first.day, undefined); await p.get("edit-task").emit("click"); await p.get("task-form").emit("submit"); assert.equal(api.fromLink(p.get("task-link").value).id, first.id); await p.get("edit-task").emit("click"); p.get("task-title").value = "Paint one flower"; await p.get("task-form").emit("submit"); assert.notEqual(api.fromLink(p.get("task-link").value).id, first.id); });
  await test("sender exact-time choice also leaves its day explicitly unset", async () => { const p = page(null); p.get("suggest-time").checked = true; await p.get("suggest-time").emit("change"); assert.equal(p.get("suggested-day").value, ""); assert.equal(p.get("suggested-day").required, true); });
  console.log(`${checks} task page DOM-flow checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
