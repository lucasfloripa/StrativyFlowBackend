import { FollowUpResponseDto } from '../dto/followup-response.dto'
import { FollowUp } from '../entities/followup.entity'

export const mapFollowUpToResponseDto = (
  followUp: FollowUp
): FollowUpResponseDto => {
  return {
    id: followUp.id,
    negotiationId: followUp.negotiationId,
    title: followUp.title,
    status: followUp.status,
    dueAt: followUp.dueAt.toISOString(),
    completedAt: followUp.completedAt
      ? followUp.completedAt.toISOString()
      : null,
    reminder1hSentAt: followUp.reminder1hSentAt
      ? followUp.reminder1hSentAt.toISOString()
      : null,
    actions: (followUp.actions ?? []).map((action) => ({
      id: action.id,
      type: action.type,
      channel: action.channel ?? null,
      status: action.status,
      payload: action.payload ?? null,
      executedAt: action.executedAt ? action.executedAt.toISOString() : null,
      failureReason: action.failureReason ?? null,
      createdAt: action.createdAt.toISOString(),
      updatedAt: action.updatedAt.toISOString()
    })),
    createdAt: followUp.createdAt.toISOString(),
    updatedAt: followUp.updatedAt.toISOString()
  }
}
