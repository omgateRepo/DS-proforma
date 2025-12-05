import { useMemo } from 'react'
import { calculateLoanPreview, formatCurrency } from './carryingHelpers.js'
import type { CarryingCostRow, EntityId, ProjectDetail } from '../../types'

type OffsetFormatter = (offset?: number | null) => string
type IntervalLabelFormatter = (value: string | number | null | undefined) => string

type Props = {
  project: ProjectDetail | null
  projectId: EntityId | null
  formatOffsetForInput: OffsetFormatter
  getCalendarLabelForInput: IntervalLabelFormatter
}

export function ConstructionDebtServiceSection({
  project,
  projectId,
  formatOffsetForInput,
  getCalendarLabelForInput,
}: Props) {
  const loanRows = useMemo(
    () => project?.carryingCosts?.filter((row) => row.carryingType === 'loan') ?? [],
    [project?.carryingCosts],
  )

  if (!project || !projectId) {
    return (
      <section className="carrying-section">
        <p className="muted">Select a project to view debt service.</p>
      </section>
    )
  }

  return (
    <section className="carrying-section">
      <div className="section-header">
        <div>
          <h4>Debt Service</h4>
          <p className="muted tiny">Annualized payments derived from the construction loans entered under funding.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Amount</th>
              <th>Annual Payment</th>
              <th>Funding Month</th>
              <th>First Payment</th>
            </tr>
          </thead>
          <tbody>
            {loanRows.length === 0 && (
              <tr>
                <td colSpan={5}>No debt service loaded yet.</td>
              </tr>
            )}
            {loanRows.map((row) => {
              const preview = calculateLoanPreview(row)
              const annualPayment = preview.monthlyPayment ? preview.monthlyPayment * 12 : null
              return (
                <tr key={row.id}>
                  <td>{row.costName || 'Loan'}</td>
                  <td>{row.loanAmountUsd ? `$${row.loanAmountUsd.toLocaleString()}` : '—'}</td>
                  <td>{annualPayment ? formatCurrency(annualPayment) : '—'}</td>
                  <td>
                    <div className="month-label">
                      <span>{`Month ${formatOffsetForInput(row.fundingMonth ?? 0)}`}</span>
                      <span className="month-calendar">{getCalendarLabelForInput(row.fundingMonth ?? 0)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="month-label">
                      <span>{`Month ${formatOffsetForInput(row.repaymentStartMonth ?? 0)}`}</span>
                      <span className="month-calendar">
                        {getCalendarLabelForInput(row.repaymentStartMonth ?? 0)}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

