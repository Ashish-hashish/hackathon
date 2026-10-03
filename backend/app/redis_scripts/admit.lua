-- admit.lua
-- Atomic batched seat admission
-- KEYS:
--   KEYS[1] = inventory:{evt}
--   KEYS[2] = queue:{evt}
--   KEYS[3] = result:{evt}
--   KEYS[4] = cluster_seats:{evt}
--   KEYS[5] = holds_exp:{evt}
--   KEYS[6] = seat_log
--
-- ARGV:
--   ARGV[1] = evt
--   ARGV[2] = batch_size
--   ARGV[3] = now_sec
--   ARGV[4] = hold_ttl_sec
--   ARGV[5] = max_seats_per_cluster

local evt = ARGV[1]
local batch_size = tonumber(ARGV[2])
local now_sec = tonumber(ARGV[3])
local hold_ttl_sec = tonumber(ARGV[4])
local max_seats = tonumber(ARGV[5])
local expires_at = now_sec + hold_ttl_sec

local inventory = tonumber(redis.call('GET', KEYS[1]) or '0')
local admitted_count = 0

while (admitted_count < batch_size) and (inventory > 0) do
    local identity_id = redis.call('LPOP', KEYS[2])
    if not identity_id then
        break
    end

    -- Fetch user's result data (cluster_id, rank)
    local raw_res = redis.call('HGET', KEYS[3], identity_id)
    local cluster_id = identity_id
    if raw_res then
        -- result is stored as JSON or colon-separated; let's inspect
        local res = cjson.decode(raw_res)
        cluster_id = res['cluster_id'] or identity_id
    end

    -- Check cluster seat cap
    local current_cluster_seats = tonumber(redis.call('HGET', KEYS[4], cluster_id) or '0')
    if current_cluster_seats >= max_seats then
        -- Skip this entry due to cluster cap, record audit status
        if raw_res then
            local res = cjson.decode(raw_res)
            res['status'] = 'SKIPPED_CLUSTER_CAP'
            redis.call('HSET', KEYS[3], identity_id, cjson.encode(res))
        end
        redis.call('XADD', KEYS[6], '*',
            'event_id', evt,
            'identity_id', identity_id,
            'kind', 'SKIPPED_CLUSTER_CAP',
            'cluster_id', cluster_id,
            'at', now_sec
        )
    else
        -- Decrement inventory
        inventory = redis.call('DECR', KEYS[1])
        local hold_id = 'hold:' .. identity_id

        -- Create hold hash
        local hold_key = 'hold:' .. evt .. ':' .. hold_id
        redis.call('HMSET', hold_key,
            'hold_id', hold_id,
            'identity_id', identity_id,
            'cluster_id', cluster_id,
            'status', 'HELD',
            'created_at', now_sec,
            'expires_at', expires_at
        )
        redis.call('EXPIRE', hold_key, hold_ttl_sec * 3)

        -- Track expiration
        redis.call('ZADD', KEYS[5], expires_at, hold_id)

        -- Increment cluster seats
        redis.call('HINCRBY', KEYS[4], cluster_id, 1)

        -- Update user result state
        if raw_res then
            local res = cjson.decode(raw_res)
            res['status'] = 'ADMITTED'
            res['hold_id'] = hold_id
            res['expires_at'] = expires_at
            redis.call('HSET', KEYS[3], identity_id, cjson.encode(res))
        end

        -- Audit log to seat_log stream
        redis.call('XADD', KEYS[6], '*',
            'event_id', evt,
            'identity_id', identity_id,
            'hold_id', hold_id,
            'cluster_id', cluster_id,
            'kind', 'ADMIT',
            'expires_at', expires_at,
            'at', now_sec
        )

        admitted_count = admitted_count + 1
    end
end

return {admitted_count, inventory}
