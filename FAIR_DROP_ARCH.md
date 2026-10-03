# Fair Drop: Architecture and Tech Stack

> Companion to `FAIR_DROP_SPEC.md`. The spec defines **what** the system does and why. This document defines **how** it is built. If they conflict: the spec wins on behavior and fairness rules, this document wins on technology and structure. Update both when a decision changes.

---

## 1. Decisions at a glance

| Area | Decision | Why |
|---|---|---|
| Backend language | **Python 3.12 end to end** | One language for API, workers, simulator, and metrics. The draw/weight/clustering code is shared by the live system and the 50k headless simulation, so fairness numbers come from the code that actually runs. numpy/scipy give us fast metrics for free. |
| API framework | **FastAPI + uvicorn (uvloop)**, multiple worker processes, 2 replicas behind nginx | Async, fast to write, good for agents. Hot path is a single pipelined Redis call, so Python is not the bottleneck. |
| Hot state | **Redis 7** (AOF on) with Lua scripts | Atomic inventory, rate limits, dedupe, streams, pub/sub. |
| Source of truth | **PostgreSQL 16** | Constraints are the final guard against duplicates and oversell. |
| Edge | **nginx** | Trusted proxy: overwrites client-IP headers, strips forged ones. |
| Frontend | **React 18 + TypeScript + Vite + Tailwind** | Fast to build, one app for users, audit page, and dashboards. |
| Dashboards | **Inside the same React app, using Recharts** (+ TanStack Query for polling) | Full control, matches app styling, supports the interactive Fairness Lab. No extra infra. |
| Load testing | **k6** for burst load, **Python asyncio + httpx** for behavior-rich bots, **headless numpy simulation** for full 50k fairness runs | Three tools, three purposes (section 11). |
| Packaging | **Docker Compose** (one command to run everything) | Reproducible demo, easy chaos test. |

### Why Python over Go/Node (honest trade-off)

- Go would give higher raw `/entry` throughput, but it would split the codebase in two languages and break the shared core package. With a 14-hour limit and 4 people, one language wins.
- The `/entry` path does one Redis round trip. Throughput is dominated by Redis and the number of uvicorn workers, not by Python.
- **Contingency:** if the benchmark in section 14 misses target at H8, first add workers and trim Redis round trips. Only as a last resort, move **just** `/entry` to a small Go or Node service. This is feasible because the shared core is not used on the entry path.

### Why dashboards live in React, not Grafana or Streamlit

- **Grafana:** great for infra metrics, but needs Prometheus, config, and provisioning. Too much setup for 14 hours, and it cannot host the interactive Fairness Lab or the audit page.
- **Streamlit:** fast, but looks generic, is awkward for live sliders and animated charts, and is a second app with its own auth and deploy.
- **React + Recharts:** one codebase, one deploy, and it can do everything we need: live ops view, scenario runner with sliders, ablation toggles, audit page. System metrics are light enough to collect ourselves (section 12.3).

---

## 2. System diagram

```
                       +-----------------------------+
                       |   Users (React) / Sim bots  |
                       +--------------+--------------+
                                      |
                       +--------------v--------------+
                       |   nginx edge                |
                       |   - overwrite X-Real-IP     |
                       |   - strip XFF/Forwarded/... |
                       |   - conn + req limits       |
                       +--------------+--------------+
                                      |
                +---------------------+---------------------+
                |                                           |
        +-------v-------+                           +-------v-------+
        | api replica 1 |                           | api replica 2 |   stateless FastAPI
        +-------+-------+                           +-------+-------+   (N uvicorn workers each)
                |                                           |
                +---------------------+---------------------+
                                      |
        +-----------------------------+------------------------------+
        |                             |                              |
+-------v--------+           +--------v--------+            +--------v--------+
| Redis (AOF)    |<--------->| worker process  |----------->| Postgres        |
| inventory,     |           | (leader-locked  |            | source of truth |
| holds, limits, |           |  roles, sec 7)  |            +-----------------+
| streams, sess  |           +-----------------+
+----------------+

 Also: sim-runner (same image as api, different command) runs headless scenarios for the dashboard.
 Dev only: mailpit (catches email OTPs locally).
```

---

## 3. Repository layout (single monorepo)

```
fair-drop/
  docker-compose.yml
  .env.example
  nginx/
    nginx.conf                 # header overwrite/strip rules (critical, see spec 4.2)
  core/                        # SHARED PYTHON PACKAGE: pure functions, no I/O
    fairdrop_core/
      canonical.py             # email/phone canonicalization
      pow.py                   # challenge create/verify (HMAC, hashcash)
      weights.py               # risk multiplier, cluster weight, get_weight()
      clustering.py            # union-find, strong/soft link rules
      draw.py                  # commit-reveal, HMAC keys, weighted ranking
      verify.py                # independent draw verifier (also used by audit page backend)
      config.py                # defense flags, constants
    tests/
  backend/
    app/
      main.py                  # FastAPI app factory, middleware
      api/                     # routers: auth, entry, me, events, hold, audit, admin
      middleware/              # client_ip (single helper), ratelimit, metrics, session
      services/                # otp (providers), entry, admission, confirm, reconcile
      redis_scripts/           # *.lua (entry, ratelimit, admit, confirm, expire)
      db/                      # asyncpg pool, migrations (alembic or plain SQL), queries
      workers/                 # persister, drawer, admitter, expirer, reconciler
    tests/                     # integrity, spoofing, concurrency, idempotency
  frontend/
    src/
      pages/                   # Register, Enter, Status, Confirm, Audit, Ops, Lab, Runs
      components/charts/       # Recharts wrappers
      workers/pow.worker.ts    # PoW in a Web Worker
      api/                     # typed client, polling hooks
  sim/
    bots/                      # profile implementations (httpx + asyncio)
    headless/                  # numpy 50k simulation using fairdrop_core
    scenarios/                 # YAML scenario definitions
    metrics/                   # metric computation, saved result JSON
    k6/                        # burst scripts
  docs/                        # README, threat model, results, demo script
```

**Rule:** `core/` has no network, DB, or Redis access. It only takes data and returns data. That is what lets the headless simulator and the live workers run identical logic.

---

## 4. Request path and the `/entry` hot path

### 4.1 Request lifecycle (all endpoints)

1. **nginx:** sets `X-Real-IP = $remote_addr`, removes `X-Forwarded-For`, `Forwarded`, `CF-Connecting-IP`, `True-Client-IP` from the client request, applies coarse connection/request limits.
2. **client_ip middleware:** the **only** place that reads the client IP (`get_client_ip(request)`). Accepts `X-Real-IP` only if the TCP peer is the nginx container address. Normalizes to /24 (v4) or /64 (v6) buckets.
3. **session middleware:** verifies signed `sid` cookie, loads `sess:{sid}` from Redis (falls back to Postgres identity lookup if missing).
4. **ratelimit middleware:** one Lua call checking all buckets (identity, session, IP prefix, device hash, global) atomically. Returns `429 + Retry-After`.
5. **metrics middleware:** records latency and status class into per-second Redis counters (section 12.3).
6. Route handler.

### 4.2 `/entry` step by step (must be O(1), no Postgres)

```
POST /entry   {challenge, solution}   (cookie sid -> identity_id)

1. Verify HMAC signature + expiry of `challenge` (pure CPU, no I/O)
2. Verify challenge.identity_id == session identity
3. Verify PoW solution meets challenge.difficulty_bits (pure CPU)
4. ONE Redis Lua call `entry.lua`:
     a. if window state != OPEN            -> return WINDOW_CLOSED
     b. existing = HGET entries:{evt} identity_id
        if existing                         -> return {status: EXISTING, entry_id}   (idempotent)
     c. SET nonce:{nonce} 1 NX EX <ttl>
        if not set                          -> return REPLAY
     d. entry_id = new id
        HSET entries:{evt} identity_id entry_id
        XADD entry_stream * entry_id, identity_id, ts_server, ip_prefix, asn,
                            ua_hash, hdr_hash, tls_hash, pow_solve_ms, risk_raw
        HINCRBY counters:{evt} entries 1
        return {status: CREATED, entry_id}
5. Respond 200 {entry_id, state: ENTERED}
```

- Arrival time is recorded **server-side** (`ts_server`) for analysis only. It is **never** an input to the draw (spec principle 1).
- Raw features go into the stream; **clustering and risk scoring are not computed here** (section 6).
- `persister` worker consumes `entry_stream` with a consumer group, batch-inserts into Postgres (`INSERT ... ON CONFLICT DO NOTHING`), then ACKs.

### 4.3 Registration and OTP (low volume, Postgres is fine)

Registration happens before the event and is not the burst path. It writes directly to Postgres with canonicalization and unique constraints, using the `OtpProvider` interface from spec 4.3a. **Providers: Brevo free SMTP for email OTP (mandatory), Twilio trial for up to 5 team phone numbers (optional), `sim` for simulation.** The 300/day email cap means live registration is for demo-sized crowds; the 50k population runs through the simulator. OTP state lives in Redis (`otp:{identity}`: hashed code, attempts, expiry).

---

## 5. Redis design

All keys are namespaced by event: `{evt}` is the event id.

| Key | Type | Purpose |
|---|---|---|
| `window:{evt}` | string | `PENDING / OPEN / CLOSED / DRAWN / DONE` |
| `entries:{evt}` | hash | `identity_id -> entry_id` (idempotent dedupe) |
| `entry_stream` | stream | raw entry features -> persister |
| `nonce:{nonce}` | string, TTL | single-use PoW challenge nonce |
| `rl:{dim}:{key}` | hash | token bucket per dimension (identity/session/ip24/ip64/device/global) |
| `sess:{sid}` | hash, TTL | session -> identity |
| `otp:{identity}` | hash, TTL | hashed OTP, attempts |
| `inventory:{evt}` | integer | seats **available** (capacity - held - confirmed) |
| `queue:{evt}` | list | ranked identity ids waiting for admission (from the draw) |
| `result:{evt}` | hash | `identity_id -> {rank, weight, cluster_id, status}` for `/me` |
| `hold:{evt}:{hold_id}` | hash | identity, seat state, expires_at |
| `holds_exp:{evt}` | zset | hold_id scored by expires_at |
| `cluster_seats:{evt}` | hash | `cluster_id -> held+confirmed count` (enforces seat cap) |
| `idem:{key}` | string, TTL | stored response for idempotency keys |
| `metrics:{evt}:{sec}` | hash | per-second counters + latency histogram buckets |
| `events:{evt}` | pub/sub | status change fan-out for SSE (stretch) |

**Persistence:** AOF with `appendfsync everysec`. Accepted trade-off: up to ~1 second of entries can be lost on a hard Redis crash. Mitigation: entries are idempotent, so a user whose entry vanished sees no entry in `/me` while the window is open and can re-submit. After the window closes, the Postgres copy is authoritative and the persister has drained the stream (close waits for stream lag = 0).

**Rebuild path:** if Redis is wiped, a `rehydrate` command rebuilds `entries`, `result`, `queue`, `inventory`, `holds`, and `cluster_seats` from Postgres. This is what the chaos demo exercises.

---

## 6. Window close: batch pipeline (runs once, leader-locked)

Runs in the `drawer` worker role after the window closes and the stream is drained:

```
1. state -> CLOSED; wait until entry_stream lag == 0 and Postgres entry count == Redis entry count
2. Load all entries + features from Postgres
3. clustering.build_clusters(entries)          # union-find over strong + soft links
4. weights.compute(entries, clusters)          # risk_multiplier / cluster_size^alpha
5. draw.rank(seed, entries, weights)           # HMAC keys + weighted sampling
6. Persist draw (commitment, seed reveal, entries_hash, params) and per-entry results
   (rank, weight, cluster_id, reason_codes) to Postgres in one transaction
7. Load queue:{evt} (ranked ids), result:{evt}, inventory:{evt}=capacity into Redis
8. state -> DRAWN; admitter starts
```

- **Deterministic:** same seed + entries + params produce the same ranking. A crash mid-step is safe to rerun; the Postgres write (step 6) is a single transaction, so there is no partial draw.
- **Why batch:** clustering is stronger with all entries visible, and the hot path stays O(1).
- The commitment (`SHA256(seed)`) is published **before the window opens**, and the seed is revealed at step 6. Seed lives only in the drawer process memory/secret store until reveal.

---

## 7. Workers (one container, leader-locked roles)

One `worker` process runs these roles as asyncio tasks. Roles that must be single-writer take a Redis lock (`SET lock:{role} NX EX 15`, renewed) so running two worker containers is safe.

| Role | Singleton? | Does |
|---|---|---|
| `persister` | no (consumer group) | stream -> Postgres batch inserts |
| `drawer` | yes | section 6 pipeline |
| `admitter` | yes | admit ranks in batches via `admit.lua` |
| `expirer` | yes | expire due holds via `expire.lua`, then triggers admitter |
| `reconciler` | yes | every N seconds check `confirmed + active_holds + available == capacity` in Redis and Postgres; alarm on mismatch |

### 7.1 Atomic seat logic (Lua, the only code allowed to mutate inventory)

- **`admit.lua(batch_size)`:** for each next identity in `queue:{evt}`: skip with status `SKIPPED_CLUSTER_CAP` if `cluster_seats[cluster] >= MAX_SEATS_PER_CLUSTER`; otherwise if `inventory > 0`: `DECR inventory`, create `hold`, `ZADD holds_exp`, `HINCRBY cluster_seats`, set `result` status `ADMITTED`. Stop when inventory is 0 or batch is full.
- **`confirm.lua(hold_id, identity_id, idem_key)`:** verify hold exists, belongs to identity, not expired, not already confirmed; mark `CONFIRMED`. Does **not** change `inventory` (the seat was already decremented at admit). Idempotent via `idem:{key}`.
- **`expire.lua(now)`:** for holds due in `holds_exp`: if not confirmed, delete hold, `INCR inventory`, `HINCRBY cluster_seats -1`, set `result` status `EXPIRED`.
- Every script writes an event line to a `seat_log` stream; the persister mirrors it to Postgres `seat_events` for audit and reconciliation.

Step-up (fresh OTP/challenge) is verified in the API **before** calling `confirm.lua`.

---

## 8. Postgres schema (sketch)

```sql
events(id, name, capacity, window_open_at, window_close_at, params jsonb, commitment bytea, seed_reveal bytea)

identities(id, event_id, email_canonical, phone_hash, verified_at, created_at,
  UNIQUE(event_id, email_canonical), UNIQUE(event_id, phone_hash))

entries(id, event_id, identity_id, ts_server, ip_prefix, asn, ua_hash, hdr_hash, tls_hash,
  pow_solve_ms, risk_raw, UNIQUE(event_id, identity_id))

draws(event_id PK, entries_hash, params jsonb, created_at)
draw_results(event_id, entry_id, rank, weight, cluster_id, reason_codes jsonb,
  PRIMARY KEY(event_id, entry_id))

holds(id, event_id, identity_id, cluster_id, created_at, expires_at, status,
  UNIQUE(event_id, identity_id))          -- one active hold per identity
allocations(id, event_id, identity_id, cluster_id, confirmed_at,
  UNIQUE(event_id, identity_id))          -- one seat per identity, ever
seat_events(id, event_id, hold_id, kind, at)   -- admit/confirm/expire log

idempotency_keys(key PK, request_hash, response jsonb, created_at)
sim_runs(id, scenario jsonb, mode, metrics jsonb, created_at)   -- dashboard history
```

`MAX_SEATS_PER_CLUSTER` is enforced in Lua (fast) **and** checked at confirm in Postgres (`allocations` count per `cluster_id`), so a Redis bug cannot oversell a cluster. A deferred constraint or a guarded `INSERT ... SELECT` ensures `count(allocations) <= capacity`.

---

## 9. Sessions and realtime

- `sid` cookie: signed (HMAC), `HttpOnly`, `Secure`, `SameSite=Lax`. Session data in `sess:{sid}`; if missing, rebuild from Postgres identity after re-auth (OTP login), so Redis loss never loses user state.
- User state is a pure function of server data: `GET /me` returns `{state, rank_bucket, hold: {expires_at}, ...}`. The client keeps no authoritative state.
- **Phase 1 (MVP): polling** `/me` every 2-5s with jittered backoff and `Retry-After` respect. Responses are tiny.
- **Phase 2 (stretch): SSE** `/events` with `Last-Event-ID` resume, fed by Redis pub/sub. Polling remains the fallback.
- Hold countdown always derives from the server's `expires_at`.
- **Rank buckets (decided):** while the drop is live, `/me` returns only a bucket (multiples of capacity C via `RANK_BUCKETS`, default top C / up to 2C / up to 5C / up to 20C / beyond), never an exact rank, to avoid waitlist gaming. Exact status appears once admitted. After DONE, pseudonymous results (entry_id, weight, rank) are published for audit; no personal data.

---

## 10. Anti-abuse placement (what runs where)

| Check | Where | Cost |
|---|---|---|
| Strip/overwrite forwarding headers | nginx | free |
| `get_client_ip` trust logic | API middleware | O(1) |
| Multi-dimension token buckets | Redis Lua (middleware) | 1 round trip |
| PoW challenge sign/verify | API (pure CPU) | O(1) |
| Nonce single-use, entry dedupe | `entry.lua` | same round trip as entry |
| Canonicalization, disposable domains, unique constraints | registration (Postgres) | low volume |
| Account-age gate | checked at challenge issuance (reads `identities.verified_at`, cached in session) | O(1) |
| Clustering, risk score, weights | **batch at window close** (section 6) | one pass |
| Step-up at confirm | API before `confirm.lua` | low volume |

Defense toggles (spec 4.8) are read from config at request time (and by the headless simulator) so ablations are possible without code changes.

---

## 11. Simulation and load testing architecture

Three tools, three purposes. State clearly in the demo which result comes from which.

| Tool | Purpose | Realism | Scale |
|---|---|---|---|
| **k6** | Raw burst on `/entry` and `/me`: throughput, p50/p95/p99, error and 429 rates | Real HTTP against real stack | As high as the laptop sustains (arrival-rate model) |
| **Python bots** (`sim/bots`, httpx + asyncio) | Behavior-rich attackers (IP rotation, header spoofing, Sybil, human-like) against the real API | Real HTTP, real defenses | Thousands, not 50k |
| **Headless sim** (`sim/headless`, numpy) | Full 50k population through the **same `fairdrop_core`** code: fairness metrics, Sybil curves, ablations, attacker economics | Models the network layer, uses real draw/weight/cluster code | Full 50k in seconds |

**Why the headless sim is credible:** it imports `fairdrop_core` unchanged. The only modeled parts are request timing and the OTP/PoW cost model (`sim` OTP adapter). To keep it honest, run one mid-scale scenario (e.g. 5,000 users) through **both** the real stack and the headless sim and show the metrics agree.

**Spoofing in simulation:** `ip_rotator` uses multiple source addresses (Docker network aliases or several sim containers) so the TCP peer IP genuinely changes. `header_spoofer` sends forged `X-Forwarded-For` etc. and the test asserts no effect on limits or clusters.

**Scenario runner for the dashboard:** `POST /admin/scenario/run {params}` enqueues a headless job (process pool in `sim-runner`), returns `job_id`; dashboard polls `GET /admin/scenario/{job_id}` for progress and result; results stored in `sim_runs`. Target: a 50k scenario completes in under ~10 s so sliders feel live.

---

## 12. Dashboards

All dashboards are pages in the React app behind a simple admin token (header or login). Charts: **Recharts**. Data fetching and polling: **TanStack Query**.

### 12.1 Pages

| Page | Audience | Contents |
|---|---|---|
| **Ops (live)** | Judges, team during load test | Entries count, requests/s, p50/p95/p99, 429 and error rate, inventory gauge (available / held / confirmed), active holds, queue progress, reconciliation status |
| **Fairness Lab** | Judges (main demo) | Scenario controls + result charts (below) |
| **Runs** | Team | History of saved runs, compare two runs |
| **Audit (public)** | Anyone | Commitment, reveal, entries hash, verify-my-result (re-runs draw check in browser) |

### 12.2 Fairness Lab: controls and charts

Controls: total users, bot share, identities per bot, IP pool size, arrival curve, bot profile, defense toggles (one per flag in spec 4.8), seed.

Charts (each compares **FCFS baseline vs Fair Drop** under identical conditions):

1. **Win share vs traffic share:** bars for bots (primary fairness chart).
2. **Win rate by arrival-time decile:** line chart. FCFS slopes steeply (early arrivals win); Fair Drop is flat. The clearest picture of "speed is irrelevant".
3. **Sybil scaling curve:** attacker win share vs identities per attacker (1, 10, 100, 1000), defenses on vs off.
4. **Ablation:** attacker win share with each defense layer removed in turn.
5. **Integrity panel:** duplicates, oversell, reconciliation mismatches (all must read 0).
6. **Attacker economics (stretch):** cost per winning seat vs identities, using the `sim` OTP/PoW cost model.
7. **Spearman correlation** (arrival time vs winning) shown as a number with confidence interval across seeds.

### 12.3 Metrics collection (no extra infra)

- Middleware does `HINCRBY metrics:{evt}:{sec}` for: request count, status-class counts (2xx/4xx/429/5xx), and latency histogram buckets (e.g. <10ms, <25, <50, <100, <250, <500, <1000, 1000+).
- `GET /admin/metrics/timeseries?from=&to=` reads those hashes and computes rps and p50/p95/p99 from bucket counts. Ops page polls every 1-2 s.
- Entry/inventory/hold gauges come straight from Redis counters.
- k6 summary JSON and bot-run results are imported into `sim_runs` so the Runs page can show them next to headless results.

---

## 13. Deployment and local environment

`docker compose up --build` starts:

| Service | Notes |
|---|---|
| `nginx` | Exposes port 80 (frontend + `/api` proxy). Only component reachable from outside. |
| `api` (x2 replicas) | uvicorn with N workers (`--workers`, default 4). Not exposed directly; refuses direct connections not from nginx. |
| `worker` | One container, all roles, leader locks. |
| `sim-runner` | Same image as `api`, runs scenario jobs. |
| `redis` | AOF on, `appendfsync everysec`. |
| `postgres` | Volume-backed. |
| `frontend` | Built Vite assets served by nginx. |
| `mailpit` | Dev-only SMTP sink for OTP emails. |

Config: all in `.env` (see `.env.example`): `EVENT_CAPACITY`, `WINDOW_SECONDS`, `MIN_ACCOUNT_AGE_SECONDS`, `OTP_PROVIDER`, `DEF_*` defense flags, `CLUSTER_ALPHA`, `MAX_SEATS_PER_CLUSTER`, `ADMISSION_BATCH`, `HOLD_TTL_SECONDS`, HMAC and pepper secrets, admin token.

---

## 14. Performance targets and the early benchmark

These are targets to measure against, not promises.

| Target | Value |
|---|---|
| `/entry` sustained throughput (whole stack, laptop-class) | >= 3,000 req/s with p95 < 300 ms |
| `/me` polling at 50k users, 3 s interval | ~17k req/s equivalent, served from Redis hash read, must stay p95 < 200 ms (use caching headers + jitter; scale down in k6 if hardware-limited) |
| Draw for 50k entries (cluster + weights + rank) | < 5 s |
| Headless 50k scenario | < 10 s |
| Confirm storm | 2,000 parallel confirms on 500 seats -> exactly 500 confirmed |

**H5 benchmark (mandatory):** as soon as the happy path works, member D runs a k6 burst on `/entry`. Results go in `docs/benchmark.md`.
**If below target:** (1) raise uvicorn workers and ensure Redis pipelining, (2) remove any per-request JSON/DB overhead, (3) cache identity eligibility in the session, (4) last resort: reimplement only `/entry` in a lightweight Go/Node service sharing `entry.lua`.

---

## 15. Failure modes and expected behavior

| Failure | Expected behavior |
|---|---|
| One API replica dies | nginx routes to the other; sessions survive (Redis/Postgres-backed); no entry lost (idempotent retry) |
| Redis restarts | AOF restores almost everything; at most ~1 s of entries lost, users can re-enter while window is open; `rehydrate` rebuilds from Postgres after close |
| Worker crashes mid-draw | Draw is transactional and deterministic; rerun is safe, no partial state |
| Worker crashes between admit and persist | `seat_log` stream re-delivers; reconciler detects drift and repairs from Postgres |
| Postgres slow or down | Entry path unaffected (stream buffers); persister lag rises and is visible on Ops page; window close waits for lag = 0 |
| OTP provider down | Registration pauses with clear message; never skips verification |
| Forged headers / rotating IPs | No effect on clusters/limits beyond what the real TCP address shows (spec 4.2); asserted by tests |
| Clock skew between replicas | Only server timestamps are used; hold expiry is evaluated in Redis (`TIME`) not by clients or API replicas |

---

## 16. Build order mapped to ownership

See spec sections 12 and 13 for the timeline and per-person tasks. Architecture-specific notes:

- **Day-one contracts to freeze (H0-1):** Redis key names (section 5), Postgres schema (section 8), `fairdrop_core` function signatures (`canonicalize`, `make_challenge/verify_challenge`, `build_clusters`, `get_weight`, `rank`), metrics JSON schema, API paths (spec 11).
- **A (core backend):** `entry.lua`, admit/confirm/expire Lua, workers, Postgres schema, reconciler.
- **B (abuse/identity):** nginx config, `client_ip`, `fairdrop_core` canonical/pow/clustering/weights, rate-limit Lua, OTP providers.
- **C (frontend):** React app, PoW worker, polling hooks, audit page, Ops and Lab page shells using mock data until the backend lands.
- **D (sim/metrics/dashboards):** `fairdrop_core` draw/verify (with A), headless sim, bots, k6, metrics endpoints, Lab and Ops charts, scenario runner.

---

## 17. Rules for coding agents (architecture-specific)

1. `fairdrop_core` stays **pure** (no I/O). Anything needing Redis, Postgres, or HTTP goes in `backend/` or `sim/`.
2. Client IP is read **only** via `get_client_ip`. Direct reads of forwarding headers fail code review.
3. Inventory changes happen **only** in the Lua scripts. No `INCR/DECR inventory` anywhere else.
4. No Postgres calls on the `/entry` request path. If you think you need one, flag it to the team.
5. Draw code uses **only** HMAC from the committed seed. No `random`, no `numpy.random` inside ranking.
6. Every Redis key goes through a single key-builder module so names match section 5.
7. Every new endpoint gets the metrics middleware and rate-limit dimensions automatically; do not bypass the middleware stack.
8. Every defense has a flag and is covered by tests with the flag on and off.
9. Dashboards read only from documented endpoints (`/admin/metrics*`, `/admin/scenario*`, `/audit/*`); no direct DB access from the frontend.
10. Pin dependency versions in `requirements.txt` / `package.json` lockfiles on day one so four agents do not diverge.

---

## 18. Decisions log and open items

**Decided**
- Python end to end; FastAPI; Redis + Postgres; nginx; React + Vite + TS + Tailwind; Recharts dashboards inside the app; k6 + asyncio bots + headless numpy sim; Docker Compose.
- Clustering and risk scoring are batch at window close; hot path is O(1) and Postgres-free.
- Polling first, SSE as a stretch goal.
- Redis with AOF + Postgres rebuild instead of Redis Cluster/Sentinel.
- OTP: real email OTP via Brevo free SMTP (Gmail SMTP backup); phone collected/hashed/deduped, real phone OTP only for up to 5 team numbers via Twilio trial; Firebase phone auth rejected (not free).
- Rank buckets shown to users while live; exact rank never exposed until DONE (pseudonymous audit data).

**Open (decide by H1)**
- Migrations tool: Alembic vs plain SQL files (recommend plain SQL files for speed).
- Component library for the frontend: plain Tailwind vs shadcn/ui (recommend plain Tailwind plus a few hand-built components).
