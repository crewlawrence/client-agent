import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAuthUrl, exchangeCode, hasQboToken, qboGet } from './qbo.js';
import { getGmailAuthUrl, exchangeGmailCode, createDraft as createGmailDraft, hasGmailToken } from './gmail.js';
import { collectSnapshot, computeChanges } from './collect.js';
import { draftEmail } from './summarize.js';
import { findUserByEmail, verifyPassword, createUser, createTenant } from './users.js';
import { createSession, getSession, deleteSession } from './sessions.js';
import { listDrafts, createDraftEntry, updateDraft, getDraft, deleteDraftsForClient } from './drafts.js';
import { getTenant, updateTenant } from './tenants.js';
import { listClients, upsertClient, updateClient, deleteClient } from './clientStore.js';
import { getSnapshot, saveSnapshot, deleteSnapshot } from './snapshots.js';
import { computeNextRun, isDue } from './scheduling.js';
import { logAudit } from './audit.js';
import { runRetention } from './retention.js';
import { shouldUseLLM } from './llmPolicy.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve('public')));
app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'production') {
  app.use(helmet());
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true }));
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }
    next();
  });
}

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

function loadClients() {
  const configPath = path.resolve('config', 'clients.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Missing config/clients.json. Copy config/clients.example.json to config/clients.json and update it.');
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  return config.clients || [];
}

function makeState() {
  return crypto.randomBytes(8).toString('hex');
}

async function getSessionFromReq(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  return getSession(match[1]);
}

async function requireAuth(req, res, next) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  req.session = session;
  next();
}

app.get('/', (req, res) => {
  res.sendFile(path.resolve('public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.resolve('public', 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.resolve('public', 'signup.html'));
});

app.get('/dashboard', async (req, res) => {
  const session = await getSessionFromReq(req);
  if (!session) return res.redirect('/login');
  res.sendFile(path.resolve('public', 'dashboard.html'));
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await findUserByEmail(email);
  if (!verifyPassword(user, password)) {
    return res.status(401).send('Invalid credentials');
  }

  const session = await createSession(user);
  res.setHeader('Set-Cookie', `session=${session.token}; HttpOnly; Path=/; SameSite=Lax${COOKIE_SECURE ? '; Secure' : ''}`);
  await logAudit({ tenantId: user.tenant_id, userId: user.id, action: 'login', entityType: 'user', entityId: user.id });
  res.redirect('/dashboard');
});

app.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!email || !password) return res.status(400).send('Missing email or password');
    const tenantId = await createTenant(name || email);
    const user = await createUser({ name, email, password, tenantId, role: 'buyer' });
    const session = await createSession(user);
    res.setHeader('Set-Cookie', `session=${session.token}; HttpOnly; Path=/; SameSite=Lax${COOKIE_SECURE ? '; Secure' : ''}`);
    await logAudit({ tenantId, userId: user.id, action: 'signup', entityType: 'user', entityId: user.id });
    res.redirect('/dashboard');
  } catch (err) {
    if (err.code === 'EMAIL_EXISTS') return res.status(409).send('Email already exists');
    res.status(500).send('Signup failed');
  }
});

app.post('/logout', async (req, res) => {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/session=([^;]+)/);
  if (match) await deleteSession(match[1]);
  res.setHeader('Set-Cookie', `session=; Max-Age=0; Path=/; SameSite=Lax${COOKIE_SECURE ? '; Secure' : ''}`);
  res.redirect('/login');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/auth/quickbooks', requireAuth, (req, res) => {
  const url = getAuthUrl(makeState());
  res.redirect(url);
});

app.get('/callback/quickbooks', async (req, res) => {
  try {
    const { code, realmId } = req.query;
    if (!code || !realmId) return res.status(400).send('Missing code or realmId');
    const session = await getSessionFromReq(req);
    const tenantId = session?.tenantId || 'default';
    await exchangeCode(String(code), String(realmId), tenantId);
    await updateTenant(tenantId, { displayName: null });

    try {
      const companyInfo = await qboGet(String(realmId), `companyinfo/${realmId}`, tenantId);
      const info = companyInfo?.CompanyInfo || {};
      const name = info.CompanyName || info.LegalName || 'New Client';
      const email = info.Email?.Address || info.CompanyEmail?.Address || '';
      const schedule = { frequency: 'monthly', dayOfMonth: 1, hour: 9 };
      const nextRunAt = computeNextRun(schedule);
      const client = await upsertClient({
        tenantId,
        realmId: String(realmId),
        name,
        clientEmail: email,
        schedule,
        nextRunAt: nextRunAt ? nextRunAt.toISOString() : null
      });
      await logAudit({ tenantId, userId: session?.userId, action: 'connect_qbo', entityType: 'client', entityId: client.id });
    } catch {
      await upsertClient({
        tenantId,
        realmId: String(realmId),
        name: 'New Client',
        clientEmail: ''
      });
    }
    res.send('QuickBooks connected. You can close this tab.');
  } catch (err) {
    res.status(500).send(`QuickBooks connection failed: ${err.message}`);
  }
});

app.get('/auth/gmail', requireAuth, (req, res) => {
  const url = getGmailAuthUrl(makeState());
  res.redirect(url);
});

app.get('/callback/gmail', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');
    const session = await getSessionFromReq(req);
    const tokenKey = session?.tenantId || 'default';
    await exchangeGmailCode(String(code), tokenKey);
    await logAudit({ tenantId: session?.tenantId, userId: session?.userId, action: 'connect_gmail', entityType: 'tenant', entityId: session?.tenantId });
    res.send('Gmail connected. You can close this tab.');
  } catch (err) {
    res.status(500).send(`Gmail connection failed: ${err.message}`);
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.session });
});

app.get('/api/status', requireAuth, async (req, res) => {
  const clients = await listClients(req.session.tenantId);
  const qboConnected = (await Promise.all(clients.map((c) => (c.realmId ? hasQboToken(req.session.tenantId, c.realmId) : false)))).some(Boolean);
  res.json({
    qboConnected,
    gmailConnected: await hasGmailToken(req.session.tenantId),
    clientCount: clients.length
  });
});

app.get('/api/tenant', requireAuth, async (req, res) => {
  const tenant = await getTenant(req.session.tenantId);
  res.json({ tenant });
});

app.post('/api/tenant', requireAuth, async (req, res) => {
  const { displayName, llmMode, llmMinChangeCount } = req.body || {};
  const updated = await updateTenant(req.session.tenantId, { displayName, llmMode, llmMinChangeCount });
  res.json({ tenant: updated });
});

app.get('/api/clients', requireAuth, async (req, res) => {
  const clients = await listClients(req.session.tenantId);
  res.json({ clients });
});

app.post('/api/clients/:id', requireAuth, async (req, res) => {
  const { name, clientEmail, tags, schedule } = req.body || {};
  const updates = {
    name,
    clientEmail,
    tags: Array.isArray(tags) ? tags : [],
    schedule: schedule || { frequency: 'none' }
  };
  if (updates.schedule && updates.schedule.frequency !== 'none') {
    const next = computeNextRun(updates.schedule);
    updates.nextRunAt = next ? next.toISOString() : null;
  } else {
    updates.nextRunAt = null;
  }
  const updated = await updateClient(req.session.tenantId, req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Client not found' });
  await logAudit({ tenantId: req.session.tenantId, userId: req.session.userId, action: 'update_client', entityType: 'client', entityId: updated.id });
  res.json({ client: updated });
});

app.delete('/api/clients/:id', requireAuth, async (req, res) => {
  const ok = await deleteClient(req.session.tenantId, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Client not found' });
  await deleteSnapshot(req.session.tenantId, req.params.id);
  await deleteDraftsForClient(req.session.tenantId, req.params.id);
  await logAudit({ tenantId: req.session.tenantId, userId: req.session.userId, action: 'disconnect_client', entityType: 'client', entityId: req.params.id });
  res.json({ ok: true });
});

app.post('/api/run', requireAuth, async (req, res) => {
  try {
    const { clientId } = req.body || {};
    const clients = await listClients(req.session.tenantId);
    const targets = clientId ? clients.filter((c) => c.id === clientId) : clients;
    if (targets.length === 0) return res.status(404).json({ error: 'No matching clients found.' });

    const results = [];

    for (const client of targets) {
      if (!client.realmId) continue;
      const snapshot = await collectSnapshot(client.realmId, req.session.tenantId);
      const previous = await getSnapshot(req.session.tenantId, client.id);
      const { isFirst, changes } = computeChanges(snapshot, previous);

      await saveSnapshot(req.session.tenantId, client.id, snapshot);

      if (!isFirst && changes.length > 0) {
        const tenant = await getTenant(req.session.tenantId);
        const useLLM = shouldUseLLM({ tenant, changeCount: changes.length, isScheduledRun: false });
        const email = await draftEmail({
          clientName: client.name,
          changes,
          snapshot,
          useLLM
        });

        const draft = await createDraftEntry({
          tenantId: req.session.tenantId,
          clientId: client.id,
          clientName: client.name,
          clientEmail: client.clientEmail,
          subject: email.subject,
          body: email.body,
          changeCount: changes.length,
          isFirst
        });

        results.push({
          clientId: client.id,
          draftId: draft.id,
          changeCount: changes.length
        });
      } else {
        results.push({
          clientId: client.id,
          draftId: null,
          changeCount: changes.length,
          skipped: isFirst ? 'baseline' : 'no_changes'
        });
      }
    }

    await logAudit({ tenantId: req.session.tenantId, userId: req.session.userId, action: 'run_drafts', entityType: 'tenant', entityId: req.session.tenantId });
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/run-scheduled', requireAuth, async (req, res) => {
  try {
    const clients = await listClients(req.session.tenantId);
    const dueClients = clients.filter((c) => isDue(c.schedule, c.nextRunAt));
    if (dueClients.length === 0) return res.json({ ok: true, results: [] });

    const results = [];

    for (const client of dueClients) {
      if (!client.realmId) continue;
      const snapshot = await collectSnapshot(client.realmId, req.session.tenantId);
      const previous = await getSnapshot(req.session.tenantId, client.id);
      const { isFirst, changes } = computeChanges(snapshot, previous);

      await saveSnapshot(req.session.tenantId, client.id, snapshot);

      if (!isFirst && changes.length > 0) {
        const tenant = await getTenant(req.session.tenantId);
        const useLLM = shouldUseLLM({ tenant, changeCount: changes.length, isScheduledRun: true });
        const email = await draftEmail({
          clientName: client.name,
          changes,
          snapshot,
          useLLM
        });

        const draft = await createDraftEntry({
          tenantId: req.session.tenantId,
          clientId: client.id,
          clientName: client.name,
          clientEmail: client.clientEmail,
          subject: email.subject,
          body: email.body,
          changeCount: changes.length,
          isFirst
        });

        results.push({
          clientId: client.id,
          draftId: draft.id,
          changeCount: changes.length
        });
      } else {
        results.push({
          clientId: client.id,
          draftId: null,
          changeCount: changes.length,
          skipped: isFirst ? 'baseline' : 'no_changes'
        });
      }

      if (client.schedule && client.schedule.frequency !== 'none') {
        const next = computeNextRun(client.schedule);
        await updateClient(req.session.tenantId, client.id, { nextRunAt: next ? next.toISOString() : null });
      }
    }

    await logAudit({ tenantId: req.session.tenantId, userId: req.session.userId, action: 'run_scheduled', entityType: 'tenant', entityId: req.session.tenantId });
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/drafts', requireAuth, async (req, res) => {
  const drafts = await listDrafts(req.session.tenantId);
  res.json({ drafts });
});

app.post('/api/drafts/:id/approve', requireAuth, async (req, res) => {
  try {
    const draft = await getDraft(req.params.id);
    if (!draft || draft.tenantId !== req.session.tenantId) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    if (draft.status !== 'pending') {
      return res.status(400).json({ error: 'Draft already processed' });
    }

    const gmailRes = await createGmailDraft({
      to: draft.clientEmail,
      subject: draft.subject,
      body: draft.body,
      tokenKey: req.session.tenantId
    });

    const updated = await updateDraft(draft.id, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      gmailDraftId: gmailRes?.id || null
    });

    await logAudit({ tenantId: req.session.tenantId, userId: req.session.userId, action: 'approve_draft', entityType: 'draft', entityId: draft.id });
    res.json({ ok: true, draft: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/retention-run', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  await runRetention();
  await logAudit({ tenantId: req.session.tenantId, userId: req.session.userId, action: 'run_retention', entityType: 'tenant', entityId: req.session.tenantId });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running on ${BASE_URL}`);
});
