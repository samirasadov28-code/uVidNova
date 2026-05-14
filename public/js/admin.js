/**
 * admin.js — uVidNova Asset Orchestrator UI
 *
 * Owner-only admin page logic:
 *  - Password gate (simple string compare — convenience gate, not a real auth system;
 *    this tool is never linked from the public UI and is intended for owner use only)
 *  - Stage 1: POST to /api/classify → render classification JSON
 *  - Stage 2: POST to /api/narrate → render narration + payload, enable download
 *
 * ES module. No transpilation. Targets Node 20 / evergreen browsers.
 */

// ── Constants ──────────────────────────────────────────────────────────────────

// Owner-only convenience gate. Not a production authentication system.
// The admin page is never linked from the public UI.
const ADMIN_PASSWORD = 'uvidnova-admin-2026';

const API_CLASSIFY = '/api/classify';
const API_NARRATE  = '/api/narrate';

// ── State ──────────────────────────────────────────────────────────────────────

/** @type {object|null} The classification object returned by Stage 1. */
let classificationResult = null;

/** @type {object|null} The full asset payload returned by Stage 2. */
let assetPayload = null;

// ── DOM refs ───────────────────────────────────────────────────────────────────

const adminGate        = document.getElementById('adminGate');
const adminUI          = document.getElementById('adminUI');
const adminPassword    = document.getElementById('adminPassword');
const adminEnterBtn    = document.getElementById('adminEnterBtn');
const adminGateError   = document.getElementById('adminGateError');

const classifyBtn      = document.getElementById('classifyBtn');
const classifySpinner  = document.getElementById('classifySpinner');
const stage1Error      = document.getElementById('stage1Error');
const stage1ErrorMsg   = document.getElementById('stage1ErrorMsg');
const stage1Output     = document.getElementById('stage1Output');
const stage1Pre        = document.getElementById('stage1Pre');
const copyClassification = document.getElementById('copyClassification');

const narrateBtn       = document.getElementById('narrateBtn');
const narrateSpinner   = document.getElementById('narrateSpinner');
const stage2Section    = document.getElementById('stage2Section');
const stage2LockedBadge = document.getElementById('stage2LockedBadge');
const stage2Error      = document.getElementById('stage2Error');
const stage2ErrorMsg   = document.getElementById('stage2ErrorMsg');
const humanReviewBlock = document.getElementById('humanReviewBlock');
const unmatchedTokensPre = document.getElementById('unmatchedTokensPre');
const stage2Output     = document.getElementById('stage2Output');
const narrativeText    = document.getElementById('narrativeText');
const stage2Pre        = document.getElementById('stage2Pre');
const copyAssetJson    = document.getElementById('copyAssetJson');
const downloadAssetJson = document.getElementById('downloadAssetJson');

// ── Password gate ──────────────────────────────────────────────────────────────

function checkPassword() {
  const entered = adminPassword.value;
  // Simple string compare — owner-only convenience gate, not a production auth system.
  if (entered === ADMIN_PASSWORD) {
    adminGate.hidden = true;
    adminUI.hidden = false;
    adminGateError.hidden = true;
  } else {
    adminGateError.hidden = false;
    adminPassword.value = '';
    adminPassword.focus();
  }
}

adminEnterBtn.addEventListener('click', checkPassword);
adminPassword.addEventListener('keydown', e => {
  if (e.key === 'Enter') checkPassword();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function showError(errorEl, msgEl, message) {
  msgEl.textContent = message;
  errorEl.hidden = false;
}

function clearError(errorEl) {
  errorEl.hidden = true;
}

function setLoading(btn, spinner, loading) {
  btn.disabled = loading;
  spinner.hidden = !loading;
}

/**
 * Copy text to clipboard with graceful fallback.
 * @param {string} text
 * @param {HTMLButtonElement} btn - button to flash feedback on
 */
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch {
    // Fallback for environments where clipboard API is unavailable
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }
}

/**
 * Trigger a JSON file download in the browser.
 * @param {string} json - JSON string to download
 * @param {string} filename - suggested filename
 */
function downloadJson(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay to allow the download to start
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Derive a suggested filename from the asset payload or classification.
 * Falls back to a timestamp-based name.
 * @param {object} payload
 * @returns {string}
 */
function suggestFilename(payload) {
  const id = payload?.asset_id
    || payload?.classification?.asset_id
    || null;
  if (id) return `${id}.json`;
  return `asset_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`;
}

// ── Stage 1: Classify ──────────────────────────────────────────────────────────

classifyBtn.addEventListener('click', async () => {
  const description      = document.getElementById('inputDescription').value.trim();
  const sourcesRaw       = document.getElementById('inputSources').value.trim();
  const location_hint    = document.getElementById('inputLocation').value.trim();
  const photo_description = document.getElementById('inputPhoto').value.trim();

  if (!description) {
    showError(stage1Error, stage1ErrorMsg, 'Asset description is required.');
    return;
  }

  const sources = sourcesRaw
    ? sourcesRaw.split('\n').map(s => s.trim()).filter(Boolean)
    : [];

  clearError(stage1Error);
  stage1Output.hidden = true;
  // Reset Stage 2 state when re-classifying
  resetStage2();
  setLoading(classifyBtn, classifySpinner, true);

  try {
    const response = await fetch(API_CLASSIFY, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ description, sources, location_hint, photo_description }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    classificationResult = data.classification ?? data;
    const pretty = JSON.stringify(classificationResult, null, 2);

    stage1Pre.textContent = pretty;
    stage1Output.hidden = false;

    // Unlock Stage 2
    unlockStage2();

  } catch (err) {
    showError(stage1Error, stage1ErrorMsg, err.message || 'Unknown error from /api/classify.');
  } finally {
    setLoading(classifyBtn, classifySpinner, false);
  }
});

copyClassification.addEventListener('click', () => {
  if (classificationResult) {
    copyToClipboard(JSON.stringify(classificationResult, null, 2), copyClassification);
  }
});

// ── Stage 2: Narrate ───────────────────────────────────────────────────────────

function unlockStage2() {
  narrateBtn.disabled = false;
  stage2Section.classList.remove('admin-section-locked');
  stage2Section.removeAttribute('aria-disabled');
  stage2LockedBadge.hidden = true;
}

function resetStage2() {
  classificationResult = null;
  assetPayload = null;
  narrateBtn.disabled = true;
  stage2Section.classList.add('admin-section-locked');
  stage2Section.setAttribute('aria-disabled', 'true');
  stage2LockedBadge.hidden = false;
  stage2Output.hidden = true;
  clearError(stage2Error);
  humanReviewBlock.hidden = true;
}

narrateBtn.addEventListener('click', async () => {
  if (!classificationResult) {
    showError(stage2Error, stage2ErrorMsg, 'No classification available. Run Stage 1 first.');
    return;
  }

  clearError(stage2Error);
  stage2Output.hidden = true;
  humanReviewBlock.hidden = true;
  setLoading(narrateBtn, narrateSpinner, true);

  try {
    const response = await fetch(API_NARRATE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ asset: classificationResult }),
    });

    const data = await response.json();

    // Validation-gate failure: server returns humanReview: true with unmatchedTokens
    if (data.humanReview === true) {
      showError(
        stage2Error,
        stage2ErrorMsg,
        data.error || 'Validation gate failed — narration contains numeric tokens absent from the payload.'
      );
      if (data.unmatchedTokens?.length) {
        unmatchedTokensPre.textContent = JSON.stringify(data.unmatchedTokens, null, 2);
        humanReviewBlock.hidden = false;
      }
      return;
    }

    if (!response.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    assetPayload = data.payload ?? classificationResult;
    const narration = data.narration ?? '';
    const payloadJson = JSON.stringify(assetPayload, null, 2);

    // Render narration prose
    narrativeText.textContent = narration;

    // Render payload JSON
    stage2Pre.textContent = payloadJson;
    stage2Output.hidden = false;

  } catch (err) {
    showError(stage2Error, stage2ErrorMsg, err.message || 'Unknown error from /api/narrate.');
  } finally {
    setLoading(narrateBtn, narrateSpinner, false);
  }
});

copyAssetJson.addEventListener('click', () => {
  if (assetPayload) {
    copyToClipboard(JSON.stringify(assetPayload, null, 2), copyAssetJson);
  }
});

downloadAssetJson.addEventListener('click', () => {
  if (assetPayload) {
    const json = JSON.stringify(assetPayload, null, 2);
    downloadJson(json, suggestFilename(assetPayload));
  }
});
