-- expire.lua
-- Atomic expiration of overdue holds and recycling of inventory
-- KEYS:
--   KEYS[1] = holds_exp:{evt}
--   KEYS[2] = inventory:{evt}
--   KEYS[3] = cluster_seats:{evt}
--   KEYS[4] = result:{evt}
--   KEYS[5] = seat_log
--
-- ARGV:
--   ARGV[1] = evt
--   ARGV[2] = now_sec
--   ARGV[3] = batch_limit

local evt = ARGV[1]
local now_sec = tonumber(ARGV[2])
local batch_limit = tonumber(ARGV[3] or '100')

local due_holds = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now_sec, 'LIMIT', 0, batch_limit)
local expired_count = 0

for _, hold_id in ipairs(due_holds) do
    local hold_key = 'hold:' .. evt .. ':' .. hold_id
    local hold_data = redis.call('HMGET', hold_key, 'identity_id', 'status', 'cluster_id')
    local identity_id = hold_data[1]
    local status = hold_data[2]
    local cluster_id = hold_data[3]

    if identity_id and status == 'HELD' then
        -- Return seat to available inventory
        redis.call('INCR', KEYS[2])

        -- Decrement cluster seat usage
        if cluster_id then
            local current = tonumber(redis.call('HGET', KEYS[3], cluster_id) or '1')
            if current > 0 then
                redis.call('HINCRBY', KEYS[3], cluster_id, -1)
            end
        end

        -- Update hold record
        redis.call('HMSET', hold_key, 'status', 'EXPIRED')

        -- Update user result state
        local raw_res = redis.call('HGET', KEYS[4], identity_id)
        if raw_res then
            local res = cjson.decode(raw_res)
            res['status'] = 'EXPIRED'
            redis.call('HSET', KEYS[4], identity_id, cjson.encode(res))
        end

        -- Audit log to seat_log
        redis.call('XADD', KEYS[5], '*',
            'event_id', evt,
            'identity_id', identity_id,
            'hold_id', hold_id,
            'cluster_id', cluster_id or '',
            'kind', 'EXPIRE',
            'at', now_sec
        )

        expired_count = expired_count + 1
    end

    -- Remove from sorted set of pending expirations
    redis.call('ZREM', KEYS[1], hold_id)
end

return expired_count
