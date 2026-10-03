# Fair Drop 🎟️

> **A high-demand sale and registration platform that sells 500 seats to 50,000 people where automated clients cannot gain a significant advantage through speed, request volume, or repeated attempts.**

---

## ⚡ Core Thesis
> *"We don't try to out-race bots. We make speed irrelevant (randomized, verifiable allocation) and make fake identities worthless (cost + cluster-capped weight)."*

---

## 🚀 Key Highlights & Differentiators

1. **Speed Is Irrelevant**: Entering at second 1 or minute 5 is identical. Queue position is determined strictly by a verifiable, cryptographic draw.
2. **Provable Fairness & Public Audit (D1)**: Before the window opens, a secret seed commitment (`SHA-256(seed)`) is published. At window close, the list of entries is frozen (`entries_hash`) and the seed is revealed. Anyone can verify their exact ranking in the browser or via CLI.
3. **Cluster-Capped Weighting & Anti-Sybil (D2/D3)**: Sybil attacks are clustered using Disjoint Set Union (Union-Find) across strong links (phone hash, canonical email, device fingerprint) and soft links ($\ge 2$ agreeing signals like IP subnet + ASN, header hashes, timing bands). Cluster weight scales as $w_i = \text{risk\_multiplier}_i / (\text{cluster\_size}_i^\alpha)$ with a hard cap of 1 confirmed seat per cluster.
4. **Anti-CGNAT Protection**: A shared IP or ASN alone **never** merges entries (protecting universities, mobile towers, and corporate CGNAT).
5. **Zero Oversell Invariant**: Seats are admitted in batches by rank into live, expiring atomic holds managed exclusively via Redis Lua scripts (`admit.lua`, `confirm.lua`, `expire.lua`). Verified continuously by background reconcilers against PostgreSQL source of truth (`confirmed + active_holds + available == capacity`).
6. **High Performance**:
   - $O(1)$ entry hot path (zero database calls on request path)
   - 50,000-user full-scale simulation completes in **~2.1 seconds**
   - Spearman rank correlation between arrival time and winning is **$\approx 0$** (tested $-0.0148$).

---

## 🏗️ Architecture

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
        | api replica 1 |                           | api replica 2 |   FastAPI + uvloop
        +-------+-------+                           +-------+-------+   (N uvicorn workers)
                |                                           |
                +---------------------+---------------------+
                                      |
        +-----------------------------+------------------------------+
        |                             |                              |
+-------v--------+           +--------v--------+            +--------v--------+
| Redis 7 (AOF)  |<--------->| worker process  |----------->| Postgres 16     |
| inventory,     |           | (leader-locked  |            | source of truth |
| holds, limits, |           |  roles)         |            +-----------------+
| streams, sess  |           +-----------------+
+----------------+
```

---

## 💻 Tech Stack

| Layer | Technology |
|---|---|
| **Core Shared Package** | Python 3.12 (pure functions, zero I/O, shared between API & 50k headless sim) |
| **API** | FastAPI, uvicorn, asyncpg, redis-py |
| **Hot State** | Redis 7 (AOF on, Lua atomic scripts) |
| **Source of Truth** | PostgreSQL 16 |
| **Edge Proxy** | nginx (header stripping and overwrite rules) |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| **Background PoW** | Dedicated Web Worker (`pow.worker.ts`) |
| **Simulation** | Headless numpy/Python 50k engine + asyncio/httpx bots + k6 |

---

## 🏃 Quickstart

### Prerequisites
- Docker & Docker Compose

### 1. Launch Everything
```bash
# Clone and start containers
cp .env.example .env
docker compose up --build
```

### 2. Access the Application
- **User Experience & Waiting Room**: `http://localhost/`
- **Public Audit & Verifier**: `http://localhost/` (Tab: *Public Audit*)
- **Live Ops Dashboard**: `http://localhost/` (Tab: *Live Ops*)
- **Fairness Lab**: `http://localhost/` (Tab: *Fairness Lab*)
- **Mailpit Dev Email Sink**: `http://localhost:8025/`

---

## 🧪 Testing

### Run Core Unit Tests
```bash
PYTHONPATH=core python3 -m unittest discover -s core/tests -v
```

### Run Anti-Spoofing & Client IP Tests
```bash
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -v
```

### Run 50,000 User Headless Fairness Benchmark
```bash
PYTHONPATH="core:sim" python3 -c '
from headless.simulate import run_headless_simulation
result = run_headless_simulation(total_users=50000, capacity=500, bot_share=0.20, identities_per_bot=10)
print("FCFS Summary:", result["summary"]["fcfs"])
print("Fair Drop Summary:", result["summary"]["fair_drop"])
'
```

---

## 📊 Demo Evidence (50,000 Population Run)

| Metric | FCFS Baseline | Fair Drop | Target |
|---|---|---|---|
| **Bot Win Share** (20% traffic) | **100.0%** (Bots take all seats) | **20.0%** | $\le$ Traffic Share |
| **Speed Correlation** ($\rho$) | **-0.1723** (Strong speed bias) | **-0.0148** | $\approx 0$ (Irrelevant) |
| **Decile 1 Win Rate** | **100.0%** | **10.0%** | Flat across deciles |
| **Decile 10 Win Rate** | **0.0%** | **9.6%** | Flat across deciles |
| **Duplicate Allocations** | 0 | **0** | Exactly 0 |
| **Oversell Count** | 0 | **0** | Exactly 0 |
