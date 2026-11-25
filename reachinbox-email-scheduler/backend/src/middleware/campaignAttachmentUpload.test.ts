import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import express from 'express'
import {
  MAX_CAMPAIGN_ATTACHMENT_BYTES,
  MAX_CAMPAIGN_ATTACHMENT_COUNT,
  MAX_CAMPAIGN_ATTACHMENT_FILE_BYTES,
} from '../schemas/campaign-attachment.js'
import { campaignAttachmentUpload } from './campaignAttachmentUpload.js'

async function postMultipart(form: FormData): Promise<Response> {
  const app = express()
  app.post('/', campaignAttachmentUpload, (request, response) => {
    const files = Array.isArray(request.files) ? request.files : []
    response.json({
      fileFields: files.map((file) => file.fieldname),
      fileSizes: files.map((file) => file.size),
    })
  })

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Test server did not bind to a TCP port')
  }

  try {
    return await fetch(`http://127.0.0.1:${address.port}/`, {
      method: 'POST',
      body: form,
    })
  } finally {
    server.close()
    await once(server, 'close')
  }
}

function campaignForm(): FormData {
  const form = new FormData()
  form.set('campaign', JSON.stringify({ subject: 'Test' }))
  return form
}

test('accepts a campaign with no attachment files', async () => {
  const response = await postMultipart(campaignForm())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { fileFields: [], fileSizes: [] })
})

test('accepts one or multiple files in their matching categories', async () => {
  const oneFile = campaignForm()
  oneFile.append('documents', new Blob(['PDF']), 'brief.pdf')
  const singleResponse = await postMultipart(oneFile)
  assert.equal(singleResponse.status, 200)
  assert.deepEqual(await singleResponse.json(), {
    fileFields: ['documents'],
    fileSizes: [3],
  })

  const multipleFiles = campaignForm()
  multipleFiles.append('documents', new Blob(['PDF']), 'brief.pdf')
  multipleFiles.append('images', new Blob(['PNG']), 'cover.png')
  const multipleResponse = await postMultipart(multipleFiles)
  assert.equal(multipleResponse.status, 200)
  assert.deepEqual(await multipleResponse.json(), {
    fileFields: ['documents', 'images'],
    fileSizes: [3, 3],
  })
})

test('rejects a file whose extension does not match its category', async () => {
  const form = campaignForm()
  form.append('documents', new Blob(['image']), 'photo.png')

  const response = await postMultipart(form)
  assert.equal(response.status, 400)
  assert.match((await response.json() as { error: string }).error, /unsupported file type/i)
})

test('rejects files that exceed per-file and aggregate size limits', async () => {
  const oversizedFile = campaignForm()
  oversizedFile.append(
    'documents',
    new Blob([new Uint8Array(MAX_CAMPAIGN_ATTACHMENT_FILE_BYTES + 1)]),
    'large.pdf',
  )
  const fileResponse = await postMultipart(oversizedFile)
  assert.equal(fileResponse.status, 413)

  const oversizedTotal = campaignForm()
  const partSize = Math.floor(MAX_CAMPAIGN_ATTACHMENT_BYTES / 2) + 1
  oversizedTotal.append(
    'documents',
    new Blob([new Uint8Array(partSize)]),
    'first.pdf',
  )
  oversizedTotal.append(
    'documents',
    new Blob([new Uint8Array(partSize)]),
    'second.pdf',
  )
  const totalResponse = await postMultipart(oversizedTotal)
  assert.equal(totalResponse.status, 413)
  assert.match((await totalResponse.json() as { error: string }).error, /15 MiB/i)
})

test('rejects more than the maximum number of attachments', async () => {
  const form = campaignForm()
  for (let index = 0; index <= MAX_CAMPAIGN_ATTACHMENT_COUNT; index += 1) {
    form.append('documents', new Blob([]), `file-${index}.txt`)
  }

  const response = await postMultipart(form)
  assert.equal(response.status, 413)
  assert.match((await response.json() as { error: string }).error, /up to 20/i)
})
