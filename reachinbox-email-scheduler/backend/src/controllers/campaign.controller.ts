import type { RequestHandler } from 'express'
import { extname } from 'node:path'
import { z } from 'zod'
import type { AuthContext } from '../types/auth.js'
import {
  campaignListQuerySchema,
  createCampaignSchema,
  deliveryListQuerySchema,
  idempotencyKeySchema,
} from '../schemas/campaign.schema.js'
import {
  campaignAttachmentMimeTypes,
  type CampaignAttachmentField,
} from '../schemas/campaign-attachment.js'
import {
  createCampaign,
  type CampaignAttachmentUpload,
  IdempotencyConflictError,
  listCampaignDeliveries,
  listCampaigns,
  listWorkspaceDeliveries,
  SenderNotFoundError,
} from '../services/campaign.service.js'

function authContext(response: Parameters<RequestHandler>[1]): AuthContext {
  return response.locals.authContext as AuthContext
}

function validationIssues(error: z.ZodError) {
  return error.issues.map(({ path, message }) => ({
    path: path.join('.'),
    message,
  }))
}

export const createCampaignController: RequestHandler = async (
  request,
  response,
  next,
) => {
  let campaignBody: unknown = request.body
  if (request.is('multipart/form-data')) {
    const serializedCampaign = request.body?.campaign
    if (typeof serializedCampaign !== 'string') {
      response.status(400).json({
        error: 'Invalid campaign request',
        issues: [{ path: 'campaign', message: 'Campaign details are required' }],
      })
      return
    }

    try {
      campaignBody = JSON.parse(serializedCampaign)
    } catch {
      response.status(400).json({
        error: 'Invalid campaign request',
        issues: [{ path: 'campaign', message: 'Campaign details must be valid JSON' }],
      })
      return
    }
  }

  const body = createCampaignSchema.safeParse(campaignBody)
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.get('Idempotency-Key'),
  )

  if (!body.success || !idempotencyKey.success) {
    response.status(400).json({
      error: 'Invalid campaign request',
      issues: [
        ...(body.success ? [] : validationIssues(body.error)),
        ...(idempotencyKey.success
          ? []
          : [
              {
                path: 'headers.Idempotency-Key',
                message: 'A valid Idempotency-Key header is required',
              },
            ]),
      ],
    })
    return
  }

  const files = Array.isArray(request.files) ? request.files : []
  const attachments: CampaignAttachmentUpload[] = files.map((file) => {
    const extension = extname(file.originalname).toLowerCase()
    const normalizedName = file.originalname.replace(/\\/g, '/')
    const filename =
      normalizedName
        .split('/')
        .pop()
        ?.replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 255) || `attachment${extension}`

    return {
      category: file.fieldname as CampaignAttachmentField,
      filename,
      contentType: campaignAttachmentMimeTypes[extension],
      data: file.buffer,
    }
  })

  const auth = authContext(response)
  try {
    const result = await createCampaign(
      auth.workspace.id,
      auth.user.id,
      idempotencyKey.data,
      body.data,
      attachments,
    )
    response.status(result.statusCode).json(result.campaign)
  } catch (error) {
    if (error instanceof SenderNotFoundError) {
      response.status(404).json({ error: 'Sender not found in this workspace' })
      return
    }
    if (error instanceof IdempotencyConflictError) {
      response.status(409).json({
        error: 'Idempotency-Key was already used for a different request',
      })
      return
    }
    next(error)
  }
}

export const listCampaignsController: RequestHandler = async (
  request,
  response,
  next,
) => {
  const query = campaignListQuerySchema.safeParse(request.query)
  if (!query.success) {
    response.status(400).json({
      error: 'Invalid pagination',
      issues: validationIssues(query.error),
    })
    return
  }

  try {
    const auth = authContext(response)
    response.json(
      await listCampaigns(
        auth.workspace.id,
        query.data.page,
        query.data.pageSize,
      ),
    )
  } catch (error) {
    next(error)
  }
}

export const listCampaignDeliveriesController: RequestHandler = async (
  request,
  response,
  next,
) => {
  const query = deliveryListQuerySchema.safeParse(request.query)
  if (!query.success) {
    response.status(400).json({
      error: 'Invalid delivery query',
      issues: validationIssues(query.error),
    })
    return
  }

  const campaignId = request.params.campaignId
  if (typeof campaignId !== 'string' || campaignId.length === 0) {
    response.status(400).json({ error: 'Invalid campaign ID' })
    return
  }

  try {
    const auth = authContext(response)
    const result = await listCampaignDeliveries(
      auth.workspace.id,
      campaignId,
      query.data.page,
      query.data.pageSize,
      query.data.status,
    )

    if (!result) {
      response.status(404).json({ error: 'Campaign not found' })
      return
    }

    response.json(result)
  } catch (error) {
    next(error)
  }
}

export const listWorkspaceDeliveriesController: RequestHandler = async (
  request,
  response,
  next,
) => {
  const query = deliveryListQuerySchema.safeParse(request.query)
  if (!query.success) {
    response.status(400).json({
      error: 'Invalid delivery query',
      issues: validationIssues(query.error),
    })
    return
  }

  try {
    const auth = authContext(response)
    response.json(
      await listWorkspaceDeliveries(
        auth.workspace.id,
        query.data.page,
        query.data.pageSize,
        query.data.status,
      ),
    )
  } catch (error) {
    next(error)
  }
}
