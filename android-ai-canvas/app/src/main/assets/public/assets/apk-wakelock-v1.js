(function () {
  const STORAGE_KEY = "gpt-image-canvas:apk:keep-screen-awake";
  const ROW_ATTR = "data-apk-wakelock-setting";
  let lock = null;
  let retryTimer = 0;
  let injectTimer = 0;
  let injecting = false;
  let injectInterval = 0;

  function readEnabled() {
    return localStorage.getItem(STORAGE_KEY) === "1";
  }

  function writeEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    window.dispatchEvent(new CustomEvent("apk-keep-screen-awake-change", { detail: { enabled } }));
  }

  function setStatus(text) {
    document.querySelectorAll("[data-apk-wakelock-status]").forEach((node) => {
      node.textContent = text;
    });
  }

  function scheduleAcquire(delay) {
    clearTimeout(retryTimer);
    retryTimer = window.setTimeout(acquireWakeLock, delay);
  }

  async function acquireWakeLock() {
    if (!readEnabled() || document.visibilityState !== "visible") return;
    if (lock) {
      setStatus("已开启，应用在前台时会保持亮屏。");
      return;
    }
    if (!navigator.wakeLock || typeof navigator.wakeLock.request !== "function") {
      setStatus("当前 WebView 不支持系统亮屏锁。");
      return;
    }
    try {
      lock = await navigator.wakeLock.request("screen");
      setStatus("已开启，应用在前台时会保持亮屏。");
      lock.addEventListener("release", () => {
        lock = null;
        if (readEnabled() && document.visibilityState === "visible") scheduleAcquire(600);
      });
    } catch (error) {
      lock = null;
      setStatus("亮屏锁申请失败，点按页面后会自动重试。");
      scheduleAcquire(1500);
    }
  }

  async function releaseWakeLock() {
    clearTimeout(retryTimer);
    if (!lock) {
      setStatus(readEnabled() ? "等待应用回到前台后开启。" : "关闭后按系统息屏时间处理。");
      return;
    }
    const current = lock;
    lock = null;
    try {
      await current.release();
    } catch {}
    setStatus(readEnabled() ? "等待应用回到前台后开启。" : "关闭后按系统息屏时间处理。");
  }

  function syncWakeLock() {
    if (readEnabled() && document.visibilityState === "visible") {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }
  }

  function isVisible(node) {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findSettingsPanel() {
    const selector = [
      ".provider-config-dialog",
      ".api-setup-dialog",
      '[role="dialog"]',
      "dialog",
    ].join(",");
    const candidates = Array.from(document.querySelectorAll(selector)).filter((node) => {
      if (!isVisible(node)) return false;
      const text = node.textContent || "";
      return (
        text.includes("生成服务配置") ||
        (text.includes("网络 API 来源") && text.includes("添加来源") && text.includes("保存"))
      );
    });
    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const score = (node, rect) => {
        const text = node.textContent || "";
        return rect.width * rect.height + (text.includes("生成服务配置") ? 1000000 : 0);
      };
      return score(b, br) - score(a, ar);
    });
    return candidates[0];
  }

  function createSettingRow() {
    const row = document.createElement("div");
    row.setAttribute(ROW_ATTR, "true");
    row.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0 12px;padding:10px 12px;border:1px solid rgba(20,20,20,.12);border-radius:8px;background:rgba(255,255,255,.72);box-sizing:border-box;";

    const copy = document.createElement("div");
    copy.style.cssText = "min-width:0;display:flex;flex-direction:column;gap:3px;";

    const title = document.createElement("div");
    title.textContent = "前台运行时保持亮屏";
    title.style.cssText = "font-size:14px;font-weight:600;line-height:1.35;color:inherit;";

    const desc = document.createElement("div");
    desc.setAttribute("data-apk-wakelock-status", "true");
    desc.textContent = readEnabled() ? "已开启，应用在前台时会保持亮屏。" : "关闭后按系统息屏时间处理。";
    desc.style.cssText = "font-size:12px;line-height:1.35;color:rgba(80,80,80,.86);";

    const label = document.createElement("label");
    label.style.cssText =
      "position:relative;flex:0 0 auto;width:46px;height:26px;border-radius:999px;background:#c9ced6;transition:background .18s ease;";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = readEnabled();
    input.setAttribute("aria-label", "前台运行时保持亮屏");
    input.style.cssText = "position:absolute;inset:0;opacity:0;margin:0;";

    const knob = document.createElement("span");
    knob.style.cssText =
      "position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.24);transition:transform .18s ease;";

    function paint() {
      label.style.background = input.checked ? "#1f7a4d" : "#c9ced6";
      knob.style.transform = input.checked ? "translateX(20px)" : "translateX(0)";
    }

    input.addEventListener("change", () => {
      writeEnabled(input.checked);
      paint();
      syncWakeLock();
    });

    copy.append(title, desc);
    label.append(input, knob);
    row.append(copy, label);
    paint();
    return row;
  }

  function injectSetting() {
    if (injecting) return;
    const panel = findSettingsPanel();
    if (!panel) return;
    injecting = true;
    try {
      const allRows = Array.from(document.querySelectorAll("[" + ROW_ATTR + "]"));
      allRows.filter((row) => !panel.contains(row)).forEach((row) => row.remove());
      const existingRows = allRows.filter((row) => panel.contains(row));
      if (existingRows.length > 0) {
        existingRows.slice(1).forEach((row) => row.remove());
        const input = existingRows[0].querySelector("input");
        if (input) input.checked = readEnabled();
        return;
      }
      const row = createSettingRow();
      const anchor =
        panel.querySelector('[class*="content" i]') ||
        panel.querySelector('[class*="body" i]') ||
        panel;
      const firstField = Array.from(anchor.children).find((node) => {
        const text = node.textContent || "";
        return text.includes("网络 API 来源") || text.includes("API Key") || text.includes("Base URL");
      });
      anchor.insertBefore(row, firstField || anchor.firstChild);
    } finally {
      injecting = false;
    }
  }

  function scheduleInjectSetting() {
    if (injecting) return;
    clearTimeout(injectTimer);
    injectTimer = window.setTimeout(injectSetting, 180);
  }

  document.addEventListener("visibilitychange", syncWakeLock);
  window.addEventListener("focus", syncWakeLock);
  window.addEventListener("pageshow", syncWakeLock);
  window.addEventListener("pointerdown", () => {
    if (readEnabled()) scheduleAcquire(0);
    scheduleInjectSetting();
  }, { passive: true });
  window.addEventListener("keydown", () => readEnabled() && scheduleAcquire(0), { passive: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scheduleInjectSetting();
      syncWakeLock();
      injectInterval = window.setInterval(scheduleInjectSetting, 1200);
    });
  } else {
    scheduleInjectSetting();
    syncWakeLock();
    injectInterval = window.setInterval(scheduleInjectSetting, 1200);
  }
})();
