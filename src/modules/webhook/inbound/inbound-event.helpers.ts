import type { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'

export const trimToNull = (value?: string | null): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export const buildConversationKey = (
  channel: LeadChannel,
  externalAccountId: string | null,
  externalUserId: string | null
): string | null =>
  externalAccountId && externalUserId
    ? `${channel}:${externalAccountId}:${externalUserId}`
    : null

/** WhatsApp sends Unix seconds as a string. */
export const parseUnixSeconds = (value?: string | null): Date | null => {
  const seconds = Number(value)
  if (!value?.trim() || !Number.isFinite(seconds) || seconds <= 0) {
    return null
  }
  return new Date(seconds * 1000)
}

/** Messenger and Instagram send Unix milliseconds as a number. */
export const parseUnixMillis = (value?: number | null): Date | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? new Date(value)
    : null
