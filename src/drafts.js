import { query } from './db.js';

export async function listDrafts(tenantId) {
  const res = await query('SELECT * FROM drafts WHERE tenant_id=? ORDER BY created_at DESC', [tenantId]);
  return res.rows.map((d) => ({
    id: d.id,
    tenantId: d.tenant_id,
    clientId: d.client_id,
    clientName: d.client_name,
    clientEmail: d.client_email,
    subject: d.subject,
    body: d.body,
    changeCount: d.change_count,
    status: d.status,
    gmailDraftId: d.gmail_draft_id,
    createdAt: d.created_at,
    approvedAt: d.approved_at
  }));
}

export async function createDraftEntry(entry) {
  const res = await query(
    'INSERT INTO drafts (tenant_id, client_id, client_name, client_email, subject, body, change_count, status) VALUES (?,?,?,?,?,?,?,?) RETURNING *',
    [
      entry.tenantId,
      entry.clientId,
      entry.clientName,
      entry.clientEmail,
      entry.subject,
      entry.body,
      entry.changeCount,
      entry.status || 'pending'
    ]
  );
  return res.rows[0];
}

export async function updateDraft(id, updates) {
  const res = await query(
    'UPDATE drafts SET status=?, gmail_draft_id=?, approved_at=? WHERE id=? RETURNING *',
    [updates.status, updates.gmailDraftId, updates.approvedAt, id]
  );
  return res.rows[0] || null;
}

export async function getDraft(id) {
  const res = await query('SELECT * FROM drafts WHERE id=?', [id]);
  return res.rows[0] || null;
}

export async function deleteDraftsForClient(tenantId, clientId) {
  await query('DELETE FROM drafts WHERE tenant_id=? AND client_id=?', [tenantId, clientId]);
}

export async function deleteOldDrafts(days) {
  await query("DELETE FROM drafts WHERE created_at < datetime('now', ?)", [`-${days} days`]);
}
