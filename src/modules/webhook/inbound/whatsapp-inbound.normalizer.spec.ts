import { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'

import { InboundEventKind, InboundSkipReason } from './inbound-event.types'
import {
  isWhatsAppMessageEvent,
  isWhatsAppStatusEvent,
  normalizeWhatsAppWebhook
} from './whatsapp-inbound.normalizer'

import type { WhatsAppWebhookPayload } from './meta-webhook-payload.types'

const METADATA = {
  display_phone_number: '5548999999999',
  phone_number_id: 'phone-number-1'
}

const textMessage = (id: string, from = '5548984296447') => ({
  id,
  from,
  timestamp: '1787078449',
  type: 'text',
  text: { body: 'Olá' }
})

describe('normalizeWhatsAppWebhook', () => {
  it('returns no events for an empty or missing payload', () => {
    expect(normalizeWhatsAppWebhook(undefined)).toEqual({
      events: [],
      skipped: []
    })
    expect(normalizeWhatsAppWebhook({})).toEqual({ events: [], skipped: [] })
    expect(normalizeWhatsAppWebhook({ entry: [{ changes: [{}] }] })).toEqual({
      events: [],
      skipped: []
    })
  })

  it('normalizes a single text message', () => {
    const message = textMessage('wamid.1')
    const contacts = [{ profile: { name: 'Lucas' }, wa_id: '5548984296447' }]

    const { events, skipped } = normalizeWhatsAppWebhook({
      entry: [
        {
          changes: [
            { value: { metadata: METADATA, contacts, messages: [message] } }
          ]
        }
      ]
    })

    expect(skipped).toEqual([])
    expect(events).toEqual([
      {
        channel: LeadChannel.WHATSAPP,
        kind: InboundEventKind.MESSAGE,
        dedupeKey: 'wamid.1',
        externalAccountId: 'phone-number-1',
        externalUserId: '5548984296447',
        conversationKey: 'whatsapp:phone-number-1:5548984296447',
        occurredAt: new Date('2026-08-18T18:40:49.000Z'),
        payload: { message, metadata: METADATA, contacts }
      }
    ])
  })

  // Regression P1: only entry[0].changes[0].messages[0] used to be processed.
  it('keeps every message of every change and entry in a batched POST', () => {
    const payload: WhatsAppWebhookPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: METADATA,
                messages: [textMessage('wamid.1'), textMessage('wamid.2')]
              }
            },
            {
              value: {
                metadata: METADATA,
                messages: [textMessage('wamid.3', '5511911112222')]
              }
            }
          ]
        },
        {
          changes: [
            {
              value: { metadata: METADATA, messages: [textMessage('wamid.4')] }
            }
          ]
        }
      ]
    }

    const { events } = normalizeWhatsAppWebhook(payload)

    expect(events.map((event) => event.dedupeKey)).toEqual([
      'wamid.1',
      'wamid.2',
      'wamid.3',
      'wamid.4'
    ])
    expect(events[2].conversationKey).toBe(
      'whatsapp:phone-number-1:5511911112222'
    )
  })

  it('keeps statuses and messages that arrive in the same POST', () => {
    const { events } = normalizeWhatsAppWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: METADATA,
                statuses: [
                  {
                    id: 'wamid.out-1',
                    status: 'delivered',
                    timestamp: '1787078450',
                    recipient_id: '5548984296447'
                  }
                ],
                messages: [textMessage('wamid.1')]
              }
            }
          ]
        }
      ]
    })

    expect(events.map((event) => [event.kind, event.dedupeKey])).toEqual([
      [InboundEventKind.STATUS, 'wamid.out-1:delivered'],
      [InboundEventKind.MESSAGE, 'wamid.1']
    ])
    expect(events.filter(isWhatsAppStatusEvent)).toHaveLength(1)
    expect(events.filter(isWhatsAppMessageEvent)).toHaveLength(1)
  })

  it.each([
    ['sent', 'wamid.out-1:sent'],
    ['delivered', 'wamid.out-1:delivered'],
    ['read', 'wamid.out-1:read'],
    [undefined, 'wamid.out-1:unknown']
  ])(
    'builds one dedupe key per message and status (%s)',
    (status, dedupeKey) => {
      const { events } = normalizeWhatsAppWebhook({
        entry: [
          {
            changes: [
              { value: { statuses: [{ id: ' wamid.out-1 ', status }] } }
            ]
          }
        ]
      })

      expect(events[0].dedupeKey).toBe(dedupeKey)
      expect(events[0].externalAccountId).toBeNull()
      expect(events[0].conversationKey).toBeNull()
    }
  )

  it('marks reactions with their own kind and Meta message ID', () => {
    const reaction = {
      id: 'wamid.reaction-1',
      from: '5548984296447',
      type: 'reaction',
      reaction: { message_id: 'wamid.target', emoji: '👍' }
    }

    const { events } = normalizeWhatsAppWebhook({
      entry: [
        { changes: [{ value: { metadata: METADATA, messages: [reaction] } }] }
      ]
    })

    expect(events[0]).toMatchObject({
      kind: InboundEventKind.REACTION,
      dedupeKey: 'wamid.reaction-1'
    })
  })

  it.each([
    [
      'a message without an ID',
      { messages: [{ from: '5548984296447', type: 'text' }] },
      InboundSkipReason.MISSING_MESSAGE_ID
    ],
    [
      'a status without an ID',
      { statuses: [{ status: 'read' }] },
      InboundSkipReason.MISSING_STATUS_ID
    ]
  ])('skips %s and says why', (_label, value, reason) => {
    expect(
      normalizeWhatsAppWebhook({ entry: [{ changes: [{ value }] }] })
    ).toEqual({
      events: [],
      skipped: [{ channel: LeadChannel.WHATSAPP, reason }]
    })
  })

  it('keeps the event when the sender is missing, leaving it to the processor', () => {
    const { events } = normalizeWhatsAppWebhook({
      entry: [
        {
          changes: [{ value: { messages: [{ id: 'wamid.1', type: 'text' }] } }]
        }
      ]
    })

    expect(events[0]).toMatchObject({
      dedupeKey: 'wamid.1',
      externalUserId: null,
      conversationKey: null
    })
  })

  it("passes each message only its sender's contact profile", () => {
    const lucas = { profile: { name: 'Lucas' }, wa_id: '5548984296447' }
    const ana = { profile: { name: 'Ana' }, wa_id: '5511911112222' }

    const { events } = normalizeWhatsAppWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: METADATA,
                contacts: [lucas, ana],
                messages: [
                  textMessage('wamid.1', '5548984296447'),
                  textMessage('wamid.2', '5511911112222')
                ]
              }
            }
          ]
        }
      ]
    })

    expect(
      events.filter(isWhatsAppMessageEvent).map((e) => e.payload.contacts)
    ).toEqual([[lucas], [ana]])
  })

  it('keeps every contact when none matches the sender', () => {
    const contacts = [{ profile: { name: 'Lucas' } }]

    const { events } = normalizeWhatsAppWebhook({
      entry: [
        {
          changes: [{ value: { contacts, messages: [textMessage('wamid.1')] } }]
        }
      ]
    })

    expect(events.filter(isWhatsAppMessageEvent)[0].payload.contacts).toBe(
      contacts
    )
  })

  it('ignores an invalid timestamp', () => {
    const { events } = normalizeWhatsAppWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ ...textMessage('wamid.1'), timestamp: 'abc' }]
              }
            }
          ]
        }
      ]
    })

    expect(events[0].occurredAt).toBeNull()
  })
})
