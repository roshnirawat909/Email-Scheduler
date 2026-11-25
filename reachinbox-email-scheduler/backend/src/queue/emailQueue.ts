import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { env } from '../config/env.js'
import { workerEnv } from '../config/workerEnv.js'

export interface SendEmailJobData {
  deliveryId: string
}

export const queueConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
})

export const emailQueue = new Queue<SendEmailJobData>(workerEnv.QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: workerEnv.EMAIL_JOB_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: workerEnv.EMAIL_JOB_BACKOFF_MS,
    },
    removeOnComplete: { count: 10_000 },
    removeOnFail: false,
  },
})
