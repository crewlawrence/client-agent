import crypto from 'crypto';
import { query } from './db.js';

export async function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO sessions (token, user_id, tenant_id, email, role, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [token, user.id, user.tenant_id, user.email, user.role || 'buyer', expiresAt]
  );
  return { token, expiresAt };
}

export async function getSession(token) {
  if (!token) return null;
  const res = await query('SELECT * FROM sessions WHERE token=$1 LIMIT 1', [token]);
  const session = res.rows[0];
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    await deleteSession(token);
    return null;
  }
  return {
    userId: session.user_id,
    tenantId: session.tenant_id,
    role: session.role,
    email: session.email,
    expiresAt: session.expires_at
  };
}

export async function deleteSession(token) {
  if (!token) return;
  await query('DELETE FROM sessions WHERE token=$1', [token]);
}

export async function deleteExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at < now()');
}
