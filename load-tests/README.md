# Load Testing — Axon Tickets

> Saved: May 25, 2026

## Stack Constraints (affects test design)

| Concern | Details |
|---|---|
| **Vercel Serverless** | Cold starts on first hit, max 10s execution timeout (Pro plan), concurrent function invocations limited by plan |
| **Neon PostgreSQL** | Serverless connection pool — too many concurrent connections → `connection pool exhausted` errors |
| **Upstash Redis** | REST-based, very tolerant, but has request quotas on free tier |
| **Rate limiter** | `THROTTLE_LIMIT=60` per 60s **per IP** — a load test from one machine will get 429s |

---

## Tool: k6 (recommended)

Best fit for this stack — JavaScript scripting, outputs p50/p95/p99, free, runs locally.

```bash
brew install k6
```

---

## Step 1 — Health endpoint (no auth, no rate limit)

```js
// load-tests/health.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp up to 20 VUs
    { duration: '1m',  target: 20 },  // hold
    { duration: '10s', target: 0  },  // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests < 500ms
    http_req_failed:   ['rate<0.01'],  // less than 1% errors
  },
};

export default function () {
  const res = http.get('https://api-tau-six-59.vercel.app/api/v1/health');
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
```

```bash
k6 run load-tests/health.js
```

---

## Step 2 — Authenticated endpoint (event listing)

```js
// load-tests/events.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export function setup() {
  const res = http.post(
    'https://api-tau-six-59.vercel.app/api/v1/auth/login',
    JSON.stringify({ email: 'YOUR_TEST_EMAIL', password: 'YOUR_TEST_PASSWORD' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const token = res.json('data.accessToken');
  return { token };
}

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '1m',  target: 10 },
    { duration: '10s', target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed:   ['rate<0.01'],
  },
};

export default function ({ token }) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const res = http.get('https://api-tau-six-59.vercel.app/api/v1/events', { headers });
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
```

---

## Step 3 — Critical path test

Targets from dev plan: `POST /registrations < 500ms`, `PATCH /checkin < 200ms`.

```js
// load-tests/critical-path.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend } from 'k6/metrics';

const registrationDuration = new Trend('registration_duration');
const checkinDuration       = new Trend('checkin_duration');

export const options = {
  vus: 5,           // start LOW — Neon connection limits
  duration: '2m',
  thresholds: {
    registration_duration: ['p(95)<500'],
    checkin_duration:       ['p(95)<200'],
  },
};

export function setup() {
  const res = http.post(
    'https://api-tau-six-59.vercel.app/api/v1/auth/login',
    JSON.stringify({ email: 'YOUR_TEST_EMAIL', password: 'YOUR_TEST_PASSWORD' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  return { token: res.json('data.accessToken') };
}

export default function ({ token }) {
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  group('GET events list', () => {
    const r = http.get('https://api-tau-six-59.vercel.app/api/v1/events', { headers: h });
    check(r, { '200': (x) => x.status === 200 });
  });

  sleep(2);
}
```

---

## ⚠️ Before Running Against Production

### 1. Temporarily raise the rate limiter
In Vercel env vars (then redeploy, test, revert):
```
THROTTLE_LIMIT=300
THROTTLE_TTL=60000
```
Without this, all VUs from your laptop will get 429s after 60 requests.

### 2. Keep VUs low (≤ 20)
Neon's serverless tier limits simultaneous PG connections. Watch for `Can't reach database server` errors.
Use Neon's **connection pooler endpoint** (`-pooler.neon.tech`) in `DATABASE_URL`.

### 3. Don't load test write endpoints against production
`POST /registrations` creates real DB rows, triggers Resend emails, burns Cloudinary quota.
Use a **staging Neon branch** instead:
```bash
# Create a branch in Neon dashboard
# Set DATABASE_URL to the branch's pooler URL
# Point a Vercel preview deploy at it
```

---

## Reading the Results

```
✓ http_req_duration.............: avg=142ms  p(90)=310ms  p(95)=480ms
✓ http_req_failed...............: 0.00%
✗ registration_duration.........: p(95)=640ms  ← OVER 500ms target
```

| Signal | Root cause | Fix |
|---|---|---|
| p95 > target | Missing DB index or Neon cold connection | Run `EXPLAIN ANALYZE`, add index, enable connection pooler |
| Spike at first requests then drops | Vercel cold start (~300–800ms, normal) | Expected — subsequent requests fast |
| 429 errors | Rate limiter hit | Raise `THROTTLE_LIMIT` for test run |
| 503 / timeout | Neon connection pool exhausted | Reduce VUs or add `?connection_limit=5` to `DATABASE_URL` |
