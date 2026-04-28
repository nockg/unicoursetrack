const DEADLINE_PRIORITY_COLOURS = {
  high: "#b84a3f",
  medium: "#b38a2f",
  low: "#4f7a53",
  default: "#8c8173"
};

function deadlinePriorityColour(deadline) {
  return DEADLINE_PRIORITY_COLOURS[deadline?.priority || "default"] || DEADLINE_PRIORITY_COLOURS.default;
}

function deadlinePriorityLabel(deadline) {
  const priority = deadline?.priority || "default";
  return priority === "default" ? "Default" : priority.charAt(0).toUpperCase() + priority.slice(1);
}

function deadlineModuleLabel(deadline) {
  if (Number.isInteger(deadline?.moduleIndex) && MODULES[deadline.moduleIndex]) {
    return MODULES[deadline.moduleIndex].kanji || MODULES[deadline.moduleIndex].short || MODULES[deadline.moduleIndex].name;
  }
  return "General";
}

function renderDeadlineModuleOptions(value = "") {
  const select = document.getElementById("deadline-module-input");
  if (!select) return;
  select.innerHTML = `<option value="">General</option>` + MODULES.map((mod, mi) => `<option value="${mi}">${escapeHtml(mod.kanji || mod.short || mod.name)}</option>`).join("");
  select.value = value === null || value === undefined ? "" : String(value);
}

function setDeadlinePriority(priority = "default") {
  const selected = DEADLINE_PRIORITY_COLOURS[priority] ? priority : "default";
  document.querySelectorAll("#deadline-priority-row .priority-choice").forEach((button) => {
    button.classList.toggle("active", button.dataset.priority === selected);
  });
}

function getSelectedDeadlinePriority() {
  return document.querySelector("#deadline-priority-row .priority-choice.active")?.dataset.priority || "default";
}

function setDeadlineFormType(type = "date") {
  activeDeadlineFormType = type === "event" ? "event" : "date";
  const isEvent = activeDeadlineFormType === "event";
  document.getElementById("deadline-calendar-fields")?.classList.toggle("deadline-field-hidden", !isEvent);
  document.getElementById("deadline-calendar-btn")?.classList.toggle("deadline-field-hidden", !isEvent);
  document.getElementById("deadline-priority-field")?.classList.toggle("deadline-field-hidden", isEvent);
  const pill = document.getElementById("deadline-form-type-pill");
  if (pill) pill.textContent = isEvent ? "Calendar Event" : "Tracked Date";
  const title = document.getElementById("deadline-form-title");
  if (title && editingDeadlineIndex === null) title.textContent = isEvent ? "Plan Calendar Event" : "Track a Date";
  const saveBtn = document.getElementById("deadline-save-btn");
  if (saveBtn && editingDeadlineIndex === null) saveBtn.textContent = isEvent ? "Save Event" : "Save Date";
  updateDeadlineFormMode();
}

function renderDeadlineAddChoice() {
  return `<div class="deadline-choice-grid deadline-view-shell">
    <button class="deadline-choice-card" type="button" onclick="openDeadlineForm(null, 'date')">
      <div class="deadline-choice-title">Track a Date</div>
      <div class="deadline-choice-copy">Quick tracked deadline with title, module, date, time, and priority.</div>
    </button>
    <button class="deadline-choice-card" type="button" onclick="openDeadlineForm(null, 'event')">
      <div class="deadline-choice-title">Plan Calendar Event</div>
      <div class="deadline-choice-copy">Calendar-ready entry with end time, location, and availability.</div>
    </button>
  </div>`;
}

function swapDeadlineView(render) {
  const host = document.getElementById("timeline-list");
  if (!host || typeof render !== "function") return;

  window.clearTimeout(host._deadlineSwitchTimer);
  host.getAnimations?.().forEach((animation) => animation.cancel());

  host.style.height = "";
  host.style.width = "";
  host.style.maxWidth = "";
  host.style.overflow = "";
  host.style.opacity = "";
  host.style.transform = "";
  host.classList.remove("is-switching");

  render();
}

function showDeadlineTab(tab = "upcoming") {
  activeDeadlineTab = tab === "add" ? "add" : "upcoming";
  document.getElementById("deadline-tab-upcoming")?.classList.toggle("active", activeDeadlineTab === "upcoming");
  document.getElementById("deadline-tab-add")?.classList.toggle("active", activeDeadlineTab === "add");
  if (activeDeadlineTab === "add") {
    swapDeadlineView(() => {
      const host = document.getElementById("timeline-list");
      if (host) host.innerHTML = renderDeadlineAddChoice();
    });
  } else {
    swapDeadlineView(() => renderDeadlineTimeline(true));
  }
}

function renderStickyExams() {
  const host = document.getElementById("live-exam-bar");
  if (!host) return;
  const store = getStore();
  const now = Date.now();
  const upcoming = (store.customExams || [])
    .map((exam, originalIndex) => ({ ...exam, originalIndex }))
    .filter((exam) => !exam.completed)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  host.innerHTML = "";
  upcoming.forEach((exam) => {
    const target = new Date(exam.date);
    const isUrgent = target.getTime() <= now;
    const card = document.createElement("div");
    card.className = "exam-ticker";
    card.dataset.deadlineIndex = String(exam.originalIndex);
    card.innerHTML = `
      <div class="ticker-mod">${escapeHtml(exam.mod)}</div>
      <div class="ticker-time ${isUrgent ? "urgent" : ""}">${formatCountdown(exam.date)}</div>
      <div class="ticker-date">${target.toLocaleString([], { dateStyle: "medium", timeStyle: exam.allDay ? undefined : "short" })}</div>
    `;
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      removeExam(exam.originalIndex);
    });
    host.appendChild(card);
  });
  const button = document.createElement("button");
  button.className = "add-exam-btn";
  button.textContent = "+ Add Deadline";
  button.onclick = addExam;
  host.appendChild(button);
}

function addExam() {
  openDeadlineForm(null, "date");
}

function openDeadlineForm(index = null, type = "date") {
  editingDeadlineIndex = index;
  const titleInput = document.getElementById("deadline-title-input");
  const dateInput = document.getElementById("deadline-date-input");
  const timeInput = document.getElementById("deadline-time-input");
  const endDateInput = document.getElementById("deadline-end-date-input");
  const endTimeInput = document.getElementById("deadline-end-time-input");
  const allDayInput = document.getElementById("deadline-all-day-input");
  const availabilityInput = document.getElementById("deadline-availability-input");
  const locationInput = document.getElementById("deadline-location-input");
  const noteInput = document.getElementById("deadline-note-input");
  const title = document.getElementById("deadline-form-title");
  const saveBtn = document.getElementById("deadline-save-btn");
  const deadline = index !== null ? getStore().customExams[index] : null;
  const formType = deadline?.type || type || "date";

  renderDeadlineModuleOptions(deadline?.moduleIndex ?? "");

  if (deadline) {
    const date = new Date(deadline.date);
    const endDate = deadline.endDate ? new Date(deadline.endDate) : new Date(date.getTime() + 60 * 60 * 1000);
    titleInput.value = deadline.mod || "";
    dateInput.value = Number.isNaN(date.getTime()) ? "" : toDateInputValue(date);
    timeInput.value = Number.isNaN(date.getTime()) || deadline.allDay ? "" : toTimeInputValue(date);
    endDateInput.value = Number.isNaN(endDate.getTime()) ? "" : toDateInputValue(endDate);
    endTimeInput.value = Number.isNaN(endDate.getTime()) || deadline.allDay ? "" : toTimeInputValue(endDate);
    allDayInput.value = deadline.allDay ? "true" : "false";
    availabilityInput.value = deadline.availability || "BUSY";
    locationInput.value = deadline.location || "";
    noteInput.value = deadline.note || "";
    setDeadlinePriority(deadline.priority || "default");
    if (title) title.textContent = formType === "event" ? "Edit Calendar Event" : "Edit Date";
    if (saveBtn) saveBtn.textContent = "Save Changes";
  } else {
    titleInput.value = "";
    dateInput.value = "";
    timeInput.value = "";
    endDateInput.value = "";
    endTimeInput.value = "";
    allDayInput.value = "false";
    availabilityInput.value = "BUSY";
    locationInput.value = "";
    noteInput.value = "";
    setDeadlinePriority("default");
    if (title) title.textContent = formType === "event" ? "Plan Calendar Event" : "Track a Date";
    if (saveBtn) saveBtn.textContent = formType === "event" ? "Save Event" : "Save Date";
  }

  setDeadlineFormType(formType);
  document.getElementById("deadline-form-modal").classList.remove("hidden");
  lockPageScroll();
  setTimeout(() => titleInput && titleInput.focus(), 0);
}

function editDeadline(index) {
  openDeadlineForm(index);
}

function closeDeadlineForm() {
  document.getElementById("deadline-form-modal").classList.add("hidden");
  editingDeadlineIndex = null;
  unlockPageScroll();
}

function buildDeadlineFromForm() {
  const titleInput = document.getElementById("deadline-title-input");
  const dateInput = document.getElementById("deadline-date-input");
  const timeInput = document.getElementById("deadline-time-input");
  const endDateInput = document.getElementById("deadline-end-date-input");
  const endTimeInput = document.getElementById("deadline-end-time-input");
  const allDayInput = document.getElementById("deadline-all-day-input");
  const availabilityInput = document.getElementById("deadline-availability-input");
  const locationInput = document.getElementById("deadline-location-input");
  const noteInput = document.getElementById("deadline-note-input");
  const moduleInput = document.getElementById("deadline-module-input");
  const mod = titleInput.value.trim();
  const date = dateInput.value;
  const time = timeInput.value || "";
  const moduleValue = String(moduleInput?.value || "");
  const moduleIndex = moduleValue === "" ? null : Number(moduleValue);

  if (!mod) {
    alert("Please enter a deadline title.");
    return null;
  }
  if (!date) {
    alert("Please choose a start date.");
    return null;
  }

  if (activeDeadlineFormType !== "event") {
    const parsed = new Date(`${date}T${time || "09:00"}`);
    if (Number.isNaN(parsed.getTime())) {
      alert("Please enter a valid date and time.");
      return null;
    }
    return {
      type: "date",
      mod,
      date: toDeadlineStorageString(parsed),
      endDate: "",
      moduleIndex: Number.isInteger(moduleIndex) ? moduleIndex : null,
      priority: getSelectedDeadlinePriority(),
      allDay: false,
      availability: "BUSY",
      location: "",
      note: noteInput.value || "",
      completed: false
    };
  }

  const allDay = allDayInput.value === "true";
  const parsed = new Date(`${date}T${allDay ? "00:00" : (time || "09:00")}`);
  if (Number.isNaN(parsed.getTime())) {
    alert("Please enter a valid event start date and time.");
    return null;
  }

  const hasCustomEndDate = !!endDateInput.value;
  const hasCustomEndTime = !!endTimeInput.value;
  const calendarEndDate = endDateInput.value || date;
  const calendarEndTime = endTimeInput.value || "";
  let parsedEnd;
  if (allDay) {
    parsedEnd = new Date(new Date(`${calendarEndDate}T00:00`).getTime() + 24 * 60 * 60 * 1000);
  } else if (hasCustomEndDate || hasCustomEndTime) {
    parsedEnd = new Date(`${calendarEndDate}T${calendarEndTime || time || "09:00"}`);
    if (parsedEnd <= parsed && !hasCustomEndDate) parsedEnd = new Date(parsed.getTime() + 60 * 60 * 1000);
  } else {
    parsedEnd = new Date(parsed.getTime() + 60 * 60 * 1000);
  }

  if (Number.isNaN(parsedEnd.getTime()) || parsedEnd <= parsed) {
    alert("Please enter a valid calendar end time, or leave it blank to use a one-hour slot.");
    return null;
  }

  return {
    type: "event",
    mod,
    date: toDeadlineStorageString(parsed),
    endDate: toDeadlineStorageString(parsedEnd),
    moduleIndex: Number.isInteger(moduleIndex) ? moduleIndex : null,
    priority: getSelectedDeadlinePriority(),
    allDay,
    availability: availabilityInput.value || "BUSY",
    location: locationInput.value.trim(),
    note: noteInput.value || "",
    completed: false
  };
}

function updateDeadlineFormMode() {
  const allDay = document.getElementById("deadline-all-day-input")?.value === "true";
  const startTime = document.getElementById("deadline-time-input");
  const endTime = document.getElementById("deadline-end-time-input");
  if (startTime) startTime.disabled = allDay;
  if (endTime) endTime.disabled = allDay;
}

function getDeadlineCalendarDetails(deadline) {
  const profile = Object.assign({}, defaultProfile, state.profile || {});
  const parts = [];
  if (deadline.note) parts.push(deadline.note.trim());
  if (profile.course) parts.push(`Course: ${profile.course}`);
  if (profile.university) parts.push(`University: ${profile.university}`);
  return parts.filter(Boolean).join("\n\n");
}

function formatCalendarStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function formatCalendarDateOnly(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function buildCalendarWindow(deadline) {
  const start = new Date(deadline.date);
  const storedEnd = deadline.endDate ? new Date(deadline.endDate) : null;
  const end = storedEnd && !Number.isNaN(storedEnd.getTime()) && storedEnd > start
    ? storedEnd
    : new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

function downloadCalendarIcs(eventData) {
  const details = String(eventData.details || "").replace(/\n/g, "\\n");
  const safeTitle = String(eventData.title || "Calendar Event").replace(/\n/g, " ").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const location = String(eventData.location || "").replace(/\n/g, " ").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UniTrack//Deadline Export//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(16).slice(2)}@unitrack`,
    `DTSTAMP:${formatCalendarStamp(new Date())}`,
    eventData.allDay ? `DTSTART;VALUE=DATE:${formatCalendarDateOnly(eventData.start)}` : `DTSTART:${formatCalendarStamp(eventData.start)}`,
    eventData.allDay ? `DTEND;VALUE=DATE:${formatCalendarDateOnly(eventData.end)}` : `DTEND:${formatCalendarStamp(eventData.end)}`,
    `SUMMARY:${safeTitle}`,
    `DESCRIPTION:${details}`,
    ...(location ? [`LOCATION:${location}`] : []),
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(eventData.title || "calendar-event").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "calendar-event"}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function reserveCalendarWindow() {
  try {
    return window.open("about:blank", "_blank", "noopener");
  } catch (error) {
    return null;
  }
}

function closeReservedCalendarWindow(calendarWindow) {
  try {
    if (calendarWindow && !calendarWindow.closed) calendarWindow.close();
  } catch (error) {
    // Ignore browser cross-window restrictions.
  }
}

function navigateCalendarWindow(url, calendarWindow = null) {
  if (calendarWindow && !calendarWindow.closed) {
    try {
      calendarWindow.location.href = url;
      return;
    } catch (error) {
      // Fall through to the normal popup path.
    }
  }
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) window.location.href = url;
}

function openCalendarEvent(eventData, calendarWindow = null) {
  if (!eventData?.start || !eventData?.end || !eventData?.title) {
    closeReservedCalendarWindow(calendarWindow);
    return;
  }
  const providerKey = preferences.calendarProvider || "google";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  if (providerKey === "apple") {
    closeReservedCalendarWindow(calendarWindow);
    downloadCalendarIcs(eventData);
    return;
  }
  if (providerKey === "outlook") {
    const params = new URLSearchParams({
      subject: eventData.title,
      startdt: eventData.start.toISOString(),
      enddt: eventData.end.toISOString(),
      body: eventData.details || "",
      location: eventData.location || "",
      allday: eventData.allDay ? "true" : "false",
      ctz: timezone
    });
    navigateCalendarWindow(`https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`, calendarWindow);
    return;
  }
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventData.title,
    dates: eventData.allDay
      ? `${formatCalendarDateOnly(eventData.start)}/${formatCalendarDateOnly(eventData.end)}`
      : `${formatCalendarStamp(eventData.start)}/${formatCalendarStamp(eventData.end)}`,
    details: eventData.details || "",
    location: eventData.location || "",
    crm: eventData.availability || "BUSY",
    ctz: timezone
  });
  navigateCalendarWindow(`https://calendar.google.com/calendar/render?${params.toString()}`, calendarWindow);
}

function openDeadlineInCalendar(deadline, calendarWindow = null) {
  if (!deadline?.date || !deadline?.mod) return;
  const start = new Date(deadline.date);
  const end = deadline.endDate ? new Date(deadline.endDate) : new Date(start.getTime() + 60 * 60 * 1000);
  openCalendarEvent({
    title: deadline.mod,
    start,
    end,
    allDay: !!deadline.allDay,
    location: deadline.location || "",
    details: getDeadlineCalendarDetails(deadline),
    availability: deadline.availability || "BUSY"
  }, calendarWindow);
}

function openDeadlineInCalendarByIndex(index, event) {
  if (event) event.stopPropagation();
  const deadline = getStore().customExams[index];
  if (!deadline) return;
  openDeadlineInCalendar(deadline);
}

function saveDeadlineForm(openCalendar = false) {
  const calendarWindow = openCalendar ? reserveCalendarWindow() : null;
  const deadlineData = buildDeadlineFromForm();
  if (!deadlineData) {
    closeReservedCalendarWindow(calendarWindow);
    return;
  }
  const store = getStore();
  if (editingDeadlineIndex !== null && store.customExams[editingDeadlineIndex]) {
    deadlineData.completed = !!store.customExams[editingDeadlineIndex].completed;
    store.customExams[editingDeadlineIndex] = deadlineData;
  } else {
    store.customExams.push(deadlineData);
  }

  save();
  renderStickyExams();
  closeDeadlineForm();
  showDeadlineTab("upcoming");
  if (openCalendar && deadlineData.type === "event") openDeadlineInCalendar(deadlineData, calendarWindow);
  else closeReservedCalendarWindow(calendarWindow);
}


function setupDeadlineBarScrolling() {
  const bar = document.getElementById("live-exam-bar");
  if (!bar || bar.dataset.scrollReady) return;
  bar.dataset.scrollReady = "true";

  let isDown = false;
  let startX = 0;
  let startScrollLeft = 0;
  let moved = false;
  let pressedDeadlineIndex = null;

  bar.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    bar.scrollLeft += event.deltaY;
  }, { passive: false });

  bar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button")) return;
    isDown = true;
    moved = false;
    pressedDeadlineIndex = event.target.closest(".exam-ticker")?.dataset?.deadlineIndex ?? null;
    startX = event.clientX;
    startScrollLeft = bar.scrollLeft;
    bar.classList.add("dragging");
    bar.setPointerCapture(event.pointerId);
  });

  bar.addEventListener("pointermove", (event) => {
    if (!isDown) return;
    const dx = event.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    bar.scrollLeft = startScrollLeft - dx;
  });

  function endDrag(event) {
    if (!isDown) return;
    const releasedCard = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".exam-ticker")
      || event.target.closest(".exam-ticker");
    const releasedDeadlineIndex = releasedCard?.dataset?.deadlineIndex ?? null;
    const shouldOpen = !moved && pressedDeadlineIndex !== null && pressedDeadlineIndex === releasedDeadlineIndex;
    isDown = false;
    bar.classList.remove("dragging");
    if (bar.hasPointerCapture(event.pointerId)) bar.releasePointerCapture(event.pointerId);
    if (shouldOpen) {
      const index = Number(releasedDeadlineIndex);
      if (Number.isFinite(index)) openDeadlineForm(index);
    }
    pressedDeadlineIndex = null;
  }

  bar.addEventListener("pointerup", endDrag);
  bar.addEventListener("pointercancel", endDrag);
  bar.addEventListener("click", (event) => {
    if (!moved) {
      if (event.target.closest(".exam-ticker")) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    moved = false;
  }, true);
}

function renderDeadlineTimeline(force = false) {
  const host = document.getElementById("timeline-list");
  if (!host) return;
  if (activeDeadlineTab === "add" && !force) {
    host.innerHTML = renderDeadlineAddChoice();
    return;
  }
  const store = getStore();
  const now = Date.now();
  const exams = (store.customExams || [])
    .map((exam, originalIndex) => ({ ...exam, originalIndex }))
    .filter((exam) => !exam.completed)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!exams.length) {
    host.innerHTML = '<div class="timeline-empty deadline-view-shell">No deadlines yet. Use Add new to create one.</div>';
    return;
  }

  host.innerHTML = `<div class="deadline-view-shell">${exams.map((exam) => {
    const target = new Date(exam.date);
    const end = exam.endDate ? new Date(exam.endDate) : null;
    const isUrgent = target.getTime() <= now;
    const isEvent = exam.type === "event";
    const timeText = exam.allDay
      ? target.toLocaleDateString([], { dateStyle: "full" })
      : target.toLocaleString([], { dateStyle: "full", timeStyle: "short" });
    const rangeText = isEvent && end && !Number.isNaN(end.getTime())
      ? (exam.allDay
        ? `${target.toLocaleDateString([], { dateStyle: "medium" })} - ${end.toLocaleDateString([], { dateStyle: "medium" })}`
        : `${target.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} - ${end.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`)
      : timeText;
    const edgeColour = deadlinePriorityColour(exam);
    return `
      <div class="timeline-item">
        <div class="timeline-rail">
          <button class="timeline-dot complete-toggle" type="button" onclick="toggleDeadlineComplete(${exam.originalIndex}, event)" title="Mark deadline complete" aria-label="Mark deadline complete"></button>
        </div>
        <div class="timeline-card deadline-card-clickable" style="--deadline-edge-colour: ${edgeColour};" onclick="editDeadline(${exam.originalIndex})">
          <div class="deadline-card-top">
            <div class="deadline-card-title-line"><div class="timeline-title">${escapeHtml(exam.mod)}</div></div>
            <div class="deadline-card-countdown ${isUrgent ? "urgent" : ""}" data-deadline-countdown="${escapeHtml(exam.date)}">Due in ${escapeHtml(formatCountdown(exam.date))}</div>
            <div class="deadline-meta-line">${escapeHtml(timeText)} · ${escapeHtml(deadlineModuleLabel(exam))} · ${escapeHtml(isEvent ? "Calendar Event" : deadlinePriorityLabel(exam))}</div>
          </div>
          <div class="deadline-card-lower">
            <details class="deadline-details" onclick="event.stopPropagation()">
              <summary>Details</summary>
              <div class="deadline-detail-grid">
                <div><strong>When:</strong> ${escapeHtml(rangeText)}</div>
                ${isEvent && exam.location ? `<div><strong>Location:</strong> ${escapeHtml(exam.location)}</div>` : ""}
                ${isEvent ? `<div><strong>Show as:</strong> ${escapeHtml(exam.availability || "Busy")}</div>` : ""}
                <div><strong>Note:</strong> ${escapeHtml(exam.note || "None added")}</div>
              </div>
            </details>
            <div class="deadline-card-actions" onclick="event.stopPropagation()">
              <button class="mini-btn" type="button" onclick="editDeadline(${exam.originalIndex})">Edit</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("")}</div>`;
}

function updateDeadlineNote(index, value) {
  const store = getStore();
  if (!store.customExams[index]) return;
  store.customExams[index].note = value;
  save();
}

function toggleDeadlineComplete(index, event) {
  if (event) event.stopPropagation();
  const store = getStore();
  if (!store.customExams[index]) return;
  const removeDeadline = () => {
    store.customExams.splice(index, 1);
    save();
    renderStickyExams();
    renderDeadlineTimeline();
  };
  const row = event?.target?.closest(".timeline-item");
  if (row) {
    row.classList.add("completing");
    setTimeout(removeDeadline, 280);
    return;
  }
  removeDeadline();
}

function openDeadlineTimeline() {
  document.getElementById("timeline-modal").classList.remove("hidden");
  activeDeadlineTab = "upcoming";
  document.getElementById("deadline-tab-upcoming")?.classList.add("active");
  document.getElementById("deadline-tab-add")?.classList.remove("active");
  renderDeadlineTimeline(true);
  if (deadlineTimelineInterval) clearInterval(deadlineTimelineInterval);
  deadlineTimelineInterval = setInterval(updateDeadlineCountdowns, 1000);
}

function updateDeadlineCountdowns() {
  document.querySelectorAll("[data-deadline-countdown]").forEach((node) => {
    const date = node.dataset.deadlineCountdown;
    node.textContent = node.classList.contains("deadline-card-countdown") ? `Due in ${formatCountdown(date)}` : formatCountdown(date);
    node.classList.toggle("urgent", new Date(date).getTime() <= Date.now());
  });
}

function closeDeadlineTimeline() {
  document.getElementById("timeline-modal").classList.add("hidden");
  if (deadlineTimelineInterval) {
    clearInterval(deadlineTimelineInterval);
    deadlineTimelineInterval = null;
  }
}
