(function () {
  const STORAGE_KEY = "gpt-image-canvas:apk:confirm-clear-canvas-on-exit";
  const PROJECT_KEY = "gpt-image-canvas.native.project";
  const DB_NAME = "gpt-image-canvas-native-assets";
  const METADATA_STORE = "assetMetadata";
  const ROW_ATTR = "data-apk-exit-clear-setting";
  const DIALOG_ATTR = "data-apk-exit-clear-dialog";
  let injectTimer = 0;
  let injecting = false;
  let previousBackHandler = null;
  let installedHandler = null;
  let exiting = false;

  function readEnabled() {
    return localStorage.getItem(STORAGE_KEY) === "1";
  }

  function writeEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    document.querySelectorAll("[data-apk-exit-clear-status]").forEach((node) => {
      node.textContent = enabled ? "退出应用时会自动重置当前画布。" : "关闭后退出应用时保留当前画布。";
    });
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
    candidates.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
    return candidates[0];
  }

  function paintSwitch(label, knob, checked) {
    label.style.background = checked ? "#1f7a4d" : "#c9ced6";
    knob.style.transform = checked ? "translateX(20px)" : "translateX(0)";
  }

  function createSettingRow() {
    const row = document.createElement("div");
    row.setAttribute(ROW_ATTR, "true");
    row.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0 12px;padding:10px 12px;border:1px solid rgba(20,20,20,.12);border-radius:8px;background:rgba(255,255,255,.72);box-sizing:border-box;";

    const copy = document.createElement("div");
    copy.style.cssText = "min-width:0;display:flex;flex-direction:column;gap:3px;";

    const title = document.createElement("div");
    title.textContent = "退出时自动清空画布";
    title.style.cssText = "font-size:14px;font-weight:600;line-height:1.35;color:inherit;";

    const desc = document.createElement("div");
    desc.setAttribute("data-apk-exit-clear-status", "true");
    desc.textContent = readEnabled() ? "退出应用时会自动重置当前画布。" : "关闭后退出应用时保留当前画布。";
    desc.style.cssText = "font-size:12px;line-height:1.35;color:rgba(80,80,80,.86);";

    const label = document.createElement("label");
    label.style.cssText =
      "position:relative;flex:0 0 auto;width:46px;height:26px;border-radius:999px;background:#c9ced6;transition:background .18s ease;";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = readEnabled();
    input.setAttribute("aria-label", "退出时自动清空画布");
    input.style.cssText = "position:absolute;inset:0;opacity:0;margin:0;";

    const knob = document.createElement("span");
    knob.style.cssText =
      "position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.24);transition:transform .18s ease;";

    input.addEventListener("change", () => {
      writeEnabled(input.checked);
      paintSwitch(label, knob, input.checked);
    });

    copy.append(title, desc);
    label.append(input, knob);
    row.append(copy, label);
    paintSwitch(label, knob, input.checked);
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

  function findClosableOverlay() {
    const selector = [
      ".provider-config-dialog",
      ".gallery-modal",
      ".history-detail-dialog",
      '[role="dialog"]',
      "dialog",
    ].join(",");
    return Array.from(document.querySelectorAll(selector))
      .filter((node) => isVisible(node) && !node.closest("[" + DIALOG_ATTR + "]"))
      .sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0))[0];
  }

  function closeOverlay(panel) {
    const buttons = Array.from(panel.querySelectorAll("button,[role='button']"));
    const closeButton = buttons.find((button) => {
      const text = (button.textContent || "").trim();
      const label = String(button.getAttribute("aria-label") || button.getAttribute("title") || "");
      const cls = String(button.className || "");
      return (
        label.includes("关闭") ||
        label.toLowerCase().includes("close") ||
        text === "取消" ||
        text === "关闭" ||
        /close|dismiss/i.test(cls)
      );
    });
    if (closeButton) {
      closeButton.click();
      return true;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error("Unable to open IndexedDB."));
    });
  }

  async function updateIndexedProjectSnapshot(snapshot) {
    const db = await openDb().catch(() => null);
    if (!db || !db.objectStoreNames.contains(METADATA_STORE)) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(METADATA_STORE, "readwrite");
      const store = tx.objectStore(METADATA_STORE);
      const get = store.get(PROJECT_KEY);
      get.onsuccess = () => {
        const value = get.result;
        if (value && typeof value === "object") {
          store.put({ ...value, snapshot, updatedAt: new Date().toISOString() }, PROJECT_KEY);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || Error("Unable to update canvas snapshot."));
      tx.onabort = () => reject(tx.error || Error("Unable to update canvas snapshot."));
    });
    db.close();
  }

  function updateLocalProjectSnapshot(snapshot) {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (!raw) return;
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object") {
        localStorage.setItem(PROJECT_KEY, JSON.stringify({ ...value, snapshot, updatedAt: new Date().toISOString() }));
      }
    } catch {
      localStorage.removeItem(PROJECT_KEY);
    }
  }

  async function clearCanvasSnapshot() {
    try {
      const response = await fetch("/api/project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: null }),
      });
      if (response.ok) return;
    } catch {}
    await updateIndexedProjectSnapshot(null).catch(() => {});
    updateLocalProjectSnapshot(null);
  }

  function exitApp() {
    const appPlugin = window.Capacitor?.Plugins?.App || window.Capacitor?.App;
    if (appPlugin && typeof appPlugin.exitApp === "function") {
      appPlugin.exitApp();
      return;
    }
    if (window.navigator?.app && typeof window.navigator.app.exitApp === "function") {
      window.navigator.app.exitApp();
      return;
    }
    window.close();
    window.setTimeout(() => history.go(-2), 80);
  }

  async function clearAndExit() {
    if (exiting) return;
    exiting = true;
    await clearCanvasSnapshot();
    exitApp();
  }

  function handleNativeBack() {
    if (previousBackHandler) {
      try {
        if (previousBackHandler() === true) return true;
      } catch (error) {
        console.error("Previous native back handler failed", error);
      }
    }
    const exitDialog = document.querySelector("[" + DIALOG_ATTR + "]");
    if (exitDialog) {
      exitDialog.remove();
      return true;
    }
    const overlay = findClosableOverlay();
    if (overlay) return closeOverlay(overlay);
    if (!readEnabled()) return false;
    clearAndExit();
    return true;
  }

  function installBackHandler() {
    const current = window.__gptImageCanvasHandleNativeBack;
    if (current && current !== installedHandler && current !== previousBackHandler) {
      previousBackHandler = current;
    }
    installedHandler = handleNativeBack;
    window.__gptImageCanvasHandleNativeBack = installedHandler;
  }

  window.addEventListener("pointerdown", scheduleInjectSetting, { passive: true });
  window.addEventListener("focus", scheduleInjectSetting);
  document.addEventListener("visibilitychange", scheduleInjectSetting);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scheduleInjectSetting();
      installBackHandler();
      window.setInterval(scheduleInjectSetting, 1200);
      window.setInterval(installBackHandler, 1200);
    });
  } else {
    scheduleInjectSetting();
    installBackHandler();
    window.setInterval(scheduleInjectSetting, 1200);
    window.setInterval(installBackHandler, 1200);
  }
})();
