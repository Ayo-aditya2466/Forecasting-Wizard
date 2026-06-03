/**
 * History Engine for the history page.
 * Fetches saved forecasts and builds the history table.
 */

function initHistory() {
  try {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    const renderEmpty = (message) => {
      tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-400">${message}</td></tr>`;
    };

    const escapeHtml = (value) => {
      if (value === undefined || value === null) return '';
      return String(value).replace(/[&<>'"`=\/]/g, (char) => {
        const map = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
          '`': '&#96;',
          '=': '&#61;',
          '/': '&#x2F;'
        };
        return map[char] || char;
      });
    };

    const fetchHistory = async () => {
      renderEmpty('Loading history…');

      try {
        const response = await fetch('/api/history');
        if (!response.ok) {
          throw new Error('Failed to load history');
        }

        const docs = await response.json();
        if (!Array.isArray(docs) || docs.length === 0) {
          renderEmpty('No saved forecasts yet.');
          return;
        }

        const store = new Map();
        tbody.innerHTML = '';

        docs.forEach((doc) => {
          if (!doc || !doc._id) return;
          store.set(doc._id, doc);

          const row = document.createElement('tr');
          row.setAttribute('data-id', doc._id);

          const createdAt = doc.createdAt ? new Date(doc.createdAt).toLocaleString() : 'Unknown';

          row.innerHTML = `
            <td class="py-3 px-3 text-slate-400 text-sm">${createdAt}</td>
            <td class="py-3 px-3 text-sm"><div class="text-slate-100 break-words">${escapeHtml(doc.prompt || '')}</div></td>
            <td class="py-3 px-3 text-sm text-slate-200 max-w-md break-words">${escapeHtml(doc.summary || '')}</td>
            <td class="py-3 px-3 text-sm">
              <div class="flex gap-2">
                <button class="btn-view inline-flex items-center px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm">View</button>
                <button class="btn-delete inline-flex items-center px-3 py-1.5 rounded-md bg-red-600 text-white text-sm">Delete</button>
              </div>
            </td>
          `;

          tbody.appendChild(row);
        });

        tbody.addEventListener('click', async (event) => {
          const viewButton = event.target.closest('.btn-view');
          if (viewButton) {
            const row = viewButton.closest('tr');
            if (!row) return;
            const id = row.getAttribute('data-id');
            const record = store.get(id);
            if (!record) return;

            const payload = {
              prompt: record.prompt || '',
              summary: record.summary || '',
              labels: Array.isArray(record.labels) ? record.labels : [],
              barValues: Array.isArray(record.values) ? record.values : [],
              insights: record.insights || ''
            };

            try {
              localStorage.setItem('activeSimulationData', JSON.stringify(payload));
            } catch (error) {
              console.warn('Unable to save activeSimulationData', error);
            }

            window.location.href = '/';
            return;
          }

          const deleteButton = event.target.closest('.btn-delete');
          if (!deleteButton) return;

          const row = deleteButton.closest('tr');
          if (!row) return;
          const id = row.getAttribute('data-id');
          if (!id) return;

          if (!confirm('Are you sure you want to permanently delete this forecast record?')) {
            return;
          }

          try {
            const response = await fetch(`/api/forecasts/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!response.ok) {
              const errorPayload = await response.json().catch(() => ({}));
              alert(errorPayload.error || 'Failed to delete record.');
              return;
            }
            row.remove();
            store.delete(id);
          } catch (error) {
            console.error('Delete action failed', error);
            alert('Failed to delete record.');
          }
        });
      } catch (error) {
        console.error('History fetch failed', error);
        renderEmpty('Failed to load history.');
      }
    };

    fetchHistory();
  } catch (error) {
    console.error('initHistory failed', error);
  }
}
