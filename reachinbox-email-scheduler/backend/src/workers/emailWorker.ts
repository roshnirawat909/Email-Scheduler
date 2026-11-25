import {
  DelayedError,
  UnrecoverableError,
  Worker,
  type Job,
} from 'bullmq'
import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import { Redis } from 'ioredis'
import { logger } from '../config/logger.js'
import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { workerEnv } from '../config/workerEnv.js'
import type { SendEmailJobData } from '../queue/emailQueue.js'
import { reserveEmailSlot } from '../services/rateLimit.service.js'
import {
  classifySmtpFailure,
  type SmtpFailureKind,
} from './smtpFailure.js'

const transport = nodemailer.createTransport({
  host: workerEnv.SMTP_HOST,
  port: workerEnv.SMTP_PORT,
  secure: workerEnv.SMTP_SECURE,
  auth: {
    user: workerEnv.SMTP_USER,
    pass: workerEnv.SMTP_PASS,
  },
  connectionTimeout: workerEnv.SMTP_TIMEOUT_MS,
  greetingTimeout: workerEnv.SMTP_TIMEOUT_MS,
  socketTimeout: workerEnv.SMTP_TIMEOUT_MS,
})

const uncertainSmtpOutcome =
  'SMTP outcome is unknown; automatic retry was stopped to avoid duplicate delivery'

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : 'Unknown SMTP error').slice(
    0,
    2_000,
  )
}

async function beginAttempt(deliveryId: string) {
  return prisma.$transaction(async (transaction) => {
    const delivery = await transaction.emailDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        campaign: {
          include: {
            sender: true,
            attachments: {
              select: { filename: true, contentType: true, data: true },
            },
          },
        },
      },
    })

    if (!delivery || delivery.status === 'SENT' || delivery.status === 'UNKNOWN') {
      return { kind: 'STOPPED' as const }
    }

    const unfinishedAttempt = await transaction.deliveryAttempt.findFirst({
      where: {
        deliveryId,
        outcome: 'SENDING',
        completedAt: null,
      },
      orderBy: { attemptNumber: 'desc' },
    })

    if (unfinishedAttempt) {
      await transaction.deliveryAttempt.update({
        where: { id: unfinishedAttempt.id },
        data: {
          outcome: 'UNKNOWN',
          completedAt: new Date(),
          error: uncertainSmtpOutcome,
        },
      })
      await transaction.emailDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'UNKNOWN',
          lastError: uncertainSmtpOutcome,
        },
      })
      await transaction.outboxEvent.create({
        data: {
          eventKey: `index-email:${deliveryId}:unknown:${unfinishedAttempt.id}`,
          type: 'INDEX_EMAIL',
          aggregateId: deliveryId,
          payload: { deliveryId },
        },
      })
      return { kind: 'STOPPED' as const }
    }

    if (delivery.status !== 'SCHEDULED' && delivery.status !== 'FAILED') {
      return { kind: 'STOPPED' as const }
    }

    const claimed = await transaction.emailDelivery.updateMany({
      where: {
        id: deliveryId,
        status: { in: ['SCHEDULED', 'FAILED'] },
      },
      data: {
        status: 'PROCESSING',
        attemptCount: { increment: 1 },
      },
    })

    if (claimed.count !== 1) return { kind: 'STOPPED' as const }

    const attempt = await transaction.deliveryAttempt.create({
      data: {
        deliveryId,
        attemptNumber: delivery.attemptCount + 1,
        outcome: 'SENDING',
      },
      select: { id: true },
    })

    return { kind: 'STARTED' as const, attemptId: attempt.id, delivery }
  })
}

async function markAttemptFailed(
  deliveryId: string,
  attemptId: string,
  kind: SmtpFailureKind,
  message: string,
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const attempt = await transaction.deliveryAttempt.update({
      where: { id: attemptId },
      data: {
        outcome: kind === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED',
        completedAt: new Date(),
        error: message,
      },
      select: { attemptNumber: true },
    })
    await transaction.emailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: kind === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED',
        lastError: message,
      },
    })
    await transaction.outboxEvent.create({
      data: {
        eventKey: `index-email:${deliveryId}:attempt:${attempt.attemptNumber}`,
        type: 'INDEX_EMAIL',
        aggregateId: deliveryId,
        payload: { deliveryId },
      },
    })
  })
}

async function markAttemptSent(
  deliveryId: string,
  attemptId: string,
  messageId: string,
): Promise<void> {
  const sentAt = new Date()
  await prisma.$transaction(async (transaction) => {
    await transaction.deliveryAttempt.update({
      where: { id: attemptId },
      data: {
        outcome: 'SENT',
        completedAt: sentAt,
        smtpMessageId: messageId,
        error: null,
      },
    })
    await transaction.emailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'SENT',
        sentAt,
        lastError: null,
      },
    })
    await transaction.outboxEvent.create({
      data: {
        eventKey: `index-email:${deliveryId}:sent:${attemptId}`,
        type: 'INDEX_EMAIL',
        aggregateId: deliveryId,
        payload: { deliveryId },
      },
    })
  })
}

async function processEmail(
  job: Job<SendEmailJobData>,
  token: string | undefined,
  rateLimitRedis: Redis,
): Promise<void> {
  const delivery = await prisma.emailDelivery.findUnique({
    where: { id: job.data.deliveryId },
    include: { campaign: { include: { sender: true } } },
  })

  if (!delivery || delivery.status === 'SENT' || delivery.status === 'UNKNOWN') {
    return
  }

  if (delivery.status === 'PROCESSING') {
    await beginAttempt(delivery.id)
    return
  }

  if (delivery.status !== 'SCHEDULED' && delivery.status !== 'FAILED') return

  const reservation = await reserveEmailSlot(
    rateLimitRedis,
    delivery.campaign.senderId,
    delivery.campaignId,
    delivery.campaign.sender.hourlyLimit,
    delivery.campaign.maxPerHour,
    Math.max(
      delivery.campaign.minDelayMs,
      delivery.campaign.sender.minDelayMs ?? 0,
    ),
  )

  if (!reservation.allowed) {
    if (!token) throw new Error('BullMQ did not provide a lock token for rescheduling')
    const hour = Math.floor(reservation.retryAt / 3600000)
    await prisma.outboxEvent.createMany({
      data: [{
        eventKey: `slack-limit:${delivery.campaign.senderId}:${hour}`,
        type: 'SLACK_LIMIT_NOTIFICATION',
        aggregateId: delivery.id,
        payload: {
          workspaceId: delivery.campaign.workspaceId,
          senderId: delivery.campaign.senderId,
          retryAt: reservation.retryAt,
        },
      }],
      skipDuplicates: true,
    })
    await job.moveToDelayed(Math.max(Date.now() + 1, reservation.retryAt), token)
    throw new DelayedError()
  }

  const attempt = await beginAttempt(delivery.id)
  if (attempt.kind !== 'STARTED') return

  const attachments = attempt.delivery.campaign.attachments.map(
    ({ filename, contentType, data }) => ({
      filename,
      contentType,
      content: Buffer.from(data),
      contentDisposition: 'attachment' as const,
    }),
  )

  let result: SMTPTransport.SentMessageInfo
  try {
    result = await transport.sendMail({
      from: {
        name: attempt.delivery.campaign.sender.name,
        address: attempt.delivery.campaign.sender.email,
      },
      to: attempt.delivery.recipientEmail,
      subject: attempt.delivery.campaign.subject,
      text: attempt.delivery.campaign.body,
      ...(attachments.length > 0 ? { attachments } : {}),
    })
  } catch (error) {
    const failureKind = classifySmtpFailure(error)
    const message = failureKind === 'UNKNOWN' ? uncertainSmtpOutcome : errorText(error)
    await markAttemptFailed(
      delivery.id,
      attempt.attemptId,
      failureKind,
      message,
    )

    if (failureKind === 'UNKNOWN') {
      logger.error(
        { deliveryId: delivery.id, attemptId: attempt.attemptId },
        'SMTP result is ambiguous; delivery will not be retried automatically',
      )
      return
    }

    if (failureKind === 'PERMANENT') {
      throw new UnrecoverableError(message)
    }

    throw error
  }

  if (result.accepted.length === 0) {
    const error = 'SMTP server did not accept the recipient'
    await markAttemptFailed(delivery.id, attempt.attemptId, 'PERMANENT', error)
    throw new UnrecoverableError(error)
  }

  await markAttemptSent(delivery.id, attempt.attemptId, result.messageId)
}

export async function createEmailWorker() {
  const workerRedis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  })
  const rateLimitRedis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  })

  const worker = new Worker<SendEmailJobData>(
    workerEnv.QUEUE_NAME,
    (job, token) => processEmail(job, token, rateLimitRedis),
    {
      connection: workerRedis,
      concurrency: workerEnv.WORKER_CONCURRENCY,
      lockDuration: workerEnv.WORKER_LOCK_DURATION_MS,
    },
  )

  worker.on('failed', (job, error) => {
    logger.error(
      {
        deliveryId: job?.data.deliveryId,
        attemptsMade: job?.attemptsMade,
        errorName: error.name,
      },
      'Email job failed',
    )
  })

  worker.on('error', (error) => {
    logger.error({ errorName: error.name }, 'Email worker error')
  })

  return { worker, workerRedis, rateLimitRedis }
}

export async function verifySmtpTransport(): Promise<void> {
  await transport.verify()
}

export async function closeSmtpTransport(): Promise<void> {
  transport.close()
}
