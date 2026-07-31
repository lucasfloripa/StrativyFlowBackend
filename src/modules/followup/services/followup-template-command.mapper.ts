import { Injectable } from '@nestjs/common'

import { FollowUp } from '../entities/followup.entity'

import { SendWhatsAppTemplateCommand } from './send-whatsapp-template.command'

@Injectable()
export class FollowUpTemplateCommandMapper {
  toSendWhatsAppTemplateCommand(
    followUp: FollowUp,
    credentials: { phoneNumberId: string; accessToken: string }
  ): SendWhatsAppTemplateCommand {
    return {
      followUpId: followUp.id,
      negotiationId: followUp.negotiationId,
      leadId: followUp.negotiation?.leadId ?? '',
      templateId: followUp.templateId ?? '',
      phone: followUp.negotiation?.lead?.phone ?? '',
      phoneNumberId: credentials.phoneNumberId,
      accessToken: credentials.accessToken,
      metaTemplateName: followUp.template?.metaTemplateName ?? '',
      language: followUp.template?.language ?? 'pt_BR',
      templateVariableDefinitions: followUp.template?.variables ?? [],
      variables: followUp.templateVariables ?? {}
    }
  }
}
