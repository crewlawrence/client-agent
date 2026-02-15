import { query } from './db.js';

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function listClients(tenantId) {
  const res = await query('SELECT * FROM clients WHERE tenant_id=? ORDER BY updated_at DESC', [tenantId]);
  return res.rows.map((c) => ({
    id: c.id,
    tenantId: c.tenant_id,
    realmId: c.realm_id,
    name: c.name,
    clientEmail: c.client_email,
    tags: parseJson(c.tags, []),
    schedule: parseJson(c.schedule, { frequency: 'monthly', dayOfMonth: 1, hour: 9 }),
    nextRunAt: c.next_run_at,
    source: c.source,
    createdAt: c.created_at,
    updatedAt: c.updated_at
  }));
}

export async function getClientByRealm(tenantId, realmId) {
  const res = await query('SELECT * FROM clients WHERE tenant_id=? AND realm_id=? LIMIT 1', [tenantId, realmId]);
  return res.rows[0] || null;
}

export async function upsertClient(client) {
  const existing = await getClientByRealm(client.tenantId, client.realmId);
  if (existing) {
    const res = await query(
      'UPDATE clients SET name=?, client_email=?, updated_at=datetime(\'now\') WHERE id=? RETURNING *',
      [client.name, client.clientEmail, existing.id]
    );
    return res.rows[0];
  }
  const res = await query(
    'INSERT INTO clients (tenant_id, realm_id, name, client_email, source, schedule, next_run_at) VALUES (?,?,?,?,?,?,?) RETURNING *',
    [
      client.tenantId,
      client.realmId,
      client.name,
      client.clientEmail,
      client.source || 'data',
      JSON.stringify(client.schedule || { frequency: 'monthly', dayOfMonth: 1, hour: 9 }),
      client.nextRunAt || null
    ]
  );
  return res.rows[0];
}

export async function updateClient(tenantId, clientId, updates) {
  const res = await query(
    'UPDATE clients SET name=?, client_email=?, tags=?, schedule=?, next_run_at=?, updated_at=datetime(\'now\') WHERE tenant_id=? AND id=? RETURNING *',
    [
      updates.name,
      updates.clientEmail,
      JSON.stringify(updates.tags || []),
      JSON.stringify(updates.schedule || { frequency: 'none' }),
      updates.nextRunAt,
      tenantId,
      clientId
    ]
  );
  return res.rows[0] || null;
}

export async function deleteClient(tenantId, clientId) {
  const res = await query('DELETE FROM clients WHERE tenant_id=? AND id=?', [tenantId, clientId]);
  return res.rowCount > 0;
}
