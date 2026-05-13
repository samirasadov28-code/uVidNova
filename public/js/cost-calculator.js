/**
 * cost-calculator.js — UI mirror of scripts/compute-costs.js.
 * Displays the deterministic formula breakdown when a user clicks "Show working".
 * Same arithmetic as the server script; no AI involvement, no shortcuts.
 *
 * At Weekend 1 this is a stub — the lookup tables do not yet exist.
 * The "Show working" section will display pending_methodology if cost_paths flag is set.
 */

export function renderCostCalculator(asset, container) {
  if (!container) return;

  const pending = asset.cost_paths?.pending_methodology;

  if (pending) {
    container.innerHTML = `
      <div class="calc-pending">
        <p><strong>Cost methodology pending.</strong> Unit-cost table is being populated in Weekend 2.
        Figures shown are illustrative placeholders.</p>
        <p>Formula: <code>cost = unit_cost × physical_quantity × destruction_factor × regional_multiplier × path_multiplier × contingency</code></p>
        <p>Sources: RDNA3 (World Bank), KSE Institute, EBRD case studies.</p>
      </div>`;
    return;
  }

  const paths = ['baseline', 'code_compliant', 'build_back_better'];
  const pathLabels = {
    baseline: 'Baseline (pre-war standard)',
    code_compliant: 'Code-compliant (current EU/UA codes)',
    build_back_better: 'Build-back-better (with technology overlays)'
  };

  let html = '<div class="calc-working">';
  html += `<p class="calc-formula">Formula: <code>cost = unit_cost × physical_quantity × destruction_factor × regional_multiplier × path_multiplier × contingency</code></p>`;
  html += '<table class="calc-table"><thead><tr><th>Path</th><th>Low (USD M)</th><th>Central (USD M)</th><th>High (USD M)</th></tr></thead><tbody>';

  for (const path of paths) {
    const t = asset.cost_paths?.[path];
    if (!t) continue;
    html += `<tr>
      <td>${pathLabels[path]}</td>
      <td>${t.low_usd_m}</td>
      <td><strong>${t.central_usd_m}</strong></td>
      <td>${t.high_usd_m}</td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;
}
