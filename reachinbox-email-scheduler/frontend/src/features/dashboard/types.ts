export interface Sender {
  id: string
  name: string
  email: string
  provider: string
  enabled: boolean
  hourlyLimit: number | null
  minDelayMs: number | null
}

export interface Campaign {
  id: string
  subject: string
  scheduledStartAt: string
  status: string
  sender: { id: string; name: string; email: string }
  _count: { deliveries: number }
}

export interface Delivery {
  id: string
  recipientEmail: string
  status: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'UNKNOWN'
  scheduledAt: string
  sentAt: string | null
  attemptCount: number
  campaign: {
    id: string
    subject: string
    sender: { name: string; email: string }
  }
}

export interface CampaignResult {
  campaigns: Campaign[]
  total: number
  page: number
  pageSize: number
}

export interface SenderResult {
  senders: Sender[]
}

export interface DeliveryResult {
  deliveries: Delivery[]
  total: number
  page: number
  pageSize: number
}
