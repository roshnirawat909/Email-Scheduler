import { Client } from '@elastic/elasticsearch'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'

let searchClient: Client | null = null

export function isSearchConfigured(): boolean {
  return Boolean(env.ELASTICSEARCH_URL)
}

function client(): Client {
  if (!searchClient) {
    searchClient = new Client({
      node: env.ELASTICSEARCH_URL,
      ...(env.ELASTICSEARCH_API_KEY
        ? { auth: { apiKey: env.ELASTICSEARCH_API_KEY } }
        : {}),
    })
  }
  return searchClient
}

export async function indexDelivery(deliveryId: string): Promise<void> {
  if (!isSearchConfigured()) return

  const delivery = await prisma.emailDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      campaign: {
        include: { sender: { select: { email: true } }, workspace: { select: { id: true } } },
      },
    },
  })
  if (!delivery) throw new Error('Delivery record no longer exists')

  await client().index({
    index: 'reachinbox-deliveries',
    id: delivery.id,
    document: {
      deliveryId: delivery.id,
      campaignId: delivery.campaignId,
      workspaceId: delivery.campaign.workspaceId,
      recipientEmail: delivery.recipientEmail,
      subject: delivery.campaign.subject,
      senderEmail: delivery.campaign.sender.email,
      body: delivery.campaign.body,
      status: delivery.status,
      scheduledAt: delivery.scheduledAt,
      sentAt: delivery.sentAt,
      updatedAt: delivery.updatedAt,
    },
  })
}
