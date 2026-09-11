import {
  FollowUpResponseDto,
  FollowUpStepResponseDto
} from '../dto/followup-response.dto'
import { FollowUpStep } from '../entities/followup-step.entity'
import { FollowUp } from '../entities/followup.entity'

export const mapFollowUpStepToResponseDto = (
  step: FollowUpStep
): FollowUpStepResponseDto => ({
  id: step.id,
  followUpId: step.followUpId,
  parentId: step.parentId ?? null,
  type: step.type,
  actionType: step.actionType ?? null,
  conditionType: step.conditionType ?? null,
  channel: step.channel ?? null,
  status: step.status,
  waitTime: step.waitTime ?? null,
  waitUnit: step.waitUnit ?? null,
  scheduledAt: step.scheduledAt ? step.scheduledAt.toISOString() : null,
  payload: step.payload ?? null,
  result: step.result ?? null,
  executedAt: step.executedAt ? step.executedAt.toISOString() : null,
  failureReason: step.failureReason ?? null,
  replyMessageId: step.replyMessageId ?? null,
  replyContent: step.replyContent ?? null,
  replyType: step.replyType ?? null,
  repliedAt: step.repliedAt ? step.repliedAt.toISOString() : null,
  createdAt: step.createdAt.toISOString(),
  updatedAt: step.updatedAt.toISOString()
})

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
    steps: (followUp.steps ?? []).map(mapFollowUpStepToResponseDto),
    createdAt: followUp.createdAt.toISOString(),
    updatedAt: followUp.updatedAt.toISOString()
  }
}
