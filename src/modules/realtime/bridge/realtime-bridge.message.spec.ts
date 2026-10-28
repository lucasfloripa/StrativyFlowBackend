import { parseRealtimeEmitCommand } from './realtime-bridge.message'

describe('parseRealtimeEmitCommand', () => {
  it.each([
    [
      {
        target: 'lead',
        leadId: 'lead-1',
        event: 'message.created',
        payload: 1
      },
      { target: 'lead', leadId: 'lead-1', event: 'message.created', payload: 1 }
    ],
    [
      { target: 'user', userId: 'user-1', event: 'notification', payload: {} },
      { target: 'user', userId: 'user-1', event: 'notification', payload: {} }
    ],
    [
      { target: 'broadcast', event: 'ping', payload: null, extra: true },
      { target: 'broadcast', event: 'ping', payload: null }
    ]
  ])('accepts %j', (data, expected) => {
    expect(parseRealtimeEmitCommand(data)).toEqual(expected)
  })

  it.each([
    ['null', null],
    ['a string', 'message.created'],
    ['an unknown target', { target: 'room', event: 'x' }],
    ['a missing event', { target: 'broadcast' }],
    ['a blank event', { target: 'broadcast', event: '  ' }],
    ['a lead without ID', { target: 'lead', event: 'x' }],
    ['a user with a numeric ID', { target: 'user', userId: 1, event: 'x' }]
  ])('rejects %s', (_label, data) => {
    expect(parseRealtimeEmitCommand(data)).toBeNull()
  })
})
