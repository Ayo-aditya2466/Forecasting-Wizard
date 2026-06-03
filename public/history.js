// history.js
// Fetch saved forecasts and populate the history table.

document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.getElementById('history-table-body');
  const chartModal = document.getElementById('chartModal');
  const closeModalBtn = document.getElementById('closeModal');
  const historyChartCanvas = document.getElementById('historyChart');
  let historyChart = null;
  let fetchedData = [];

  if (!tableBody) {
    console.warn('history.js: #history-table-body not found.');
    return;
  }

  const fmtDate = (d) => {
    try { return new Date(d).toLocaleString(); } catch { return d || ''; }
  };
  const sanitize = (s) => (s || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function openModal(forecast) {
    if (!forecast || !forecast.labels || !forecast.values) return;
    if (!historyChartCanvas) return;

    if (historyChart) {
      try { historyChart.destroy(); } catch (e) {}
      historyChart = null;
    }

    const ctx = historyChartCanvas.getContext('2d');
    historyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: forecast.labels,
        datasets: [{
          label: forecast.summary || 'Forecast',
          data: forecast.values,
          borderColor: '#0d9488',
          backgroundColor: 'rgba(13,148,136,0.1)',
          borderWidth: 2,
          tension: 0.35,
          fill: true
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });

    if (chartModal) {
      chartModal.classList.remove('hidden');
      chartModal.classList.add('flex');
    }
  }

  function closeModal() {
    if (chartModal) {
      chartModal.classList.remove('flex');
      chartModal.classList.add('hidden');
    }
    if (historyChart) {
      try { historyChart.destroy(); } catch (e) {}
      historyChart = null;
    }
  }

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (chartModal) chartModal.addEventListener('click', (e) => { if (e.target === chartModal) closeModal(); });

  // Fetch history
  (async () => {
    try {
      console.log('Fetching /api/forecasts');
      const resp = await fetch('/api/forecasts');
      if (!resp.ok) throw new Error('Failed to fetch forecasts');
      const data = await resp.json();

      if (!Array.isArray(data) || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-slate-400">No saved forecasts yet!</td></tr>';
        return;
      }

      fetchedData = data;

      tableBody.innerHTML = data.map(f => {
        const id = f._id || '';
        const ts = fmtDate(f.createdAt || f.created_at || '');
        return `
          <tr class="align-top">
            <td class="py-4 px-3 text-sm text-slate-400">${ts}</td>
            <td class="py-4 px-3 text-sm text-slate-200 max-w-xs truncate">${sanitize(f.prompt)}</td>
            <td class="py-4 px-3 text-sm text-slate-300 max-w-2xl">${sanitize(f.summary)}</td>
            <td class="py-4 px-3 text-sm text-slate-300">
              <button data-id="${id}" class="viewBtn inline-flex items-center gap-2 px-3 py-2 rounded-md bg-brandTeal text-white">
                <i class="fa-solid fa-chart-line"></i>
                View
              </button>
              <button data-id="${id}" class="previewBtn ml-2 inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-700 text-slate-300">
                Preview
              </button>
              <button data-id="${id}" class="deleteBtn ml-2 inline-flex items-center gap-2 px-3 py-2 rounded-md border border-red-700 text-red-400">
                Delete
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Bind buttons
      Array.from(document.getElementsByClassName('viewBtn')).forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const forecast = fetchedData.find(x => x._id === id);
          if (!forecast) return console.warn('Forecast not found for id', id);
          // Save full forecast to localStorage and redirect to dashboard
          try {
            const payload = {
              _id: forecast._id,
              prompt: forecast.prompt,
              summary: forecast.summary,
              labels: forecast.labels,
              values: forecast.values,
              createdAt: forecast.createdAt
            };
            localStorage.setItem('viewForecast', JSON.stringify(payload));
            console.log('Stored full forecast for viewing, id=', id);
            window.location.href = '/';
          } catch (e) {
            console.error('Failed to store forecast for viewing:', e);
          }
        });
      });

      // Preview
      Array.from(document.getElementsByClassName('previewBtn')).forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const forecast = fetchedData.find(x => x._id === id);
          if (!forecast) return console.warn('Forecast not found for preview', id);

          // Use alert preview fallback if no modal is implemented
          try {
            const previewText = `Summary:\n${forecast.summary}\n\nLabels: ${Array.isArray(forecast.labels)?forecast.labels.join(', '):''}\nValues: ${Array.isArray(forecast.values)?forecast.values.join(', '):''}`;
            alert(previewText);
          } catch (e) {
            console.error('Preview failed', e);
          }
        });
      });

      // Delete: call backend DELETE and remove row on success
      Array.from(document.getElementsByClassName('deleteBtn')).forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!id) return;
          if (!confirm('Are you sure you want to delete this forecast?')) return;

          try {
            console.log('Attempting to delete forecast id=', id);
            const resp = await fetch(`/api/forecasts/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!resp.ok) {
              const body = await resp.json().catch(() => ({}));
              console.error('Delete failed', resp.status, body);
              alert(body && body.error ? `Delete failed: ${body.error}` : 'Delete failed.');
              return;
            }

            // Remove the row from DOM
            const row = btn.closest('tr');
            if (row && row.parentNode) row.parentNode.removeChild(row);
            console.log('Deleted forecast and removed row id=', id);

            // Optionally remove from fetchedData
            fetchedData = fetchedData.filter(x => x._id !== id);

          } catch (err) {
            console.error('Error deleting forecast:', err);
            alert('Network error while deleting.');
          }
        });
      });

    } catch (err) {
      console.error('Error loading forecasts:', err);
      tableBody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-red-500">Failed to load forecasts.</td></tr>';
    }
  })();

});