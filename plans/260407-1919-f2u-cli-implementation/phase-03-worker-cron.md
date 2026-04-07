# Phase 3: Worker Cron Cleanup

## Overview
- **Priority**: P1
- **Status**: Pending
- **Effort**: 30m
- **Blocked by**: Phase 2 (reuses types and DB patterns)

Cron trigger runs every minute, queries D1 for expired files, batch-deletes from R2, marks deleted in D1.

## Implementation

### `packages/worker/src/cron/cleanup.ts`

```typescript
import type { Env, FileRecord } from '../types';

const BATCH_SIZE = 50;

export async function cleanupExpiredFiles(env: Env): Promise<void> {
  const { results } = await env.D1_DATABASE.prepare(
    `SELECT id, r2_key FROM files
     WHERE deleted = 0 AND expires_at <= datetime('now')
     LIMIT ?`
  ).bind(BATCH_SIZE).all<Pick<FileRecord, 'id' | 'r2_key'>>();

  if (!results || results.length === 0) return;

  // Batch delete from R2
  const r2Keys = results.map((r) => r.r2_key);
  await env.R2_BUCKET.delete(r2Keys);

  // Mark deleted in D1
  const ids = results.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  await env.D1_DATABASE.prepare(
    `UPDATE files SET deleted = 1 WHERE id IN (${placeholders})`
  ).bind(...ids).run();
}
```

### Wrangler cron config (in wrangler.toml, Phase 5)

```toml
[triggers]
crons = ["* * * * *"]
```

## Edge Cases

- **More than 50 expired files**: Next cron invocation picks up the rest. No need for loop — 1-min interval handles backlog.
- **R2 delete fails**: File stays in R2 but is already expired. GET route checks D1 expiry and returns 410. Next cron retry will clean up.
- **D1 batch update limit**: 50 items is well within D1's limits.

## Todo

- [ ] Implement `cleanupExpiredFiles` function
- [ ] Export and wire into scheduled handler in index.ts
- [ ] Test with `wrangler dev --test-scheduled` (triggers cron locally)

## Success Criteria

- Expired files are deleted from R2 within 2 minutes of expiry
- D1 records marked `deleted = 1` after cleanup
- No errors in worker logs during cron execution
- Handles empty result set gracefully (no-op)
