import {
  FollowUpActionChannel,
  FollowUpActionStatus,
  FollowUpActionType
} from '../entities/followup-action.entity'
import { FollowUpStatus } from '../entities/followup.entity'

export type FollowUpActionResponseDto = {
  id: string
  type: FollowUpActionType
  channel: FollowUpActionChannel | null
  status: FollowUpActionStatus
  payload: Record<string, unknown> | null
  executedAt: string | null
  failureReason: string | null
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
  actions: FollowUpActionResponseDto[]
  createdAt: string
  updatedAt: string
}
