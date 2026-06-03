/**
 * Core router for the Forecasting Wizard frontend.
 * This file only handles global events and page routing.
 */

const getElement = (selector) => document.querySelector(selector);

function clearSessionState() {
  try {
    localStorage.removeItem('activeSessionForecast');
    localStorage.removeItem('activeSimulationData');
    sessionStorage.removeItem('activeSessionForecast');
    sessionStorage.removeItem('activeSimulationData');
    console.log('Session state cleared from all storage');
  } catch (e) {
    console.warn('Failed to clear session state:', e);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    const newChatButton = getElement('#newChatBtn');
    if (newChatButton) {
      newChatButton.addEventListener('click', (event) => {
        event.preventDefault();
        clearSessionState();
        window.location.href = '/';
      });
    }

    const pathname = window.location.pathname.split('/').pop() || 'index.html';
    const isDashboardPage = pathname === '' || pathname === 'index.html' || pathname === 'dashboard.html';

    if (isDashboardPage && typeof initDashboard === 'function') {
      initDashboard();
    }

    if (pathname === 'history.html' && typeof initHistory === 'function') {
      initHistory();
    }

    if (pathname === 'insights.html' && typeof initInsights === 'function') {
      initInsights();
    }
  } catch (error) {
    console.error('Core router failed to initialize:', error);
  }
});
