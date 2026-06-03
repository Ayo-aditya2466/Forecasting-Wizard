// history-logic.js — simplified history page script (fetch all, view, preview, delete)

document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.getElementById('history-table-body');
  if (!tableBody) return console.warn('history: #history-table-body not found');

  const fmtDate = (d) => { try { return new Date(d).toLocaleString(); } catch { return d || ''; } };
  const sanitize = (s) => (s || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');

  async function loadAll() {
    try {
      const resp = await fetch('/api/forecasts');
      if (!resp.ok) throw new Error('Failed to fetch forecasts');
      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-slate-400">No saved forecasts yet!</td></tr>';
        return;
      }

      // Render rows
      tableBody.innerHTML = data.map(f => {
        const id = f._id || '';
        const ts = fmtDate(f.createdAt || f.created_at || '');
        return `
          <tr data-id="${id}" class="align-top">
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

      // Bind actions
      Array.from(document.getElementsByClassName('viewBtn')).forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const forecast = data.find(x => x._id === id);
          if (!forecast) return console.warn('Forecast not found for id', id);
          try {
            localStorage.setItem('viewForecast', JSON.stringify({ prompt: forecast.prompt, summary: forecast.summary, labels: forecast.labels, values: forecast.values }));
            window.location.href = '/';
          } catch (e) { console.error('Failed to store forecast for viewing', e); }
        });
      });

      Array.from(document.getElementsByClassName('previewBtn')).forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const forecast = data.find(x => x._id === id);
          if (!forecast) return;
          try {
            alert(`Summary:\n${forecast.summary}\n\nLabels: ${Array.isArray(forecast.labels)?forecast.labels.join(', '):''}\nValues: ${Array.isArray(forecast.values)?forecast.values.join(', '):''}`);
          } catch (e) { console.error('Preview failed', e); }
        });
      });

      Array.from(document.getElementsByClassName('deleteBtn')).forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!id) return;
          if (!confirm('Are you sure you want to permanently delete this forecast?')) return;
          try {
            const resp = await fetch(`/api/forecasts/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!resp.ok) {
              const body = await resp.json().catch(() => ({}));
              alert(body && body.error ? `Delete failed: ${body.error}` : 'Delete failed');
              return;
            }
            const row = btn.closest('tr'); if (row) row.remove();
            console.log('Deleted forecast id=', id);
          } catch (err) {
            console.error('Error deleting forecast', err);
            alert('Network error while deleting.');
          }
        });
      });

    } catch (err) {
      console.error('Error loading forecasts:', err);
      tableBody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-red-500">Failed to load forecasts.</td></tr>';
    }
  }

  loadAll();
});
