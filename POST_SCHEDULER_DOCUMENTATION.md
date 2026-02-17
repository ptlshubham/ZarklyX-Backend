# Social Media Post Scheduler - Documentation

## Overview

A crash-safe, fault-tolerant post scheduling system for Instagram, Facebook, and LinkedIn.

**Features:**
- Database-backed job queue
- Automatic retry (up to 3 attempts)
- Server crash recovery
- Dynamic worker scaling (1-5 workers)
- Multi-platform support
- Production-safe parallel processing

---

## Architecture

```
System Cron (every minute)
    ↓
post-scheduler.cron.ts (trigger)
    ↓
post-scheduler.dispatcher.ts (lock check + spawns workers)
    ↓
post-scheduler.worker-runner.ts (x1-5 workers)
    ↓
post-scheduler.worker.ts (parallel API calls)
    ↓
Platform APIs (Instagram/Facebook/LinkedIn)
```

### How the Dispatcher Works

1. **Cron triggers** dispatcher every minute
2. **Dispatcher acquires file lock** - prevents overlapping runs
3. **Counts pending posts** from database
4. **Calculates worker count** based on pending load
5. **Spawns N ephemeral workers** in parallel
6. **Workers process posts** using SKIP LOCKED (no blocking)
7. **Dispatcher releases lock** and exits

### Worker Scaling Logic

| Pending Posts | Workers Spawned |
|---------------|-----------------|
| 0             | 0               |
| 1-5           | 1               |
| 6-10          | 2               |
| 11-15         | 3               |
| 16-20         | 4               |
| 21+           | 5 (max)         |

---

## Production Safety Features

| Feature | Implementation | Purpose |
|---------|----------------|---------|
| **Lock Prevention** | `tmp/dispatcher.lock` file | Prevents overlapping cron runs |
| **SKIP LOCKED** | `lock: transaction.LOCK.UPDATE, skipLocked: true` | Workers don't block each other |
| **Connection Pool** | `pool: { max: 10, min: 2 }` in Sequelize | Prevents DB exhaustion |
| **Parallel Processing** | `pLimit(2)` inside workers | Controlled API concurrency |
| **Token Caching** | In-memory Map with 5min TTL | Reduces DB queries |
| **Partial Failure** | Dispatcher exits 0 unless ALL workers fail | Tolerates individual failures |

---

## Worker Lifecycle

### What is a "Cycle"?

A **cycle** is one complete execution of the worker (runs every minute via cron).

**Idle Cycle Optimization:**
- When no pending jobs are found, it's counted as an "idle cycle"
- Log shows: `idle cycle 3/5` = 3rd consecutive idle run
- After 5 idle cycles, worker skips heavy database operations
- Counter resets when jobs are found

Example log:
```
[WORKER] Starting cycle at 2026-02-02T05:51:00.644Z
[WORKER] No pending jobs (quick check), idle cycle 3/5
[WORKER] Idle cycle completed in 9ms
```

### Each Cycle Steps

1. **Quick Check** - Count pending posts (lightweight query)
2. **Recovery** - Unlock stuck jobs (>10 min) - skipped on idle cycles
3. **Fetch** - Get pending jobs where `runAt <= NOW()` using SKIP LOCKED
4. **Lock** - Mark as `processing` with worker ID
5. **Process** - Call platform APIs in parallel (2 concurrent)
6. **Update** - Mark as `done` or `failed`

### Job States

```
PENDING → PROCESSING → DONE
                   ↘ FAILED (retry if attempts < 3)
```

### Crash Recovery

- Jobs stuck in `processing` for >10 minutes are auto-released
- Posts that missed their schedule by >30 minutes are marked failed
- Stale locks from crashed workers are released on startup

---

## File Structure

```
src/
├── workers/
│   ├── post-scheduler.worker.ts         # Main worker logic + parallel processing
│   └── post-scheduler.worker-runner.ts  # Ephemeral worker entry point
├── cron/
│   ├── post-scheduler.cron.ts           # Cron trigger
│   ├── post-scheduler.dispatcher.ts     # Lock + worker spawning
│   └── init-scheduler.ts                # Embedded mode init
├── config/
│   └── dbSQL.ts                         # Connection pool configuration
└── routes/api-webapp/agency/social-Integration/social-posting/
    ├── post-details.model.ts            # Post details model
    ├── post-schedule.model.ts           # Job queue model
    ├── social-posting-api.ts            # API endpoints
    └── social-posting.handler.ts        # Business logic + SKIP LOCKED
```

---

## Database Schema

### post_details

| Column          | Type         | Description              |
|-----------------|--------------|--------------------------|
| id              | UUID         | Primary key              |
| companyId       | UUID         | Company reference        |
| socialAccountId | UUID         | Social account reference |
| platform        | ENUM         | instagram/facebook/linkedin |
| postType        | ENUM         | post/reel/story/video/carousel |
| caption         | TEXT         | Post caption             |
| media           | JSON         | Array of media URLs      |
| status          | ENUM         | pending/published/failed/cancelled |
| externalPostId  | VARCHAR      | Platform's post ID       |
| errorMessage    | TEXT         | Error if failed          |

### post_schedule

| Column       | Type     | Description               |
|--------------|----------|---------------------------|
| id           | UUID     | Primary key               |
| postDetailId | UUID     | Reference to post_details |
| runAt        | DATETIME | When to publish (UTC)     |
| status       | ENUM     | pending/processing/done/failed |
| lockedAt     | DATETIME | Lock timestamp            |
| workerId     | VARCHAR  | Worker processing this job |
| attempts     | INT      | Retry count               |

---

## API Endpoints

### POST /schedule-post

Schedule a post for future publishing.

**Request (multipart/form-data):**
```
files: File[]              # Media files
companyId: string          # Required
socialAccountId: string    # Required
platform: string           # instagram|facebook|linkedin
postType: string           # post|reel|story|video|carousel
caption: string            # Optional
scheduleAt: string         # ISO datetime (UTC)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "postDetailId": "uuid",
    "postScheduleId": "uuid",
    "scheduledFor": "2026-02-01T10:00:00Z",
    "status": "pending"
  }
}
```

### GET /scheduled-posts

Get scheduled posts with optional filters.

**Query Parameters:**
- `companyId` (required)
- `status` (optional): pending|published|failed|cancelled
- `month` (optional): YYYY-MM or M (uses current year)

### DELETE /scheduled-posts/:postDetailId

Cancel a pending scheduled post.

### GET /social-accounts

Get social accounts for a company.

### GET /clients

Get agency clients with their social accounts.

---

## Configuration

### Environment Variables

```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=password
DB_NAME=zarkly_db
```

### Worker Constants

| Constant           | Value | Location | Description              |
|--------------------|-------|----------|--------------------------|
| BATCH_SIZE         | 5     | worker.ts | Posts per worker         |
| MAX_WORKERS        | 5     | dispatcher.ts | Maximum parallel workers |
| CONCURRENCY_LIMIT  | 2     | worker.ts | Parallel API calls/worker |
| MAX_RETRIES        | 3     | worker.ts | Retry attempts           |
| TIMEOUT_MS         | 55000 | dispatcher.ts | Worker timeout          |
| LOCK_TIMEOUT_MS    | 60000 | dispatcher.ts | Lock expiry time        |
| TOKEN_CACHE_TTL_MS | 300000| worker.ts | Token cache lifetime (5min) |

### Connection Pool Settings

| Setting  | Value | Description |
|----------|-------|-------------|
| max      | 10    | Maximum connections |
| min      | 2     | Minimum connections (kept warm) |
| acquire  | 30000 | Timeout to acquire connection |
| idle     | 10000 | Release idle connections after |

---

## Setup

### 1. Database Migration

Run the migration to create tables:
```sql
-- post_details and post_schedule tables
```

### 2. Build TypeScript

```bash
npm run build
```

### 3. Create tmp directory (for lock file)

```bash
mkdir tmp
```

### 4. Setup System Cron

Add to `/etc/cron.d/social-scheduler`:
```bash
* * * * * root cd /var/www/app && node dist/cron/post-scheduler.cron.js >> /var/log/scheduler.log 2>&1
```

### Alternative: Embedded Mode

In `server.ts`:
```typescript
import { initScheduler } from './cron/init-scheduler';
import db from './db/core/control-db';

// After database init
await initScheduler(db, { timezone: 'UTC' });
```

---

## Monitoring

### Check Pending Posts
```sql
SELECT status, COUNT(*) FROM post_schedule GROUP BY status;
```

### Check Failed Posts
```sql
SELECT pd.id, pd.platform, pd.errorMessage, ps.attempts
FROM post_details pd
JOIN post_schedule ps ON ps.postDetailId = pd.id
WHERE pd.status = 'failed';
```

### View Logs
```bash
tail -f /var/log/scheduler.log
```

### Check Lock File
```bash
cat tmp/dispatcher.lock
```

---

## Troubleshooting

### Posts Not Publishing

1. Check worker is running: Look for cron logs
2. Check database connection
3. Verify social account has valid access token
4. Check `errorMessage` in `post_details`

### Workers Timing Out

1. Check API rate limits
2. Increase timeout if needed
3. Reduce BATCH_SIZE or CONCURRENCY_LIMIT

### Dispatcher Skipping Runs

Check if lock file is stale:
```bash
cat tmp/dispatcher.lock
# If older than 60s, delete it:
rm tmp/dispatcher.lock
```

### Duplicate Posts

- System uses `FOR UPDATE SKIP LOCKED` to prevent duplicates
- Each worker gets unique ID from dispatcher
- Never happens if SKIP LOCKED is working

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0    | Success (or lock not acquired - clean skip) |
| 1    | Error (all workers failed) |
| 2    | Timeout |

---

## Architecture Decision Records

### Why File Lock Instead of DB Advisory Lock?

- Simpler implementation
- Works across all MySQL versions
- Faster (no DB query needed)
- Auto-cleans on process crash (60s timeout)

### Why SKIP LOCKED Instead of NOWAIT?

- SKIP LOCKED lets workers proceed with OTHER rows
- NOWAIT would fail the entire query if ANY row is locked
- Better for parallel processing

### Why In-Memory Token Cache?

- Ephemeral workers = fresh cache each run (no stale data risk)
- Reduces DB queries when same account has multiple posts
- 5 minute TTL is safe for token validity
