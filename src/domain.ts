/**
 * Pure domain logic for the Master Model Lab.
 *
 * Nothing in this module touches the DOM, the network or the clock: the same
 * input fixtures always produce the same master model, which is what makes the
 * demo reproducible and its unit tests meaningful.
 */

import type { SourceTable } from './data'

/** The canonical model fields every source sheet is mapped onto. */
export const CANONICAL_FIELDS = [
  'assetId',
  'siteName',
  'region',
  'monthlyVolume',
  'updatedAt',
  'contactNote',
] as const

export type CanonicalField = (typeof CANONICAL_FIELDS)[number]

export const CANONICAL_FIELD_LABELS: Record<CanonicalField, string> = {
  assetId: 'Asset ID',
  siteName: 'Site name',
  region: 'Region',
  monthlyVolume: 'Monthly volume',
  updatedAt: 'Updated at',
  contactNote: 'Contact note',
}

/** Fields that may legitimately be empty in a source sheet. */
export const OPTIONAL_CANONICAL_FIELDS: readonly CanonicalField[] = ['contactNote']

/**
 * Header aliases per canonical field, already normalised (lower case, letters
 * and digits only). A source header is matched by normalising it and looking
 * it up here.
 */
export const ALIAS_MAP: Record<CanonicalField, readonly string[]> = {
  assetId: ['assetid', 'assetcode', 'id'],
  siteName: ['site', 'sitename', 'facility', 'facilityname'],
  region: ['region', 'area', 'areacode'],
  monthlyVolume: ['monthlyvolume', 'volume', 'volumem'],
  updatedAt: ['lastupdated', 'updated', 'updatedat', 'modified', 'modifiedat'],
  contactNote: ['notes', 'note', 'comment', 'contact', 'contactnote'],
}

/** The two supported ways of resolving conflicting duplicate rows. */
export type ConflictStrategy = 'latest-update' | 'most-complete'

export const CONFLICT_STRATEGIES: readonly { id: ConflictStrategy; label: string; rule: string }[] = [
  {
    id: 'latest-update',
    label: 'Latest update',
    rule: 'Keep the contributing row with the newest updatedAt value. Ties fall back to sheet order.',
  },
  {
    id: 'most-complete',
    label: 'Most complete',
    rule: 'Keep the contributing row with the most populated canonical fields. Ties fall back to sheet order.',
  },
]

/** One source row after alias normalisation. */
export interface NormalisedRow {
  sourceId: string
  fileName: string
  /** 1-based row number inside the source sheet (the header is not counted). */
  rowNumber: number
  /** Stable human readable reference, e.g. "NorthBranch.csv row 2". */
  sourceRef: string
  values: Record<CanonicalField, string>
  missingFields: CanonicalField[]
  /** How many canonical fields are populated (0..6). */
  completeness: number
}

/** A conflict on one canonical field inside one asset group. */
export interface ResolvedConflict {
  field: CanonicalField
  candidates: { sourceRef: string; value: string }[]
  winnerRef: string
  resolution: ConflictStrategy
  basis: string
}

/** One row of the reconciled master model. */
export interface MasterRow {
  assetId: string
  siteName: string
  region: string
  monthlyVolume: string
  updatedAt: string
  contactNote: string
  /** Contributing source references, in first-seen order. */
  sourceRefs: string[]
  /** The contributing normalised rows, in first-seen order. */
  contributors: NormalisedRow[]
  conflicts: ResolvedConflict[]
  completeness: number
}

export type IssueKind = 'missing-asset-id' | 'conflicting-duplicate'

export interface Issue {
  id: string
  kind: IssueKind
  severity: 'error' | 'warning'
  message: string
  assetId: string | null
  sourceRefs: string[]
  fields: CanonicalField[]
}

/** The full outcome of a reconciliation run. */
export interface ReconciliationResult {
  strategy: ConflictStrategy
  rawRowCount: number
  validRowCount: number
  invalidRowCount: number
  masterRowCount: number
  /** Rows that were collapsed into an existing master row. */
  duplicateRowCount: number
  /** Number of duplicated assets whose values disagree. */
  conflictCount: number
  issueCount: number
  master: MasterRow[]
  issues: Issue[]
}

/** Lower-case the header and drop everything that is not a letter or digit. */
export function normaliseAlias(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Map one raw header onto a canonical field, or null when it is unknown. */
export function resolveCanonicalField(header: string): CanonicalField | null {
  const key = normaliseAlias(header)
  if (key === '') return null
  for (const field of CANONICAL_FIELDS) {
    if (ALIAS_MAP[field].includes(key)) return field
  }
  return null
}

/**
 * Normalise a single raw source row against the alias map of its sheet.
 * The function is pure: it never mutates the fixture it is given.
 */
export function normaliseSourceRow(table: SourceTable, rowIndex: number): NormalisedRow {
  const rawRow = table.rows[rowIndex] ?? []
  const values = {} as Record<CanonicalField, string>
  for (const field of CANONICAL_FIELDS) values[field] = ''

  table.headers.forEach((header, columnIndex) => {
    const field = resolveCanonicalField(header)
    if (field === null) return
    const raw = rawRow[columnIndex]
    if (raw === undefined) return
    const trimmed = String(raw).trim()
    if (trimmed === '') return
    if (values[field] === '') values[field] = trimmed
  })

  const missingFields = CANONICAL_FIELDS.filter((field) => values[field] === '')

  return {
    sourceId: table.id,
    fileName: table.fileName,
    rowNumber: rowIndex + 1,
    sourceRef: `${table.fileName} row ${rowIndex + 1}`,
    values,
    missingFields,
    completeness: CANONICAL_FIELDS.length - missingFields.length,
  }
}

/**
 * Pick the winning row out of a group of duplicate rows.
 *
 * `latest-update` wins on the newest updatedAt value, `most-complete` wins on
 * the number of populated canonical fields. Both break ties by sheet order, so
 * the result is always deterministic.
 */
export function resolveConflict(
  rows: readonly NormalisedRow[],
  strategy: ConflictStrategy,
): { winner: NormalisedRow; basis: string } {
  if (rows.length === 0) {
    throw new Error('resolveConflict needs at least one row')
  }
  if (rows.length === 1) {
    return { winner: rows[0], basis: 'Only one source row for this asset.' }
  }

  if (strategy === 'latest-update') {
    let winner = rows[0]
    for (const row of rows) {
      if (row.values.updatedAt > winner.values.updatedAt) winner = row
    }
    return {
      winner,
      basis: `Newest updatedAt value (${winner.values.updatedAt || 'not supplied'}).`,
    }
  }

  let winner = rows[0]
  for (const row of rows) {
    if (row.completeness > winner.completeness) winner = row
  }
  return {
    winner,
    basis: `${winner.completeness} of ${CANONICAL_FIELDS.length} canonical fields populated.`,
  }
}

/**
 * Reconcile the given source sheets into one master model.
 *
 * Deterministic and idempotent: calling it twice with the same tables and
 * strategy returns deeply equal results and never mutates the fixtures.
 */
export function reconcileSources(
  tables: readonly SourceTable[],
  strategy: ConflictStrategy,
): ReconciliationResult {
  const normalised: NormalisedRow[] = []
  const issues: Issue[] = []
  let issueCounter = 0

  for (const table of tables) {
    table.rows.forEach((_row, rowIndex) => {
      const normalisedRow = normaliseSourceRow(table, rowIndex)
      normalised.push(normalisedRow)
      if (normalisedRow.values.assetId === '') {
        issueCounter += 1
        issues.push({
          id: `issue-${issueCounter}`,
          kind: 'missing-asset-id',
          severity: 'error',
          message: `Row ${normalisedRow.rowNumber} of ${normalisedRow.fileName} has no asset id and was excluded.`,
          assetId: null,
          sourceRefs: [normalisedRow.sourceRef],
          fields: ['assetId'],
        })
      }
    })
  }

  const validRows = normalised.filter((row) => row.values.assetId !== '')

  const groups = new Map<string, NormalisedRow[]>()
  for (const row of validRows) {
    const key = row.values.assetId
    const bucket = groups.get(key)
    if (bucket) bucket.push(row)
    else groups.set(key, [row])
  }

  const master: MasterRow[] = []
  let duplicateRowCount = 0
  let conflictCount = 0

  for (const [assetId, rows] of groups) {
    const { winner, basis } = resolveConflict(rows, strategy)
    const conflicts: ResolvedConflict[] = []

    if (rows.length > 1) {
      duplicateRowCount += rows.length - 1
      for (const field of CANONICAL_FIELDS) {
        const distinct = new Set(rows.map((row) => row.values[field]))
        if (distinct.size > 1) {
          conflicts.push({
            field,
            candidates: rows.map((row) => ({ sourceRef: row.sourceRef, value: row.values[field] })),
            winnerRef: winner.sourceRef,
            resolution: strategy,
            basis,
          })
        }
      }
      if (conflicts.length > 0) {
        conflictCount += 1
        issueCounter += 1
        issues.push({
          id: `issue-${issueCounter}`,
          kind: 'conflicting-duplicate',
          severity: 'warning',
          message: `Asset ${assetId} appears in ${rows.length} sheets with ${conflicts.length} conflicting field(s): ${conflicts
            .map((conflict) => conflict.field)
            .join(', ')}.`,
          assetId,
          sourceRefs: rows.map((row) => row.sourceRef),
          fields: conflicts.map((conflict) => conflict.field),
        })
      }
    }

    master.push({
      assetId,
      siteName: winner.values.siteName,
      region: winner.values.region,
      monthlyVolume: winner.values.monthlyVolume,
      updatedAt: winner.values.updatedAt,
      contactNote: winner.values.contactNote,
      sourceRefs: rows.map((row) => row.sourceRef),
      contributors: rows,
      conflicts,
      completeness: winner.completeness,
    })
  }

  master.sort((left, right) => (left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0))
  issues.sort((left, right) => (left.kind === right.kind ? 0 : left.kind === 'missing-asset-id' ? -1 : 1))

  return {
    strategy,
    rawRowCount: normalised.length,
    validRowCount: validRows.length,
    invalidRowCount: normalised.length - validRows.length,
    masterRowCount: master.length,
    duplicateRowCount,
    conflictCount,
    issueCount: issues.length,
    master,
    issues,
  }
}

/** Quote a single CSV value when it contains a comma, a quote or a newline. */
export function escapeCsvValue(value: string): string {
  if (value === '') return ''
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Serialise the master model as CSV: one header row followed by one row per
 * master record. The output contains no trailing newline, so it is exactly
 * `master.length + 1` lines.
 */
export function toMasterCsv(master: readonly MasterRow[]): string {
  const header = CANONICAL_FIELDS.map((field) => escapeCsvValue(field)).join(',')
  const body = master.map((row) => CANONICAL_FIELDS.map((field) => escapeCsvValue(row[field])).join(','))
  return [header, ...body].join('\n')
}
