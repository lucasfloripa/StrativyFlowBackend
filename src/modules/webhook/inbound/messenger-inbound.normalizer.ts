import { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'

import {
  buildConversationKey,
  parseUnixMillis,
  trimToNull
} from './inbound-event.helpers'
import {
  InboundEventKind,
  InboundSkipReason,
  type MessengerInboundEvent,
  type NormalizedWebhook
} from './inbound-event.types'

import type { MessengerWebhookPayload } from './meta-webhook-payload.types'

/**
 * Splits a Messenger POST into one event per inbound message, across every
 * entry. Page echoes and events without a message are skipped. Pure parsing.
 */
export function normalizeMessengerWebhook(
  payload: MessengerWebhookPayload | null | undefined
): NormalizedWebhook<MessengerInboundEvent> {
  const result: NormalizedWebhook<MessengerInboundEvent> = {
    events: [],
    skipped: []
  }

  for (const entry of payload?.entry ?? []) {
    const entryId = trimToNull(entry?.id)

    for (const event of entry?.messaging ?? []) {
      if (!event?.message) {
        result.skipped.push({
          channel: LeadChannel.MESSENGER,
          reason: InboundSkipReason.UNSUPPORTED_EVENT
        })
        continue
      }

      if (event.message.is_echo) {
        result.skipped.push({
          channel: LeadChannel.MESSENGER,
          reason: InboundSkipReason.ECHO
        })
        continue
      }

      const messageId = trimToNull(event.message.mid)
      if (!messageId) {
        result.skipped.push({
          channel: LeadChannel.MESSENGER,
          reason: InboundSkipReason.MISSING_MESSAGE_ID
        })
        continue
      }

      const externalAccountId = entryId ?? trimToNull(event.recipient?.id)
      const externalUserId = trimToNull(event.sender?.id)

      result.events.push({
        channel: LeadChannel.MESSENGER,
        kind: InboundEventKind.MESSAGE,
        dedupeKey: messageId,
        externalAccountId,
        externalUserId,
        conversationKey: buildConversationKey(
          LeadChannel.MESSENGER,
          externalAccountId,
          externalUserId
        ),
        occurredAt: parseUnixMillis(event.timestamp),
        payload: { entryId, event }
      })
    }
  }

  return result
}
