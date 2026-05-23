(function () {
  const root = document.documentElement;
  let timer = 0;
  let baseHeight = Math.max(window.innerHeight, window.visualViewport?.height || 0);
  let lastStableScrollY = window.scrollY || 0;

  function activeEditable() {
    const el = document.activeElement;
    if (!el) return null;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return el;
    return null;
  }

  function cleanupKeyboardState() {
    clearTimeout(timer);
    root.classList.remove("apk-keyboard-open");
    root.style.removeProperty("--apk-visible-height");
    root.style.removeProperty("--apk-keyboard-gap");
    document.body.style.removeProperty("transform");
    document.body.style.removeProperty("top");
    document.body.style.removeProperty("bottom");
    if (Math.abs((window.scrollY || 0) - lastStableScrollY) > 4) {
      window.scrollTo(0, lastStableScrollY);
    }
  }

  function rememberStableViewport() {
    if (!activeEditable()) {
      baseHeight = Math.max(baseHeight, window.innerHeight, window.visualViewport?.height || 0);
      lastStableScrollY = window.scrollY || 0;
      cleanupKeyboardState();
    }
  }

  window.addEventListener("resize", rememberStableViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", rememberStableViewport, { passive: true });
  window.visualViewport?.addEventListener("scroll", rememberStableViewport, { passive: true });
  window.addEventListener("pageshow", cleanupKeyboardState, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) window.setTimeout(cleanupKeyboardState, 80);
  });
  document.addEventListener("focusin", () => {
    baseHeight = Math.max(baseHeight, window.innerHeight, window.visualViewport?.height || 0);
    lastStableScrollY = window.scrollY || 0;
    cleanupKeyboardState();
  });
  document.addEventListener("focusout", () => {
    window.setTimeout(() => {
      cleanupKeyboardState();
      baseHeight = Math.max(window.innerHeight, window.visualViewport?.height || 0);
    }, 180);
    window.setTimeout(cleanupKeyboardState, 480);
    window.setTimeout(cleanupKeyboardState, 900);
  });
})();
