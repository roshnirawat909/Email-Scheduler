import { logger } from '../config/logger.js'
import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { workerEnv } from '../config/workerEnv.js'
import { emailQueue, queueConnection } from '../queue/emailQueue.js'
import {
  closeSmtpTransport,
  createEmailWorker,
  verifySmtpTransport,
} from './emailWorker.js'
import { runOutboxRelay } from './outboxRelay.js'

async function closeRedis(client: typeof queueConnection): Promise<void> {
  if (client.status === 'ready') {
    await client.quit()
  } else {
    client.disconnect()
  }
}

async function run(): Promise<void> {
  await verifySmtpTransport()

  const { worker, workerRedis, rateLimitRedis } = await createEmailWorker()
  const abortController = new AbortController()
  const relay = runOutboxRelay(abortController.signal)
  let stopping = false

  async function shutdown(signal: string): Promise<void> {
    if (stopping) return
    stopping = true
    logger.info({ signal }, 'Stopping email worker')
    abortController.abort()

    const results = await Promise.allSettled([
      relay,
      worker.close(),
      emailQueue.close(),
      closeRedis(queueConnection),
      closeRedis(workerRedis),
      closeRedis(rateLimitRedis),
      prisma.$disconnect(),
    ])
    closeSmtpTransport()

    if (results.some((result) => result.status === 'rejected')) {
      logger.error('Worker shutdown completed with errors')
      process.exitCode = 1
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  logger.info(
    {
      queue: workerEnv.QUEUE_NAME,
      concurrency: workerEnv.WORKER_CONCURRENCY,
      rateScope: workerEnv.EMAIL_RATE_LIMIT_SCOPE,
    },
    'Email worker started',
  )
}

run().catch(async (error: unknown) => {
  closeSmtpTransport()
  await Promise.allSettled([
    emailQueue.close(),
    closeRedis(queueConnection),
    prisma.$disconnect(),
  ])
  logger.fatal(
    { errorName: error instanceof Error ? error.name : 'UnknownError' },
    'Email worker failed to start',
  )
  process.exitCode = 1
})
