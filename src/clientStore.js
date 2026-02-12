import { query } from './db.js';

export async function listClients(tenantId) {
  const res = await query('SELECT * FROM clients WHERE tenant_id=$1 ORDER BY updated_at DESC', [tenantId]);
  return res.rows.map((c) => ({
    id: c.id,
    tenantId: c.tenant_id,
    realmId: c.realm_id,
    name: c.name,
    clientEmail: c.client_email,
    tags: c.tags || [],
    schedule: c.schedule || { frequency: 'monthly', dayOfMonth: 1, hour: 9 },
    nextRunAt: c.next_run_at,
    source: c.source,
    createdAt: c.created_at,
    updatedAt: c.updated_at
  }));
}

export async function getClientByRealm(tenantId, realmId) {
  const res = await query('SELECT * FROM clients WHERE tenant_id=$1 AND realm_id=$2 LIMIT 1', [tenantId, realmId]);
  return res.rows[0] || null;
}

export async function upsertClient(client) {
  const existing = await getClientByRealm(client.tenantId, client.realmId);
  if (existing) {
    const res = await query(
      'UPDATE clients SET name=$1, client_email=$2, updated_at=now() WHERE id=$3 RETURNING *',
      [client.name, client.clientEmail, existing.id]
    );
    return res.rows[0];
  }
  const res = await query(
    'INSERT INTO clients (tenant_id, realm_id, name, client_email, source, schedule, next_run_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
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
    'UPDATE clients SET name=$1, client_email=$2, tags=$3, schedule=$4, next_run_at=$5, updated_at=now() WHERE tenant_id=$6 AND id=$7 RETURNING *',
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
  const res = await query('DELETE FROM clients WHERE tenant_id=$1 AND id=$2', [tenantId, clientId]);
  return res.rowCount > 0;
}
