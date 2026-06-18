import { Injectable, Logger } from '@nestjs/common'

import { Lead, LeadFlowState } from '../../leads/entities/lead.entity'
import { AIRuntime } from '../ai/ai-runtime'

import {
  classifyConversation,
  ConversationType
} from './conversation-classifier'
import { getMessageCount } from './conversation-context.helpers'
import { ConversationContext } from './conversation-context.types'
import { LeadFlowActionType, LeadFlowProcessResult } from './lead-flow.types'

@Injectable()
export class LeadFlowEngine {
  constructor(private readonly aiRuntime: AIRuntime) {}

  private readonly logger = new Logger(LeadFlowEngine.name)

  async process(params: {
    lead: Lead
    messageText: string
    conversationContext: ConversationContext
  }): Promise<LeadFlowProcessResult> {
    const { lead, messageText, conversationContext } = params
    const recentMessagesCount = conversationContext.recentMessages.length
    const messageCount = getMessageCount(conversationContext)
    const conversationType = classifyConversation(conversationContext)

    this.logger.debug(
      `FlowEngine process called: leadId=${lead.id} flowState=${lead.flowState} recentMessagesCount=${recentMessagesCount}`
    )

    if (conversationType === ConversationType.NEW) {
      this.logger.debug(
        `New conversation detected: leadId=${lead.id} messageCount=${messageCount}`
      )
    } else {
      this.logger.debug(
        `Ongoing conversation detected: leadId=${lead.id} messageCount=${messageCount}`
      )
    }

    if (recentMessagesCount > 0) {
      const firstMessage = conversationContext.recentMessages[0]
      const lastMessage =
        conversationContext.recentMessages[recentMessagesCount - 1]

      this.logger.debug(
        `FlowEngine conversation window: firstMessageId=${firstMessage?.id ?? 'unknown'} lastMessageId=${lastMessage?.id ?? 'unknown'}`
      )
    }

    switch (lead.flowState) {
      case LeadFlowState.ASKING_NAME:
        return {
          actions: [
            {
              type: LeadFlowActionType.UPDATE_LEAD,
              payload: {
                name: messageText
              }
            },
            {
              type: LeadFlowActionType.TRANSITION_STATE,
              payload: {
                to: LeadFlowState.ASKING_CONTEXT
              }
            },
            {
              type: LeadFlowActionType.SEND_MESSAGE,
              payload: {
                content: 'Como podemos te ajudar ?'
              }
            }
          ]
        }
      case LeadFlowState.ASKING_CONTEXT:
        return {
          actions: [
            {
              type: LeadFlowActionType.UPDATE_LEAD,
              payload: {
                initialContext: messageText
              }
            },
            {
              type: LeadFlowActionType.TRANSITION_STATE,
              payload: {
                to: LeadFlowState.IN_CONVERSATION
              }
            },
            {
              type: LeadFlowActionType.SEND_MESSAGE,
              payload: {
                content:
                  'Perfeito! Seu atendimento foi iniciado. Em breve alguém falará com você 😊'
              }
            }
          ]
        }
      case LeadFlowState.IN_CONVERSATION: {
        const aiResult = await this.aiRuntime.generateReply({
          conversationContext,
          latestMessage: messageText
        })

        this.logger.debug(
          `FlowEngine AI reply generated: leadId=${lead.id} promptLength=${aiResult.prompt.length} replyLength=${aiResult.reply.length}`
        )

        return {
          actions: [
            {
              type: LeadFlowActionType.SEND_MESSAGE,
              payload: {
                content: aiResult.reply
              }
            }
          ]
        }
      }
      default:
        return {
          actions: [
            {
              type: LeadFlowActionType.SEND_MESSAGE,
              payload: {
                content: 'Recebi sua mensagem 😊'
              }
            }
          ]
        }
    }
  }
}
