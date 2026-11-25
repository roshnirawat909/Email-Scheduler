import type { RequestHandler } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { createSenderSchema } from '../schemas/sender.schema.js'
import type { AuthContext } from '../types/auth.js'

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  )
}

function validationIssues(error: z.ZodError) {
  return error.issues.map(({ path, message }) => ({
    path: path.join('.'),
    message,
  }))
}

export const listSendersController: RequestHandler = async (
  _request,
  response,
  next,
) => {
  try {
    const auth = response.locals.authContext as AuthContext
    const senders = await prisma.senderAccount.findMany({
      where: { workspaceId: auth.workspace.id },
      select: {
        id: true,
        name: true,
        email: true,
        provider: true,
        enabled: true,
        hourlyLimit: true,
        minDelayMs: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    response.json({ senders })
  } catch (error) {
    next(error)
  }
}

export const createSenderController: RequestHandler = async (
  request,
  response,
  next,
) => {
  const input = createSenderSchema.safeParse(request.body)
  if (!input.success) {
    response.status(400).json({
      error: 'Invalid sender',
      issues: validationIssues(input.error),
    })
    return
  }

  try {
    const auth = response.locals.authContext as AuthContext
    const sender = await prisma.senderAccount.create({
      data: {
        workspaceId: auth.workspace.id,
        name: input.data.name,
        email: input.data.email,
        hourlyLimit: input.data.hourlyLimit,
        minDelayMs: input.data.minDelayMs,
      },
      select: {
        id: true,
        name: true,
        email: true,
        provider: true,
        enabled: true,
        hourlyLimit: true,
        minDelayMs: true,
        createdAt: true,
      },
    })
    response.status(201).json(sender)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({
        error: 'A sender with this email already exists in this workspace',
      })
      return
    }
    next(error)
  }
}
