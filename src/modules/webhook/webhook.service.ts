import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import axios from 'axios'
import { Repository } from 'typeorm'

import { BoardColumn } from '../board/entities/board-column.entity'
import { Board } from '../board/entities/board.entity'
import { Lead, LeadState, LeadTemperature } from '../leads/entities/lead.entity'

type WhatsAppSendMessageResponse = {
  messaging_product: string
  contacts: {
    input: string
    wa_id: string
  }[]
  messages: {
    id: string
  }[]
}

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: {
          display_phone_number?: string
          phone_number_id?: string
        }
        statuses?: unknown[]
        messages?: Array<{
          type?: string
          from?: string
          text?: {
            body?: string
          }
          id?: string
          referral?: {
            source_type?: string
            source_id?: string
            source_url?: string
            welcome_message?: {
              text?: string
            }
          }
        }>
        contacts?: Array<{
          profile?: {
            name?: string
          }
        }>
      }
    }>
  }>
}

@Injectable()
export class WebhookService {
  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Board) private readonly boardRepo: Repository<Board>,
    @InjectRepository(BoardColumn)
    private readonly boardColumnRepo: Repository<BoardColumn>
  ) {}

  private readonly logger = new Logger(WebhookService.name)

  async handleIncomingMessage(payload: WhatsAppWebhookPayload) {
    this.logger.debug(
      'Received WhatsApp webhook payload:',
      JSON.stringify(payload)
    )

    const value = payload?.entry?.[0]?.changes?.[0]?.value
    if (!value) return { status: 'ignored' }

    const message = value?.messages?.[0]
    if (!message) {
      return { status: 'ignored_no_message' }
    }

    if (message?.type !== 'text') {
      return { status: 'ignored_non_text' }
    }

    const displayPhoneNumber = value?.metadata?.display_phone_number
    const phoneNumberId = value?.metadata?.phone_number_id
    const from = message?.from
    const text = message?.text?.body?.trim()
    const inboundMessageId = message?.id

    const isFromAd = message?.referral?.source_type === 'ad'
    const leadSource = isFromAd ? 'MetaAds' : 'whatsapp'
    const welcomeMessage = message?.referral?.welcome_message?.text

    if (!from || !text) {
      return { status: 'ignored_missing_data' }
    }

    if (!displayPhoneNumber) {
      this.logger.warn('Missing display_phone_number')
      return { status: 'ignored_missing_board_phone' }
    }

    const board = await this.boardRepo.findOne({
      where: {
        boardPhone: displayPhoneNumber,
        isActive: true,
        isArchived: false
      }
    })

    if (!board) {
      return { status: 'board_not_found' }
    }

    const firstColumn = await this.boardColumnRepo.findOne({
      where: { boardId: board.id },
      order: { isDefault: 'DESC', position: 'ASC' }
    })

    if (!firstColumn) {
      return { status: 'board_without_columns' }
    }

    let lead = await this.leadRepo.findOne({
      where: {
        boardId: board.id,
        phone: from,
        state: LeadState.ACTIVE
      }
    })

    // idempotência
    if (lead?.lastInboundMessageId === inboundMessageId) {
      return { status: 'ignored_duplicate_message' }
    }

    /**
     * 🔴 REGRA PRINCIPAL
     * Só permite criar lead se vier de anúncio
     */
    // if (!lead && !isFromAd) {
    //   this.logger.log('Ignoring first contact not from ad')
    //   return { status: 'ignored_non_ad_first_contact' }
    // }

    // PRIMEIRO CONTATO (via anúncio)
    if (!lead) {
      const reply = 'Olá! 👋 \nComo podemos te chamar?'

      const response = await this.sendWhatsAppMessage(
        from,
        reply,
        phoneNumberId
      )

      const leadsCountInColumn = await this.leadRepo.count({
        where: {
          boardId: board.id,
          columnId: firstColumn.id,
          state: LeadState.ACTIVE
        }
      })

      const leadDraft = this.leadRepo.create({
        boardId: board.id,
        columnId: firstColumn.id,
        position: leadsCountInColumn,
        name: 'Lead sem nome',
        phone: from,
        source: leadSource,
        companyName: welcomeMessage,
        temperature: LeadTemperature.WARM,
        state: LeadState.ACTIVE,
        lastInboundMessageId: inboundMessageId ?? undefined,
        lastAutoReplyMessageId: response?.data?.messages?.[0]?.id ?? undefined,
        movedAt: new Date(),
        lastActivityAt: new Date()
      })

      lead = await this.leadRepo.save(leadDraft)

      return { status: 'created_and_replied', leadId: lead.id }
    }

    // CONTINUAÇÃO DA CONVERSA (já virou lead)
    let reply = 'Recebi sua mensagem 😊'

    if (lead.name === 'Lead sem nome') {
      lead.name = text
      reply = 'Como podemos te ajudar ?'
    } else if (!lead.initialContext?.trim()) {
      lead.initialContext = text
      reply =
        'Perfeito! Seu atendimento foi iniciado. Em breve alguém falará com você 😊'
    }

    const response = await this.sendWhatsAppMessage(from, reply, phoneNumberId)

    lead.lastInboundMessageId = inboundMessageId ?? undefined
    lead.lastAutoReplyMessageId = response?.data?.messages?.[0]?.id ?? undefined
    lead.movedAt = new Date()

    await this.leadRepo.save(lead)

    return { status: 'updated_and_replied', leadId: lead.id }
  }

  private async sendWhatsAppMessage(
    to: string,
    reply: string,
    phoneNumberId?: string
  ): Promise<{ data: WhatsAppSendMessageResponse }> {
    return axios.post(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )
  }
}
