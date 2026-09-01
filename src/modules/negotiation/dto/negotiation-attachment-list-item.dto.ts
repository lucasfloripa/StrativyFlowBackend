import { NegotiationAttachmentResponseDto } from './negotiation-attachment-response.dto'

export class NegotiationAttachmentListItemDto extends NegotiationAttachmentResponseDto {
  negotiationId!: string
  leadId!: string
}
