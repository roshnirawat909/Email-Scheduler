import { setTimeout as sleep } from 'node:timers/promises'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'
import { workerEnv } from '../config/workerEnv.js'
import { emailQueue } from '../queue/emailQueue.js'
import { indexDelivery } from '../services/search.service.js'
import { WebClient } from '@slack/web-api'
import { decryptToken } from '../services/integrationCrypto.js'

interface ClaimedOutboxEvent {
  id: string
  aggregateId: string
  attempts: number
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : 'Unknown outbox error').slice(
    0,
    2_000,
  )
}

async function claimPendingEvents(): Promise<ClaimedOutboxEvent[]> {
  return prisma.$transaction(async (transaction) => {
    const events = await transaction.$queryRaw<ClaimedOutboxEvent[]>`
      SELECT id, "aggregateId", attempts
      FROM "OutboxEvent"
      WHERE type IN ('ENQUEUE_EMAIL'::"OutboxEventType", 'INDEX_EMAIL'::"OutboxEventType", 'SLACK_LIMIT_NOTIFICATION'::"OutboxEventType")
        AND (
          (status = 'PENDING'::"OutboxEventStatus" AND "availableAt" <= NOW())
          OR
          (status = 'PROCESSING'::"OutboxEventStatus"
            AND "updatedAt" < NOW() - (${workerEnv.OUTBOX_STALE_AFTER_MS} * INTERVAL '1 millisecond'))
        )
      ORDER BY "availableAt" ASC, "createdAt" ASC
      LIMIT ${workerEnv.OUTBOX_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `

    if (events.length > 0) {
      await transaction.outboxEvent.updateMany({
        where: { id: { in: events.map(({ id }) => id) } },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
        },
      })
    }

    return events
  })
}

async function processOutboxEvent(event: ClaimedOutboxEvent): Promise<void> {
  try {
    const fullEvent = await prisma.outboxEvent.findUnique({
      where: { id: event.id },
      select: { type: true, payload: true, aggregateId: true },
    })
    if (!fullEvent) throw new Error('Outbox event no longer exists')

    if (fullEvent.type === 'INDEX_EMAIL') {
      await indexDelivery(fullEvent.aggregateId)
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'COMPLETED', processedAt: new Date(), lastError: null },
      })
      return
    }

    if (fullEvent.type === 'SLACK_LIMIT_NOTIFICATION') {
      const payload = fullEvent.payload as { workspaceId?: string; senderId?: string; retryAt?: number }
      if (payload.workspaceId) {
        const connection = await prisma.slackConnection.findUnique({
          where: { workspaceId: payload.workspaceId },
        })
        if (connection) {
          const channel = connection.notificationChannelId
          if (!channel) throw new Error('Slack notification channel is not configured')
          const client = new WebClient(decryptToken(connection.botTokenEncrypted))
          await client.chat.postMessage({
            channel,
            text: `ReachInbox: sender ${payload.senderId ?? 'unknown'} reached its hourly email limit and deliveries were rescheduled.`,
          })
        }
      }
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'COMPLETED', processedAt: new Date(), lastError: null },
      })
      return
    }

    const delivery = await prisma.emailDelivery.findUnique({
      where: { id: event.aggregateId },
      select: { id: true, status: true, scheduledAt: true },
    })

    if (!delivery || delivery.status !== 'SCHEDULED') {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: delivery ? 'COMPLETED' : 'FAILED',
          processedAt: delivery ? new Date() : null,
          lastError: delivery ? null : 'Delivery record no longer exists',
        },
      })
      return
    }

    await emailQueue.add(
      'send-email',
      { deliveryId: delivery.id },
      {
        jobId: `delivery-${delivery.id}`,
        delay: Math.max(0, delivery.scheduledAt.getTime() - Date.now()),
      },
    )

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: 'COMPLETED',
        processedAt: new Date(),
        lastError: null,
      },
    })
  } catch (error) {
    const retryNumber = event.attempts + 1
    const permanentlyFailed = retryNumber >= workerEnv.OUTBOX_MAX_ATTEMPTS
    const retryDelay = Math.min(
      workerEnv.OUTBOX_RETRY_BASE_MS * 2 ** Math.min(retryNumber - 1, 10),
      workerEnv.OUTBOX_RETRY_MAX_MS,
    )

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: permanentlyFailed ? 'FAILED' : 'PENDING',
        availableAt: new Date(Date.now() + retryDelay),
        lastError: errorText(error),
      },
    })
    logger.error(
      { eventId: event.id, retryNumber, permanentlyFailed },
      'Could not enqueue email delivery',
    )
  }
}

export async function runOutboxRelay(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const events = await claimPendingEvents()
      for (const event of events) {
        if (signal.aborted) break
        await processOutboxEvent(event)
      }
    } catch (error) {
      logger.error({ err: error }, 'Outbox relay iteration failed')
    }

    if (!signal.aborted) {
      await sleep(workerEnv.OUTBOX_POLL_INTERVAL_MS, undefined, {
        signal,
      }).catch((error: unknown) => {
        if (!(error instanceof Error && error.name === 'AbortError')) throw error
      })
    }
  }
}
