/* Portable task format shared by the app and this page. No network or storage. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WannaBeTask = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const BASE = "https://zestyts.github.io/where-you-wanna-be/task.html";
  const MAX_JSON_BYTES = 16384;
  const fileMIME = "application/vnd.zestyts.wannabe-task+json";
  const MAX_ENCODED = 24576;
  const MAX_ITEMS = 200;
  const MAX_DEPTH = 10;
  const FIELDS = ["id", "title", "firstStep", "steps", "smallerStep", "minutes", "flexible", "day", "start", "timezone"];
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
  function object(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("This task link is not valid.");
  }
  function knownFields(value, fields) {
    const known = new Set(fields);
    if (Object.keys(value).some(key => !known.has(key))) fail("This task link has unsupported information.");
  }
  function identifier(value) {
    if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail("This task link is not valid.");
    return value.toLowerCase();
  }
  function taskFields(value) {
    if (!Number.isInteger(value.minutes) || value.minutes < 1 || value.minutes > 1440 || typeof value.flexible !== "boolean") fail("Check the task’s time estimate.");
    const task = { id: identifier(value.id), title: text(value.title, 48, "the task title", true), minutes: value.minutes, flexible: value.flexible };
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
    return task;
  }
  function validate(value) {
    object(value);
    let task;
    if (value.v === 1) {
      knownFields(value, ["v", ...FIELDS]);
      task = { v: 1, ...taskFields(value) };
    } else if (value.v === 2) {
      knownFields(value, ["v", ...FIELDS.filter(key => key !== "day" && key !== "start"), "kind", "subtasks"]);
      if (value.kind !== "group" || !Array.isArray(value.subtasks) || value.subtasks.length + 1 > MAX_ITEMS) fail("Check the shared task group.");
      task = { v: 2, ...taskFields(value), kind: "group", subtasks: [] };
      task.flexible = true;
      for (const node of value.subtasks) {
        object(node); knownFields(node, [...FIELDS, "parentID", "kind"]);
        if (node.kind !== "group" && node.kind !== "task") fail("Check the subtask type.");
        if (node.kind === "group" && (Object.hasOwn(node, "day") || Object.hasOwn(node, "start"))) fail("Only individual tasks can suggest a calendar time.");
        const clean = { ...taskFields(node), parentID: identifier(node.parentID), kind: node.kind };
        if (clean.kind === "group") clean.flexible = true;
        task.subtasks.push(clean);
      }
      const indexed = new Map([[task.id, task]]);
      for (const node of task.subtasks) {
        if (indexed.has(node.id)) fail("Two subtasks have the same identity.");
        indexed.set(node.id, node);
      }
      for (const node of task.subtasks) {
        const parent = indexed.get(node.parentID);
        if (!parent || parent.kind !== "group") fail("A subtask’s bigger task is missing or invalid.");
        let cursor = node, depth = 1;
        const seen = new Set([node.id]);
        while (cursor.parentID) {
          if (seen.has(cursor.parentID)) fail("A task group cannot contain itself.");
          seen.add(cursor.parentID); cursor = indexed.get(cursor.parentID); depth++;
          if (!cursor) fail("A subtask’s bigger task is missing.");
          if (depth > MAX_DEPTH) fail(`Use no more than ${MAX_DEPTH} levels of tasks and groups.`);
        }
        if (cursor.id !== task.id) fail("A subtask is outside this shared group.");
      }
    } else fail("This task link needs a newer version of Wanna Be.");
    if (encoder.encode(JSON.stringify(task)).length > MAX_JSON_BYTES) fail("This task link is too long.");
    return task;
  }
  function rows(value) {
    const task = validate(value);
    if (task.v === 1) return [{ item: task, depth: 1, parent: null }];
    const children = new Map();
    for (const item of task.subtasks) {
      if (!children.has(item.parentID)) children.set(item.parentID, []);
      children.get(item.parentID).push(item);
    }
    const result = [], pending = [{ item: task, depth: 1, parent: null }];
    while (pending.length) {
      const row = pending.pop(); result.push(row);
      for (const child of (children.get(row.item.id) || []).slice().reverse()) pending.push({ item: child, depth: row.depth + 1, parent: row.item });
    }
    return result;
  }
  function calendarTask(value, id) {
    const task = validate(value);
    if (task.v === 1) {
      if (id && id.toLowerCase() !== task.id) fail("Choose an individual task for the calendar copy.");
      return task;
    }
    const node = task.subtasks.find(item => item.id === (typeof id === "string" ? id.toLowerCase() : ""));
    if (!node || node.kind !== "task") fail("Choose an individual subtask for the calendar copy.");
    const { parentID, kind, ...fields } = node;
    return validate({ v: 1, ...fields });
  }
  function plainText(value) {
    return rows(value).map(({ item, depth }) => {
      const indent = "  ".repeat(depth - 1), lines = [`${indent}${item.title}${item.kind === "group" ? " (bigger task)" : ""}`];
      const detail = content => lines.push(`${indent}  ${content}`);
      if (item.kind !== "group") detail(`About ${item.minutes} ${item.minutes === 1 ? "minute" : "minutes"}`);
      if (item.start) detail(`Suggested: ${item.start}${item.timezone ? ` (${item.timezone})` : ""}`);
      else if (item.day) detail(`Suggested day: ${item.day}`);
      if (item.firstStep) detail(`${item.kind === "group" ? "Note" : "First small step"}: ${item.firstStep.replace(/\n/g, `\n${indent}  `)}`);
      if (item.steps) item.steps.forEach((step, index) => detail(`${item.kind === "group" ? "Reference step" : "Step"} ${index + 1}: ${step.replace(/\n/g, `\n${indent}  `)}`));
      if (item.smallerStep) detail(`A smaller start: ${item.smallerStep.replace(/\n/g, `\n${indent}  `)}`);
      return lines.join("\n");
    }).join("\n\n");
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
  function fileData(value) {
    return encoder.encode(JSON.stringify(validate(value)));
  }
  function fromFileData(value) {
    let bytes;
    if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
    else fail("This task file is not valid.");
    if (!bytes.length || bytes.length > MAX_JSON_BYTES) fail("Use a task file no larger than 16 KB.");
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail("Use a UTF-8 task file without a byte-order mark.");
    let parsed;
    try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { fail("This task file is not valid UTF-8 task JSON."); }
    try { return validate(parsed); }
    catch (error) { fail(error.message.replace(/task link/g, "task file")); }
  }
  function fileName(value) {
    const task = validate(value);
    const name = task.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
    return `${name || "task"}.wannabetask`;
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
  function calendarFile(value, start, now = new Date(), selectedID) {
    const task = calendarTask(value, selectedID);
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
  return Object.freeze({ validate, sameContent, encode, decode, fromLink, link, appLink, fileData, fromFileData, fileName, fileMIME, rows, plainText, calendarTask, calendarFile, escapeCalendarText, foldLine, localStart, localDay, count });
});
