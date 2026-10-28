export type WhatsAppMessageStatus = {
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
}

export type WhatsAppAudioMessage = {
  id?: string
  mime_type?: string
  sha256?: string
  voice?: boolean
}

export type WhatsAppImageMessage = {
  id?: string
  mime_type?: string
  sha256?: string
  caption?: string
}

export type WhatsAppVideoMessage = {
  id?: string
  mime_type?: string
  sha256?: string
  caption?: string
}

export type WhatsAppDocumentMessage = {
  id?: string
  filename?: string
  mime_type?: string
  sha256?: string
  caption?: string
}

export type WhatsAppInboundMessage = {
  type?: string
  from?: string
  timestamp?: string
  text?: {
    body?: string
  }
  audio?: WhatsAppAudioMessage
  image?: WhatsAppImageMessage
  video?: WhatsAppVideoMessage
  document?: WhatsAppDocumentMessage
  contacts?: Array<{
    name?: {
      formatted_name?: string
      first_name?: string
      last_name?: string
    }
    phones?: Array<{
      phone?: string
      wa_id?: string
      type?: string
    }>
    vcard?: string
  }>
  button?: {
    text?: string
    payload?: string
  }
  reaction?: {
    message_id?: string
    emoji?: string | null
  }
  id?: string
  referral?: {
    source_type?: string
    source_id?: string
    source_url?: string
    welcome_message?: {
      text?: string
    }
  }
}

export type WhatsAppMetadata = {
  display_phone_number?: string
  phone_number_id?: string
}

export type WhatsAppContact = {
  profile?: {
    name?: string
  }
  wa_id?: string
}

export type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: WhatsAppMetadata
        statuses?: WhatsAppMessageStatus[]
        messages?: WhatsAppInboundMessage[]
        contacts?: WhatsAppContact[]
      }
    }>
  }>
}

export type MetaMessagingAttachment = {
  type?: string
  payload?: {
    url?: string
  }
}

export type MessengerMessagingEvent = {
  sender?: {
    id?: string
  }
  recipient?: {
    id?: string
  }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    attachments?: MetaMessagingAttachment[]
  }
}

export type MessengerWebhookPayload = {
  entry?: Array<{
    id?: string
    messaging?: MessengerMessagingEvent[]
  }>
}

export type InstagramMessagingEvent = MessengerMessagingEvent & {
  reaction?: {
    mid?: string
    action?: string
    reaction?: string
    emoji?: string | null
  }
}

export type InstagramDirectWebhookPayload = {
  object?: string
  entry?: Array<{
    id?: string
    messaging?: InstagramMessagingEvent[]
  }>
}
