import { randomBytes } from 'node:crypto'
import type { Request } from 'express'
import { Router } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { getOrCreateDefaultWorkspace } from '../services/workspaceService.js'
import type { AuthContext } from '../types/auth.js'
import { matchesOAuthState } from '../utils/oauthState.js'

export const authRouter = Router()

const sessionCookieName = 'reachinbox.sid'

function createGoogleClient(): OAuth2Client | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null

  return new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_CALLBACK_URL,
  )
}

function frontendLoginUrl(error: string): string {
  const url = new URL('/login', env.FRONTEND_URL)
  url.searchParams.set('error', error)
  return url.toString()
}

function saveSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function regenerateSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function destroySession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

authRouter.get('/providers', (_request, response) => {
  response.json({ google: Boolean(createGoogleClient()) })
})

authRouter.get('/google', async (request, response, next) => {
  const client = createGoogleClient()
  if (!client) {
    response.status(503).json({ error: 'Google sign-in is not configured' })
    return
  }

  try {
    const state = randomBytes(32).toString('hex')
    request.session.googleOAuthState = state
    await saveSession(request)

    response.redirect(
      client.generateAuthUrl({
        access_type: 'online',
        prompt: 'select_account',
        scope: ['openid', 'email', 'profile'],
        state,
      }),
    )
  } catch (error) {
    next(error)
  }
})

authRouter.get('/google/callback', async (request, response) => {
  const client = createGoogleClient()
  if (!client) {
    response.redirect(frontendLoginUrl('google_unavailable'))
    return
  }

  const expectedState = request.session.googleOAuthState
  const receivedState = request.query.state
  if (!matchesOAuthState(expectedState, receivedState)) {
    try {
      await destroySession(request)
    } catch {
      logger.warn('Could not clear invalid Google OAuth session')
    }
    response.redirect(frontendLoginUrl('oauth_state_invalid'))
    return
  }

  request.session.googleOAuthState = undefined

  if (typeof request.query.error === 'string') {
    try {
      await saveSession(request)
    } catch {
      logger.warn('Could not clear canceled Google OAuth state')
    }
    response.redirect(frontendLoginUrl('google_sign_in_canceled'))
    return
  }

  if (typeof request.query.code !== 'string') {
    response.redirect(frontendLoginUrl('google_sign_in_failed'))
    return
  }

  try {
    await saveSession(request)
    const { tokens } = await client.getToken(request.query.code)
    if (!tokens.id_token) throw new Error('Google did not return an ID token')

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    })
    const identity = ticket.getPayload()
    if (
      !identity?.sub ||
      !identity.email ||
      identity.email_verified !== true
    ) {
      throw new Error('Google account identity is incomplete or unverified')
    }

    const user = await prisma.user.upsert({
      where: { googleSubject: identity.sub },
      update: {
        email: identity.email,
        name: identity.name || identity.email,
        avatarUrl: identity.picture || null,
      },
      create: {
        googleSubject: identity.sub,
        email: identity.email,
        name: identity.name || identity.email,
        avatarUrl: identity.picture || null,
      },
    })
    const membership = await getOrCreateDefaultWorkspace(user.id, user.name)

    await regenerateSession(request)
    request.session.userId = user.id
    request.session.workspaceId = membership.workspaceId
    await saveSession(request)

    response.redirect(env.FRONTEND_URL)
  } catch (error) {
    logger.error(
      {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
      'Google OAuth callback failed',
    )
    response.redirect(frontendLoginUrl('google_sign_in_failed'))
  }
})

authRouter.get(
  '/me',
  (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    if (!request.session.userId || !request.session.workspaceId) {
      response.json(null)
      return
    }
    next()
  },
  requireAuth,
  (_request, response) => {
    const authContext = response.locals.authContext as AuthContext
    response.json(authContext)
  },
)

authRouter.post('/logout', async (request, response, next) => {
  try {
    await destroySession(request)
    response.clearCookie(sessionCookieName, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
    })
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})
