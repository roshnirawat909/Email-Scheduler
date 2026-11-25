import { z } from 'zod'

const recipientDataSchema = z
  .record(z.string().trim().min(1).max(100), z.string().max(1_000))
  .refine((data) => Object.keys(data).length <= 50, {
    message: 'A recipient can have at most 50 additional fields',
  })

const recipientSchema = z.union([
  z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((email) => ({ email, data: {} })),
  z.object({
    email: z.string().trim().email().max(320),
    data: recipientDataSchema.default({}),
  }),
])

export function createCampaignRequestSchema(maxRecipients: number) {
  return z
    .object({
      senderId: z.string().min(1).max(128),
      subject: z.string().trim().min(1).max(998),
      body: z
        .string()
        .min(1)
        .max(100_000)
        .refine((value) => value.trim().length > 0, 'Email body cannot be blank'),
      recipients: z
        .array(recipientSchema)
        .min(1)
        .max(maxRecipients),
      scheduledStartAt: z.string().datetime({ offset: true }),
      minDelayMs: z.number().int().positive().safe(),
      maxPerHour: z.number().int().positive().safe(),
    })
    .superRefine((campaign, context) => {
      if (Date.parse(campaign.scheduledStartAt) <= Date.now()) {
        context.addIssue({
          code: 'custom',
          path: ['scheduledStartAt'],
          message: 'Scheduled start time must be in the future',
        })
      }

      const lastScheduledAt =
        Date.parse(campaign.scheduledStartAt) +
        (campaign.recipients.length - 1) * campaign.minDelayMs
      if (!Number.isFinite(new Date(lastScheduledAt).getTime())) {
        context.addIssue({
          code: 'custom',
          path: ['minDelayMs'],
          message: 'Delay and recipient count produce an invalid scheduled time',
        })
      }
    })
    .transform((campaign) => {
      const recipientsByEmail = new Map<
        string,
        { email: string; data: Record<string, string> }
      >()
      for (const recipient of campaign.recipients) {
        const email = recipient.email.toLowerCase()
        const previous = recipientsByEmail.get(email)
        recipientsByEmail.set(email, {
          email,
          data: { ...previous?.data, ...recipient.data },
        })
      }

      return {
        ...campaign,
        recipients: [...recipientsByEmail.values()],
        scheduledStartAt: new Date(campaign.scheduledStartAt),
      }
    })
}
