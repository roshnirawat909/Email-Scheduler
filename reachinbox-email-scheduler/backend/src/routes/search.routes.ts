import { Router } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { isSearchConfigured } from '../services/search.service.js'

export const searchRouter = Router()
const querySchema = z.object({ q: z.string().trim().min(1).max(200), limit: z.coerce.number().int().min(1).max(100).default(25) })

searchRouter.use(requireAuth)
searchRouter.get('/', async (request, response) => {
  if (!isSearchConfigured()) {
    response.status(503).json({ error: 'Elasticsearch is not configured' })
    return
  }
  const parsed = querySchema.safeParse(request.query)
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid search query' })
    return
  }
  const auth = response.locals.authContext as { workspace: { id: string } }
  const result = await fetch(`${env.ELASTICSEARCH_URL}/reachinbox-deliveries/_search`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.ELASTICSEARCH_API_KEY ? { authorization: `ApiKey ${env.ELASTICSEARCH_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      size: parsed.data.limit,
      query: {
        bool: {
          filter: [{ term: { 'workspaceId.keyword': auth.workspace.id } }],
          should: [
            { match: { recipientEmail: parsed.data.q } },
            { match: { subject: parsed.data.q } },
          ],
          minimum_should_match: 1,
        },
      },
    }),
  })
  if (!result.ok) {
    response.status(502).json({ error: 'Search service is unavailable' })
    return
  }
  const body = await result.json() as { hits: { hits: Array<{ _id: string; _source: { deliveryId: string } }> } }
  const ids = body.hits.hits.map((hit) => hit._source.deliveryId || hit._id)
  const deliveries = await prisma.emailDelivery.findMany({
    where: { id: { in: ids }, campaign: { workspaceId: auth.workspace.id } },
    include: { campaign: { include: { sender: { select: { id: true, name: true, email: true } } } } },
  })
  response.json({ deliveries })
})
