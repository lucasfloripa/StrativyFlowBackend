import { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'

import { InboundEventKind, InboundSkipReason } from './inbound-event.types'
import { normalizeMessengerWebhook } from './messenger-inbound.normalizer'

import type { MessengerMessagingEvent } from './meta-webhook-payload.types'

const inbound = (mid: string, psid = 'psid-1'): MessengerMessagingEvent => ({
  sender: { id: psid },
  recipient: { id: 'page-1' },
  timestamp: 1787078449000,
  message: { mid, text: 'Olá' }
})

describe('normalizeMessengerWebhook', () => {
  it('returns no events for an empty or missing payload', () => {
    expect(normalizeMessengerWebhook(undefined)).toEqual({
      events: [],
      skipped: []
    })
    expect(normalizeMessengerWebhook({ entry: [{ id: 'page-1' }] })).toEqual({
      events: [],
      skipped: []
    })
  })

  it('normalizes an inbound message', () => {
    const event = inbound('m_1')

    expect(
      normalizeMessengerWebhook({
        entry: [{ id: 'page-1', messaging: [event] }]
      })
    ).toEqual({
      events: [
        {
          channel: LeadChannel.MESSENGER,
          kind: InboundEventKind.MESSAGE,
          dedupeKey: 'm_1',
          externalAccountId: 'page-1',
          externalUserId: 'psid-1',
          conversationKey: 'messenger:page-1:psid-1',
          occurredAt: new Date('2026-08-18T18:40:49.000Z'),
          payload: { entryId: 'page-1', event }
        }
      ],
      skipped: []
    })
  })

  it('keeps every message of every entry', () => {
    const { events } = normalizeMessengerWebhook({
      entry: [
        { id: 'page-1', messaging: [inbound('m_1'), inbound('m_2', 'psid-2')] },
        { id: 'page-2', messaging: [inbound('m_3')] }
      ]
    })

    expect(events.map((event) => event.conversationKey)).toEqual([
      'messenger:page-1:psid-1',
      'messenger:page-1:psid-2',
      'messenger:page-2:psid-1'
    ])
  })

  it('falls back to the recipient when the entry has no Page ID', () => {
    const { events } = normalizeMessengerWebhook({
      entry: [{ messaging: [inbound('m_1')] }]
    })

    expect(events[0]).toMatchObject({
      externalAccountId: 'page-1',
      payload: { entryId: null }
    })
  })

  it.each([
    [
      'a Page echo',
      { ...inbound('m_1'), message: { mid: 'm_1', is_echo: true } },
      InboundSkipReason.ECHO
    ],
    [
      'a message without an ID',
      { ...inbound('m_1'), message: { text: 'Olá' } },
      InboundSkipReason.MISSING_MESSAGE_ID
    ],
    [
      'an event without a message (read, delivery, postback)',
      { sender: { id: 'psid-1' }, timestamp: 1787078449000 },
      InboundSkipReason.UNSUPPORTED_EVENT
    ]
  ])('skips %s and says why', (_label, event, reason) => {
    expect(
      normalizeMessengerWebhook({
        entry: [{ id: 'page-1', messaging: [event] }]
      })
    ).toEqual({
      events: [],
      skipped: [{ channel: LeadChannel.MESSENGER, reason }]
    })
  })
})
