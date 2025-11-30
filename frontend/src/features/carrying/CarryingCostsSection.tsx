import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createCarryingCost, deleteCarryingCost, updateCarryingCost } from '../../api.js'
import {
  buildLoanFormFromRow,
  buildRecurringFormFromRow,
  calculateLoanPreview,
  calculateRecurringAverage,
  carryingMenuOptions,
  createDefaultLoanForm,
  createDefaultRecurringForm,
  formatCurrency,
  intervalLabels,
  intervalUnitOptions,
  loanModeLabels,
  loanModeOptions,
  propertyTaxPhaseLabels,
  propertyTaxPhaseOptions,
} from './carryingHelpers.js'
import type {
  CarryingCostRow,
  CarryingType,
  EntityId,
  IntervalUnit,
  LoanMode,
  ProjectDetail,
  PropertyTaxPhase,
} from '../../types'

type RequestStatus = 'idle' | 'saving' | 'error'

type OffsetFormatter = (offset?: number | null) => string
type MonthOffsetConverter = (value: string | number | null | undefined) => number
type CalendarLabelFormatter = (value: string | number | null | undefined) => string

type LoanFormState = {
  costName: string
  loanMode: LoanMode
  loanAmountUsd: string
  interestRatePct: string
  loanTermMonths: string
  fundingMonth: string
  repaymentStartMonth: string
}

type RecurringFormState = {
  costName: string
  amountUsd: string
  intervalUnit: IntervalUnit
  startMonth: string
  endMonth: string
  propertyTaxPhase?: PropertyTaxPhase
}

type RecurringPayload = {
  carryingType: CarryingType
  costName: string
  amountUsd: number
  intervalUnit: IntervalUnit
  startMonth: number
  endMonth: number | null
  propertyTaxPhase?: PropertyTaxPhase
}

type CarryingCostsSectionProps = {
  project: ProjectDetail | null
  projectId: EntityId | null
  onProjectRefresh?: (projectId: EntityId) => Promise<void>
  formatOffsetForInput: OffsetFormatter
  convertMonthInputToOffset: MonthOffsetConverter
  getCalendarLabelForInput: CalendarLabelFormatter
}

const toNumberOrNull = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (Number.isNaN(parsed)) return null
  return parsed
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
const loanLabelMap = loanModeLabels as Record<LoanMode, string>
const intervalLabelMap = intervalLabels as Record<IntervalUnit, string>
const propertyPhaseLabelMap = propertyTaxPhaseLabels as Record<PropertyTaxPhase, string>
const DEFAULT_PROPERTY_TAX_PHASE: PropertyTaxPhase = 'construction'

export function CarryingCostsSection({
  project,
  projectId,
  onProjectRefresh,
  formatOffsetForInput,
  convertMonthInputToOffset,
  getCalendarLabelForInput,
}: CarryingCostsSectionProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<CarryingType | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loanForm, setLoanForm] = useState<LoanFormState>(createDefaultLoanForm() as LoanFormState)
  const [propertyForm, setPropertyForm] = useState<RecurringFormState>(() =>
    createDefaultRecurringForm('property_tax', {
      propertyTaxPhase: DEFAULT_PROPERTY_TAX_PHASE,
    }) as RecurringFormState,
  )
  const [managementForm, setManagementForm] = useState<RecurringFormState>(
    () => createDefaultRecurringForm('management') as RecurringFormState,
  )
  const [editingId, setEditingId] = useState<EntityId | null>(null)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [modalError, setModalError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<CarryingCostRow | null>(null)
  const [deleteStatus, setDeleteStatus] = useState<RequestStatus>('idle')
  const [deleteError, setDeleteError] = useState('')
  const addMenuRef = useRef<HTMLDivElement | null>(null)

  const carryingRows: CarryingCostRow[] = project?.carryingCosts ?? []

  const isLoanRow = (row: CarryingCostRow): row is CarryingCostRow & { carryingType: 'loan' } =>
    row.carryingType === 'loan'
  const isPropertyRow = (row: CarryingCostRow): row is CarryingCostRow & { carryingType: 'property_tax' } =>
    row.carryingType === 'property_tax'
  const isManagementRow = (row: CarryingCostRow): row is CarryingCostRow & { carryingType: 'management' } =>
    row.carryingType === 'management'

  const loanRows = useMemo(() => carryingRows.filter(isLoanRow), [carryingRows])
  const propertyRows = useMemo(() => carryingRows.filter(isPropertyRow), [carryingRows])
  const managementRows = useMemo(() => carryingRows.filter(isManagementRow), [carryingRows])
  const { missingPropertyPhases, nextPropertyPhase } = useMemo(() => {
    const used = new Set<PropertyTaxPhase>()
    propertyRows.forEach((row) => {
      if (row.propertyTaxPhase) {
        used.add(row.propertyTaxPhase as PropertyTaxPhase)
      }
    })
    const missing = propertyTaxPhaseOptions.filter((option) => !used.has(option.id as PropertyTaxPhase))
    const nextPhase = (missing[0]?.id ?? DEFAULT_PROPERTY_TAX_PHASE) as PropertyTaxPhase
    return { missingPropertyPhases: missing, nextPropertyPhase: nextPhase }
  }, [propertyRows])

  const totalMonthlyLoans = useMemo(() => {
    return loanRows.reduce((sum, row) => sum + Math.max(calculateLoanPreview(row).monthlyPayment || 0, 0), 0)
  }, [loanRows])

  const totalMonthlyRecurring = useMemo(() => {
    return [...propertyRows, ...managementRows].reduce((sum, row) => sum + (calculateRecurringAverage(row) || 0), 0)
  }, [propertyRows, managementRows])

  const totalMonthlyCarrying = totalMonthlyLoans + totalMonthlyRecurring

  const resetForms = useCallback(() => {
    setLoanForm(createDefaultLoanForm() as LoanFormState)
    setPropertyForm(
      createDefaultRecurringForm('property_tax', { propertyTaxPhase: nextPropertyPhase }) as RecurringFormState,
    )
    setManagementForm(createDefaultRecurringForm('management') as RecurringFormState)
    setEditingId(null)
    setModalError('')
    setStatus('idle')
  }, [nextPropertyPhase])

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (!addMenuRef.current) return
      if (event.target instanceof Node && addMenuRef.current.contains(event.target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  useEffect(() => {
    resetForms()
    setMenuOpen(false)
    setPendingDelete(null)
    setDeleteError('')
    setDeleteStatus('idle')
    setIsModalOpen(false)
    setActiveModal(null)
  }, [projectId, resetForms])

  if (!project || !projectId) {
    return (
      <div className="carrying-tab">
        <p className="muted">Select a project to manage carrying costs.</p>
      </div>
    )
  }

  const refreshProject = async () => {
    if (!projectId || !onProjectRefresh) return
    await onProjectRefresh(projectId)
  }

  const openModal = (type: CarryingType, row: CarryingCostRow | null = null) => {
    setActiveModal(type)
    setIsModalOpen(true)
    setModalError('')
    setStatus('idle')
    if (type === 'loan') {
      setLoanForm(
        row
          ? (buildLoanFormFromRow(row, formatOffsetForInput) as LoanFormState)
          : (createDefaultLoanForm() as LoanFormState),
      )
    } else if (type === 'property_tax') {
      setPropertyForm(
        row
          ? (buildRecurringFormFromRow(row, formatOffsetForInput) as RecurringFormState)
          : (createDefaultRecurringForm('property_tax', { propertyTaxPhase: nextPropertyPhase }) as RecurringFormState),
      )
    } else {
      setManagementForm(
        row
          ? (buildRecurringFormFromRow(row, formatOffsetForInput) as RecurringFormState)
          : (createDefaultRecurringForm('management') as RecurringFormState),
      )
    }
    setEditingId(row?.id || null)
  }

  const closeModal = () => {
    if (status === 'saving') return
    setIsModalOpen(false)
    setActiveModal(null)
    resetForms()
  }

  const requireMonth = (value: string, message: string) => {
    if (!value) throw new Error(message)
    return convertMonthInputToOffset(value)
  }

  const buildLoanPayload = () => {
    const amount = toNumberOrNull(loanForm.loanAmountUsd)
    if (amount === null) throw new Error('Loan amount is required.')

    const rate = toNumberOrNull(loanForm.interestRatePct)
    if (rate === null) throw new Error('Interest rate is required.')

    const term = toNumberOrNull(loanForm.loanTermMonths)
    if (term === null || term <= 0) throw new Error('Loan term (months) must be greater than 0.')

    const fundingMonth = requireMonth(loanForm.fundingMonth, 'Funding month is required.')
    const repaymentMonth = requireMonth(loanForm.repaymentStartMonth, 'First payment month is required.')
    if (repaymentMonth < fundingMonth) {
      throw new Error('First payment month cannot be before the funding month.')
    }

    return {
      carryingType: 'loan',
      costName: loanForm.costName.trim() || 'Loan',
      loanMode: loanForm.loanMode,
      loanAmountUsd: amount,
      interestRatePct: rate,
      loanTermMonths: Math.trunc(term),
      fundingMonth,
      repaymentStartMonth: repaymentMonth,
    }
  }

  const buildRecurringPayload = (type: CarryingType) => {
    const form = type === 'property_tax' ? propertyForm : managementForm
    const amount = toNumberOrNull(form.amountUsd)
    if (amount === null) throw new Error('Amount is required.')
    const startMonth = requireMonth(form.startMonth, 'Start month is required.')
    const payload: RecurringPayload = {
      carryingType: type,
      costName: form.costName.trim() || (type === 'property_tax' ? 'Property Tax' : 'Management Fee'),
      amountUsd: amount,
      intervalUnit: form.intervalUnit,
      startMonth,
      endMonth: form.endMonth ? convertMonthInputToOffset(form.endMonth) : null,
    }
    if (payload.endMonth !== null && payload.endMonth < startMonth) {
      throw new Error('End month cannot be earlier than start month.')
    }
    if (type === 'property_tax') {
      const propertyTaxPhase = form.propertyTaxPhase || nextPropertyPhase
      payload.propertyTaxPhase = propertyTaxPhase
    }
    return payload
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId || !activeModal) return
    setStatus('saving')
    setModalError('')
    try {
      const payload = activeModal === 'loan' ? buildLoanPayload() : buildRecurringPayload(activeModal)

      if (editingId) {
        await updateCarryingCost(projectId, editingId, payload)
      } else {
        await createCarryingCost(projectId, payload)
      }
      await refreshProject()
      setStatus('idle')
      setIsModalOpen(false)
      setActiveModal(null)
      resetForms()
    } catch (err) {
      setStatus('error')
      setModalError(getErrorMessage(err))
    }
  }

  const handleDelete = (row: CarryingCostRow) => {
    setPendingDelete(row)
    setDeleteError('')
    setDeleteStatus('idle')
  }

  const confirmDelete = async () => {
    if (!projectId || !pendingDelete) return
    setDeleteStatus('saving')
    setDeleteError('')
    try {
      await deleteCarryingCost(projectId, pendingDelete.id)
      setPendingDelete(null)
      await refreshProject()
      setDeleteStatus('idle')
    } catch (err) {
      setDeleteStatus('error')
      setDeleteError(getErrorMessage(err))
    }
  }

  const cancelDelete = () => {
    if (deleteStatus === 'saving') return
    setPendingDelete(null)
    setDeleteError('')
  }

  const startEdit = (row: CarryingCostRow) => {
    openModal(row.carryingType, row)
  }

  const formatMonthDisplay = (offset?: number | null) => {
    const normalized = offset ?? 0
    const monthLabel = formatOffsetForInput(normalized)
    const calendarHint = getCalendarLabelForInput(normalized)
    return (
      <div className="month-label">
        <span>{`Month ${monthLabel}`}</span>
        <span className="month-calendar">{calendarHint}</span>
      </div>
    )
  }

  const renderLoanTable = () => (
    <section className="carrying-section">
      <div className="section-header">
        <h4>Loans</h4>
        <p className="muted tiny">Funding month injects the proceeds; cashflow shows interest and principal separately.</p>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Rate</th>
              <th>Term (mo)</th>
              <th>Funding</th>
              <th>First Payment</th>
              <th>Monthly Payment</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loanRows.length === 0 && (
              <tr>
                <td colSpan={9}>No loans yet.</td>
              </tr>
            )}
            {loanRows.map((row) => {
              const preview = calculateLoanPreview(row)
              return (
                <tr key={row.id}>
                  <td>{row.costName || 'Loan'}</td>
                  <td>{row.loanMode ? loanLabelMap[row.loanMode] || row.loanMode : '—'}</td>
                  <td>{row.loanAmountUsd ? `$${row.loanAmountUsd.toLocaleString()}` : '—'}</td>
                  <td>{row.interestRatePct ? `${row.interestRatePct}%` : '—'}</td>
                  <td>{row.loanTermMonths || '—'}</td>
                  <td>{formatMonthDisplay(row.fundingMonth)}</td>
                  <td>{formatMonthDisplay(row.repaymentStartMonth)}</td>
                  <td>{preview.monthlyPayment ? formatCurrency(preview.monthlyPayment) : '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="icon-button" onClick={() => startEdit(row)}>
                        ✏️
                      </button>
                      <button type="button" className="icon-delete" onClick={() => handleDelete(row)}>
                        🗑
                      </button>
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

  const renderPropertyTaxTable = () => (
    <section className="carrying-section">
      <div className="section-header">
        <h4>Property Tax</h4>
        <p className="muted tiny">
          Track Construction vs Stabilized separately. Construction feeds loan sizing; Stabilized flows into metrics/NOI.
        </p>
        {missingPropertyPhases.length > 0 && (
          <p className="muted tiny">
            Missing phases: {missingPropertyPhases.map((phase) => phase.label).join(' & ')}.
          </p>
        )}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Phase</th>
              <th>Title</th>
              <th>Amount</th>
              <th>Interval</th>
              <th>Start Month</th>
              <th>End Month</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {propertyRows.length === 0 && (
              <tr>
                <td colSpan={7}>No property tax items yet.</td>
              </tr>
            )}
            {propertyRows.map((row) => {
              const phase = (row.propertyTaxPhase as PropertyTaxPhase | undefined) ?? null
              const phaseLabel = phase ? propertyPhaseLabelMap[phase] : 'Unassigned'
              const intervalLabel = row.intervalUnit ? intervalLabelMap[row.intervalUnit] : null
              return (
                <tr key={row.id}>
                  <td>{phaseLabel}</td>
                  <td>{row.costName || phaseLabel}</td>
                  <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                  <td>{intervalLabel || row.intervalUnit || '—'}</td>
                  <td>{formatMonthDisplay(row.startMonth)}</td>
                  <td>{row.endMonth !== null && row.endMonth !== undefined ? formatMonthDisplay(row.endMonth) : 'Ongoing'}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="icon-button" onClick={() => startEdit(row)}>
                        ✏️
                      </button>
                      <button type="button" className="icon-delete" onClick={() => handleDelete(row)}>
                        🗑
                      </button>
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

  const renderRecurringTable = (rows: CarryingCostRow[], title: string) => (
    <section className="carrying-section">
      <div className="section-header">
        <h4>{title}</h4>
        <p className="muted tiny">Recurring expense with configurable interval.</p>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Amount</th>
              <th>Interval</th>
              <th>Start Month</th>
              <th>End Month</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>No items yet.</td>
              </tr>
            )}
            {rows.map((row) => {
              const intervalLabel = row.intervalUnit ? intervalLabelMap[row.intervalUnit] : null
              return (
              <tr key={row.id}>
                <td>{row.costName || title}</td>
                <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                  <td>{intervalLabel || row.intervalUnit || '—'}</td>
                <td>{formatMonthDisplay(row.startMonth)}</td>
                <td>{row.endMonth !== null && row.endMonth !== undefined ? formatMonthDisplay(row.endMonth) : 'Ongoing'}</td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="icon-button" onClick={() => startEdit(row)}>
                      ✏️
                    </button>
                    <button type="button" className="icon-delete" onClick={() => handleDelete(row)}>
                      🗑
                    </button>
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

  const renderModalBody = () => {
    if (activeModal === 'loan') {
      return (
        <>
          <label>
            Loan Title
            <input type="text" value={loanForm.costName} onChange={(e) => setLoanForm((prev) => ({ ...prev, costName: e.target.value }))} />
          </label>
          <label>
            Loan Type
            <select
              value={loanForm.loanMode}
              onChange={(e) => setLoanForm((prev) => ({ ...prev, loanMode: e.target.value as LoanMode }))}
            >
              {loanModeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Loan Amount (USD)
            <input
              type="number"
              value={loanForm.loanAmountUsd}
              onChange={(e) => setLoanForm((prev) => ({ ...prev, loanAmountUsd: e.target.value }))}
            />
          </label>
          <label>
            Interest Rate (%)
            <input
              type="number"
              step="0.01"
              value={loanForm.interestRatePct}
              onChange={(e) => setLoanForm((prev) => ({ ...prev, interestRatePct: e.target.value }))}
            />
          </label>
          <label>
            Term (months)
            <input
              type="number"
              value={loanForm.loanTermMonths}
              onChange={(e) => setLoanForm((prev) => ({ ...prev, loanTermMonths: e.target.value }))}
            />
          </label>
          <label>
            Funding Month
            <input
              type="number"
              min="1"
              value={loanForm.fundingMonth}
              onChange={(e) => setLoanForm((prev) => ({ ...prev, fundingMonth: e.target.value }))}
            />
            <span className="muted tiny">{getCalendarLabelForInput(loanForm.fundingMonth)}</span>
          </label>
          <label>
            First Payment Month
            <input
              type="number"
              min="1"
              value={loanForm.repaymentStartMonth}
              onChange={(e) => setLoanForm((prev) => ({ ...prev, repaymentStartMonth: e.target.value }))}
            />
            <span className="muted tiny">{getCalendarLabelForInput(loanForm.repaymentStartMonth)}</span>
          </label>
        </>
      )
    }

    const isPropertyModal = activeModal === 'property_tax'
    const form = isPropertyModal ? propertyForm : managementForm
    const setter = isPropertyModal ? setPropertyForm : setManagementForm
    const selectedPhase = (form.propertyTaxPhase as PropertyTaxPhase | undefined) ?? nextPropertyPhase

    return (
      <>
        {isPropertyModal && (
          <label>
            Tax Phase
            <select
              value={selectedPhase}
              onChange={(e) => {
                const phase = e.target.value as PropertyTaxPhase
                setter((prev) => {
                  const prevPhase = prev.propertyTaxPhase as PropertyTaxPhase | undefined
                  const prevDefault = prevPhase ? propertyPhaseLabelMap[prevPhase] : ''
                  const nextDefault = propertyPhaseLabelMap[phase]
                  const shouldResetTitle = !prev.costName || prev.costName === prevDefault
                  return {
                    ...prev,
                    propertyTaxPhase: phase,
                    costName: shouldResetTitle ? nextDefault : prev.costName,
                  }
                })
              }}
            >
              {propertyTaxPhaseOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Title
          <input type="text" value={form.costName} onChange={(e) => setter((prev) => ({ ...prev, costName: e.target.value }))} />
        </label>
        <label>
          Amount (per interval)
          <input
            type="number"
            value={form.amountUsd}
            onChange={(e) => setter((prev) => ({ ...prev, amountUsd: e.target.value }))}
          />
        </label>
        <label>
          Interval
          <select
            value={form.intervalUnit}
            onChange={(e) => setter((prev) => ({ ...prev, intervalUnit: e.target.value as IntervalUnit }))}
          >
            {intervalUnitOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start Month
          <input
            type="number"
            min="1"
            value={form.startMonth}
            onChange={(e) => setter((prev) => ({ ...prev, startMonth: e.target.value }))}
          />
          <span className="muted tiny">{getCalendarLabelForInput(form.startMonth)}</span>
        </label>
        <label>
          End Month (optional)
          <input
            type="number"
            min="1"
            value={form.endMonth}
            onChange={(e) => setter((prev) => ({ ...prev, endMonth: e.target.value }))}
          />
          {form.endMonth && <span className="muted tiny">{getCalendarLabelForInput(form.endMonth)}</span>}
        </label>
      </>
    )
  }

  return (
    <>
      <div className="carrying-tab">
        <div className="carrying-header">
          <h3>Carrying Costs</h3>
          <div className="add-menu" ref={addMenuRef}>
            <button type="button" className="primary" onClick={() => setMenuOpen((prev) => !prev)}>
              + Add
            </button>
            {menuOpen && (
              <div className="add-menu-dropdown">
                {carryingMenuOptions.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => {
                      setMenuOpen(false)
                      openModal(option.id as CarryingType)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {renderLoanTable()}
        {renderPropertyTaxTable()}
        {renderRecurringTable(managementRows, 'Management Fees')}

        <div className="carrying-summary">
          <span>Estimated recurring monthly carrying costs</span>
          <strong>{formatCurrency(totalMonthlyCarrying)}</strong>
        </div>
      </div>

      {isModalOpen && activeModal && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>
              {editingId ? 'Edit' : 'Add'}{' '}
              {activeModal === 'loan' ? 'Loan' : activeModal === 'property_tax' ? 'Property Tax' : 'Management Fee'}
            </h3>
            <form className="modal-form" onSubmit={handleSubmit}>
              {renderModalBody()}
              {modalError && <p className="error">{modalError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeModal} disabled={status === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={status === 'saving'}>
                  {status === 'saving' ? 'Saving…' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete carrying cost?</h3>
            <p>
              {pendingDelete.costName || 'This item'} will be removed from carrying costs. This cannot be undone.
            </p>
            {deleteError && <p className="error">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDelete} disabled={deleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDelete} disabled={deleteStatus === 'saving'}>
                {deleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

