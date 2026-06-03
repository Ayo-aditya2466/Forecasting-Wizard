/**
 * Insights Engine for the executive insights page.
 * Reads active simulation data and updates the insights UI.
 */

function initInsights() {
  try {
    const contentEl = document.getElementById('executiveStrategyContent');
    const riskBadge = document.getElementById('riskPriorityBadge');
    const actionBadge = document.getElementById('suggestedActionBadge');

    if (!contentEl && !riskBadge && !actionBadge) {
      return;
    }

    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('activeSimulationData'));
    } catch (_error) {
      saved = null;
    }

    const hasSimulation = saved && Array.isArray(saved.labels) && Array.isArray(saved.barValues) && saved.barValues.length > 0;

    if (!hasSimulation) {
      if (contentEl) {
        contentEl.textContent = 'No active simulation data found. Execute a fresh forecast simulation from the Home workspace to compile automated tactical recommendations.';
      }
      if (riskBadge) {
        riskBadge.textContent = 'No active risk status available.';
      }
      if (actionBadge) {
        actionBadge.textContent = 'No suggested action yet. Run a forecast to surface recommendations.';
      }
      return;
    }

    const recommendationText = saved.insights || saved.summary || `Simulation includes ${saved.labels.length} forecast periods.`;
    const riskValue = Number(saved.risk) || 30;
    const priority = riskValue >= 60 ? 'Elevated' : riskValue >= 40 ? 'Moderate' : 'Low';

    if (contentEl) {
      contentEl.textContent = recommendationText;
    }

    if (riskBadge) {
      riskBadge.textContent = `Risk Priority: ${priority} (${riskValue}%).`;
    }

    if (actionBadge) {
      actionBadge.textContent = riskValue >= 60
        ? 'Suggested Action: Increase contingency reserves and stress-test supply chains.'
        : 'Suggested Action: Continue monitoring market momentum and execute with prudent agility.';
    }
  } catch (error) {
    console.error('initInsights failed', error);
  }
}
