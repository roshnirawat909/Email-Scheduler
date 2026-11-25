import {
  AlertCircle,
  Archive,
  Braces,
  Code2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Presentation,
  Upload,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react'
import { api } from '../../lib/api'
import {
  extractRecipients,
  findInvalidManualRecipients,
  mergeRecipients,
  parseManualRecipients,
  type ParsedRecipient,
} from './recipient-parser'
import type { Sender } from './types'

const recipientFileExtensions = ['.csv', '.xls', '.xlsx', '.txt'] as const
const maxFileBytes = 10 * 1024 * 1024
const maxTotalBytes = 15 * 1024 * 1024
const maxFileCount = 20

const attachmentCategories = [
  {
    id: 'documents',
    label: 'Document files',
    extensions: ['.pdf', '.doc', '.docx', '.txt'],
    icon: FileText,
  },
  {
    id: 'images',
    label: 'Image files',
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    icon: ImageIcon,
  },
  {
    id: 'videos',
    label: 'Video files',
    extensions: ['.mp4', '.avi', '.mov', '.mkv', '.webm'],
    icon: Video,
  },
  {
    id: 'presentations',
    label: 'Presentation files',
    extensions: ['.ppt', '.pptx'],
    icon: Presentation,
  },
  {
    id: 'spreadsheets',
    label: 'Spreadsheet files',
    extensions: ['.xls', '.xlsx', '.csv'],
    icon: FileSpreadsheet,
  },
  {
    id: 'programming',
    label: 'Programming / language files',
    extensions: [
      '.js',
      '.java',
      '.py',
      '.html',
      '.css',
      '.sql',
      '.ts',
      '.jsx',
      '.tsx',
      '.php',
      '.c',
      '.cpp',
      '.cs',
    ],
    icon: Code2,
  },
  {
    id: 'data',
    label: 'Data files',
    extensions: ['.xml', '.json', '.yaml', '.yml'],
    icon: Braces,
  },
  {
    id: 'compressed',
    label: 'Compressed files',
    extensions: ['.zip', '.rar'],
    icon: Archive,
  },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  extensions: readonly string[]
  icon: LucideIcon
}>

type AttachmentCategory = (typeof attachmentCategories)[number]['id']

interface RecipientFile {
  id: string
  file: File
  recipients: ParsedRecipient[]
}

interface CampaignAttachment {
  id: string
  category: AttachmentCategory
  file: File
}

function localDateTimeValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function apiErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'error' in error.response.data &&
    typeof error.response.data.error === 'string'
  ) {
    return error.response.data.error
  }

  return 'Could not schedule this campaign. Check your connection and try again.'
}

function extensionOf(file: File): string {
  return `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function ComposeCampaignDialog({
  senders,
  onClose,
  onCreated,
}: {
  senders: Sender[]
  onClose: () => void
  onCreated: () => void
}) {
  const [senderId, setSenderId] = useState(senders[0]?.id ?? '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [manualRecipients, setManualRecipients] = useState('')
  const [recipientFiles, setRecipientFiles] = useState<RecipientFile[]>([])
  const [attachments, setAttachments] = useState<CampaignAttachment[]>([])
  const [selectedCategories, setSelectedCategories] = useState<
    Set<AttachmentCategory>
  >(() => new Set())
  const [scheduledStartAt, setScheduledStartAt] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 5 * 60_000)),
  )
  const [minimumStartAt] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 60_000)),
  )
  const [minDelaySeconds, setMinDelaySeconds] = useState('1')
  const [maxPerHour, setMaxPerHour] = useState('100')
  const [parsingRecipients, setParsingRecipients] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [recipientDropActive, setRecipientDropActive] = useState(false)
  const [activeDropCategory, setActiveDropCategory] =
    useState<AttachmentCategory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recipientReplaceInputs = useRef(new Map<string, HTMLInputElement>())
  const attachmentReplaceInputs = useRef(new Map<string, HTMLInputElement>())

  const parsedManualRecipients = useMemo(
    () => parseManualRecipients(manualRecipients),
    [manualRecipients],
  )
  const recipients = useMemo(
    () =>
      mergeRecipients(
        ...recipientFiles.map((recipientFile) => recipientFile.recipients),
        parsedManualRecipients,
      ),
    [parsedManualRecipients, recipientFiles],
  )
  const activeAttachments = useMemo(
    () =>
      attachments.filter((attachment) =>
        selectedCategories.has(attachment.category),
      ),
    [attachments, selectedCategories],
  )

  async function handleRecipientFiles(
    files: File[],
    replaceId?: string,
  ): Promise<void> {
    if (files.length === 0) return

    setError(null)
    setParsingRecipients(true)
    const previousFile = recipientFiles.find((item) => item.id === replaceId)
    let totalBytes = recipientFiles
      .filter((item) => item.id !== replaceId)
      .reduce((total, item) => total + item.file.size, 0)
    let fileCount = recipientFiles.length - (previousFile ? 1 : 0)
    const parsedFiles: RecipientFile[] = []
    const errors: string[] = []

    for (const file of replaceId ? files.slice(0, 1) : files) {
      const extension = extensionOf(file)
      if (!(recipientFileExtensions as readonly string[]).includes(extension)) {
        errors.push(`${file.name}: unsupported recipient file type.`)
        continue
      }
      if (file.size > maxFileBytes) {
        errors.push(`${file.name}: recipient files must be 10 MiB or smaller.`)
        continue
      }
      if (fileCount >= maxFileCount || totalBytes + file.size > maxTotalBytes) {
        errors.push('Recipient files must total 15 MiB or less and include at most 20 files.')
        continue
      }

      totalBytes += file.size
      fileCount += 1
      try {
        const parsedRecipients = await extractRecipients(file)
        if (parsedRecipients.length === 0) {
          errors.push(`${file.name}: no email addresses were found.`)
          continue
        }
        parsedFiles.push({
          id: replaceId ?? crypto.randomUUID(),
          file,
          recipients: parsedRecipients,
        })
      } catch (parseError) {
        errors.push(
          `${file.name}: ${
            parseError instanceof Error
              ? parseError.message
              : 'could not parse this file.'
          }`,
        )
      }
    }

    if (parsedFiles.length > 0) {
      setRecipientFiles((current) => {
        if (!replaceId) return [...current, ...parsedFiles]
        const replacement = parsedFiles[0]
        return current.map((item) =>
          item.id === replaceId ? replacement : item,
        )
      })
    }
    setError(errors[0] ?? null)
    setParsingRecipients(false)
  }

  function handleAttachmentFiles(
    category: AttachmentCategory,
    files: File[],
    replaceId?: string,
  ): void {
    if (files.length === 0) return

    setError(null)
    const currentAttachments = activeAttachments.filter(
      (item) => item.id !== replaceId,
    )
    let totalBytes = currentAttachments.reduce(
      (total, item) => total + item.file.size,
      0,
    )
    let fileCount = currentAttachments.length
    const validFiles: CampaignAttachment[] = []
    const errors: string[] = []
    const categoryConfig = attachmentCategories.find(
      (item) => item.id === category,
    )
    if (!categoryConfig) return

    for (const file of replaceId ? files.slice(0, 1) : files) {
      const extension = extensionOf(file)
      if (
        !(categoryConfig.extensions as readonly string[]).includes(extension)
      ) {
        errors.push(`${file.name}: unsupported file type for ${categoryConfig.label.toLowerCase()}.`)
        continue
      }
      if (file.size > maxFileBytes) {
        errors.push(`${file.name}: each attachment must be 10 MiB or smaller.`)
        continue
      }
      if (
        fileCount >= maxFileCount ||
        totalBytes + file.size > maxTotalBytes
      ) {
        errors.push('Attachments must total 15 MiB or less and include at most 20 files.')
        continue
      }

      totalBytes += file.size
      fileCount += 1
      validFiles.push({
        id: replaceId ?? crypto.randomUUID(),
        category,
        file,
      })
    }

    if (validFiles.length > 0) {
      setAttachments((current) => {
        if (!replaceId) return [...current, ...validFiles]
        const replacement = validFiles[0]
        return current.map((item) =>
          item.id === replaceId ? replacement : item,
        )
      })
    }
    setError(errors[0] ?? null)
  }

  function toggleCategory(
    category: AttachmentCategory,
    checked: boolean,
  ): void {
    const next = new Set(selectedCategories)
    if (checked) next.add(category)
    else next.delete(category)
    setSelectedCategories(next)
    setError(null)
  }

  function skipAttachments(): void {
    setAttachments([])
    setSelectedCategories(new Set())
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (senders.length === 0) {
      setError('Add a sender account before scheduling a campaign.')
      return
    }
    if (findInvalidManualRecipients(manualRecipients).length > 0) {
      setError('Check the manually entered email addresses; separate valid addresses with commas or new lines.')
      return
    }
    if (recipients.length === 0) {
      setError('Enter at least one email address or import recipients from a file.')
      return
    }
    const attachmentBytes = activeAttachments.reduce(
      (total, attachment) => total + attachment.file.size,
      0,
    )
    if (
      activeAttachments.length > maxFileCount ||
      attachmentBytes > maxTotalBytes ||
      activeAttachments.some((attachment) => attachment.file.size > maxFileBytes)
    ) {
      setError('Selected attachments must include at most 20 files, 10 MiB each, and 15 MiB total.')
      return
    }
    if (!subject.trim() || !body.trim()) {
      setError('Add a subject and a non-empty email body.')
      return
    }
    if (new Date(scheduledStartAt).getTime() <= Date.now()) {
      setError('Choose a start time in the future.')
      return
    }

    const delayMs = Math.round(Number(minDelaySeconds) * 1_000)
    const hourlyLimit = Number(maxPerHour)
    if (!Number.isSafeInteger(delayMs) || delayMs < 1) {
      setError('Minimum delay must be a positive number of seconds.')
      return
    }
    if (!Number.isSafeInteger(hourlyLimit) || hourlyLimit < 1) {
      setError('Maximum emails per hour must be a positive whole number.')
      return
    }

    const campaign = {
      senderId,
      subject,
      body,
      recipients,
      scheduledStartAt: new Date(scheduledStartAt).toISOString(),
      minDelayMs: delayMs,
      maxPerHour: hourlyLimit,
    }

    setSubmitting(true)
    setUploadProgress(activeAttachments.length > 0 ? 0 : null)
    try {
      const requestOptions = {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }

      if (activeAttachments.length === 0) {
        await api.post('/api/campaigns', campaign, requestOptions)
      } else {
        const formData = new FormData()
        formData.append('campaign', JSON.stringify(campaign))
        for (const attachment of activeAttachments) {
          formData.append(
            attachment.category,
            attachment.file,
            attachment.file.name,
          )
        }

        await api.post('/api/campaigns', formData, {
          ...requestOptions,
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              setUploadProgress(
                Math.round((progressEvent.loaded / progressEvent.total) * 100),
              )
            }
          }
        })
      }
      onCreated()
    } catch (submitError) {
      setError(apiErrorMessage(submitError))
    } finally {
      setSubmitting(false)
      setUploadProgress(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose()
      }}
    >
      <section
        aria-labelledby="compose-title"
        aria-modal="true"
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        role="dialog"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">New campaign</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900" id="compose-title">Compose email</h2>
          </div>
          <button
            aria-label="Close compose dialog"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </div>

        <form className="space-y-5 px-5 py-6 sm:px-7" onSubmit={(event) => void handleSubmit(event)}>
          {senders.length === 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              You need to add a sender before you can schedule emails.
            </p>
          )}

          <label className="block text-sm font-medium text-slate-700">
            Send from
            <select
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              onChange={(event) => setSenderId(event.target.value)}
              required
              value={senderId}
            >
              {senders.length === 0 && <option value="">No sender accounts</option>}
              {senders.map((sender) => (
                <option key={sender.id} value={sender.id}>{sender.name} · {sender.email}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Subject
            <input
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              maxLength={998}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="A quick update"
              required
              value={subject}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Email body
            <textarea
              className="mt-2 min-h-36 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 font-normal leading-6 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              maxLength={100_000}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write the message you want to send…"
              required
              value={body}
            />
          </label>

          <section className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Recipients</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Type addresses, import a recipient file, or use both. Recipient files are never sent as attachments.
              </p>
            </div>

            <label className="block text-sm font-medium text-slate-700" htmlFor="manual-recipients">
              Email addresses <span className="font-normal text-slate-500">(optional if imported below)</span>
              <textarea
                className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                id="manual-recipients"
                onChange={(event) => setManualRecipients(event.target.value)}
                placeholder="Paste addresses separated by commas or new lines"
                value={manualRecipients}
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">
                Recipient files <span className="font-normal text-slate-500">(optional: CSV, XLS, XLSX, TXT)</span>
              </p>
              {recipientFiles.length > 0 && (
                <button
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  disabled={submitting}
                  onClick={() => setRecipientFiles([])}
                  type="button"
                >
                  Skip recipient files
                </button>
              )}
            </div>
            <div>
              <label
                className={`mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 transition ${
                  recipientDropActive
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/40'
                }`}
                htmlFor="recipient-files"
                onDragLeave={() => setRecipientDropActive(false)}
                onDragOver={(event: DragEvent<HTMLLabelElement>) => {
                  event.preventDefault()
                  setRecipientDropActive(true)
                }}
                onDrop={(event: DragEvent<HTMLLabelElement>) => {
                  event.preventDefault()
                  setRecipientDropActive(false)
                  void handleRecipientFiles(Array.from(event.dataTransfer.files))
                }}
              >
                {parsingRecipients ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin text-indigo-600" size={20} />
                ) : (
                  <FileSpreadsheet aria-hidden="true" className="text-indigo-600" size={20} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">
                    Drop recipient files here or browse
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {recipients.length.toLocaleString()} unique recipient{recipients.length === 1 ? '' : 's'} from files and typed addresses
                  </span>
                </span>
                <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                  Browse
                </span>
              </label>
              <input
                accept=".csv,.xls,.xlsx,.txt,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                id="recipient-files"
                multiple
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const files = Array.from(event.currentTarget.files ?? [])
                  event.currentTarget.value = ''
                  void handleRecipientFiles(files)
                }}
                type="file"
              />
              <p className="mt-2 text-xs text-slate-500">
                Recipient files are processed for addresses and details only (10 MiB per file, 15 MiB total).
              </p>
            </div>

            {recipientFiles.map((recipientFile) => (
              <div
                className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                key={recipientFile.id}
              >
                <FileSpreadsheet aria-hidden="true" className="shrink-0 text-indigo-600" size={19} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {recipientFile.file.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatFileSize(recipientFile.file.size)} · {extensionOf(recipientFile.file).slice(1).toUpperCase()} · {recipientFile.recipients.length} unique emails
                  </span>
                </span>
                <button
                  className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                  disabled={parsingRecipients || submitting}
                  onClick={() => recipientReplaceInputs.current.get(recipientFile.id)?.click()}
                  type="button"
                >
                  Replace
                </button>
                <input
                  accept=".csv,.xls,.xlsx,.txt"
                  className="sr-only"
                  ref={(element) => {
                    if (element) recipientReplaceInputs.current.set(recipientFile.id, element)
                    else recipientReplaceInputs.current.delete(recipientFile.id)
                  }}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const file = event.currentTarget.files?.[0]
                    event.currentTarget.value = ''
                    if (file) void handleRecipientFiles([file], recipientFile.id)
                  }}
                  type="file"
                />
                <button
                  aria-label={`Remove ${recipientFile.file.name}`}
                  className="text-xs font-semibold text-rose-700 hover:text-rose-900"
                  disabled={submitting}
                  onClick={() =>
                    setRecipientFiles((current) =>
                      current.filter((item) => item.id !== recipientFile.id),
                    )
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}

            <p className="text-xs text-slate-500">
              Imported non-email columns are saved with each recipient; message personalization is not applied.
            </p>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Email attachments</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Every category is optional. Only files in selected categories are attached to outgoing emails.
                </p>
              </div>
              <button
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                disabled={submitting}
                onClick={skipAttachments}
                type="button"
              >
                No attachments
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {attachmentCategories.map((category) => {
                const CategoryIcon = category.icon
                const isSelected = selectedCategories.has(category.id)
                const categoryFiles = attachments.filter(
                  (attachment) => attachment.category === category.id,
                )

                return (
                  <article
                    className={`rounded-xl border p-3 transition ${
                      isSelected
                        ? 'border-indigo-300 bg-indigo-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                    key={category.id}
                  >
                    <label className="flex cursor-pointer items-center gap-3">
                      <CategoryIcon aria-hidden="true" className="shrink-0 text-indigo-600" size={21} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800">
                          {category.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {category.extensions.join(', ')}
                        </span>
                      </span>
                      <input
                        checked={isSelected}
                        disabled={submitting}
                        onChange={(event) => toggleCategory(category.id, event.target.checked)}
                        type="checkbox"
                      />
                    </label>

                    {isSelected && (
                      <div className="mt-3 space-y-3">
                        <label
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs font-medium transition ${
                            activeDropCategory === category.id
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                              : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
                          }`}
                          htmlFor={`attachments-${category.id}`}
                          onDragLeave={() => setActiveDropCategory(null)}
                          onDragOver={(event: DragEvent<HTMLLabelElement>) => {
                            event.preventDefault()
                            setActiveDropCategory(category.id)
                          }}
                          onDrop={(event: DragEvent<HTMLLabelElement>) => {
                            event.preventDefault()
                            setActiveDropCategory(null)
                            handleAttachmentFiles(category.id, Array.from(event.dataTransfer.files))
                          }}
                        >
                          <Upload aria-hidden="true" className="text-indigo-600" size={17} />
                          Drop files here or browse (up to 10 MiB each)
                        </label>
                        <input
                          accept={category.extensions.join(',')}
                          className="sr-only"
                          id={`attachments-${category.id}`}
                          multiple
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            const files = Array.from(event.currentTarget.files ?? [])
                            event.currentTarget.value = ''
                            handleAttachmentFiles(category.id, files)
                          }}
                          type="file"
                        />

                        {categoryFiles.map((attachment) => (
                          <div
                            className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-2"
                            key={attachment.id}
                          >
                            <CategoryIcon aria-hidden="true" className="shrink-0 text-slate-500" size={17} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium text-slate-800">
                                {attachment.file.name}
                              </span>
                              <span className="block text-[11px] text-slate-500">
                                {formatFileSize(attachment.file.size)} · {extensionOf(attachment.file).slice(1).toUpperCase()}
                              </span>
                            </span>
                            <button
                              className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900"
                              disabled={submitting}
                              onClick={() => attachmentReplaceInputs.current.get(attachment.id)?.click()}
                              type="button"
                            >
                              Replace
                            </button>
                            <input
                              accept={category.extensions.join(',')}
                              className="sr-only"
                              ref={(element) => {
                                if (element) attachmentReplaceInputs.current.set(attachment.id, element)
                                else attachmentReplaceInputs.current.delete(attachment.id)
                              }}
                              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                const file = event.currentTarget.files?.[0]
                                event.currentTarget.value = ''
                                if (file) handleAttachmentFiles(category.id, [file], attachment.id)
                              }}
                              type="file"
                            />
                            <button
                              aria-label={`Remove ${attachment.file.name}`}
                              className="text-[11px] font-semibold text-rose-700 hover:text-rose-900"
                              disabled={submitting}
                              onClick={() =>
                                setAttachments((current) =>
                                  current.filter((item) => item.id !== attachment.id),
                                )
                              }
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>

            <p className="text-xs text-slate-500">
              Selected: {activeAttachments.length} file{activeAttachments.length === 1 ? '' : 's'} · {formatFileSize(activeAttachments.reduce((total, item) => total + item.file.size, 0))} of 15 MiB total. Unchecking a category excludes its files from this campaign.
            </p>
            {activeAttachments.length > 0 && uploadProgress !== null && (
              <div aria-live="polite" className="space-y-1">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Uploading attachments</span>
                  <span>{uploadProgress}%</span>
                </div>
                <progress
                  aria-label="Attachment upload progress"
                  className="h-2 w-full accent-indigo-600"
                  max={100}
                  value={uploadProgress}
                />
              </div>
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-slate-700 sm:col-span-3">
              Start date and time
              <input
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                min={minimumStartAt}
                onChange={(event) => setScheduledStartAt(event.target.value)}
                required
                type="datetime-local"
                value={scheduledStartAt}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Minimum delay
              <span className="relative mt-2 block">
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-16 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  min="0.001"
                  onChange={(event) => setMinDelaySeconds(event.target.value)}
                  required
                  step="0.1"
                  type="number"
                  value={minDelaySeconds}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">seconds</span>
              </span>
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Maximum emails per hour
              <input
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                min="1"
                onChange={(event) => setMaxPerHour(event.target.value)}
                required
                type="number"
                value={maxPerHour}
              />
            </label>
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800" role="alert">
              <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting || parsingRecipients || senders.length === 0}
              type="submit"
            >
              {submitting && <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />}
              {submitting ? 'Scheduling…' : 'Schedule campaign'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
