import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z
    .string()
    .default('')
    .transform((value) =>
      value === 'your-google-oauth-client-id' ? '' : value,
    ),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .default('')
    .transform((value) =>
      value === 'your-google-oauth-client-secret' ? '' : value,
    ),
  GOOGLE_CALLBACK_URL: z
    .string()
    .url()
    .default('http://localhost:4000/api/auth/google/callback'),
  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_CALLBACK_URL: z
    .string()
    .url()
    .default('http://localhost:4000/api/slack/callback'),
  SLACK_NOTIFICATION_CHANNEL_ID: z.string().default(''),
  ELASTICSEARCH_URL: z
    .string()
    .refine((value) => value === '' || /^https?:\/\//.test(value))
    .default(''),
  ELASTICSEARCH_API_KEY: z.string().default(''),
  TOKEN_ENCRYPTION_KEY: z.string().default(''),
  MAX_CAMPAIGN_RECIPIENTS: z
    .coerce
    .number()
    .int()
    .positive()
    .safe()
    .default(10_000),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  const missingOrInvalid = [
    ...new Set(parsedEnv.error.issues.map((issue) => issue.path.join('.'))),
  ]
  throw new Error(
    `Missing or invalid environment configuration: ${missingOrInvalid.join(', ')}`,
  )
}

if (parsedEnv.data.NODE_ENV === 'production') {
  for (const [name, value] of [
    ['FRONTEND_URL', parsedEnv.data.FRONTEND_URL],
    ['DATABASE_URL', parsedEnv.data.DATABASE_URL],
    ['REDIS_URL', parsedEnv.data.REDIS_URL],
    ['GOOGLE_CALLBACK_URL', parsedEnv.data.GOOGLE_CALLBACK_URL],
  ] as const) {
    const url = new URL(value)
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      throw new Error(
        `${name} must not use a local host in production; set a deployed URL or managed service connection string`,
      )
    }
  }

  if (
    parsedEnv.data.GOOGLE_CLIENT_ID &&
    parsedEnv.data.GOOGLE_CALLBACK_URL.includes('localhost')
  ) {
    throw new Error(
      'GOOGLE_CALLBACK_URL must use the deployed backend URL in production',
    )
  }
}

export const env = parsedEnv.data
