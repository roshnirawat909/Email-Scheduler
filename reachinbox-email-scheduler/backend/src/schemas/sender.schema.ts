import { z } from 'zod'

export const createSenderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  hourlyLimit: z.number().int().positive().safe().optional(),
  minDelayMs: z.number().int().positive().safe().optional(),
})
