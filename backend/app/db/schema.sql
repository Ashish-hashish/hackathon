-- Fair Drop Database Schema
-- Source of truth for identity, entries, allocations, and draws

CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 500,
    window_open_at TIMESTAMPTZ,
    window_close_at TIMESTAMPTZ,
    state VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, OPEN, CLOSED, DRAWN, DONE
    commitment VARCHAR(64),                        -- SHA256 hex of secret seed
    seed_reveal VARCHAR(128),                      -- Revealed seed after window close
    params JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identities (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    email_canonical VARCHAR(255) NOT NULL,
    phone_hash VARCHAR(64),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_identities_event_email UNIQUE(event_id, email_canonical),
    CONSTRAINT uq_identities_event_phone UNIQUE(event_id, phone_hash)
);

CREATE INDEX IF NOT EXISTS idx_identities_event ON identities(event_id);

CREATE TABLE IF NOT EXISTS entries (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    identity_id VARCHAR(64) NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    ts_server BIGINT NOT NULL,                     -- Server arrival time in ms
    ip_prefix VARCHAR(64),                         -- /24 IPv4 or /64 IPv6
    asn VARCHAR(32),
    ua_hash VARCHAR(64),
    hdr_hash VARCHAR(64),
    tls_hash VARCHAR(64),
    pow_solve_ms DOUBLE PRECISION,
    risk_raw DOUBLE PRECISION DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_entries_event_identity UNIQUE(event_id, identity_id)
);

CREATE INDEX IF NOT EXISTS idx_entries_event ON entries(event_id);

CREATE TABLE IF NOT EXISTS draws (
    event_id VARCHAR(64) PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    entries_hash VARCHAR(64) NOT NULL,
    seed_used VARCHAR(128) NOT NULL,
    params JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS draw_results (
    event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    entry_id VARCHAR(64) NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    weight DOUBLE PRECISION NOT NULL,
    cluster_id VARCHAR(64) NOT NULL,
    reason_codes JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(event_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_draw_results_rank ON draw_results(event_id, rank);
CREATE INDEX IF NOT EXISTS idx_draw_results_cluster ON draw_results(event_id, cluster_id);

CREATE TABLE IF NOT EXISTS holds (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    identity_id VARCHAR(64) NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    cluster_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'HELD',    -- HELD, CONFIRMED, EXPIRED, CANCELLED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_holds_event_identity UNIQUE(event_id, identity_id)
);

CREATE INDEX IF NOT EXISTS idx_holds_expiry ON holds(event_id, status, expires_at);

CREATE TABLE IF NOT EXISTS allocations (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    identity_id VARCHAR(64) NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    cluster_id VARCHAR(64) NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_allocations_event_identity UNIQUE(event_id, identity_id)
);

CREATE INDEX IF NOT EXISTS idx_allocations_cluster ON allocations(event_id, cluster_id);

CREATE TABLE IF NOT EXISTS seat_events (
    id BIGSERIAL PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL,
    hold_id VARCHAR(64),
    identity_id VARCHAR(64),
    kind VARCHAR(32) NOT NULL,                     -- ADMIT, CONFIRM, EXPIRE, CANCEL
    details JSONB DEFAULT '{}'::jsonb,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seat_events_event ON seat_events(event_id, at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(128) PRIMARY KEY,
    request_hash VARCHAR(64) NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sim_runs (
    id VARCHAR(64) PRIMARY KEY,
    scenario JSONB NOT NULL,
    mode VARCHAR(32) NOT NULL,                     -- fair_drop, fcfs
    metrics JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
