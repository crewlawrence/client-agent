import { query } from './db.js';

export async function logAudit({ tenantId, userId, action, entityType, entityId, metadata = {} }) {
  await query(
    'INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata) VALUES (?,?,?,?,?,?)',
    [tenantId, userId || null, action, entityType || null, entityId || null, JSON.stringify(metadata)]
  );
}

export async function deleteOldAudit(days) {
  await query("DELETE FROM audit_logs WHERE created_at < datetime('now', ?)", [`-${days} days`]);
}
