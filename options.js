document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key');
  const devModeInput = document.getElementById('dev-mode');
  const status = document.getElementById('status');

  const stored = await chrome.storage.sync.get(['apiKey', 'devMode']);
  apiKeyInput.value = stored.apiKey || '';
  devModeInput.checked = !!stored.devMode;

  document.getElementById('save-btn').addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const devMode = devModeInput.checked;

    chrome.storage.sync.set({ apiKey, devMode }, () => {
      status.textContent = 'Saved!';
      setTimeout(() => status.textContent = '', 2000);
    });
  });
});
