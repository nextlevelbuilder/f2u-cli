import type { Env, FileRecord } from '../types';

/**
 * Cron job: batch-delete expired files from R2 and mark them deleted in D1.
 * Runs up to 50 records per invocation to stay within CPU limits.
 */
export async function cleanupExpiredFiles(env: Env): Promise<void> {
  const now = new Date().toISOString();

  let expired: FileRecord[];
  try {
    const result = await env.D1_DATABASE.prepare(
      `SELECT * FROM files
       WHERE deleted = 0 AND expires_at <= ?
       LIMIT 50`,
    )
      .bind(now)
      .all<FileRecord>();

    expired = result.results;
  } catch (err) {
    console.error('Cleanup: D1 query error:', err);
    return;
  }

  if (expired.length === 0) {
    // Nothing to clean up — exit gracefully
    return;
  }

  console.log(`Cleanup: processing ${expired.length} expired file(s)`);

  // Batch delete from R2 (individual deletes — R2 has no batch delete API)
  const r2Deletions = expired.map((record) =>
    env.R2_BUCKET.delete(record.r2_key).catch((err) => {
      console.error(`Cleanup: R2 delete failed for key ${record.r2_key}:`, err);
    }),
  );
  await Promise.all(r2Deletions);

  // Batch mark deleted in D1 using placeholders
  const ids = expired.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(', ');

  try {
    await env.D1_DATABASE.prepare(
      `UPDATE files SET deleted = 1 WHERE id IN (${placeholders})`,
    )
      .bind(...ids)
      .run();
    console.log(`Cleanup: marked ${ids.length} file(s) as deleted`);
  } catch (err) {
    console.error('Cleanup: D1 batch update error:', err);
  }
}
