import { createHash } from 'node:crypto'
import { prisma } from '../config/prisma.js'
import {
  campaignResponseSchema,
  type CampaignResponse,
  type CreateCampaignInput,
} from '../schemas/campaign.schema.js'
import {
  campaignAttachmentCategory,
  type CampaignAttachmentField,
} from '../schemas/campaign-attachment.js'

const idempotencyTtlMs = 24 * 60 * 60 * 1_000

export interface CampaignAttachmentUpload {
  category: CampaignAttachmentField
  filename: string
  contentType: string
  data: Buffer
}

export class SenderNotFoundError extends Error {}

export class IdempotencyConflictError extends Error {}

interface CreateCampaignResult {
  statusCode: 200 | 201
  campaign: CampaignResponse
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  )
}

function resultFromIdempotencyRecord(
  response: unknown,
  requestHash: string,
  storedHash: string,
): CreateCampaignResult {
  if (storedHash !== requestHash) throw new IdempotencyConflictError()
  return {
    statusCode: 200,
    campaign: campaignResponseSchema.parse(response),
  }
}

export async function createCampaign(
  workspaceId: string,
  userId: string,
  idempotencyKey: string,
  input: CreateCampaignInput,
  attachments: CampaignAttachmentUpload[] = [],
): Promise<CreateCampaignResult> {
  const hash = createHash('sha256').update(
    JSON.stringify({
      ...input,
      recipients: input.recipients.map(({ email }) => email),
    }),
  )
  if (input.recipients.some(({ data }) => Object.keys(data).length > 0)) {
    hash.update('\0recipient-details\0')
    hash.update(JSON.stringify(input.recipients))
  }
  for (const attachment of attachments) {
    hash.update('\0attachment\0')
    hash.update(attachment.category)
    hash.update('\0')
    hash.update(attachment.filename)
    hash.update('\0')
    hash.update(attachment.contentType)
    hash.update('\0')
    hash.update(attachment.data)
  }
  const requestHash = hash.digest('hex')
  const now = new Date()

  try {
    return await prisma.$transaction(async (transaction) => {
      const existing = await transaction.idempotencyRecord.findUnique({
        where: {
          workspaceId_key: { workspaceId, key: idempotencyKey },
        },
      })

      if (existing && existing.expiresAt > now) {
        return resultFromIdempotencyRecord(
          existing.response,
          requestHash,
          existing.requestHash,
        )
      }

      if (existing) {
        await transaction.idempotencyRecord.delete({
          where: { id: existing.id },
        })
      }

      const sender = await transaction.senderAccount.findFirst({
        where: {
          id: input.senderId,
          workspaceId,
          enabled: true,
        },
        select: { id: true },
      })
      if (!sender) throw new SenderNotFoundError()

      const campaign = await transaction.campaign.create({
        data: {
          workspaceId,
          createdById: userId,
          senderId: sender.id,
          subject: input.subject,
          body: input.body,
          scheduledStartAt: input.scheduledStartAt,
          minDelayMs: input.minDelayMs,
          maxPerHour: input.maxPerHour,
          status: 'SCHEDULED',
        },
        select: {
          id: true,
          subject: true,
          scheduledStartAt: true,
          status: true,
        },
      })

      if (attachments.length > 0) {
        await transaction.campaignAttachment.createMany({
          data: attachments.map((attachment) => ({
            campaignId: campaign.id,
            category: campaignAttachmentCategory[attachment.category],
            filename: attachment.filename,
            contentType: attachment.contentType,
            size: attachment.data.byteLength,
            data: Uint8Array.from(attachment.data),
          })),
        })
      }

      const deliveries = await transaction.emailDelivery.createManyAndReturn({
        data: input.recipients.map((recipient, index) => ({
          campaignId: campaign.id,
          recipientEmail: recipient.email,
          normalizedRecipient: recipient.email,
          ...(Object.keys(recipient.data).length > 0
            ? { recipientData: recipient.data }
            : {}),
          status: 'SCHEDULED',
          scheduledAt: new Date(
            input.scheduledStartAt.getTime() + index * input.minDelayMs,
          ),
        })),
        select: { id: true },
      })

      await transaction.outboxEvent.createMany({
        data: deliveries.flatMap(({ id }) => [
          {
            eventKey: `enqueue-email:${id}`,
            type: 'ENQUEUE_EMAIL',
            aggregateId: id,
            payload: { deliveryId: id },
          },
          {
            eventKey: `index-email:${id}:scheduled`,
            type: 'INDEX_EMAIL',
            aggregateId: id,
            payload: { deliveryId: id },
          },
        ]),
      })

      const response: CampaignResponse = {
        campaignId: campaign.id,
        subject: campaign.subject,
        recipientCount: deliveries.length,
        scheduledStartAt: campaign.scheduledStartAt.toISOString(),
        status: 'SCHEDULED',
      }

      await transaction.idempotencyRecord.create({
        data: {
          workspaceId,
          key: idempotencyKey,
          requestHash,
          response,
          expiresAt: new Date(Date.now() + idempotencyTtlMs),
        },
      })

      return { statusCode: 201, campaign: response }
    })
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error

    const existing = await prisma.idempotencyRecord.findUnique({
      where: {
        workspaceId_key: { workspaceId, key: idempotencyKey },
      },
    })

    if (existing && existing.expiresAt > new Date()) {
      return resultFromIdempotencyRecord(
        existing.response,
        requestHash,
        existing.requestHash,
      )
    }

    throw error
  }
}

export async function listCampaigns(
  workspaceId: string,
  page: number,
  pageSize: number,
) {
  const where = { workspaceId }
  const [campaigns, total] = await prisma.$transaction([
    prisma.campaign.findMany({
      where,
      select: {
        id: true,
        subject: true,
        scheduledStartAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        sender: { select: { id: true, name: true, email: true } },
        _count: { select: { deliveries: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.campaign.count({ where }),
  ])

  return { campaigns, total, page, pageSize }
}

export async function listCampaignDeliveries(
  workspaceId: string,
  campaignId: string,
  page: number,
  pageSize: number,
  status?: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'UNKNOWN',
) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    select: { id: true },
  })
  if (!campaign) return null

  const where = { campaignId, ...(status ? { status } : {}) }
  const [deliveries, total] = await prisma.$transaction([
    prisma.emailDelivery.findMany({
      where,
      select: {
        id: true,
        recipientEmail: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        attemptCount: true,
        createdAt: true,
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.emailDelivery.count({ where }),
  ])

  return { deliveries, total, page, pageSize }
}

export async function listWorkspaceDeliveries(
  workspaceId: string,
  page: number,
  pageSize: number,
  status?: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'UNKNOWN',
) {
  const where = {
    campaign: { workspaceId },
    ...(status ? { status } : {}),
  }
  const [deliveries, total] = await prisma.$transaction([
    prisma.emailDelivery.findMany({
      where,
      select: {
        id: true,
        recipientEmail: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        attemptCount: true,
        campaign: {
          select: {
            id: true,
            subject: true,
            sender: { select: { name: true, email: true } },
          },
        },
      },
      orderBy:
        status === 'SENT' || status === 'FAILED'
          ? [{ sentAt: 'desc' }, { scheduledAt: 'desc' }, { id: 'desc' }]
          : [{ scheduledAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.emailDelivery.count({ where }),
  ])

  return { deliveries, total, page, pageSize }
}
