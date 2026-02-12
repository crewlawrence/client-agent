import { google } from 'googleapis';
import { saveToken, getToken, hasToken } from './tokenStore.js';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';

function getOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getGmailAuthUrl(state) {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.readonly'
    ],
    state
  });
}

export async function exchangeGmailCode(code, tokenKey = 'default') {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  await saveToken({ tenantId: tokenKey, provider: 'gmail', token: tokens });
  return tokens;
}

export async function getGmailClient(tokenKey = 'default') {
  const tokens = await getToken({ tenantId: tokenKey, provider: 'gmail' });
  if (!tokens) throw new Error('No Gmail token found. Connect Gmail first.');

  const oauth2 = getOAuthClient();
  oauth2.setCredentials(tokens);

  oauth2.on('tokens', (newTokens) => {
    const updated = { ...tokens, ...newTokens };
    saveToken({ tenantId: tokenKey, provider: 'gmail', token: updated }).catch(() => {});
  });

  return google.gmail({ version: 'v1', auth: oauth2 });
}

function createRawMessage(to, subject, body) {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    body
  ].join('\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createDraft({ to, subject, body, tokenKey = 'default' }) {
  const gmail = await getGmailClient(tokenKey);
  const raw = createRawMessage(to, subject, body);
  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: { raw }
    }
  });
  return res.data;
}

export async function sendEmail({ to, subject, body, tokenKey = 'default' }) {
  const gmail = await getGmailClient(tokenKey);
  const raw = createRawMessage(to, subject, body);
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });
  return res.data;
}

export async function hasGmailToken(tokenKey = 'default') {
  return hasToken({ tenantId: tokenKey, provider: 'gmail' });
}
