import { query } from './db.js';

export async function getSnapshot(tenantId, clientId) {
  const res = await query(
    'SELECT data FROM snapshots WHERE tenant_id=? AND client_id=? ORDER BY created_at DESC LIMIT 1',
    [tenantId, clientId]
  );
  return res.rows[0]?.data ? JSON.parse(res.rows[0].data) : null;
}

export async function saveSnapshot(tenantId, clientId, snapshot) {
  await query('INSERT INTO snapshots (tenant_id, client_id, data) VALUES (?,?,?)', [
    tenantId,
    clientId,
    JSON.stringify(snapshot)
  ]);
}

export async function deleteSnapshot(tenantId, clientId) {
  await query('DELETE FROM snapshots WHERE tenant_id=? AND client_id=?', [tenantId, clientId]);
}

export async function deleteOldSnapshots(days) {
  await query("DELETE FROM snapshots WHERE created_at < datetime('now', ?)", [`-${days} days`]);
}
