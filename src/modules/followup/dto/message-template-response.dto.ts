export type MessageTemplateResponseDto = {
  id: string
  userInformationsId: string | null
  metaTemplateName: string
  metaTemplateId: string | null
  language: string
  category: string | null
  active: boolean
  name: string
  description: string | null
  variables: Array<{
    key: string
    label: string
    required: boolean
  }>
  createdAt: string
  updatedAt: string
}