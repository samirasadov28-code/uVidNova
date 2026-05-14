/**
 * cost-calculator.js — browser-side mirror of scripts/compute-costs.js.
 * Renders the deterministic formula breakdown in the "Show working" panel.
 *
 * Formula:
 *   cost = unit_cost × heritage_premium × physical_quantity
 *          × destruction_factor × regional_multiplier × path_multiplier × contingency
 *
 * Numbers come from lookup tables; no AI involvement, no shortcuts.
 * Lookup tables are loaded once and cached in module scope.
 */

const DATA_BASE = '/data';
let _tables = null;

async function loadTables() {
  if (_tables) return _tables;
  const [unitCost, destructionFactors, regionalMultipliers, pathMultipliers] = await Promise.all([
    fetch(`${DATA_BASE}/unit_cost_table.json`).then(r => r.json()),
    fetch(`${DATA_BASE}/destruction_factors.json`).then(r => r.json()),
    fetch(`${DATA_BASE}/regional_multipliers.json`).then(r => r.json()),
    fetch(`${DATA_BASE}/path_multipliers.json`).then(r => r.json()),
  ]);
  const unitCostIndex = {};
  for (const row of unitCost) unitCostIndex[row.asset_type] = row;
  _tables = { unitCostIndex, destructionFactors, regionalMultipliers, pathMultipliers };
  return _tables;
}

function getPhysicalQty(asset, uc) {
  const specs = asset.physical_specs ?? {};
  const primary = uc.primary_spec_field;
  if (primary && specs[primary]?.value > 0) {
    return { value: specs[primary].value, field: primary };
  }
  for (const [k, s] of Object.entries(specs)) {
    if (typeof s?.value === 'number' && s.value > 0 && s.source !== 'pending_data') {
      return { value: s.value, field: k };
    }
  }
  return null;
}

function fmt(n) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function fmtM(n) {
  return `$${n}M`;
}

const PATH_LABELS = {
  baseline: 'Baseline',
  code_compliant: 'Code-compliant',
  build_back_better: 'Build-back-better',
};

/**
 * Render the full formula breakdown into `container`.
 * container should be the element shown/hidden by the "Show working" toggle.
 */
export async function renderCostWorking(asset, container) {
  if (!container) return;
  container.innerHTML = '<p class="calc-loading">Loading lookup tables…</p>';

  let tables;
  try {
    tables = await loadTables();
  } catch (e) {
    container.innerHTML = '<p class="calc-error">Could not load cost lookup tables.</p>';
    return;
  }

  const { unitCostIndex, destructionFactors, regionalMultipliers, pathMultipliers } = tables;

  const uc = unitCostIndex[asset.asset_type];
  if (!uc) {
    container.innerHTML = `<p class="calc-error">No unit-cost entry for asset type <code>${asset.asset_type}</code>.</p>`;
    return;
  }

  const qtyResult = getPhysicalQty(asset, uc);
  if (!qtyResult) {
    container.innerHTML = '<p class="calc-error">No usable physical quantity found in asset record.</p>';
    return;
  }

  const { value: qty, field: qtyField } = qtyResult;
  const destructionLevel = asset.damage?.destruction_level;
  const oblast = asset.location?.oblast;
  const lifecycle = asset.wartime_status?.lifecycle;

  const df = destructionFactors[destructionLevel];
  const rm = regionalMultipliers[oblast] ?? regionalMultipliers['default'];
  const contingency = lifecycle === 'documented' ? 1.25 : 1.15;

  if (!df) {
    container.innerHTML = `<p class="calc-error">Unknown destruction level: <code>${destructionLevel}</code>.</p>`;
    return;
  }

  const hpLow  = uc.heritage_premium_multiplier_low  ?? 1;
  const hpHigh = uc.heritage_premium_multiplier_high ?? 1;
  const hasHeritage = hpLow !== 1 || hpHigh !== 1;

  // Build inputs summary table
  let html = `
    <div class="calc-working">
      <h4>Formula</h4>
      <p class="calc-formula-text">
        <code>cost = unit_cost${hasHeritage ? ' × heritage_premium' : ''} × physical_quantity × destruction_factor × regional_multiplier × path_multiplier × contingency</code>
      </p>

      <h4>Inputs</h4>
      <table class="calc-table calc-inputs">
        <thead><tr><th>Parameter</th><th>Low end</th><th>High end</th><th>Source</th></tr></thead>
        <tbody>
          <tr>
            <td>Unit cost (<code>${uc.physical_unit}</code>)</td>
            <td>${fmt(uc.usd_per_unit_low)} USD</td>
            <td>${fmt(uc.usd_per_unit_high)} USD</td>
            <td>${uc.source_code} (${uc.vintage_year})</td>
          </tr>`;

  if (hasHeritage) {
    html += `
          <tr>
            <td>Heritage premium</td>
            <td>${fmt(hpLow)}×</td>
            <td>${fmt(hpHigh)}×</td>
            <td>RDNA3 conservation premium table</td>
          </tr>`;
  }

  html += `
          <tr>
            <td>Physical quantity (<code>${qtyField}</code>)</td>
            <td colspan="2">${fmt(qty)} ${uc.physical_unit}</td>
            <td>${asset.physical_specs?.[qtyField]?.ref ?? '—'}</td>
          </tr>
          <tr>
            <td>Destruction factor (<code>${destructionLevel}</code>)</td>
            <td>${df.low}×</td>
            <td>${df.high}×</td>
            <td>RDNA3 §4 damage typology</td>
          </tr>
          <tr>
            <td>Regional multiplier (<code>${oblast ?? 'default'}</code>)</td>
            <td>${rm?.low ?? '—'}×</td>
            <td>${rm?.high ?? '—'}×</td>
            <td>RDNA3 Annex B regional cost variation</td>
          </tr>
          <tr>
            <td>Contingency (<code>${lifecycle}</code>)</td>
            <td colspan="2">${contingency}×</td>
            <td>15% for assessed; 25% for documented-only</td>
          </tr>
        </tbody>
      </table>

      <h4>Computed cost paths</h4>
      <table class="calc-table calc-paths">
        <thead>
          <tr>
            <th>Path</th>
            <th>Path multiplier</th>
            <th>Low (USD M)</th>
            <th>Central (USD M)</th>
            <th>High (USD M)</th>
          </tr>
        </thead>
        <tbody>`;

  for (const path of ['baseline', 'code_compliant', 'build_back_better']) {
    const pm = pathMultipliers[path];
    if (!pm || !rm) continue;

    const low     = (uc.usd_per_unit_low  * qty * hpLow  * df.low  * rm.low  * pm.low  * contingency) / 1_000_000;
    const high    = (uc.usd_per_unit_high * qty * hpHigh * df.high * rm.high * pm.high * contingency) / 1_000_000;
    const central = (low + high) / 2;

    const stored = asset.cost_paths?.[path];
    const mismatch = stored && (
      Math.abs(Math.round(low)     - stored.low_usd_m)     > 1 ||
      Math.abs(Math.round(central) - stored.central_usd_m) > 1 ||
      Math.abs(Math.round(high)    - stored.high_usd_m)    > 1
    );

    html += `
          <tr${mismatch ? ' class="calc-mismatch"' : ''}>
            <td>${PATH_LABELS[path]}</td>
            <td>${pm.low}× – ${pm.high}×</td>
            <td>${fmtM(Math.round(low))}</td>
            <td><strong>${fmtM(Math.round(central))}</strong></td>
            <td>${fmtM(Math.round(high))}</td>
          </tr>`;
  }

  html += `
        </tbody>
      </table>
      <p class="calc-disclaimer">
        Figures are estimates derived from RDNA3 unit-cost benchmarks and named multiplier tables.
        They are not procurement quotes. Central value = arithmetic mean of low and high.
      </p>
    </div>`;

  container.innerHTML = html;
}

/**
 * Wire up a "Show working" toggle button.
 * `btn` — the button element. `panel` — the container to show/hide.
 * `asset` — the parsed asset JSON object.
 */
export function wireShowWorking(btn, panel, asset) {
  if (!btn || !panel) return;
  let loaded = false;
  btn.addEventListener('click', () => {
    const open = panel.hidden === false;
    if (open) {
      panel.hidden = true;
      btn.textContent = 'Show working';
    } else {
      panel.hidden = false;
      btn.textContent = 'Hide working';
      if (!loaded) {
        loaded = true;
        renderCostWorking(asset, panel);
      }
    }
  });
}
