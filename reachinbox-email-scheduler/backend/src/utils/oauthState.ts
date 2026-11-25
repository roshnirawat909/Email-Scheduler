import { timingSafeEqual } from 'node:crypto'

export function matchesOAuthState(
  expected: string | undefined,
  received: unknown,
): received is string {
  if (!expected || typeof received !== 'string') return false

  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  )
}
