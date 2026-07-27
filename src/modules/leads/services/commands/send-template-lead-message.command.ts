export type SendTemplateLeadMessageCommand = {
  userId: string
  leadId: string
  templateId: string
  variables: Record<string, string>
}
