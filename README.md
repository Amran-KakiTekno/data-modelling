# Master Model Lab (`data-modelling`)

A single-page, fully client-side demonstration of **reconciling several spreadsheet-shaped
source exports into one master model**. It is a clean-room technique demo built for the Dual Orbit
capability portfolio: the pattern is real, the data is invented.

**No production or client data is used.** Every sheet, asset id, site name, region, volume, date and
note in this repository was authored for this demo. Nothing is uploaded, nothing is fetched, and the
page never contacts a server.

## What the demo shows

Three embedded source sheets arrive with different column names for the same concepts:

| Sheet | Rows | Headers |
| --- | ---: | --- |
| `NorthBranch.csv` | 4 | `Asset ID`, `Site`, `Region`, `Monthly Volume`, `Last Updated`, `Notes` |
| `EastBranch.csv` | 4 | `asset_code`, `facility_name`, `area_code`, `volume_m`, `modified_at`, `comment` |
| `LegacyExport.csv` | 3 | `ID`, `SiteName`, `Region`, `Volume`, `Updated`, `Contact` |

They are in-memory fixtures (`src/data.ts`), not files on disk.

The lab then:

1. normalises each header alias onto the canonical model,
2. reconciles the 11 raw rows into a master model (10 valid rows, 8 master rows, 2 collapsed
   duplicates, 2 conflicting pairs, 3 issues),
3. resolves conflicts with an explicit, switchable strategy,
4. shows the lineage of any master row back to the rows that produced it,
5. exports the master model as a CSV generated in the browser.

### Canonical fields and alias mapping

Headers are normalised by lower-casing them and dropping everything that is not a letter or a digit
(`Monthly Volume` → `monthlyvolume`, `modified_at` → `modifiedat`), then matched against the alias
table for a canonical field:

| Canonical field | Accepted header aliases |
| --- | --- |
| `assetId` | `assetid`, `assetcode`, `id` |
| `siteName` | `site`, `sitename`, `facility`, `facilityname` |
| `region` | `region`, `area`, `areacode` |
| `monthlyVolume` | `monthlyvolume`, `volume`, `volumem` |
| `updatedAt` | `lastupdated`, `updated`, `updatedat`, `modified`, `modifiedat` |
| `contactNote` | `notes`, `note`, `comment`, `contact`, `contactnote` |

### Conflict strategies

| Strategy | Rule |
| --- | --- |
| `Latest update` | Keep the contributing row with the newest `updatedAt`. Ties fall back to sheet order. |
| `Most complete` | Keep the contributing row with the most populated canonical fields. Ties fall back to sheet order. |

Both strategies produce the same eight master rows and the same issue counts; they differ on which
contributing row wins for the two duplicated assets, so the optional `contactNote` and the
`monthlyVolume` of `A-1001` and `A-1005` resolve differently.

### Issue queue

| Issue | Kind | Detail |
| --- | --- | --- |
| `LegacyExport.csv` row 1 | `missing-asset-id` | No asset id, so the row is excluded. |
| `A-1001` | `conflicting-duplicate` | Present in `NorthBranch.csv` and `EastBranch.csv` with different values. |
| `A-1005` | `conflicting-duplicate` | Present in `NorthBranch.csv` and `EastBranch.csv` with different values. |

### CSV export

`Download master CSV` builds the file in the browser with a Blob: one header row
(`assetId,siteName,region,monthlyVolume,updatedAt,contactNote`) plus eight data rows. Values that
contain a comma, a quote or a newline are quoted, and embedded quotes are doubled.

## Commands

```bash
npm install        # install dependencies
npm run dev        # development server on http://localhost:4102
npm run typecheck  # tsc --noEmit
npm run test       # Vitest unit tests for the pure domain module
npm run build      # type check + production build into dist/
npm run preview    # serve dist/ on http://localhost:4102
npm run test:e2e  # Playwright browser tests (headless system Chrome)
npm run verify     # typecheck -> unit tests -> build -> Playwright -> build-output check
```

`npm run verify` prints `VERIFY_OK data-modelling` when every stage passes.

## Layout

| Path | Purpose |
| --- | --- |
| `src/data.ts` | The three authored source sheets (synthetic fixtures, frozen). |
| `src/domain.ts` | Pure logic: `normaliseSourceRow`, `reconcileSources`, `resolveConflict`, `toMasterCsv`. |
| `src/App.tsx` | The interface: sources, mapping, strategy controls, results, lineage, export. |
| `src/domain.test.ts` | Unit tests pinning the alias mapping, counts, strategies, lineage and CSV output. |
| `tests/demo.spec.ts` | Browser tests: interaction, both strategies, lineage, download, 390px layout, accessibility and offline runtime. |
| `scripts/verify-build.mjs` | Build output check (`VERIFY_OK data-modelling`). |

## Scope

This repository is a technique demonstration only. It contains no client data, no credentials, no
backend, no upload and no external runtime dependency, and it makes no claim about results achieved
on any real project.
