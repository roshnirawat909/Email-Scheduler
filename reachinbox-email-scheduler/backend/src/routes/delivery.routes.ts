import { Router } from 'express'
import { listWorkspaceDeliveriesController } from '../controllers/campaign.controller.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const deliveryRouter = Router()

deliveryRouter.use(requireAuth)
deliveryRouter.get('/', listWorkspaceDeliveriesController)
