import {
  FollowUpStepType,
  FollowUpWaitUnit
} from '../entities/followup-step.entity'

import {
  calculateFollowUpStepScheduledAt,
  resolveFollowUpStepScheduledAt
} from './followup-step-schedule'

describe('FollowUpStep schedule', () => {
  const referenceDate = new Date('2026-09-09T10:00:00.000Z')

  it.each([
    [30, FollowUpWaitUnit.MINUTES, '2026-09-09T10:30:00.000Z'],
    [2, FollowUpWaitUnit.HOURS, '2026-09-09T12:00:00.000Z'],
    [3, FollowUpWaitUnit.DAYS, '2026-09-12T10:00:00.000Z']
  ])('adds %i %s to the reference date', (waitTime, waitUnit, expected) => {
    expect(
      calculateFollowUpStepScheduledAt(referenceDate, waitTime, waitUnit)
    ).toEqual(new Date(expected))
  })

  it('uses the reference date when no complete wait is configured', () => {
    expect(calculateFollowUpStepScheduledAt(referenceDate)).toEqual(
      referenceDate
    )
    expect(calculateFollowUpStepScheduledAt(referenceDate, 10, null)).toEqual(
      referenceDate
    )
  })

  it('leaves child Steps unscheduled until their parent is resolved', () => {
    expect(
      resolveFollowUpStepScheduledAt(
        referenceDate,
        FollowUpStepType.ACTION,
        'parent-step-id',
        2,
        FollowUpWaitUnit.HOURS
      )
    ).toBeNull()
  })

  it('keeps condition steps unscheduled even at root level', () => {
    expect(
      resolveFollowUpStepScheduledAt(
        referenceDate,
        FollowUpStepType.CONDITION,
        null,
        1,
        FollowUpWaitUnit.HOURS
      )
    ).toBeNull()
  })
})
