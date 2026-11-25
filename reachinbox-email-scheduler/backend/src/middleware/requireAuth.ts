import type { RequestHandler } from 'express'
import { prisma } from '../config/prisma.js'
import type { AuthContext } from '../types/auth.js'

export const requireAuth: RequestHandler = async (request, response, next) => {
  const { userId, workspaceId } = request.session
  if (!userId || !workspaceId) {
    response.status(401).json({ error: 'Authentication required' })
    return
  }

  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true },
        },
        workspace: {
          select: { id: true, name: true, slug: true },
        },
      },
    })

    if (!membership) {
      request.session.destroy((destroyError) => {
        if (destroyError) {
          next(destroyError)
          return
        }
        response.clearCookie('reachinbox.sid', {
          httpOnly: true,
          path: '/',
          sameSite: 'lax',
        })
        response.status(401).json({ error: 'Authentication required' })
      })
      return
    }

    response.locals.authContext = {
      user: membership.user,
      workspace: membership.workspace,
      role: membership.role,
    } satisfies AuthContext
    next()
  } catch (error) {
    next(error)
  }
}
