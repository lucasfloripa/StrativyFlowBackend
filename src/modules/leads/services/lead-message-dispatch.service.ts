import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { RealtimeService } from '../../realtime/realtime.service'

import { Message, MessageDirection, MessageType } from '../entities/message.entity'
import { LeadsService } from '../leads.service'

@Injectable()
export class LeadMessageDispatchService {
  private readonly logger = new Logger(LeadMessageDispatchService.name)

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly leadsService: LeadsService,
    private readonly realtimeService: RealtimeService
  ) {}

  async persistAndEmitOutboundMessage(params: {
    leadId: string
    content: string | null
    type: MessageType
    mediaUrl?: string | null
    metaMediaId?: string | null
    mimeType?: string | null
    mediaSize?: number | null
    fileName?: string | null
    whatsappMessageId?: string | null
    metadata?: Record<string, unknown>
  }) {
    const savedMessage = await this.messageRepo.save(
      this.messageRepo.create({
        leadId: params.leadId,
        direction: MessageDirection.OUTBOUND,
        content: params.content,
        type: params.type,
        mediaUrl: params.mediaUrl ?? null,
        metaMediaId: params.metaMediaId ?? null,
        mimeType: params.mimeType ?? null,
        mediaSize: params.mediaSize ?? null,
        fileName: params.fileName ?? null,
        whatsappMessageId: params.whatsappMessageId ?? null,
        metadata: params.metadata ?? null
      })
    )

    const responseMessage = await this.leadsService.toResponseMessageDto(savedMessage)

    try {
      this.realtimeService.emitToLead(
        params.leadId,
        'message.created',
        responseMessage
      )

      this.logger.log(
        `Realtime event emitted. event=message.created leadId=${params.leadId} messageId=${savedMessage.id}`
      )
    } catch (error) {
      this.logger.warn(
        `Failed to emit realtime event message.created. leadId=${params.leadId} messageId=${savedMessage.id} error=${error instanceof Error ? error.message : 'unknown error'}`
      )
    }

    return {
      success: true,
      message: responseMessage
    }
  }
}
