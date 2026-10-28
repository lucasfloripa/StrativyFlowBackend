import { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'

import {
  buildConversationKey,
  parseUnixMillis,
  trimToNull
} from './inbound-event.helpers'
import {
  InboundEventKind,
  InboundSkipReason,
  type InstagramInboundEvent,
  type NormalizedWebhook
} from './inbound-event.types'

import type { InstagramDirectWebhookPayload } from './meta-webhook-payload.types'

/**
 * Splits an Instagram Direct POST into one event per inbound message or
 * reaction, across every entry. Echoes are skipped. Pure parsing.
 */
export function normalizeInstagramWebhook(
  payload: InstagramDirectWebhookPayload | null | undefined
): NormalizedWebhook<InstagramInboundEvent> {
  const result: NormalizedWebhook<InstagramInboundEvent> = {
    events: [],
    skipped: []
  }

  for (const entry of payload?.entry ?? []) {
    const entryId = trimToNull(entry?.id)

    for (const event of entry?.messaging ?? []) {
      if (!event) {
        continue
      }

      if (event.message?.is_echo) {
        result.skipped.push({
          channel: LeadChannel.INSTAGRAM,
          reason: InboundSkipReason.ECHO
        })
        continue
      }

      const externalAccountId = entryId
      const externalUserId = trimToNull(event.sender?.id)
      const base = {
        channel: LeadChannel.INSTAGRAM as const,
        externalAccountId,
        externalUserId,
        conversationKey: buildConversationKey(
          LeadChannel.INSTAGRAM,
          externalAccountId,
          externalUserId
        ),
        occurredAt: parseUnixMillis(event.timestamp),
        payload: { entryId, event }
      }

      if (event.reaction) {
        const reactedMessageId = trimToNull(event.reaction.mid)
        if (!reactedMessageId) {
          result.skipped.push({
            channel: LeadChannel.INSTAGRAM,
            reason: InboundSkipReason.MISSING_REACTION_ID
          })
          continue
        }

        // A reaction has no ID of its own: the same user can react, unreact
        // and react again to one message.
        result.events.push({
          ...base,
          kind: InboundEventKind.REACTION,
          dedupeKey: [
            reactedMessageId,
            externalUserId ?? 'unknown',
            trimToNull(event.reaction.action) ?? 'react',
            event.timestamp ?? 'unknown'
          ].join(':')
        })
        continue
      }

      if (!event.message) {
        result.skipped.push({
          channel: LeadChannel.INSTAGRAM,
          reason: InboundSkipReason.UNSUPPORTED_EVENT
        })
        continue
      }

      const messageId = trimToNull(event.message.mid)
      if (!messageId) {
        result.skipped.push({
          channel: LeadChannel.INSTAGRAM,
          reason: InboundSkipReason.MISSING_MESSAGE_ID
        })
        continue
      }

      result.events.push({
        ...base,
        kind: InboundEventKind.MESSAGE,
        dedupeKey: messageId
      })
    }
  }

  return result
}
