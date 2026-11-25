import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { encryptToken } from '../services/integrationCrypto.js'
import { matchesOAuthState } from '../utils/oauthState.js'

export const slackRouter = Router()

function saveSession(request: Parameters<typeof requireAuth>[0]): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()))
  })
}

slackRouter.get('/status', requireAuth, async (request, response) => {
  const { workspaceId } = request.session
  if (!workspaceId) {
    response.status(401).json({ error: 'Authentication required' })
    return
  }
  const connection = await prisma.slackConnection.findUnique({ where: { workspaceId } })
  response.json({
    configured: Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET),
    connected: Boolean(connection),
    teamName: connection?.teamName ?? null,
  })
})

slackRouter.get('/connect', requireAuth, async (request, response) => {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    response.status(503).json({ error: 'Slack is not configured' })
    return
  }
  const state = randomBytes(32).toString('hex')
  request.session.slackOAuthState = state
  await saveSession(request)
  const url = new URL('https://slack.com/oauth/v2/authorize')
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID)
  url.searchParams.set('scope', 'chat:write')
  url.searchParams.set('redirect_uri', env.SLACK_CALLBACK_URL)
  url.searchParams.set('state', state)
  response.redirect(url.toString())
})

slackRouter.get('/callback', async (request, response) => {
  const expected = request.session.slackOAuthState
  const received = request.query.state
  if (!matchesOAuthState(expected, received)) {
    response.redirect(`${env.FRONTEND_URL}/login?error=slack_oauth_state_invalid`)
    return
  }
  request.session.slackOAuthState = undefined
  const code = request.query.code
  if (typeof code !== 'string') {
    response.redirect(`${env.FRONTEND_URL}/login?error=slack_sign_in_failed`)
    return
  }
  const workspaceId = request.session.workspaceId
  const userId = request.session.userId
  if (!workspaceId || !userId) {
    response.redirect(`${env.FRONTEND_URL}/login?error=authentication_required`)
    return
  }

  let token: {
    ok: boolean
    access_token?: string
    team?: { id: string; name: string }
  }
  try {
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: env.SLACK_CALLBACK_URL,
      }),
    })
    token = await tokenResponse.json() as typeof token
  } catch {
    response.redirect(`${env.FRONTEND_URL}/login?error=slack_sign_in_failed`)
    return
  }
  if (!token.ok || !token.access_token || !token.team) {
    response.redirect(`${env.FRONTEND_URL}/login?error=slack_sign_in_failed`)
    return
  }

  await prisma.slackConnection.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      connectedById: userId,
      teamId: token.team.id,
      teamName: token.team.name,
      botTokenEncrypted: encryptToken(token.access_token),
      notificationChannelId: env.SLACK_NOTIFICATION_CHANNEL_ID || null,
    },
    update: {
      connectedById: userId,
      teamId: token.team.id,
      teamName: token.team.name,
      botTokenEncrypted: encryptToken(token.access_token),
      notificationChannelId: env.SLACK_NOTIFICATION_CHANNEL_ID || null,
    },
  })
  response.redirect(env.FRONTEND_URL)
})

slackRouter.delete('/disconnect', requireAuth, async (request, response) => {
  if (!request.session.workspaceId) {
    response.status(401).json({ error: 'Authentication required' })
    return
  }
  await prisma.slackConnection.deleteMany({ where: { workspaceId: request.session.workspaceId } })
  response.status(204).end()
})
