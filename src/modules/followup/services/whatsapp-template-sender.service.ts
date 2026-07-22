import { Injectable } from '@nestjs/common'

import { MetaWhatsAppClient } from './meta-whatsapp-client.service'
import {
  MetaWhatsAppSendTemplateRequestDto,
  MetaWhatsAppTemplateComponentDto,
  MetaWhatsAppTemplateParameterDto
} from './meta-whatsapp-dto'
import { SendWhatsAppTemplateCommand } from './send-whatsapp-template.command'

@Injectable()
export class WhatsAppTemplateSender {
  constructor(private readonly metaWhatsAppClient: MetaWhatsAppClient) {}

  async sendTemplate(command: SendWhatsAppTemplateCommand): Promise<void> {
    const payload = this.buildMetaSendTemplateRequest(command)

    await this.metaWhatsAppClient.sendTemplate(payload)
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
      text: String(command.variables[variableDefinition.key] ?? '')
    }))
  }
}
