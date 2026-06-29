/*
 * Discord Widget Creator — core logic
 * ---------------------------------------------------------------------------------
 * Automates https://gist.github.com/aamiaa/7cdd590e3949cd654758bc90bcb4710b and adds:
 *   - Create:  one-click widget creation (with captcha/2FA handled by Discord's UI)
 *   - Export:  download/copy a widget's config JSON so it can be shared
 *   - Import:  create a brand-new widget from a shared JSON
 *   - Refresh: re-apply edited JSON ("Sample Data > Generate JSON") to the current widget
 *
 * This file runs in the PAGE (MAIN) world — it needs `webpackChunkdiscord_developers`.
 */
(function () {
  "use strict";

  if (!location.hostname.endsWith("discord.com")) return;
  const pageWindow = (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : window;

  if (pageWindow.__discordWidgetCreatorLoaded) return;
  pageWindow.__discordWidgetCreatorLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let lastApp = null;

  // Experiment flag that reveals the per-app "Widget" tab/editor. Discord keeps
  // this override only in memory, so it's lost on every page load — we re-apply it
  // early on each load (see the document_start boot at the bottom).
  const WIDGET_EXPERIMENT = "2026-03-widget-config-editor";
  let overrideApplied = false;

  // Firefox "Xray vision": a sandboxed userscript must clone objects into the page
  // realm before page-context functions can read them. No-op in a real page context.
  function toPage(obj) {
    if (typeof cloneInto === "function" && pageWindow !== window) {
      try { return cloneInto(obj, pageWindow, { cloneFunctions: true }); } catch (e) { return obj; }
    }
    return obj;
  }

  // On-page console UI
  const UI = (function () {
    const PREFIX = "dwc";
    const COLORS = { info: "#b9bbbe", step: "#7289ff", success: "#3ba55d", warn: "#faa61a", error: "#ed4245" };

    let logEl, startBtn, fallbackWrap, fallbackText, statusEl, jsonEl, targetEl;
    let running = false;

    function injectStyles() {
      if (document.getElementById(`${PREFIX}-styles`)) return;
      const css = `
#${PREFIX}-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483647;
  background:#5865f2;color:#fff;border:none;border-radius:24px;padding:10px 16px;
  font:600 13px/1 "gg sans",system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4)}
#${PREFIX}-launcher:hover{background:#4752c4}
#${PREFIX}-panel{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:460px;
  max-width:calc(100vw - 36px);background:#1e1f22;color:#dbdee1;border:1px solid #2b2d31;
  border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.55);
  font:13px/1.45 "gg sans",system-ui,sans-serif;display:none;overflow:hidden}
#${PREFIX}-panel.${PREFIX}-open{display:block}
#${PREFIX}-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#111214;cursor:move;user-select:none}
#${PREFIX}-head .${PREFIX}-title{font-weight:700;flex:1}
#${PREFIX}-head .${PREFIX}-dot{width:9px;height:9px;border-radius:50%;background:#3ba55d}
#${PREFIX}-head button{background:transparent;border:none;color:#b9bbbe;cursor:pointer;font-size:16px;line-height:1;padding:2px 6px;border-radius:4px}
#${PREFIX}-head button:hover{background:#2b2d31;color:#fff}
#${PREFIX}-note{padding:8px 12px;background:#2b2d31;color:#faa61a;font-size:12px}
#${PREFIX}-log{height:230px;overflow:auto;padding:10px 12px;margin:0;
  font:12px/1.5 "Consolas",ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;background:#1e1f22}
#${PREFIX}-log div{padding:1px 0}
#${PREFIX}-tools{padding:8px 12px;background:#232428;border-top:1px solid #1e1f22}
#${PREFIX}-tools-head{font-size:11px;color:#b9bbbe;margin-bottom:6px;font-weight:600;letter-spacing:.02em;text-transform:uppercase}
#${PREFIX}-tools-head span{color:#80848e;font-weight:400;text-transform:none}
#${PREFIX}-json{width:100%;height:70px;box-sizing:border-box;resize:vertical;background:#1e1f22;color:#dbdee1;
  border:1px solid #111214;border-radius:6px;padding:8px;font:11px/1.4 "Consolas",ui-monospace,monospace}
#${PREFIX}-target-row{display:flex;gap:6px;margin-top:6px}
#${PREFIX}-target{flex:1;background:#1e1f22;color:#dbdee1;border:1px solid #111214;border-radius:6px;padding:6px 8px;font-size:12px}
#${PREFIX}-load{background:#4e5058;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-weight:600;cursor:pointer;font-size:12px;white-space:nowrap}
#${PREFIX}-load:hover{background:#6d6f78}
#${PREFIX}-load:disabled,#${PREFIX}-target:disabled{opacity:.5;cursor:not-allowed}
#${PREFIX}-tools-bar{display:flex;gap:6px;margin-top:6px}
#${PREFIX}-tools-bar button{flex:1;border:none;border-radius:6px;padding:7px 8px;font-weight:600;cursor:pointer;font-size:12px;background:#4e5058;color:#fff}
#${PREFIX}-tools-bar button:hover{background:#6d6f78}
#${PREFIX}-tools-bar button:disabled{background:#3a3c41;color:#80848e;cursor:not-allowed}
#${PREFIX}-export{background:#5865f2}
#${PREFIX}-export:hover{background:#4752c4}
#${PREFIX}-bar{display:flex;gap:8px;padding:10px 12px;background:#111214;align-items:center}
#${PREFIX}-bar .${PREFIX}-status{flex:1;color:#b9bbbe;font-size:12px}
#${PREFIX}-bar button{border:none;border-radius:6px;padding:8px 14px;font-weight:600;cursor:pointer;font-size:13px}
#${PREFIX}-start{background:#3ba55d;color:#fff}
#${PREFIX}-start:hover{background:#2d7d46}
#${PREFIX}-start:disabled{background:#3a3c41;color:#80848e;cursor:not-allowed}
#${PREFIX}-clear{background:#4e5058;color:#fff}
#${PREFIX}-clear:hover{background:#6d6f78}
#${PREFIX}-tab{background:#4e5058;color:#fff}
#${PREFIX}-tab:hover{background:#6d6f78}
#${PREFIX}-tab:disabled{background:#3a3c41;color:#80848e;cursor:not-allowed}
#${PREFIX}-fallback{display:none;padding:10px 12px;background:#2b2d31;border-top:1px solid #1e1f22}
#${PREFIX}-fallback.${PREFIX}-open{display:block}
#${PREFIX}-fallback p{margin:0 0 6px;color:#faa61a;font-size:12px}
#${PREFIX}-fallback textarea{width:100%;height:88px;box-sizing:border-box;resize:vertical;background:#1e1f22;color:#dbdee1;
  border:1px solid #111214;border-radius:6px;padding:8px;font:11px/1.4 "Consolas",ui-monospace,monospace}
#${PREFIX}-copy{margin-top:6px;background:#5865f2;color:#fff;border:none;border-radius:6px;padding:7px 12px;font-weight:600;cursor:pointer}
#${PREFIX}-copy:hover{background:#4752c4}`;
      const style = document.createElement("style");
      style.id = `${PREFIX}-styles`;
      style.textContent = css;
      document.head.appendChild(style);
    }

    function build() {
      injectStyles();

      const launcher = document.createElement("button");
      launcher.id = `${PREFIX}-launcher`;
      launcher.textContent = "Widget Creator";
      launcher.addEventListener("click", () => { panel.classList.add(`${PREFIX}-open`); launcher.style.display = "none"; });

      const panel = document.createElement("div");
      panel.id = `${PREFIX}-panel`;
      panel.innerHTML = `
        <div id="${PREFIX}-head">
          <span class="${PREFIX}-dot"></span>
          <span class="${PREFIX}-title">Discord Widget Creator</span>
          <button id="${PREFIX}-min" title="Minimize">–</button>
        </div>
        <div id="${PREFIX}-note">⚠ Makes a real Discord application on your account and adds a
          widget to your profile. Solve any captcha / 2FA prompts when they appear.</div>
        <div id="${PREFIX}-log"></div>
        <div id="${PREFIX}-tools">
          <div id="${PREFIX}-tools-head">Share / Update <span>— paste JSON, choose a target, then Import (or Export to fill it)</span></div>
          <textarea id="${PREFIX}-json" placeholder='Widget JSON, e.g. {"surfaces":{...}} — click Export to fill this from your current widget.'></textarea>
          <div id="${PREFIX}-target-row">
            <select id="${PREFIX}-target" title="Where Import sends the JSON">
              <option value="new">➕ Create new widget</option>
            </select>
            <button id="${PREFIX}-load" title="Load your existing widgets into the list">⟳ Load</button>
          </div>
          <div id="${PREFIX}-tools-bar">
            <button id="${PREFIX}-export" title="Download the current widget's JSON">⬇ Export</button>
            <button id="${PREFIX}-import" title="Import the JSON into the selected target (new or existing)">⬆ Import</button>
            <button id="${PREFIX}-refresh" title="Apply the JSON to the widget on this page">↻ Refresh</button>
          </div>
        </div>
        <div id="${PREFIX}-fallback">
          <p>Automatic finalization was blocked. Copy this command, run it in a terminal (PowerShell on Windows):</p>
          <textarea id="${PREFIX}-fallback-text" readonly></textarea>
          <button id="${PREFIX}-copy">Copy command</button>
        </div>
        <div id="${PREFIX}-bar">
          <span class="${PREFIX}-status" id="${PREFIX}-status">Idle</span>
          <button id="${PREFIX}-tab" title="Re-enable the Widget tab (Discord hides it after a reload)">Tab</button>
          <button id="${PREFIX}-clear">Clear</button>
          <button id="${PREFIX}-start">▶ Start</button>
        </div>`;

      document.body.appendChild(launcher);
      document.body.appendChild(panel);

      logEl = panel.querySelector(`#${PREFIX}-log`);
      startBtn = panel.querySelector(`#${PREFIX}-start`);
      statusEl = panel.querySelector(`#${PREFIX}-status`);
      jsonEl = panel.querySelector(`#${PREFIX}-json`);
      targetEl = panel.querySelector(`#${PREFIX}-target`);
      fallbackWrap = panel.querySelector(`#${PREFIX}-fallback`);
      fallbackText = panel.querySelector(`#${PREFIX}-fallback-text`);

      panel.querySelector(`#${PREFIX}-min`).addEventListener("click", () => { panel.classList.remove(`${PREFIX}-open`); launcher.style.display = ""; });
      panel.querySelector(`#${PREFIX}-clear`).addEventListener("click", () => { logEl.innerHTML = ""; fallbackWrap.classList.remove(`${PREFIX}-open`); });
      panel.querySelector(`#${PREFIX}-copy`).addEventListener("click", () => copyFallback());

      makeDraggable(panel, panel.querySelector(`#${PREFIX}-head`));
      log("Ready. Create a widget, or Export/Import/Refresh with the JSON box below.", "info");
    }

    function makeDraggable(el, handle) {
      let sx, sy, ox, oy, dragging = false;
      handle.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "BUTTON") return;
        dragging = true;
        const r = el.getBoundingClientRect();
        ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
        el.style.right = "auto"; el.style.bottom = "auto"; el.style.left = ox + "px"; el.style.top = oy + "px";
        e.preventDefault();
      });
      document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        el.style.left = ox + (e.clientX - sx) + "px";
        el.style.top = oy + (e.clientY - sy) + "px";
      });
      document.addEventListener("mouseup", () => { dragging = false; });
    }

    function log(msg, level = "info") {
      const line = document.createElement("div");
      line.style.color = COLORS[level] || COLORS.info;
      line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      if (logEl) { logEl.appendChild(line); logEl.scrollTop = logEl.scrollHeight; }
      const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
      console[method](`[Widget Creator] ${msg}`);
    }

    function setStatus(text) { if (statusEl) statusEl.textContent = text; }
    function setRunning(state) {
      running = state;
      if (startBtn) { startBtn.disabled = state; startBtn.textContent = state ? "Running…" : "▶ Start"; }
      ["export", "import", "refresh", "tab", "load", "target"].forEach((id) => {
        const b = document.getElementById(`${PREFIX}-${id}`);
        if (b) b.disabled = state;
      });
    }
    function isRunning() { return running; }
    function getJson() { return jsonEl ? jsonEl.value : ""; }
    function setJson(t) { if (jsonEl) jsonEl.value = t; }
    function getTarget() { return targetEl ? targetEl.value : "new"; }
    function setTargetOptions(apps) {
      if (!targetEl) return;
      const current = targetEl.value;
      while (targetEl.options.length > 1) targetEl.remove(1);
      apps.forEach((a) => {
        const o = document.createElement("option");
        o.value = a.id;
        o.textContent = `🧩 ${a.name || "App"} (${a.id})`;
        targetEl.appendChild(o);
      });
      if ([].some.call(targetEl.options, (o) => o.value === current)) targetEl.value = current;
    }

    function showFallback(command) {
      if (!fallbackWrap) return;
      fallbackText.value = command;
      fallbackWrap.classList.add(`${PREFIX}-open`);
    }
    async function copyFallback() {
      const btn = document.getElementById(`${PREFIX}-copy`);
      try {
        await navigator.clipboard.writeText(fallbackText.value);
        if (btn) { btn.textContent = "Copied!"; setTimeout(() => (btn.textContent = "Copy command"), 1500); }
      } catch (e) {
        fallbackText.focus(); fallbackText.select();
        if (btn) { btn.textContent = "Press Ctrl+C"; setTimeout(() => (btn.textContent = "Copy command"), 2000); }
      }
    }

    function onStart(handler) { startBtn.addEventListener("click", () => { if (!running) handler(); }); }
    function bindButton(id, handler) {
      const btn = document.getElementById(`${PREFIX}-${id}`);
      if (btn) btn.addEventListener("click", () => handler());
    }

    return { build, log, setStatus, setRunning, isRunning, getJson, setJson, getTarget, setTargetOptions, showFallback, onStart, bindButton };
  })();

  //  Widget template + helpers
  function buildSurfaces() {
    const stats = {};
    for (let i = 1; i <= 6; i++) {
      stats[`stat_${i}`] = {
        fields: {
          value: { presentation_type: "text", value_type: "custom_string", value: `text ${i} here` },
          label: { presentation_type: "text", value_type: "custom_string", value: `label ${i} here` },
        },
      };
    }
    return {
      surfaces: {
        widget_top: {
          layout: "widget_top_hero",
          components: {
            hero_image: { fields: { image: { presentation_type: "image", value_type: "data", value: "change this to an image" } } },
            title: { fields: { text: { presentation_type: "text", value_type: "custom_string", value: "some title here" } } },
          },
        },
        widget_bottom: { layout: "widget_bottom_stats", components: stats },
        add_widget_preview: {
          layout: "add_widget_preview_hero",
          components: { hero_image: { fields: { image: { presentation_type: "image", value_type: "data", value: "change this to an image" } } } },
        },
      },
    };
  }

  function buildPowershell(appId, userId, botToken) {
    const body = JSON.stringify({ data: { dynamic: [] } });
    return (
      `Invoke-RestMethod -Method PATCH -Headers @{"Content-Type"="application/json"; ` +
      `"Authorization"="Bot ${botToken}";"User-Agent"="DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)"} ` +
      `-Uri https://discord.com/api/v9/applications/${appId}/users/${userId}/identities/0/profile -Body '${body}'`
    );
  }

  function currentAppId() {
    const m = location.pathname.match(/\/applications\/(\d+)/);
    return m ? m[1] : null;
  }

  // Accepts our export envelope, a {surfaces:{...}} object, or a bare surfaces map,
  // and returns the body shape the widget-config PATCH expects: {surfaces:{...}}.
  function extractSurfacesBody(json) {
    if (!json || typeof json !== "object") return null;
    if (json.surfaces && typeof json.surfaces === "object") return { surfaces: json.surfaces };
    const surfaceKeys = ["widget_top", "widget_bottom", "add_widget_preview"];
    if (surfaceKeys.some((k) => k in json)) return { surfaces: json };
    return null;
  }

    function readJsonBox() {
    const raw = UI.getJson().trim();
    if (!raw) { UI.log("Paste widget JSON into the box first.", "warn"); return null; }
    try { return JSON.parse(raw); }
    catch (e) { UI.log("That isn't valid JSON: " + e.message, "error"); return null; }
  }

  //  Discord internals + API wrapper
  function getInternals() {
    if (typeof pageWindow.webpackChunkdiscord_developers === "undefined") {
      throw new Error("webpackChunkdiscord_developers not found. Open https://discord.com/developers/applications and let it load.");
    }
    const wpRequire = pageWindow.webpackChunkdiscord_developers.push(toPage([["dwc_" + Math.random()], {}, (r) => r]));
    pageWindow.webpackChunkdiscord_developers.pop();
    const find = (pred, name) => {
      const mod = Object.values(wpRequire.c).find(pred);
      if (!mod) throw new Error(`Couldn't locate ${name} — Discord's internal modules may have changed.`);
      return mod;
    };
    return {
      ApexStore: find((x) => x?.exports?.A?.createOverride, "ApexStore").exports.A,
      UserStore: find((x) => x?.exports?.A?.__proto__?.getCurrentUser, "UserStore").exports.A,
      FluxDispatcher: find((x) => x?.exports?.A?.__proto__?.flushWaitQueue, "FluxDispatcher").exports.A,
      api: find((x) => x?.exports?.Bo?.get, "API module").exports.Bo,
    };
  }

  // Logs
  async function apiCall(api, method, opts, label) {
    UI.log(label + "…", "step");
    try {
      return await api[method](toPage(opts));
    } catch (e) {
      let detail = "";
      if (e && e.status) detail += ` HTTP ${e.status}`;
      if (e && e.body) { try { detail += " " + JSON.stringify(e.body); } catch (x) {} }
      else if (e && e.message) detail += " " + e.message;
      const err = new Error(`${label} failed:${detail || " " + String(e)}`);
      err.cause = e;
      throw err;
    }
  }

  async function fetchConfig(api, appId) {
    const listRes = await apiCall(api, "get", { url: `/applications/${appId}/widget-configs` }, "Fetching widget configs");
    let b = listRes.body;
    let cfg = Array.isArray(b) ? b[0] : (b && Array.isArray(b.configs) ? b.configs[0] : b);
    if (cfg && cfg.config_id && !cfg.surfaces) {
      try {
        const full = await apiCall(api, "get", { url: `/applications/${appId}/widget-configs/${cfg.config_id}` }, "Fetching widget config detail");
        cfg = full.body || cfg;
      } catch (e) { /* keep the list entry */ }
    }
    return cfg;
  }

  //  Bot-authenticated finalize (privileged request)
  function gmFinalize(gmXHR, url, botToken, bodyObj) {
    return new Promise((resolve) => {
      gmXHR({
        method: "PATCH",
        url,
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bot " + botToken,
          "User-Agent": "DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)",
        },
        data: JSON.stringify(bodyObj),
        anonymous: true,
        onload: (r) => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, body: r.responseText || "" }),
        onerror: () => resolve({ ok: false, status: 0, body: "network error" }),
        ontimeout: () => resolve({ ok: false, status: 0, body: "timeout" }),
      });
    });
  }

  function bridgeFinalize(appId, userId, botToken) {
    return new Promise((resolve) => {
      const id = "dwc-" + Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, status: 0, body: "the extension background script did not respond" });
      }, 20000);
      function onMsg(e) {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.__dwc !== true || d.type !== "finalizeResult" || d.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        resolve({ ok: !!d.ok, status: d.status, body: d.body });
      }
      window.addEventListener("message", onMsg);
      window.postMessage({ __dwc: true, type: "finalize", id, appId, userId, botToken }, location.origin);
    });
  }

  async function finalize(appId, userId, botToken) {
    const bodyObj = { data: { dynamic: [] } };
    const gmXHR =
      (typeof GM_xmlhttpRequest !== "undefined" && GM_xmlhttpRequest) ||
      (typeof GM !== "undefined" && GM && GM.xmlHttpRequest) || null;
    if (gmXHR) {
      UI.log("Finalizing via privileged request…", "info");
      return gmFinalize(gmXHR, `https://discord.com/api/v9/applications/${appId}/users/${userId}/identities/0/profile`, botToken, bodyObj);
    }
    UI.log("Finalizing via the extension background privileged request…", "info");
    return bridgeFinalize(appId, userId, botToken);
  }

  // Actions: Create / Import / Refresh / Export
  async function runFlow(opts) {
    if (UI.isRunning()) return;
    UI.setRunning(true);
    UI.setStatus("Working…");
    try {
      await createWidget(opts || {});
      UI.setStatus("Finished");
    } catch (err) {
      UI.log(`FATAL: ${err && err.message ? err.message : err}`, "error");
      const body = (err && err.body) || (err && err.cause && err.cause.body);
      if (body) { try { UI.log("Server said: " + JSON.stringify(body), "error"); } catch (e) {} }
      if (err && err.stack) UI.log(err.stack, "error");
      UI.setStatus("Failed — see log");
    } finally {
      UI.setRunning(false);
    }
  }

  function run() { return runFlow({}); }

  async function createWidget(opts) {
    UI.log("Locating Discord internals…", "step");
    const { ApexStore, UserStore, FluxDispatcher, api } = getInternals();
    const userId = UserStore.getCurrentUser().id;
    UI.log(`Authenticated as user ${userId}.`, "info");

    const displayName = opts.displayName || "My Widget";
    const surfacesBody = opts.surfaces || buildSurfaces();

    // Step 1: create the application
    const appRes = await apiCall(api, "post", { url: "/applications", body: { name: "My New Widget", team_id: null } }, "Creating app (solve captcha if prompted)");
    FluxDispatcher.dispatch(toPage({ type: "APPLICATION_CREATE_SUCCESS", application: appRes.body }));
    const appId = appRes.body.id;
    UI.log(`App created (id ${appId}).`, "success");

    // Step 2: enable the Social SDK
    await apiCall(api, "post", {
      url: `/applications/${appId}/social-sdk/enable`,
      body: {
        name: "a", business_email: "foo@bar.com", game_or_studio_name: "a", game_or_studio_url: "",
        email_updates_consent: false, country_or_region: "United States", title_role: "Founder",
        target_platforms: [], form_type: "Dev Solutions", sfdc_leadsource: "Dev Portal", utm_campaign: "SDK Enable Form",
      },
    }, "Enabling Social SDK");
    UI.log("Social SDK enabled.", "success");

    // Step 3: create, configure and publish the widget
    const configRes = await apiCall(api, "post", { url: `/applications/${appId}/widget-configs`, body: { display_name: displayName } }, "Creating widget config");
    const configId = configRes.body.config_id;
    lastApp = { appId, configId };
    await apiCall(api, "patch", { url: `/applications/${appId}/widget-configs/${configId}`, body: surfacesBody }, opts.surfaces ? "Applying imported layout" : "Applying widget layout");
    await apiCall(api, "post", { url: `/applications/${appId}/widget-configs/${configId}/publish` }, "Publishing widget");
    UI.log("Widget published.", "success");

    // Step 4: attach the widget to your profile
    await apiCall(api, "patch", { url: `/applications/${appId}`, body: { redirect_uris: ["https://discord.com"] } }, "Setting redirect URI");
    await apiCall(api, "post", { url: `/oauth2/authorize?client_id=${appId}&response_type=token&scope=sdk.social_layer_presence`, body: { authorize: true } }, "Authorizing OAuth2 scope");
    const profileRes = await apiCall(api, "get", { url: `/users/${userId}/profile` }, "Fetching your profile");
    const existingWidgets = profileRes.body.widgets || [];
    existingWidgets.unshift({ data: { type: "application", application_id: appId } });
    await apiCall(api, "put", { url: `/users/@me/widgets`, body: { widgets: existingWidgets } }, "Adding widget to profile");
    UI.log("Widget added to your profile.", "success");

    // Step 5: mint a bot token
    const botTokenRes = await apiCall(api, "post", { url: `/applications/${appId}/bot/reset` }, "Resetting bot token (enter 2FA if prompted)");
    const botToken = botTokenRes.body.token;
    UI.log("Bot token acquired.", "success");

    // Step 6: finalize the profile identity (privileged request — no terminal)
    UI.log("Finalizing profile identity automatically (no PowerShell needed)…", "step");
    const result = await finalize(appId, userId, botToken);
    if (result.ok) {
      UI.log("Profile identity finalized automatically.", "success");
    } else {
      UI.log(`Automatic finalization failed: HTTP ${result.status}${result.body ? " — " + result.body : ""}`, "error");
      UI.log("Falling back to the manual command shown below.", "warn");
      UI.showFallback(buildPowershell(appId, userId, botToken));
    }

    // Step 7: open the widget editor
    UI.log("Opening the widget editor…", "step");
    try {
      ApexStore.createOverride(WIDGET_EXPERIMENT, 1);
      overrideApplied = true;
      document.querySelector(`a[href="/developers/applications/${appId}"]`)?.click();
      for (let i = 0; i < 50 && !document.querySelector(`a[href="/developers/applications/${appId}/widget"]`); i++) await sleep(100);
      const editorLink = document.querySelector(`a[href="/developers/applications/${appId}/widget"]`);
      if (editorLink) { editorLink.click(); UI.log("Editor open — customize your widget on this page!", "success"); }
      else UI.log("Couldn't auto-open the editor. Open your app manually to edit the widget.", "warn");
    } catch (e) {
      UI.log(`Couldn't auto-open the editor: ${e.message}`, "warn");
    }

    UI.log(`All done! App ID: ${appId}`, "success");
  }

  function logFailure(prefix, err) {
    UI.log(`${prefix}: ${err && err.message ? err.message : err}`, "error");
    const b = (err && err.body) || (err && err.cause && err.cause.body);
    if (b) { try { UI.log("Server said: " + JSON.stringify(b), "error"); } catch (e) {} }
    UI.setStatus("Failed — see log");
  }

  async function applyToApp(api, appId, body) {
    let configId = (lastApp && lastApp.appId === appId) ? lastApp.configId : null;
    if (!configId) {
      const cfg = await fetchConfig(api, appId);
      configId = cfg && cfg.config_id;
    }
    if (!configId) {
      const configRes = await apiCall(api, "post", { url: `/applications/${appId}/widget-configs`, body: { display_name: "My Widget" } }, "Creating widget config (none existed)");
      configId = configRes.body.config_id;
    }
    lastApp = { appId, configId };
    await apiCall(api, "patch", { url: `/applications/${appId}/widget-configs/${configId}`, body }, "Applying JSON");
    await apiCall(api, "post", { url: `/applications/${appId}/widget-configs/${configId}/publish` }, "Publishing");
  }

  // Import
  function importWidget() {
    if (UI.isRunning()) return;
    const json = readJsonBox();
    if (!json) return;
    const body = extractSurfacesBody(json);
    if (!body) {
      UI.log("Couldn't find widget 'surfaces' in that JSON. Top-level keys: " + Object.keys(json).join(", "), "error");
      return;
    }
    const target = UI.getTarget();
    if (target === "new") {
      UI.log("Importing — creating a NEW widget from this JSON…", "step");
      runFlow({ surfaces: body, displayName: json.display_name });
    } else {
      importToExisting(target, body);
    }
  }

  // Import into an existing widget
  async function importToExisting(appId, body) {
    if (UI.isRunning()) return;
    UI.setRunning(true);
    UI.setStatus("Updating…");
    try {
      const { api } = getInternals();
      UI.log(`Importing into existing widget (app ${appId})…`, "step");
      await applyToApp(api, appId, body);
      UI.log(`Existing widget (app ${appId}) updated & published. ✔`, "success");
      UI.setStatus("Updated");
    } catch (err) {
      logFailure("Import to existing failed", err);
    } finally {
      UI.setRunning(false);
    }
  }

  // Refresh: apply (possibly edited) JSON to the widget you're currently on.
  async function refreshWidget() {
    if (UI.isRunning()) return;
    const json = readJsonBox();
    if (!json) return;
    const body = extractSurfacesBody(json);
    if (!body) {
      UI.log("Couldn't find widget 'surfaces' in that JSON. Top-level keys: " + Object.keys(json).join(", "), "error");
      return;
    }
    UI.setRunning(true);
    UI.setStatus("Refreshing…");
    try {
      const { api } = getInternals();
      const appId = currentAppId() || (lastApp && lastApp.appId);
      if (!appId) throw new Error("Open the widget's page (URL has /applications/<id>) or create one first.");
      await applyToApp(api, appId, body);
      UI.log("Widget refreshed & published. ✔", "success");
      UI.setStatus("Refreshed");
    } catch (err) {
      logFailure("Refresh failed", err);
    } finally {
      UI.setRunning(false);
    }
  }

  // Load the user's applications into the dropdown so Import can edit one.
  async function loadWidgetList() {
    if (UI.isRunning()) return;
    UI.setRunning(true);
    UI.setStatus("Loading widgets…");
    try {
      const { api } = getInternals();
      const res = await apiCall(api, "get", { url: "/applications" }, "Loading your applications");
      const raw = Array.isArray(res.body) ? res.body : (res.body && Array.isArray(res.body.applications) ? res.body.applications : []);
      const apps = raw.filter((a) => a && a.id).map((a) => ({ id: a.id, name: a.name }));
      UI.setTargetOptions(apps);
      UI.log(`Loaded ${apps.length} application(s). Pick one in the dropdown, then click Import.`, "success");
      UI.setStatus("Idle");
    } catch (err) {
      logFailure("Couldn't load your applications", err);
    } finally {
      UI.setRunning(false);
    }
  }

  // Export: pull the current widget's config
  async function exportWidget() {
    if (UI.isRunning()) return;
    UI.setRunning(true);
    UI.setStatus("Exporting…");
    try {
      const { api } = getInternals();
      const appId = currentAppId() || (lastApp && lastApp.appId);
      if (!appId) throw new Error("Open a widget's page (URL has /applications/<id>) or create one first.");
      UI.log(`Exporting widget config for app ${appId}…`, "step");
      const cfg = await fetchConfig(api, appId);
      if (!cfg) throw new Error("No widget config found for this app.");
      if (!cfg.surfaces) {
        UI.log("Config has no 'surfaces' field. Keys returned: " + Object.keys(cfg).join(", "), "warn");
        throw new Error("Couldn't find 'surfaces' to export.");
      }
      if (cfg.config_id) lastApp = { appId, configId: cfg.config_id };
      const envelope = { _type: "discord-widget", version: 1, display_name: cfg.display_name || "My Widget", surfaces: cfg.surfaces };
      const text = JSON.stringify(envelope, null, 2);
      UI.setJson(text);
      UI.log("Exported! JSON is in the box below. Share it, or edit + Refresh.", "success");
      UI.setStatus("Exported");
    } catch (err) {
      UI.log(`Export failed: ${err && err.message ? err.message : err}`, "error");
      const b = (err && err.body) || (err && err.cause && err.cause.body);
      if (b) { try { UI.log("Server said: " + JSON.stringify(b), "error"); } catch (e) {} }
      UI.setStatus("Failed — see log");
    } finally {
      UI.setRunning(false);
    }
  }

  // Re-apply the experiment override that shows the per-app "Widget" tab.
  async function ensureWidgetTab(announce) {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const { ApexStore } = getInternals();
        ApexStore.createOverride(WIDGET_EXPERIMENT, 1);
        overrideApplied = true;
        if (announce) UI.log("Widget tab enabled (experiment override applied).", "success");
        return true;
      } catch (e) {
        await sleep(200);
      }
    }
    if (announce) UI.log("Couldn't enable the Widget tab — Discord internals weren't ready.", "warn");
    return false;
  }

  // Manual fallback (Tab button): re-apply
  async function reactivateWidgetTab() {
    if (UI.isRunning()) return;
    UI.log("Re-enabling the Widget tab…", "step");
    if (!(await ensureWidgetTab(true))) return;
    const appId = currentAppId();
    const widgetLink = () => document.querySelector(`a[href="/developers/applications/${appId}/widget"]`);
    if (appId && !widgetLink()) {
      UI.log("Nudging the sidebar to reveal the tab…", "info");
      document.querySelector(`a[href="/developers/applications/${appId}"]`)?.click();
      for (let i = 0; i < 40 && !widgetLink(); i++) await sleep(100);
    }
    if (!appId) UI.log("Override applied. Open any app and the Widget tab will be there.", "success");
    else if (widgetLink()) UI.log("Widget tab is available in the sidebar.", "success");
    else UI.log("Override applied, but the tab didn't render — open the app from the apps list.", "warn");
  }

  // Boot
  const overridePromise = ensureWidgetTab(false);

  function boot() {
    UI.build();
    UI.onStart(run);
    UI.bindButton("export", exportWidget);
    UI.bindButton("import", importWidget);
    UI.bindButton("refresh", refreshWidget);
    UI.bindButton("load", loadWidgetList);
    UI.bindButton("tab", reactivateWidgetTab);
    overridePromise.then((ok) => {
      if (ok) UI.log("Widget tab re-enabled automatically (Discord drops it on reload).", "success");
      else UI.log("Couldn't auto-enable the Widget tab yet — click Tab to retry.", "warn");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
