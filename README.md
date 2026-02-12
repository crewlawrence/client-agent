# QBO Client Update Agent

Web app that connects to QuickBooks Online, gathers key financial data, detects meaningful changes, and drafts brief Gmail updates for clients.

## What it does
- Connects to QuickBooks Online via OAuth
- Pulls cash, AR/AP, net income (last 30 days), and open invoice/bill snapshots
- Compares current vs previous snapshot to detect meaningful changes
- Drafts or sends short client emails via Gmail
- Uses LLM summaries only when the buyer policy requires it (default: monthly scheduled runs)

## Setup
1. Copy `.env.example` to `.env` and fill in credentials.
2. Install dependencies: `npm install`
3. Run migrations: `npm run migrate`
4. Start the app: `npm run dev`

## OAuth setup
### QuickBooks Online
- Create an Intuit developer app
- Add redirect URI: `http://localhost:3000/callback/quickbooks`
- Use your `client_id` and `client_secret` in `.env`

### Gmail
- Create a Google Cloud project + OAuth client
- Enable Gmail API
- Add redirect URI: `http://localhost:3000/callback/gmail`
- Use your `client_id` and `client_secret` in `.env`

## Connect accounts
- Sign up at `http://localhost:3000/signup` (self-serve) or sign in at `http://localhost:3000/login`
- In the dashboard, click **Connect a client** to link a QuickBooks company file.
- Connect Gmail once per tenant to enable drafting.

## Notes
- Tokens are stored encrypted in Postgres (AES-256-GCM via `ENCRYPTION_KEY`).
- Multi-tenant access is enforced by `tenantId`.
- Per-client schedules and tags are stored on each client.
- Scheduled runs can be triggered via `POST /api/run-scheduled`.
- Retention can be run via `npm run retention`.
- Audit logs are stored in Postgres (`audit_logs`).

## Production checklist
- Set `NODE_ENV=production`
- Set `BASE_URL` to your HTTPS domain
- Use the reverse proxy example in `config/nginx.example.conf`
- Use a strong 256-bit `ENCRYPTION_KEY`
- Set `DATABASE_URL` to your managed Postgres instance
