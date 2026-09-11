import {
  FollowUpStepType,
  FollowUpWaitUnit
} from '../entities/followup-step.entity'

const millisecondsByWaitUnit: Record<FollowUpWaitUnit, number> = {
  [FollowUpWaitUnit.MINUTES]: 60 * 1000,
  [FollowUpWaitUnit.HOURS]: 60 * 60 * 1000,
  [FollowUpWaitUnit.DAYS]: 24 * 60 * 60 * 1000
}

export const calculateFollowUpStepScheduledAt = (
  referenceDate: Date,
  waitTime?: number | null,
  waitUnit?: FollowUpWaitUnit | null
): Date => {
  if (waitTime === null || waitTime === undefined || !waitUnit) {
    return new Date(referenceDate)
  }

  return new Date(
    referenceDate.getTime() + waitTime * millisecondsByWaitUnit[waitUnit]
  )
}

export const resolveFollowUpStepScheduledAt = (
  referenceDate: Date,
  stepType: FollowUpStepType,
  parentId: string | null | undefined,
  waitTime?: number | null,
  waitUnit?: FollowUpWaitUnit | null
): Date | null => {
  if (stepType === FollowUpStepType.CONDITION) {
    return null
  }

  if (parentId) {
    return null
  }

  return calculateFollowUpStepScheduledAt(referenceDate, waitTime, waitUnit)
}

export const activateFollowUpStepScheduledAt = (
  referenceDate: Date,
  stepType: FollowUpStepType,
  waitTime?: number | null,
  waitUnit?: FollowUpWaitUnit | null
): Date | null => {
  if (stepType === FollowUpStepType.CONDITION) {
    return null
  }

  return calculateFollowUpStepScheduledAt(referenceDate, waitTime, waitUnit)
}
