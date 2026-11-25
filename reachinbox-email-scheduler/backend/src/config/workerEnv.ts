import { z } from 'zod'

const workerEnvSchema = z.object({
  QUEUE_NAME: z.string().min(1),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().safe(),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().safe(),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().safe(),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().safe(),
  OUTBOX_RETRY_BASE_MS: z.coerce.number().int().positive().safe(),
  OUTBOX_RETRY_MAX_MS: z.coerce.number().int().positive().safe(),
  OUTBOX_STALE_AFTER_MS: z.coerce.number().int().positive().safe(),
  EMAIL_RATE_LIMIT_SCOPE: z.enum(['global', 'sender']),
  EMAIL_MAX_PER_HOUR: z.coerce.number().int().positive().safe(),
  EMAIL_MIN_DELAY_MS: z.coerce.number().int().positive().safe(),
  EMAIL_JOB_ATTEMPTS: z.coerce.number().int().positive().safe(),
  EMAIL_JOB_BACKOFF_MS: z.coerce.number().int().positive().safe(),
  WORKER_LOCK_DURATION_MS: z.coerce.number().int().positive().safe(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().safe(),
  SMTP_SECURE: z.enum(['true', 'false']).transform((value) => value === 'true'),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_TIMEOUT_MS: z.coerce.number().int().positive().safe(),
})

const parsedWorkerEnv = workerEnvSchema.safeParse(process.env)

if (!parsedWorkerEnv.success) {
  const missingOrInvalid = [
    ...new Set(parsedWorkerEnv.error.issues.map((issue) => issue.path.join('.'))),
  ]
  throw new Error(
    `Missing or invalid worker configuration: ${missingOrInvalid.join(', ')}`,
  )
}

if (parsedWorkerEnv.data.WORKER_LOCK_DURATION_MS <= parsedWorkerEnv.data.SMTP_TIMEOUT_MS) {
  throw new Error('WORKER_LOCK_DURATION_MS must exceed SMTP_TIMEOUT_MS')
}

export const workerEnv = parsedWorkerEnv.data
