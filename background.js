chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') console.log('Amazon Product Inspector installed!');
  if (details.reason === 'update') console.log('Amazon Product Inspector updated!');
});
