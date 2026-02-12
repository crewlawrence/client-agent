import 'dotenv/config';
import { deleteOldDrafts } from './drafts.js';
import { deleteOldSnapshots } from './snapshots.js';
import { deleteOldAudit } from './audit.js';
import { deleteExpiredSessions } from './sessions.js';

const draftsDays = Number(process.env.RETENTION_DAYS_DRAFTS || 90);
const snapshotsDays = Number(process.env.RETENTION_DAYS_SNAPSHOTS || 180);
const auditDays = Number(process.env.RETENTION_DAYS_AUDIT || 365);

export async function runRetention() {
  await deleteOldDrafts(draftsDays);
  await deleteOldSnapshots(snapshotsDays);
  await deleteOldAudit(auditDays);
  await deleteExpiredSessions();
}

if (process.argv[1].includes('retention.js')) {
  runRetention()
    .then(() => console.log('Retention complete'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
