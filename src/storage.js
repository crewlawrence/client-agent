import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const dataDir = path.resolve('data');
const secureFile = path.join(dataDir, 'secure.json');
const snapshotsFile = path.join(dataDir, 'snapshots.json');
const defaultSecure = { qboTokens: {}, gmailTokens: {} };

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || 'dev-only-change-me';
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64')
  };
}

function decrypt(payload) {
  const key = getKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const data = Buffer.from(payload.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

export function readSecure() {
  ensureDir();
  if (!fs.existsSync(secureFile)) return defaultSecure;
  const raw = fs.readFileSync(secureFile, 'utf8');
  if (!raw.trim()) return defaultSecure;
  try {
    const payload = JSON.parse(raw);
    return decrypt(payload);
  } catch (err) {
    return defaultSecure;
  }
}

export function writeSecure(obj) {
  ensureDir();
  const payload = encrypt(obj);
  fs.writeFileSync(secureFile, JSON.stringify(payload, null, 2));
}

export function readSnapshots() {
  ensureDir();
  if (!fs.existsSync(snapshotsFile)) return {};
  const raw = fs.readFileSync(snapshotsFile, 'utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

export function writeSnapshots(obj) {
  ensureDir();
  fs.writeFileSync(snapshotsFile, JSON.stringify(obj, null, 2));
}
