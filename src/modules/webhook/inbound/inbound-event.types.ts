import type { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'
import type {
  InstagramMessagingEvent,
  MessengerMessagingEvent,
  WhatsAppContact,
  WhatsAppInboundMessage,
  WhatsAppMessageStatus,
  WhatsAppMetadata
} from './meta-webhook-payload.types'

export enum InboundEventKind {
  MESSAGE = 'message',
  STATUS = 'status',
  REACTION = 'reaction'
}

export enum InboundSkipReason {
  ECHO = 'echo',
  MISSING_MESSAGE_ID = 'missing_message_id',
  MISSING_STATUS_ID = 'missing_status_id',
  MISSING_REACTION_ID = 'missing_reaction_id',
  UNSUPPORTED_EVENT = 'unsupported_event'
}

type InboundEventBase<
  TChannel extends LeadChannel,
  TKind extends InboundEventKind,
  TPayload
> = {
  channel: TChannel
  kind: TKind
  /** Idempotency key from Meta; unique per channel. */
  dedupeKey: string
  /** phone_number_id, Page ID or Instagram account ID. */
  externalAccountId: string | null
  /** WhatsApp number, PSID or Instagram-scoped user ID. */
  externalUserId: string | null
  /** `channel:account:user`; the lock and ordering key of a conversation. */
  conversationKey: string | null
  /** When Meta says the event happened. */
  occurredAt: Date | null
  payload: TPayload
}

export type WhatsAppMessageEventPayload = {
  message: WhatsAppInboundMessage
  metadata?: WhatsAppMetadata
  contacts?: WhatsAppContact[]
}

export type WhatsAppMessageInboundEvent = InboundEventBase<
  LeadChannel.WHATSAPP,
  InboundEventKind.MESSAGE | InboundEventKind.REACTION,
  WhatsAppMessageEventPayload
>

export type WhatsAppStatusInboundEvent = InboundEventBase<
  LeadChannel.WHATSAPP,
  InboundEventKind.STATUS,
  {
    status: WhatsAppMessageStatus
    metadata?: WhatsAppMetadata
  }
>

export type WhatsAppInboundEvent =
  | WhatsAppMessageInboundEvent
  | WhatsAppStatusInboundEvent

export type MessengerInboundEvent = InboundEventBase<
  LeadChannel.MESSENGER,
  InboundEventKind.MESSAGE,
  {
    entryId: string | null
    event: MessengerMessagingEvent
  }
>

export type InstagramInboundEvent = InboundEventBase<
  LeadChannel.INSTAGRAM,
  InboundEventKind.MESSAGE | InboundEventKind.REACTION,
  {
    entryId: string | null
    event: InstagramMessagingEvent
  }
>

export type InboundEvent =
  | WhatsAppInboundEvent
  | MessengerInboundEvent
  | InstagramInboundEvent

export type SkippedInboundItem = {
  channel: LeadChannel
  reason: InboundSkipReason
}

export type NormalizedWebhook<TEvent extends InboundEvent> = {
  events: TEvent[]
  skipped: SkippedInboundItem[]
}
