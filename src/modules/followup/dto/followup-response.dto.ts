import { FollowUpStatus } from '../entities/followup.entity'

export type FollowUpTemplateResponseDto = {
  id: string
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

export type FollowUpResponseDto = {
  id: string
  negotiationId: string
  title: string
  status: FollowUpStatus
  dueAt: string
  completedAt: string | null
  templateId: string | null
  template: FollowUpTemplateResponseDto | null
  templateVariables: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
