// background.js (MV3 service worker)

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    if (details.reason === "install") {
      console.log("Amazon Product Inspector installed!");

      // Initialize default storage values
      const existing = await chrome.storage.sync.get([
        "savedItems",
        "listPrefs",
        "usageDate",
        "usageCount",
        "isPro",
        "devMode",
        "groqApiKey"
      ]);

      const set = {};

      if (!Array.isArray(existing.savedItems)) set.savedItems = [];
      if (!existing.listPrefs) {
        set.listPrefs = {
          sort: "savedAt_desc",
          compact: false,
          minRating: "",
          maxReviews: "",
          minOpp: "",
          hideNoPrice: false,
          hideRange: false
        };
      }
      if (typeof existing.usageCount !== "number") set.usageCount = 0;
      if (typeof existing.isPro !== "boolean") set.isPro = false;
      if (typeof existing.devMode !== "boolean") set.devMode = false;

      if (Object.keys(set).length) {
        await chrome.storage.sync.set(set);
      }
    }

    if (details.reason === "update") {
      console.log("Amazon Product Inspector updated!");
      // Optional: migration logic if you change storage format later
    }
  } catch (e) {
    console.warn("onInstalled init failed:", e);
  }
});

// (Optional) Keep service worker alive briefly when messages come in
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "PING") {
    sendResponse({ ok: true });
  }
});
