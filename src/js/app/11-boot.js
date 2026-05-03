window.unitrackBootComplete = false;

function applyReducedMotionPreference() {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  document.documentElement.classList.toggle("reduce-motion", !!reduceMotion);
}

// Wait for Supabase to check/restore the session before showing login or the dashboard.
(async function bootApp() {
  applyReducedMotionPreference();

  authScreenLoading = false;
  authViewMode = "login";
  updateAuthLock();

  await waitForInitialAuth();

  if (!supabaseClient) {
    window.unitrackBootComplete = true;
    authScreenLoading = false;
    updateAuthLock();
    renderCloudUnavailableGate();
    setInterval(renderStickyExams, 1000);
    return;
  }

  if (!currentUser) {
    window.unitrackBootComplete = true;
    authScreenLoading = false;
    authViewMode = "login";
    updateAuthLock();
    renderAuthGate("login");
    setInterval(renderStickyExams, 1000);
    return;
  }

  clearLogoutFlagForSignedInUser();

  authLoadingMessage = isPendingNewAccount(currentUser?.email)
    ? "Preparing your setup so the first screen feels like yours."
    : "Pulling your saved modules, marks, deadlines, and preferences.";

  renderAuthGate();

  cloudReady = false;
  pendingFirstRunSetup = false;

  await loadCloudSave();

  pendingFirstRunSetup = cloudLoadSucceeded && !cloudHadSave;

  if (pendingFirstRunSetup) {
    resetLocalAppState();
    cloudReady = true;
  }

  // Prepare/render the app first while the loading gate is still covering it.
  refreshAppAfterAuth();

  window.unitrackBootComplete = true;
  setAuthLoading(false);
  updateAuthLock();

  setTimeout(() => {
    if (currentUser && document.getElementById("template-splash")?.classList.contains("hidden")) {
      showDeadlineSplash();
    }
  }, 500);

  setInterval(renderStickyExams, 1000);
})();

try {
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.addEventListener("change", applyReducedMotionPreference);
} catch { }

/* mobile-ux-shell */
function ensureMobileUxShell() {
  if (document.querySelector(".mobile-topbar")) {
    syncMobileUxShell();
    return;
  }

  const topbar = document.createElement("div");
  topbar.className = "mobile-topbar";
  topbar.innerHTML = `
    <div class="mobile-brand-lockup">
      <div class="mobile-brand-mark">
        <img src="/sntutors-logo.png" alt="" onerror="this.style.display='none'">
      </div>
      <div class="mobile-brand-text">
        <div class="mobile-brand-title">UniTrack</div>
        <div class="mobile-brand-subtitle" id="mobile-course-label">Course tracker</div>
      </div>
    </div>
    <select class="mobile-year-select" id="mobile-year-select" aria-label="Select year"></select>
  `;

  const tabbar = document.createElement("div");
  tabbar.className = "mobile-tabbar";
  tabbar.innerHTML = `
    <button class="mobile-tab-btn active" type="button" data-mobile-tab="home" aria-label="Home">
      <span>⌂</span><span>Home</span>
    </button>
    <button class="mobile-tab-btn" type="button" data-mobile-tab="modules" aria-label="Modules">
      <span>▦</span><span>Modules</span>
    </button>
    <button class="mobile-tab-btn" type="button" data-mobile-tab="deadlines" aria-label="Deadlines">
      <span>◷</span><span>Dates</span>
    </button>
    <button class="mobile-tab-btn" type="button" data-mobile-tab="planner" aria-label="Planner">
      <span>✓</span><span>Plan</span>
    </button>
    <button class="mobile-tab-btn" type="button" data-mobile-tab="more" aria-label="More">
      <span>⋯</span><span>More</span>
    </button>
  `;

  const more = document.createElement("div");
  more.className = "mobile-more-sheet";
  more.innerHTML = getMobileMoreSheetHtml();

  document.body.append(topbar, tabbar, more);

  let mobileLastPrimaryTab = "home";

  function setActiveTab(tab) {
    if (tab && tab !== "more") mobileLastPrimaryTab = tab;

    document.querySelectorAll(".mobile-tab-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.mobileTab === tab);
    });
  }

  function closeMore() {
    document.body.classList.remove("mobile-more-open");
    setActiveTab(mobileLastPrimaryTab || "home");
  }

  function scrollToModules() {
    const modules = document.getElementById("modules");
    if (modules) modules.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  tabbar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mobile-tab]");
    if (!button) return;

    const tab = button.dataset.mobileTab;
    setActiveTab(tab);

    if (tab !== "more") document.body.classList.remove("mobile-more-open");

    if (tab === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (tab === "modules") {
      scrollToModules();
      return;
    }

    if (tab === "deadlines") {
      openDeadlineTimeline?.();
      return;
    }

    if (tab === "planner") {
      toggleTodoPlanner?.();
      return;
    }

    if (tab === "more") {
      document.body.classList.toggle("mobile-more-open");
      renderMobileMoreSheet();
      return;
    }
  });

  more.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mobile-action]");
    if (!button) return;

    event.preventDefault();

    const action = button.dataset.mobileAction;
    document.body.classList.remove("mobile-more-open");
    setActiveTab(mobileLastPrimaryTab || "home");

    if (action === "close-more") return;
    if (action === "add-module") addModuleToCurrentYear?.();
    if (action === "preferences") togglePreferences?.();
    if (action === "account") openAuthModal?.();
    if (action === "privacy") window.open("/privacy.html", "_blank", "noopener,noreferrer");
  });

  document.addEventListener("click", (event) => {
    if (!document.body.classList.contains("mobile-more-open")) return;
    if (event.target.closest(".mobile-more-sheet")) return;
    if (event.target.closest("[data-mobile-tab='more']")) return;
    closeMore();
  }, true);

  const mobileYear = document.getElementById("mobile-year-select");
  mobileYear?.addEventListener("change", () => {
    handleYearDropdown?.(mobileYear.value);
    setTimeout(syncMobileUxShell, 0);
  });

  syncMobileUxShell();
}

function getMobileMoreSheetHtml() {
  return `
    <div class="mobile-more-head">
      <div>
        <div class="mobile-more-title">More</div>
        <div class="mobile-more-kicker">Course controls and account</div>
      </div>
      <button class="mobile-more-close" type="button" data-mobile-action="close-more" aria-label="Close more menu">&times;</button>
    </div>
    <div class="mobile-more-grid">
      <button class="mobile-more-action" type="button" data-mobile-action="add-module">
        <span class="mobile-more-icon" aria-hidden="true">+</span>
        <span class="mobile-more-action-text">
          <span class="mobile-more-copy">Add Module</span>
          <span class="mobile-more-kicker">Create a new module card</span>
        </span>
      </button>
      <button class="mobile-more-action" type="button" data-mobile-action="preferences">
        <span class="mobile-more-icon" aria-hidden="true">◇</span>
        <span class="mobile-more-action-text">
          <span class="mobile-more-copy">Preferences</span>
          <span class="mobile-more-kicker">Theme, grading and display</span>
        </span>
      </button>
      <button class="mobile-more-action" type="button" data-mobile-action="account">
        <span class="mobile-more-icon" aria-hidden="true">◎</span>
        <span class="mobile-more-action-text">
          <span class="mobile-more-copy">Account</span>
          <span class="mobile-more-kicker">Cloud sync and privacy</span>
        </span>
      </button>
      <button class="mobile-more-action" type="button" data-mobile-action="privacy">
        <span class="mobile-more-icon" aria-hidden="true">§</span>
        <span class="mobile-more-action-text">
          <span class="mobile-more-copy">Privacy Notice</span>
          <span class="mobile-more-kicker">Legal and data use</span>
        </span>
      </button>
    </div>
  `;
}

function renderMobileMoreSheet() {
  const sheet = document.querySelector(".mobile-more-sheet");
  if (!sheet) return;

  const needsRender =
    !sheet.dataset.finalMobileMore ||
    sheet.textContent.includes("Dashboard") ||
    sheet.textContent.includes("Library") ||
    sheet.textContent.includes("YouTube") ||
    sheet.textContent.includes("Calendar") ||
    !sheet.textContent.includes("Privacy Notice");

  if (!needsRender) return;

  sheet.dataset.finalMobileMore = "true";
  sheet.innerHTML = getMobileMoreSheetHtml();
}

function syncMobileUxShell() {
  const mobileYear = document.getElementById("mobile-year-select");
  const desktopYear = document.getElementById("year-select");

  if (mobileYear && desktopYear) {
    const previous = mobileYear.value;
    mobileYear.innerHTML = desktopYear.innerHTML;
    mobileYear.value = desktopYear.value || previous;
  }

  const courseLabel = document.getElementById("mobile-course-label");
  if (courseLabel) {
    const course = state?.profile?.course || "Course tracker";
    const year = getCurrentYear?.()?.label || "";
    courseLabel.textContent = year ? `${course} · ${year}` : course;
  }

  renderMobileMoreSheet();
}

document.addEventListener("DOMContentLoaded", ensureMobileUxShell);
setTimeout(ensureMobileUxShell, 0);
setTimeout(syncMobileUxShell, 500);
setInterval(syncMobileUxShell, 1500);

/* mobile-footer-tagging-fix */
function tagMobileFooterLogo() {
  if (!window.matchMedia?.("(max-width: 860px)")?.matches) return;

  const candidates = [...document.body.querySelectorAll("main *")]
    .filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.closest(".mobile-tabbar, .mobile-topbar, .mobile-more-sheet")) return false;

      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      return text.includes("UniTrack") && text.includes("v1.0.0");
    })
    .sort((a, b) => a.textContent.length - b.textContent.length);

  const footer = candidates[0];
  if (footer) footer.classList.add("mobile-unitrack-footer");
}

document.addEventListener("DOMContentLoaded", tagMobileFooterLogo);
setTimeout(tagMobileFooterLogo, 250);
setTimeout(tagMobileFooterLogo, 1000);
setInterval(tagMobileFooterLogo, 2000);

