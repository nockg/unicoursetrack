/* Link library, module updates, dashboard, module forms and coursework components */

  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function setBlackboardLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: "blackboard", mi });
}

function openLinkForm(context) {
  linkFormContext = context;
  const modal = document.getElementById("link-form-modal");
  const subtitle = document.getElementById("link-form-subtitle");
  const title = document.getElementById("link-form-title");
  const nameField = document.getElementById("link-name-field");
  const nameInput = document.getElementById("link-name-input");
  const urlInput = document.getElementById("link-url-input");
  const tagInput = document.getElementById("link-tag-input");
  const notesInput = document.getElementById("link-notes-input");

  nameInput.value = "";
  urlInput.value = "";
  tagInput.value = "";
  notesInput.value = "";
  nameField.style.display = "block";

  const editingItem = context.mode === "edit"
    ? (context.type === "formula" ? getFormulaLinks(context.mi)[context.index] : getRelevantLinks(context.mi)[context.index])
    : null;

  if (context.type === "blackboard") {
    subtitle.textContent = "Blackboard";
    title.textContent = "Set Blackboard Link";
    nameField.style.display = "none";
    urlInput.value = getBlackboardLink(context.mi) || "";
    tagInput.closest(".deadline-form-row").style.display = "none";
  } else if (context.type === "formula") {
    subtitle.textContent = "Module Material";
    title.textContent = context.mode === "edit" ? "Edit Module Material" : "Add Module Material";
    nameInput.value = editingItem?.name || (MODULES[context.mi].short + " Material");
    tagInput.closest(".deadline-form-row").style.display = "grid";
  } else {
    subtitle.textContent = "Relevant Links";
    title.textContent = context.mode === "edit" ? "Edit Relevant Link" : "Add Relevant Link";
    nameInput.value = editingItem?.name || "Useful resource";
    tagInput.closest(".deadline-form-row").style.display = "grid";
  }

  if (editingItem) {
    urlInput.value = editingItem.url || "";
    tagInput.value = editingItem.tag || "";
    notesInput.value = editingItem.notes || "";
  }

  modal.classList.remove("hidden");
  setTimeout(() => (nameField.style.display === "none" ? urlInput : nameInput).focus(), 0);
}

function closeLinkForm() {
  document.getElementById("link-form-modal").classList.add("hidden");
  linkFormContext = null;
}

function saveLinkForm() {
  if (!linkFormContext) return;
  const nameInput = document.getElementById("link-name-input");
  const urlInput = document.getElementById("link-url-input");
  const tagInput = document.getElementById("link-tag-input");
  const notesInput = document.getElementById("link-notes-input");
  const url = (urlInput.value || "").trim();
  const store = getStore();

  if (linkFormContext.type === "blackboard") {
    if (url) store.blackboard[linkFormContext.mi] = safeUrl(url);
    else delete store.blackboard[linkFormContext.mi];
    save();
    updateBlackboardButton(linkFormContext.mi);
    closeLinkForm();
    return;
  }

  const name = (nameInput.value || "").trim();
  const tag = (tagInput.value || "").trim();
  const notes = (notesInput.value || "").trim();
  if (!name || !url) {
    alert("Please enter both a name and a URL.");
    return;
  }
  const payload = { name, url: safeUrl(url), tag, notes };

  if (linkFormContext.type === "formula") {
    const items = getFormulaLinks(linkFormContext.mi).slice();
    if (linkFormContext.mode === "edit" && items[linkFormContext.index]) items[linkFormContext.index] = payload;
    else items.push(payload);
    store.formulas[linkFormContext.mi] = items;
    save();
    updateFormulaButton(linkFormContext.mi);
  } else if (linkFormContext.type === "relevant") {
    if (!store.relevantLinks) store.relevantLinks = {};
    const items = getRelevantLinks(linkFormContext.mi).slice();
    if (linkFormContext.mode === "edit" && items[linkFormContext.index]) items[linkFormContext.index] = payload;
    else items.push(payload);
    store.relevantLinks[linkFormContext.mi] = items;
    save();
    renderRelevantLinks(linkFormContext.mi);
  }
  closeLinkForm();
  renderModuleLibrary();
}

function openBlackboardLink(mi, event) {
  if (event) event.stopPropagation();
  const url = getBlackboardLink(mi);
  if (url) window.open(url, "_blank", "noopener");
  else setBlackboardLink(mi);
}

function updateBlackboardButton(mi) {
  const btn = document.getElementById(`bb-link-${mi}`);
  if (!btn) return;
  const hasLink = !!getBlackboardLink(mi);
  const compact = document.body.classList.contains("compact-ui");
  if (compact) btn.textContent = hasLink ? "Blackboard" : "Set";
  else btn.textContent = hasLink ? "Launch Blackboard" : "Set Blackboard";
}

function setFormulaLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: "formula", mi });
}

function getModuleLibraryItems(type, moduleIndex = null) {
  const items = [];
  MODULES.forEach((mod, mi) => {
    if (moduleIndex !== null && mi !== moduleIndex) return;
    const source = type === "formula" ? getFormulaLinks(mi) : getRelevantLinks(mi);
    source.forEach((item, index) => {
      items.push({
        type,
        mi,
        index,
        moduleCode: mod.kanji || mod.short || `Module ${mi + 1}`,
        moduleName: mod.name || mod.short || `Module ${mi + 1}`,
        name: item.name || "",
        url: item.url || "",
        tag: item.tag || "",
        notes: item.notes || ""
      });
    });
  });
  const search = moduleLibrarySearch.trim().toLowerCase();
  const filter = moduleLibraryScopeMi === null ? moduleLibraryFilter : String(moduleLibraryScopeMi);
  return items.filter((item) => {
    if (filter !== "all" && String(item.mi) !== filter) return false;
    if (!search) return true;
    return [item.name, item.url, item.tag, item.notes, item.moduleCode, item.moduleName]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

function toggleModuleLibraryLinks() {
  moduleLibraryLinksOpen = !moduleLibraryLinksOpen;
  renderModuleLibrary();
}

function toggleModuleLibraryMaterials() {
  moduleLibraryMaterialsOpen = !moduleLibraryMaterialsOpen;
  renderModuleLibrary();
}

function buildModuleLibraryCard(item) {
  const notes = item.notes ? `<div class="module-library-card-notes">${escapeHtml(item.notes)}</div>` : "";
  const tag = item.tag ? `<span class="module-library-pill">${escapeHtml(item.tag)}</span>` : "";
  const accent = getModuleColourSet(item.mi);
  return `
    <article class="module-library-card" onclick="openLibraryItem(${item.mi}, '${item.type}', ${item.index}, event)">
      <div class="module-library-module-accent" style="background:${accent.stripe};"></div>
      <div class="module-library-card-head">
        <div>
          <div class="module-library-card-title">${escapeHtml(item.name)}</div>
          <div class="module-library-card-meta">
            <span class="module-library-pill">${escapeHtml(item.moduleCode)}</span>
            ${tag}
          </div>
        </div>
      </div>
      ${notes}
      <div class="module-library-card-actions">
        <button class="mini-btn" type="button" onclick="editLibraryItem(${item.mi}, '${item.type}', ${item.index}, event)">Edit</button>
        <button class="mini-btn module-delete-btn" type="button" onclick="deleteLibraryItem(${item.mi}, '${item.type}', ${item.index}, event)">Delete</button>
      </div>
    </article>
  `;
}

function refreshModuleLibraryFilterOptions() {
  const filter = document.getElementById("module-library-filter");
  if (!filter) return;
  if (moduleLibraryScopeMi !== null) {
    const mod = MODULES[moduleLibraryScopeMi];
    filter.innerHTML = `<option value="${moduleLibraryScopeMi}">${escapeHtml(mod?.kanji || mod?.name || "Current Module")}</option>`;
    filter.value = String(moduleLibraryScopeMi);
    filter.disabled = true;
    return;
  }
  filter.disabled = false;
  filter.innerHTML = `<option value="all">All Modules</option>` + MODULES.map((mod, mi) => (
    `<option value="${mi}">${escapeHtml(mod.kanji || mod.name || `Module ${mi + 1}`)}</option>`
  )).join("");
  filter.value = moduleLibraryFilter;
}

function renderModuleLibrary() {
  const materialsHost = document.getElementById("module-library-materials");
  const linksHost = document.getElementById("module-library-links");
  if (!materialsHost || !linksHost) return;
  const title = document.getElementById("module-library-title");
  const currentModule = moduleLibraryScopeMi !== null ? MODULES[moduleLibraryScopeMi] : null;
  if (title) title.textContent = currentModule
    ? `${currentModule.kanji || currentModule.name || "Module"} Library`
    : "All Modules Library";
  document.getElementById("module-library-open-all-btn")?.classList.toggle("hidden", moduleLibraryScopeMi === null);
  refreshModuleLibraryFilterOptions();
  const searchInput = document.getElementById("module-library-search");
  if (searchInput && searchInput.value !== moduleLibrarySearch) searchInput.value = moduleLibrarySearch;
  document.getElementById("module-library-view-list")?.classList.toggle("calendar-btn", moduleLibraryViewMode === "list");
  document.getElementById("module-library-view-cards")?.classList.toggle("calendar-btn", moduleLibraryViewMode === "cards");

  const materials = getModuleLibraryItems("formula", moduleLibraryScopeMi);
  const links = getModuleLibraryItems("relevant", moduleLibraryScopeMi);
  const materialWord = materials.length === 1 ? "item" : "items";
  const linkWord = links.length === 1 ? "link" : "links";
  const materialsSection = document.querySelector(".module-library-materials-section");
  const linksSection = linksHost.closest(".module-library-section");
  const materialsCopy = materialsSection?.querySelector(".module-library-section-copy");
  const linksCopy = linksSection?.querySelector(".module-library-section-copy");

  if (materialsSection) materialsSection.classList.toggle("is-collapsed", !moduleLibraryMaterialsOpen);
  if (linksSection) linksSection.classList.toggle("is-collapsed", !moduleLibraryLinksOpen);
  if (materialsCopy) {
    materialsCopy.textContent = moduleLibraryMaterialsOpen
      ? `Formula sheets, worked examples, reference pages, and quick-access study material. ${materials.length} saved ${materialWord}.`
      : `${materials.length} saved material ${materialWord}. Tap to expand.`;
  }
  if (linksCopy) {
    linksCopy.textContent = moduleLibraryLinksOpen
      ? `Useful URLs, portals, videos, docs, and external resources. ${links.length} saved ${linkWord}.`
      : `${links.length} saved relevant ${linkWord}. Tap to expand.`;
  }

  materialsHost.className = "module-library-list" + (moduleLibraryViewMode === "cards" ? " cards" : "") + (moduleLibraryMaterialsOpen ? "" : " hidden");
  linksHost.className = "module-library-list" + (moduleLibraryViewMode === "cards" ? " cards" : "") + (moduleLibraryLinksOpen ? "" : " hidden");
  document.getElementById("module-library-links-chevron")?.classList.toggle("open", moduleLibraryLinksOpen);
  document.getElementById("module-library-materials-chevron")?.classList.toggle("open", moduleLibraryMaterialsOpen);
  materialsHost.innerHTML = materials.length
    ? materials.map(buildModuleLibraryCard).join("")
    : `<div class="module-library-empty">No module material saved yet.</div>`;
  linksHost.innerHTML = links.length
    ? links.map(buildModuleLibraryCard).join("")
    : `<div class="module-library-empty">No relevant links saved yet.</div>`;
}

function openModuleLibrary(mi = null, focus = "both", event) {
  if (event) event.stopPropagation();
  materialLibraryModuleIndex = mi;
  moduleLibraryScopeMi = Number.isInteger(mi) ? mi : null;
  if (moduleLibraryScopeMi === null) moduleLibraryFilter = "all";
  else moduleLibraryFilter = String(moduleLibraryScopeMi);
  moduleLibraryMaterialsOpen = false;
  moduleLibraryLinksOpen = false;

  document.getElementById("module-library-modal").classList.remove("hidden");
  renderModuleLibrary();
}

function closeModuleLibrary() {
  document.getElementById("module-library-modal").classList.add("hidden");
  materialLibraryModuleIndex = null;
  moduleLibraryScopeMi = null;
}

function updateModuleLibrarySearch(value) {
  moduleLibrarySearch = String(value || "");
  renderModuleLibrary();
}

function updateModuleLibraryFilter(value) {
  moduleLibraryFilter = value;
  renderModuleLibrary();
}

function setModuleLibraryView(view) {
  moduleLibraryViewMode = view === "cards" ? "cards" : "list";
  renderModuleLibrary();
}

function openLibraryAdd(type) {
  if (moduleLibraryScopeMi === null && moduleLibraryFilter === "all") {
    showAppNotice("Pick a module first", "Choose a module from the filter at the top of the library before adding a new material or link from the all-modules view.");
    return;
  }
  const mi = moduleLibraryScopeMi !== null ? moduleLibraryScopeMi : Number(moduleLibraryFilter);
  closeModuleLibrary();
  openLinkForm({ type, mi });
}

function openLibraryItem(mi, type, index, event) {
  if (event) event.stopPropagation();
  const item = (type === "formula" ? getFormulaLinks(mi) : getRelevantLinks(mi))[index];
  if (!item?.url) return;
  window.open(item.url, "_blank", "noopener");
}

function editLibraryItem(mi, type, index, event) {
  if (event) event.stopPropagation();
  closeModuleLibrary();
  openLinkForm({ type, mi, index, mode: "edit" });
}

function deleteLibraryItem(mi, type, index, event) {
  if (type === "formula") deleteFormulaLink(mi, index, event);
  else deleteRelevantLink(mi, index, event);
  renderModuleLibrary();
}

function deleteFormulaLink(mi, index, event) {
  if (event) event.stopPropagation();
  const items = getFormulaLinks(mi).slice();
  if (!items[index]) return;
  items.splice(index, 1);
  const store = getStore();
  if (items.length) store.formulas[mi] = items; else delete store.formulas[mi];
  save();
  updateFormulaButton(mi);
  renderModuleLibrary();
}

function openFormulaLink(mi, event) {
  openModuleLibrary(mi, "materials", event);
}

function renderFormulaLinks(mi) {
  const host = document.getElementById(`formula-links-${mi}`);
  if (!host) return;
  const items = getFormulaLinks(mi);
  if (!items.length) {
    host.innerHTML = '<div class="formula-empty">No module material added yet.</div>';
    return;
  }
  host.innerHTML = items.map((item, index) => `
    <div class="formula-chip">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>
      <button class="formula-remove-btn" type="button" onclick="deleteFormulaLink(${mi}, ${index}, event)" title="Delete module material">x</button>
    </div>
  `).join("");
}

function addRelevantLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: "relevant", mi });
}

function deleteRelevantLink(mi, index, event) {
  if (event) event.stopPropagation();
  const items = getRelevantLinks(mi).slice();
  if (!items[index]) return;
  items.splice(index, 1);
  const store = getStore();
  if (!store.relevantLinks) store.relevantLinks = {};
  if (items.length) store.relevantLinks[mi] = items; else delete store.relevantLinks[mi];
  save();
  renderRelevantLinks(mi);
  renderModuleLibrary();
}

function renderRelevantLinks(mi) {
  const host = document.getElementById(`relevant-links-${mi}`);
  if (!host) return;
  const items = getRelevantLinks(mi);
  if (!items.length) {
    host.innerHTML = '<div class="relevant-links-empty">No relevant links added yet.</div>';
    return;
  }
  host.innerHTML = items.map((item, index) => `
    <div class="relevant-link-chip">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>
      <button class="relevant-link-remove-btn" type="button" onclick="deleteRelevantLink(${mi}, ${index}, event)" title="Delete relevant link">x</button>
    </div>
  `).join("");
}

function updateFormulaButton(mi) {
  const btn = document.getElementById(`formula-btn-${mi}`);
  if (btn) {
    const count = getFormulaLinks(mi).length;
    const compact = document.body.classList.contains("compact-ui");
    const mod = MODULES[mi] || {};
    const labelBase = mod.kanji || mod.short || "Module";
    btn.textContent = compact
      ? "Library"
      : `${labelBase} Library`;
    btn.title = `${mod.name || labelBase} Library`;
    btn.style.opacity = count ? "1" : "0.65";
  }
  renderFormulaLinks(mi);
}

function updateModule(mi) {
  const done = getModuleDone(mi);
  const pct = getModulePct(mi);
  document.getElementById(`mdone-${mi}`).textContent = done;
  document.getElementById(`mpct-${mi}`).textContent = pct.toFixed(1) + "% complete";
  document.getElementById(`mfill-${mi}`).style.width = pct.toFixed(1) + "%";

  const final = getModuleFinal(mi);
  const finalEl = document.getElementById(`mfinal-${mi}`);
  const clsEl = document.getElementById(`mcls-${mi}`);
  finalEl.textContent = final === null ? "-" : final.toFixed(1) + "%";
  if (final !== null) {
    const cls = classify(final);
    clsEl.className = "final-cls " + (cls.cls || "");
    clsEl.textContent = cls.label;
  } else {
    clsEl.className = "final-cls";
    clsEl.textContent = "";
  }

  const cwInput = document.getElementById(`cw-${mi}`);
  const exInput = document.getElementById(`exam-${mi}`);
  const compactCw = document.querySelector(`#topics-${mi} .compact-cw`);
  const compactEx = document.querySelector(`#topics-${mi} .compact-ex`);
  if (cwInput) {
    const calculated = calculateCourseworkFromComponents(mi);
    cwInput.disabled = MODULES[mi].cw === 0;
    if (compactCw) compactCw.disabled = MODULES[mi].cw === 0;
    if (MODULES[mi].cw === 0) cwInput.placeholder = "N/A";
    else {
      if (calculated.mark !== null) {
        getStore().coursework[mi] = calculated.mark.toFixed(1);
        cwInput.value = calculated.mark.toFixed(1);
        if (compactCw) compactCw.value = calculated.mark.toFixed(1);
        cwInput.placeholder = `Calc ${calculated.mark.toFixed(1)}%`;
      } else {
        cwInput.placeholder = "-";
      }
    }
  }
  if (exInput) {
    exInput.disabled = MODULES[mi].exam === 0;
    if (compactEx) compactEx.disabled = MODULES[mi].exam === 0;
    exInput.placeholder = MODULES[mi].exam === 0 ? "N/A" : "-";
    if (MODULES[mi].exam === 0) exInput.value = "";
  }
  updateCourseworkSummary(mi);
}

function updateGlobal() {
  let total = 0;
  let done = 0;
  let weightedCredits = 0;
  MODULES.forEach((mod, mi) => {
    total += getModuleTotal(mi);
    done += getModuleDone(mi);
    weightedCredits += mod.credits * (getModulePct(mi) / 100);
  });
  const pct = total ? (done / total) * 100 : 0;
  document.getElementById("global-done").textContent = done;
  document.getElementById("global-total").textContent = total;
  document.getElementById("global-fill").style.width = pct.toFixed(1) + "%";
  document.getElementById("global-pct-text").textContent = pct.toFixed(1) + "% complete";
  document.getElementById("credits-text").textContent = weightedCredits.toFixed(1) + " / " + TOTAL_CREDITS + " credits";
  updatePredictor();
  updateDashboard();
}

function updatePredictor() {
  const avg = getWeightedAvg();
  const heroPredictor = document.getElementById("hero-predictor");
  const heroClass = document.getElementById("hero-class");
  const badgeHost = document.getElementById("classification-badge");
  if (avg === null) {
    heroPredictor.textContent = "-";
    heroClass.textContent = "Awaiting marks";
    badgeHost.innerHTML = "";
    return;
  }
  const cls = classify(avg);
  heroPredictor.textContent = avg.toFixed(1) + "%";
  heroClass.textContent = cls.badge;
  badgeHost.innerHTML = `<span class="classification-badge ${cls.heroCls}">${cls.badge}</span>`;
}

function updateDashboard() {
  const avg = getWeightedAvg();
  let total = 0;
  let done = 0;
  let weightedCredits = 0;
  let creditsWithMarks = 0;
  MODULES.forEach((mod, mi) => {
    total += getModuleTotal(mi);
    done += getModuleDone(mi);
    weightedCredits += mod.credits * (getModulePct(mi) / 100);
    if (getModuleFinal(mi) !== null) creditsWithMarks += mod.credits;
  });
  document.getElementById("dash-completion").textContent = (total ? (done / total) * 100 : 0).toFixed(0) + "%";
  document.getElementById("dash-credits").textContent = weightedCredits.toFixed(1) + " / " + TOTAL_CREDITS + " credits";

  const predictor = document.getElementById("dash-predictor");
  const status = document.getElementById("dash-status");
  const badge = document.getElementById("dash-badge");
  if (avg === null) {
    predictor.textContent = "-";
    status.textContent = "Enter module marks below";
    badge.innerHTML = "";
  } else {
    const cls = classify(avg);
    predictor.textContent = avg.toFixed(1) + "%";
    status.textContent = `Full-year weighted average based on ${creditsWithMarks} / ${TOTAL_CREDITS} credits`;
    badge.innerHTML = `<span class="classification-badge ${cls.heroCls}">${cls.badge}</span>`;
  }
  if (!document.getElementById("dashboard-modal").classList.contains("hidden")) renderDashboardChart();
}

function openDashboard() {
  document.getElementById("dashboard-modal").classList.remove("hidden");
  updateDashboard();
  renderDashboardChart();
}

function closeDashboard() {
  document.getElementById("dashboard-modal").classList.add("hidden");
}

document.getElementById("dashboard-modal").addEventListener("click", (event) => {
  if (event.target.id === "dashboard-modal") closeDashboard();
});

document.getElementById("timeline-modal").addEventListener("click", (event) => {
  if (event.target.id === "timeline-modal") closeDeadlineTimeline();
});

document.getElementById("todo-modal").addEventListener("click", (event) => {
  if (event.target.id === "todo-modal") closeTodoPlanner();
});

document.querySelector("#todo-modal .timeline-head")?.addEventListener("pointerdown", startTodoPanelDrag);
document.addEventListener("pointermove", moveTodoPanelDrag);
document.addEventListener("pointerup", endTodoPanelDrag);
window.addEventListener("resize", () => {
  if (!document.getElementById("todo-modal")?.classList.contains("hidden")) applyTodoPanelState();
});

document.getElementById("deadline-form-modal").addEventListener("click", (event) => {
  if (event.target.id === "deadline-form-modal") closeDeadlineForm();
});

document.getElementById("calendar-modal").addEventListener("click", (event) => {
  if (event.target.id === "calendar-modal") closeCalendarComposer();
});

document.getElementById("calendar-all-day-input")?.addEventListener("change", updateCalendarComposerMode);
document.getElementById("deadline-all-day-input")?.addEventListener("change", updateDeadlineFormMode);

document.getElementById("module-library-modal").addEventListener("click", (event) => {
  if (event.target.id === "module-library-modal") closeModuleLibrary();
});

document.getElementById("course-setup-modal").addEventListener("click", (event) => {
  if (event.target.id === "course-setup-modal") closeCourseSetupModal();
});

document.getElementById("onboarding-modal").addEventListener("click", (event) => {
  if (event.target.id === "onboarding-modal") return;
});

document.getElementById("auth-modal").addEventListener("click", (event) => {
  if (!currentUser || isRecoveryFlow()) return;
  if (event.target.id === "auth-modal") closeAuthModal();
});

function renderDashboardChart() {
  const canvas = document.getElementById("dashboard-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dark = document.body.classList.contains("theme-dark");
  const quiet = document.body.classList.contains("theme-quiet");
  const rectWidth = canvas.parentElement.clientWidth || 760;
  const width = rectWidth;
  const height = 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const padTop = 20;
  const padRight = 14;
  const padBottom = 52;
  const padLeft = 44;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const step = chartWidth / MODULES.length;
  const barWidth = Math.max(28, Math.min(42, Math.floor(step * 0.42)));
  const crisp = (value) => Math.round(value) + 0.5;
  const chartMonoFont = preferences.font === "sans"
    ? "'Segoe UI', Arial, sans-serif"
    : preferences.font === "mono"
      ? "'DM Mono', Consolas, monospace"
      : "'DM Mono', monospace";
  const chartDisplayFont = preferences.font === "sans"
    ? "'Segoe UI', Arial, sans-serif"
    : preferences.font === "mono"
      ? "'DM Mono', Consolas, monospace"
      : "'Shippori Mincho', serif";

  const colors = MODULES.map((_, mi) => {
    const choice = getModuleColourSet(mi);
    return choice.text || "#c0392b";
  });

  ctx.strokeStyle = dark ? "rgba(255,255,255,0.12)" : "rgba(26,22,18,0.09)";
  ctx.lineWidth = 1;
  ctx.font = `11px ${chartMonoFont}`;
  ctx.fillStyle = dark ? "rgba(245,240,232,0.7)" : "rgba(26,22,18,0.54)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const value = i * 25;
    const y = crisp(padTop + chartHeight - (chartHeight * value / 100));
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();
    ctx.fillText(value + "%", padLeft - 8, y);
  }

  MODULES.forEach((mod, mi) => {
    const pct = getModulePct(mi);
    const x = Math.round(padLeft + (step * mi) + (step - barWidth) / 2);
    const barHeight = Math.round((chartHeight * pct) / 100);
    const y = Math.round(padTop + chartHeight - barHeight);
    ctx.fillStyle = colors[mi];
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = dark ? "rgba(255,255,255,0.9)" : "rgba(26,22,18,0.84)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `bold 13px ${chartDisplayFont}`;
    ctx.fillText(pct.toFixed(0) + "%", x + barWidth / 2, y - 8);

    ctx.fillStyle = dark ? "rgba(245,240,232,0.78)" : "rgba(26,22,18,0.72)";
    ctx.textBaseline = "top";
    ctx.font = `11px ${chartMonoFont}`;
    ctx.fillText(mod.kanji, x + barWidth / 2, height - 30);
  });
}

function formatCountdown(dateString) {
  const target = new Date(dateString);
  const diff = target.getTime() - Date.now();
  const sign = diff < 0 ? "-" : "";
  const totalSeconds = Math.floor(Math.abs(diff) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${sign}${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function handleYearDropdown(value) {
  if (value === "__new__") return createNewYear();
  if (value === "__archive__") return archiveCurrentYear();
  if (value === "__delete__") return deleteCurrentYear();
  switchYear(value);
}

function switchYear(yearId) {
  if (!state.years[yearId]) return;
  state.ui.currentYearId = yearId;
  refreshActiveYear();
  save();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

function archiveCurrentYear() {
  const year = getCurrentYear();
  if (!year || year.id === "year1" && year.store.archived) return;
  year.store.archived = !year.store.archived;
  save();
  renderYearSelector();
}

function addModuleToCurrentYear() {
  const code = document.getElementById("module-code-input");
  const name = document.getElementById("module-name-input");
  const credits = document.getElementById("module-credits-input");
  const cw = document.getElementById("module-cw-input");
  const exam = document.getElementById("module-exam-input");
  const blackboard = document.getElementById("module-blackboard-input");
  const optionsFields = document.getElementById("module-options-fields");
  const colourField = document.getElementById("module-colour-field");
  editingModuleIndex = null;
  if (code) code.value = "NEW201";
  if (name) name.value = "New Module";
  if (credits) credits.value = "15";
  if (cw) cw.value = "50";
  if (exam) exam.value = "50";
  if (blackboard) blackboard.value = "";
  if (optionsFields) optionsFields.classList.add("hidden");
  if (colourField) colourField.classList.add("hidden");
  syncModuleWeightInputs("cw");
  const title = document.querySelector("#module-form-modal .dashboard-title");
  const saveBtn = document.querySelector("#module-form-modal .deadline-form-actions .nav-btn:last-child");
  if (title) title.textContent = "Add Module";
  if (saveBtn) saveBtn.textContent = "Add Module";
  document.getElementById("module-form-modal").classList.remove("hidden");
  setTimeout(() => code && code.focus(), 0);
}

function closeModuleForm() {
  document.getElementById("module-form-modal").classList.add("hidden");
  editingModuleIndex = null;
}

function formatWeightInputValue(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function syncModuleWeightInputs(source = "cw") {
  const cwInput = document.getElementById("module-cw-input");
  const examInput = document.getElementById("module-exam-input");
  if (!cwInput || !examInput) return;
  if (source === "cw") {
    const cw = parseFloat(cwInput.value || "");
    if (!Number.isFinite(cw)) return;
    const safeCw = Math.min(100, Math.max(0, cw));
    if (safeCw !== cw) cwInput.value = formatWeightInputValue(safeCw);
    examInput.value = formatWeightInputValue(100 - safeCw);
    return;
  }
  const exam = parseFloat(examInput.value || "");
  if (!Number.isFinite(exam)) return;
  const safeExam = Math.min(100, Math.max(0, exam));
  if (safeExam !== exam) examInput.value = formatWeightInputValue(safeExam);
  cwInput.value = formatWeightInputValue(100 - safeExam);
}

document.getElementById("module-cw-input")?.addEventListener("input", () => syncModuleWeightInputs("cw"));
document.getElementById("module-exam-input")?.addEventListener("input", () => syncModuleWeightInputs("exam"));
document.getElementById("module-colour-input")?.addEventListener("input", (event) => {
  const preview = document.getElementById("module-colour-preview");
  if (preview) preview.style.background = event.target.value;
});

function parseQuotedList(input) {
  const text = String(input || "").trim();
  if (!text) return [];
  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1].trim()).filter(Boolean);
  return quoted.length ? quoted : text.split(/\s*,\s*|\n+/).map((item) => item.trim()).filter(Boolean);
}

function editModuleWeights(mi, event) {
  if (event) event.stopPropagation();
  const mod = MODULES[mi];
  if (!mod) return;
  editingModuleIndex = mi;
  const code = document.getElementById("module-code-input");
  const name = document.getElementById("module-name-input");
  const credits = document.getElementById("module-credits-input");
  const cw = document.getElementById("module-cw-input");
  const exam = document.getElementById("module-exam-input");
  const blackboard = document.getElementById("module-blackboard-input");
  const colourField = document.getElementById("module-colour-field");
  const colourInput = document.getElementById("module-colour-input");
  const colourPreview = document.getElementById("module-colour-preview");
  const optionsFields = document.getElementById("module-options-fields");
  if (code) code.value = mod.kanji || "";
  if (name) name.value = mod.name || "";
  if (credits) credits.value = mod.credits ?? 15;
  if (cw) cw.value = mod.cw ?? 0;
  if (exam) exam.value = mod.exam ?? 0;
  if (blackboard) blackboard.value = getBlackboardLink(mi) || "";
  if (optionsFields) optionsFields.classList.remove("hidden");
  if (colourField) colourField.classList.toggle("hidden", !isColourCustomisableTheme());
  if (colourInput) colourInput.value = getStoredModuleColourHex(mi);
  if (colourPreview) colourPreview.style.background = getModuleColourSet(mi).fill;
  syncModuleWeightInputs("cw");
  const title = document.querySelector("#module-form-modal .dashboard-title");
  const saveBtn = document.querySelector("#module-form-modal .deadline-form-actions .nav-btn:last-child");
  if (title) title.textContent = "Module Options";
  if (saveBtn) saveBtn.textContent = "Save Module";
  document.getElementById("module-form-modal").classList.remove("hidden");
}

function saveModuleForm() {
  const codeInput = document.getElementById("module-code-input");
  const nameInput = document.getElementById("module-name-input");
  const creditsInput = document.getElementById("module-credits-input");
  const cwInput = document.getElementById("module-cw-input");
  const examInput = document.getElementById("module-exam-input");
  const blackboardInput = document.getElementById("module-blackboard-input");
  const colourInput = document.getElementById("module-colour-input");
  const code = (codeInput.value || "").trim();
  const name = (nameInput.value || "").trim();
  if (!code || !name) {
    alert("Please enter both module code and module name.");
    return;
  }
  const credits = parseFloat(creditsInput.value || "");
  let courseworkWeight = parseFloat(cwInput.value || "");
  let examWeight = parseFloat(examInput.value || "");
  if (Number.isFinite(courseworkWeight) && courseworkWeight >= 100) examWeight = 0;
  if (Number.isFinite(examWeight) && examWeight >= 100) courseworkWeight = 0;
  const moduleData = {
    name,
    kanji: code.toUpperCase(),
    short: code.toUpperCase(),
    credits: Number.isFinite(credits) ? credits : 15,
    cw: Number.isFinite(courseworkWeight) ? courseworkWeight : 50,
    exam: Number.isFinite(examWeight) ? examWeight : 50,
    topics: []
  };
  if (editingModuleIndex !== null && MODULES[editingModuleIndex]) {
    const existing = MODULES[editingModuleIndex];
    MODULES[editingModuleIndex] = Object.assign({}, existing, moduleData, { topics: existing.topics || [] });
  } else {
    MODULES.push(moduleData);
  }
  const targetIndex = editingModuleIndex !== null ? editingModuleIndex : MODULES.length - 1;
  if (editingModuleIndex !== null) {
    const blackboardUrl = (blackboardInput?.value || "").trim();
    const store = getStore();
    if (blackboardUrl) store.blackboard[targetIndex] = safeUrl(blackboardUrl);
    else delete store.blackboard[targetIndex];
    if (isColourCustomisableTheme() && colourInput?.value) {
      if (!store.moduleColors) store.moduleColors = {};
      const family = preferences.theme === "dark" ? "dark" : "light";
      const current = store.moduleColors[targetIndex] || {};
      store.moduleColors[targetIndex] = Object.assign({}, current, { [family]: normaliseHexColour(colourInput.value) });
    }
  }
  save();
  refreshActiveYear();
  buildModules();
  updateGlobal();
  closeModuleForm();
}

function shiftIndexedObjectAfterDelete(object, deletedIndex) {
  if (!object) return {};
  const shifted = {};
  Object.entries(object).forEach(([key, value]) => {
    const index = parseInt(key, 10);
    if (!Number.isFinite(index) || index === deletedIndex) return;
    shifted[index > deletedIndex ? index - 1 : index] = value;
  });
  return shifted;
}

function shiftTopicsAfterModuleDelete(topics, deletedIndex) {
  const shifted = {};
  Object.entries(topics || {}).forEach(([key, value]) => {
    const topicMatch = key.match(/^t_(\d+)_(\d+)$/);
    if (topicMatch) {
      const moduleIndex = parseInt(topicMatch[1], 10);
      const topicIndex = topicMatch[2];
      if (moduleIndex === deletedIndex) return;
      const nextModuleIndex = moduleIndex > deletedIndex ? moduleIndex - 1 : moduleIndex;
      shifted[`t_${nextModuleIndex}_${topicIndex}`] = value;
      return;
    }
    const subtopicMatch = key.match(/^s_(\d+)_(\d+)_(\d+)$/);
    if (!subtopicMatch) return;
    const moduleIndex = parseInt(subtopicMatch[1], 10);
    const topicIndex = subtopicMatch[2];
    const subIndex = subtopicMatch[3];
    if (moduleIndex === deletedIndex) return;
    const nextModuleIndex = moduleIndex > deletedIndex ? moduleIndex - 1 : moduleIndex;
    shifted[`s_${nextModuleIndex}_${topicIndex}_${subIndex}`] = value;
  });
  return shifted;
}

function addCourseworkComponent(mi, event) {
  if (event) event.stopPropagation();
  courseworkFormModuleIndex = mi;
  const nameInput = document.getElementById("cw-component-name-input");
  const markInput = document.getElementById("cw-component-mark-input");
  const weightInput = document.getElementById("cw-component-weight-input");
  if (nameInput) nameInput.value = "";
  if (markInput) markInput.value = "";
  if (weightInput) weightInput.value = "";
  document.getElementById("coursework-component-modal").classList.remove("hidden");
  setTimeout(() => nameInput && nameInput.focus(), 0);
}

function closeCourseworkComponentForm() {
  document.getElementById("coursework-component-modal").classList.add("hidden");
  courseworkFormModuleIndex = null;
}

function saveCourseworkComponentForm() {
  const mi = courseworkFormModuleIndex;
  if (mi === null || mi === undefined || !MODULES[mi]) return;
  const nameInput = document.getElementById("cw-component-name-input");
  const markInput = document.getElementById("cw-component-mark-input");
  const weightInput = document.getElementById("cw-component-weight-input");
  const input = (nameInput?.value || "").trim();
  if (!input) {
    alert("Please enter a coursework component name.");
    return;
  }

  const quotedComponents = [...input.matchAll(/"([^"]+)"/g)]
    .map(match => match[1].trim())
    .filter(Boolean);

  const namesToAdd = quotedComponents.length ? quotedComponents : [input];
  const mark = markInput?.value || "";
  const weight = weightInput?.value || "";
  const components = getCourseworkComponents(mi);

  namesToAdd.forEach((name) => {
    components.push({ name, mark, weight });
  });

  const calculated = calculateCourseworkFromComponents(mi);
  if (calculated.mark !== null) {
    getStore().coursework[mi] = calculated.mark.toFixed(1);
  }

  save();
  buildModules();
  updateGlobal();
  closeCourseworkComponentForm();
}

function updateCourseworkComponent(mi, ci, field, value) {
  const components = getCourseworkComponents(mi);
  if (!components[ci]) return;
  components[ci][field] = value;
  const calculated = calculateCourseworkFromComponents(mi);
  if (calculated.mark !== null) {
    getStore().coursework[mi] = calculated.mark.toFixed(1);
    const cwInput = document.getElementById(`cw-${mi}`);
    const compactCw = document.querySelector(`#topics-${mi} .compact-cw`);
    if (cwInput) cwInput.value = calculated.mark.toFixed(1);
    if (compactCw) compactCw.value = calculated.mark.toFixed(1);
  }
  save();
  updateModule(mi);
  updateGlobal();
  updateCourseworkSummary(mi);
}

function updateCourseworkSummary(mi) {
  const summary = document.getElementById(`cw-calc-summary-${mi}`);
  if (!summary) return;
  const calculated = calculateCourseworkFromComponents(mi);
  const manual = parseMark(getStore().coursework[mi]);

  if (calculated.mark !== null) {
    summary.textContent = `Calculated coursework: ${calculated.mark.toFixed(1)}% - Components override manual coursework input`;
    return;
  }

  if (manual !== null) {
    summary.textContent = `Manual coursework override: ${manual.toFixed(1)}%`;
    return;
  }

  summary.textContent = `Enter an overall coursework mark above, or let this calculator build it from your assessments.`;
}

function commitCourseworkPlaceholder(mi, event) {
  if (event) event.stopPropagation();
  const host = document.getElementById(`cw-components-${mi}`);
  if (!host) return;
  const name = host.querySelector(".cw-placeholder-name")?.value || "";
  const mark = host.querySelector(".cw-placeholder-mark")?.value || "";
  const weight = host.querySelector(".cw-placeholder-weight")?.value || "";
  if (!name.trim() && !mark && !weight) return;
  const items = getCourseworkComponents(mi);
  items.push({ name, mark, weight });
  getStore().courseworkComponents[mi] = items;
  const calculated = calculateCourseworkFromComponents(mi);
  if (calculated.mark !== null) getStore().coursework[mi] = calculated.mark.toFixed(1);
  save();
  buildModules();
  updateGlobal();
}

function addBlankCourseworkComponent(mi, event) {
  if (event) event.stopPropagation();
  const items = getCourseworkComponents(mi);
  items.push({ name: "", mark: "", weight: "" });
  getStore().courseworkComponents[mi] = items;
  save();
  buildModules();
  updateGlobal();
}


function remapTopicStateForReorder(mi, fromIndex, toIndex) {
  const checked = getModuleTopicStateSnapshot(mi);
  const [moved] = checked.splice(fromIndex, 1);
  checked.splice(toIndex, 0, moved);
  applyModuleTopicStateSnapshot(mi, checked);
}

function moveTopicInModule(mi, fromIndex, toIndex, placement = "before") {
  const topics = MODULES[mi]?.topics;
