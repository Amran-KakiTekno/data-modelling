import { useMemo, useState } from 'react'
import { SOURCE_TABLES, SYNTHETIC_DATA_NOTICE } from './data'
import {
  CANONICAL_FIELDS,
  CANONICAL_FIELD_LABELS,
  CONFLICT_STRATEGIES,
  reconcileSources,
  resolveCanonicalField,
  toMasterCsv,
  type ConflictStrategy,
  type MasterRow,
  type ReconciliationResult,
} from './domain'

const CSV_FILE_NAME = 'master-model.csv'

interface StrategyOption {
  id: ConflictStrategy
  label: string
  rule: string
}

const STRATEGY_OPTIONS: StrategyOption[] = CONFLICT_STRATEGIES.map((strategy) => ({
  id: strategy.id,
  label: strategy.label,
  rule: strategy.rule,
}))

export default function App() {
  const [strategy, setStrategy] = useState<ConflictStrategy>('latest-update')
  const [result, setResult] = useState<ReconciliationResult | null>(null)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)

  const mapping = useMemo(
    () =>
      SOURCE_TABLES.map((table) => ({
        table,
        columns: table.headers.map((header) => ({
          header,
          canonical: resolveCanonicalField(header),
        })),
      })),
    [],
  )

  const selectedRow: MasterRow | null = useMemo(() => {
    if (!result || selectedAssetId === null) return null
    return result.master.find((row) => row.assetId === selectedAssetId) ?? null
  }, [result, selectedAssetId])

  const runReconciliation = () => {
    setResult(reconcileSources(SOURCE_TABLES, strategy))
    setSelectedAssetId(null)
  }

  const resetLab = () => {
    setResult(null)
    setSelectedAssetId(null)
  }

  const downloadMasterCsv = () => {
    if (!result) return
    const csv = toMasterCsv(result.master)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = CSV_FILE_NAME
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="page">
      <header className="masthead">
        <p className="eyebrow">Dual Orbit · data engineering technique demo</p>
        <h1>Master Model Lab</h1>
        <p className="lede">
          Three spreadsheet-shaped exports arrive with different column names. The lab normalises them onto
          one canonical model, resolves duplicated assets with an explicit strategy and hands you a master
          table with full lineage back to the source rows.
        </p>
        <p className="notice" data-testid="synthetic-notice">
          {SYNTHETIC_DATA_NOTICE}
        </p>
      </header>

      <main>
        <section className="panel" aria-labelledby="controls-heading">
          <h2 id="controls-heading">1 · Choose a conflict strategy</h2>
          <fieldset className="strategies">
            <legend className="sr-only">Conflict resolution strategy</legend>
            {STRATEGY_OPTIONS.map((option) => (
              <label className="strategy" key={option.id}>
                <input
                  type="radio"
                  name="strategy"
                  value={option.id}
                  checked={strategy === option.id}
                  onChange={() => setStrategy(option.id)}
                  data-testid={`strategy-${option.id}`}
                />
                <span className="strategy-body">
                  <span className="strategy-label">{option.label}</span>
                  <span className="strategy-rule">{option.rule}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="actions">
            <button type="button" className="primary" onClick={runReconciliation} data-testid="run-reconciliation">
              Run reconciliation
            </button>
            <button type="button" onClick={resetLab} data-testid="reset-lab">
              Reset
            </button>
            <button
              type="button"
              onClick={downloadMasterCsv}
              disabled={!result}
              data-testid="download-csv"
            >
              Download master CSV
            </button>
          </div>
          <p className="hint">
            Every run recomputes the master model from the embedded fixtures, so rerunning replaces the
            previous result instead of adding to it.
          </p>
        </section>

        <section className="panel" aria-labelledby="sources-heading">
          <h2 id="sources-heading">2 · Inspect the raw source sheets</h2>
          <p className="hint">
            The three sheets below are in-memory fixtures. No file is uploaded and no network request is made.
          </p>
          <div className="source-grid">
            {SOURCE_TABLES.map((table) => (
              <article className="source-card" key={table.id} data-testid={`source-${table.id}`}>
                <h3>{table.fileName}</h3>
                <p className="hint">{table.description}</p>
                <p className="source-count">{table.rows.length} rows</p>
                <div className="table-scroll" tabIndex={0} role="region" aria-label={`${table.fileName} raw rows`}>
                  <table>
                    <caption className="sr-only">Raw rows of {table.fileName}</caption>
                    <thead>
                      <tr>
                        {table.headers.map((header) => (
                          <th scope="col" key={header}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, rowIndex) => (
                        <tr key={`${table.id}-${rowIndex}`}>
                          {row.map((cell, cellIndex) => (
                            <td key={`${table.id}-${rowIndex}-${cellIndex}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby="mapping-heading">
          <h2 id="mapping-heading">3 · Review the alias mapping</h2>
          <p className="hint">
            Each source header is normalised (lower case, letters and digits only) and matched against the
            alias table for a canonical field.
          </p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Source alias to canonical field mapping">
            <table data-testid="mapping-table">
              <caption className="sr-only">Source header aliases mapped to canonical fields</caption>
              <thead>
                <tr>
                  <th scope="col">Source sheet</th>
                  <th scope="col">Source header</th>
                  <th scope="col">Canonical field</th>
                </tr>
              </thead>
              <tbody>
                {mapping.flatMap(({ table, columns }) =>
                  columns.map((column) => (
                    <tr key={`${table.id}-${column.header}`}>
                      <td>{table.fileName}</td>
                      <td>
                        <code>{column.header}</code>
                      </td>
                      <td>{column.canonical ?? 'unmapped'}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-labelledby="results-heading">
          <h2 id="results-heading">4 · Run the reconciliation</h2>
          {!result && (
            <p className="empty" data-testid="results-empty">
              No reconciliation yet. Pick a strategy and select <strong>Run reconciliation</strong>.
            </p>
          )}

          {result && (
            <>
              <ul className="stats" data-testid="summary">
                <li className="stat" data-testid="stat-source-rows">
                  <span className="stat-value">{result.rawRowCount}</span> <span className="stat-label">source rows</span>
                </li>
                <li className="stat" data-testid="stat-valid-rows">
                  <span className="stat-value">{result.validRowCount}</span> <span className="stat-label">valid rows</span>
                </li>
                <li className="stat" data-testid="stat-master-rows">
                  <span className="stat-value">{result.masterRowCount}</span> <span className="stat-label">master rows</span>
                </li>
                <li className="stat" data-testid="stat-conflicts">
                  <span className="stat-value">{result.conflictCount}</span> <span className="stat-label">conflicts</span>
                </li>
                <li className="stat" data-testid="stat-issues">
                  <span className="stat-value">{result.issueCount}</span> <span className="stat-label">issues</span>
                </li>
              </ul>

              <h3>Master model</h3>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Reconciled master table">
                <table data-testid="master-table">
                  <caption className="sr-only">Reconciled master model</caption>
                  <thead>
                    <tr>
                      <th scope="col">Asset</th>
                      {CANONICAL_FIELDS.slice(1).map((field) => (
                        <th scope="col" key={field}>
                          {CANONICAL_FIELD_LABELS[field]}
                        </th>
                      ))}
                      <th scope="col">Sources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.master.map((row) => (
                      <tr
                        key={row.assetId}
                        data-testid="master-row"
                        data-asset-id={row.assetId}
                        className={row.assetId === selectedAssetId ? 'is-selected' : undefined}
                      >
                        <th scope="row">
                          <button
                            type="button"
                            className="link-button"
                            aria-pressed={row.assetId === selectedAssetId}
                            onClick={() =>
                              setSelectedAssetId((current) => (current === row.assetId ? null : row.assetId))
                            }
                            data-testid={`master-row-${row.assetId}`}
                          >
                            {row.assetId}
                          </button>
                        </th>
                        {CANONICAL_FIELDS.slice(1).map((field) => (
                          <td key={field} data-field={field}>
                            {row[field]}
                          </td>
                        ))}
                        <td>{row.sourceRefs.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3>Issue queue</h3>
              <ul className="issues" data-testid="issue-queue">
                {result.issues.map((issue) => (
                  <li key={issue.id} data-testid="issue" data-issue-kind={issue.kind}>
                    <span className={`badge ${issue.severity}`}>{issue.severity === 'error' ? 'error' : 'warning'}</span>
                    <span className="issue-message">{issue.message}</span>
                    <span className="issue-refs">{issue.sourceRefs.join(' · ')}</span>
                  </li>
                ))}
              </ul>

              <h3>Lineage</h3>
              {!selectedRow && (
                <p className="empty" data-testid="lineage-empty">
                  Select an asset id in the master table to see the contributing source rows and the resolved
                  conflicts.
                </p>
              )}
              {selectedRow && (
                <div className="lineage" data-testid="lineage">
                  <h4>
                    {selectedRow.assetId} · {selectedRow.siteName}
                  </h4>
                  <div className="table-scroll" tabIndex={0} role="region" aria-label={`Source rows for ${selectedRow.assetId}`}>
                    <table data-testid="lineage-table">
                      <caption className="sr-only">Contributing source rows</caption>
                      <thead>
                        <tr>
                          <th scope="col">Source row</th>
                          {CANONICAL_FIELDS.map((field) => (
                            <th scope="col" key={field}>
                              {CANONICAL_FIELD_LABELS[field]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRow.contributors.map((contributor) => (
                          <tr key={contributor.sourceRef}>
                            <th scope="row">{contributor.sourceRef}</th>
                            {CANONICAL_FIELDS.map((field) => (
                              <td key={field}>{contributor.values[field]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {selectedRow.conflicts.length === 0 ? (
                    <p className="hint">No conflicting fields: this asset came from a single source row.</p>
                  ) : (
                    <ul className="conflicts" data-testid="conflicts">
                      {selectedRow.conflicts.map((conflict) => (
                        <li key={conflict.field} data-testid="conflict" data-field={conflict.field}>
                          <strong>{CANONICAL_FIELD_LABELS[conflict.field]}</strong> — {conflict.basis}
                          <ul>
                            {conflict.candidates.map((candidate) => (
                              <li key={candidate.sourceRef}>
                                <code>{candidate.sourceRef}</code>: {candidate.value === '' ? '(empty)' : candidate.value}
                                {candidate.sourceRef === conflict.winnerRef ? ' — kept' : ''}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="colophon">
        <p>
          Clean-room technique demo by Dual Orbit (built by Kaki Tekno). Synthetic fixtures only — this page
          contains no production or client data and never contacts a server.
        </p>
      </footer>
    </div>
  )
}
