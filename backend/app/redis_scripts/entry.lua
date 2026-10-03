-- entry.lua
-- Atomic O(1) hot path for /entry
-- Keys:
--   KEYS[1] = window:{evt}
--   KEYS[2] = entries:{evt}
--   KEYS[3] = nonce:{nonce}
--   KEYS[4] = counters:{evt}
--   KEYS[5] = entry_stream
--
-- ARGV:
--   ARGV[1] = identity_id
--   ARGV[2] = nonce_ttl_seconds
--   ARGV[3] = new_entry_id
--   ARGV[4] = ts_server
--   ARGV[5] = ip_prefix
--   ARGV[6] = asn
--   ARGV[7] = ua_hash
--   ARGV[8] = hdr_hash
--   ARGV[9] = tls_hash
--   ARGV[10] = pow_solve_ms
--   ARGV[11] = risk_raw
--   ARGV[12] = evt

-- 1. Check window state
local window_state = redis.call('GET', KEYS[1])
if not window_state or window_state ~= 'OPEN' then
    return {'WINDOW_CLOSED', ''}
end

-- 2. Idempotent check: has identity already entered?
local existing_entry = redis.call('HGET', KEYS[2], ARGV[1])
if existing_entry then
    return {'EXISTING', existing_entry}
end

-- 3. Nonce single-use check (anti-replay)
local nonce_set = redis.call('SET', KEYS[3], '1', 'NX', 'EX', ARGV[2])
if not nonce_set then
    return {'REPLAY', ''}
end

-- 4. Store entry atomically in entries hash
local entry_id = ARGV[3]
redis.call('HSET', KEYS[2], ARGV[1], entry_id)

-- 5. Append to entry stream for background persister
redis.call('XADD', KEYS[5], '*',
    'event_id', ARGV[12],
    'entry_id', entry_id,
    'identity_id', ARGV[1],
    'ts_server', ARGV[4],
    'ip_prefix', ARGV[5],
    'asn', ARGV[6],
    'ua_hash', ARGV[7],
    'hdr_hash', ARGV[8],
    'tls_hash', ARGV[9],
    'pow_solve_ms', ARGV[10],
    'risk_raw', ARGV[11]
)

-- 6. Increment entry counter
redis.call('HINCRBY', KEYS[4], 'entries', 1)

return {'CREATED', entry_id}
