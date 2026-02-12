import { query } from './db.js';
import { encryptString, decryptString } from './crypto.js';

export async function saveToken({ tenantId, provider, realmId = null, token }) {
  const encrypted = encryptString(JSON.stringify(token));
  const existing = await query(
    'SELECT id FROM tokens WHERE tenant_id=$1 AND provider=$2 AND COALESCE(realm_id, \'\')=COALESCE($3, \'\')',
    [tenantId, provider, realmId]
  );
  if (existing.rows.length > 0) {
    await query('UPDATE tokens SET token_data=$1, updated_at=now() WHERE id=$2', [encrypted, existing.rows[0].id]);
    return;
  }
  await query(
    'INSERT INTO tokens (tenant_id, provider, realm_id, token_data) VALUES ($1, $2, $3, $4)',
    [tenantId, provider, realmId, encrypted]
  );
}

export async function getToken({ tenantId, provider, realmId = null }) {
  const res = await query(
    'SELECT token_data FROM tokens WHERE tenant_id=$1 AND provider=$2 AND COALESCE(realm_id, \'\')=COALESCE($3, \'\')',
    [tenantId, provider, realmId]
  );
  if (res.rows.length === 0) return null;
  const decrypted = decryptString(res.rows[0].token_data);
  return JSON.parse(decrypted);
}

export async function hasToken({ tenantId, provider, realmId = null }) {
  const res = await query(
    'SELECT 1 FROM tokens WHERE tenant_id=$1 AND provider=$2 AND COALESCE(realm_id, \'\')=COALESCE($3, \'\')',
    [tenantId, provider, realmId]
  );
  return res.rows.length > 0;
}
