import { extname } from 'node:path'
import type { RequestHandler } from 'express'
import multer from 'multer'
import {
  campaignAttachmentExtensions,
  MAX_CAMPAIGN_ATTACHMENT_BYTES,
  MAX_CAMPAIGN_ATTACHMENT_COUNT,
  MAX_CAMPAIGN_ATTACHMENT_FILE_BYTES,
  MAX_CAMPAIGN_FORM_BYTES,
} from '../schemas/campaign-attachment.js'

class AttachmentUploadError extends Error {}

class AttachmentTotalSizeError extends Error {}

const requestBytes = new WeakMap<object, number>()

const storage: multer.StorageEngine = {
  _handleFile(request, file, callback) {
    const chunks: Buffer[] = []
    let fileSize = 0
    let settled = false

    file.stream.on('data', (chunk: Buffer) => {
      if (settled) return

      const currentRequestSize = requestBytes.get(request) ?? 0
      if (currentRequestSize + chunk.length > MAX_CAMPAIGN_ATTACHMENT_BYTES) {
        file.stream.destroy(new AttachmentTotalSizeError())
        return
      }

      fileSize += chunk.length
      requestBytes.set(request, currentRequestSize + chunk.length)
      chunks.push(chunk)
    })

    file.stream.once('error', (error: Error) => {
      if (settled) return
      settled = true
      callback(error)
    })

    file.stream.once('end', () => {
      if (settled) return
      settled = true
      callback(null, { buffer: Buffer.concat(chunks, fileSize), size: fileSize })
    })
  },
  _removeFile(_request, file, callback) {
    const storedFile = file as { buffer?: Buffer }
    delete storedFile.buffer
    callback(null)
  },
}

const upload = multer({
  storage,
  limits: {
    fieldNameSize: 64,
    fieldSize: MAX_CAMPAIGN_FORM_BYTES,
    fields: 1,
    fileSize: MAX_CAMPAIGN_ATTACHMENT_FILE_BYTES,
    files: MAX_CAMPAIGN_ATTACHMENT_COUNT,
    parts: MAX_CAMPAIGN_ATTACHMENT_COUNT + 1,
  },
  fileFilter(_request, file, callback) {
    const extensions =
      campaignAttachmentExtensions[
        file.fieldname as keyof typeof campaignAttachmentExtensions
      ]
    if (!extensions) {
      callback(new AttachmentUploadError('Unknown attachment category'))
      return
    }

    const extension = extname(file.originalname).toLowerCase()
    if (!(extensions as readonly string[]).includes(extension)) {
      callback(new AttachmentUploadError(
        `Unsupported file type for the ${file.fieldname} category`,
      ))
      return
    }

    callback(null, true)
  },
})

export const campaignAttachmentUpload: RequestHandler = (
  request,
  response,
  next,
) => {
  if (!request.is('multipart/form-data')) {
    next()
    return
  }

  upload.any()(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        response.status(413).json({
          error: 'Each attachment must be 10 MiB or smaller.',
        })
        return
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        response.status(413).json({
          error: `A campaign can include up to ${MAX_CAMPAIGN_ATTACHMENT_COUNT} attachments.`,
        })
        return
      }
      if (error.code === 'LIMIT_FIELD_VALUE') {
        response.status(413).json({ error: 'Campaign details are too large.' })
        return
      }

      response.status(400).json({ error: 'Invalid attachment upload.' })
      return
    }

    if (error instanceof AttachmentTotalSizeError) {
      response.status(413).json({
        error: 'Attachments must total 15 MiB or less per campaign.',
      })
      return
    }

    if (error instanceof AttachmentUploadError) {
      response.status(400).json({ error: error.message })
      return
    }

    if (error) {
      next(error)
      return
    }

    next()
  })
}
