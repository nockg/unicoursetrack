window.unitrackBootComplete = false;

function applyReducedMotionPreference() {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  document.documentElement.classList.toggle("reduce-motion", !!reduceMotion);
}

// Wait for Supabase to check/restore the session before showing login or the dashboard.
(async function bootApp() {
  applyReducedMotionPreference();

  setAuthLoading(true, "Restoring your session...", "Checking whether you are already signed in before showing anything.");
  await waitForInitialAuth();

  if (!supabaseClient) {
    window.unitrackBootComplete = true;
    setAuthLoading(false);
    updateAuthLock();
    renderCloudUnavailableGate();
    setInterval(renderStickyExams, 1000);
    return;
  }

  if (!currentUser) {
    window.unitrackBootComplete = true;
    setAuthLoading(false);
    updateAuthLock();
    renderAuthGate("login");
    setInterval(renderStickyExams, 1000);
    return;
  }

  clearLogoutFlagForSignedInUser();

  setAuthLoading(true, "Loading your tracker...", isPendingNewAccount(currentUser?.email)
    ? "Preparing your setup so the first screen feels like yours."
    : "Pulling your saved modules, marks, deadlines, and preferences.");

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

