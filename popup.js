const runBtn = document.getElementById('run');
const statusEl = document.getElementById('status');
const errorsEl = document.getElementById('errors');
const metaEl = document.getElementById('meta');
const openOptionsEl = document.getElementById('open-options');

function showMessage(text, isError = false) {
  statusEl.textContent = isError ? '' : text;
  errorsEl.textContent = isError ? text : '';
}

function refreshMeta() {
  chrome.storage.sync.get({ patterns: [], mode: 'immediate', delaySeconds: 30 }, ({ patterns, mode, delaySeconds }) => {
    metaEl.textContent = `Patterns: ${patterns.length} • Mode: ${mode}${mode === 'idle' ? ` (${delaySeconds}s)` : ''}`;
  });
}

function runNow() {
  showMessage('Running...');
  chrome.runtime.sendMessage({ type: 'run-scan' }, (response) => {
    if (chrome.runtime.lastError) {
      showMessage(chrome.runtime.lastError.message || 'Failed', true);
      return;
    }
    if (response && response.ok) {
      showMessage('Scan triggered');
      setTimeout(() => showMessage(''), 1500);
    } else {
      showMessage(response?.error || 'Failed', true);
    }
  });
}

runBtn.addEventListener('click', runNow);
openOptionsEl.addEventListener('click', (e) => {
  e.preventDefault();
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});

document.addEventListener('DOMContentLoaded', () => {
  refreshMeta();
});
