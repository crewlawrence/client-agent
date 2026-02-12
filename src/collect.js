import { qboQuery, qboReport } from './qbo.js';

function findValueByLabel(rows, matchers) {
  if (!rows) return null;
  for (const row of rows) {
    if (row.Header?.ColData?.length) {
      const label = row.Header.ColData[0].value || '';
      if (matchers.some((m) => label.toLowerCase().includes(m))) {
        const value = row.Header.ColData[row.Header.ColData.length - 1]?.value;
        return numberOrNull(value);
      }
    }
    if (row.Summary?.ColData?.length) {
      const label = row.Summary.ColData[0].value || '';
      if (matchers.some((m) => label.toLowerCase().includes(m))) {
        const value = row.Summary.ColData[row.Summary.ColData.length - 1]?.value;
        return numberOrNull(value);
      }
    }
    if (row.Rows?.Row?.length) {
      const nested = findValueByLabel(row.Rows.Row, matchers);
      if (nested !== null && nested !== undefined) return nested;
    }
  }
  return null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function totalColData(row) {
  const col = row?.ColData;
  if (!col || col.length === 0) return null;
  return numberOrNull(col[col.length - 1]?.value);
}

function summarizeInvoices(invoices) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let recentCount = 0;
  let openTotal = 0;

  for (const invoice of invoices) {
    if (invoice.TxnDate && new Date(invoice.TxnDate) >= weekAgo) recentCount += 1;
    const balance = Number(invoice.Balance || 0);
    if (!Number.isNaN(balance)) openTotal += balance;
  }

  return { recentCount, openTotal };
}

function summarizeBills(bills) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let recentCount = 0;
  let openTotal = 0;

  for (const bill of bills) {
    if (bill.TxnDate && new Date(bill.TxnDate) >= weekAgo) recentCount += 1;
    const balance = Number(bill.Balance || 0);
    if (!Number.isNaN(balance)) openTotal += balance;
  }

  return { recentCount, openTotal };
}

export async function collectSnapshot(realmId, tenantId = 'default') {
  const [balanceSheet, profitLoss, invoiceData, billData] = await Promise.all([
    qboReport(realmId, 'BalanceSheet', { accounting_method: 'Accrual' }, tenantId),
    qboReport(realmId, 'ProfitAndLoss', {
      accounting_method: 'Accrual',
      date_macro: 'Last30Days'
    }, tenantId),
    qboQuery(realmId, 'select Id, TxnDate, Balance from Invoice where Balance > \'0\' order by TxnDate desc maxresults 50', tenantId),
    qboQuery(realmId, 'select Id, TxnDate, Balance from Bill where Balance > \'0\' order by TxnDate desc maxresults 50', tenantId)
  ]);

  const bsRows = balanceSheet?.Rows?.Row || [];
  const cash = findValueByLabel(bsRows, ['cash and cash equivalents', 'cash']);
  const ar = findValueByLabel(bsRows, ['accounts receivable', 'total accounts receivable']);
  const ap = findValueByLabel(bsRows, ['accounts payable', 'total accounts payable']);

  const plRows = profitLoss?.Rows?.Row || [];
  const netIncome = findValueByLabel(plRows, ['net income', 'net earnings']);

  const invoices = invoiceData?.QueryResponse?.Invoice || [];
  const bills = billData?.QueryResponse?.Bill || [];

  const invoiceSummary = summarizeInvoices(invoices);
  const billSummary = summarizeBills(bills);

  return {
    capturedAt: new Date().toISOString(),
    cash,
    accountsReceivable: ar,
    accountsPayable: ap,
    netIncomeLast30Days: netIncome,
    invoicesOpen: invoiceSummary,
    billsOpen: billSummary
  };
}

export function computeChanges(current, previous) {
  if (!previous) return { isFirst: true, changes: [] };

  const changes = [];

  function compare(label, key, formatter = (v) => v) {
    const cur = current[key];
    const prev = previous[key];
    if (cur === null || cur === undefined || prev === null || prev === undefined) return;
    const delta = cur - prev;
    if (Math.abs(delta) < 1e-6) return;
    const pct = prev === 0 ? null : (delta / prev) * 100;
    const important = Math.abs(delta) >= 500 || (pct !== null && Math.abs(pct) >= 10);
    if (important) {
      changes.push({
        label,
        current: formatter(cur),
        previous: formatter(prev),
        delta: formatter(delta),
        percent: pct ? `${pct.toFixed(1)}%` : 'n/a'
      });
    }
  }

  compare('Cash balance', 'cash', formatCurrency);
  compare('Accounts receivable', 'accountsReceivable', formatCurrency);
  compare('Accounts payable', 'accountsPayable', formatCurrency);
  compare('Net income (last 30 days)', 'netIncomeLast30Days', formatCurrency);

  function compareNested(label, key, prop, formatter = (v) => v) {
    const cur = current[key]?.[prop];
    const prev = previous[key]?.[prop];
    if (cur === null || cur === undefined || prev === null || prev === undefined) return;
    const delta = cur - prev;
    const important = Math.abs(delta) >= 3;
    if (important) {
      changes.push({
        label,
        current: formatter(cur),
        previous: formatter(prev),
        delta: formatter(delta),
        percent: 'n/a'
      });
    }
  }

  compareNested('Open invoices (count)', 'invoicesOpen', 'recentCount', formatInteger);
  compareNested('Open bills (count)', 'billsOpen', 'recentCount', formatInteger);
  compareNested('Open invoices (balance)', 'invoicesOpen', 'openTotal', formatCurrency);
  compareNested('Open bills (balance)', 'billsOpen', 'openTotal', formatCurrency);

  return { isFirst: false, changes };
}

function formatCurrency(value) {
  if (value === null || value === undefined) return 'n/a';
  const num = Number(value);
  if (Number.isNaN(num)) return 'n/a';
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatInteger(value) {
  if (value === null || value === undefined) return 'n/a';
  const num = Number(value);
  if (Number.isNaN(num)) return 'n/a';
  return num.toLocaleString('en-US');
}
