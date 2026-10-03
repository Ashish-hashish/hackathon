# Fair Drop Threat Model & Defense Placement

> Analysis of attacker profiles T1 - T8 and our defense matrix.

---

## 1. Threat Matrix

| Threat ID | Attacker Type | Technique | Our Defense | Where Enforced |
|---|---|---|---|---|
| **T1** | Naive Fast Bot | Max-rate request spamming at drop open | Waiting room + commit-reveal draw | Entry window makes speed irrelevant |
| **T2** | Retry Flooder | Hammers `/entry` and `/hold/confirm` | Idempotent Lua check + `Idempotency-Key` header | Redis Lua scripts (`entry.lua`, `confirm.lua`) |
| **T3** | IP Rotator | Rotates residential / datacenter proxy IPs | Subnet prefix bucketing (/24, /64) + identity cost | `client_ip.py` + registration gates |
| **T4** | Header Spoofer | Forges `X-Forwarded-For`, `Forwarded`, `CF-Connecting-IP` | nginx overwrites `X-Real-IP`, strips all forwarding headers | nginx edge reverse proxy |
| **T5** | Sybil Minter | Mints N accounts at drop time with alias emails | Canonical dedupe (+tags, Gmail dots) + account age gate | `canonical.py` + registration checks |
| **T6** | Token Replayer | Replays PoW solutions and session cookies | Single-use server nonce via Redis `SET NX EX` | `entry.lua` |
| **T7** | Human-Like Bot | Jittered timing, realistic headers | Cluster-capped weighting + step-up at claim | `clustering.py`, `weights.py`, confirm step-up |
| **T8** | PoW Farmer | Parallelizes SHA-256 solve across cheap compute | Cluster seat cap (1 seat/cluster); PoW is load-shedding only | `admit.lua` (`MAX_SEATS_PER_CLUSTER = 1`) |

---

## 2. IP Trust & Anti-Spoofing Architecture

1. **Edge Proxy Isolation**: Direct connections to API instances are blocked in production. Only the nginx reverse proxy has network ingress.
2. **Authoritative Header Overwrite**:
   - nginx overwrites `X-Real-IP` with socket address `$remote_addr`.
   - nginx clears `X-Forwarded-For`, `Forwarded`, `CF-Connecting-IP`, `True-Client-IP`.
3. **Application Layer Verification**:
   - `get_client_ip(request)` verifies the direct TCP peer is inside `TRUSTED_PROXY_CIDR`.
   - Normalizes IPv4 to `/24` and IPv6 to `/64` subnets.
4. **Anti-CGNAT Rule**:
   - Shared IP or ASN alone **never** merges entries into a cluster.
   - Requires $\ge 2$ agreeing soft signals (e.g. Subnet + ASN AND User-Agent / header-order hash OR synchronized microsecond timing).
