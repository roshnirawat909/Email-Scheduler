import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesOAuthState } from './oauthState.js'

test('accepts an exact OAuth state match', () => {
  assert.equal(matchesOAuthState('state-value', 'state-value'), true)
})

test('rejects missing, non-string, and mismatched OAuth state', () => {
  assert.equal(matchesOAuthState(undefined, 'state-value'), false)
  assert.equal(matchesOAuthState('state-value', undefined), false)
  assert.equal(matchesOAuthState('state-value', ['state-value']), false)
  assert.equal(matchesOAuthState('state-value', 'other-state'), false)
})
