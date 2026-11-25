import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import session from 'express-session'
import { pinoHttp } from 'pino-http'
import { RedisStore } from 'connect-redis'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { prisma } from './config/prisma.js'
import { redis } from './config/redis.js'
import { sessionRedis } from './config/sessionRedis.js'
import { authRouter } from './routes/auth.routes.js'
import { campaignRouter } from './routes/campaign.routes.js'
import { deliveryRouter } from './routes/delivery.routes.js'
import { senderRouter } from './routes/sender.routes.js'
import { slackRouter } from './routes/slack.routes.js'
import { searchRouter } from './routes/search.routes.js'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { emailQueue } from './queue/emailQueue.js'
import { requireAuth } from './middleware/requireAuth.js'

export const app = express()

app.disable('x-powered-by')
if (env.NODE_ENV === 'production') app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(pinoHttp({ logger }))
app.use(
  session({
    name: 'reachinbox.sid',
    store: new RedisStore({
      client: sessionRedis,
      prefix: 'reachinbox:session:',
    }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1_000,
    },
  }),
)

app.get('/', (_request, response) => {
  response.json({
    service: 'ReachInbox API',
    health: {
      live: '/api/health/live',
      ready: '/api/health/ready',
    },
  })
})

app.get('/api/health/live', (_request, response) => {
  response.status(200).json({ status: 'ok' })
})

app.get('/api/health/ready', async (_request, response) => {
  const [databaseResult, queueRedisResult, sessionRedisResult] =
    await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
    sessionRedis.ping(),
  ])
  const dependencies = {
    database: databaseResult.status === 'fulfilled' ? 'ok' : 'unavailable',
    redis:
      queueRedisResult.status === 'fulfilled' &&
      sessionRedisResult.status === 'fulfilled'
        ? 'ok'
        : 'unavailable',
  }
  const ready = Object.values(dependencies).every((status) => status === 'ok')

  if (!ready) {
    logger.warn({ dependencies }, 'Readiness check failed')
  }

  response.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'unavailable',
    dependencies,
  })
})

app.use('/api/auth', authRouter)
app.use('/api/campaigns', campaignRouter)
app.use('/api/deliveries', deliveryRouter)
app.use('/api/senders', senderRouter)
app.use('/api/slack', slackRouter)
app.use('/api/search', searchRouter)

const queueDashboard = new ExpressAdapter()
queueDashboard.setBasePath('/api/admin/queues')
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter: queueDashboard,
})
app.use('/api/admin/queues', requireAuth, queueDashboard.getRouter())

app.use((_request, response) => {
  response.status(404).json({ error: 'Route not found' })
})

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error({ err: error }, 'Unhandled request error')
    response.status(500).json({ error: 'Internal server error' })
  },
)
