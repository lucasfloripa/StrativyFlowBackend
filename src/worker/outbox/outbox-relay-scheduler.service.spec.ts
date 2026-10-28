import { Logger } from '@nestjs/common'

import { OUTBOX_RELAY_BATCH_SIZE } from '../../modules/outbox/services/outbox-relay.service'

import { OutboxRelayScheduler } from './outbox-relay-scheduler.service'

describe('OutboxRelayScheduler', () => {
  afterEach(() => jest.restoreAllMocks())

  const createScheduler = () => {
    const outboxRelayService = {
      relayPending: jest.fn().mockResolvedValue({ published: 0, failed: 0 })
    }
    const scheduler = new OutboxRelayScheduler(outboxRelayService as never)

    return { scheduler, outboxRelayService }
  }

  describe('relay', () => {
    it('relays one batch when the outbox has less than a batch due', async () => {
      const { scheduler, outboxRelayService } = createScheduler()

      await scheduler.relay()

      expect(outboxRelayService.relayPending).toHaveBeenCalledTimes(1)
      expect(outboxRelayService.relayPending).toHaveBeenCalledWith({
        limit: OUTBOX_RELAY_BATCH_SIZE
      })
    })

    it('keeps relaying while full batches are published', async () => {
      const { scheduler, outboxRelayService } = createScheduler()
      outboxRelayService.relayPending
        .mockResolvedValueOnce({
          published: OUTBOX_RELAY_BATCH_SIZE,
          failed: 0
        })
        .mockResolvedValueOnce({ published: 3, failed: 0 })

      await scheduler.relay()

      expect(outboxRelayService.relayPending).toHaveBeenCalledTimes(2)
    })

    it('stops after a batch with failures until the next tick', async () => {
      const { scheduler, outboxRelayService } = createScheduler()
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
      outboxRelayService.relayPending.mockResolvedValueOnce({
        published: OUTBOX_RELAY_BATCH_SIZE - 1,
        failed: 1
      })

      await scheduler.relay()

      expect(outboxRelayService.relayPending).toHaveBeenCalledTimes(1)
    })

    it('does not overlap with a tick still running', async () => {
      const { scheduler, outboxRelayService } = createScheduler()
      let release!: () => void
      outboxRelayService.relayPending.mockReturnValueOnce(
        new Promise((resolve) => {
          release = () => resolve({ published: 0, failed: 0 })
        })
      )

      const first = scheduler.relay()
      await scheduler.relay()
      release()
      await first

      expect(outboxRelayService.relayPending).toHaveBeenCalledTimes(1)
    })

    it('logs and survives a relay error', async () => {
      const { scheduler, outboxRelayService } = createScheduler()
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
      outboxRelayService.relayPending.mockRejectedValueOnce(
        new Error('database unavailable')
      )

      await expect(scheduler.relay()).resolves.toBeUndefined()
      await scheduler.relay()

      expect(outboxRelayService.relayPending).toHaveBeenCalledTimes(2)
    })
  })
})
