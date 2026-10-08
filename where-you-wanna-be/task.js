(function () {
  "use strict";
  const api = window.WannaBeTask;
  const byID = id => document.getElementById(id);
  let current = null;
  let taskID = null;
  let madeHere = false;
  let calendarTaskID = null;
  let pendingFile = null;
  let fileReadSequence = 0;
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
  function timingText(task) {
    let timing = `${task.minutes} ${task.minutes === 1 ? "minute" : "minutes"}`;
    if (task.start) {
      timing += ` · Suggested: ${shortTime(new Date(task.start), task.timezone || "UTC")}`;
      if ((task.timezone || "UTC") !== timeZone) timing += ` (${(task.timezone || "UTC").replace(/_/g, " ")})`;
    } else if (task.day) timing += ` · Suggested: ${suggestedDay(task.day)}`;
    else timing += " · No day chosen";
    return timing;
  }
  function renderBranch(task) {
    const list = byID("branch-list"); list.replaceChildren();
    byID("branch-preview").hidden = task.v !== 2;
    if (task.v !== 2) return;
    if (!task.subtasks.length) {
      const item = document.createElement("li"); item.textContent = "No subtasks yet."; list.append(item); return;
    }
    for (const row of api.rows(task).slice(1)) {
      const item = document.createElement("li"), title = document.createElement("strong"), context = document.createElement("p");
      title.textContent = row.item.title;
      context.className = "hint";
      context.textContent = `Level ${row.depth} · Part of ${row.parent.title} · ${row.item.kind === "group" ? "Bigger task" : timingText(row.item)}`;
      item.append(title, context);
      const notes = [row.item.firstStep && `${row.item.kind === "group" ? "Note" : "First small step"}: ${row.item.firstStep}`, ...(row.item.steps || []).map((step, index) => `${row.item.kind === "group" ? "Reference step" : "Step"} ${index + 1}: ${step}`), row.item.smallerStep && `A smaller start: ${row.item.smallerStep}`].filter(Boolean);
      if (notes.length) {
        const details = document.createElement("details"), summary = document.createElement("summary"), content = document.createElement("p");
        details.className = "task-details"; summary.textContent = "Steps and notes"; content.textContent = notes.join("\n\n");
        details.append(summary, content); item.append(details);
      }
      list.append(item);
    }
  }
  function configureCalendar(task) {
    calendarTaskID = task.v === 1 ? task.id : null;
    const select = byID("calendar-task"); select.replaceChildren();
    const prompt = document.createElement("option"); prompt.value = ""; prompt.textContent = "Choose one subtask"; select.append(prompt);
    const leaves = task.v === 2 ? api.rows(task).filter(row => row.item.kind === "task") : [];
    for (const row of leaves) {
      const option = document.createElement("option"); option.value = row.item.id;
      option.textContent = `${row.item.title} — part of ${row.parent.title}`; select.append(option);
    }
    select.value = ""; select.required = task.v === 2;
    byID("calendar-task-field").hidden = task.v !== 2;
    byID("calendar-options").hidden = madeHere || (task.v === 2 && !leaves.length);
    byID("calendar-jump").hidden = task.v === 2 && !leaves.length;
    byID("calendar-intro").textContent = task.v === 2 ? "Choose one subtask, then its day and time. Bigger tasks are containers and don’t become events." : "Make a calendar copy on your terms. The task link stays the same.";
    chooseCalendarTask();
  }
  function chooseCalendarTask() {
    const enabled = Boolean(calendarTaskID);
    for (const id of ["calendar-day", "calendar-time", "calendar-download"]) byID(id).disabled = !enabled;
    byID("calendar-day").value = ""; byID("calendar-time").value = "";
    if (!enabled) return;
    const task = api.calendarTask(current, calendarTaskID);
    if (task.start) {
      const start = new Date(task.start);
      byID("calendar-day").value = api.localDay(start);
      byID("calendar-time").value = `${start.getHours().toString().padStart(2, "0")}:${start.getMinutes().toString().padStart(2, "0")}`;
    } else if (task.day) byID("calendar-day").value = task.day;
    // An undated task stays blank. No default today/time or calendar write.
  }
  function review(task, sender, focus) {
    // A finished review supersedes any earlier file read that is still pending.
    fileReadSequence++;
    current = task; madeHere = sender;
    byID("composer").hidden = true; byID("review").hidden = false;
    byID("file-entry").hidden = true; byID("file-replace").hidden = true; pendingFile = null;
    byID("page-title").textContent = sender ? "Review your task." : task.v === 2 ? "A task group for you." : "A task for you.";
    byID("page-intro").textContent = sender ? "Choose how to send it. The other person decides what to add." : task.v === 2 ? "Review the bigger task and its parts. Choose what fits; nothing is added automatically." : "Choose whether and when this fits your day.";
    byID("review-label").textContent = sender ? "Ready to share" : task.v === 2 ? "Shared task group" : "Shared task";
    byID("task-heading").textContent = task.title;
    const leaves = task.v === 2 ? task.subtasks.filter(item => item.kind === "task").length : 0;
    byID("task-meta").textContent = task.v === 2 ? `Bigger task · ${leaves} ${leaves === 1 ? "task" : "tasks"} inside · No progress shared` : timingText(task);
    byID("first-step-preview").querySelector("h3").textContent = task.v === 2 ? "Note" : "First small step";
    byID("steps-preview").querySelector("h3").textContent = task.v === 2 ? "Reference steps" : "Steps";
    renderPart("first-step-preview", task.firstStep);
    renderPart("smaller-step-preview", task.smallerStep);
    byID("steps-preview").hidden = !task.steps || !task.steps.length;
    const list = byID("steps-preview").querySelector("ol"); list.replaceChildren();
    for (const step of task.steps || []) { const item = document.createElement("li"); item.textContent = step; list.append(item); }
    renderBranch(task);
    byID("sender-actions").hidden = !sender;
    byID("recipient-actions").hidden = sender;
    const sharesFiles = canShareTaskFile(task);
    byID("share-task").textContent = sharesFiles ? "Share task file" : "Save task file";
    byID("save-task-file").hidden = !sharesFiles;
    byID("open-app").href = api.appLink(task);
    byID("task-link").value = api.link(task);
    byID("copy-fallback").hidden = true;
    byID("long-link-note").hidden = api.link(task).length < 4000;
    byID("new-task").hidden = false;
    byID("details-fallback").hidden = true;
    byID("app-version-note").textContent = task.v === 2 ? "Open this in the latest iPhone, iPad, or Android app to review and add the whole group. Planning its parts is your choice." : "Open this in the latest iPhone, iPad, or Android app to review and add it. Nothing is added automatically.";
    configureCalendar(task);
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
      byID("file-entry").hidden = false;
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
    byID("file-entry").hidden = false;
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
  function taskFile(task) {
    return new File([api.fileData(task)], api.fileName(task), { type: api.fileMIME });
  }
  function canShareTaskFile(task) {
    try { return typeof File === "function" && typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [taskFile(task)] }); }
    catch { return false; }
  }
  function saveTaskFile(task) {
    const blob = new Blob([api.fileData(task)], { type: api.fileMIME });
    const objectURL = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = objectURL; anchor.download = api.fileName(task);
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectURL), 60000);
    say("Task file ready. Attach it to a message; the recipient chooses whether to add it.");
  }
  byID("save-task-file").addEventListener("click", () => saveTaskFile(current));
  byID("save-received-file").addEventListener("click", () => saveTaskFile(current));
  byID("share-task").addEventListener("click", async () => {
    if (!canShareTaskFile(current)) { saveTaskFile(current); return; }
    try { await navigator.share({ title: current.title, text: `A task to consider: ${current.title}`, files: [taskFile(current)] }); say(""); }
    catch (error) { if (error.name !== "AbortError") { saveTaskFile(current); say("This browser couldn’t share the file. The task file is ready to attach to a message."); } }
  });
  function hasDraft() {
    return !byID("composer").hidden && (["task-title", "first-step", "task-steps", "smaller-step", "suggested-day", "suggested-time"].some(id => byID(id).value.trim()) || byID("task-minutes").value !== "10" || byID("suggest-time").checked);
  }
  function reviewFile(task) {
    history.replaceState(null, "", location.pathname + location.search);
    say(""); review(task, false, true);
  }
  byID("open-task-file").addEventListener("click", () => byID("task-file-input").click());
  byID("task-file-input").addEventListener("change", async event => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const sequence = ++fileReadSequence;
    try {
      if (!Number.isInteger(file.size) || file.size < 1 || file.size > 16384) throw new Error("Use a task file no larger than 16 KB.");
      const task = api.fromFileData(await file.arrayBuffer());
      if (sequence !== fileReadSequence) return;
      if (hasDraft()) {
        pendingFile = task; byID("file-replace").hidden = false;
        say(""); byID("file-replace-title").focus();
      } else reviewFile(task);
    } catch (error) { if (sequence === fileReadSequence) { pendingFile = null; byID("file-replace").hidden = true; say(error.message); } }
  });
  byID("keep-draft").addEventListener("click", () => {
    pendingFile = null; byID("file-replace").hidden = true; say(""); byID("task-title").focus();
  });
  byID("review-task-file").addEventListener("click", () => { if (pendingFile) reviewFile(pendingFile); });
  byID("calendar-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    try {
      if (!calendarTaskID) throw new Error("Choose an individual subtask first.");
      const start = api.localStart(byID("calendar-day").value, byID("calendar-time").value);
      const blob = new Blob([api.calendarFile(current, start, new Date(), calendarTaskID)], { type: "text/calendar;charset=utf-8" });
      const objectURL = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = objectURL; anchor.download = "wanna-be-task.ics";
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectURL), 60000);
      say("Calendar file ready. Review and save it in your calendar, then set any reminder there.");
    } catch (error) { say(error.message); }
  });
  byID("calendar-task").addEventListener("change", event => {
    calendarTaskID = event.target.value || null; chooseCalendarTask(); say("");
  });
  byID("copy-details").addEventListener("click", () => {
    copy(api.plainText(current), "details-fallback", "task-details-text", "Task details copied. Choose where to use them.");
  });
  byID("new-task").addEventListener("click", () => {
    history.replaceState(null, "", location.pathname + location.search);
    fileReadSequence++; pendingFile = null; byID("file-replace").hidden = true;
    current = null; taskID = null; madeHere = false; calendarTaskID = null; byID("task-form").reset();
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
