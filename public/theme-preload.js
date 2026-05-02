(function applyInitialThemeClass() {
  try {
    const raw = localStorage.getItem("course_progress_prefs_v1");
    const parsed = raw ? JSON.parse(raw) : {};
    const theme = parsed && typeof parsed.theme === "string" ? parsed.theme : "light";
    if (theme === "dark" || theme === "quiet" || theme === "charcoal") {
      document.body.classList.add(`theme-${theme}`);
    }
  } catch (error) {
    // Keep default light classing if preferences cannot be read.
  }
})();
