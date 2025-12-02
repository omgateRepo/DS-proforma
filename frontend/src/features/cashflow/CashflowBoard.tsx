import { Fragment, useMemo, useState } from 'react'
import { formatCurrencyCell } from './cashflowHelpers.js'

type CashflowMonth = {
  index: number
  label: string
  calendarLabel: string
  year: number
}

type CashflowSubRow = {
  id: string
  label: string
  values: number[]
}

type CashflowRow = {
  id: string
  label: string
  type: 'revenue' | 'expense' | 'total'
  values: number[]
  subRows: CashflowSubRow[]
}

type CashflowView = 'monthly' | 'annual' | 'tax'

type CashflowBoardProps = {
  months: CashflowMonth[]
  rows: CashflowRow[]
  closingMonthLabel: string | null
  expandedRows: Set<string>
  onToggleRow?: (rowId: string) => void
}

export function CashflowBoard({
  months,
  rows,
  closingMonthLabel,
  expandedRows,
  onToggleRow,
}: CashflowBoardProps) {
  const [viewMode, setViewMode] = useState<CashflowView>('monthly')

  const columns = useMemo(() => {
    if (viewMode === 'monthly') {
      return months.map((month) => ({
        id: `m-${month.index}`,
        label: month.label,
        calendarLabel: month.calendarLabel,
        indices: [month.index],
      }))
    }

    const extractYear = (value: string) => {
      const match = value.match(/\b\d{4}\b/)
      return match ? match[0] : null
    }

    const annualColumns: Array<{ id: string; label: string; calendarLabel: string; indices: number[] }> = []
    for (let i = 0; i < months.length; i += 12) {
      const slice = months.slice(i, i + 12)
      if (!slice.length) continue
      const year = Math.floor(i / 12) + 1
      const firstLabel = slice[0].calendarLabel
      const lastLabel = slice[slice.length - 1].calendarLabel
      const firstYear = extractYear(firstLabel)
      const lastYear = extractYear(lastLabel)
      const label =
        firstYear && lastYear
          ? firstYear === lastYear
            ? firstYear
            : `${firstYear}–${lastYear}`
          : `Year ${year}`
      annualColumns.push({
        id: `y-${year}`,
        label,
        calendarLabel: `${firstLabel} – ${lastLabel}`,
        indices: slice.map((m) => m.index),
      })
    }
    if (viewMode === 'annual') {
      return annualColumns
    }

    // Tax year view groups by calendar year boundaries
    const taxColumns: Array<{ id: string; label: string; calendarLabel: string; indices: number[] }> = []
    const byYear = new Map<number, CashflowMonth[]>()
    months.forEach((month) => {
      if (!byYear.has(month.year)) {
        byYear.set(month.year, [])
      }
      byYear.get(month.year)!.push(month)
    })
    Array.from(byYear.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([year, slice]) => {
        const firstLabel = slice[0].calendarLabel
        const lastLabel = slice[slice.length - 1].calendarLabel
        taxColumns.push({
          id: `tax-${year}`,
          label: String(year),
          calendarLabel: `${firstLabel} – ${lastLabel}`,
          indices: slice.map((m) => m.index),
        })
      })
    return taxColumns
  }, [months, viewMode])

  const sumValuesForIndices = (values: number[], indices: number[]) =>
    indices.reduce((sum, idx) => sum + (values[idx] ?? 0), 0)

  return (
    <div className="cashflow-tab">
      <div className="cashflow-header">
        <div>
          <h3>
            Cashflow (
            {viewMode === 'monthly' ? 'Monthly' : viewMode === 'annual' ? 'Annual' : 'Tax Year'} view)
          </h3>
          <p className="muted tiny">
            Starting {closingMonthLabel || 'from the current month'} · toggle to switch between monthly and yearly totals.
          </p>
        </div>
        <div className="view-toggle">
          <label>
            <input
              type="radio"
              name="cashflow-view"
              value="monthly"
              checked={viewMode === 'monthly'}
              onChange={() => setViewMode('monthly')}
            />
            Monthly
          </label>
          <label>
            <input
              type="radio"
              name="cashflow-view"
              value="annual"
              checked={viewMode === 'annual'}
              onChange={() => setViewMode('annual')}
            />
            Annual
          </label>
          <label>
            <input
              type="radio"
              name="cashflow-view"
              value="tax"
              checked={viewMode === 'tax'}
              onChange={() => setViewMode('tax')}
            />
            Tax Years
          </label>
        </div>
      </div>
      <div className="table-scroll">
        <table className="cashflow-grid">
          <thead>
            <tr>
              <th>Category</th>
              {columns.map((column) => (
                <th key={column.id}>
                  <div className="month-label">
                    <span>{column.label}</span>
                    <span className="month-calendar">{column.calendarLabel}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isExpandable = row.subRows && row.subRows.length > 0
              const expanded = isExpandable && expandedRows?.has(row.id)
              return (
                <Fragment key={row.id}>
                  <tr className={`cashflow-row ${row.type}`}>
                    <td>
                      {isExpandable ? (
                        <button type="button" className="cashflow-toggle" onClick={() => onToggleRow?.(row.id)}>
                          <span>{expanded ? '▾' : '▸'}</span>
                          {row.label}
                        </button>
                      ) : (
                        row.label
                      )}
                    </td>
                    {columns.map((column) => (
                      <td key={`${row.id}-${column.id}`}>
                        {formatCurrencyCell(sumValuesForIndices(row.values, column.indices))}
                      </td>
                    ))}
                  </tr>
                  {expanded &&
                    row.subRows.map((subRow) => (
                      <tr key={`${row.id}-${subRow.id}`} className="cashflow-row sub cashflow-sub-row">
                        <td>{subRow.label}</td>
                        {columns.map((column) => (
                          <td key={`${row.id}-${subRow.id}-${column.id}`}>
                            {formatCurrencyCell(sumValuesForIndices(subRow.values, column.indices))}
                          </td>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

