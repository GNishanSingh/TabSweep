const patternsEl = document.getElementById('patterns');
const statusEl = document.getElementById('status');
const errorsEl = document.getElementById('errors');
const saveBtn = document.getElementById('save');
const modeImmediateEl = document.getElementById('mode-immediate');
const modeIdleEl = document.getElementById('mode-idle');
const delayEl = document.getElementById('delay');
const closeOnClickEl = document.getElementById('close-on-click');

const DEFAULT_DELAY = 30;

function setStatus(text = '') {
  statusEl.textContent = text;
}

function setErrors(text = '') {
  errorsEl.textContent = text;
}

function validateLines(lines) {
  const valid = [];
  const invalid = [];
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      // eslint-disable-next-line no-new
      new RegExp(trimmed);
      valid.push(trimmed);
    } catch (err) {
      invalid.push(`Line ${idx + 1}: ${trimmed}\n  ${err.message}`);
    }
  });
  return { valid, invalid };
}

function validateInput() {
  const lines = patternsEl.value.split(/\r?\n/);
  const { valid, invalid } = validateLines(lines);
  setErrors(invalid.join('\n'));
  saveBtn.disabled = invalid.length > 0;
  saveBtn.title = invalid.length ? 'Fix regex errors before saving' : 'Save patterns';
  return { valid, invalid };
}

function selectedMode() {
  const choice = document.querySelector('input[name="mode"]:checked');
  return choice ? choice.value : 'immediate';
}

function applyMode(mode) {
  if (mode === 'idle') {
    modeIdleEl.checked = true;
  } else {
    modeImmediateEl.checked = true;
  }
}

applyMode('immediate');
delayEl.value = DEFAULT_DELAY;
closeOnClickEl.checked = false;

function save() {
  const { valid, invalid } = validateInput();
  if (invalid.length) {
    setStatus('Fix regex errors above before saving.');
    return;
  }
  const mode = selectedMode();
  const delaySeconds = Number(delayEl.value) || DEFAULT_DELAY;
  if (mode === 'idle' && (!Number.isFinite(delaySeconds) || delaySeconds <= 0)) {
    setErrors('');
    setStatus('Idle delay must be a positive number of seconds.');
    return;
  }
  const closeOnClick = closeOnClickEl.checked;
  chrome.storage.sync.set({ patterns: valid, mode, delaySeconds, closeOnClick }, () => {
    setStatus('Saved! Patterns applied.');
    setTimeout(() => setStatus(''), 2200);
  });
}

function restore() {
  chrome.storage.sync.get(
    { patterns: [], mode: 'immediate', delaySeconds: DEFAULT_DELAY, closeOnClick: false },
    ({ patterns, mode, delaySeconds, closeOnClick }) => {
      patternsEl.value = (patterns || []).join('\n');
      applyMode(mode);
      delayEl.value = delaySeconds || DEFAULT_DELAY;
      closeOnClickEl.checked = Boolean(closeOnClick);
      validateInput();
    }
  );
}

saveBtn.addEventListener('click', save);
patternsEl.addEventListener('input', () => {
  setStatus('');
  validateInput();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', restore);
} else {
  restore();
}
