function updateModule(mi) {
  const done = getModuleDone(mi);
  const pct = getModulePct(mi);
  document.getElementById(`mdone-${mi}`).textContent = done;
  document.getElementById(`mpct-${mi}`).textContent = pct.toFixed(1) + "% complete";
  document.getElementById(`mfill-${mi}`).style.width = pct.toFixed(1) + "%";

  const final = getModuleFinal(mi);
  const finalEl = document.getElementById(`mfinal-${mi}`);
  const clsEl = document.getElementById(`mcls-${mi}`);
  const displayGrade = formatModuleGradeDisplay(mi);
  finalEl.textContent = displayGrade.main;
  if (final !== null) {
    const cls = classify(final);
    clsEl.className = "final-cls " + (cls.cls || "");
    clsEl.textContent = [displayGrade.label, displayGrade.secondary].filter(Boolean).join(" · ");
  } else {
    clsEl.className = "final-cls";
    clsEl.textContent = "";
  }

  const cwInput = document.getElementById(`cw-${mi}`);
  const exInput = document.getElementById(`exam-${mi}`);
  const compactCw = document.querySelector(`#topics-${mi} .compact-cw`);
  const compactEx = document.querySelector(`#topics-${mi} .compact-ex`);
  if (getGradingSystem() === "uk" && cwInput) {
    const calculated = calculateCourseworkFromComponents(mi);
    cwInput.disabled = MODULES[mi].cw === 0;
    if (compactCw) compactCw.disabled = MODULES[mi].cw === 0;
    if (MODULES[mi].cw === 0) cwInput.placeholder = "N/A";
    else {
      if (calculated.mark !== null) {
        const calculatedValue = formatGradeInputValue(calculated.mark);
        getStore().coursework[mi] = calculatedValue;
        cwInput.value = calculatedValue;
        if (compactCw) compactCw.value = calculatedValue;
        cwInput.placeholder = `Calc ${formatSelectedGrade(calculated.mark).main}`;
      } else {
        cwInput.placeholder = getGradeScaleConfig().placeholder;
      }
    }
  }
  if (getGradingSystem() === "uk" && exInput) {
    exInput.disabled = MODULES[mi].exam === 0;
    if (compactEx) compactEx.disabled = MODULES[mi].exam === 0;
    exInput.placeholder = MODULES[mi].exam === 0 ? "N/A" : "-";
    if (MODULES[mi].exam === 0) exInput.value = "";
  }
  if (getGradingSystem() === "uk") updateCourseworkSummary(mi);
}

function updateGlobal() {
  let total = 0;
  let done = 0;
  let weightedCredits = 0;
  MODULES.forEach((mod, mi) => {
    if (!isModuleVisibleInActiveTerm(mi)) return;
    total += getModuleTotal(mi);
    done += getModuleDone(mi);
    weightedCredits += mod.credits * (getModulePct(mi) / 100);
  });
  const pct = total ? (done / total) * 100 : 0;
  document.getElementById("global-done").textContent = done;
  document.getElementById("global-total").textContent = total;
  document.getElementById("global-fill").style.width = pct.toFixed(1) + "%";
  document.getElementById("global-pct-text").textContent = pct.toFixed(1) + "% complete";
  const unitLabel = getCreditUnitLabel();
  const activeTerm = getActiveTermFilter();
  const creditTarget = activeTerm === "all"
    ? TOTAL_CREDITS
    : MODULES.reduce((sum, mod, mi) => isModuleVisibleInActiveTerm(mi) ? sum + (Number(mod.credits) || 0) : sum, 0);
  document.getElementById("credits-text").textContent = weightedCredits.toFixed(1) + " / " + creditTarget + " " + unitLabel;
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
  const grade = formatSelectedGrade(avg);
  heroPredictor.textContent = grade.main;
  heroClass.textContent = grade.label || cls.badge;
  badgeHost.innerHTML = `<span class="classification-badge ${cls.heroCls}">${escapeHtml(grade.label || cls.badge)}</span>`;
}

function updateDashboard() {
  const avg = getWeightedAvg();
  const aggregate = getGradeAggregate();
  let total = 0;
  let done = 0;
  let weightedCredits = 0;
  MODULES.forEach((mod, mi) => {
    if (!isModuleVisibleInActiveTerm(mi)) return;
    total += getModuleTotal(mi);
    done += getModuleDone(mi);
    weightedCredits += mod.credits * (getModulePct(mi) / 100);
  });
  document.getElementById("dash-completion").textContent = (total ? (done / total) * 100 : 0).toFixed(0) + "%";
  const unitLabel = getCreditUnitLabel();
  const activeTerm = getActiveTermFilter();
  const termCreditTarget = activeTerm === "all"
    ? TOTAL_CREDITS
    : MODULES.reduce((sum, mod, mi) => isModuleVisibleInActiveTerm(mi) ? sum + (Number(mod.credits) || 0) : sum, 0);
  document.getElementById("dash-credits").textContent = weightedCredits.toFixed(1) + " / " + termCreditTarget + " " + unitLabel;

  const predictor = document.getElementById("dash-predictor");
  const status = document.getElementById("dash-status");
  const badge = document.getElementById("dash-badge");
  if (avg === null) {
    predictor.textContent = "-";
    status.textContent = "Enter module marks below";
    badge.innerHTML = "";
  } else {
    const cls = classify(avg);
    const grade = formatSelectedGrade(avg);
    predictor.textContent = grade.main;
    const major = getMajorGpa();
    const majorText = major ? ` · Major GPA ${major.value.toFixed(2)} (${major.credits} ${unitLabel})` : "";
    const scopeText = activeTerm === "all" ? "" : `${getTermLabel(activeTerm)} · `;
    status.textContent = `${scopeText}${formatGradeAggregateStatus(aggregate)}${majorText}`;
    badge.innerHTML = `<span class="classification-badge ${cls.heroCls}">${escapeHtml(grade.label || cls.badge)}</span>`;
  }
  renderDashboardTermSummary();
  if (!document.getElementById("dashboard-modal").classList.contains("hidden")) renderDashboardChart();
}

function renderDashboardTermSummary() {
  const host = document.getElementById("dash-term-summary");
  if (!host) return;
  const terms = getTermBreakdown();
  if (!terms.length) {
    host.innerHTML = `<div class="term-summary-empty">Add modules to see semester totals.</div>`;
    return;
  }
  const system = getGradingSystem();
  const metric = getAggregateMetricLabel();
  const activeTerm = getActiveTermFilter();
  host.innerHTML = terms.map((term) => {
    const unitLabel = getCreditUnitLabel({ plural: term.attemptedCredits !== 1 });
    const hasGrade = term.value !== null && term.value !== undefined;
    const grade = hasGrade ? formatSelectedGrade(term.value) : { main: "-", label: "No grades yet", secondary: "" };
    const gradePoints = system !== "uk" && system !== "de5" && hasGrade
      ? `<span>${term.gradePoints.toFixed(2)} grade points</span>`
      : "";
    return `
      <button class="term-summary-card ${activeTerm === term.term ? "active" : ""}" type="button" onclick="setActiveTermFilter('${escapeHtml(term.term)}')">
        <div class="term-summary-label">${escapeHtml(term.label)}</div>
        <div class="term-summary-value">${escapeHtml(grade.main)}</div>
        <div class="term-summary-meta">
          <span>${escapeHtml(metric)}</span>
          <span>${term.credits} / ${term.attemptedCredits} ${escapeHtml(unitLabel)}</span>
          ${gradePoints}
          <span>${escapeHtml(grade.label || "")}</span>
        </div>
      </button>
    `;
  }).join("");
}

function openDashboard() {
  document.getElementById("dashboard-modal").classList.remove("hidden");
  syncModalScrollLock();
  updateDashboard();
  renderDashboardChart();
}

function closeDashboard() {
  document.getElementById("dashboard-modal").classList.add("hidden");
  syncModalScrollLock();
}

document.getElementById("dashboard-modal").addEventListener("click", (event) => {
  if (event.target.id === "dashboard-modal") closeDashboard();
});

document.getElementById("timeline-modal").addEventListener("click", (event) => {
  if (event.target.id === "timeline-modal") closeDeadlineTimeline();
});

document.getElementById("todo-modal").addEventListener("click", (event) => {
  if (event.target.id === "todo-modal") event.stopPropagation();
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
document.getElementById("module-library-modal").addEventListener("keydown", handleModuleLibraryKeydown);

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
  const visibleModules = MODULES
    .map((mod, mi) => ({ mod, mi }))
    .filter((item) => isModuleVisibleInActiveTerm(item.mi));
  const step = chartWidth / Math.max(visibleModules.length, 1);
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

  const colors = visibleModules.map(({ mi }) => {
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

  visibleModules.forEach(({ mod, mi }, index) => {
    const pct = getModulePct(mi);
    const x = Math.round(padLeft + (step * index) + (step - barWidth) / 2);
    const barHeight = Math.round((chartHeight * pct) / 100);
    const y = Math.round(padTop + chartHeight - barHeight);
    ctx.fillStyle = colors[index];
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
