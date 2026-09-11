import {
  FollowUpActionType,
  FollowUpConditionType,
  FollowUpStepChannel,
  FollowUpStepStatus,
  FollowUpStepType,
  FollowUpWaitUnit
} from '../entities/followup-step.entity'
import { FollowUpStatus } from '../entities/followup.entity'

export type FollowUpStepResponseDto = {
  id: string
  followUpId: string
  parentId: string | null
  type: FollowUpStepType
  actionType: FollowUpActionType | null
  conditionType: FollowUpConditionType | null
  channel: FollowUpStepChannel | null
  status: FollowUpStepStatus
  waitTime: number | null
  waitUnit: FollowUpWaitUnit | null
  scheduledAt: string | null
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  executedAt: string | null
  failureReason: string | null
  replyMessageId: string | null
  replyContent: string | null
  replyType: string | null
  repliedAt: string | null
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
  reminder1hSentAt: string | null
  steps: FollowUpStepResponseDto[]
  createdAt: string
  updatedAt: string
}
