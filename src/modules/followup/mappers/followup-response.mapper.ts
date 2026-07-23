import { FollowUpResponseDto } from '../dto/followup-response.dto'
import { FollowUp } from '../entities/followup.entity'

export const mapFollowUpToResponseDto = (
  followUp: FollowUp
): FollowUpResponseDto => {
  const template = followUp.template

  return {
    id: followUp.id,
    negotiationId: followUp.negotiationId,
    title: followUp.title,
    status: followUp.status,
    dueAt: followUp.dueAt.toISOString(),
    completedAt: followUp.completedAt ? followUp.completedAt.toISOString() : null,
    templateId: followUp.templateId ?? null,
    template: template
      ? {
          id: template.id,
          name: template.name,
          description: template.description ?? null,
          variables: template.variables ?? [],
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString()
        }
      : null,
    templateVariables: followUp.templateVariables ?? {},
    createdAt: followUp.createdAt.toISOString(),
    updatedAt: followUp.updatedAt.toISOString()
  }
}
