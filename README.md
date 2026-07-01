# Discord Widget Creator

Automates the creation of a **Discord profile widget** described in
[aamiaa's WidgetCreator guide](https://gist.github.com/aamiaa/7cdd590e3949cd654758bc90bcb4710b),
with two improvements:

1. **No PowerShell / no terminal.** The original guide copies a PowerShell command to
   your clipboard for the final step. This version performs that request itself, so the
   whole flow is one click. (See [how that works](#how-the-no-terminal-part-works).)
2. **A live on-page console.** Every step is printed to a floating panel (and the DevTools
   console), so you can watch progress and see any error immediately.

Two forms, same logic:

| Form | Folder | Best for |
|------|--------|----------|
| Chrome extension | [`chrome-extension/`](chrome-extension) | Chrome / Edge / Brave |
| Firefox extension | [`firefox-extension/`](firefox-extension) | Firefox |

---

## How to use (any version)

1. Install one of the two versions (below).
2. Go to <https://discord.com/developers/applications> and let it fully load.
3. **Reload the page once** after installing (content scripts only inject into pages loaded
   *after* the add-on is installed).
4. Click the **Widget Creator** button in the **bottom-right corner of the page**
   (this add-on has no toolbar button).
5. Click **▶ Start**.
6. Solve the **captcha** if one appears, and enter your **2FA** code if prompted.
7. When the console says *"All done!"*, the widget editor opens so you can customize the
   title, image, and stats.

> ⚠️ **This creates a real Discord application on your account** and adds a widget to your
> profile (exactly what the original guide does, just automated).

---

## Sharing & updating widgets (Export / Import / Refresh)

The panel has a **JSON box** and three buttons that all operate on a widget's
configuration (its `surfaces` JSON, the same thing the editor's *Sample Data ▸ Generate
JSON* shows):

| Button | What it does |
|--------|--------------|
| **⬇ Export** | Fetches the widget config for the app you're viewing (`/applications/<id>/…`) and drops its JSON into the box, you can share the generated JSON. |
| **⬆ Import** | Imports the JSON in the box into the **target** chosen in the dropdown (see below). |
| **↻ Refresh** | Applies the JSON in the box to the **current** widget (`PATCH` config + re-`publish`) — no new app. Use this after editing the JSON or pasting a fresh *Generate JSON* (Widget's Sample Data). |

**Import target (the dropdown + ⟳ Load):**

- **➕ Create new widget** (default) — runs the full create flow and makes a brand-new widget
  on your account from the JSON.
- **An existing widget** — click **⟳ Load** to list your applications, pick one, then **Import**
  applies the JSON to that widget (`PATCH` + `publish`) instead of creating another app. This is
  how you *edit* an existing widget from shared/updated JSON without piling up apps.

**Which widget?** Export/Refresh use the `appId` from the page URL (be on the app's page),
falling back to the one you created this session. **Format:** Import/Refresh accept our export
envelope (`{"_type":"discord-widget","surfaces":{…}}`), a plain `{"surfaces":{…}}`, or a bare
surfaces map (`{"widget_top":{…},…}`). If the parser doesn't recognize it, it logs the
JSON's top-level keys so you can see what came in.

> Export and Refresh use your **user** session (Discord's internal API), so they don't need
> the bot-token / terminal dance that creation does.

---

## The Widget tab is auto-restored

Discord gates the per-app **Widget** tab/editor behind an experiment override that it keeps
only in memory so it **disappears whenever you reload or reopen** the Developer Portal.

This tool re-applies that override **automatically on every page load**. The page script runs
at `document_start` and sets the override as early as possible (before the app sidebar
renders), so the tab is simply there. You'll see
*"Widget tab re-enabled automatically"* in the console.

If a load is ever too fast and the tab doesn't show, click **Tab** in the panel: it
re-applies the override and nudges the sidebar to reveal the tab.

---

## Install

### Chrome / Edge / Brave extension
1. Go to `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `chrome-extension/` folder.
3. Open the Developer Portal and **reload the page**.

> Requires Chrome/Edge **111+** (content scripts in the page's `MAIN` world).

### Firefox extension
1. Go to `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…**
2. Select `firefox-extension/manifest.json`.
3. Open the Developer Portal and **reload the page**.

> Requires Firefox **128+**. Temporary add-ons are removed when Firefox restarts.
>
> **If finalization fails with a permission/CORS error**, grant the host permission: go to
> `about:addons` → *Discord Widget Creator* → **Permissions** → enable
> *"Access your data for discord.com"*, then reload and run again. The background script
> needs that access to talk to Discord's API.

---

## How the "no terminal" part works

The last step of the guide updates the application's profile identity:

```
PATCH /api/v9/applications/{appId}/users/{userId}/identities/0/profile
```


**The fix** is to issue that one request from a context that never had those headers:

- **Extensions** — the **background script** does the `fetch` (`background.js`), and the
  extension's network layer rewrites that request's headers so it is byte-for-byte like the
  PowerShell call: it strips `Origin` / `Referer` / `Sec-Fetch-*` and sets
  `User-Agent: DiscordBot (…)`. Firefox does this with blocking `webRequest`; Chrome with
  `declarativeNetRequest`. The MAIN-world script can't reach `chrome.runtime`, so a small
  isolated **bridge** content script (`bridge.js`) relays the token to the background:

  ```
  page (MAIN world)  ──window.postMessage──▶  bridge (isolated)
                                                   │ chrome.runtime.sendMessage
                                                   ▼
                                              background.js  ──fetch(Bot)──▶  Discord API
  ```

If it ever still fails, the console **automatically falls back** to showing the original
PowerShell command in a copy-ready box, so you're never stuck.

## Why the page part must run in the MAIN world

The script finds Discord's internal modules through the page global
`webpackChunkdiscord_developers`. A normal isolated content script can't see page globals, so:

- the userscript uses `unsafeWindow` (and `cloneInto` on Firefox to pass objects into page
  functions past "Xray" isolation), and
- both extensions declare `"world": "MAIN"` for `widget-creator.js`.

---

## Notes & caveats

- Relies on **undocumented internal Discord behavior** (webpack module shapes, experiment
  overrides, private API routes). If Discord changes these, the script may break, the
  console will tell you *which* step failed.
- The widget is created with placeholder content; edit it in the widget editor that opens at
  the end.
- Use on your own account, at your own risk. Automating account actions is against Discord's
  ToS in spirit; provided for educational purposes.
