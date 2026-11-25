import axios from 'axios'
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  Plus,
  Search,
  Send,
  Settings2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import type { AuthSession } from '../auth/auth-context'
import { ComposeCampaignDialog } from './compose-campaign-dialog'
import type {
  Campaign,
  CampaignResult,
  Delivery,
  DeliveryResult,
  Sender,
  SenderResult,
} from './types'

type DashboardTab = 'overview' | 'campaigns' | 'senders' | 'search'
type HistoryStatus = 'SENT' | 'FAILED'

const pageSize = 8

function requestError(error: unknown): string {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? 'The API request failed. Please try again.'
  }
  return 'The API request failed. Please try again.'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function StatusBadge({ status }: { status: Delivery['status'] }) {
  const styles: Record<Delivery['status'], string> = {
    SCHEDULED: 'bg-blue-50 text-blue-700 ring-blue-600/15',
    PROCESSING: 'bg-amber-50 text-amber-700 ring-amber-600/15',
    SENT: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    FAILED: 'bg-rose-50 text-rose-700 ring-rose-600/15',
    UNKNOWN: 'bg-slate-100 text-slate-700 ring-slate-500/15',
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${styles[status]}`}>
      {status === 'UNKNOWN' ? 'Needs review' : status[0] + status.slice(1).toLowerCase()}
    </span>
  )
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string
  value: number
  detail: string
  icon: LucideIcon
  accent: string
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value.toLocaleString()}</p>
        </div>
        <span className={`flex size-11 items-center justify-center rounded-xl ${accent}`}>
          <Icon aria-hidden="true" size={20} />
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">{detail}</p>
    </article>
  )
}

function DeliveryTable({
  title,
  rows,
  status,
  page,
  total,
  loading,
  onPageChange,
  emptyMessage,
}: {
  title: string
  rows: Delivery[]
  status: Delivery['status']
  page: number
  total: number
  loading: boolean
  onPageChange: (page: number) => void
  emptyMessage: string
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{total.toLocaleString()} email{total === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="hidden sm:inline">Page {page} of {pageCount}</span>
          <button
            aria-label="Previous page"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={16} />
          </button>
          <button
            aria-label="Next page"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={page >= pageCount || loading}
            onClick={() => onPageChange(page + 1)}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[690px] text-left text-sm">
          <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3.5 sm:px-6">Recipient</th>
              <th className="px-5 py-3.5">Subject</th>
              <th className="px-5 py-3.5">Sender</th>
              <th className="px-5 py-3.5">{status === 'SCHEDULED' ? 'Scheduled for' : 'Activity time'}</th>
              <th className="px-5 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td className="px-6 py-12 text-center text-slate-500" colSpan={5}>
                  <LoaderCircle aria-label="Loading emails" className="mx-auto animate-spin text-indigo-600" size={22} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-6 py-12 text-center" colSpan={5}>
                  <Inbox aria-hidden="true" className="mx-auto text-slate-300" size={28} />
                  <p className="mt-3 text-sm font-medium text-slate-700">{emptyMessage}</p>
                  <p className="mt-1 text-xs text-slate-500">Your email activity will appear here.</p>
                </td>
              </tr>
            ) : (
              rows.map((delivery) => (
                <tr className="hover:bg-slate-50/60" key={delivery.id}>
                  <td className="max-w-56 truncate px-5 py-4 font-medium text-slate-800 sm:px-6">{delivery.recipientEmail}</td>
                  <td className="max-w-56 truncate px-5 py-4 text-slate-600">{delivery.campaign.subject}</td>
                  <td className="px-5 py-4 text-slate-600">{delivery.campaign.sender.name}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                    {formatDate(delivery.sentAt ?? delivery.scheduledAt)}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={delivery.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CampaignTable({
  campaigns,
  loading,
}: {
  campaigns: Campaign[]
  loading: boolean
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <h2 className="font-semibold text-slate-900">Recent campaigns</h2>
        <p className="mt-1 text-xs text-slate-500">Your latest scheduled email campaigns</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3.5 sm:px-6">Campaign</th>
              <th className="px-5 py-3.5">Sender</th>
              <th className="px-5 py-3.5">Recipients</th>
              <th className="px-5 py-3.5">Start time</th>
              <th className="px-5 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="px-6 py-12 text-center" colSpan={5}><LoaderCircle aria-label="Loading campaigns" className="mx-auto animate-spin text-indigo-600" size={22} /></td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td className="px-6 py-12 text-center text-sm text-slate-500" colSpan={5}>No campaigns yet. Create one to start scheduling emails.</td></tr>
            ) : campaigns.map((campaign) => (
              <tr className="hover:bg-slate-50/60" key={campaign.id}>
                <td className="max-w-64 truncate px-5 py-4 font-medium text-slate-800 sm:px-6">{campaign.subject}</td>
                <td className="px-5 py-4 text-slate-600">{campaign.sender.name}</td>
                <td className="px-5 py-4 text-slate-600">{campaign._count.deliveries.toLocaleString()}</td>
                <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(campaign.scheduledStartAt)}</td>
                <td className="px-5 py-4"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{campaign.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SenderForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [hourlyLimit, setHourlyLimit] = useState('')
  const [minDelayMs, setMinDelayMs] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.post('/api/senders', {
        name,
        email,
        ...(hourlyLimit ? { hourlyLimit: Number(hourlyLimit) } : {}),
        ...(minDelayMs ? { minDelayMs: Number(minDelayMs) } : {}),
      })
      setName('')
      setEmail('')
      setHourlyLimit('')
      setMinDelayMs('')
      toast.success('Sender added to your workspace')
      onCreated()
    } catch (submitError) {
      setError(requestError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] sm:p-6">
      <h2 className="font-semibold text-slate-900">Add sender identity</h2>
      <p className="mt-1 text-sm text-slate-500">Register an email address to use as the sender for campaigns.</p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
        <label className="text-sm font-medium text-slate-700">
          Display name
          <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Email address
          <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Sender hourly limit <span className="font-normal text-slate-400">(optional)</span>
          <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" min="1" onChange={(event) => setHourlyLimit(event.target.value)} type="number" value={hourlyLimit} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Sender minimum delay (ms) <span className="font-normal text-slate-400">(optional)</span>
          <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" min="1" onChange={(event) => setMinDelayMs(event.target.value)} type="number" value={minDelayMs} />
        </label>
        {error && <p className="text-sm text-rose-700 sm:col-span-2" role="alert">{error}</p>}
        <div className="sm:col-span-2">
          <button className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60" disabled={submitting} type="submit">
            {submitting ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} /> : <Plus aria-hidden="true" size={17} />}
            Add sender
          </button>
        </div>
      </form>
    </section>
  )
}

export function DashboardPage({
  session,
  onLogout,
}: {
  session: AuthSession
  onLogout: () => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignTotal, setCampaignTotal] = useState(0)
  const [senders, setSenders] = useState<Sender[]>([])
  const [scheduled, setScheduled] = useState<DeliveryResult>({
    deliveries: [],
    total: 0,
    page: 1,
    pageSize,
  })
  const [history, setHistory] = useState<DeliveryResult>({
    deliveries: [],
    total: 0,
    page: 1,
    pageSize,
  })
  const [sentTotal, setSentTotal] = useState(0)
  const [failedTotal, setFailedTotal] = useState(0)
  const [scheduledPage, setScheduledPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>('SENT')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [composeOpen, setComposeOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [slackStatus, setSlackStatus] = useState<{ configured: boolean; connected: boolean; teamName: string | null } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Delivery[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    let active = true

    void Promise.all([
      api.get<CampaignResult>('/api/campaigns', { params: { page: 1, pageSize } }),
      api.get<SenderResult>('/api/senders'),
      api.get<DeliveryResult>('/api/deliveries', {
        params: { page: scheduledPage, pageSize, status: 'SCHEDULED' },
      }),
      api.get<DeliveryResult>('/api/deliveries', {
        params: { page: historyPage, pageSize, status: historyStatus },
      }),
      api.get<DeliveryResult>('/api/deliveries', {
        params: { page: 1, pageSize: 1, status: 'SENT' },
      }),
      api.get<DeliveryResult>('/api/deliveries', {
        params: { page: 1, pageSize: 1, status: 'FAILED' },
      }),
    ])
      .then(([campaignResponse, senderResponse, scheduledResponse, historyResponse, sentResponse, failedResponse]) => {
        if (!active) return
        setCampaigns(campaignResponse.data.campaigns)
        setCampaignTotal(campaignResponse.data.total)
        setSenders(senderResponse.data.senders)
        setScheduled(scheduledResponse.data)
        setHistory(historyResponse.data)
        setSentTotal(sentResponse.data.total)
        setFailedTotal(failedResponse.data.total)
      })
      .catch((loadError) => {
        if (active) setError(requestError(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [historyPage, historyStatus, refreshKey, scheduledPage])

  useEffect(() => {
    let active = true
    api.get<{ configured: boolean; connected: boolean; teamName: string | null }>('/api/slack/status')
      .then((response) => {
        if (active) setSlackStatus(response.data)
      })
      .catch(() => {
        if (active) setSlackStatus(null)
      })
    return () => {
      active = false
    }
  }, [refreshKey])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await onLogout()
    } catch {
      toast.error('Could not sign out. Check the API connection and try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  function refresh() {
    setError(null)
    setLoading(true)
    setRefreshKey((key) => key + 1)
  }

  function changeScheduledPage(page: number) {
    setError(null)
    setLoading(true)
    setScheduledPage(page)
  }

  function changeHistoryPage(page: number) {
    setError(null)
    setLoading(true)
    setHistoryPage(page)
  }

  function changeHistoryStatus(status: HistoryStatus) {
    setError(null)
    setLoading(true)
    setHistoryStatus(status)
    setHistoryPage(1)
  }

  function handleCreated(message: string) {
    setComposeOpen(false)
    refresh()
    toast.success(message)
  }

  async function handleSlackDisconnect() {
    try {
      await api.delete('/api/slack/disconnect')
      setSlackStatus((status) => status ? { ...status, connected: false, teamName: null } : status)
      toast.success('Slack disconnected')
    } catch (disconnectError) {
      toast.error(requestError(disconnectError))
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const response = await api.get<{ deliveries: Delivery[] }>('/api/search', {
        params: { q: searchQuery.trim(), limit: 25 },
      })
      setSearchResults(response.data.deliveries)
    } catch (searchError) {
      toast.error(requestError(searchError))
    } finally {
      setSearching(false)
    }
  }

  const navItems: { key: DashboardTab; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'campaigns', label: 'Campaigns', icon: Send },
    { key: 'senders', label: 'Senders', icon: Users },
    { key: 'search', label: 'Search', icon: Search },
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6">
            <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/20">
              <Mail aria-hidden="true" size={20} />
            </span>
            <span>
              <span className="block text-base font-bold tracking-tight text-slate-900">ReachInbox</span>
              <span className="block text-[11px] text-slate-500">Campaign workspace</span>
            </span>
          </div>
          <div className="px-4 pt-6">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
            <p className="mt-2 truncate px-3 text-sm font-semibold text-slate-800">{session.workspace.name}</p>
          </div>
          <nav aria-label="Main navigation" className="mt-7 space-y-1 px-3">
            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                aria-current={activeTab === key ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                  activeTab === key
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                key={key}
                onClick={() => setActiveTab(key)}
                type="button"
              >
                <Icon aria-hidden="true" size={18} />
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-auto border-t border-slate-100 p-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              {session.user.avatarUrl ? (
                <img alt="" className="size-9 rounded-full object-cover" src={session.user.avatarUrl} />
              ) : (
                <span className="flex size-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                  {session.user.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-800">{session.user.name}</span>
                <span className="block truncate text-[11px] text-slate-500">{session.user.email}</span>
              </span>
              <button
                aria-label="Sign out"
                className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-50"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
                type="button"
              >
                <LogOut aria-hidden="true" size={16} />
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex h-[76px] items-center justify-between gap-4 px-5 sm:px-8">
              <div className="flex items-center gap-3 lg:hidden">
                <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-white"><Mail aria-hidden="true" size={18} /></span>
                <span className="font-bold text-slate-900">ReachInbox</span>
              </div>
              <div className="hidden lg:block">
                <p className="text-xs text-slate-500">{session.workspace.name}</p>
                <h1 className="mt-0.5 text-lg font-semibold text-slate-900">
                  {activeTab === 'overview' ? 'Overview' : activeTab === 'campaigns' ? 'Campaigns' : activeTab === 'senders' ? 'Sender accounts' : 'Search'}
                </h1>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden text-right sm:block">
                  <span className="block text-sm font-medium text-slate-800">{session.user.name}</span>
                  <span className="block text-xs text-slate-500">{session.user.email}</span>
                </span>
                {session.user.avatarUrl ? (
                  <img alt="" className="size-9 rounded-full object-cover" src={session.user.avatarUrl} />
                ) : (
                  <span className="flex size-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                    {session.user.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <button
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
                  disabled={loggingOut}
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  <LogOut aria-label="Sign out" size={17} />
                </button>
              </div>
            </div>
            <nav aria-label="Mobile navigation" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
              {navItems.map(({ key, label, icon: Icon }) => (
                <button
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                    activeTab === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  key={key}
                  onClick={() => setActiveTab(key)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={15} />
                  {label}
                </button>
              ))}
            </nav>
          </header>

          <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-9">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-indigo-600">{session.workspace.name}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  {activeTab === 'overview' ? 'Good to see you' : activeTab === 'campaigns' ? 'Your campaigns' : activeTab === 'senders' ? 'Sender accounts' : 'Search emails'}
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  {activeTab === 'overview'
                    ? 'Monitor your email schedule and campaign activity.'
                    : activeTab === 'campaigns'
                      ? 'Review campaign schedules and recipient counts.'
                      : activeTab === 'senders'
                        ? 'Manage the identities your campaigns send from.'
                        : 'Find deliveries by recipient address or subject.'}
                </p>
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-500"
                onClick={() => setComposeOpen(true)}
                type="button"
              >
                <Plus aria-hidden="true" size={17} />
                Compose email
              </button>
            </div>

            {error && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
                <span className="flex items-center gap-2"><AlertCircle aria-hidden="true" size={17} />{error}</span>
                <button className="font-semibold underline underline-offset-2" onClick={refresh} type="button">Retry</button>
              </div>
            )}

            {activeTab === 'overview' && (
              <>
                <section aria-label="Email statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard accent="bg-indigo-50 text-indigo-700" detail="Created in this workspace" icon={BarChart3} label="Campaigns" value={campaignTotal} />
                  <StatCard accent="bg-blue-50 text-blue-700" detail="Waiting for their scheduled time" icon={CalendarClock} label="Scheduled emails" value={scheduled.total} />
                  <StatCard accent="bg-emerald-50 text-emerald-700" detail="Accepted by the SMTP provider" icon={CheckCircle2} label="Sent emails" value={sentTotal} />
                  <StatCard accent="bg-rose-50 text-rose-700" detail="Review failures before retrying" icon={CircleAlert} label="Failed emails" value={failedTotal} />
                </section>

                <div className="mt-7 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <Clock3 aria-hidden="true" className="text-indigo-600" size={17} />
                          Queue snapshot
                        </div>
                        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                          Scheduled jobs are stored in PostgreSQL and enqueued through Redis-backed BullMQ.
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">API connected</span>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-500">Scheduled</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">{scheduled.total.toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-500">In this workspace</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">{campaignTotal.toLocaleString()} campaigns</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] sm:p-6">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Settings2 aria-hidden="true" className="text-indigo-600" size={17} />
                      Integrations
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3.5">
                      <span className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">S</span>
                        <span>
                          <span className="block text-sm font-medium text-slate-800">Slack</span>
                          <span className="block text-xs text-slate-500">
                            {slackStatus?.connected ? `Connected to ${slackStatus.teamName ?? 'Slack'}` : slackStatus?.configured ? 'Ready to connect' : 'Slack credentials not configured'}
                          </span>
                        </span>
                      </span>
                      {slackStatus?.connected ? (
                        <button className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700" onClick={() => void handleSlackDisconnect()} type="button">Disconnect</button>
                      ) : slackStatus?.configured ? (
                        <a className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700" href="/api/slack/connect">Connect</a>
                    ) : (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Unavailable</span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <ArrowUpRight aria-hidden="true" size={14} />
                      <a className="font-semibold text-indigo-600 hover:underline" href="/api/admin/queues">Open secured BullMQ dashboard</a>
                    </div>
                  </div>
                </div>

                <div className="mt-7 space-y-7">
                  <DeliveryTable
                    emptyMessage="No scheduled emails"
                    loading={loading}
                    onPageChange={changeScheduledPage}
                    page={scheduledPage}
                    rows={scheduled.deliveries}
                    status="SCHEDULED"
                    title="Scheduled emails"
                    total={scheduled.total}
                  />
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">Email activity</h2>
                        <p className="mt-1 text-sm text-slate-500">Recent sent emails and delivery failures</p>
                      </div>
                      <div aria-label="Email activity status" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                        {(['SENT', 'FAILED'] as const).map((status) => (
                          <button
                            aria-pressed={historyStatus === status}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                              historyStatus === status ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                            key={status}
                            onClick={() => {
                              changeHistoryStatus(status)
                            }}
                            type="button"
                          >
                            {status === 'SENT' ? 'Sent' : 'Failed'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <DeliveryTable
                      emptyMessage={historyStatus === 'SENT' ? 'No sent emails yet' : 'No failed emails'}
                      loading={loading}
                      onPageChange={changeHistoryPage}
                      page={historyPage}
                      rows={history.deliveries}
                      status={historyStatus}
                      title={historyStatus === 'SENT' ? 'Sent emails' : 'Failed emails'}
                      total={history.total}
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'campaigns' && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard accent="bg-indigo-50 text-indigo-700" detail="Total campaigns" icon={BarChart3} label="Campaigns" value={campaignTotal} />
                  <StatCard accent="bg-blue-50 text-blue-700" detail="Queued for a future time" icon={CalendarClock} label="Scheduled emails" value={scheduled.total} />
                  <StatCard accent="bg-emerald-50 text-emerald-700" detail="Successfully accepted" icon={CheckCircle2} label="Sent emails" value={sentTotal} />
                </div>
                <CampaignTable campaigns={campaigns} loading={loading} />
              </div>
            )}

            {activeTab === 'senders' && (
              <div className="space-y-5">
                <SenderForm onCreated={refresh} />
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]">
                  <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                    <h2 className="font-semibold text-slate-900">Workspace senders</h2>
                    <p className="mt-1 text-xs text-slate-500">{senders.length} sender account{senders.length === 1 ? '' : 's'}</p>
                  </div>
                  {loading ? (
                    <div className="py-12"><LoaderCircle aria-label="Loading senders" className="mx-auto animate-spin text-indigo-600" size={22} /></div>
                  ) : senders.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                      <Users aria-hidden="true" className="mx-auto text-slate-300" size={28} />
                      <p className="mt-3 text-sm font-medium text-slate-700">No sender accounts yet</p>
                      <p className="mt-1 text-xs text-slate-500">Add a sender identity above to start a campaign.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {senders.map((sender) => (
                        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6" key={sender.id}>
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Mail aria-hidden="true" size={18} /></span>
                            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{sender.name}</span><span className="block truncate text-xs text-slate-500">{sender.email}</span></span>
                          </span>
                          <span className="flex items-center gap-2 text-xs text-slate-500">
                            {sender.hourlyLimit ? `${sender.hourlyLimit} / hour` : 'Worker default limit'}
                            <span className={`rounded-full px-2.5 py-1 font-semibold ${sender.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{sender.enabled ? 'Enabled' : 'Disabled'}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                </section>
              </div>
            )}

            {activeTab === 'search' && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void handleSearch(event)}>
                  <label className="sr-only" htmlFor="delivery-search">Recipient or subject</label>
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    id="delivery-search"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search recipient email or subject"
                    value={searchQuery}
                  />
                  <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={searching} type="submit">
                    {searching ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} /> : <Search aria-hidden="true" size={17} />}
                    Search
                  </button>
                </form>
                <div className="mt-5">
                  {searchResults.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Search results will appear here.</p>
                  ) : (
                    <DeliveryTable emptyMessage="No matching emails" loading={false} onPageChange={() => undefined} page={1} rows={searchResults} status="SENT" title="Matching deliveries" total={searchResults.length} />
                  )}
                </div>
              </section>
            )}

            <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-5 text-xs text-slate-500">
              <span>Signed in as {session.user.email}</span>
              <span className="inline-flex items-center gap-1.5"><ArrowDownToLine aria-hidden="true" size={13} /> ReachInbox scheduler</span>
            </footer>
          </main>
        </div>
      </div>

      {composeOpen && (
        <ComposeCampaignDialog
          onClose={() => setComposeOpen(false)}
          onCreated={() => handleCreated('Campaign scheduled successfully')}
          senders={senders}
        />
      )}
    </div>
  )
}
