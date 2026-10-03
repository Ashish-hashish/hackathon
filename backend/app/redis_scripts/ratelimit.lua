-- ratelimit.lua
-- Atomic multi-dimensional token bucket rate limiting
-- KEYS: [key_1, key_2, ... key_N]
-- ARGV: [now_sec, cost, cap_1, rate_1, cap_2, rate_2, ... cap_N, rate_N]

local now_sec = tonumber(ARGV[1])
local cost = tonumber(ARGV[2])

local num_keys = #KEYS
local updated_tokens = {}

-- Phase 1: Check all buckets
for i = 1, num_keys do
    local key = KEYS[i]
    local cap = tonumber(ARGV[2 + (i - 1) * 2 + 1])
    local rate = tonumber(ARGV[2 + (i - 1) * 2 + 2])

    local data = redis.call('HMGET', key, 'tokens', 'last_updated')
    local tokens = tonumber(data[1])
    local last_updated = tonumber(data[2])

    if not tokens or not last_updated then
        tokens = cap
        last_updated = now_sec
    else
        local elapsed = math.max(0, now_sec - last_updated)
        tokens = math.min(cap, tokens + elapsed * rate)
    end

    if tokens < cost then
        local missing = cost - tokens
        local retry_after = math.ceil(missing / rate)
        return {0, key, retry_after}
    end

    updated_tokens[i] = tokens - cost
end

-- Phase 2: All checks passed, deduct tokens
for i = 1, num_keys do
    local key = KEYS[i]
    local cap = tonumber(ARGV[2 + (i - 1) * 2 + 1])
    local rate = tonumber(ARGV[2 + (i - 1) * 2 + 2])
    local new_tokens = updated_tokens[i]
    local ttl = math.ceil(cap / rate) * 2

    redis.call('HMSET', key, 'tokens', new_tokens, 'last_updated', now_sec)
    redis.call('EXPIRE', key, ttl)
end

return {1, 'OK', 0}
