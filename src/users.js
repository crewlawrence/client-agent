import crypto from 'crypto';
import { query } from './db.js';

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyScrypt(hash, password) {
  const parts = String(hash).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'base64');
  const stored = Buffer.from(parts[2], 'base64');
  const derived = crypto.scryptSync(password, salt, stored.length);
  return crypto.timingSafeEqual(stored, derived);
}

export async function findUserByEmail(email) {
  const res = await query('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1', [email]);
  return res.rows[0] || null;
}

export function verifyPassword(user, password) {
  if (!user) return false;
  if (user.password_hash) return verifyScrypt(user.password_hash, password);
  if (user.password) return timingSafeEqualString(user.password, password);
  return false;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name || user.email,
    tenantId: user.tenant_id,
    role: user.role || 'buyer'
  };
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function createTenant(displayName) {
  const res = await query('INSERT INTO tenants (display_name) VALUES ($1) RETURNING id', [displayName || null]);
  return res.rows[0].id;
}

export async function createUser({ name, email, password, tenantId, role = 'buyer' }) {
  const existing = await findUserByEmail(email);
  if (existing) {
    const err = new Error('Email already exists');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }
  const passwordHash = hashPassword(password);
  const res = await query(
    'INSERT INTO users (tenant_id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [tenantId, email, name || email, passwordHash, role]
  );
  return res.rows[0];
}
