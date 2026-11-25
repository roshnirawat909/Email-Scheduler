import { createClient } from 'redis'
import { env } from './env.js'
import { logger } from './logger.js'

export const sessionRedis = createClient({
  url: env.REDIS_URL,
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 1_000,
    reconnectStrategy: (retries) => Math.min(retries * 250, 2_000),
  },
})

sessionRedis.on('error', () => {
  logger.warn('Redis session-store connection error')
})
