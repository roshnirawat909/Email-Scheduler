import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySmtpFailure } from './smtpFailure.js'

test('marks SMTP DATA failures without a response as ambiguous', () => {
  const error = Object.assign(new Error('Connection lost'), { command: 'DATA' })
  assert.equal(classifySmtpFailure(error), 'UNKNOWN')
})

test('does not retry a connection error when its SMTP phase is unknown', () => {
  const error = Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' })
  assert.equal(classifySmtpFailure(error), 'UNKNOWN')
})

test('retries transient errors known to occur before SMTP DATA', () => {
  const error = Object.assign(new Error('Connection refused'), {
    code: 'ECONNECTION',
    command: 'CONN',
  })
  assert.equal(classifySmtpFailure(error), 'RETRYABLE')
})

test('classifies explicit SMTP response codes', () => {
  const temporary = Object.assign(new Error('Try again'), { responseCode: 451 })
  const permanent = Object.assign(new Error('Mailbox unavailable'), {
    responseCode: 550,
  })

  assert.equal(classifySmtpFailure(temporary), 'RETRYABLE')
  assert.equal(classifySmtpFailure(permanent), 'PERMANENT')
})
