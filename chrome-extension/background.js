/*
 * Requires host_permissions for https://discord.com/* (to read the response and
 * to be allowed to modify headers for that host).
 */
const ext = (typeof browser !== "undefined") ? browser : chrome;
const API_BASE = "https://discord.com/api/v9";
const BOT_UA = "DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)";

const STRIP = new Set(["origin", "referer", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-fetch-user"]);
const TARGET_URLS = ["*://discord.com/api/*/identities/*/profile*"];
const DNR_RULE_ID = 4733;

function installHeaderRewrite() {
  if (ext.webRequest && ext.webRequest.onBeforeSendHeaders) {
    try {
      ext.webRequest.onBeforeSendHeaders.addListener(
        (details) => {
          if (details.method !== "PATCH") return {};
          const headers = (details.requestHeaders || []).filter((h) => !STRIP.has(h.name.toLowerCase()));
          const ua = headers.find((h) => h.name.toLowerCase() === "user-agent");
          if (ua) ua.value = BOT_UA;
          else headers.push({ name: "User-Agent", value: BOT_UA });
          return { requestHeaders: headers };
        },
        { urls: TARGET_URLS },
        ["blocking", "requestHeaders"]
      );
      return;
    } catch (e) {
      console.error("[Widget Creator] webRequest rewrite failed, trying DNR:", e);
    }
  }

  if (ext.declarativeNetRequest && ext.declarativeNetRequest.updateSessionRules) {
    ext.declarativeNetRequest
      .updateSessionRules({
        removeRuleIds: [DNR_RULE_ID],
        addRules: [
          {
            id: DNR_RULE_ID,
            priority: 1,
            action: {
              type: "modifyHeaders",
              requestHeaders: [
                { header: "origin", operation: "remove" },
                { header: "referer", operation: "remove" },
                { header: "sec-fetch-site", operation: "remove" },
                { header: "sec-fetch-mode", operation: "remove" },
                { header: "sec-fetch-dest", operation: "remove" },
                { header: "user-agent", operation: "set", value: BOT_UA },
              ],
            },
            condition: {
              urlFilter: "discord.com/api/*/identities/*/profile",
              requestMethods: ["patch"],
            },
          },
        ],
      })
      .catch((e) => console.error("[Widget Creator] DNR rule failed:", e));
  }
}

installHeaderRewrite();

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "dwc-finalize") return;
  finalize(msg)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, status: 0, body: String((e && e.message) || e) }));
  return true;
});

async function finalize({ appId, userId, botToken }) {
  const url = `${API_BASE}/applications/${appId}/users/${userId}/identities/0/profile`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bot " + botToken,
    },
    body: JSON.stringify({ data: { dynamic: [] } }),
  });
  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body };
}
