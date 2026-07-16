import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'

export type SendMailInput = {
  from: string
  to: string | string[]
  subject: string
  html: string
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private readonly resend: Resend

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY')

    if (!apiKey) {
      this.logger.error('MailService initialization failed: RESEND_API_KEY is not configured')
      throw new Error('RESEND_API_KEY is not configured')
    }

    this.resend = new Resend(apiKey)
    this.logger.log('MailService initialized with RESEND_API_KEY configured')
  }

  async send(input: SendMailInput): Promise<{ id: string | null }> {
    const recipients = Array.isArray(input.to) ? input.to : [input.to]
    const recipientCount = Array.isArray(input.to) ? input.to.length : 1

    this.logger.log(
      `Sending email with subject "${input.subject}" to ${recipientCount} recipient(s)`
    )
    this.logger.log(
      `Email recipients for subject "${input.subject}": ${recipients.join(', ')}`
    )
    try {
      const response = await this.resend.emails.send({
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html
      })

      if (response.error) {
        this.logger.error(
          `Failed to send email with subject "${input.subject}": ${response.error.message}`
        )
        throw new Error(response.error.message)
      }

      this.logger.log(
        `Email sent successfully with subject "${input.subject}" and id ${response.data?.id ?? 'unknown'}`
      )

      return {
        id: response.data?.id ?? null
      }
    } catch (error) {
      this.logger.error(
        `Unexpected error while sending email with subject "${input.subject}": ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }
}
