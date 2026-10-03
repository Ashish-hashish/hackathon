# Fair Drop: Demo Script (3 - 5 Minutes)

> Rehearsed script for judging presentation. Follow this sequence strictly.

---

## 1. The Problem & Thesis (30 seconds)
- **Problem**: In high-demand drops (tickets, limited-edition releases), bot operators with automated scripts and residential proxy pools seize almost all inventory within seconds. Normal humans stand zero chance.
- **Our Thesis**: *"We don't try to out-race bots. We make speed irrelevant through a verifiable, randomized draw, and make fake identities worthless through identity cost and cluster-capped weighting."*

---

## 2. The Baseline Failure: FCFS (1 minute)
- Switch to the **Fairness Lab** tab on the web dashboard.
- Show the **FCFS Baseline**:
  - With 20% bot traffic, bots capture **100% of the 500 seats**.
  - Show the **Decile Chart**: Decile 1 (first 10% of arrivals) has a 100% win rate; all other deciles have a 0% win rate.
  - Explain: Speed bias is catastrophic.

---

## 3. Fair Drop in Action (1.5 minutes)
- Point to the **Fair Drop** results under identical conditions:
  - Bot win share is capped at **20.0%** (exactly proportional to traffic share).
  - The **Decile Chart** is completely flat across all 10 arrival windows.
  - **Spearman Correlation**: Show the coefficient of **-0.0148** (statistically indistinguishable from 0).
- Point to the **Sybil Scaling Curve**:
  - Without cluster weighting, an attacker minting 1,000 identities scales linearly to seize all seats.
  - With Fair Drop cluster weighting, their win share remains completely flat (capped at 1 seat per cluster).

---

## 4. Integrity & Chaos Verification (1 minute)
- Switch to the **Live Ops** tab:
  - Point to the Invariant Gauge: `Confirmed + Active Holds + Available == Capacity (500)`.
  - Show Oversell Count: **0**. Duplicate Allocations: **0**.
  - Point to continuous PostgreSQL reconciliation.

---

## 5. Provable Public Audit (30 seconds)
- Switch to the **Public Audit** tab:
  - Show the Pre-Commitment (`SHA-256(seed)` published before window open).
  - Show the Revealed Seed and frozen `entries_hash`.
  - Paste a test entry ID into **Verify My Result In Browser**:
  - Watch the browser recompute the HMAC and Efraimidis-Spirakis key live with a green "Verified Authentic" checkmark.

---

## 6. Closing Statement (15 seconds)
- *"Fair Drop eliminates the bot speed race, protects legitimate users on shared IPs, guarantees zero oversell, and gives every participant cryptographic proof of fairness."*
