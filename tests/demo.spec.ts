import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const LOCAL_ORIGIN = 'http://localhost:4102'

/** Collect every request the page makes so we can prove nothing leaves the machine. */
function trackRequests(page: Page): string[] {
  const requests: string[] = []
  page.on('request', (request) => {
    requests.push(request.url())
  })
  return requests
}

function isLocal(url: string): boolean {
  return url.startsWith(LOCAL_ORIGIN) || url.startsWith('data:') || url.startsWith('blob:')
}

async function runReconciliation(page: Page, strategy: 'latest-update' | 'most-complete' = 'latest-update') {
  await page.getByTestId(`strategy-${strategy}`).check()
  await page.getByTestId('run-reconciliation').click()
  await expect(page.getByTestId('master-table')).toBeVisible()
}

test.describe('Master Model Lab', () => {
  test('shows the synthetic data notice, the three source sheets and the alias mapping', async ({ page }) => {
    const requests = trackRequests(page)

    await page.goto('/')

    await expect(page).toHaveTitle(/Master Model Lab/)
    await expect(page.getByRole('heading', { level: 1, name: 'Master Model Lab' })).toBeVisible()
    await expect(page.getByTestId('synthetic-notice')).toContainText('Synthetic data only')

    await expect(page.getByTestId('source-north')).toContainText('NorthBranch.csv')
    await expect(page.getByTestId('source-east')).toContainText('EastBranch.csv')
    await expect(page.getByTestId('source-legacy')).toContainText('LegacyExport.csv')

    const mapping = page.getByTestId('mapping-table')
    await expect(mapping).toContainText('Asset ID')
    await expect(mapping).toContainText('asset_code')
    await expect(mapping).toContainText('facility_name')
    await expect(mapping).toContainText('modified_at')
    await expect(mapping).toContainText('assetId')
    await expect(mapping).toContainText('contactNote')

    expect(requests.length).toBeGreaterThan(0)
    expect(requests.filter((url) => !isLocal(url))).toEqual([])
  })

  test('reconciles 11 source rows into 8 master rows with 3 issues', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('results-empty')).toBeVisible()

    await runReconciliation(page)

    await expect(page.getByTestId('stat-source-rows')).toHaveText('11 source rows')
    await expect(page.getByTestId('stat-valid-rows')).toHaveText('10 valid rows')
    await expect(page.getByTestId('stat-master-rows')).toHaveText('8 master rows')
    await expect(page.getByTestId('stat-conflicts')).toHaveText('2 conflicts')
    await expect(page.getByTestId('stat-issues')).toHaveText('3 issues')

    await expect(page.getByTestId('master-row')).toHaveCount(8)
    await expect(page.getByTestId('issue')).toHaveCount(3)
    await expect(page.getByTestId('issue').first()).toContainText('no asset id')
    await expect(page.getByTestId('issue').nth(1)).toContainText('A-1001')
    await expect(page.getByTestId('issue').nth(2)).toContainText('A-1005')
  })

  test('both strategies keep the same eight assets but resolve an optional field differently', async ({ page }) => {
    await page.goto('/')

    await runReconciliation(page, 'latest-update')
    const latestNote = page.locator('tr[data-asset-id="A-1001"] td[data-field="contactNote"]')
    const latestVolume = page.locator('tr[data-asset-id="A-1001"] td[data-field="monthlyVolume"]')
    await expect(latestNote).toHaveText('')
    await expect(latestVolume).toHaveText('120')
    await expect(page.getByTestId('stat-master-rows')).toHaveText('8 master rows')
    await expect(page.getByTestId('stat-issues')).toHaveText('3 issues')

    await runReconciliation(page, 'most-complete')
    await expect(
      page.locator('tr[data-asset-id="A-1001"] td[data-field="contactNote"]'),
    ).toHaveText('Quarterly review pending')
    await expect(
      page.locator('tr[data-asset-id="A-1001"] td[data-field="monthlyVolume"]'),
    ).toHaveText('125')
    await expect(
      page.locator('tr[data-asset-id="A-1005"] td[data-field="monthlyVolume"]'),
    ).toHaveText('210')
    await expect(page.getByTestId('master-row')).toHaveCount(8)
    await expect(page.getByTestId('stat-master-rows')).toHaveText('8 master rows')
    await expect(page.getByTestId('stat-issues')).toHaveText('3 issues')
  })

  test('shows lineage and resolved conflicts for a selected master row', async ({ page }) => {
    await page.goto('/')
    await runReconciliation(page)

    await expect(page.getByTestId('lineage-empty')).toBeVisible()
    await page.getByTestId('master-row-A-1001').click()

    const lineage = page.getByTestId('lineage')
    await expect(lineage).toBeVisible()
    await expect(lineage).toContainText('NorthBranch.csv row 1')
    await expect(lineage).toContainText('EastBranch.csv row 1')
    await expect(page.getByTestId('lineage-table').locator('tbody tr')).toHaveCount(2)
    await expect(page.getByTestId('conflict')).toHaveCount(3)
    await expect(page.getByTestId('conflict').first()).toContainText('kept')
  })

  test('exports the master model as a nine line CSV', async ({ page }) => {
    await page.goto('/')
    await runReconciliation(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('download-csv').click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('master-model.csv')
    const path = await download.path()
    expect(path).toBeTruthy()
    const csv = await readFile(path as string, 'utf8')
    const lines = csv.split('\n')

    expect(lines).toHaveLength(9)
    expect(lines[0]).toBe('assetId,siteName,region,monthlyVolume,updatedAt,contactNote')
    expect(lines.filter((line) => line.startsWith('A-100'))).toHaveLength(8)
    expect(csv).toContain('"Switchgear upgrade, phase 2"')
    expect(csv).toContain('"Access badge pending, shift ""B"""')
  })

  test('rerunning replaces the result and reset clears it', async ({ page }) => {
    await page.goto('/')
    await runReconciliation(page)
    await expect(page.getByTestId('master-row')).toHaveCount(8)

    await page.getByTestId('run-reconciliation').click()
    await expect(page.getByTestId('master-row')).toHaveCount(8)
    await expect(page.getByTestId('issue')).toHaveCount(3)
    await expect(page.getByTestId('stat-source-rows')).toHaveText('11 source rows')

    await page.getByTestId('reset-lab').click()
    await expect(page.getByTestId('results-empty')).toBeVisible()
    await expect(page.getByTestId('master-table')).toHaveCount(0)
    await expect(page.getByTestId('download-csv')).toBeDisabled()
  })

  test('has no serious or critical accessibility violations', async ({ page }) => {
    await page.goto('/')
    await runReconciliation(page)
    await page.getByTestId('master-row-A-1001').click()

    const results = await new AxeBuilder({ page }).analyze()
    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    )

    expect(
      serious.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(', ')}`),
    ).toEqual([])
  })

  test('does not overflow horizontally at 390px and makes no external request', async ({ page }) => {
    const requests = trackRequests(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await runReconciliation(page)

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

    expect(requests.filter((url) => !isLocal(url))).toEqual([])
  })
})
