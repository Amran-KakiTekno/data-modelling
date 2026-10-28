import { describe, expect, it } from 'vitest'
import { RAW_ROW_COUNT, SOURCE_TABLES } from './data'
import {
  ALIAS_MAP,
  CANONICAL_FIELDS,
  escapeCsvValue,
  normaliseAlias,
  normaliseSourceRow,
  reconcileSources,
  resolveCanonicalField,
  resolveConflict,
  toMasterCsv,
  type NormalisedRow,
} from './domain'

const north = SOURCE_TABLES[0]
const east = SOURCE_TABLES[1]
const legacy = SOURCE_TABLES[2]

describe('alias normalisation', () => {
  it('strips case, spaces and punctuation from a header', () => {
    expect(normaliseAlias('Asset ID')).toBe('assetid')
    expect(normaliseAlias('Monthly Volume')).toBe('monthlyvolume')
    expect(normaliseAlias('  modified_at ')).toBe('modifiedat')
    expect(normaliseAlias('ID')).toBe('id')
  })

  it('maps every header of every source sheet onto a canonical field', () => {
    expect(resolveCanonicalField('Asset ID')).toBe('assetId')
    expect(resolveCanonicalField('asset_code')).toBe('assetId')
    expect(resolveCanonicalField('ID')).toBe('assetId')
    expect(resolveCanonicalField('Site')).toBe('siteName')
    expect(resolveCanonicalField('facility_name')).toBe('siteName')
    expect(resolveCanonicalField('SiteName')).toBe('siteName')
    expect(resolveCanonicalField('Region')).toBe('region')
    expect(resolveCanonicalField('area_code')).toBe('region')
    expect(resolveCanonicalField('Monthly Volume')).toBe('monthlyVolume')
    expect(resolveCanonicalField('volume_m')).toBe('monthlyVolume')
    expect(resolveCanonicalField('Volume')).toBe('monthlyVolume')
    expect(resolveCanonicalField('Last Updated')).toBe('updatedAt')
    expect(resolveCanonicalField('modified_at')).toBe('updatedAt')
    expect(resolveCanonicalField('Updated')).toBe('updatedAt')
    expect(resolveCanonicalField('Notes')).toBe('contactNote')
    expect(resolveCanonicalField('comment')).toBe('contactNote')
    expect(resolveCanonicalField('Contact')).toBe('contactNote')
  })

  it('returns null for a header that is not in the alias table', () => {
    expect(resolveCanonicalField('Cost Centre')).toBeNull()
    expect(resolveCanonicalField('')).toBeNull()
  })

  it('normalises a raw row into canonical values', () => {
    const row = normaliseSourceRow(north, 0)
    expect(row.sourceRef).toBe('NorthBranch.csv row 1')
    expect(row.values.assetId).toBe('A-1001')
    expect(row.values.siteName).toBe('Riverside Depot')
    expect(row.values.region).toBe('North')
    expect(row.values.monthlyVolume).toBe('120')
    expect(row.values.updatedAt).toBe('2026-01-20')
    expect(row.values.contactNote).toBe('')
    expect(row.missingFields).toEqual(['contactNote'])
    expect(row.completeness).toBe(5)
  })

  it('normalises every alias family onto the same canonical field', () => {
    const eastRow = normaliseSourceRow(east, 0)
    expect(eastRow.values.assetId).toBe('A-1001')
    expect(eastRow.values.siteName).toBe('Riverside Depot')
    expect(eastRow.values.monthlyVolume).toBe('125')
    expect(eastRow.values.updatedAt).toBe('2026-01-14')

    const legacyRow = normaliseSourceRow(legacy, 1)
    expect(legacyRow.values.assetId).toBe('A-1004')
    expect(legacyRow.values.siteName).toBe('Beacon Point')
    expect(legacyRow.values.monthlyVolume).toBe('150')
    expect(legacyRow.values.updatedAt).toBe('2025-11-12')
  })

  it('exposes every canonical field in the alias table', () => {
    for (const field of CANONICAL_FIELDS) {
      expect(ALIAS_MAP[field].length).toBeGreaterThan(0)
    }
  })
})

describe('reconciliation counts', () => {
  const result = reconcileSources(SOURCE_TABLES, 'latest-update')

  it('sees 11 raw rows across the three sheets', () => {
    expect(RAW_ROW_COUNT).toBe(11)
    expect(result.rawRowCount).toBe(11)
    expect(north.rows.length).toBe(4)
    expect(east.rows.length).toBe(4)
    expect(legacy.rows.length).toBe(3)
  })

  it('excludes exactly one row that has no asset id and reports it', () => {
    expect(result.invalidRowCount).toBe(1)
    expect(result.validRowCount).toBe(10)
    const invalid = result.issues.filter((issue) => issue.kind === 'missing-asset-id')
    expect(invalid).toHaveLength(1)
    expect(invalid[0].sourceRefs).toEqual(['LegacyExport.csv row 1'])
    expect(result.master.some((row) => row.assetId === '')).toBe(false)
  })

  it('produces 8 master rows, collapses 2 duplicates and finds 2 conflicting pairs', () => {
    expect(result.masterRowCount).toBe(8)
    expect(result.master).toHaveLength(8)
    expect(result.duplicateRowCount).toBe(2)
    expect(result.conflictCount).toBe(2)
    expect(result.issueCount).toBe(3)
  })

  it('reports 8 unique asset ids sorted ascending', () => {
    expect(result.master.map((row) => row.assetId)).toEqual([
      'A-1001',
      'A-1002',
      'A-1003',
      'A-1004',
      'A-1005',
      'A-1006',
      'A-1007',
      'A-1008',
    ])
  })
})

describe('conflict strategies', () => {
  const latest = reconcileSources(SOURCE_TABLES, 'latest-update')
  const complete = reconcileSources(SOURCE_TABLES, 'most-complete')

  it('keeps the same eight ids and the same counts under both strategies', () => {
    expect(complete.master.map((row) => row.assetId)).toEqual(latest.master.map((row) => row.assetId))
    expect(complete.masterRowCount).toBe(8)
    expect(complete.validRowCount).toBe(10)
    expect(complete.rawRowCount).toBe(11)
    expect(complete.duplicateRowCount).toBe(2)
    expect(complete.conflictCount).toBe(2)
    expect(complete.issueCount).toBe(3)
  })

  it('resolves at least one optional field differently under the two strategies', () => {
    const latestById = new Map(latest.master.map((row) => [row.assetId, row]))
    const completeById = new Map(complete.master.map((row) => [row.assetId, row]))
    const differing = latest.master.filter((row) => {
      const other = completeById.get(row.assetId)
      return other !== undefined && other.contactNote !== row.contactNote
    })
    expect(differing.length).toBeGreaterThan(0)
    expect(latestById.get('A-1001')?.contactNote).toBe('')
    expect(completeById.get('A-1001')?.contactNote).toBe('Quarterly review pending')
    expect(latestById.get('A-1005')?.monthlyVolume).toBe('205')
    expect(completeById.get('A-1005')?.monthlyVolume).toBe('210')
  })

  it('records the conflicting fields for a duplicated asset', () => {
    const row = latest.master.find((entry) => entry.assetId === 'A-1001')
    expect(row).toBeDefined()
    expect(row?.sourceRefs).toEqual(['NorthBranch.csv row 1', 'EastBranch.csv row 1'])
    expect(row?.conflicts.map((conflict) => conflict.field).sort()).toEqual([
      'contactNote',
      'monthlyVolume',
      'updatedAt',
    ])
    expect(row?.conflicts[0].candidates.length).toBe(2)
  })

  it('resolves a group of rows deterministically', () => {
    const rows: NormalisedRow[] = [
      normaliseSourceRow(north, 0),
      normaliseSourceRow(east, 0),
    ]
    expect(resolveConflict(rows, 'latest-update').winner.sourceRef).toBe('NorthBranch.csv row 1')
    expect(resolveConflict(rows, 'most-complete').winner.sourceRef).toBe('EastBranch.csv row 1')
    expect(resolveConflict(rows, 'most-complete').basis).toContain('6 of 6')
  })
})

describe('lineage determinism and idempotence', () => {
  it('returns deeply equal results for a repeated run', () => {
    const first = reconcileSources(SOURCE_TABLES, 'most-complete')
    const second = reconcileSources(SOURCE_TABLES, 'most-complete')
    expect(second).toEqual(first)
  })

  it('does not mutate the fixtures', () => {
    const before = JSON.stringify(SOURCE_TABLES)
    reconcileSources(SOURCE_TABLES, 'latest-update')
    reconcileSources(SOURCE_TABLES, 'most-complete')
    expect(JSON.stringify(SOURCE_TABLES)).toBe(before)
    expect(Object.isFrozen(SOURCE_TABLES)).toBe(true)
    expect(Object.isFrozen(SOURCE_TABLES[0].rows)).toBe(true)
  })

  it('keeps contributing source rows for every master row', () => {
    const result = reconcileSources(SOURCE_TABLES, 'latest-update')
    for (const row of result.master) {
      expect(row.contributors.length).toBe(row.sourceRefs.length)
      expect(row.contributors.every((contributor) => contributor.values.assetId === row.assetId)).toBe(true)
    }
    const duplicated = result.master.filter((row) => row.sourceRefs.length > 1)
    expect(duplicated).toHaveLength(2)
  })
})

describe('CSV export', () => {
  const result = reconcileSources(SOURCE_TABLES, 'latest-update')
  const csv = toMasterCsv(result.master)

  it('writes one header row plus eight data rows', () => {
    const lines = csv.split('\n')
    expect(lines).toHaveLength(9)
    expect(lines[0]).toBe('assetId,siteName,region,monthlyVolume,updatedAt,contactNote')
  })

  it('quotes embedded commas and doubles embedded quotes', () => {
    expect(escapeCsvValue('plain')).toBe('plain')
    expect(escapeCsvValue('two, values')).toBe('"two, values"')
    expect(escapeCsvValue('say "B"')).toBe('"say ""B"""')
    expect(csv).toContain('"Switchgear upgrade, phase 2"')
    expect(csv).toContain('"Access badge pending, shift ""B"""')
  })

  it('contains every master row and drops no source row that reached the master model', () => {
    const lines = csv.split('\n').slice(1)
    expect(lines).toHaveLength(result.master.length)
    for (const row of result.master) {
      expect(lines.some((line) => line.startsWith(`${row.assetId},`))).toBe(true)
    }
    expect(lines.every((line) => line.length > 0)).toBe(true)
  })
})
