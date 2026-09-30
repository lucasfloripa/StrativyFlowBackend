import { RabbitPublisherService } from './rabbit-publisher.service'

type Publish = (
  exchange: string,
  routingKey: string,
  content: Buffer,
  options?: Record<string, unknown>
) => Promise<boolean>

describe('RabbitPublisherService', () => {
  it('resolves when RabbitMQ confirms the publish', async () => {
    const publish = jest.fn().mockReturnValue(false)
    const service = new RabbitPublisherService({
      getChannel: () => ({ publish })
    } as never)

    await expect(
      service.publish('lead.created', { id: 'lead-id' })
    ).resolves.toBeUndefined()
  })

  it('rejects when RabbitMQ rejects the publish', async () => {
    const publish = jest.fn().mockRejectedValue(new Error('broker nack'))
    const service = new RabbitPublisherService({
      getChannel: () => ({ publish })
    } as never)

    await expect(
      service.publish('lead.created', { id: 'lead-id' })
    ).rejects.toThrow('broker nack')
  })

  it('preserves a provided event ID', async () => {
    const publish: jest.MockedFunction<Publish> = jest.fn()
    publish.mockResolvedValue(true)
    const service = new RabbitPublisherService({
      getChannel: () => ({ publish })
    } as never)

    await service.publish(
      'lead.created',
      { id: 'lead-id' },
      { eventId: 'event-id' }
    )

    const content = publish.mock.calls[0][2]
    expect(JSON.parse(content.toString('utf-8'))).toMatchObject({
      eventId: 'event-id',
      event: 'lead.created'
    })
  })

  it('limits publishMany to ten concurrent publishes by default', async () => {
    let activePublishes = 0
    let maximumActivePublishes = 0
    const pendingPublishes: Array<() => void> = []
    const publish = jest.fn(() => {
      activePublishes += 1
      maximumActivePublishes = Math.max(maximumActivePublishes, activePublishes)

      return new Promise<boolean>((resolve) => {
        pendingPublishes.push(() => {
          activePublishes -= 1
          resolve(true)
        })
      })
    })
    const service = new RabbitPublisherService({
      getChannel: () => ({ publish })
    } as never)
    const publishing = service.publishMany(
      Array.from({ length: 25 }, (_, index) => ({
        routingKey: 'lead.created',
        payload: { index }
      }))
    )

    while (pendingPublishes.length > 0 || publish.mock.calls.length < 25) {
      pendingPublishes.splice(0).forEach((resolve) => resolve())
      await Promise.resolve()
    }
    await publishing

    expect(maximumActivePublishes).toBe(10)
    expect(publish).toHaveBeenCalledTimes(25)
  })

  it('does not access RabbitMQ for an empty batch', async () => {
    const getChannel = jest.fn()
    const service = new RabbitPublisherService({ getChannel } as never)

    await service.publishMany([])

    expect(getChannel).not.toHaveBeenCalled()
  })

  it('rejects after all bounded workers settle when one publish fails', async () => {
    const publish = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('broker nack'))
      .mockResolvedValue(true)
    const service = new RabbitPublisherService({
      getChannel: () => ({ publish })
    } as never)

    await expect(
      service.publishMany(
        [
          { routingKey: 'lead.created', payload: { id: 'lead-1' } },
          { routingKey: 'lead.created', payload: { id: 'lead-2' } },
          { routingKey: 'lead.created', payload: { id: 'lead-3' } }
        ],
        { concurrency: 1 }
      )
    ).rejects.toThrow('1 of 3 RabbitMQ messages failed; 2 confirmed')
    expect(publish).toHaveBeenCalledTimes(3)
  })
})
