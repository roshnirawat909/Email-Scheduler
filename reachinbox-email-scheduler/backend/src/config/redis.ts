import { Redis } from 'ioredis'
import { env } from './env.js'
import { logger } from './logger.js'

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt) => Math.min(attempt * 100, 1_000),
})

redis.on('error', () => {
  logger.warn('Redis connection error')
})
