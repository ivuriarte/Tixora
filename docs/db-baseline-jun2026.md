# Database Performance Baseline — June 2026

**Captured:** June 21, 2026  
**Period:** June 14–21, 2026 (7-day window)  
**Project:** Axon Tickets (Supabase project `nwzfiftzubjppoitmzjs`)  
**Instance:** Micro compute (2 vCPU, 1 GB RAM)

---

## Infrastructure Metrics (Settings → Infrastructure)

| Metric | Baseline value | Notes |
|---|---|---|
| CPU utilization | ~0% across all 7 days | Platform is pre-launch; essentially idle |
| Memory utilization | ~25–30% (~256–307 MB of 1 GB) | Healthy for Micro; Supabase expects ~50% base |
| Disk used | 0.27 GB of 2 GB provisioned | 13.5% disk utilisation |
| Disk IO (baseline) | 87 Mbps | |
| Disk IO (burst) | 2,085 Mbps | 30-min daily burst limit |
| Postgres version | 17.6.1.121 | |

---

## Database Metrics (Reports → Database)

> **Action required:** Navigate to Supabase → Reports (chart icon in left sidebar) → Database tab and capture the following. Update this table before the first event goes on sale.

| Metric | Baseline value | Target / Alert threshold |
|---|---|---|
| Active connections | _capture from Reports_ | Alert if sustained > 80% of pool (default pool size 15 for Micro) |
| Cache hit rate (index) | _capture from Reports_ | Must be > 99%; below 95% = investigate |
| Cache hit rate (table) | _capture from Reports_ | Must be > 95% |
| Slowest query (p99 ms) | _capture from Query Performance_ | Alert if any query > 500 ms at low load |

---

## Advisors Status (Database → Performance Advisor)

> **Action required:** Navigate to Supabase → Database → Performance Advisor and capture any flagged issues. Record findings here.

| Finding | Severity | Resolution |
|---|---|---|
| _Run advisor and record here_ | | |

---

## Indexes Added (Phase 2, Task 3)

Migration `20260621120000_add_missing_indexes` added the following indexes on top of what already existed:

| Table | Index columns | Reason |
|---|---|---|
| `registrations` | `(tier_id, status)` | Tier capacity checks, admin tier-filtered views |
| `registrations` | `(status, created_at DESC)` | Admin dashboard ordered by recent activity |
| `tickets` | `(ticket_tier_id, status)` | Tier-level ticket validation (check-in scanner) |
| `registration_funnel_events` | `(user_id)` | User-specific funnel history, re-entry detection |

---

## Alert Thresholds (to configure in Supabase → Settings → Alerts)

| Metric | Warning | Critical |
|---|---|---|
| CPU | > 70% sustained 5 min | > 90% sustained 5 min |
| Memory | > 80% | > 90% |
| Disk | > 80% used | > 90% used |
| Active connections | > 12 (of 15 pool) | > 14 |

---

## Re-measurement Schedule

| When | What to capture |
|---|---|
| Before Francis Kong event (event day –7) | All metrics above; compare to this baseline |
| Event day (30 min before doors open) | Active connections, CPU live |
| Post-event (48 h after) | Confirm CPU/memory returned to baseline |
