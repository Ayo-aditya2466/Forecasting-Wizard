/**
 * Dashboard engine for both the home page and analytics dashboard.
 * The analytics dashboard fetches an async payload and only renders charts after the
 * backend payload transitions from null/undefined to valid values.
 */
function initDashboard() {
  try {
    const lineCanvas = document.getElementById('trendChart');
    const dashboardLineCanvas = document.getElementById('dashboardLineChart');
    const barCanvas = document.getElementById('dashboardBarChart');
    const radarCanvas = document.getElementById('dashboardRadarChart');

    const defaultLabels = (count) => Array.from({ length: count }, (_, index) => `Q${index + 1}`);
    const radarLabels = ['Demand Volatility', 'Supplier Risk', 'Production Resilience', 'Market Uncertainty'];

    const createChart = (ctx, config) => {
      if (!ctx) return null;
      return new Chart(ctx, config);
    };

    const safeNumberArray = (value) => {
      if (!Array.isArray(value)) return [];
      return value.map((item) => {
        const numeric = Number(item);
        return Number.isFinite(numeric) ? numeric : 0;
      });
    };

    const buildDashboardLineConfig = (labels, values) => ({
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Trend Analysis',
            data: values,
            borderColor: '#0f766e',
            backgroundColor: 'rgba(15,118,110,0.2)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: '#14b8a6'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(148,163,184,0.18)' } },
          y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(148,163,184,0.18)' }, beginAtZero: true }
        }
      }
    });

    const buildDashboardBarConfig = (labels, values) => ({
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Actual vs Predicted',
            data: values,
            backgroundColor: 'rgba(59,130,246,0.72)',
            borderColor: 'rgba(59,130,246,0.95)',
            borderWidth: 1,
            hoverBackgroundColor: 'rgba(59,130,246,0.9)'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { ticks: { color: '#cbd5e1' }, grid: { display: false } },
          y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(148,163,184,0.18)' }, beginAtZero: true }
        }
      }
    });

    const buildDashboardRadarConfig = (labels, values) => ({
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            label: 'Risk Profile',
            data: values,
            borderColor: '#f97316',
            backgroundColor: 'rgba(249,115,22,0.2)',
            pointBackgroundColor: '#fb923c',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: '#f97316'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1' } }
        },
        scales: {
          r: {
            angleLines: { color: 'rgba(148,163,184,0.24)' },
            grid: { color: 'rgba(148,163,184,0.18)' },
            pointLabels: { color: '#cbd5e1' },
            ticks: { display: false }
          }
        }
      }
    });

    const dashboardLineCtx = dashboardLineCanvas ? dashboardLineCanvas.getContext('2d') : null;
    const dashboardBarCtx = barCanvas ? barCanvas.getContext('2d') : null;
    const dashboardRadarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;

    let dashboardLineChart = null;
    let dashboardBarChart = null;
    let dashboardRadarChart = null;

    const initializeDashboardCharts = () => {
      if (dashboardLineCtx && !dashboardLineChart) {
        dashboardLineChart = createChart(dashboardLineCtx, buildDashboardLineConfig([], []));
      }
      if (dashboardBarCtx && !dashboardBarChart) {
        dashboardBarChart = createChart(dashboardBarCtx, buildDashboardBarConfig([], []));
      }
      if (dashboardRadarCtx && !dashboardRadarChart) {
        dashboardRadarChart = createChart(dashboardRadarCtx, buildDashboardRadarConfig(radarLabels, []));
      }
    };

    const updateDashboardCharts = (barValues, radarValues) => {
      const labels = defaultLabels(barValues.length);

      if (dashboardLineChart) {
        dashboardLineChart.data.labels = labels;
        dashboardLineChart.data.datasets = buildDashboardLineConfig(labels, barValues).data.datasets;
        dashboardLineChart.update();
      }

      if (dashboardBarChart) {
        dashboardBarChart.data.labels = labels;
        dashboardBarChart.data.datasets = buildDashboardBarConfig(labels, barValues).data.datasets;
        dashboardBarChart.update();
      }

      if (dashboardRadarChart) {
        dashboardRadarChart.data.labels = radarLabels.slice(0, radarValues.length);
        dashboardRadarChart.data.datasets = buildDashboardRadarConfig(radarLabels.slice(0, radarValues.length), radarValues).data.datasets;
        dashboardRadarChart.update();
      }
    };

    const loadSessionState = () => {
      try {
        // Try sessionStorage first (active session), then localStorage (persistent)
        let stored = sessionStorage.getItem('activeSessionForecast');
        if (!stored) stored = localStorage.getItem('activeSessionForecast');
        if (!stored) return null;
        
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.barValues) && Array.isArray(parsed.radarValues)) {
          return parsed;
        }
        return null;
      } catch (e) {
        console.warn('Failed to restore session state:', e);
        return null;
      }
    };

    const loadDashboardPayload = async () => {
      try {
        // Check for stored session state first
        const storedState = loadSessionState();
        if (storedState && storedState.barValues && storedState.radarValues) {
          console.log('Restoring dashboard from session state');
          updateDashboardCharts(storedState.barValues, storedState.radarValues);
          return;
        }

        // If no session state, fetch fresh payload
        const initPayload = { prompt: '' };
        const response = await fetch('/api/forecast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(initPayload)
        });

        if (!response.ok) {
          throw new Error(`Dashboard payload fetch failed with status ${response.status}`);
        }

        const payload = await response.json();
        const barValues = safeNumberArray(payload.barValues);
        const radarValues = safeNumberArray(payload.radarValues);

        if (!barValues.length || !radarValues.length) {
          throw new Error('Dashboard payload missing required values.');
        }

        updateDashboardCharts(barValues, radarValues);
      } catch (err) {
        console.error('Dashboard payload load failed:', err);
      }
    };

    const initHomePage = () => {
      if (!lineCanvas) return;

      const promptInput = document.getElementById('forecastPrompt');
      const runButton = document.getElementById('runAnalysisBtn');
      if (!promptInput || !runButton) return;

      const ctx = lineCanvas.getContext('2d');
      if (!ctx) return;

      const chart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { color: '#334155' } } },
          scales: {
            x: { ticks: { color: '#475569' }, grid: { color: 'rgba(148,163,184,0.18)' } },
            y: { ticks: { color: '#475569' }, grid: { color: 'rgba(148,163,184,0.18)' }, beginAtZero: true }
          },
          elements: { line: { cubicInterpolationMode: 'monotone' } }
        }
      });

      const buildDatasets = (values = []) => {
        const baseline = values.map((value) => Number(value) || 0);
        const optimistic = baseline.map((value) => Number((value * 1.15).toFixed(2)));
        const pessimistic = baseline.map((value) => Number((value * 0.85).toFixed(2)));

        return [
          {
            label: 'Baseline',
            data: baseline,
            borderColor: '#0f766e',
            backgroundColor: 'rgba(15,118,110,0.16)',
            fill: false,
            tension: 0.4,
            cubicInterpolationMode: 'monotone'
          },
          {
            label: 'Optimistic',
            data: optimistic,
            borderColor: '#16a34a',
            backgroundColor: 'rgba(16,163,127,0.12)',
            fill: '-1',
            tension: 0.4,
            cubicInterpolationMode: 'monotone'
          },
          {
            label: 'Pessimistic',
            data: pessimistic,
            borderColor: '#dc2626',
            backgroundColor: 'rgba(239,68,68,0.1)',
            fill: '-2',
            borderDash: [6, 4],
            tension: 0.4,
            cubicInterpolationMode: 'monotone'
          }
        ];
      };

      const updateChart = (labels, values) => {
        chart.data.labels = labels;
        chart.data.datasets = buildDatasets(values);
        chart.update();
      };

      const safeSave = (payload) => {
        try {
          const stored = {
            prompt: payload.prompt,
            labels: payload.labels || [],
            barValues: Array.isArray(payload.barValues) ? payload.barValues : [],
            radarValues: Array.isArray(payload.radarValues) ? payload.radarValues : [],
            summary: payload.summary || '',
            insights: payload.insights || '',
            timestamp: new Date().toISOString()
          };
          
          // Save to both sessionStorage and localStorage for redundancy
          localStorage.setItem('activeSessionForecast', JSON.stringify(stored));
          sessionStorage.setItem('activeSessionForecast', JSON.stringify(stored));
          console.log('Analysis saved to storage:', stored);
        } catch (error) {
          console.warn('Unable to persist session forecast state', error);
        }
      };

      const loadSavedData = () => {
        try {
          // Try sessionStorage first, then localStorage
          let raw = sessionStorage.getItem('activeSessionForecast');
          if (!raw) raw = localStorage.getItem('activeSessionForecast');
          if (!raw) return null;
          return JSON.parse(raw);
        } catch (_error) {
          return null;
        }
      };

      const restoreHomePageState = () => {
        try {
          const saved = loadSavedData();
          if (saved && saved.prompt) {
            promptInput.value = saved.prompt;
            console.log('Restored prompt text to Home page:', saved.prompt);
          }
        } catch (e) {
          console.warn('Failed to restore prompt text:', e);
        }
      };

      const renderSavedChart = () => {
        const saved = loadSavedData();
        if (!saved || !Array.isArray(saved.barValues) || saved.barValues.length === 0) {
          return;
        }
        const labels = Array.isArray(saved.labels) && saved.labels.length ? saved.labels : defaultLabels(saved.barValues.length);
        updateChart(labels, saved.barValues);
      };

      const fetchForecast = async () => {
        const prompt = String(promptInput.value || '').trim();
        if (!prompt) {
          return;
        }

        try {
          const response = await fetch('/api/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
          });

          if (!response.ok) {
            throw new Error(`Forecast API returned ${response.status}`);
          }

          const data = await response.json();
          const barValues = safeNumberArray(data.barValues);
          const radarValues = safeNumberArray(data.radarValues);
          const labels = Array.isArray(data.labels) && data.labels.length ? data.labels : defaultLabels(barValues.length);

          if (!barValues.length) {
            throw new Error('Received empty forecast data from backend.');
          }

          updateChart(labels, barValues);
          safeSave({ 
            prompt, 
            labels, 
            barValues, 
            radarValues: radarValues.length > 0 ? radarValues : [50.0, 40.0, 45.0, 50.0],
            summary: data.summary || '', 
            insights: data.insights || '' 
          });
        } catch (error) {
          console.error('Dashboard forecast failed', error);
        }
      };

      runButton.addEventListener('click', async (event) => {
        event.preventDefault();
        await fetchForecast();
      });

      promptInput.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          await fetchForecast();
        }
      });

      // Restore home page state on load
      restoreHomePageState();
      renderSavedChart();
    };

    if (dashboardLineCanvas || barCanvas || radarCanvas) {
      initializeDashboardCharts();
      loadDashboardPayload();
    }

    if (lineCanvas && !dashboardLineCanvas && !barCanvas && !radarCanvas) {
      initHomePage();
    }
  } catch (error) {
    console.error('initDashboard failed', error);
  }
}
