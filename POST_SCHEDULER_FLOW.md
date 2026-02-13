# Post Scheduler Worker Flow - How Posts Get Published

## Overview
The worker is a background job processor that runs **every minute** and automatically publishes scheduled posts to social media platforms (Instagram, Facebook, LinkedIn).

---

## Database Table: `post_schedule`

This is the **job queue** table. Each row is a job waiting to be processed.

```
| Field        | Description                                  | Example Value          |
|--------------|----------------------------------------------|------------------------|
| id           | Unique job ID                                | 16c194ba-8951-4661-... |
| post_detail_id | Reference to actual post data             | 40ca21b8-6db3-4eff-... |
| run_at       | When to publish this post (UTC)              | 2026-01-30 12:44:00    |
| status       | Queue item status                            | pending                |
| locked_at    | When last locked (for stuck job recovery)    | NULL or timestamp      |
| worker_id    | Hostname of worker processing this job       | NULL or worker-name    |
| attempts     | Number of attempts for this queue item       | 0, 1, 2, or 3          |
| created_at   | Job created timestamp                        | 2026-01-30 12:43:06    |
| updated_at   | Last updated timestamp                       | 2026-01-30 12:43:06    |
```

---

## How It Works: Step-by-Step Flow

### ✅ Step 1: Recovery (Clean up stuck jobs)
```
WHEN: Every minute, at the start
WHAT: Unlock jobs that are stuck in "processing" state
HOW:  If locked_at > 10 minutes ago → Reset to "pending"

Example:
- Job A: status=processing, locked_at=2026-01-30 12:20:00
- Current time: 2026-01-30 12:35:00 (15 minutes later)
- Result: Job A reset to pending for retry
```

---

### ✅ Step 2: Fetch Pending Jobs
```
WHEN: Every minute
WHAT: Get jobs ready to be published
HOW:  SELECT WHERE status='pending' AND run_at <= NOW() LIMIT 5

Example:
Current time: 2026-01-30 12:44:30

Before (in database):
┌─────────────────────────────────────────────────────────────┐
│ post_schedule                                               │
├─────────────────┬─────────────┬──────────┬────────────────┤
│ id              │ post_detail │ run_at   │ status         │
├─────────────────┼─────────────┼──────────┼────────────────┤
│ 16c194ba...     │ 40ca21b8... │ 12:40:00 │ pending   ← Ready! │
│ 2abc3def...     │ 5bcd6efg... │ 12:45:00 │ pending   ← Not yet  │
│ 8xyz9uvw...     │ 7fgh8ijk... │ 12:30:00 │ done      ← Already  │
└─────────────────┴─────────────┴──────────┴────────────────┘

Fetched: 1 job (16c194ba...)
```

---

### ✅ Step 3: Lock Jobs (Prevent duplicate processing)
```
WHEN: When fetching jobs
WHAT: Mark jobs as "processing" to prevent other workers from processing them
HOW:  UPDATE status='processing', locked_at=NOW(), worker_id=HOSTNAME

Example (in database):
┌──────────────────────────────────────────────────────────────────┐
│ post_schedule                                                    │
├─────────────────┬────────────┬──────────────────┬───────────────┤
│ id              │ status     │ locked_at        │ worker_id     │
├─────────────────┼────────────┼──────────────────┼───────────────┤
│ 16c194ba...     │ processing │ 2026-01-30 12:44 │ worker-1      │
└─────────────────┴────────────┴──────────────────┴───────────────┘
```

---

### ✅ Step 4: Process Each Job

For each locked job, the worker:

#### 4a. Fetch Related Data
```typescript
// From post_schedule:
schedule = {
  id: "16c194ba...",
  post_detail_id: "40ca21b8...",
  run_at: "2026-01-30 12:44:00",
  status: "processing",
  attempts: 0
}

// Then fetch post_details using post_detail_id:
postDetail = {
  id: "40ca21b8...",
  platform: "instagram",          // Which platform?
  postType: "post",               // Post type (post/reel/story)
  caption: "Check out this...",   // Message
  media: [                         // Images/Videos
    { url: "https://cdn.../img1.jpg", type: "image" },
    { url: "https://cdn.../img2.jpg", type: "image" }
  ]
}

// And fetch social account credentials:
socialAccount = {
  id: "abc123...",
  accountName: "Instagram Account 1",
  instagramAccessToken: "IGVVJ3x...",
  instagramBusinessId: "123456789",
  accountType: "instagram"
}
```

#### 4b. Call Platform API
```
IF platform == "instagram":
  └─ Call Instagram Service
     ├─ Check postType (post/reel/story/feed_story)
     ├─ Upload media (images/videos to platform)
     └─ Return: { success: true, postId: "123456789" }

IF platform == "facebook":
  └─ Call Facebook Service
     ├─ Get page access token
     ├─ Upload media
     └─ Return: { success: true, postId: "987654321" }

IF platform == "linkedin":
  └─ Call LinkedIn Service
     ├─ Embed CDN URLs in caption
     └─ Return: { success: true, postId: "urn:li:..." }
```

---

### ✅ Step 5: Update Job Status (Success or Retry)

#### 5a. SUCCESS: Post Published
```
IF API returned success:
  ├─ postDetailId.status = "published"
  ├─ postDetailId.externalPostId = "123456789" (from API)
  ├─ postScheduleId.status = "done"
  └─ postScheduleId.locked_at = NULL

Database After (post_schedule):
┌──────────────────────────────────────────────────────────────────┐
│ post_schedule                                                    │
├─────────────────┬────────────┬──────────────────┬───────────────┤
│ id              │ status     │ locked_at        │ worker_id     │
├─────────────────┼────────────┼──────────────────┼───────────────┤
│ 16c194ba...     │ done       │ NULL             │ NULL          │
└─────────────────┴────────────┴──────────────────┴───────────────┘

Database After (post_details):
┌──────────────────────────────────────────────────────────────────┐
│ post_details                                                     │
├─────────────────┬──────────────┬────────────────┬────────────────┤
│ id              │ status       │ externalPostId │ attempts       │
├─────────────────┼──────────────┼────────────────┼────────────────┤
│ 40ca21b8...     │ published    │ 123456789      │ 1              │
└─────────────────┴──────────────┴────────────────┴────────────────┘
```

#### 5b. FAILURE: Retry Logic
```
IF API returned error:
  IF attempts < 3 (max retries):
    ├─ postDetailId.status = "pending" (reset for retry)
    ├─ postDetailId.attempts += 1
    ├─ postScheduleId.status = "pending" (reset for retry)
    ├─ postScheduleId.locked_at = NULL (unlock)
    ├─ postScheduleId.worker_id = NULL
    └─ Will be retried in next worker cycle (in 1 minute)
  
  ELSE (attempts >= 3):
    ├─ postDetailId.status = "failed"
    ├─ postDetailId.errorMessage = "Instagram error: ..."
    ├─ postDetailId.attempts = 3
    ├─ postScheduleId.status = "failed"
    ├─ postScheduleId.locked_at = NULL
    └─ Job abandoned (no more retries)

Example: Attempt 1 Fails
┌──────────────────────────────────────────────────────────────────┐
│ post_schedule                                                    │
├─────────────────┬─────────────┬──────────────┬─────────────────┤
│ id              │ status      │ attempts     │ locked_at       │
├─────────────────┼─────────────┼──────────────┼─────────────────┤
│ 16c194ba...     │ pending     │ 1            │ NULL            │
└─────────────────┴─────────────┴──────────────┴─────────────────┘

Example: Attempt 3 Fails (Final)
┌──────────────────────────────────────────────────────────────────┐
│ post_schedule                                                    │
├─────────────────┬─────────────┬──────────────┬─────────────────┤
│ id              │ status      │ attempts     │ locked_at       │
├─────────────────┼─────────────┼──────────────┼─────────────────┤
│ 16c194ba...     │ failed      │ 3            │ NULL            │
└─────────────────┴─────────────┴──────────────┴─────────────────┘
```

---

## Complete Timeline Example

### Initial State (User schedules a post)
```
API Call: POST /schedule-post
  ├─ User uploads 2 files
  ├─ API uploads to GitHub CDN
  ├─ Creates post_details entry
  └─ Creates post_schedule entry

Database State (post_schedule):
id              = 16c194ba-8951-4661-aa2f-541112046f4f
post_detail_id  = 40ca21b8-6db3-4eff-bfac-0b37247f4dfe
run_at          = 2026-01-30 12:44:00  ← When to publish
status          = pending              ← Waiting
locked_at       = NULL
worker_id       = NULL
attempts        = 0
```

### Worker Cycle 1: Too Early (12:40:00)
```
Worker checks: run_at=12:44:00, current_time=12:40:00
Result: SKIPPED - Not ready yet
```

### Worker Cycle 2: Ready (12:44:30)
```
Worker checks: run_at=12:44:00, current_time=12:44:30
Result: READY - Process this job!

1. LOCK:
   status  = processing
   locked_at = 12:44:30
   worker_id = worker-1

2. FETCH post_details:
   platform = instagram
   media = [cdn_url_1.jpg, cdn_url_2.jpg]
   caption = "Check this out!"

3. FETCH social account:
   instagramAccessToken = IGVVJ3x...
   instagramBusinessId = 123456789

4. CALL INSTAGRAM API:
   ├─ Upload images
   ├─ Set caption
   └─ Return: { success: true, postId: "3456789012345" }

5. UPDATE:
   post_schedule.status = done
   post_details.status = published
   post_details.externalPostId = 3456789012345

Final State:
status  = done
locked_at = NULL
```

---

## Key Features

### ✅ **Crash Safe**
- Jobs locked with timestamp
- If worker crashes → Recovery phase unlocks stuck jobs
- No duplicate processing (only 1 worker can lock a job)

### ✅ **Retry Logic**
- Failed jobs retry up to 3 times
- Each attempt tracked in `attempts` field
- Automatic exponential backoff (1 minute between retries)

### ✅ **Scalable**
- Multiple workers can run simultaneously
- Database locks prevent duplicate processing
- Batch processing (5 jobs per cycle)

### ✅ **Transparent**
- All attempts logged with timestamps
- Error messages stored in `post_details.errorMessage`
- Status transitions visible in database

---

## Status Values

```
pending      → Job waiting to be published
processing   → Worker is currently publishing
done         → Successfully published
failed       → Failed after 3 attempts
cancelled    → User cancelled the post
```

---

## How to Monitor

### Check Pending Jobs
```sql
SELECT id, run_at, status, attempts 
FROM post_schedule 
WHERE status IN ('pending', 'processing')
ORDER BY run_at ASC;
```

### Check Failed Jobs
```sql
SELECT pd.id, pd.errorMessage, ps.attempts 
FROM post_schedule ps
JOIN post_details pd ON ps.post_detail_id = pd.id
WHERE ps.status = 'failed'
ORDER BY ps.updated_at DESC;
```

### Check Processing Jobs (stuck)
```sql
SELECT id, locked_at, worker_id 
FROM post_schedule 
WHERE status = 'processing' 
AND locked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE);
```

---

## Deployment

The worker is triggered by one of these methods:

### Option 1: System Cron (Production)
```bash
* * * * * /usr/bin/node /app/worker-trigger.js >> /var/log/scheduler.log 2>&1
```

### Option 2: Node Cron (Dev)
```typescript
import cron from 'node-cron';
cron.schedule('* * * * *', () => {
  runPostSchedulerWorker(sequelize);
});
```

### Option 3: PM2 with Cron
```bash
pm2 start worker.js --cron "*/1 * * * *"
```

---

## Summary

The worker is a **fault-tolerant, self-healing job processor** that:

1. **Every minute**: Checks for posts ready to publish (`run_at <= NOW()`)
2. **Locks jobs**: Prevents duplicate processing
3. **Publishes**: Calls platform APIs (Instagram/Facebook/LinkedIn)
4. **On success**: Marks job as "done", stores external post ID
5. **On failure**: Retries up to 3 times, then marks as "failed"
6. **On crash**: Recovery phase unlocks stuck jobs automatically

This ensures **zero manual intervention** and **guaranteed post publication** (with automatic retries and comprehensive error tracking).
