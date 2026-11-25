import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'

function key(): Buffer {
  if (!/^[a-fA-F0-9]{64}$/.test(env.TOKEN_ENCRYPTION_KEY)) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 32-byte hex value')
  }
  return Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex')
}

export function encryptToken(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`
}

export function decryptToken(value: string): string {
  const [ivHex, tagHex, encryptedHex, ...extra] = value.split('.')
  if (!ivHex || !tagHex || !encryptedHex || extra.length) {
    throw new Error('Invalid encrypted token')
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}
