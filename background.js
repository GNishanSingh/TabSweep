// Auto-close tabs when their URL matches any user-specified regular expression.
const state = {
  patterns: [],
  regexes: [],
  mode: 'immediate', // 'immediate' | 'idle'
  delaySeconds: 30,
  closeOnClick: false
};

// Track pending timers per tab when running in idle mode.
const timers = new Map();

// Load configuration from storage at startup.
chrome.storage.sync.get(
  { patterns: [], mode: 'immediate', delaySeconds: 30, closeOnClick: false },
  (config) => {
    applyConfig(config);
  }
);

// Keep configuration in sync when options change.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  const next = {
    patterns: changes.patterns ? changes.patterns.newValue : state.patterns,
    mode: changes.mode ? changes.mode.newValue : state.mode,
    delaySeconds: changes.delaySeconds
      ? changes.delaySeconds.newValue
      : state.delaySeconds,
    closeOnClick: changes.closeOnClick
      ? changes.closeOnClick.newValue
      : state.closeOnClick
  };
  applyConfig(next);
});

function applyConfig({ patterns, mode, delaySeconds, closeOnClick }) {
  clearAllTimers();
  updatePatterns(patterns);
  updateSettings(mode, delaySeconds, closeOnClick);
}

function updatePatterns(patterns) {
  state.patterns = Array.isArray(patterns) ? patterns : [];
  state.regexes = state.patterns
    .map((pattern) => {
      try {
        return new RegExp(pattern);
      } catch (err) {
        console.warn('Invalid regex ignored:', pattern, err);
        return null;
      }
    })
    .filter(Boolean);
}

function updateSettings(mode, delaySeconds, closeOnClick) {
  state.mode = mode === 'idle' ? 'idle' : 'immediate';
  const parsed = Number(delaySeconds);
  state.delaySeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  state.closeOnClick = Boolean(closeOnClick);
}

function shouldClose(tab) {
  if (!tab || tab.pinned) return false;
  const url = tab.url || '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  return state.regexes.some((rx) => rx.test(url));
}

function closeTab(tabId) {
  chrome.tabs.remove(tabId, () => {
    if (chrome.runtime.lastError) {
      console.warn('Failed to close tab', tabId, chrome.runtime.lastError);
    }
  });
}

function clearTimer(tabId) {
  const timer = timers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(tabId);
  }
}

function clearAllTimers() {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
}

function scheduleIdleClose(tabId) {
  if (timers.has(tabId)) return; // already scheduled
  const delayMs = state.delaySeconds * 1000;

  const tick = async () => {
    const latest = await chrome.tabs.get(tabId).catch(() => null);
    if (!latest || !shouldClose(latest)) {
      timers.delete(tabId);
      return;
    }
    if (latest.active) {
      // Keep waiting until the tab is inactive.
      const retry = setTimeout(tick, delayMs);
      timers.set(tabId, retry);
      return;
    }
    timers.delete(tabId);
    closeTab(tabId);
  };

  const timer = setTimeout(tick, delayMs);
  timers.set(tabId, timer);
}

async function handleTab(tabId, changeInfo, tab) {
  // When changeInfo.url is present, prefer it; otherwise tab.url.
  const currentTab = tab || (await chrome.tabs.get(tabId).catch(() => null));
  if (!currentTab) return;

  if (!shouldClose(currentTab)) {
    clearTimer(tabId);
    return;
  }

  if (state.mode === 'immediate') {
    closeTab(tabId);
    return;
  }

  // Idle mode: wait for configured delay, then close if still matching and not active.
  scheduleIdleClose(tabId);
}

chrome.tabs.onCreated.addListener((tab) => handleTab(tab.id, {}, tab));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'complete') return;
  handleTab(tabId, changeInfo, tab);
});

// Manual trigger from popup to scan all tabs with current rules.
async function runScanAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    await handleTab(tab.id, {}, tab);
  }
}

// Cleanup timers when tabs are removed.
chrome.tabs.onRemoved.addListener((tabId) => clearTimer(tabId));

// If a matching tab is clicked/activated and the option is enabled, close it immediately.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (!state.closeOnClick) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (shouldClose(tab)) {
    clearTimer(tabId);
    closeTab(tabId);
  }
});

// Listen for popup commands.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'run-scan') {
    runScanAllTabs()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message }));
    return true; // keep the message channel open for async response
  }
  return false;
});
