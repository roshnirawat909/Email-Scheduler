import Papa from 'papaparse'

export interface ParsedRecipient {
  email: string
  data: Record<string, string>
}

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const emailTokenPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i
const emailHeaders = new Set([
  'email',
  'e mail',
  'email address',
  'recipient email',
  'email id',
])

function cellText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function findEmailHeader(headers: string[]): number {
  return headers.findIndex((header) => emailHeaders.has(normalizeHeader(header)))
}

function detailsForRow(
  headers: string[],
  row: string[],
  emailColumn: number,
): Record<string, string> {
  const data: Record<string, string> = {}

  for (let index = 0; index < headers.length; index += 1) {
    const key = headers[index].trim()
    const value = row[index]?.trim() ?? ''
    if (index === emailColumn || !key || !value) continue
    if (key.length > 100 || value.length > 1_000) {
      throw new Error('Recipient details must be 100 characters per column name and 1,000 per value or less.')
    }
    data[key] = value
  }

  if (Object.keys(data).length > 50) {
    throw new Error('A recipient can have at most 50 additional fields.')
  }

  return data
}

function recipientsFromRows(rows: unknown[][]): ParsedRecipient[] {
  if (rows.length === 0) return []

  const firstRow = rows[0].map(cellText)
  const headerEmailColumn = findEmailHeader(firstRow)
  const hasHeader =
    headerEmailColumn >= 0 ||
    (firstRow.some((cell) => cell.length > 0) &&
      !firstRow.some((cell) => cell.match(emailPattern)))
  const headers = hasHeader ? firstRow : []
  const emailColumn = hasHeader ? headerEmailColumn : -1
  const dataRows = hasHeader ? rows.slice(1) : rows
  const recipients: ParsedRecipient[] = []

  for (const rawRow of dataRows) {
    const row = rawRow.map(cellText)
    const emailCells =
      emailColumn >= 0
        ? [row[emailColumn] ?? '']
        : row
    const data =
      headers.length > 0 ? detailsForRow(headers, row, emailColumn) : {}

    for (const cell of emailCells) {
      for (const email of cell.match(emailPattern) ?? []) {
        recipients.push({ email: email.toLowerCase(), data })
      }
    }
  }

  return mergeRecipients(recipients)
}

export function mergeRecipients(
  ...groups: ParsedRecipient[][]
): ParsedRecipient[] {
  const merged = new Map<string, ParsedRecipient>()
  for (const recipient of groups.flat()) {
    const email = recipient.email.toLowerCase()
    const previous = merged.get(email)
    merged.set(email, {
      email,
      data: { ...previous?.data, ...recipient.data },
    })
  }
  return [...merged.values()]
}

export function parseManualRecipients(value: string): ParsedRecipient[] {
  return mergeRecipients(
    (value.match(emailPattern) ?? []).map((email) => ({
      email: email.toLowerCase(),
      data: {},
    })),
  )
}

export function findInvalidManualRecipients(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .filter((token) => !emailTokenPattern.test(token))
}

export async function extractRecipients(file: File): Promise<ParsedRecipient[]> {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'xls' || extension === 'xlsx') {
    const XLSX = await import('@e965/xlsx')
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      cellDates: false,
    })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) return []
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[firstSheetName],
      { header: 1, defval: '', raw: false },
    )
    return recipientsFromRows(rows)
  }

  const parsed = Papa.parse<string[]>(await file.text(), {
    skipEmptyLines: true,
  })
  const parseError = parsed.errors.find(
    (error) => error.code !== 'UndetectableDelimiter',
  )
  if (parseError) {
    throw new Error(parseError.message)
  }

  return recipientsFromRows(parsed.data)
}
