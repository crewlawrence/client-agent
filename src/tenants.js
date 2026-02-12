import { query } from './db.js';

export async function getTenant(tenantId) {
  const res = await query('SELECT * FROM tenants WHERE id=$1', [tenantId]);
  return res.rows[0] || {};
}

export async function updateTenant(tenantId, updates) {
  const existing = await getTenant(tenantId);
  const res = await query(
    'UPDATE tenants SET display_name=$1, llm_mode=$2, llm_min_change_count=$3, updated_at=now() WHERE id=$4 RETURNING *',
    [
      updates.displayName ?? existing.display_name ?? null,
      updates.llmMode ?? existing.llm_mode ?? 'scheduled',
      updates.llmMinChangeCount ?? existing.llm_min_change_count ?? 0,
      tenantId
    ]
  );
  return res.rows[0] || {};
}
