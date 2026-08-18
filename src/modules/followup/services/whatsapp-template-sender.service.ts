import { Injectable } from '@nestjs/common'

import { MetaWhatsAppClient } from './meta-whatsapp-client.service'
import {
  MetaWhatsAppSendTemplateRequestDto,
  MetaWhatsAppSendTemplateSuccessDto,
  MetaWhatsAppTemplateComponentDto,
  MetaWhatsAppTemplateParameterDto
} from './meta-whatsapp-dto'
import { SendWhatsAppTemplateCommand } from './send-whatsapp-template.command'

@Injectable()
export class WhatsAppTemplateSender {
  constructor(private readonly metaWhatsAppClient: MetaWhatsAppClient) {}

  async sendTemplate(
    command: SendWhatsAppTemplateCommand
  ): Promise<MetaWhatsAppSendTemplateSuccessDto> {
    const payload = this.buildMetaSendTemplateRequest(command)

    return await this.metaWhatsAppClient.sendTemplate(payload, {
      phoneNumberId: command.phoneNumberId,
      accessToken: command.accessToken
    })
  }

  private buildMetaSendTemplateRequest(
    command: SendWhatsAppTemplateCommand
  ): MetaWhatsAppSendTemplateRequestDto {
    const components = this.buildTemplateComponents(command)

    return {
      messaging_product: 'whatsapp',
      to: command.phone,
      type: 'template',
      template: {
        name: command.metaTemplateName,
        language: {
          code: command.language
        },
        components
      }
    }
  }

  private buildTemplateComponents(
    command: SendWhatsAppTemplateCommand
  ): MetaWhatsAppTemplateComponentDto[] | undefined {
    const parameters = this.buildTemplateParameters(command)

    if (!parameters.length) {
      return undefined
    }

    return [
      {
        type: 'body',
        parameters
      }
    ]
  }

  private buildTemplateParameters(
    command: SendWhatsAppTemplateCommand
  ): MetaWhatsAppTemplateParameterDto[] {
    if (!command.templateVariableDefinitions.length) {
      return []
    }

    return command.templateVariableDefinitions.map((variableDefinition) => ({
      type: 'text',
      parameter_name: variableDefinition.key,
      text: this.toTemplateText(command.variables[variableDefinition.key])
    }))
  }

  private toTemplateText(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    return ''
  }
}
