import axios from 'axios';
import qs from 'qs';
import { saveToken, getToken, hasToken } from './tokenStore.js';

const QBO_ENV = process.env.QBO_ENV || 'sandbox';
const AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const API_BASE = QBO_ENV === 'production'
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com';

const CLIENT_ID = process.env.QBO_CLIENT_ID || '';
const CLIENT_SECRET = process.env.QBO_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.QBO_REDIRECT_URI || '';

export function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    state
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

export async function exchangeCode(code, realmId, tenantId = 'default') {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const body = qs.stringify({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI
  });
  const res = await axios.post(TOKEN_URL, body, {
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  const token = normalizeToken(res.data);
  await saveToken({ tenantId, provider: 'qbo', realmId, token });
  return token;
}

function normalizeToken(data) {
  const now = Date.now();
  const expiresAt = now + (data.expires_in * 1000);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt
  };
}

async function refreshToken(refreshToken) {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const body = qs.stringify({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
  const res = await axios.post(TOKEN_URL, body, {
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return normalizeToken(res.data);
}

export async function getAccessToken(realmId, tenantId = 'default') {
  const existing = await getToken({ tenantId, provider: 'qbo', realmId });
  if (!existing) throw new Error(`No QBO token for realm ${realmId}`);

  const now = Date.now();
  if (existing.expires_at - now > 60_000) return existing.access_token;

  const refreshed = await refreshToken(existing.refresh_token);
  await saveToken({ tenantId, provider: 'qbo', realmId, token: refreshed });
  return refreshed.access_token;
}

export async function qboQuery(realmId, query, tenantId = 'default') {
  const token = await getAccessToken(realmId, tenantId);
  const url = `${API_BASE}/v3/company/${realmId}/query`;
  const res = await axios.get(url, {
    params: { query },
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  return res.data;
}

export async function qboReport(realmId, reportName, params = {}, tenantId = 'default') {
  const token = await getAccessToken(realmId, tenantId);
  const url = `${API_BASE}/v3/company/${realmId}/reports/${reportName}`;
  const res = await axios.get(url, {
    params,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  return res.data;
}

export async function qboGet(realmId, path, tenantId = 'default', params = {}) {
  const token = await getAccessToken(realmId, tenantId);
  const url = `${API_BASE}/v3/company/${realmId}/${path}`;
  const res = await axios.get(url, {
    params,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  return res.data;
}

export async function hasQboToken(tenantId, realmId) {
  return hasToken({ tenantId, provider: 'qbo', realmId });
}
