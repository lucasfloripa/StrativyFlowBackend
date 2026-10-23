import { Logger } from '@nestjs/common'

import { FollowUpStepChannel } from '../../modules/followup/entities/followup-step.entity'
import { FollowUp } from '../../modules/followup/entities/followup.entity'
import { Lead, LeadFlowState } from '../../modules/leads/entities/lead.entity'
import {
  Message,
  MessageDirection
} from '../../modules/leads/entities/message.entity'
import {
  NotificationChannel,
  NotificationType as PreferenceNotificationType
} from '../../modules/notification/enums'
import { RabbitMessage } from '../../modules/rabbit/interfaces/rabbit-message.interface'
import { RabbitSubscription } from '../../modules/rabbit/interfaces/rabbit-subscription.interface'
import { UserInformations } from '../../modules/user/entities/user-informations.entity'

import {
  FOLLOWUP_REMINDER_1H_EVENT,
  FOLLOWUP_REMINDER_1H_QUEUE,
  LEAD_CREATED_EVENT,
  MESSAGE_RECEIVED_EVENT,
  MESSAGE_RECEIVED_QUEUE,
  NOTIFICATION_QUEUE
} from './notification-job.constants'
import { NotificationWorker } from './notification-worker.service'

describe('NotificationWorker', () => {
  it('subscribes to lead.created and processes the lead notification rules', async () => {
    const subscriptions: RabbitSubscription[] = []
    const subscribe = jest.fn((options: RabbitSubscription) => {
      subscriptions.push(options)
      return Promise.resolve()
    })
    const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation()
    const notificationService = {
      createNotification: jest.fn()
    }
    const mailService = {
      send: jest.fn()
    }
    const evolutionService = {
      sendText: jest.fn().mockResolvedValue({})
    }
    const userInformationsRepo = {
      find: jest.fn().mockResolvedValue([
        {
          userId: 'user-1',
          notificationPreferences: { NEW_LEAD: ['WHATSAPP'] },
          notificationWhatsAppNumbers: ['+5511999999999']
        } as UserInformations
      ])
    }

    const worker = new NotificationWorker(
      { subscribe } as never,
      notificationService as never,
      mailService as never,
      evolutionService as never,
      userInformationsRepo as never,
      {} as never,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'lead-1', companyId: 'company-1' })
      } as never,
      {} as never
    )

    await worker.onModuleInit()

    const subscription = subscriptions.find(
      ({ routingKey }) => routingKey === LEAD_CREATED_EVENT
    )

    expect(subscription?.queue).toBe(NOTIFICATION_QUEUE)
    expect(subscription?.routingKey).toBe(LEAD_CREATED_EVENT)

    const message: RabbitMessage = {
      eventId: 'event-id',
      event: LEAD_CREATED_EVENT,
      occurredAt: '2026-09-29T00:00:00.000Z',
      data: {
        companyId: 'company-1',
        leadId: 'lead-1',
        leadName: 'Cliente Messenger',
        description: 'Cliente Messenger',
        origin: 'webhook',
        source: 'messenger'
      }
    }

    await subscription?.handler(message)

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Received job: lead.created')
    )
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Job lead.created completed')
    )
    expect(evolutionService.sendText).toHaveBeenCalledWith(
      '+5511999999999',
      'Tem novo Lead no Flow!'
    )
    expect(notificationService.createNotification).not.toHaveBeenCalled()
    expect(mailService.send).not.toHaveBeenCalled()
    loggerSpy.mockRestore()
  })

  it('subscribes to message.received and processes the notification rules', async () => {
    const subscriptions: RabbitSubscription[] = []
    const subscribe = jest.fn((options: RabbitSubscription) => {
      subscriptions.push(options)
      return Promise.resolve()
    })
    const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation()
    const notificationService = {
      createNotification: jest.fn().mockResolvedValue({})
    }
    const evolutionService = {
      sendText: jest.fn().mockResolvedValue({})
    }
    const userInformationsRepo = {
      find: jest.fn().mockResolvedValue([
        {
          userId: 'user-1',
          notificationPreferences: {
            MESSAGE_RECEIVED: ['APP', 'WHATSAPP']
          },
          notificationWhatsAppNumbers: ['+5511999999999']
        } as UserInformations
      ])
    }
    const currentMessage = {
      id: 'message-1',
      leadId: 'lead-1',
      direction: MessageDirection.INBOUND,
      createdAt: new Date('2026-09-29T00:00:00.000Z'),
      metadata: {}
    } as Message
    const messageRepo = {
      findOne: jest.fn().mockResolvedValue(currentMessage),
      save: jest.fn().mockResolvedValue(currentMessage),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null)
      })
    }
    const leadRepo = {
      findOne: jest.fn().mockResolvedValue({
        flowState: LeadFlowState.IN_CONVERSATION
      } as Lead)
    }
    const worker = new NotificationWorker(
      { subscribe } as never,
      notificationService as never,
      {} as never,
      evolutionService as never,
      userInformationsRepo as never,
      messageRepo as never,
      leadRepo as never,
      {} as never
    )

    await worker.onModuleInit()

    const subscription = subscriptions.find(
      ({ routingKey }) => routingKey === MESSAGE_RECEIVED_EVENT
    )
    const message: RabbitMessage = {
      eventId: 'message-event-id',
      event: MESSAGE_RECEIVED_EVENT,
      occurredAt: '2026-09-29T00:00:00.000Z',
      data: {
        companyId: 'company-1',
        messageId: 'message-1',
        leadId: 'lead-1',
        leadName: 'João Silva Gonçalves'
      }
    }

    expect(subscribe).toHaveBeenCalledTimes(3)
    expect(subscription?.queue).toBe(MESSAGE_RECEIVED_QUEUE)

    await subscription?.handler(message)

    expect(loggerSpy).toHaveBeenCalledWith(
      `Received job: message.received (eventId=${message.eventId})`
    )
    expect(notificationService.createNotification).toHaveBeenCalledTimes(1)
    expect(evolutionService.sendText).toHaveBeenCalledWith(
      '+5511999999999',
      'Lead João Silva Gonçalves mandou mensagem no Flow!'
    )
    expect(messageRepo.save).toHaveBeenCalledWith(currentMessage)
    loggerSpy.mockRestore()
  })

  it('processes follow-up reminder channels and marks the follow-up as sent', async () => {
    const subscriptions: RabbitSubscription[] = []
    const subscribe = jest.fn((options: RabbitSubscription) => {
      subscriptions.push(options)
      return Promise.resolve()
    })
    const notificationService = {
      createNotification: jest.fn().mockResolvedValue({})
    }
    const mailService = { send: jest.fn().mockResolvedValue(undefined) }
    const evolutionService = { sendText: jest.fn().mockResolvedValue({}) }
    const userInformationsRepo = {
      find: jest.fn().mockResolvedValue([
        {
          userId: 'user-1',
          companyId: 'company-1',
          notificationPreferences: {
            FOLLOWUP_ONE_HOUR: ['APP', 'WHATSAPP', 'EMAIL']
          },
          notificationWhatsAppNumbers: ['+5511999999999', '+5511999999999'],
          notificationEmails: ['USER@EXAMPLE.COM']
        } as UserInformations,
        {
          userId: 'user-2',
          companyId: 'company-1',
          notificationPreferences: {
            FOLLOWUP_ONE_HOUR: ['EMAIL']
          },
          notificationWhatsAppNumbers: ['+5522999999999'],
          notificationEmails: ['SECOND@EXAMPLE.COM']
        } as UserInformations
      ])
    }
    const followUp = {
      id: 'follow-up-1',
      reminder1hSentAt: null
    } as FollowUp
    const followUpRepo = {
      findOne: jest.fn().mockResolvedValue(followUp),
      save: jest.fn().mockResolvedValue(followUp)
    }
    const worker = new NotificationWorker(
      { subscribe } as never,
      notificationService as never,
      mailService as never,
      evolutionService as never,
      userInformationsRepo as never,
      {} as never,
      {} as never,
      followUpRepo as never
    )

    await worker.onModuleInit()
    const subscription = subscriptions.find(
      ({ routingKey }) => routingKey === FOLLOWUP_REMINDER_1H_EVENT
    )

    expect(subscription?.queue).toBe(FOLLOWUP_REMINDER_1H_QUEUE)

    await subscription?.handler({
      eventId: 'event-id',
      event: FOLLOWUP_REMINDER_1H_EVENT,
      occurredAt: '2026-09-29T00:00:00.000Z',
      data: {
        followUpId: 'follow-up-1',
        followUpTitle: 'Retornar proposta',
        actionChannel: FollowUpStepChannel.WHATSAPP,
        actionType: null,
        companyId: 'company-1',
        leadName: 'Cliente'
      }
    })

    expect(userInformationsRepo.find).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      order: { createdAt: 'ASC' }
    })
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'FOLLOW_UP_REMINDER_1H',
        title: 'Follow-up em 1 hora',
        description: 'Retornar proposta - WhatsApp - Cliente',
        referenceId: 'follow-up-1'
      })
    )
    expect(evolutionService.sendText).toHaveBeenCalledTimes(1)
    expect(evolutionService.sendText).toHaveBeenCalledWith(
      '+5511999999999',
      'Follow-up em 1 hora: Retornar proposta - WhatsApp - Cliente'
    )
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['user@example.com'],
        subject: 'Follow-up em 1 hora'
      })
    )
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['second@example.com'],
        subject: 'Follow-up em 1 hora'
      })
    )
    expect(evolutionService.sendText).not.toHaveBeenCalledWith(
      '+5522999999999',
      expect.any(String)
    )
    expect(followUp.reminder1hSentAt).toBeInstanceOf(Date)
    expect(followUpRepo.save).toHaveBeenCalledWith(followUp)
  })

  it('skips an already processed follow-up reminder event', async () => {
    const subscriptions: RabbitSubscription[] = []
    const subscribe = jest.fn((options: RabbitSubscription) => {
      subscriptions.push(options)
      return Promise.resolve()
    })
    const notificationService = { createNotification: jest.fn() }
    const mailService = { send: jest.fn() }
    const evolutionService = { sendText: jest.fn() }
    const userInformationsRepo = { find: jest.fn() }
    const followUpRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'follow-up-1',
        reminder1hSentAt: new Date()
      } as FollowUp),
      save: jest.fn()
    }
    const worker = new NotificationWorker(
      { subscribe } as never,
      notificationService as never,
      mailService as never,
      evolutionService as never,
      userInformationsRepo as never,
      {} as never,
      {} as never,
      followUpRepo as never
    )

    await worker.onModuleInit()
    const subscription = subscriptions.find(
      ({ routingKey }) => routingKey === FOLLOWUP_REMINDER_1H_EVENT
    )

    await subscription?.handler({
      eventId: 'event-id',
      event: FOLLOWUP_REMINDER_1H_EVENT,
      occurredAt: '2026-09-29T00:00:00.000Z',
      data: {
        followUpId: 'follow-up-1',
        followUpTitle: 'Retornar proposta',
        actionChannel: null,
        actionType: null,
        companyId: 'company-1',
        leadName: 'Cliente'
      }
    })

    expect(userInformationsRepo.find).not.toHaveBeenCalled()
    expect(notificationService.createNotification).not.toHaveBeenCalled()
    expect(evolutionService.sendText).not.toHaveBeenCalled()
    expect(mailService.send).not.toHaveBeenCalled()
    expect(followUpRepo.save).not.toHaveBeenCalled()
  })

  describe('Company notification recipients', () => {
    const createWorker = async () => {
      const subscriptions: RabbitSubscription[] = []
      const subscribe = jest.fn((subscription: RabbitSubscription) => {
        subscriptions.push(subscription)
        return Promise.resolve()
      })
      const firstUser = Object.assign(new UserInformations(), {
        id: 'information-1',
        userId: 'user-1',
        companyId: 'company-1',
        notificationPreferences: {
          [PreferenceNotificationType.NEW_LEAD]: [NotificationChannel.APP],
          [PreferenceNotificationType.MESSAGE_RECEIVED]: [
            NotificationChannel.APP
          ]
        },
        notificationWhatsAppNumbers: ['+5511111111111'],
        notificationEmails: ['first@example.com']
      })
      const secondUser = Object.assign(new UserInformations(), {
        id: 'information-2',
        userId: 'user-2',
        companyId: 'company-1',
        notificationPreferences: {
          [PreferenceNotificationType.NEW_LEAD]: [
            NotificationChannel.WHATSAPP,
            NotificationChannel.EMAIL
          ],
          [PreferenceNotificationType.MESSAGE_RECEIVED]: [
            NotificationChannel.WHATSAPP
          ]
        },
        notificationWhatsAppNumbers: ['+5522222222222'],
        notificationEmails: ['SECOND@EXAMPLE.COM']
      })
      const userInformationsRepo = {
        find: jest.fn().mockResolvedValue([firstUser, secondUser]),
        findOne: jest.fn()
      }
      const leadRepo = {
        findOne: jest.fn().mockResolvedValue(
          Object.assign(new Lead(), {
            id: 'lead-1',
            companyId: 'company-1',
            flowState: LeadFlowState.IN_CONVERSATION
          })
        )
      }
      const currentMessage = Object.assign(new Message(), {
        id: 'message-1',
        leadId: 'lead-1',
        direction: MessageDirection.INBOUND,
        createdAt: new Date('2026-10-16T10:00:00.000Z'),
        metadata: {}
      })
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null)
      }
      const messageRepo = {
        findOne: jest.fn().mockResolvedValue(currentMessage),
        save: jest.fn((message: Message) => Promise.resolve(message)),
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
      }
      const notificationService = {
        createNotification: jest.fn().mockResolvedValue({})
      }
      const mailService = { send: jest.fn().mockResolvedValue(undefined) }
      const evolutionService = { sendText: jest.fn().mockResolvedValue({}) }
      const worker = new NotificationWorker(
        { subscribe } as never,
        notificationService as never,
        mailService as never,
        evolutionService as never,
        userInformationsRepo as never,
        messageRepo as never,
        leadRepo as never,
        {} as never
      )
      await worker.onModuleInit()

      const handle = async (event: string, data: Record<string, unknown>) => {
        const subscription = subscriptions.find(
          (item) => item.routingKey === event
        )
        if (!subscription) throw new Error('Missing notification subscription')
        await subscription.handler({
          eventId: 'event-1',
          event,
          occurredAt: '2026-10-16T10:00:00.000Z',
          data
        })
      }

      return {
        handle,
        firstUser,
        secondUser,
        userInformationsRepo,
        leadRepo,
        messageRepo,
        queryBuilder,
        notificationService,
        mailService,
        evolutionService
      }
    }

    const leadEvent = {
      companyId: 'company-1',
      leadId: 'lead-1',
      leadName: 'Cliente',
      origin: 'webhook'
    }
    const messageEvent = {
      companyId: 'company-1',
      leadId: 'lead-1',
      leadName: 'Cliente',
      messageId: 'message-1'
    }

    it('notifies all Company members using their own new-lead channel preferences', async () => {
      const dependencies = await createWorker()

      await dependencies.handle(LEAD_CREATED_EVENT, {
        ...leadEvent,
        userId: 'ignored-user'
      })

      expect(dependencies.leadRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'lead-1', companyId: 'company-1' }
      })
      expect(dependencies.userInformationsRepo.find).toHaveBeenCalledWith({
        where: { companyId: 'company-1' },
        order: { createdAt: 'ASC' }
      })
      expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
      expect(
        dependencies.notificationService.createNotification
      ).toHaveBeenCalledTimes(1)
      expect(
        dependencies.notificationService.createNotification
      ).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', type: 'LEAD_CREATED' })
      )
      expect(dependencies.evolutionService.sendText).toHaveBeenCalledTimes(1)
      expect(dependencies.evolutionService.sendText).toHaveBeenCalledWith(
        '+5522222222222',
        'Tem novo Lead no Flow!'
      )
      expect(dependencies.mailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['second@example.com'],
          subject: 'Novo lead criado'
        })
      )
    })

    it('logs the received message event without its payload', async () => {
      const log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined)
      const dependencies = await createWorker()

      await dependencies.handle(MESSAGE_RECEIVED_EVENT, messageEvent)

      const logged = JSON.stringify(log.mock.calls)
      expect(logged).toContain('eventId=event-1')
      expect(logged).not.toContain('leadName')
      log.mockRestore()
    })

    it('notifies Company members individually when a message arrives', async () => {
      const dependencies = await createWorker()

      await dependencies.handle(MESSAGE_RECEIVED_EVENT, messageEvent)

      expect(
        dependencies.notificationService.createNotification
      ).toHaveBeenCalledTimes(1)
      expect(
        dependencies.notificationService.createNotification
      ).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', type: 'MESSAGE_RECEIVED' })
      )
      expect(dependencies.evolutionService.sendText).toHaveBeenCalledTimes(1)
      expect(dependencies.evolutionService.sendText).toHaveBeenCalledWith(
        '+5522222222222',
        'Lead Cliente mandou mensagem no Flow!'
      )
      expect(dependencies.mailService.send).not.toHaveBeenCalled()
    })

    it('sends WhatsApp alerts to both members without the first suppressing the second', async () => {
      const dependencies = await createWorker()
      dependencies.firstUser.notificationPreferences[
        PreferenceNotificationType.MESSAGE_RECEIVED
      ] = [NotificationChannel.WHATSAPP]

      await dependencies.handle(MESSAGE_RECEIVED_EVENT, messageEvent)

      expect(dependencies.evolutionService.sendText).toHaveBeenCalledTimes(2)
      expect(dependencies.evolutionService.sendText).toHaveBeenCalledWith(
        '+5511111111111',
        'Lead Cliente mandou mensagem no Flow!'
      )
      expect(dependencies.evolutionService.sendText).toHaveBeenCalledWith(
        '+5522222222222',
        'Lead Cliente mandou mensagem no Flow!'
      )
      expect(dependencies.queryBuilder.andWhere).toHaveBeenCalledWith(
        'message."createdAt" < :currentCreatedAt',
        { currentCreatedAt: new Date('2026-10-16T10:00:00.000Z') }
      )
    })

    it('preserves the 30-minute WhatsApp cooldown without suppressing app notifications', async () => {
      const dependencies = await createWorker()
      dependencies.queryBuilder.getOne.mockResolvedValue({
        id: 'previous-message'
      })

      await dependencies.handle(MESSAGE_RECEIVED_EVENT, messageEvent)

      expect(dependencies.evolutionService.sendText).not.toHaveBeenCalled()
      expect(dependencies.messageRepo.save).not.toHaveBeenCalled()
      expect(
        dependencies.notificationService.createNotification
      ).toHaveBeenCalledTimes(1)
    })

    it.each([LEAD_CREATED_EVENT, MESSAGE_RECEIVED_EVENT])(
      'does not notify members for %s when the lead belongs to another Company',
      async (event) => {
        const dependencies = await createWorker()
        dependencies.leadRepo.findOne.mockResolvedValue(null)

        await dependencies.handle(event, { ...leadEvent, ...messageEvent })

        expect(dependencies.leadRepo.findOne).toHaveBeenCalledWith({
          where: { id: 'lead-1', companyId: 'company-1' }
        })
        expect(dependencies.userInformationsRepo.find).not.toHaveBeenCalled()
        expect(
          dependencies.notificationService.createNotification
        ).not.toHaveBeenCalled()
        expect(dependencies.evolutionService.sendText).not.toHaveBeenCalled()
        expect(dependencies.mailService.send).not.toHaveBeenCalled()
      }
    )

    it.each([LEAD_CREATED_EVENT, MESSAGE_RECEIVED_EVENT])(
      'does not fall back to a userId without companyId for %s',
      async (event) => {
        const dependencies = await createWorker()

        await dependencies.handle(event, {
          userId: 'user-1',
          leadId: 'lead-1',
          messageId: 'message-1'
        })

        expect(dependencies.userInformationsRepo.find).not.toHaveBeenCalled()
        expect(dependencies.userInformationsRepo.findOne).not.toHaveBeenCalled()
        expect(
          dependencies.notificationService.createNotification
        ).not.toHaveBeenCalled()
      }
    )

    it('skips companies without recipients', async () => {
      const dependencies = await createWorker()
      dependencies.userInformationsRepo.find.mockResolvedValue([])

      await dependencies.handle(LEAD_CREATED_EVENT, leadEvent)
      await dependencies.handle(MESSAGE_RECEIVED_EVENT, messageEvent)

      expect(
        dependencies.notificationService.createNotification
      ).not.toHaveBeenCalled()
      expect(dependencies.evolutionService.sendText).not.toHaveBeenCalled()
      expect(dependencies.mailService.send).not.toHaveBeenCalled()
    })

    it('preserves the new-lead name and origin rules for every recipient', async () => {
      const dependencies = await createWorker()

      await dependencies.handle(LEAD_CREATED_EVENT, {
        ...leadEvent,
        origin: 'app'
      })
      await dependencies.handle(LEAD_CREATED_EVENT, {
        ...leadEvent,
        leadName: 'Lead sem nome'
      })

      expect(
        dependencies.notificationService.createNotification
      ).not.toHaveBeenCalled()
      expect(dependencies.evolutionService.sendText).not.toHaveBeenCalled()
      expect(dependencies.mailService.send).not.toHaveBeenCalled()
    })

    it('does not notify about messages until the lead reaches IN_CONVERSATION', async () => {
      const dependencies = await createWorker()
      dependencies.leadRepo.findOne.mockResolvedValue({
        companyId: 'company-1',
        flowState: LeadFlowState.ASKING_NAME
      })

      await dependencies.handle(MESSAGE_RECEIVED_EVENT, messageEvent)

      expect(dependencies.userInformationsRepo.find).not.toHaveBeenCalled()
      expect(
        dependencies.notificationService.createNotification
      ).not.toHaveBeenCalled()
    })

    it('propagates delivery errors so RabbitMQ can retry', async () => {
      const dependencies = await createWorker()
      dependencies.mailService.send.mockRejectedValue(
        new Error('Email unavailable')
      )

      await expect(
        dependencies.handle(LEAD_CREATED_EVENT, leadEvent)
      ).rejects.toThrow('Email unavailable')
    })
  })
})
