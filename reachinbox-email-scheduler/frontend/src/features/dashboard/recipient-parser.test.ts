import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from '@e965/xlsx'
import {
  extractRecipients,
  findInvalidManualRecipients,
  mergeRecipients,
  parseManualRecipients,
} from './recipient-parser'

test('imports CSV recipients, merges duplicates, and retains recipient details', async () => {
  const file = new File(
    [
      'Email,Name\r\nAlice@example.com,Alice\r\nALICE@example.com,Alicia\r\nBob@example.com,Bob',
    ],
    'recipients.csv',
    { type: 'text/csv' },
  )

  assert.deepEqual(await extractRecipients(file), [
    { email: 'alice@example.com', data: { Name: 'Alicia' } },
    { email: 'bob@example.com', data: { Name: 'Bob' } },
  ])
})

test('imports recipients from TXT and XLSX files', async () => {
  const textFile = new File(
    ['one@example.com\ntwo@example.com'],
    'recipients.txt',
    { type: 'text/plain' },
  )
  assert.equal((await extractRecipients(textFile)).length, 2)

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Email', 'Name'],
      ['excel@example.com', 'Excel'],
    ]),
    'Recipients',
  )
  const spreadsheetFile = new File(
    [XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })],
    'recipients.xlsx',
  )
  assert.deepEqual(await extractRecipients(spreadsheetFile), [
    { email: 'excel@example.com', data: { Name: 'Excel' } },
  ])
})

test('rejects malformed CSV quoting', async () => {
  const file = new File(
    ['Email,Name\r\nalice@example.com,"unclosed'],
    'malformed.csv',
    { type: 'text/csv' },
  )

  await assert.rejects(() => extractRecipients(file), /quote/i)
})

test('merges manual recipients with imported recipients and validates tokens', () => {
  const imported = [{ email: 'alice@example.com', data: { Name: 'Alice' } }]

  assert.deepEqual(
    mergeRecipients(imported, parseManualRecipients('ALICE@example.com, bob@example.com')),
    [
      { email: 'alice@example.com', data: { Name: 'Alice' } },
      { email: 'bob@example.com', data: {} },
    ],
  )
  assert.deepEqual(findInvalidManualRecipients('valid@example.com,not-an-email'), [
    'not-an-email',
  ])
})
