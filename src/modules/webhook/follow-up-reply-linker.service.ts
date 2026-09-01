import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm'

import {
  FollowUpAction,
  FollowUpActionChannel,
  FollowUpActionStatus,
  FollowUpActionType
} from '../followup/entities/followup-action.entity'
import { FollowUp, FollowUpStatus } from '../followup/entities/followup.entity'
import { Message, MessageChannel } from '../leads/entities/message.entity'

const followUpChannelByMessageChannel: Record<
  MessageChannel,
  FollowUpActionChannel
> = {
  [MessageChannel.WHATSAPP]: FollowUpActionChannel.WHATSAPP,
  [MessageChannel.MESSENGER]: FollowUpActionChannel.MESSENGER,
  [MessageChannel.INSTAGRAM]: FollowUpActionChannel.INSTAGRAM
}

@Injectable()
export class FollowUpReplyLinkerService {
  constructor(
    @InjectRepository(FollowUpAction)
    private readonly followUpActionRepository: Repository<FollowUpAction>,
    @InjectRepository(FollowUp)
    private readonly followUpRepository: Repository<FollowUp>
  ) {}

  private readonly logger = new Logger(FollowUpReplyLinkerService.name)

  async linkReply(message: Message): Promise<number> {
    const repliedAt = message.externalTimestamp ?? message.createdAt

    try {
      const awaitingActions = await this.followUpActionRepository.find({
        where: {
          type: FollowUpActionType.SEND_MESSAGE,
          channel: followUpChannelByMessageChannel[message.channel],
          status: FollowUpActionStatus.AWAITING_REPLY,
          replyMessageId: IsNull(),
          executedAt: LessThanOrEqual(repliedAt),
          followUp: {
            negotiation: {
              leadId: message.leadId
            }
          }
        },
        select: { id: true, followUpId: true }
      })

      if (!awaitingActions.length) return 0

      await this.followUpActionRepository.update(
        { id: In(awaitingActions.map((action) => action.id)) },
        {
          status: FollowUpActionStatus.EXECUTED,
          replyMessageId: message.id,
          replyContent: message.content ?? null,
          replyType: message.type,
          repliedAt
        }
      )

      const followUpIds = [
        ...new Set(awaitingActions.map((action) => action.followUpId))
      ]

      for (const followUpId of followUpIds) {
        const unfinishedActions = await this.followUpActionRepository.count({
          where: {
            followUpId,
            status: Not(
              In([FollowUpActionStatus.EXECUTED, FollowUpActionStatus.SKIPPED])
            )
          }
        })

        if (unfinishedActions === 0) {
          await this.followUpRepository.update(followUpId, {
            status: FollowUpStatus.DONE,
            completedAt: repliedAt
          })
        }
      }

      return awaitingActions.length
    } catch (error) {
      this.logger.warn(
        `Failed to link inbound message ${message.id} to follow-ups: ${error instanceof Error ? error.message : 'unknown error'}`
      )
      return 0
    }
  }
}
