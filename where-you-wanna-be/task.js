(function () {
  "use strict";
  const api = window.WannaBeTask;
  const byID = id => document.getElementById(id);
  let current = null;
  let taskID = null;
  let madeHere = false;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const say = message => { byID("message").textContent = message; byID("message").hidden = !message; };
  const timezoneLabel = `Your time zone: ${timeZone.replace(/_/g, " ")}`;
  byID("sender-timezone").textContent = `(${timeZone.replace(/_/g, " ")})`;
  byID("recipient-timezone").textContent = timezoneLabel;
  function uuid() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  function shortTime(date, zone = timeZone) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone }).format(date);
  }
  function suggestedDay(day) {
    const [year, month, date] = day.split("-").map(Number);
    const value = new Date(0); value.setFullYear(year, month - 1, date); value.setHours(12, 0, 0, 0);
    return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(value);
  }
  function renderPart(id, value) {
    const part = byID(id); part.hidden = !value;
    part.querySelector("p").textContent = value || "";
  }
  function review(task, sender, focus) {
    current = task; madeHere = sender;
    byID("composer").hidden = true; byID("review").hidden = false;
    byID("page-title").textContent = sender ? "Review your task." : "A task for you.";
    byID("page-intro").textContent = sender ? "Choose how to send it. The other person decides what to add." : "Choose whether and when this fits your day.";
    byID("review-label").textContent = sender ? "Ready to share" : "Shared task";
    byID("task-heading").textContent = task.title;
    let timing = `${task.minutes} ${task.minutes === 1 ? "minute" : "minutes"}`;
    if (task.start) {
      timing += ` · Suggested: ${shortTime(new Date(task.start), task.timezone || "UTC")}`;
      if ((task.timezone || "UTC") !== timeZone) timing += ` (${(task.timezone || "UTC").replace(/_/g, " ")})`;
    } else if (task.day) timing += ` · Suggested: ${suggestedDay(task.day)}`;
    else timing += " · Choose your own time";
    byID("task-meta").textContent = timing;
    renderPart("first-step-preview", task.firstStep);
    renderPart("smaller-step-preview", task.smallerStep);
    byID("steps-preview").hidden = !task.steps || !task.steps.length;
    const list = byID("steps-preview").querySelector("ol"); list.replaceChildren();
    for (const step of task.steps || []) { const item = document.createElement("li"); item.textContent = step; list.append(item); }
    byID("sender-actions").hidden = !sender;
    byID("recipient-actions").hidden = sender;
    byID("share-task").hidden = !navigator.share;
    byID("open-app").href = api.appLink(task);
    byID("task-link").value = api.link(task);
    byID("copy-fallback").hidden = true;
    byID("long-link-note").hidden = api.link(task).length < 4000;
    byID("new-task").hidden = false;
    byID("calendar-options").hidden = sender;
    const rounded = new Date(Math.ceil(Date.now() / 900000) * 900000);
    const start = task.start ? new Date(task.start) : rounded;
    byID("calendar-day").value = task.start ? api.localDay(start) : task.day || api.localDay(start);
    byID("calendar-time").value = `${start.getHours().toString().padStart(2, "0")}:${start.getMinutes().toString().padStart(2, "0")}`;
    if (focus) byID("task-heading").focus();
  }
  function readHash() {
    if (!location.hash.startsWith("#task=")) return;
    try {
      const match = /^#task=([A-Za-z0-9_-]+)$/.exec(location.hash);
      if (!match) throw new Error("This task link is incomplete.");
      const task = api.decode(match[1]);
      say(""); review(task, false, false);
    } catch (error) {
      current = null;
      byID("review").hidden = true; byID("calendar-options").hidden = true;
      byID("composer").hidden = false;
      byID("page-title").textContent = "This link didn’t open.";
      byID("page-intro").textContent = "Ask the sender for the full task link, or create your own below.";
      say(error.message);
    }
  }
  function checkTextField(id, max, name) {
    const field = byID(id);
    const check = () => field.setCustomValidity(api.count(field.value.trim()) > max ? `Use up to ${max} characters for ${name}.` : "");
    field.addEventListener("input", check); return check;
  }
  const checks = [checkTextField("task-title", 48, "the title"), checkTextField("first-step", 160, "the first step"), checkTextField("smaller-step", 160, "the smaller start")];
  byID("suggest-time").addEventListener("change", event => {
    const enabled = event.target.checked;
    byID("suggested-time-field").hidden = !enabled;
    byID("suggested-time").disabled = !enabled;
    byID("suggested-time").required = enabled;
    byID("suggested-day").required = enabled;
    if (enabled && !byID("suggested-day").value) byID("suggested-day").value = api.localDay(new Date());
  });
  byID("task-form").addEventListener("submit", event => {
    event.preventDefault(); checks.forEach(check => check());
    if (!event.target.reportValidity()) return;
    try {
      if (!taskID) taskID = uuid();
      const task = { v: 1, id: taskID, title: byID("task-title").value, firstStep: byID("first-step").value, steps: byID("task-steps").value.split(/\r\n|\r|\n/).map(step => step.trim()).filter(Boolean), smallerStep: byID("smaller-step").value, minutes: Number(byID("task-minutes").value), flexible: !byID("suggest-time").checked };
      if (byID("suggested-day").value) task.day = byID("suggested-day").value;
      if (byID("suggest-time").checked) {
        task.start = api.localStart(task.day, byID("suggested-time").value).toISOString().replace(/\.\d{3}Z$/, "Z");
        task.timezone = timeZone;
      }
      let validated = api.validate(task);
      // An edited, previously shared snapshot needs its own identity. Re-copying stays stable.
      if (current && madeHere && !api.sameContent(current, validated)) {
        taskID = uuid(); validated = api.validate({ ...task, id: taskID });
      }
      say(""); review(validated, true, true);
    } catch (error) { say(error.message); byID("message").scrollIntoView({ block: "nearest" }); }
  });
  byID("edit-task").addEventListener("click", () => {
    byID("composer").hidden = false; byID("review").hidden = true; byID("calendar-options").hidden = true;
    byID("page-title").textContent = "Share a task.";
    byID("page-intro").textContent = "Send an idea or something that needs doing. The other person chooses whether and when to add it.";
    say(""); byID("task-title").focus();
  });
  async function copy(value, fallbackID, textID, message) {
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value); say(message);
    } catch {
      byID(fallbackID).hidden = false; byID(textID).value = value;
      byID(textID).focus(); byID(textID).select();
      say("Select and copy the text below.");
    }
  }
  byID("copy-task").addEventListener("click", () => copy(api.link(current), "copy-fallback", "task-link", "Task link copied. Choose who to send it to."));
  byID("share-task").addEventListener("click", async () => {
    try { await navigator.share({ title: "A task to consider", text: `A task to consider: ${current.title}`, url: api.link(current) }); say(""); }
    catch (error) { if (error.name !== "AbortError") await copy(api.link(current), "copy-fallback", "task-link", "Task link copied. Choose who to send it to."); }
  });
  byID("calendar-form").addEventListener("submit", event => {
    event.preventDefault();
    try {
      const start = api.localStart(byID("calendar-day").value, byID("calendar-time").value);
      const blob = new Blob([api.calendarFile(current, start)], { type: "text/calendar;charset=utf-8" });
      const objectURL = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = objectURL; anchor.download = "wanna-be-task.ics";
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectURL), 60000);
      say("Calendar file ready. Review and save it in your calendar, then set any reminder there.");
    } catch (error) { say(error.message); }
  });
  byID("copy-details").addEventListener("click", () => {
    let value = `${current.title}\nAbout ${current.minutes} minutes`;
    try { value += `\n${shortTime(api.localStart(byID("calendar-day").value, byID("calendar-time").value))} (${timeZone})`; } catch { /* Leave an unset date out of the copied note. */ }
    if (current.firstStep) value += `\n\nFirst small step: ${current.firstStep}`;
    if (current.steps) value += `\n\n${current.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}`;
    if (current.smallerStep) value += `\n\nA smaller start: ${current.smallerStep}`;
    copy(value, "details-fallback", "task-details-text", "Task details copied. Paste them into an event and choose a reminder.");
  });
  byID("new-task").addEventListener("click", () => {
    history.replaceState(null, "", location.pathname + location.search);
    current = null; taskID = null; madeHere = false; byID("task-form").reset();
    byID("suggested-time-field").hidden = true; byID("suggested-time").disabled = true;
    byID("suggested-time").required = false; byID("suggested-day").required = false;
    checks.forEach(check => check());
    byID("edit-task").click(); byID("new-task").hidden = true;
  });
  window.addEventListener("hashchange", () => {
    // An explicitly opened task replaces only a finished preview, never an unsent draft.
    if (!madeHere && byID("composer").hidden) readHash();
    else if (location.hash.startsWith("#task=")) say("Another task link is open. Reload this page to review it after you finish your draft.");
  });
  for (const anchor of document.querySelectorAll('a[href="#main"], a[href="#calendar-options"]')) {
    anchor.addEventListener("click", event => {
      event.preventDefault();
      const target = document.querySelector(anchor.getAttribute("href"));
      target.tabIndex = -1; target.focus({ preventScroll: true }); target.scrollIntoView({ block: "start" });
    });
  }
  readHash();
})();
