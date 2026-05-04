import { store } from './store.js';

store.bootComplete = false;

function applyReducedMotionPreference() {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  document.documentElement.classList.toggle('reduce-motion', !!reduceMotion);
}

export async function bootApp() {
  applyReducedMotionPreference();

  store.authScreenLoading = false;
  store.authViewMode = 'login';
  window.updateAuthLock?.();

  await window.waitForInitialAuth?.();

  if (!store.supabaseClient) {
    store.bootComplete = true;
    store.authScreenLoading = false;
    window.updateAuthLock?.();
    window.renderCloudUnavailableGate?.();
    setInterval(() => window.renderStickyExams?.(), 1000);
    return;
  }

  if (!store.currentUser) {
    store.bootComplete = true;
    store.authScreenLoading = false;
    store.authViewMode = 'login';
    window.updateAuthLock?.();
    window.renderAuthGate?.('login');
    setInterval(() => window.renderStickyExams?.(), 1000);
    return;
  }

  window.clearLogoutFlagForSignedInUser?.();

  store.authLoadingMessage = window.isPendingNewAccount?.(store.currentUser?.email)
    ? 'Preparing your setup so the first screen feels like yours.'
    : 'Pulling your saved modules, marks, deadlines, and preferences.';

  window.renderAuthGate?.();

  store.cloudReady = false;
  store.pendingFirstRunSetup = false;

  await window.loadCloudSave?.();

  store.pendingFirstRunSetup = store.cloudLoadSucceeded && !store.cloudHadSave;

  if (store.pendingFirstRunSetup) {
    window.resetLocalAppState?.();
    store.cloudReady = true;
  }

  window.refreshAppAfterAuth?.();

  store.bootComplete = true;
  window.setAuthLoading?.(false);
  window.updateAuthLock?.();

  setTimeout(() => {
    if (store.currentUser && document.getElementById('template-splash')?.classList.contains('hidden')) {
      window.showDeadlineSplash?.();
    }
  }, 500);

  setInterval(() => window.renderStickyExams?.(), 1000);
}

try {
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener('change', applyReducedMotionPreference);
} catch {}

// ── Mobile UX shell ────────────────────────────────────────────────────────

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
  const sheet = document.querySelector('.mobile-more-sheet');
  if (!sheet) return;
  const needsRender =
    !sheet.dataset.finalMobileMore ||
    sheet.textContent.includes('Dashboard') ||
    sheet.textContent.includes('Library') ||
    sheet.textContent.includes('YouTube') ||
    sheet.textContent.includes('Calendar') ||
    !sheet.textContent.includes('Privacy Notice');
  if (!needsRender) return;
  sheet.dataset.finalMobileMore = 'true';
  sheet.innerHTML = getMobileMoreSheetHtml();
}

export function syncMobileUxShell() {
  const mobileYear = document.getElementById('mobile-year-select');
  const desktopYear = document.getElementById('year-select');
  if (mobileYear && desktopYear) {
    const previous = mobileYear.value;
    mobileYear.innerHTML = desktopYear.innerHTML;
    mobileYear.value = desktopYear.value || previous;
  }
  const courseLabel = document.getElementById('mobile-course-label');
  if (courseLabel) {
    const course = store.state?.profile?.course || 'Course tracker';
    const year = window.getCurrentYear?.()?.label || '';
    courseLabel.textContent = year ? `${course} · ${year}` : course;
  }
  renderMobileMoreSheet();
}

export function ensureMobileUxShell() {
  if (document.querySelector('.mobile-topbar')) {
    syncMobileUxShell();
    return;
  }

  const topbar = document.createElement('div');
  topbar.className = 'mobile-topbar';
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

  const tabbar = document.createElement('div');
  tabbar.className = 'mobile-tabbar';
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

  const more = document.createElement('div');
  more.className = 'mobile-more-sheet';
  more.innerHTML = getMobileMoreSheetHtml();

  document.body.append(topbar, tabbar, more);

  let mobileLastPrimaryTab = 'home';

  function setActiveTab(tab) {
    if (tab && tab !== 'more') mobileLastPrimaryTab = tab;
    document.querySelectorAll('.mobile-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mobileTab === tab);
    });
  }

  function closeMore() {
    document.body.classList.remove('mobile-more-open');
    setActiveTab(mobileLastPrimaryTab || 'home');
  }

  function scrollToModules() {
    const modules = document.getElementById('modules');
    if (modules) modules.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function isMobileSurfaceOpen(id) {
    const el = document.getElementById(id);
    return !!el && !el.classList.contains('hidden');
  }

  function closeMobileSurfaces(except = '') {
    if (except !== 'more') document.body.classList.remove('mobile-more-open');
    if (except !== 'deadlines' && isMobileSurfaceOpen('timeline-modal')) window.closeDeadlineTimeline?.();
    if (except !== 'planner' && isMobileSurfaceOpen('todo-modal')) window.closeTodoPlanner?.();
    if (except !== 'preferences') {
      if (typeof window.closePreferences === 'function') window.closePreferences();
      else {
        const prefsPanel = document.getElementById('prefs-panel');
        if (prefsPanel && !prefsPanel.classList.contains('hidden')) window.togglePreferences?.();
      }
    }
    if (except !== 'account' && isMobileSurfaceOpen('auth-modal')) window.closeAuthModal?.();
  }

  tabbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mobile-tab]');
    if (!button) return;
    event.preventDefault();
    const tab = button.dataset.mobileTab;

    if (tab === 'home') {
      closeMobileSurfaces(); setActiveTab('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    }
    if (tab === 'modules') {
      closeMobileSurfaces(); setActiveTab('modules'); scrollToModules(); return;
    }
    if (tab === 'deadlines') {
      const wasOpen = isMobileSurfaceOpen('timeline-modal');
      closeMobileSurfaces(wasOpen ? '' : 'deadlines');
      if (wasOpen) { setActiveTab(mobileLastPrimaryTab || 'home'); return; }
      setActiveTab('deadlines'); window.openDeadlineTimeline?.(); return;
    }
    if (tab === 'planner') {
      const wasOpen = isMobileSurfaceOpen('todo-modal');
      closeMobileSurfaces(wasOpen ? '' : 'planner');
      if (wasOpen) { setActiveTab(mobileLastPrimaryTab || 'home'); return; }
      setActiveTab('planner'); window.openTodoPlanner?.(); return;
    }
    if (tab === 'more') {
      const wasOpen = document.body.classList.contains('mobile-more-open');
      closeMobileSurfaces('more');
      if (wasOpen) { document.body.classList.remove('mobile-more-open'); setActiveTab(mobileLastPrimaryTab || 'home'); return; }
      setActiveTab('more'); document.body.classList.add('mobile-more-open'); renderMobileMoreSheet(); return;
    }
  });

  more.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mobile-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.mobileAction;

    if (action === 'close-more') { closeMore(); return; }
    document.body.classList.remove('mobile-more-open');
    setActiveTab('more');

    if (action === 'add-module') { closeMobileSurfaces(); window.addModuleToCurrentYear?.(); return; }
    if (action === 'preferences') {
      closeMobileSurfaces('preferences');
      if (typeof window.openPreferences === 'function') window.openPreferences();
      else window.togglePreferences?.();
      return;
    }
    if (action === 'account') { closeMobileSurfaces('account'); window.openAuthModal?.(); return; }
    if (action === 'privacy') { window.open('/privacy.html', '_blank', 'noopener,noreferrer'); return; }
  });

  document.addEventListener('click', (event) => {
    if (!document.body.classList.contains('mobile-more-open')) return;
    if (event.target.closest('.mobile-more-sheet')) return;
    if (event.target.closest("[data-mobile-tab='more']")) return;
    closeMore();
  }, true);

  const mobileYearSel = document.getElementById('mobile-year-select');
  mobileYearSel?.addEventListener('change', () => {
    window.handleYearDropdown?.(mobileYearSel.value);
    setTimeout(syncMobileUxShell, 0);
  });

  syncMobileUxShell();
}

let footerLogoTagged = false;

function tagMobileFooterLogo() {
  if (footerLogoTagged) return;
  if (!window.matchMedia?.('(max-width: 860px)')?.matches) return;
  const candidates = [...document.body.querySelectorAll('main *')]
    .filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.closest('.mobile-tabbar, .mobile-topbar, .mobile-more-sheet')) return false;
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      return text.includes('UniTrack') && text.includes('v1.0.0');
    })
    .sort((a, b) => a.textContent.length - b.textContent.length);
  const footer = candidates[0];
  if (footer) {
    footer.classList.add('mobile-unitrack-footer');
    footerLogoTagged = true;
  }
}

// Boot mobile shell as soon as DOM is ready (handles both early and late script execution)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureMobileUxShell);
} else {
  ensureMobileUxShell();
}

// Single retry after app renders the footer, then stops (footerLogoTagged flag prevents re-runs)
setTimeout(tagMobileFooterLogo, 1000);

// Keep mobile year dropdown in sync with desktop until year changes are event-driven
setInterval(syncMobileUxShell, 1500);

