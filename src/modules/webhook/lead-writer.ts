import { Lead } from '../leads/entities/lead.entity'

import type { FindOneOptions, Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'

/** Lead columns the webhook flow may change (no relations, no timestamps). */
export const LEAD_WRITABLE_COLUMNS = [
  'userInformationsId',
  'companyId',
  'name',
  'phone',
  'email',
  'location',
  'source',
  'metaAdId',
  'googleAdId',
  'socialLinks',
  'leadQualification',
  'lastInboundMessageId',
  'lastAutoReplyMessageId',
  'lastActivityAt',
  'state',
  'flowState',
  'runtimeMode',
  'isFavorite'
] as const satisfies ReadonlyArray<keyof Lead>

type LeadColumn = (typeof LEAD_WRITABLE_COLUMNS)[number]
type LeadSnapshot = Map<LeadColumn, string>

const comparable = (value: unknown): string =>
  value instanceof Date ? `date:${value.getTime()}` : JSON.stringify(value)

/**
 * Writes only what the webhook flow changed on a lead since it was read.
 * `save(lead)` sends every column of the in-memory copy, so a change made
 * meanwhile by someone else (an agent switching `runtimeMode` in the UI)
 * was overwritten with the stale value. Leads read through this writer are
 * snapshotted, and `save` turns into an UPDATE of the changed columns.
 */
export class LeadWriter {
  private readonly snapshots = new WeakMap<Lead, LeadSnapshot>()

  constructor(private readonly leadRepo: Repository<Lead>) {}

  /** Remembers the current values of `lead` as the baseline for `save`. */
  track<T extends Lead | null | undefined>(lead: T): T {
    if (lead) {
      this.snapshots.set(
        lead,
        new Map(
          LEAD_WRITABLE_COLUMNS.map((column) => [
            column,
            comparable(lead[column])
          ])
        )
      )
    }
    return lead
  }

  async findOne(options: FindOneOptions<Lead>): Promise<Lead | null> {
    return this.track(await this.leadRepo.findOne(options))
  }

  async findOneOrFail(options: FindOneOptions<Lead>): Promise<Lead> {
    return this.track(await this.leadRepo.findOneOrFail(options))
  }

  /**
   * UPDATEs the columns changed since `track`; an untracked lead falls back
   * to a full `save`.
   */
  async save(lead: Lead): Promise<Lead> {
    const snapshot = this.snapshots.get(lead)

    if (!snapshot || !lead.id) {
      return this.track(await this.leadRepo.save(lead))
    }

    const changes: Partial<Record<LeadColumn, unknown>> = {}
    for (const column of LEAD_WRITABLE_COLUMNS) {
      const value = lead[column]
      if (value !== undefined && comparable(value) !== snapshot.get(column)) {
        changes[column] = value
      }
    }

    if (Object.keys(changes).length > 0) {
      await this.leadRepo.update(
        { id: lead.id },
        changes as QueryDeepPartialEntity<Lead>
      )
    }

    return this.track(lead)
  }
}
