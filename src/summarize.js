import OpenAI from 'openai';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function buildTemplate(clientName, changes, snapshot) {
  const lines = [];
  lines.push(`Hi ${clientName},`);
  lines.push('');

  if (!changes || changes.length === 0) {
    lines.push('No major changes stood out since the last update. Here is a quick snapshot:');
  } else {
    lines.push('Here are the most meaningful changes since the last update:');
    for (const change of changes) {
      lines.push(`- ${change.label}: ${change.current} (was ${change.previous}, change ${change.delta})`);
    }
  }

  lines.push('');
  lines.push('Current snapshot:');
  lines.push(`- Cash: ${formatOrNA(snapshot.cash)}`);
  lines.push(`- Accounts receivable: ${formatOrNA(snapshot.accountsReceivable)}`);
  lines.push(`- Accounts payable: ${formatOrNA(snapshot.accountsPayable)}`);
  lines.push(`- Net income (last 30 days): ${formatOrNA(snapshot.netIncomeLast30Days)}`);
  lines.push(`- Open invoices: ${snapshot.invoicesOpen?.recentCount ?? 'n/a'} (${formatOrNA(snapshot.invoicesOpen?.openTotal)})`);
  lines.push(`- Open bills: ${snapshot.billsOpen?.recentCount ?? 'n/a'} (${formatOrNA(snapshot.billsOpen?.openTotal)})`);

  lines.push('');
  lines.push('If you want a deeper dive or any follow-up, just reply and I can send a detailed report.');
  lines.push('');
  lines.push('Best,');
  lines.push('Your bookkeeping team');

  return lines.join('\n');
}

function formatOrNA(value) {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  return String(value);
}

export async function draftEmail({ clientName, changes, snapshot, useLLM = false }) {
  if (!useLLM || !process.env.OPENAI_API_KEY) {
    return {
      subject: `QuickBooks update - ${clientName}`,
      body: buildTemplate(clientName, changes, snapshot)
    };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = [
    {
      role: 'system',
      content: 'You are a helpful bookkeeping assistant. Write concise, professional client update emails. Avoid sensitive data beyond the provided metrics. Keep under 180 words.'
    },
    {
      role: 'user',
      content: JSON.stringify({ clientName, changes, snapshot })
    }
  ];

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: prompt,
    temperature: 0.2
  });

  const body = res.choices?.[0]?.message?.content?.trim() || buildTemplate(clientName, changes, snapshot);
  return {
    subject: `QuickBooks update - ${clientName}`,
    body
  };
}
