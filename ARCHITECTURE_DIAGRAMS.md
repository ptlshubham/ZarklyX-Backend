# Social Media Post Scheduler - Visual Architecture

## System Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SOCIAL MEDIA SCHEDULER                          │
└─────────────────────────────────────────────────────────────────────┘

                           ┌────────────────┐
                           │  SYSTEM CRON   │ (runs every minute)
                           │   * * * * *    │
                           └────────┬────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │   worker-trigger.js       │
                    │   (launcher script)       │
                    └───────────┬───────────────┘
                                │
                                ├─ Authenticate DB
                                │
                                ▼
                    ┌───────────────────────────┐
                    │  post-scheduler.corn.ts   │
                    │   (worker process)        │
                    └───────────┬───────────────┘
                                │
                 ┌──────────────┼──────────────┐
                 │              │              │
                 ▼              ▼              ▼
            [RECOVERY]      [FETCH JOBS]   [PROCESS]
                 │              │              │
                 │              │              │
    Recover      │     Get 5 pending    API calls
    stuck jobs   │     jobs where       Platform
    (>10 min)    │     run_at <= NOW()   integration
                 │                       Retry logic
                 │
                 └──────────────┬──────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │   DATABASE      │
                        └─────────────────┘
                         │               │
                    post_details    post_schedule
                         │               │
                         └─ QUEUE (Job Queue)
```

---

## API Layer (Express)

```
POST /schedule-post
├─ Input Validation
│  ├─ Required fields
│  ├─ UUID validation
│  └─ Date in future
│
├─ Transaction Block
│  ├─ Verify social account exists
│  ├─ Create post_details (pending)
│  ├─ Create post_schedule (pending)
│  └─ COMMIT or ROLLBACK
│
└─ Response 201 Created
```

```
GET /social-accounts?companyId=uuid
├─ Query MetaSocialAccount table
└─ Return list of accounts

GET /clients?companyId=uuid
├─ Query Clients table
├─ Include metaSocialAccounts
└─ Return list with accounts

GET /scheduled-posts?companyId=uuid&status=pending
├─ Query post_details + post_schedule
├─ Filter by status/company
└─ Return list

DELETE /scheduled-posts/:id?companyId=uuid
├─ Verify post status == 'pending'
├─ Update to 'cancelled'
└─ Response 200 OK
```

---

## Database Queue Pattern

```
                    ┌─ Status Lifecycle ─┐
                    │                    │
    POST /schedule-post                 │
         │                              │
         ▼                              │
    post_details ──────────────────┐   │
    (metadata)                    │   │
         │                        │   │
         │          ┌─────────────┘   │
         │          │                 │
         ▼          ▼                 │
    post_schedule                     │
    (queue)                           │
    ┌─────────────────────────────┐   │
    │ id: uuid                    │   │
    │ post_detail_id: uuid (FK)   │   │
    │ run_at: datetime (UTC)      │   │
    │ status: pending ────────────┼───┘
    │ locked_at: null             │
    │ worker_id: null             │
    │ attempts: 0                 │
    └──────────────┬──────────────┘
                   │
              (Time passes)
                   │ run_at <= NOW()
                   │
                   ▼
    ┌──────────────────────────────┐
    │ SELECT ... FOR UPDATE        │
    │ SKIP LOCKED                  │
    │ (Atomic fetch)               │
    └──────────────┬───────────────┘
                   │
                   ▼
    ┌──────────────────────────────┐
    │ UPDATE status = processing   │
    │ UPDATE locked_at = NOW()     │
    │ UPDATE worker_id = hostname  │
    │ UPDATE attempts + 1          │
    │ (Job is now locked)          │
    └──────────────┬───────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
     SUCCESS              FAILURE
        │                     │
        ▼                     ▼
    API Call            Retry?
    Successful           │
        │          ┌─────┴─────┐
        │          │           │
        │          ▼           ▼
        │      <3 attempts   >=3 attempts
        │          │           │
        │          ▼           ▼
        │      PENDING       FAILED
        │          │           │
        └─────┬────┘           │
              │                │
              ▼                ▼
    ┌──────────────────────────────┐
    │ UPDATE status = published/done│
    │ (Job complete)               │
    │ OR                           │
    │ status = pending (retry)     │
    │ OR                           │
    │ status = failed              │
    └──────────────────────────────┘
```

---

## Worker Concurrency Safety

```
Worker A              Worker B              Database
  │                     │                      │
  ├─ Query pending ─────────────────────────────>│
  │                     │                      │
  │                     ├─ Query pending ─────────>│
  │                     │                      │
  │                     │ <─ Result (A locked)─│
  │                     │                      │
  │ <─ Result (B locked)│                      │
  │                     │                      │
  ├─ FOR UPDATE       │                      │
  │ SKIP LOCKED       │                      │
  │                     │ FOR UPDATE            │
  │                     │ SKIP LOCKED           │
  │                     │                      │
  │ (Gets unlocked rows)│ (Gets different rows)│
  │                     │ (No duplicates)       │
  │                     │                      │
  ├─ Lock rows ────────────────────────────────>│
  │                     │                      │
  │                     ├─ Lock rows ──────────>│
  │                     │                      │
  │ (Process job A)     │ (Process job B)      │
  │ (Can run parallel)  │ (Can run parallel)   │
  │                     │                      │
  └─────────┬───────────┴───────────────────────>│
            │   Both commit atomically
            └─ NO DUPLICATES, NO RACE CONDITIONS
```

---

## Retry Flow Diagram

```
Attempt 1: PENDING
  │
  ├─ Lock + Process
  │  │
  │  ├─ Success ─────────┐
  │  │                   │
  │  └─ API Error        │
  │     │                │
  │     ├─ attempts < 3  │
  │     │  └─ PENDING    │
  │     │     (unlock)   │
  │     │                │
  │     └─ attempts >= 3 │
  │        └─ Check...   │
  │           (don't do) │
  │                   PUBLISHED
  │
  ▼ Next cycle (1 minute)
Attempt 2: PENDING
  │
  ├─ Lock + Process
  │  │
  │  ├─ Success ─────────┐
  │  │                   │
  │  └─ API Error        │
  │     │                │
  │     └─ attempts < 3  │
  │        └─ PENDING    │
  │           (unlock)   │
  │                   PUBLISHED
  │
  ▼ Next cycle (1 minute)
Attempt 3: PENDING
  │
  ├─ Lock + Process
  │  │
  │  ├─ Success ─────────┐
  │  │                   │
  │  └─ API Error        │
  │     │                │
  │     └─ attempts >= 3 │
  │        └─ FAILED     │
  │           + error_message
  │                   PUBLISHED
  │
  ▼ FINAL STATE
FAILED (no more retries)
  │
  └─ Alert admin
  └─ User can reschedule
```

---

## Transaction Safety

```
Scenario: Schedule Post (Transaction 1)
┌─────────────────────────────────────┐
│ Transaction                         │
├─────────────────────────────────────┤
│ 1. BEGIN                            │
│ 2. Verify social_account exists     │
│ 3. INSERT post_details              │
│ 4. INSERT post_schedule             │
│ 5. COMMIT                           │
│                                     │
│ If error at ANY step:               │
│ → ROLLBACK (all changes undone)     │
│ → No orphaned records               │
└─────────────────────────────────────┘

Scenario: Mark as Published (Transaction 2)
┌─────────────────────────────────────┐
│ Transaction                         │
├─────────────────────────────────────┤
│ 1. BEGIN                            │
│ 2. UPDATE post_details status       │
│ 3. UPDATE post_schedule status      │
│ 4. COMMIT                           │
│                                     │
│ If error at ANY step:               │
│ → ROLLBACK                          │
│ → Job remains locked                │
│ → Next recovery cycle fixes it      │
└─────────────────────────────────────┘
```

---

## Data Model Relationships

```
MetaSocialAccount (1)
      │
      │ 1:M
      │
      ▼
  PostDetails
      │
      │ 1:1
      │
      ▼
  PostSchedule (QUEUE)
      │
      ├─ status: pending/processing/done/failed
      ├─ run_at: datetime (UTC)
      ├─ locked_at: recovery timestamp
      └─ worker_id: processing worker

Company (1)
      │
      │ 1:M
      │
      ▼
  PostDetails
      │
      └─ ensures company owns post

Clients (1)
      │
      │ M:1 (optional)
      │
      ▼
  PostDetails
      │
      └─ post assigned to client
```

---

## Crash Recovery Timeline

```
Timeline: Worker dies at processing

T=0      Worker fetches & locks job
         │
         ├─ status: processing
         ├─ locked_at: 2025-01-30 10:00:00
         ├─ worker_id: server1
         └─ (Worker dies here ❌)

T=1-9    Job remains locked, can't be re-processed
         (sitting in database)

T=10     Next worker cycle triggers
         │
         ├─ Recovery check:
         │  locked_at < NOW() - 10 MINUTES?
         │  YES! (locked_at = 10:00, now = 10:10)
         │
         └─ Recovery action:
            UPDATE status = pending
            UPDATE locked_at = NULL
            UPDATE worker_id = NULL
            
T=11     Job now pending again
         │
         └─ Can be fetched & processed
            by next available worker
            (within 1 minute)

Result: ✅ Job successfully recovered
        ✅ No manual intervention needed
        ✅ No data loss
```

---

## Performance Characteristics

```
Queue Depth (jobs)
    │
500 │     ┌─────────────
    │    │              \
200 │   │                \___
    │  │                      \___
100 │ │                           \
    │                              \
  0 │                               ────────
    └────────────────────────────────────────> Time
      0   5   10  15  20  25  30  35  40  45

Legend:
- Steady state: 0-5 jobs (balanced)
- Spike: Jobs scheduled in bulk
- Recovery: Worker catches up within 10 minutes

Throughput: 5 jobs/minute × 60 = 300 jobs/hour
           = 7,200 jobs/day
           = 2.6M jobs/year
```

---

## Monitoring Dashboard (Conceptual)

```
┌──────────────────────────────────────────────┐
│          QUEUE HEALTH DASHBOARD              │
├──────────────────────────────────────────────┤
│                                              │
│  Status:                                     │
│  ✅ HEALTHY                                   │
│                                              │
│  Queue Depth:                                │
│  Pending:     3 jobs    [████░░░░░░] 3%     │
│  Processing:  0 jobs    [░░░░░░░░░░] 0%     │
│  Failed:      1 job     [░░░░░░░░░░] 1%     │
│                                              │
│  Performance:                                │
│  Jobs/min:    5/5 (100%)                    │
│  Success:     98% (245/250)                 │
│  Avg time:    45s                           │
│                                              │
│  Last Issues:                                │
│  2025-01-30 10:15 - API timeout (retried)  │
│  2025-01-30 09:45 - Rate limit (queued)    │
│                                              │
│  Latest Logs:                                │
│  [10:30] ✓ Published 5 posts                │
│  [10:29] ✓ Processing complete              │
│  [10:28] ✓ Recovered 0 stuck jobs           │
│  [10:27] ✓ Fetched 5 pending jobs           │
│                                              │
└──────────────────────────────────────────────┘
```

---

## Integration Points

```
┌─────────────────────────────────────────────────────────┐
│                    Backend Server                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Express API Layer                               │  │
│  ├──────────────────────────────────────────────────┤  │
│  │  POST /schedule-post                             │  │
│  │  GET  /social-accounts                           │  │
│  │  GET  /scheduled-posts                           │  │
│  │  DELETE /scheduled-posts/:id                     │  │
│  └──────────────────────────────────────────────────┘  │
│           ▲                      ▼                      │
│           │                  Handler                    │
│           │              (Transactions)                 │
│           │                      ▼                      │
│  ┌────────┴──────────────────────────────────────────┐ │
│  │         Database (MySQL/Sequelize)               │ │
│  │                                                   │ │
│  │  post_details ◄──────► post_schedule (QUEUE)    │ │
│  │                                                   │ │
│  └────────┬──────────────────────────────────────────┘ │
│           │                                            │
│  ┌────────┴──────────────────────────────────────────┐ │
│  │         Worker (Cron Process)                     │ │
│  │                                                   │ │
│  │  post-scheduler.corn.ts                          │ │
│  │  - Recovery                                       │ │
│  │  - Fetch + Lock                                  │ │
│  │  - Process + Retry                               │ │
│  └────────┬──────────────────────────────────────────┘ │
│           │                                            │
└───────────┼────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────┐
│            External APIs (Platforms)                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────┐  ┌──────────────────────────┐ │
│  │  Instagram API      │  │  Facebook API            │ │
│  │  /media/upload      │  │  /feed                   │ │
│  │  /captions          │  │  /comments               │ │
│  └─────────────────────┘  └──────────────────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  LinkedIn API                                    │   │
│  │  /ugcPosts                                       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## File Organization

```
ZarklyX-Backend/
│
├── src/
│   ├── corns/
│   │   └── post-scheduler.corn.ts ........................ WORKER
│   │
│   ├── db/
│   │   ├── core/
│   │   │   └── init-control-db.ts ........... MODEL REGISTRATION
│   │   │
│   │   └── migrations/
│   │       └── post-scheduling-schema.sql ........... DATABASE
│   │
│   └── routes/api-webapp/agency/social-Integration/
│       └── social-posting/
│           ├── post-details.model.ts .................. MODEL
│           ├── post-schedule.model.ts ................. MODEL
│           ├── social-posting-schedule-api.ts ........ API
│           └── social-posting.handler.ts ............. HANDLER
│
├── worker-trigger.js ............................... LAUNCHER
│
└── Documentation/
    ├── POST_SCHEDULING_SYSTEM.md ............. Comprehensive
    ├── SCHEDULING_QUICK_REFERENCE.md ........ Quick Lookup
    ├── SETUP_GUIDE.md ........................ Installation
    └── IMPLEMENTATION_SUMMARY.md ............ This File
```

---

**Architecture Version:** 1.0  
**Last Updated:** January 30, 2025  
**Status:** Production Ready ✅
