import { env } from '../config/env.js'
import { z } from 'zod'
import { createCampaignRequestSchema } from './campaign.validation.js'

export const createCampaignSchema = createCampaignRequestSchema(
  env.MAX_CAMPAIGN_RECIPIENTS,
)

export const campaignListQuerySchema = z.object({
  page: z.coerce.number().int().positive().safe().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
})

export const deliveryListQuerySchema = campaignListQuerySchema.extend({
  status: z
    .enum(['SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'UNKNOWN'])
    .optional(),
})

export const campaignResponseSchema = z.object({
  campaignId: z.string(),
  subject: z.string(),
  recipientCount: z.number().int().positive(),
  scheduledStartAt: z.string().datetime(),
  status: z.literal('SCHEDULED'),
})

export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/)

export type CreateCampaignInput = z.output<typeof createCampaignSchema>
export type CampaignResponse = z.infer<typeof campaignResponseSchema>
