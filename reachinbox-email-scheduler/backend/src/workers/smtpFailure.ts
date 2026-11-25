export type SmtpFailureKind = 'RETRYABLE' | 'PERMANENT' | 'UNKNOWN'

function getErrorField(error: unknown, field: string): string | number | undefined {
  if (typeof error !== 'object' || error === null || !(field in error)) {
    return undefined
  }

  const value = Reflect.get(error, field)
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

export function classifySmtpFailure(error: unknown): SmtpFailureKind {
  const responseCode = getErrorField(error, 'responseCode')
  if (typeof responseCode === 'number') {
    return responseCode >= 500 ? 'PERMANENT' : 'RETRYABLE'
  }

  const command = getErrorField(error, 'command')
  if (typeof command === 'string' && command.toUpperCase().includes('DATA')) {
    return 'UNKNOWN'
  }

  const code = getErrorField(error, 'code')
  if (
    typeof code === 'string' &&
    ['ECONNECTION', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ESOCKET'].includes(
      code,
    )
  ) {
    return typeof command === 'string' ? 'RETRYABLE' : 'UNKNOWN'
  }

  return 'PERMANENT'
}
