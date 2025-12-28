// options.js

document.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("api-key");
  const devModeCheckbox = document.getElementById("dev-mode");
  const saveBtn = document.getElementById("save-btn");
  const status = document.getElementById("status");

  // Optional buttons (we'll add them in options.html below)
  const resetFiltersBtn = document.getElementById("reset-filters-btn");
  const clearSavedBtn = document.getElementById("clear-saved-btn");

  // Load current values
  const stored = await chrome.storage.sync.get([
    "apiKey",       // old key name used by your existing options.js
    "groqApiKey",   // newer key name (future)
    "devMode",
    "isPro",
    "listPrefs",
    "savedItems"
  ]);

  // Prefer groqApiKey if present, else fallback to apiKey
  const currentKey = stored.groqApiKey || stored.apiKey || "";
  apiKeyInput.value = currentKey;

  devModeCheckbox.checked = !!stored.devMode;

  const showStatus = (msg, ok = true) => {
    status.textContent = msg;
    status.style.color = ok ? "green" : "crimson";
    setTimeout(() => (status.textContent = ""), 1400);
  };

  saveBtn.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    const devMode = devModeCheckbox.checked;

    // Save BOTH keys for compatibility (no break)
    const payload = {
      devMode,
      apiKey: key || "",      // keep old
      groqApiKey: key || ""   // keep new
    };

    await chrome.storage.sync.set(payload);

    // Optional: if you want Dev Mode to behave as Pro automatically:
    // (Your popup already treats devMode as pro in most versions)
    // await chrome.storage.sync.set({ isPro: devMode ? true : (stored.isPro || false) });

    showStatus("Saved ✅");
  });

  // Reset list filters (fixes "saved but not visible")
  resetFiltersBtn?.addEventListener("click", async () => {
    await chrome.storage.sync.set({
      listPrefs: {
        sort: "savedAt_desc",
        compact: false,
        minRating: "",
        maxReviews: "",
        minOpp: "",
        hideNoPrice: false,
        hideRange: false
      }
    });
    showStatus("Filters reset ✅");
  });

  // Clear saved items
  clearSavedBtn?.addEventListener("click", async () => {
    await chrome.storage.sync.set({ savedItems: [] });
    showStatus("Saved list cleared ✅");
  });
});
