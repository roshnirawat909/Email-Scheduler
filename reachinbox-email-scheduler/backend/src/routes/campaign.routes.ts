import { Router } from 'express'
import {
  createCampaignController,
  listCampaignDeliveriesController,
  listCampaignsController,
} from '../controllers/campaign.controller.js'
import { campaignAttachmentUpload } from '../middleware/campaignAttachmentUpload.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const campaignRouter = Router()

campaignRouter.use(requireAuth)
campaignRouter.get('/', listCampaignsController)
campaignRouter.post('/', campaignAttachmentUpload, createCampaignController)
campaignRouter.get('/:campaignId/deliveries', listCampaignDeliveriesController)
