import { Logger } from '@nestjs/common'

import { FollowUpStepChannel } from '../../modules/followup/entities/followup-step.entity'
import { FollowUp } from '../../modules/followup/entities/followup.entity'
import { Lead, LeadFlowState } from '../../modules/leads/entities/lead.entity'
import {
  Message,
  MessageDirection
} from '../../modules/leads/entities/message.entity'
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
      findOne: jest.fn().mockResolvedValue({
        notificationPreferences: { NEW_LEAD: ['WHATSAPP'] },
        notificationWhatsAppNumbers: ['+5511999999999']
      } as UserInformations)
    }

    const worker = new NotificationWorker(
      { subscribe } as never,
      notificationService as never,
      mailService as never,
      evolutionService as never,
      userInformationsRepo as never,
      {} as never,
      {} as never,
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
        userId: 'user-1',
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
      findOne: jest.fn().mockResolvedValue({
        notificationPreferences: {
          MESSAGE_RECEIVED: ['APP', 'WHATSAPP']
        },
        notificationWhatsAppNumbers: ['+5511999999999']
      } as UserInformations)
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
        userId: 'user-1',
        messageId: 'message-1',
        leadId: 'lead-1',
        leadName: 'João Silva Gonçalves'
      }
    }

    expect(subscribe).toHaveBeenCalledTimes(3)
    expect(subscription?.queue).toBe(MESSAGE_RECEIVED_QUEUE)

    await subscription?.handler(message)

    expect(loggerSpy).toHaveBeenCalledWith(
      `Received job: message.received message=${JSON.stringify(message)}`
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
      findOne: jest.fn().mockResolvedValue({
        notificationPreferences: {
          FOLLOWUP_ONE_HOUR: ['APP', 'WHATSAPP', 'EMAIL']
        },
        notificationWhatsAppNumbers: ['+5511999999999', '+5511999999999'],
        notificationEmails: ['USER@EXAMPLE.COM']
      } as UserInformations)
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
        userId: 'user-1',
        leadName: 'Cliente',
        userInformationsId: 'user-information-1'
      }
    })

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
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
    const userInformationsRepo = { findOne: jest.fn() }
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
        userId: 'user-1',
        leadName: 'Cliente',
        userInformationsId: 'user-information-1'
      }
    })

    expect(userInformationsRepo.findOne).not.toHaveBeenCalled()
    expect(notificationService.createNotification).not.toHaveBeenCalled()
    expect(evolutionService.sendText).not.toHaveBeenCalled()
    expect(mailService.send).not.toHaveBeenCalled()
    expect(followUpRepo.save).not.toHaveBeenCalled()
  })
})
