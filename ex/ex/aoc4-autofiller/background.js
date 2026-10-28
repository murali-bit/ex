importScripts('js/storage.js');

chrome.runtime.onInstalled.addListener(() => {
  console.log('AOC-4 Auto Filler installed');
});

chrome.runtime.onMessage.addListener((req, _sender, send) => {
  if (req.action === 'logAction') {
    Storage.saveLogs(req.data || {}).then(() => send({ ok: true }));
    return true;
  }
});
