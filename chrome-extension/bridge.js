/*
 * Bridge.
 *
 * widget-creator.js runs in the page's MAIN so it can reach Discord's
 * webpack internals, but MAIN-world scripts have no access to chrome.runtime.
 * This bridge runs in the normal (isolated) content-script, which CAN
 * message the background. It relays the one bot-authenticated request between
 * the page and the background script.
 */
(function () {
  "use strict";
  function sendFinalize(msg) {
    if (typeof browser !== "undefined" && browser.runtime && browser.runtime.sendMessage) {
      return browser.runtime
        .sendMessage(msg)
        .catch((e) => ({ ok: false, status: 0, body: String((e && e.message) || e) }));
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (resp) => {
        const err = chrome.runtime.lastError;
        resolve(err ? { ok: false, status: 0, body: err.message } : (resp || { ok: false, status: 0, body: "no response from background script" }));
      });
    });
  }

  window.addEventListener("message", (e) => {
    // Only accept messages this page posted to itself.
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.__dwc !== true || d.type !== "finalize") return;

    sendFinalize({ type: "dwc-finalize", appId: d.appId, userId: d.userId, botToken: d.botToken }).then((r) => {
      const rr = r || { ok: false, status: 0, body: "no response from background script" };
      window.postMessage(
        { __dwc: true, type: "finalizeResult", id: d.id, ok: rr.ok, status: rr.status, body: rr.body },
        location.origin
      );
    });
  });
})();
