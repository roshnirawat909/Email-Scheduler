import { Router } from 'express'
import {
  createSenderController,
  listSendersController,
} from '../controllers/sender.controller.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const senderRouter = Router()

senderRouter.use(requireAuth)
senderRouter.get('/', listSendersController)
senderRouter.post('/', createSenderController)
