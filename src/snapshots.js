import { query } from './db.js';

export async function getSnapshot(tenantId, clientId) {
  const res = await query(
    'SELECT data FROM snapshots WHERE tenant_id=$1 AND client_id=$2 ORDER BY created_at DESC LIMIT 1',
    [tenantId, clientId]
  );
  return res.rows[0]?.data || null;
}

export async function saveSnapshot(tenantId, clientId, snapshot) {
  await query('INSERT INTO snapshots (tenant_id, client_id, data) VALUES ($1, $2, $3)', [
    tenantId,
    clientId,
    snapshot
  ]);
}

export async function deleteSnapshot(tenantId, clientId) {
  await query('DELETE FROM snapshots WHERE tenant_id=$1 AND client_id=$2', [tenantId, clientId]);
}

export async function deleteOldSnapshots(days) {
  await query('DELETE FROM snapshots WHERE created_at < now() - ($1 || \' days\')::interval', [days]);
}
