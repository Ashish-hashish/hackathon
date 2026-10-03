-- confirm.lua
-- Atomic seat confirmation
-- KEYS:
--   KEYS[1] = hold:{evt}:{hold_id}
--   KEYS[2] = holds_exp:{evt}
--   KEYS[3] = result:{evt}
--   KEYS[4] = idem:{idem_key}
--   KEYS[5] = seat_log
--
-- ARGV:
--   ARGV[1] = evt
--   ARGV[2] = hold_id
--   ARGV[3] = identity_id
--   ARGV[4] = idem_key
--   ARGV[5] = now_sec

local evt = ARGV[1]
local hold_id = ARGV[2]
local identity_id = ARGV[3]
local idem_key = ARGV[4]
local now_sec = tonumber(ARGV[5])

-- 1. Idempotency check
if idem_key and idem_key ~= '' then
    local cached = redis.call('GET', KEYS[4])
    if cached then
        return {'IDEMPOTENT', cached}
    end
end

-- 2. Verify hold exists
local hold_data = redis.call('HMGET', KEYS[1], 'identity_id', 'status', 'expires_at', 'cluster_id')
local hold_identity = hold_data[1]
local hold_status = hold_data[2]
local expires_at = tonumber(hold_data[3] or '0')
local cluster_id = hold_data[4]

if not hold_identity then
    return {'HOLD_NOT_FOUND', ''}
end

-- 3. Verify identity
if hold_identity ~= identity_id then
    return {'IDENTITY_MISMATCH', ''}
end

-- 4. Check already confirmed
if hold_status == 'CONFIRMED' then
    return {'ALREADY_CONFIRMED', ''}
end

-- 5. Expiration check
if hold_status ~= 'HELD' or now_sec > expires_at then
    return {'HOLD_EXPIRED', ''}
end

-- 6. Mark CONFIRMED
redis.call('HMSET', KEYS[1], 'status', 'CONFIRMED', 'confirmed_at', now_sec)
redis.call('ZREM', KEYS[2], hold_id)

-- 7. Update user result
local raw_res = redis.call('HGET', KEYS[3], identity_id)
if raw_res then
    local res = cjson.decode(raw_res)
    res['status'] = 'CONFIRMED'
    res['confirmed_at'] = now_sec
    redis.call('HSET', KEYS[3], identity_id, cjson.encode(res))
end

-- 8. Audit stream log
redis.call('XADD', KEYS[5], '*',
    'event_id', evt,
    'identity_id', identity_id,
    'hold_id', hold_id,
    'cluster_id', cluster_id,
    'kind', 'CONFIRM',
    'at', now_sec
)

local resp_body = cjson.encode({status = 'CONFIRMED', hold_id = hold_id, identity_id = identity_id})
if idem_key and idem_key ~= '' then
    redis.call('SET', KEYS[4], resp_body, 'EX', 86400)
end

return {'CONFIRMED', resp_body}
