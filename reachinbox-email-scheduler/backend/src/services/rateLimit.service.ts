import { Redis } from 'ioredis'
import { env } from '../config/env.js'
import { workerEnv } from '../config/workerEnv.js'

const reserveEmailScript = `
local redisTime = redis.call('TIME')
local nowMs = (tonumber(redisTime[1]) * 1000) + math.floor(tonumber(redisTime[2]) / 1000)
local hourBucket = math.floor(nowMs / 3600000)
local nextHourMs = (hourBucket + 1) * 3600000
local hourlyKey = KEYS[1] .. ':' .. hourBucket
local campaignKey = KEYS[2] .. ':' .. hourBucket

local hourlyCount = tonumber(redis.call('GET', hourlyKey) or '0')
if hourlyCount >= tonumber(ARGV[1]) then
  return {0, nextHourMs}
end

local campaignCount = tonumber(redis.call('GET', campaignKey) or '0')
if campaignCount >= tonumber(ARGV[2]) then
  return {0, nextHourMs}
end

local nextAllowedMs = tonumber(redis.call('GET', KEYS[3]) or '0')
if nextAllowedMs > nowMs then
  return {0, nextAllowedMs}
end

local ttlSeconds = math.max(1, math.ceil((nextHourMs - nowMs) / 1000) + 1)
redis.call('INCR', hourlyKey)
if hourlyCount == 0 then redis.call('EXPIRE', hourlyKey, ttlSeconds) end
redis.call('INCR', campaignKey)
if campaignCount == 0 then redis.call('EXPIRE', campaignKey, ttlSeconds) end

local delayMs = tonumber(ARGV[3])
redis.call('SET', KEYS[3], nowMs + delayMs, 'PX', math.max(delayMs * 2, 60000))
return {1, nowMs}
`

export interface EmailReservation {
  allowed: boolean
  retryAt: number
}

export async function reserveEmailSlot(
  redis: Redis,
  senderId: string,
  campaignId: string,
  senderHourlyLimit: number | null,
  campaignMaxPerHour: number,
  campaignMinDelayMs: number,
): Promise<EmailReservation> {
  const isGlobal = workerEnv.EMAIL_RATE_LIMIT_SCOPE === 'global'
  const scope = isGlobal ? 'global' : `sender:${senderId}`
  const hourlyLimit = isGlobal
    ? workerEnv.EMAIL_MAX_PER_HOUR
    : Math.min(
        workerEnv.EMAIL_MAX_PER_HOUR,
        senderHourlyLimit ?? workerEnv.EMAIL_MAX_PER_HOUR,
      )
  const prefix = 'reachinbox:{email-rate-limit}'
  const result = await redis.eval(
    reserveEmailScript,
    3,
    `${prefix}:${scope}:hourly`,
    `${prefix}:campaign:${campaignId}:hourly`,
    `${prefix}:${scope}:next`,
    hourlyLimit,
    campaignMaxPerHour,
    Math.max(workerEnv.EMAIL_MIN_DELAY_MS, campaignMinDelayMs),
  )

  if (
    !Array.isArray(result) ||
    result.length !== 2 ||
    typeof result[0] !== 'number' ||
    typeof result[1] !== 'number'
  ) {
    throw new Error('Redis returned an invalid rate-limit reservation')
  }

  return {
    allowed: result[0] === 1,
    retryAt: result[1],
  }
}
