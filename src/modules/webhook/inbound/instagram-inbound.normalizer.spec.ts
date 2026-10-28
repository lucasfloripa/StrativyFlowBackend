import { LeadChannel } from '../../leads/entities/lead-channel-identity.entity'

import { InboundEventKind, InboundSkipReason } from './inbound-event.types'
import { normalizeInstagramWebhook } from './instagram-inbound.normalizer'

import type { InstagramMessagingEvent } from './meta-webhook-payload.types'

const inbound = (
  mid: string,
  userId = 'ig-user-1'
): InstagramMessagingEvent => ({
  sender: { id: userId },
  recipient: { id: 'ig-account-1' },
  timestamp: 1787078449000,
  message: { mid, text: 'Olá' }
})

const reaction = (
  action: string,
  timestamp: number
): InstagramMessagingEvent => ({
  sender: { id: 'ig-user-1' },
  recipient: { id: 'ig-account-1' },
  timestamp,
  reaction: { mid: 'ig-target', action, reaction: 'love', emoji: '❤️' }
})

describe('normalizeInstagramWebhook', () => {
  it('returns no events for an empty or missing payload', () => {
    expect(normalizeInstagramWebhook(undefined)).toEqual({
      events: [],
      skipped: []
    })
    expect(normalizeInstagramWebhook({ object: 'instagram' })).toEqual({
      events: [],
      skipped: []
    })
  })

  it('normalizes an inbound message', () => {
    const event = inbound('ig-mid-1')

    expect(
      normalizeInstagramWebhook({
        object: 'instagram',
        entry: [{ id: 'ig-account-1', messaging: [event] }]
      })
    ).toEqual({
      events: [
        {
          channel: LeadChannel.INSTAGRAM,
          kind: InboundEventKind.MESSAGE,
          dedupeKey: 'ig-mid-1',
          externalAccountId: 'ig-account-1',
          externalUserId: 'ig-user-1',
          conversationKey: 'instagram:ig-account-1:ig-user-1',
          occurredAt: new Date('2026-08-18T18:40:49.000Z'),
          payload: { entryId: 'ig-account-1', event }
        }
      ],
      skipped: []
    })
  })

  it('keeps every message and reaction of every entry', () => {
    const { events } = normalizeInstagramWebhook({
      entry: [
        {
          id: 'ig-account-1',
          messaging: [inbound('ig-mid-1'), reaction('react', 1787078450000)]
        },
        { id: 'ig-account-2', messaging: [inbound('ig-mid-2', 'ig-user-2')] }
      ]
    })

    expect(events.map((event) => [event.kind, event.conversationKey])).toEqual([
      [InboundEventKind.MESSAGE, 'instagram:ig-account-1:ig-user-1'],
      [InboundEventKind.REACTION, 'instagram:ig-account-1:ig-user-1'],
      [InboundEventKind.MESSAGE, 'instagram:ig-account-2:ig-user-2']
    ])
  })

  it('gives react, unreact and react again on one message different keys', () => {
    const { events } = normalizeInstagramWebhook({
      entry: [
        {
          id: 'ig-account-1',
          messaging: [
            reaction('react', 1787078450000),
            reaction('unreact', 1787078451000),
            reaction('react', 1787078452000)
          ]
        }
      ]
    })

    expect(events.map((event) => event.dedupeKey)).toEqual([
      'ig-target:ig-user-1:react:1787078450000',
      'ig-target:ig-user-1:unreact:1787078451000',
      'ig-target:ig-user-1:react:1787078452000'
    ])
  })

  it.each([
    [
      'an echo',
      { ...inbound('ig-mid-1'), message: { mid: 'ig-mid-1', is_echo: true } },
      InboundSkipReason.ECHO
    ],
    [
      'a message without an ID',
      { ...inbound('ig-mid-1'), message: { text: 'Olá' } },
      InboundSkipReason.MISSING_MESSAGE_ID
    ],
    [
      'a reaction without the target message ID',
      { sender: { id: 'ig-user-1' }, reaction: { action: 'react' } },
      InboundSkipReason.MISSING_REACTION_ID
    ],
    [
      'an event without a message or reaction',
      { sender: { id: 'ig-user-1' }, timestamp: 1787078449000 },
      InboundSkipReason.UNSUPPORTED_EVENT
    ]
  ])('skips %s and says why', (_label, event, reason) => {
    expect(
      normalizeInstagramWebhook({
        entry: [{ id: 'ig-account-1', messaging: [event] }]
      })
    ).toEqual({
      events: [],
      skipped: [{ channel: LeadChannel.INSTAGRAM, reason }]
    })
  })
})
