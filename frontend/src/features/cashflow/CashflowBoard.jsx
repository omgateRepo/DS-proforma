import { Fragment } from 'react'
import { formatCurrencyCell } from './cashflowHelpers.js'

export function CashflowBoard({
  months,
  rows,
  closingMonthLabel,
  expandedRows,
  onToggleRow,
}) {
  return (
    <div className="cashflow-tab">
      <div className="cashflow-header">
        <div>
          <h3>Cashflow (60 months)</h3>
          <p className="muted tiny">
            Starting {closingMonthLabel || 'from the current month'} · revenues + hard/soft costs shown (carrying coming
            next)
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="cashflow-grid">
          <thead>
            <tr>
              <th>Category</th>
              {months.map((month) => (
                <th key={month.index}>
                  <div className="month-label">
                    <span>{month.label}</span>
                    <span className="month-calendar">{month.calendarLabel}</span>
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
                    {months.map((month) => (
                      <td key={`${row.id}-${month.index}`}>{formatCurrencyCell(row.values[month.index])}</td>
                    ))}
                  </tr>
                  {expanded &&
                    row.subRows.map((subRow) => (
                      <tr key={`${row.id}-${subRow.id}`} className="cashflow-row sub cashflow-sub-row">
                        <td>{subRow.label}</td>
                        {months.map((month) => (
                          <td key={`${row.id}-${subRow.id}-${month.index}`}>
                            {formatCurrencyCell(subRow.values[month.index])}
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

