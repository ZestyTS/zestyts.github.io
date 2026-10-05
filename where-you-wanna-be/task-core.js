/* Portable task format shared by the app and this page. No network or storage. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WannaBeTask = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const BASE = "https://zestyts.github.io/where-you-wanna-be/task.html";
  const MAX_JSON_BYTES = 16384;
  const MAX_ENCODED = 24576;
  const encoder = new TextEncoder();
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  const count = value => segmenter ? Array.from(segmenter.segment(value)).length : Array.from(value).length;
  const fail = message => { throw new Error(message); };
  function text(value, limit, name, required) {
    if (value === undefined && !required) return undefined;
    if (typeof value !== "string" || (required && !value.trim()) || count(value.trim()) > limit || /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uD800-\uDFFF]/u.test(value)) fail(`Check ${name}.`);
    if (name === "the task title" && /[\r\n\t]/u.test(value)) fail("Keep the task title on one line.");
    return value.trim() || undefined;
  }
  function validDay(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }
  function validate(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("This task link is not valid.");
    if (value.v !== 1) fail("This task link needs a newer version of Wanna Be.");
    const known = new Set(["v", "id", "title", "firstStep", "steps", "smallerStep", "minutes", "flexible", "day", "start", "timezone"]);
    if (Object.keys(value).some(key => !known.has(key))) fail("This task link has unsupported information.");
    if (typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)) fail("This task link is not valid.");
    if (!Number.isInteger(value.minutes) || value.minutes < 1 || value.minutes > 1440 || typeof value.flexible !== "boolean") fail("Check the task’s time estimate.");
    const task = { v: 1, id: value.id.toLowerCase(), title: text(value.title, 48, "the task title", true), minutes: value.minutes, flexible: value.flexible };
    for (const key of ["firstStep", "smallerStep"]) {
      const content = text(value[key], 160, "the small step", false);
      if (content) task[key] = content;
    }
    if (value.steps !== undefined) {
      if (!Array.isArray(value.steps) || value.steps.length > 30) fail("Use up to 30 short steps.");
      const steps = value.steps.map(step => text(step, 160, "the steps", true));
      if (steps.length) task.steps = steps;
    }
    if (value.day !== undefined) {
      if (!validDay(value.day)) fail("Check the suggested day.");
      task.day = value.day;
    }
    if (value.start !== undefined) {
      if (typeof value.start !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value.start) || !Number.isFinite(new Date(value.start).valueOf())) fail("Check the suggested time.");
      // Reject normalized dates such as February 30 and hours such as 24:00.
      if (Number(value.start.slice(0, 4)) < 1 || new Date(value.start).toISOString().slice(0, 19) !== value.start.slice(0, 19)) fail("Check the suggested time.");
      task.start = value.start;
    }
    if (value.timezone !== undefined) {
      if (typeof value.timezone !== "string" || value.timezone.length > 100) fail("Check the time zone.");
      try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format(); } catch { fail("Check the time zone."); }
      task.timezone = value.timezone;
    }
    if (task.day && task.start) {
      const parts = new Intl.DateTimeFormat("en", { timeZone: task.timezone || "UTC", calendar: "gregory", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(task.start));
      const part = type => parts.find(value => value.type === type).value;
      if (`${part("year").padStart(4, "0")}-${part("month")}-${part("day")}` !== task.day) fail("The suggested day and time do not match.");
    }
    if (encoder.encode(JSON.stringify(task)).length > MAX_JSON_BYTES) fail("This task link is too long.");
    return task;
  }
  function encode(value) {
    const bytes = encoder.encode(JSON.stringify(validate(value)));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(encoded) {
    if (typeof encoded !== "string" || !encoded.length || encoded.length > MAX_ENCODED || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) fail("This task link is incomplete or too long.");
    let bytes;
    try {
      bytes = Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
    } catch { fail("This task link is not valid."); }
    if (bytes.length > MAX_JSON_BYTES) fail("This task link is too long.");
    let parsed;
    try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { fail("This task link is not valid."); }
    // Require a canonical unpadded encoding; this also rejects non-zero spare bits.
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    if (btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== encoded) fail("This task link is not valid.");
    return validate(parsed);
  }
  function fromLink(link) {
    const url = new URL(link);
    if (url.protocol !== "https:" || url.hostname !== "zestyts.github.io" || url.pathname !== "/where-you-wanna-be/task.html" || url.search || url.username || url.password || url.port) fail("Use a Wanna Be task link.");
    if (!/^#task=[A-Za-z0-9_-]+$/.test(url.hash)) fail("This task link is incomplete.");
    return decode(url.hash.slice(6));
  }
  function sameContent(first, second) {
    const a = validate(first), b = validate(second);
    delete a.id; delete b.id;
    return JSON.stringify(a) === JSON.stringify(b);
  }
  const link = task => `${BASE}#task=${encode(task)}`;
  const appLink = task => `wannabe://task?data=${encode(task)}`;
  function escapeCalendarText(value) {
    return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  }
  function foldLine(line) {
    let output = "", current = "", bytes = 0;
    for (const character of line) {
      const size = encoder.encode(character).length;
      if (bytes + size > 75) { output += `${current}\r\n`; current = " "; bytes = 1; }
      current += character; bytes += size;
    }
    return output + current;
  }
  function stamp(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.valueOf())) fail("Choose a calendar date and time.");
    if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) fail("Choose a calendar date between years 1 and 9999.");
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }
  function calendarFile(value, start, now = new Date()) {
    const task = validate(value);
    const end = new Date(start.valueOf() + task.minutes * 60000);
    const notes = [task.firstStep, task.steps && task.steps.map((step, i) => `${i + 1}. ${step}`).join("\n"), task.smallerStep && `A smaller start: ${task.smallerStep}`].filter(Boolean).join("\n\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ZestyTS//Wanna Be Tasks//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${task.id}@wannabe.zestyts.github.io`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeCalendarText(task.title)}`];
    if (notes) lines.push(`DESCRIPTION:${escapeCalendarText(notes)}`);
    // No alarm or automatic invitation. The recipient reviews their own calendar copy.
    lines.push("STATUS:TENTATIVE", "END:VEVENT", "END:VCALENDAR");
    return lines.map(foldLine).join("\r\n") + "\r\n";
  }
  function localDay(date) {
    return [date.getFullYear().toString().padStart(4, "0"), (date.getMonth() + 1).toString().padStart(2, "0"), date.getDate().toString().padStart(2, "0")].join("-");
  }
  function localStart(day, time) {
    if (!validDay(day) || !/^\d{2}:\d{2}$/.test(time)) fail("Choose a calendar date and time.");
    const [year, month, date] = day.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    if (hours > 23 || minutes > 59) fail("Choose a valid time.");
    const result = new Date(0);
    result.setFullYear(year, month - 1, date); result.setHours(hours, minutes, 0, 0);
    if (localDay(result) !== day || result.getHours() !== hours || result.getMinutes() !== minutes) fail("That time does not exist in your time zone. Choose another time.");
    return result;
  }
  return Object.freeze({ validate, sameContent, encode, decode, fromLink, link, appLink, calendarFile, escapeCalendarText, foldLine, localStart, localDay, count });
});
