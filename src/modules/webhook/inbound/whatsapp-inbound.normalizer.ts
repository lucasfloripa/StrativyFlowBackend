import { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'

import {
  buildConversationKey,
  parseUnixSeconds,
  trimToNull
} from './inbound-event.helpers'
import {
  InboundEventKind,
  InboundSkipReason,
  type NormalizedWebhook,
  type WhatsAppInboundEvent,
  type WhatsAppMessageInboundEvent,
  type WhatsAppStatusInboundEvent
} from './inbound-event.types'

import type {
  WhatsAppContact,
  WhatsAppWebhookPayload
} from './meta-webhook-payload.types'

/**
 * Splits a WhatsApp Cloud API POST into one event per message, reaction and
 * status, across every entry and change. Pure parsing: no I/O.
 */
export function normalizeWhatsAppWebhook(
  payload: WhatsAppWebhookPayload | null | undefined
): NormalizedWebhook<WhatsAppInboundEvent> {
  const result: NormalizedWebhook<WhatsAppInboundEvent> = {
    events: [],
    skipped: []
  }

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value
      if (!value) {
        continue
      }

      const metadata = value.metadata
      const externalAccountId = trimToNull(metadata?.phone_number_id)

      for (const status of value.statuses ?? []) {
        const statusMessageId = trimToNull(status?.id)
        if (!statusMessageId) {
          result.skipped.push({
            channel: LeadChannel.WHATSAPP,
            reason: InboundSkipReason.MISSING_STATUS_ID
          })
          continue
        }

        const externalUserId = trimToNull(status.recipient_id)
        result.events.push({
          channel: LeadChannel.WHATSAPP,
          kind: InboundEventKind.STATUS,
          dedupeKey: `${statusMessageId}:${trimToNull(status.status) ?? 'unknown'}`,
          externalAccountId,
          externalUserId,
          conversationKey: buildConversationKey(
            LeadChannel.WHATSAPP,
            externalAccountId,
            externalUserId
          ),
          occurredAt: parseUnixSeconds(status.timestamp),
          payload: { status, metadata }
        })
      }

      for (const message of value.messages ?? []) {
        const messageId = trimToNull(message?.id)
        if (!messageId) {
          result.skipped.push({
            channel: LeadChannel.WHATSAPP,
            reason: InboundSkipReason.MISSING_MESSAGE_ID
          })
          continue
        }

        const externalUserId = trimToNull(message.from)
        result.events.push({
          channel: LeadChannel.WHATSAPP,
          kind:
            message.type === 'reaction'
              ? InboundEventKind.REACTION
              : InboundEventKind.MESSAGE,
          dedupeKey: messageId,
          externalAccountId,
          externalUserId,
          conversationKey: buildConversationKey(
            LeadChannel.WHATSAPP,
            externalAccountId,
            externalUserId
          ),
          occurredAt: parseUnixSeconds(message.timestamp),
          payload: {
            message,
            metadata,
            contacts: selectSenderContacts(value.contacts, externalUserId)
          }
        })
      }
    }
  }

  return result
}

/**
 * A batched POST carries one `contacts` list for every message in it. Keep the
 * sender's own profile when Meta identifies it by `wa_id`.
 */
function selectSenderContacts(
  contacts: WhatsAppContact[] | undefined,
  from: string | null
): WhatsAppContact[] | undefined {
  if (!contacts?.length || !from) {
    return contacts
  }

  const senderContacts = contacts.filter(
    (contact) => trimToNull(contact?.wa_id) === from
  )

  return senderContacts.length ? senderContacts : contacts
}

export const isWhatsAppStatusEvent = (
  event: WhatsAppInboundEvent
): event is WhatsAppStatusInboundEvent => event.kind === InboundEventKind.STATUS

export const isWhatsAppMessageEvent = (
  event: WhatsAppInboundEvent
): event is WhatsAppMessageInboundEvent =>
  event.kind !== InboundEventKind.STATUS
