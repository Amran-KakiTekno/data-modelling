/**
 * Synthetic source sheets for the Master Model Lab demo.
 *
 * These three tables are authored fixtures held in memory. They are NOT real
 * files, NOT exports of any client system, and contain no production data:
 * every site name, region, identifier, volume, date and note below is invented
 * for this demonstration.
 *
 * The three sheets deliberately use different header aliases for the same
 * canonical concepts, which is the point of the demo:
 *
 *   NorthBranch.csv  Asset ID | Site      | Region | Monthly Volume | Last Updated | Notes
 *   EastBranch.csv   asset_code | facility_name | area_code | volume_m | modified_at | comment
 *   LegacyExport.csv ID      | SiteName  | Region | Volume        | Updated      | Contact
 */

export interface SourceTable {
  /** Stable identifier used for lineage labels and ordering. */
  id: string
  /** The name the sheet would have on disk. The demo never reads a file. */
  fileName: string
  /** Short human description of where the sheet would come from. */
  description: string
  /** Raw header row, exactly as authored (aliases included). */
  headers: string[]
  /** Raw data rows, in sheet order. */
  rows: string[][]
}

const northBranch: SourceTable = {
  id: 'north',
  fileName: 'NorthBranch.csv',
  description: 'Regional export produced by the northern branch operations team.',
  headers: ['Asset ID', 'Site', 'Region', 'Monthly Volume', 'Last Updated', 'Notes'],
  rows: [
    ['A-1001', 'Riverside Depot', 'North', '120', '2026-01-20', ''],
    ['A-1002', 'Harbour Annex', 'North', '80', '2026-02-02', 'Dock 3 lease review'],
    ['A-1005', 'Cedar Works', 'North', '210', '2026-01-18', 'Cedar Works roof inspection'],
    ['A-1006', 'Maple Substation', 'North', '45', '2026-01-09', 'Access badge pending, shift "B"'],
  ],
}

const eastBranch: SourceTable = {
  id: 'east',
  fileName: 'EastBranch.csv',
  description: 'Regional export produced by the eastern branch operations team.',
  headers: ['asset_code', 'facility_name', 'area_code', 'volume_m', 'modified_at', 'comment'],
  rows: [
    ['A-1001', 'Riverside Depot', 'North', '125', '2026-01-14', 'Quarterly review pending'],
    ['A-1003', 'Old Mill Yard', 'East', '60', '2026-01-28', 'Switchgear upgrade, phase 2'],
    ['A-1005', 'Cedar Works', 'North', '205', '2026-01-25', 'Cedar Works roof inspection, bay 2'],
    ['A-1007', 'Quarry Lane', 'East', '95', '2026-02-05', 'Permit "B" renewal pending'],
  ],
}

const legacyExport: SourceTable = {
  id: 'legacy',
  fileName: 'LegacyExport.csv',
  description: 'One-off export from an older spreadsheet workbook, kept for migration.',
  headers: ['ID', 'SiteName', 'Region', 'Volume', 'Updated', 'Contact'],
  rows: [
    ['', 'Old Sluice Store', 'West', '35', '2025-10-30', 'Row missing its asset id'],
    ['A-1004', 'Beacon Point', 'West', '150', '2025-11-12', 'Legacy import, verify contact'],
    ['A-1008', 'Silver Gate Clinic', 'West', '30', '2025-12-20', 'Legacy export row, migrated'],
  ],
}

function deepFreezeTable(table: SourceTable): SourceTable {
  Object.freeze(table.headers)
  for (const row of table.rows) Object.freeze(row)
  Object.freeze(table.rows)
  return Object.freeze(table)
}

/**
 * The three embedded source sheets, in a fixed order. Frozen so that no part
 * of the demo can mutate the fixtures.
 */
export const SOURCE_TABLES: readonly SourceTable[] = Object.freeze([
  deepFreezeTable(northBranch),
  deepFreezeTable(eastBranch),
  deepFreezeTable(legacyExport),
])

/** Total number of raw source rows across the three sheets (11). */
export const RAW_ROW_COUNT = SOURCE_TABLES.reduce((total, table) => total + table.rows.length, 0)

/** Human readable notice shown in the interface. */
export const SYNTHETIC_DATA_NOTICE =
  'Synthetic data only. Every sheet, identifier and note in this demo is invented for demonstration; no production or client records are used.'
