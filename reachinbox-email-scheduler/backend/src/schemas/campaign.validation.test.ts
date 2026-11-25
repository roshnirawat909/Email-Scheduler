import assert from 'node:assert/strict'
import test from 'node:test'
import { createCampaignRequestSchema } from './campaign.validation.js'

const schema = createCampaignRequestSchema(10)

function validCampaign(overrides: Record<string, unknown> = {}) {
  return {
    senderId: 'sender-1',
    subject: 'A scheduled update',
    body: 'Hello there',
    recipients: ['Person@Example.com', 'person@example.com'],
    scheduledStartAt: new Date(Date.now() + 60_000).toISOString(),
    minDelayMs: 1_000,
    maxPerHour: 100,
    ...overrides,
  }
}

test('normalizes and deduplicates recipient addresses', () => {
  const parsed = schema.parse(validCampaign())
  assert.deepEqual(parsed.recipients, [
    { email: 'person@example.com', data: {} },
  ])
  assert.ok(parsed.scheduledStartAt instanceof Date)
})

test('merges recipient details when addresses are deduplicated', () => {
  const parsed = schema.parse(
    validCampaign({
      recipients: [
        { email: 'Person@Example.com', data: { name: 'Person' } },
        { email: 'person@example.com', data: { company: 'Example' } },
      ],
    }),
  )

  assert.deepEqual(parsed.recipients, [
    {
      email: 'person@example.com',
      data: { name: 'Person', company: 'Example' },
    },
  ])
})

test('rejects invalid addresses and past schedule times', () => {
  const invalidAddress = schema.safeParse(
    validCampaign({ recipients: ['not-an-email'] }),
  )
  const blankBody = schema.safeParse(validCampaign({ body: '  \n  ' }))
  const pastSchedule = schema.safeParse(
    validCampaign({ scheduledStartAt: new Date(Date.now() - 60_000).toISOString() }),
  )

  assert.equal(invalidAddress.success, false)
  assert.equal(blankBody.success, false)
  assert.equal(pastSchedule.success, false)
})

test('enforces the configured recipient cap', () => {
  const tooManyRecipients = schema.safeParse(
    validCampaign({
      recipients: Array.from({ length: 11 }, (_, index) => `user${index}@example.com`),
    }),
  )

  assert.equal(tooManyRecipients.success, false)
})
