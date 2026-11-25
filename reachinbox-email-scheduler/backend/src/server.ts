import { createServer } from 'node:http'
import { app } from './app.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { prisma } from './config/prisma.js'
import { redis } from './config/redis.js'
import { sessionRedis } from './config/sessionRedis.js'

const server = createServer(app)

void redis.connect().catch(() => {
  logger.error('Redis queue client failed to connect; readiness will remain unavailable')
})

void sessionRedis.connect().catch(() => {
  logger.error('Redis session store failed to connect; readiness will remain unavailable')
})

server.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, 'ReachInbox API listening')
})

let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'Shutting down API')

  const timeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out')
    process.exit(1)
  }, 10_000)
  timeout.unref()

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, 'HTTP server failed to close cleanly')
      process.exitCode = 1
    }

    try {
      await prisma.$disconnect()
      redis.disconnect()
      if (sessionRedis.isReady) {
        await sessionRedis.quit()
      } else {
        sessionRedis.destroy()
      }
    } catch (shutdownError) {
      logger.error({ err: shutdownError }, 'Failed to close dependencies cleanly')
      process.exitCode = 1
    } finally {
      clearTimeout(timeout)
    }
  })
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
