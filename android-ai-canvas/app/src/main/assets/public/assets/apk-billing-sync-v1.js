(function () {
  const CONFIG_KEY = "gpt-image-canvas:apk:billing-sync-config";
  const PROJECT_KEY = "gpt-image-canvas.native.project";
  const DB_NAME = "gpt-image-canvas-native-assets";
  const METADATA_STORE = "assetMetadata";
  const ROW_ATTR = "data-apk-billing-setting";
  const DIALOG_ATTR = "data-apk-billing-dialog";
  const LEGACY_DEFAULT_LOG_URL = "";
  const MATCH_WINDOW_MS = 10 * 60 * 1000;
  let injectTimer = 0;
  let injecting = false;
  let fetchInstallTimer = 0;
  let wrappedFetch = null;

  function defaultConfig() {
    return {
      enabled: false,
      logUrl: "",
      cookie: "",
      accessToken: "",
      userId: "",
      apiKey: "",
      currency: "USD",
      lookbackHours: 72,
      logLimit: 200,
      quotaPerCurrencyUnit: 500000,
      lastSyncedAt: "",
      lastMessage: ""
    };
  }

  function readConfig() {
    try {
      const config = { ...defaultConfig(), ...(JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}") || {}) };
      if (config.logUrl === LEGACY_DEFAULT_LOG_URL) {
        config.logUrl = "";
      }
      return config;
    } catch {
      return defaultConfig();
    }
  }

  function writeConfig(config) {
    const next = { ...defaultConfig(), ...config };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    refreshStatus();
    return next;
  }

  function isConfigured(config) {
    return Boolean(config.enabled && String(config.logUrl || "").trim() && (config.cookie || config.accessToken || config.apiKey));
  }

  function billingStatusText(config) {
    if (!config.enabled) return "未启用，作品不会自动写入费用。";
    if (!isConfigured(config)) return "已启用，请填写账单 URL 和 Cookie 或 Token。";
    if (config.lastMessage) return config.lastMessage;
    return "已配置，可手动同步最近生成记录。";
  }

  function refreshStatus() {
    const config = readConfig();
    document.querySelectorAll("[data-apk-billing-status]").forEach((node) => {
      node.textContent = billingStatusText(config);
    });
  }

  function isVisible(node) {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findSettingsPanel() {
    const candidates = Array.from(document.querySelectorAll(".provider-config-dialog,.api-setup-dialog,[role='dialog'],dialog")).filter((node) => {
      if (!isVisible(node)) return false;
      const text = node.textContent || "";
      return text.includes("生成服务配置") || (text.includes("网络 API 来源") && text.includes("添加来源") && text.includes("保存"));
    });
    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return br.width * br.height - ar.width * ar.height;
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
    title.textContent = "账单同步";
    title.style.cssText = "font-size:14px;font-weight:600;line-height:1.35;color:inherit;";

    const desc = document.createElement("div");
    desc.setAttribute("data-apk-billing-status", "true");
    desc.textContent = billingStatusText(readConfig());
    desc.style.cssText = "font-size:12px;line-height:1.35;color:rgba(80,80,80,.86);";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "配置";
    button.style.cssText =
      "flex:0 0 auto;min-height:34px;padding:0 14px;border:1px solid rgba(65,44,28,.22);border-radius:8px;background:#fff8ee;color:#3d2c20;font-size:13px;font-weight:650;";
    button.addEventListener("click", openBillingDialog);

    copy.append(title, desc);
    row.append(copy, button);
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
        refreshStatus();
        return;
      }
      const row = createSettingRow();
      const anchor = panel.querySelector('[class*="content" i]') || panel.querySelector('[class*="body" i]') || panel;
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

  function field(labelText, control) {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:650;color:#4a3b2e;";
    const span = document.createElement("span");
    span.textContent = labelText;
    control.style.cssText +=
      "width:100%;box-sizing:border-box;border:1px solid rgba(42,34,26,.18);border-radius:8px;background:#fffdf8;color:#211a16;padding:9px 10px;font-size:14px;line-height:1.35;outline:none;";
    label.append(span, control);
    return label;
  }

  function makeInput(value, options) {
    const input = document.createElement("input");
    input.type = options?.type || "text";
    input.value = value || "";
    input.autocomplete = "off";
    if (options?.placeholder) input.placeholder = options.placeholder;
    if (options?.inputMode) input.inputMode = options.inputMode;
    return input;
  }

  function makeTextarea(value) {
    const input = document.createElement("textarea");
    input.value = value || "";
    input.rows = 4;
    input.autocomplete = "off";
    input.placeholder = "Cookie 不会写入日志。";
    input.style.cssText = "resize:vertical;min-height:78px;";
    return input;
  }

  function openBillingDialog() {
    document.querySelectorAll("[" + DIALOG_ATTR + "]").forEach((node) => node.remove());
    const config = readConfig();
    const overlay = document.createElement("div");
    overlay.setAttribute(DIALOG_ATTR, "true");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:18px;background:rgba(28,22,18,.42);box-sizing:border-box;";

    const panel = document.createElement("section");
    panel.style.cssText =
      "width:min(560px,100%);max-height:min(720px,calc(100dvh - 36px));overflow:auto;border:1px solid rgba(42,34,26,.14);border-radius:14px;background:#fffaf2;box-shadow:0 24px 80px rgba(25,18,13,.28);padding:16px;box-sizing:border-box;color:#211a16;";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;";
    const heading = document.createElement("div");
    heading.textContent = "账单同步";
    heading.style.cssText = "font-size:17px;font-weight:760;line-height:1.3;";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "关闭");
    close.style.cssText = "width:36px;height:36px;border:0;border-radius:8px;background:rgba(52,42,34,.08);font-size:24px;line-height:1;color:#332820;";
    close.addEventListener("click", () => overlay.remove());
    header.append(heading, close);

    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = Boolean(config.enabled);
    const enabledRow = document.createElement("label");
    enabledRow.style.cssText =
      "display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 12px;border:1px solid rgba(42,34,26,.14);border-radius:10px;background:rgba(255,255,255,.62);font-size:14px;font-weight:650;";
    enabledRow.append(enabled, document.createTextNode("启用账单同步"));

    const logUrl = makeInput(config.logUrl || "", { placeholder: "请输入账单接口 URL" });
    const cookie = makeTextarea(config.cookie || "");
    const accessToken = makeInput(config.accessToken || "", { type: "password", placeholder: "可选，Bearer Token" });
    const userId = makeInput(config.userId || "", { placeholder: "可选，New-Api-User" });
    const apiKey = makeInput(config.apiKey || "", { type: "password", placeholder: "可选，没有 Token 时作为 Bearer 使用" });
    const currency = makeInput(config.currency || "USD", { placeholder: "USD" });
    const lookbackHours = makeInput(String(config.lookbackHours || 72), { inputMode: "numeric" });
    const logLimit = makeInput(String(config.logLimit || 200), { inputMode: "numeric" });
    const quotaRatio = makeInput(String(config.quotaPerCurrencyUnit || 500000), { inputMode: "numeric" });

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:1fr;gap:10px;";
    grid.append(
      field("账单 URL", logUrl),
      field("Cookie", cookie),
      field("Access Token", accessToken),
      field("User ID", userId),
      field("API Key", apiKey),
      field("币种", currency),
      field("回看小时数", lookbackHours),
      field("日志条数", logLimit),
      field("Quota 折算比例", quotaRatio)
    );

    const status = document.createElement("div");
    status.textContent = billingStatusText(config);
    status.style.cssText = "min-height:20px;margin-top:12px;font-size:12px;line-height:1.45;color:#5f4d3d;";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:14px;";
    const clearCookie = button("清除 Cookie", false);
    const save = button("保存", false);
    const sync = button("立即同步", true);
    clearCookie.addEventListener("click", () => {
      cookie.value = "";
      persist();
      status.textContent = "Cookie 已清除。";
    });
    save.addEventListener("click", () => {
      persist();
      status.textContent = "账单同步配置已保存。";
    });
    sync.addEventListener("click", async () => {
      persist();
      sync.disabled = true;
      status.textContent = "正在同步账单...";
      try {
        const result = await syncBilling();
        status.textContent = result.message || `同步完成：匹配 ${result.matched} 条，检查 ${result.checked} 条。`;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "账单同步失败。";
      } finally {
        sync.disabled = false;
      }
    });
    actions.append(clearCookie, save, sync);

    function persist() {
      const next = writeConfig({
        enabled: enabled.checked,
        logUrl: logUrl.value.trim(),
        cookie: cookie.value.trim(),
        accessToken: accessToken.value.trim(),
        userId: userId.value.trim(),
        apiKey: apiKey.value.trim(),
        currency: currency.value.trim() || "USD",
        lookbackHours: positiveInt(lookbackHours.value, 72, 1, 720),
        logLimit: positiveInt(logLimit.value, 200, 1, 1000),
        quotaPerCurrencyUnit: positiveNumber(quotaRatio.value, 500000)
      });
      return next;
    }

    panel.append(header, enabledRow, grid, status, actions);
    overlay.append(panel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.append(overlay);
  }

  function button(text, primary) {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = text;
    node.style.cssText = primary
      ? "min-height:38px;padding:0 14px;border:1px solid #7f4d22;border-radius:8px;background:#8a5527;color:#fffaf2;font-size:13px;font-weight:700;"
      : "min-height:38px;padding:0 14px;border:1px solid rgba(65,44,28,.22);border-radius:8px;background:#fffdf8;color:#3d2c20;font-size:13px;font-weight:650;";
    return node;
  }

  function positiveInt(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function positiveNumber(value, fallback) {
    const parsed = Number(String(value || "").trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function jsonResponse(value, init) {
    return new Response(JSON.stringify(value), {
      ...init,
      headers: { "Content-Type": "application/json; charset=utf-8", ...(init?.headers || {}) }
    });
  }

  function installFetchInterceptor() {
    const current = window.fetch;
    if (!current || current.__apkBillingSyncWrapped) return;
    const baseFetch = current.bind(window);
    wrappedFetch = async function (input, init) {
      const request = input instanceof Request ? input : new Request(input, init);
      let url;
      try {
        url = new URL(request.url, window.location.href);
      } catch {
        return baseFetch(input, init);
      }
      if (url.pathname === "/api/billing/sync" && request.method.toUpperCase() === "POST") {
        try {
          return jsonResponse(await syncBilling());
        } catch (error) {
          return jsonResponse({
            enabled: isConfigured(readConfig()),
            matched: 0,
            checked: 0,
            message: error instanceof Error ? error.message : "账单同步失败。"
          });
        }
      }
      return baseFetch(input, init);
    };
    wrappedFetch.__apkBillingSyncWrapped = true;
    wrappedFetch.__apkBillingSyncBase = current;
    window.fetch = wrappedFetch;
  }

  async function syncBilling() {
    const config = readConfig();
    if (!config.enabled) {
      return { enabled: false, matched: 0, checked: 0, message: "账单同步未启用。" };
    }
    if (!isConfigured(config)) {
      return { enabled: false, matched: 0, checked: 0, message: "请先填写账单 URL 和 Cookie 或 Token。" };
    }
    const project = await readProject();
    const since = new Date(Date.now() - positiveInt(config.lookbackHours, 72, 1, 720) * 60 * 60 * 1000);
    const records = (Array.isArray(project.history) ? project.history : [])
      .filter((record) => Date.parse(record.createdAt || "") >= since.getTime())
      .filter((record) => !record.billingDetails || !Number.isFinite(Number(record.billingDetails.totalCost)) || Number(record.billingDetails.totalCost) <= 0)
      .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
      .slice(0, 100);

    if (records.length === 0) {
      const message = "没有需要同步的本地生成记录。";
      writeConfig({ ...config, lastSyncedAt: new Date().toISOString(), lastMessage: message });
      return { enabled: true, matched: 0, checked: 0, message };
    }

    const logs = await fetchBillingLogs(config, since);
    const usedLogIds = new Set();
    let matched = 0;
    const nextHistory = project.history.map((record) => {
      if (!records.some((candidate) => candidate.id === record.id)) return record;
      const match = findBestLogMatch(record, logs, usedLogIds, config);
      if (!match) return record;
      const billing = billingDetailsFromLogs(match, record, config);
      if (!billing) return record;
      match.forEach((log) => {
        const id = logIdentity(log, config);
        if (id) usedLogIds.add(id);
      });
      matched += 1;
      return { ...record, billingDetails: billing };
    });

    if (matched > 0) {
      await writeProject({ ...project, history: nextHistory, updatedAt: new Date().toISOString() });
    }
    const message = `账单同步完成：匹配 ${matched} 条，检查 ${records.length} 条。`;
    writeConfig({ ...config, lastSyncedAt: new Date().toISOString(), lastMessage: message });
    return { enabled: true, matched, checked: records.length, message };
  }

  async function fetchBillingLogs(config, since) {
    const url = new URL(String(config.logUrl || "").trim());
    if (!url.searchParams.has("p")) url.searchParams.set("p", "0");
    if (!url.searchParams.has("page_size") && !url.searchParams.has("limit")) url.searchParams.set("page_size", String(config.logLimit || 200));
    if (!url.searchParams.has("since")) url.searchParams.set("since", since.toISOString());
    const headers = { Accept: "application/json" };
    const bearer = String(config.accessToken || config.apiKey || "").trim();
    if (bearer) headers.Authorization = "Bearer " + bearer;
    if (config.cookie) headers.Cookie = String(config.cookie).trim();
    if (config.userId) headers["New-Api-User"] = String(config.userId).trim();

    const body = await nativeJsonRequest(url.toString(), headers);
    return extractLogItems(body);
  }

  async function nativeJsonRequest(url, headers) {
    const plugin = window.Capacitor?.Plugins?.CapacitorHttp || window.CapacitorHttp;
    if (plugin && typeof plugin.request === "function") {
      const response = await plugin.request({ url, method: "GET", headers, connectTimeout: 60000, readTimeout: 60000 });
      if (response.status < 200 || response.status >= 300) throw new Error("账单接口请求失败：HTTP " + response.status + "。");
      if (typeof response.data === "string") {
        try {
          return JSON.parse(response.data);
        } catch {
          throw new Error("账单接口没有返回 JSON。");
        }
      }
      return response.data;
    }
    if (headers.Cookie) throw new Error("当前 WebView 无法用普通 fetch 发送 Cookie，请使用支持原生 HTTP 的安装包。");
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error("账单接口请求失败：HTTP " + response.status + "。");
    return response.json();
  }

  function extractLogItems(value) {
    if (Array.isArray(value)) return value.filter(isObject);
    const object = isObject(value) ? value : null;
    if (!object) return [];
    for (const key of ["data", "items", "logs", "records", "list", "result"]) {
      const child = object[key];
      if (Array.isArray(child)) return child.filter(isObject);
      if (isObject(child)) {
        for (const nestedKey of ["data", "items", "logs", "records", "list"]) {
          const nested = child[nestedKey];
          if (Array.isArray(nested)) return nested.filter(isObject);
        }
      }
    }
    return [];
  }

  function findBestLogMatch(record, logs, usedLogIds, config) {
    const recordTime = Date.parse(record.createdAt || "");
    const model = String(record.providerDetails?.model || "").trim();
    const candidates = logs.filter((log) => {
      const id = logIdentity(log, config);
      if (id && usedLogIds.has(id)) return false;
      const cost = logCost(log, config);
      if (!Number.isFinite(cost) || cost <= 0) return false;
      const logTime = logCreatedAt(log);
      if (Number.isFinite(recordTime) && Number.isFinite(logTime) && Math.abs(logTime - recordTime) > MATCH_WINDOW_MS) return false;
      const logModel = stringValue(log.model ?? log.model_name);
      if (model && logModel && model !== logModel) return false;
      return true;
    });
    if (candidates.length === 0) return;
    candidates.sort((left, right) => Math.abs(logCreatedAt(left) - recordTime) - Math.abs(logCreatedAt(right) - recordTime));
    const count = Math.max(1, Number(record.count || record.outputs?.length || 1));
    const anchor = candidates[0];
    const anchorModel = stringValue(anchor.model ?? anchor.model_name);
    const anchorCost = logCost(anchor, config);
    return candidates
      .filter((log) => {
        const logModel = stringValue(log.model ?? log.model_name);
        if (anchorModel && logModel && anchorModel !== logModel) return false;
        const cost = logCost(log, config);
        if (Number.isFinite(anchorCost) && Number.isFinite(cost) && Math.abs(anchorCost - cost) > 0.000001) return false;
        return true;
      })
      .slice(0, count);
  }

  function billingDetailsFromLogs(logs, record, config) {
    const valid = logs.filter((log) => {
      const cost = logCost(log, config);
      return Number.isFinite(cost) && cost > 0;
    });
    if (valid.length === 0) return;
    const totalCost = roundCost(valid.reduce((sum, log) => sum + logCost(log, config), 0));
    const billableImageCount = Math.max(valid.length, Number(record.count || record.outputs?.length || 1), 1);
    const source = safeHost(config.logUrl) || "billing-url";
    return {
      currency: stringValue(valid[0].currency) || config.currency || "USD",
      totalCost,
      costPerImage: roundCost(totalCost / billableImageCount),
      billableImageCount,
      source,
      syncedAt: new Date().toISOString(),
      externalRequestId: firstString(...valid.flatMap(logRequestIds))
    };
  }

  function logCost(log, config) {
    const direct = numberValue(log.cost ?? log.amount ?? log.fee ?? log.totalCost ?? log.total_cost ?? nestedValue(log.metadata, "cost") ?? nestedValue(log.metadata, "amount") ?? nestedValue(log.metadata, "fee") ?? nestedValue(log.metadata, "totalCost") ?? nestedValue(log.metadata, "total_cost"));
    if (Number.isFinite(direct)) return direct;
    const quota = numberValue(log.quota ?? nestedValue(log.metadata, "quota"));
    if (!Number.isFinite(quota)) return Number.NaN;
    const ratio = positiveNumber(config.quotaPerCurrencyUnit, 500000);
    return roundCost(quota / ratio);
  }

  function logCreatedAt(log) {
    const value = log.createdAt ?? log.created_at ?? log.timestamp ?? log.time;
    const numeric = numberValue(value);
    if (Number.isFinite(numeric)) return numeric < 10000000000 ? numeric * 1000 : numeric;
    return Date.parse(stringValue(value));
  }

  function logRequestIds(log) {
    return [
      log.requestId,
      log.request_id,
      log.id,
      log.traceId,
      log.trace_id,
      nestedValue(log.metadata, "requestId"),
      nestedValue(log.metadata, "request_id"),
      nestedValue(log.metadata, "x-oneapi-request-id"),
      nestedValue(log.input, "requestId"),
      nestedValue(log.input, "request_id"),
      nestedValue(log.input, "x-oneapi-request-id")
    ].map(stringValue).filter(Boolean);
  }

  function logIdentity(log, config) {
    return firstString(...logRequestIds(log)) || firstString(log.id, String(logCreatedAt(log)) + ":" + String(logCost(log, config)) + ":" + stringValue(log.model ?? log.model_name));
  }

  function nestedValue(value, key) {
    return isObject(value) ? value[key] : undefined;
  }

  function numberValue(value) {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    }
    return Number.NaN;
  }

  function stringValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function firstString() {
    for (const value of arguments) {
      const text = stringValue(value);
      if (text) return text;
    }
    return undefined;
  }

  function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function roundCost(value) {
    return Math.round(Number(value || 0) * 1000000) / 1000000;
  }

  function safeHost(value) {
    try {
      return new URL(value).host;
    } catch {
      return "";
    }
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

  async function readProject() {
    const db = await openDb().catch(() => null);
    if (db && db.objectStoreNames.contains(METADATA_STORE)) {
      const project = await new Promise((resolve, reject) => {
        const tx = db.transaction(METADATA_STORE, "readonly");
        const request = tx.objectStore(METADATA_STORE).get(PROJECT_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || Error("Unable to read project."));
      }).catch(() => undefined);
      db.close();
      if (isObject(project) && Array.isArray(project.history)) return project;
    }
    try {
      const project = JSON.parse(localStorage.getItem(PROJECT_KEY) || "{}");
      if (isObject(project) && Array.isArray(project.history)) return project;
    } catch {}
    return { id: "native-project", name: "Mobile Canvas", snapshot: null, history: [], updatedAt: new Date().toISOString() };
  }

  async function writeProject(project) {
    const db = await openDb().catch(() => null);
    if (db && db.objectStoreNames.contains(METADATA_STORE)) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(METADATA_STORE, "readwrite");
        tx.objectStore(METADATA_STORE).put(project, PROJECT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || Error("Unable to save project."));
        tx.onabort = () => reject(tx.error || Error("Unable to save project."));
      });
      db.close();
      localStorage.removeItem(PROJECT_KEY);
      return;
    }
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
  }

  window.addEventListener("pointerdown", scheduleInjectSetting, { passive: true });
  window.addEventListener("focus", scheduleInjectSetting);
  document.addEventListener("visibilitychange", scheduleInjectSetting);
  fetchInstallTimer = window.setInterval(installFetchInterceptor, 1000);
  installFetchInterceptor();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scheduleInjectSetting();
      installFetchInterceptor();
      window.setInterval(scheduleInjectSetting, 1200);
    });
  } else {
    scheduleInjectSetting();
    window.setInterval(scheduleInjectSetting, 1200);
  }
})();
