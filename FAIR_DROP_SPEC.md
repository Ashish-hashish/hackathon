# Fair Drop: Project Specification

> Audience: the AI coding agents (and humans) building this project. Read the whole file before writing code. Sections 0-3 are the "why", the rest is the "what". When something is ambiguous, follow the **Design Principles** in section 1.

---

## 0. Problem and goal

Build a high-demand sale/registration platform that sells **500 seats to 50,000 people** where automated clients **cannot gain a significant advantage through speed, request volume, or repeated attempts**.

Judging criteria (the brief), and what we must demonstrate:

| Brief requirement | Our answer |
|---|---|
| High-concurrency support | 50k-user burst handled by an O(1) entry path, SSE/polling status layer, batched admission |
| Abuse handling | Layered anti-Sybil and anti-spoofing defenses (section 4) |
| Allocation integrity | Atomic inventory, holds with expiry, DB unique constraints, idempotency keys |
| Reliable sessions | Server-side state, signed session tokens, resumable SSE, chaos test |
| Adversarial testing | Configurable bot simulator with 8 attacker profiles (section 7) |
| Fairness measurement | Metrics + live "Fairness Lab" dashboard with FCFS baseline and per-defense ablation (sections 8-9) |

**One-line thesis:** *We don't try to out-race bots. We make speed irrelevant (randomized, verifiable allocation) and make fake identities worthless (cost + cluster-capped weight).*

---

## 1. Design principles (tie-breakers)

1. **Speed must never be rewarded.** Arrival time inside the entry window must have no effect on outcome. If a feature leaks speed advantage (e.g. race to confirm a seat), redesign it.
2. **Never trust the client.** All identity, timing, and IP information is derived server-side. Any client-supplied header, timestamp, or counter is untrusted input.
3. **The real adversary is the Sybil, not the fast client.** Defenses target the *cost and value of extra identities*.
4. **Soft signals reduce weight, hard signals block.** Shared IPs are normal (CGNAT, campuses, offices). Never hard-block on IP alone.
5. **Everything is measurable.** Every defense must be toggleable so we can show an ablation. Every claim in the demo must be backed by a metric.
6. **Correctness before cleverness.** Zero oversell and zero duplicate allocation are non-negotiable and tested.
7. **Be honest about limits.** A well-funded attacker with many real phones and devices cannot be stopped by software. We show how *expensive* we make each winning seat and how little marginal gain extra identities give.

---

## 2. Core flow (hybrid: randomized waiting room, live atomic holds)

```
PRE-REGISTRATION        ENTRY WINDOW           DRAW                 ADMISSION + HOLD          CONFIRM
(hours/days before)     (e.g. 5-10 min)        (at window close)    (batched, by rank)        (within TTL)
verify identity   -->   1 entry per identity   verifiable weighted   atomic seat hold per      step-up challenge,
(email + phone OTP)     + PoW + risk score     random permutation    admitted rank, TTL        seat -> CONFIRMED
                        position = random      of all valid entries  expired -> next rank
```

**Key rules**

- **Entry window, not a race.** Entering at second 1 or minute 9 is equivalent. Queue position is determined only by the draw.
- **Draw** produces a full ranking (not just 500 winners). Rank 1-500 = initial selected, rank 501+ = ordered waitlist.
- **Holds are assigned by rank, not by race.** At admission, the system atomically decrements inventory and creates a hold *for that specific user*. Users never compete on click speed to claim. This preserves live atomic-inventory engineering while keeping speed irrelevant.
- **Batched admission.** Admission controller admits ranks in batches (configurable, e.g. 200) so claim-stage load stays bounded. Expired or declined holds return the seat to inventory and the next rank is admitted.
- **One seat per verified identity AND per cluster** (section 4.6).

State machine per entry:

```
REGISTERED -> ENTERED -> DRAWN(rank) -> ADMITTED(hold, expires_at) -> CONFIRMED
                              |                  |
                              |                  +-> EXPIRED -> (seat returned, next rank admitted)
                              +-> WAITLISTED(rank) -> ADMITTED ...
                              +-> NOT_SELECTED (waitlist exhausted)
Any state -> DISQUALIFIED (hard-signal violation, with reason code logged)
```

---

## 3. Verifiable draw (our differentiator #1)

Goal: anyone can verify the draw was random and not manipulated by us.

1. **Commit:** before the window opens, generate `seed` (32 random bytes). Publish `commitment = SHA256(seed)` on the public audit page.
2. **Close:** at window close, freeze the entry list. Publish `entries_hash = SHA256(sorted entry_ids)`.
3. **Reveal:** publish `seed` after the draw. (Optional upgrade: mix in a public randomness beacon value such as drand: `final_seed = SHA256(seed || beacon_round_value)`, with the round committed in advance.)
4. **Rank:** for each valid entry `i` with weight `w_i` (section 4.6):
   - `u_i = HMAC_SHA256(final_seed, entry_id_i)` mapped to (0,1)
   - `key_i = u_i ^ (1 / w_i)` (Efraimidis-Spirakis weighted sampling)
   - Sort by `key_i` descending. This is the rank order.
5. **Audit page:** shows commitment, reveal, entries hash, and a "verify my result" box: user pastes their entry_id and sees their `u_i`, weight, key, and rank, plus a button that re-runs the whole check in the browser.

The draw must be **deterministic given (seed, entries, weights)** and covered by a test that re-computes the ranking independently.

---

## 4. Abuse handling and anti-Sybil design (the core of the project)

Goal: **multiple entries by one bot must not work, and defenses must survive IP spoofing, proxy rotation, header forging, and fake-identity minting.**

### 4.1 Threat model (build defenses against each, simulate each)

| # | Attacker | Technique |
|---|---|---|
| T1 | Naive fast bot | Spams requests as fast as possible |
| T2 | Retry flooder | Hammers entry/confirm endpoints, replays requests |
| T3 | IP rotator | Residential/datacenter proxy pool, new IP per request |
| T4 | Header spoofer | Forges `X-Forwarded-For`, `X-Real-IP`, `Forwarded`, `CF-Connecting-IP`, user-agent |
| T5 | Sybil minter | Creates N accounts (disposable emails, email aliases) at drop time |
| T6 | Token replayer | Reuses/forges entry tokens, session tokens, PoW solutions |
| T7 | Human-like bot | Slow, jittered, realistic timing and headers |
| T8 | PoW farmer | Solves many PoW challenges in parallel on cheap compute |

### 4.2 Trusting the network address correctly (anti IP-spoofing)

- **Never read client-supplied forwarding headers.** The edge proxy (nginx) must **overwrite** (not append) `X-Real-IP` with `$remote_addr` and strip `X-Forwarded-For`, `Forwarded`, `CF-Connecting-IP`, `True-Client-IP` from incoming requests.
- The app trusts the client IP **only** from the header set by our own edge proxy, and only when the TCP peer is the known proxy address. Direct-to-app connections are rejected in production config.
- A full TCP handshake cannot be spoofed, so the socket IP is real but **rotatable**. Therefore: **IP is a weak cost signal, never an identity.**
- **Normalize IPs for limits:** IPv4 -> /32 and /24 buckets; IPv6 -> /64 and /48 buckets (never per-/128).
- **Do not bind tokens to IP** (mobile users change IP). Bind tokens to session + identity + server nonce. Log IP changes mid-session as a risk signal only.
- **Datacenter/ASN signal:** maintain a static list of known hosting ASNs/CIDRs (MVP: bundled file). Datacenter source -> higher PoW difficulty and lower weight, not a block.
- **Header consistency check:** flag mismatches (e.g. mobile user-agent with desktop-only header order, missing `Accept-Language`, HTTP/1.0). Soft signal.
- **Tests required:** a request carrying forged `X-Forwarded-For: <random ip>` must have no effect on any limit, cluster, or risk score.

### 4.3 Identity cost (the main anti-Sybil lever)

Identity is **verified in advance**, not at drop time.

- **Pre-registration phase** before the event: real email OTP for everyone; phone collected, hashed and deduped, with real phone OTP only per the hackathon policy in section 4.3a (the `sim` adapter models per-OTP cost and phone numbers as a limited attacker resource).
- **Account age gate:** an identity is eligible only if `verified_at <= window_open - MIN_ACCOUNT_AGE` (configurable; short in demo mode). This kills "mint 1,000 accounts at drop time".
- **Canonicalization (dedupe aliases):**
  - Email: lowercase, strip `+tag`, strip dots for Gmail-style providers, unify `googlemail.com` -> `gmail.com`.
  - Phone: normalize to E.164, store only `HMAC(pepper, phone)`.
  - Disposable-email domain blocklist (bundled list).
- **Hard unique constraints (DB level):** `(event_id, identity_id)`, `(event_id, email_canonical)`, `(event_id, phone_hash)`. Duplicates are impossible, not just discouraged.
- **Idempotent entry:** a second `POST /entry` by the same identity returns the existing entry (HTTP 200, same body). Spamming or refreshing changes nothing and consumes only a rate-limit token.

### 4.3a OTP provider (real, free, easy)

OTP is **real** for live users. Code talks only to an `OtpProvider` interface; adapter chosen by `OTP_PROVIDER`. **Limits below were checked in Oct 2026; re-verify before relying on them.**

| Adapter | Use | Cost and limits |
|---|---|---|
| `email_brevo` (SMTP) | **Mandatory real OTP for every live user** | Free plan: 300 emails/day, no card, SMTP included. Free plan adds Brevo branding; daily cap resets at 00:00 UTC. May ask you to verify a sender or domain: do this first, and test delivery to Gmail and Outlook (check spam). |
| `email_gmail` (SMTP) | Backup if Brevo setup is slow | Gmail app password over SMTP. Fast to set up, fine for a demo. |
| `sms_twilio_trial` | Optional live phone OTP for the **team's own numbers only** | Free trial: about 100 SMS, up to 5 verified recipient numbers, 30-day expiry, SMS restricted to the sign-up country (sign up with an Indian number). Cannot text arbitrary users. |
| `sim` | Bot simulator and 50k headless runs | Never sends anything; models attacker cost and delay per OTP. |
| `mailpit` | Local dev only | Catches emails locally. |

**Why not Firebase phone auth:** SMS verification needs the paid Blaze plan with a billing account, so it is not free.

**Phone policy for the hackathon (`PHONE_OTP_MODE=off|allowlist`):**
- Phone numbers are **always collected**, normalized to E.164, stored as peppered HMAC hashes, and unique per event (dedupe still works).
- `off` (default): phone is not OTP-verified. Email OTP is the verification gate.
- `allowlist`: numbers listed in `PHONE_OTP_ALLOWLIST` (max 5, team-owned) get a real SMS via Twilio Verify trial. This is for a live demo moment only.
- Production note for judges: any paid SMS provider plugs into the same interface. The simulation models phone-OTP cost, so the Sybil curves can be shown **with and without** phone verification (`DEF_OTP_PHONE` toggle). Be honest in the demo: with email-only verification, identity cost is low, so account age, PoW, canonicalization and cluster-capped weighting carry the defense. Show that curve too.

Rules (apply to all adapters, including real ones):

- **Never return the code in an API response or log it** outside `sim`/local dev.
- Store only `HMAC(pepper, code || identity_id)`, TTL 5 minutes, **max 5 attempts**, then lock that code.
- Single-use; a new send invalidates the previous code.
- **OTP sends are themselves abuse targets** (cost abuse, spamming victims). Rate-limit sends per identity, per canonical email, per phone hash, per IP /24 or /64, and globally; return the same response whether or not the address exists.
- The phone and email must pass canonicalization and uniqueness checks **before** a code is sent, so an attacker cannot burn sends on aliases of one identity.
- Fail closed: if the provider is down, registration pauses with a clear message; it never falls back to "skip verification".
- Add `DEF_OTP` to the defense toggles (4.8) so the ablation can show what OTP cost alone contributes.

### 4.4 Proof-of-work and entry tickets (anti-volume, anti-replay)

- `GET /entry/challenge` returns a **stateless HMAC-signed challenge**: `{sid, identity_id, nonce, difficulty_bits, issued_at, exp}`. No server storage on issuance.
- Client solves a SHA-256 hashcash puzzle in a Web Worker and submits `POST /entry` with `{challenge, solution}`.
- Server verifies in O(1): signature, expiry, identity match, solution. Then marks `nonce` as used via Redis `SET NX EX` (**single-use**, defeats replay T6).
- **Adaptive difficulty:** base 16 bits; +2 to +6 bits depending on risk score (datacenter ASN, bursty cluster, header anomalies).
- PoW is a **speed bump, not the defense** (T8 can farm it). It exists to make mass automation cost real compute and to shed load. The cluster-weight cap (4.6) is what makes farming pointless.

### 4.5 Multi-dimensional rate limiting

Token buckets (Redis, atomic Lua), enforced on **all** of these simultaneously. Exceeding any one -> `429` with `Retry-After`:

- per identity
- per session
- per IP /24 (v4) and /64 (v6)
- per device fingerprint (coarse: UA + accept headers + TLS fingerprint such as JA3/JA4 if available at the proxy)
- global admission control on `/entry` (load shedding with a friendly retry-after, never random failure)

Rate limiting never affects fairness of outcome (entry window is not a race); it only protects the system.

### 4.6 Cluster-capped weighting (the key anti-Sybil defense)

Even if an attacker gets N verified identities, their **combined chance** must not scale with N.

1. **Build clusters** with union-find over entries:
   - **Strong links (always merge):** same phone hash, same canonical email, same device key/fingerprint hash, same payment instrument (if present).
   - **Soft links (merge only when >=2 soft signals agree):** same IP /24 + same ASN, same UA family + header-order hash, near-identical timing signature (entry timestamps within a tight band and similar PoW solve time), sequential/patterned email local-parts.
   - A single shared IP or a single shared ASN **never** merges on its own (CGNAT, campuses).
2. **Weight per entry:** `w_i = risk_multiplier_i / (cluster_size_i ^ alpha)`, where `alpha` is configurable (default 1.0, meaning a whole cluster has about one entry's total weight). `risk_multiplier` in [0.1, 1.0] from the risk score.
3. **Confirm cap:** at most **one confirmed seat per cluster** (configurable `MAX_SEATS_PER_CLUSTER`, default 1).
4. **Step-up at hold:** every admitted hold requires a fresh challenge at confirm (new OTP or CAPTCHA-equivalent). A bot holding many admitted slots must solve many step-ups, and it still cannot confirm beyond the cluster cap.
5. **Appeals are out of scope**, but every down-weight/disqualification stores a reason code visible on the admin dashboard for transparency.

Expected result to demonstrate: an attacker's win share is roughly flat as identities-per-attacker grows from 1 to 1000 (with defenses on), versus linear growth with defenses off.

### 4.7 Risk score

Compute `risk in [0,1]` from soft signals: datacenter ASN, header anomalies, timing regularity, cluster size, disposable-domain, rapid IP changes, PoW solve-time outliers. Use risk to (a) raise PoW difficulty, (b) scale lottery weight via `risk_multiplier`, (c) require step-up. **Never hard-block on risk alone.**

### 4.8 Defense toggles (required for ablation)

Config flags: `DEF_OTP`, `DEF_OTP_PHONE`, `DEF_ACCOUNT_AGE`, `DEF_CANONICAL_DEDUPE`, `DEF_POW`, `DEF_RATE_LIMITS`, `DEF_CLUSTER_WEIGHT`, `DEF_RISK_SCORE`, `DEF_STEP_UP`, `DEF_TRUST_PROXY_HEADERS_CORRECTLY`. Each can be turned off at runtime in the test environment.

---

## 5. Allocation integrity

- **Inventory** lives in Redis as the fast path: `inventory:{event}` counter, mutated **only** via Lua scripts (atomic): `admit(user)` decrements and writes hold, `expire(hold)` returns seat, `confirm(hold)` finalizes.
- **Postgres is the source of truth.** Every state change is persisted; reconciliation job verifies `confirmed + active_holds + available == capacity` and alarms on mismatch.
- **Idempotency keys** (`Idempotency-Key` header) on `confirm` and `entry`; stored with response for 24h; replays return the stored response.
- **DB constraints:** unique `(event_id, identity_id)` on entries and on allocations; check constraint `confirmed_count <= capacity` enforced via a counter row updated in the same transaction.
- **Holds** have `expires_at`; a worker (and lazy check on read) expires them and promotes the next rank.
- **Entry write path (must be O(1)):** Lua dedupe check in Redis -> `XADD` to a stream -> background worker batch-inserts into Postgres. Postgres unique constraints remain the final guard.
- **Required tests:** concurrent confirm storm (e.g. 2,000 parallel confirms on 500 seats -> exactly 500 confirmed), duplicate-confirm retries, crash between Redis and Postgres writes, reconciliation catches injected inconsistency. **Oversell = 0, duplicates = 0, always.**

---

## 6. Reliable sessions and realtime

- Session = signed, `HttpOnly`, `Secure`, `SameSite` cookie holding `sid`; all state server-side keyed by identity.
- User state (`ENTERED`, `rank bucket`, `ADMITTED`, `hold countdown`, `CONFIRMED`) is fully recoverable from the server after refresh, reconnect, device switch (after re-login), or server restart.
- **Realtime:** SSE endpoint `/events` with `Last-Event-ID` resume; automatic fallback to polling `/me` with jittered backoff. Status payload is small and cacheable per user.
- **Rank buckets, not exact rank (decided).** While the drop is live, `/me` shows only a bucket, never an exact position or arrival time. Buckets are multiples of capacity C, configurable via `RANK_BUCKETS` (default: top C, up to 2C, up to 5C, up to 20C, beyond). Exact status appears once admitted. After the event is DONE, pseudonymous per-entry results (entry_id, weight, rank) are published on the audit page for verification; no emails or phones.
- **Hold countdown** is computed from the server's `expires_at`; the client clock is never trusted.
- **Chaos test (demo item):** kill one API instance and restart Redis mid-drop; users' pages recover with state intact and no lost entries or double allocations.

---

## 7. Adversarial testing: bot simulator

Python `asyncio` + `httpx` (distributed across processes) for behavior-rich bots, plus **k6** for raw burst load. Each profile is a config object so scenarios are scripted and repeatable.

| Profile | Behavior |
|---|---|
| `naive_fast` | One identity, max-rate requests |
| `retry_flood` | Repeats entry/confirm with and without idempotency keys |
| `ip_rotator` | New proxy IP per request (simulated via multiple source IPs / test network aliases) |
| `header_spoofer` | Random forged `X-Forwarded-For` and friends every request |
| `sybil_minter` | N identities (param), disposable and aliased emails, burst-registered |
| `sybil_aged` | N identities pre-registered early (passes account age) with distinct phones, sharing infra |
| `human_like` | Jittered timing, realistic headers, slow |
| `token_replayer` | Reuses PoW solutions / challenges / session tokens across identities |

**Scenario parameters:** total users (default 50,000), bot share (0-50%), identities per bot (1-1000), IP pool size, arrival curve (spike in first 5-10 seconds vs smooth), defenses on/off.

**Flash-crowd test:** 50k virtual users with ~70% arriving in the first 10 seconds. If hardware can't sustain 50k live connections, run at reduced scale with a documented scaling factor and show request-rate numbers (arrival-rate model in k6), and run the full 50k population through the *allocation logic* in a headless simulation to produce fairness metrics. Be explicit about which is which in the demo.

---

## 8. Metrics (the "measurable evidence")

Computed per run, stored, and shown on the dashboard:

1. **Bot win share vs bot traffic share** (primary fairness metric).
2. **Speed-advantage correlation:** Spearman correlation between request arrival time (or request count) and winning. Target: about 0.
3. **Sybil scaling curve:** attacker win share as identities-per-attacker grows (1, 10, 100, 1000), defenses on vs off.
4. **Attacker cost per winning seat:** (identities + OTPs + PoW CPU-seconds + proxies) / seats won. Show it rising with defenses.
5. **Integrity:** duplicate allocations (must be 0), oversell (must be 0), reconciliation mismatches (must be 0).
6. **Performance during burst:** throughput, p50/p95/p99 latency, error rate, 429 rate, time-to-first-status.
7. **Legitimate-user impact:** false-positive rate (real users down-weighted or blocked), shared-IP (CGNAT) users' win rate vs baseline.
8. **Baselines:** naive FCFS (no defenses) vs Fair Drop with each defense layer added incrementally (**ablation**).

---

## 9. MVP scope and "stand-out" features

### Must-have (MVP; do these first, in this order)

1. Pre-registration with real email OTP and phone OTP (via `OtpProvider`, 4.3a), canonicalization, unique constraints.
2. Entry window with PoW challenge, idempotent entry, per-identity/session/IP-prefix rate limits.
3. Verifiable draw (commit-reveal, HMAC-based ranking) with weights.
4. Admission + atomic holds + confirm with step-up; expiry and waitlist promotion; reconciliation check.
5. Persistent sessions + SSE with polling fallback; user status page.
6. Correct proxy-header handling (4.2) with tests.
7. Bot simulator with at least `naive_fast`, `ip_rotator`, `header_spoofer`, `sybil_minter`, `human_like`.
8. Metrics pipeline + basic dashboard with FCFS vs Fair Drop comparison.

### Differentiators (build after the MVP is solid)

- **D1: Public audit page** with verify-my-result in the browser (section 3).
- **D2: Fairness Lab:** live dashboard with sliders (bot share, identities per bot, IP pool size, defenses on/off) that runs a scenario and animates the win-share chart, FCFS and Fair Drop side by side.
- **D3: Defense ablation view:** toggle each defense layer and watch attacker win share change; shows exactly which layer defeats which attack.
- **D4: Attacker economics chart:** cost per winning seat vs identities.
- **D5: Chaos demo:** kill instances and restart Redis live while the flash crowd runs; show zero data loss.
- **D6 (stretch):** per-user "why was my weight reduced" explanation using reason codes; admin cluster graph visualization.

### Explicit non-goals

Payments, real SMS/email delivery, multi-event support, native apps, appeals workflow, perfect bot detection.

---

## 10. Architecture and stack

- **Edge:** nginx (trusted proxy; strips/overwrites forwarding headers; TLS fingerprint pass-through if feasible; basic connection limits).
- **API:** FastAPI (async) with multiple uvicorn workers; stateless instances behind nginx.
- **State:** Redis (inventory, rate limits, nonces, streams, SSE fan-out via pub/sub) and Postgres (source of truth).
- **Workers:** entry persister, draw runner, admission controller, hold expirer, reconciler.
- **Frontend:** React + Vite; PoW in a Web Worker; SSE client with resume and fallback; audit page; dashboard (charts via Recharts or Chart.js).
- **Testing/sim:** pytest (integrity and unit tests), Python bot simulator, k6 for load.
- **Infra:** `docker compose up` brings up everything (nginx, 2+ API replicas, Redis, Postgres, workers, frontend, simulator).

### Suggested repo layout

```
fair-drop/
  docker-compose.yml
  nginx/                # proxy config (header overwrite rules)
  backend/
    app/api/            # routes: register, challenge, entry, me, events, confirm, audit, admin
    app/core/           # config, security (HMAC, sessions), proxy_ip, pow
    app/abuse/          # canonicalize, clustering (union-find), risk, ratelimit
    app/draw/           # commit-reveal, weighted ranking, verification
    app/alloc/          # lua scripts, holds, admission, reconciliation
    app/workers/
    tests/
  frontend/
  sim/
    bots/               # profile implementations
    scenarios/          # JSON/YAML scenarios
    analysis/           # metrics computation, charts
    k6/
  docs/                 # architecture, threat model, results
```

---

## 11. API contract (v1)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Start pre-registration (email, phone) |
| POST | `/auth/verify` | Submit email + phone OTPs; sets session cookie |
| GET | `/entry/challenge` | Get signed PoW challenge |
| POST | `/entry` | Submit solution; idempotent entry |
| GET | `/me` | Current user state (polling fallback) |
| GET | `/events` | SSE status stream (supports `Last-Event-ID`) |
| POST | `/hold/confirm` | Step-up proof + confirm seat (requires `Idempotency-Key`) |
| GET | `/audit/draw` | Commitment, reveal, entries hash, params |
| GET | `/audit/verify/{entry_id}` | Per-entry verification data |
| GET | `/admin/metrics` | Live metrics (admin) |
| POST | `/admin/scenario/run` | Run a simulation scenario (Fairness Lab) |

All errors use a consistent JSON shape with a machine-readable `code`. `429` always includes `Retry-After`.

---

## 12. Team split (4 members, parallelizable)

| Member | Owns | First deliverable |
|---|---|---|
| **A: Core backend and allocation** | Entry path, draw, admission, holds, Redis Lua, Postgres schema, reconciliation, integrity tests | End-to-end happy path: entry -> draw -> hold -> confirm with zero oversell under a confirm storm |
| **B: Abuse and identity** | Proxy-IP handling, canonicalization, PoW, rate limits, clustering, risk score, step-up, defense toggles | Entry endpoint hardened + forged-header tests + cluster weights feeding the draw |
| **C: Frontend and sessions** | Pre-registration UI, status page, PoW worker, SSE with resume/fallback, audit page | Persistent status page that survives refresh and reconnect |
| **D: Simulation, metrics, dashboard** | Bot profiles, k6 scripts, metrics computation, Fairness Lab, ablation view, chaos demo | FCFS baseline run + first win-share-vs-bot-share chart |

**Interfaces to agree on day one:** DB schema, API contract (section 11), config flag names (4.8), the weight function inputs (`risk_multiplier`, `cluster_size`), and the metrics file format that D consumes from the backend.

---

## 13. 14-hour execution plan (HARD DEADLINE: 14h, 4 people)

### 13.1 Scope overrides for 14 hours (these override earlier sections)

| Topic | Full spec says | 14h version (do this) |
|---|---|---|
| OTP | Email + phone OTP | **Real email OTP via Brevo free SMTP** (Gmail SMTP as backup). Phone is collected, hashed and deduped; real phone OTP only for up to 5 team numbers via Twilio trial (`PHONE_OTP_MODE=allowlist`). Simulation models phone cost. See 4.3a. |
| Account age | Pre-registration days before | Config `MIN_ACCOUNT_AGE_SECONDS` (e.g. 60s in demo). Same logic, short timer. |
| Realtime | SSE with resume | **Polling `/me` first** (jittered backoff). Add SSE only if time remains after H10. |
| Draw | Commit-reveal + optional beacon | Commit-reveal only. No beacon. |
| Clustering | Strong + soft links | **Strong links + the 2-soft-signal rule with only IP/24+ASN, UA/header hash, timing band.** Skip sequential-email heuristics. |
| Risk score | Many signals | 4 signals: datacenter ASN, header anomaly, cluster size, PoW solve-time outlier. |
| Replicas / chaos | 2+ API replicas, kill Redis | **2 API replicas behind nginx**, demo = `docker kill` one replica mid-run + restart Redis; sessions survive. No fancy tooling. |
| Load test | 50k live | k6 at what the laptop sustains (target 3-10k req/s burst) **plus** headless in-process simulation of the full 50k for fairness metrics. State which is which. |
| Bot profiles | 8 | **MVP 5**: `naive_fast`, `ip_rotator`, `header_spoofer`, `sybil_minter`, `human_like`. Add `sybil_aged`, `token_replayer`, `retry_flood` only if time. |
| Dashboard | Live Fairness Lab | Phase 1: static charts from saved runs. Phase 2 (stretch): sliders calling `/admin/scenario/run` on the headless sim (it is fast, so this is feasible). |
| Drop first | n/a | D6, D4, D5, SSE, extra bot profiles (in that order). |
| Never cut | n/a | Integrity tests, proxy-header handling, cluster weighting, FCFS vs Fair Drop chart, verifiable draw. |

### 13.2 Timeline

**Rule: feature freeze at H11. No new features after that, only bug fixes, demo, docs.**

| Hours | Everyone | Milestone / checkpoint |
|---|---|---|
| **H0-1** | All 4 together: agree DB schema, API contract (sec 11), config flag names, weight-function inputs, metrics JSON format. Create repo + `docker compose` skeleton. Each agent gets this spec. | **Contract frozen at H1.** Changes after this need all 4 to agree. |
| **H1-5** | Parallel build (see 13.3) against stubs/mocks of each other's pieces. | **H5 integration checkpoint**: register -> entry -> draw -> admit -> confirm works end to end locally, even if ugly. |
| **H5-6** | Integrate, fix contract mismatches. | Happy path demoable. |
| **H6-10** | Hardening + simulation + dashboard (see 13.3). | **H10 checkpoint**: forged-header + Sybil tests green, FCFS-vs-Fair-Drop chart exists with real numbers. |
| **H10-11** | Differentiators that are already half done; choose at most 2 of D1-D3. | **H11 FEATURE FREEZE.** |
| **H11-13** | Bug fixes, full-scale runs (collect final metrics for 10 seeds), README, architecture + threat-model docs, demo script, rehearse twice. | Demo rehearsed end to end. |
| **H13-14** | Buffer. Record a backup demo video. Final `docker compose up` test on a clean machine/clone. | Submit with margin. |

### 13.3 Per-person tasks

**A: Core backend and allocation**
- H1-3: Postgres schema, `entries`/`holds`/`allocations`/`identities`, FastAPI app skeleton, `POST /entry` idempotent via Redis Lua dedupe + stream + persister worker.
- H3-5: Draw runner (consumes weights from B via a function `get_weight(entry)`; stub returns 1.0 until B delivers), admission controller, Redis Lua `admit/expire/confirm`, hold expirer, waitlist promotion.
- H5-7: Reconciliation job, **confirm-storm test (2,000 confirms on 500 seats)**, idempotency keys, FCFS baseline mode (`MODE=fcfs`) for comparison.
- H7-10: Support C/D integration, performance tuning of entry path (target: no Postgres on the hot path), crash-consistency test.
- H10-11: `GET /audit/*` endpoints if D1 is chosen.

**B: Abuse and identity**
- H1-3: `core/proxy_ip.py` (`get_client_ip`), nginx header overwrite config, **forged-header tests first**, canonicalization (email/phone), disposable-domain list, unique constraints with A, `OtpProvider` interface with `email_brevo` + `sim` adapters first (Twilio trial phone adapter only if time permits).
- H3-5: Stateless HMAC PoW challenge + verify + single-use nonce, multi-dimensional token-bucket rate limits (Redis Lua), account-age gate.
- H5-8: Union-find clustering + `get_weight()` (risk multiplier, `1/cluster_size^alpha`), `MAX_SEATS_PER_CLUSTER`, step-up challenge at confirm, defense toggles wired to config.
- H8-10: Risk score (4 signals), reason codes, tests for each attack T1-T8 covered by MVP bots.

**C: Frontend and sessions**
- H1-3: Vite React app, register + verify (real OTP) screens with resend cooldown and attempt-limit messaging, session cookie handling, API client with mock server while backend is not ready.
- H3-5: Entry screen with **PoW in a Web Worker**, status page polling `/me` (jittered backoff), hold countdown from server `expires_at`.
- H5-7: Confirm flow with step-up, error states (429 with Retry-After, expired hold), refresh/reconnect recovery.
- H7-10: Audit page with verify-my-result (D1) **if chosen**, polish, mobile layout. SSE with resume only if all else done.
- H10-13: Demo flow polish, screenshots for README.

**D: Simulation, metrics, dashboard**
- H1-3: Metrics JSON schema, headless in-process allocation simulator (`sim/headless.py`) that calls the same weight/draw code as the backend, FCFS baseline implementation.
- H3-6: Bot profiles (MVP 5) against the real API using `httpx` + asyncio; scenario YAML; k6 burst script for `/entry`.
- H6-8: Metrics computation: bot win share vs traffic share, Spearman(arrival, win), Sybil scaling curve, duplicates/oversell, latency percentiles, FCFS vs Fair Drop.
- H8-10: Dashboard (static charts from saved runs first): FCFS vs Fair Drop, Sybil scaling curve, ablation bar chart (toggle each defense off). 
- H10-11: Choose from: Fairness Lab sliders (D2), attacker economics (D4). Chaos demo script (`docker kill`, restart Redis) with before/after state check.
- H11-13: Run final scenarios with 10 seeds, freeze result files used in the demo.

### 13.4 Demo script (3-5 minutes, rehearse it)

1. **Problem in one sentence** and the thesis: speed is irrelevant, fake identities are worthless.
2. **Baseline**: FCFS with 20% bots: bots win far more than 20% of seats (chart).
3. **Fair Drop under the same attack**: bot win share about equal to or below traffic share; arrival-time correlation about 0.
4. **Sybil attack**: one attacker, 1,000 identities; win share flat with defenses on, linear with them off (ablation).
5. **Spoofing attack**: `header_spoofer` and `ip_rotator` results; show forged headers have no effect.
6. **Integrity**: confirm storm result: 500 confirmed, 0 duplicates, 0 oversell, reconciliation clean.
7. **Reliability**: live refresh of a user's page mid-flow, kill an API replica, state survives.
8. **Verifiable draw**: open the audit page, verify one entry (if D1 built).
9. **Honest limit**: attacker with many real phones/devices; show cost per winning seat (if D4 built) or the sentence.

### 13.5 Risk management

- **Integration risk is the biggest**: the H5 checkpoint is mandatory. If the happy path is not working at H6, everyone stops features and fixes integration.
- **Stubs first**: B's weights return 1.0 and C's API client uses a mock until real pieces land, so nobody blocks.
- **Hot path discipline**: `/entry` must not touch Postgres synchronously. If throughput is poor at H8, A drops everything else to fix it.
- **Time-box rabbit holes**: any task that takes 2x its estimate gets flagged to the team and scoped down.
- **Commit often, merge small**; use one `main` branch with short-lived feature branches; one person (A) owns merges at H5 and H10 checkpoints.
- **Demo data is frozen at H11-13**: never re-run experiments after H13 and change the story.

---

## 14. Acceptance criteria (definition of done)

- 2,000 concurrent confirms against 500 seats yield exactly 500 confirmed, 0 duplicates, reconciliation clean.
- A request with forged `X-Forwarded-For` / `X-Real-IP` changes no rate limit, cluster, or score.
- One bot with 1,000 identities (aliased/disposable) is reduced to at most ~1 effective entry by canonicalization + account age + cluster weighting; its win share does not scale linearly with identities.
- Replaying a challenge, PoW solution, or idempotency key never produces a second entry or allocation.
- Correlation between arrival time and winning is statistically indistinguishable from 0 across 10 runs with different seeds.
- Draw is reproducible from (seed, entries, weights) by an independent verifier script and by the browser audit page.
- State survives page refresh, SSE drop, API instance kill, and Redis restart.
- Dashboard shows FCFS vs Fair Drop under the same attack, with per-defense ablation.

---

## 15. Rules for coding agents working on this repo

1. Read section 1 (principles) before any design decision; if a change could leak a speed advantage, stop and flag it.
2. Never read `X-Forwarded-For`, `X-Real-IP`, or similar directly in app code; use the single `get_client_ip(request)` helper in `core/proxy_ip.py`.
3. Never mutate inventory outside the Lua scripts in `alloc/`.
4. Every defense gets a config flag (4.8) and a test proving it works and a test proving the system still behaves with it off.
5. Randomness for the draw comes **only** from the committed seed via HMAC; never call `random` in draw code.
6. Store phone numbers only as peppered HMAC hashes; never log raw OTPs, phones, or emails.
7. Every PR/commit that changes allocation, draw, or abuse logic must include or update a test and, if behavior changes, the relevant section of this spec.
8. Prefer simple, auditable code over clever code; the project is judged on correctness and evidence.
