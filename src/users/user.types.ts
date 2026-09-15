import { EmailDeliverySummary, EmailType } from '../mail/mail.types'

export type ManagedUser = {
  username: string
  enabled: boolean
  status?: string
  name?: string
  sub?: string
  email?: string
  emailVerified: boolean
  groups: string[]
  createdAt?: string
  updatedAt?: string
  welcomeEmailTracking?: EmailDeliverySummary
}

export interface CustomerProfile {
  username: string
  email?: string
  name?: string
  sub?: string
}

export interface UserProfile {
  userId: string
  username: string
  email?: string
  name?: string
  avatarKey?: string
  avatarReadUrl?: string
  avatarReadUrlExpiresInSeconds?: number
  createdAt: string
  updatedAt: string
}

export interface ResendUserEmailResult {
  userId: string
  emailType: EmailType
  recipientEmails: string[]
  resentCount: number
  status: string
  reason?: string
}
