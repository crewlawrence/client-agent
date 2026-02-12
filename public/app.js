async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Request failed');
  }
  return res.json();
}

let cachedClients = [];

function draftCard(draft) {
  const statusClass = draft.status === 'approved' ? 'badge approved' : 'badge';
  const badgeLabel = draft.status === 'approved' ? 'Approved' : 'Pending';

  return `
    <article class="draft-card">
      <div>
        <strong>${draft.clientName}</strong>
        <div>${draft.subject}</div>
      </div>
      <div class="draft-meta">
        <span>${new Date(draft.createdAt).toLocaleString()}</span>
        <span>Changes: ${draft.changeCount}</span>
        <span class="${statusClass}">${badgeLabel}</span>
      </div>
      <div>
        <pre style="white-space: pre-wrap; font-family: inherit; color: #2f3338;">${draft.body}</pre>
      </div>
      ${draft.status === 'pending' ? `<div class="draft-actions">
        <button class="button-primary" data-approve="${draft.id}">Approve & add to Gmail</button>
      </div>` : ''}
    </article>
  `;
}

function scheduleFields(client) {
  const schedule = client.schedule || { frequency: 'none' };
  const freq = schedule.frequency || 'none';
  const dayOfWeek = Number(schedule.dayOfWeek ?? 1);
  const dayOfMonth = Number(schedule.dayOfMonth ?? 1);
  const hour = Number(schedule.hour ?? 9);

  return `
    <div class="draft-meta" style="gap: 12px;">
      <label>Frequency
        <select name="frequency">
          <option value="none" ${freq === 'none' ? 'selected' : ''}>None</option>
          <option value="weekly" ${freq === 'weekly' ? 'selected' : ''}>Weekly</option>
          <option value="biweekly" ${freq === 'biweekly' ? 'selected' : ''}>Biweekly</option>
          <option value="monthly" ${freq === 'monthly' ? 'selected' : ''}>Monthly</option>
        </select>
      </label>
      <label>Day (weekly)
        <select name="dayOfWeek">
          <option value="1" ${dayOfWeek === 1 ? 'selected' : ''}>Mon</option>
          <option value="2" ${dayOfWeek === 2 ? 'selected' : ''}>Tue</option>
          <option value="3" ${dayOfWeek === 3 ? 'selected' : ''}>Wed</option>
          <option value="4" ${dayOfWeek === 4 ? 'selected' : ''}>Thu</option>
          <option value="5" ${dayOfWeek === 5 ? 'selected' : ''}>Fri</option>
          <option value="6" ${dayOfWeek === 6 ? 'selected' : ''}>Sat</option>
          <option value="0" ${dayOfWeek === 0 ? 'selected' : ''}>Sun</option>
        </select>
      </label>
      <label>Day (monthly)
        <input name="dayOfMonth" type="number" min="1" max="28" value="${dayOfMonth}" />
      </label>
      <label>Hour
        <input name="hour" type="number" min="0" max="23" value="${hour}" />
      </label>
    </div>
  `;
}

function clientCard(client) {
  const tags = Array.isArray(client.tags) ? client.tags.join(', ') : '';
  const nextRun = client.nextRunAt ? new Date(client.nextRunAt).toLocaleString() : 'Not scheduled';

  return `
    <div class="draft-card" style="gap: 8px;">
      <div>
        <strong>${client.name}</strong>
        <div class="muted">Realm: ${client.realmId || 'Not connected'}</div>
      </div>
      <div class="draft-meta">
        <span>${client.clientEmail || 'No email set'}</span>
        <span>Source: ${client.source}</span>
        <span>Next run: ${nextRun}</span>
      </div>
      <form data-client="${client.id}" class="draft-actions">
        <input name="name" type="text" placeholder="Client name" value="${client.name || ''}" />
        <input name="clientEmail" type="email" placeholder="Client email" value="${client.clientEmail || ''}" />
        <input name="tags" type="text" placeholder="Tags (comma-separated)" value="${tags}" />
        ${scheduleFields(client)}
        <div class="draft-actions">
          <button class="button-primary" type="submit">Save</button>
          <button class="button-secondary" type="button" data-disconnect="${client.id}">Disconnect</button>
        </div>
      </form>
    </div>
  `;
}

function applyFilters(clients) {
  const search = document.getElementById('filterSearch')?.value.toLowerCase() || '';
  const tag = document.getElementById('filterTag')?.value.toLowerCase() || '';
  const status = document.getElementById('filterStatus')?.value || 'all';

  return clients.filter((client) => {
    const matchesSearch = !search || client.name.toLowerCase().includes(search) || (client.clientEmail || '').toLowerCase().includes(search);
    const tags = Array.isArray(client.tags) ? client.tags.map((t) => t.toLowerCase()) : [];
    const matchesTag = !tag || tags.includes(tag);
    const isConnected = Boolean(client.realmId);
    const matchesStatus = status === 'all' || (status === 'connected' && isConnected) || (status === 'disconnected' && !isConnected);
    return matchesSearch && matchesTag && matchesStatus;
  });
}

async function loadDrafts() {
  const data = await fetchJSON('/api/drafts');
  const list = document.getElementById('draftList');
  list.innerHTML = data.drafts.map(draftCard).join('');

  list.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Approving...';
      await fetchJSON(`/api/drafts/${btn.dataset.approve}/approve`, { method: 'POST' });
      await loadDrafts();
    });
  });
}

async function loadStatus() {
  const status = await fetchJSON('/api/status');
  const qbo = document.getElementById('qboStatus');
  const gmail = document.getElementById('gmailStatus');
  const clientCount = document.getElementById('clientCount');
  if (qbo) qbo.textContent = status.qboConnected ? 'Connected' : 'Not connected';
  if (gmail) gmail.textContent = status.gmailConnected ? 'Connected' : 'Not connected';
  if (clientCount) clientCount.textContent = `${status.clientCount} connected`;
}

async function loadClients() {
  const data = await fetchJSON('/api/clients');
  cachedClients = data.clients || [];
  renderClients();
}

async function loadTenant() {
  const data = await fetchJSON('/api/tenant');
  const mode = document.getElementById('llmMode');
  const minCount = document.getElementById('llmMinChangeCount');
  if (mode) mode.value = data.tenant?.llm_mode || 'scheduled';
  if (minCount) minCount.value = data.tenant?.llm_min_change_count ?? 0;
}

async function saveTenantSettings(evt) {
  evt.preventDefault();
  const mode = document.getElementById('llmMode');
  const minCount = document.getElementById('llmMinChangeCount');
  const payload = {
    llmMode: mode?.value || 'scheduled',
    llmMinChangeCount: Number(minCount?.value || 0)
  };
  await fetchJSON('/api/tenant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

function renderClients() {
  const list = document.getElementById('clientList');
  if (!list) return;
  const filtered = applyFilters(cachedClients);
  list.innerHTML = filtered.map(clientCard).join('');

  list.querySelectorAll('form[data-client]').forEach((form) => {
    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const id = form.dataset.client;
      const tagsRaw = form.querySelector('input[name="tags"]').value;
      const payload = {
        name: form.querySelector('input[name="name"]').value,
        clientEmail: form.querySelector('input[name="clientEmail"]').value,
        tags: tagsRaw.split(',').map((t) => t.trim()).filter(Boolean),
        schedule: {
          frequency: form.querySelector('select[name="frequency"]').value,
          dayOfWeek: Number(form.querySelector('select[name="dayOfWeek"]').value),
          dayOfMonth: Number(form.querySelector('input[name="dayOfMonth"]').value || 1),
          hour: Number(form.querySelector('input[name="hour"]').value || 9)
        }
      };
      await fetchJSON(`/api/clients/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await loadClients();
      await loadStatus();
    });
  });

  list.querySelectorAll('[data-disconnect]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Disconnect this client and remove their data?')) return;
      await fetchJSON(`/api/clients/${btn.dataset.disconnect}`, { method: 'DELETE' });
      await loadClients();
      await loadStatus();
    });
  });
}

async function runDrafts() {
  const button = document.getElementById('runDrafts');
  button.disabled = true;
  button.textContent = 'Generating...';
  await fetchJSON('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  button.textContent = 'Generate new drafts';
  button.disabled = false;
  await loadDrafts();
}

async function runScheduled() {
  const button = document.getElementById('runScheduled');
  button.disabled = true;
  button.textContent = 'Running...';
  await fetchJSON('/api/run-scheduled', { method: 'POST' });
  button.textContent = 'Run scheduled';
  button.disabled = false;
  await loadDrafts();
}

window.addEventListener('DOMContentLoaded', () => {
  loadDrafts().catch((err) => {
    document.getElementById('draftList').innerHTML = `<div class="feature">${err.message}</div>`;
  });
  loadStatus().catch(() => {});
  loadClients().catch(() => {});
  loadTenant().catch(() => {});

  const runButton = document.getElementById('runDrafts');
  if (runButton) {
    runButton.addEventListener('click', () => {
      runDrafts().catch((err) => alert(err.message));
    });
  }

  const scheduledButton = document.getElementById('runScheduled');
  if (scheduledButton) {
    scheduledButton.addEventListener('click', () => {
      runScheduled().catch((err) => alert(err.message));
    });
  }

  const llmForm = document.getElementById('llmForm');
  if (llmForm) {
    llmForm.addEventListener('submit', (evt) => {
      saveTenantSettings(evt)
        .then(() => loadTenant())
        .catch((err) => alert(err.message));
    });
  }

  ['filterSearch', 'filterTag', 'filterStatus'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderClients);
  });
});
