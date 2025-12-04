import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { formatZodErrors, gpContributionInputSchema } from '@ds-proforma/types'
import {
  createCarryingCost,
  createGpContribution,
  deleteCarryingCost,
  deleteGpContribution,
  updateCarryingCost,
  updateGpContribution,
} from '../../api.js'
import {
  buildLoanFormFromRow,
  calculateLoanPreview,
  createDefaultLoanForm,
  formatCurrency,
  loanModeLabels,
  loanModeOptions,
} from '../carrying/carryingHelpers.js'
import type {
  CarryingCostRow,
  CarryingType,
  EntityId,
  GpContributionRow,
  LoanMode,
  ProjectDetail,
} from '../../types'

type RequestStatus = 'idle' | 'saving' | 'error'
type FundingModalType = 'gp' | 'loan'

type OffsetFormatter = (offset?: number | null) => string
type CalendarLabelFormatter = (offset: number | null) => string
type CalendarInputFormatter = (value: string | number | null | undefined) => string
type MonthInputConverter = (value: string | number | null | undefined) => number

type FundingProjectSlice = Pick<ProjectDetail, 'gpContributions' | 'carryingCosts' | 'collaborators' | 'owner' | 'ownerId'>

type FundingTabProps = {
  project: FundingProjectSlice | null
  projectId: EntityId | null
  onProjectRefresh?: (projectId: EntityId) => Promise<void>
  formatOffsetForInput: OffsetFormatter
  getCalendarLabelForOffset: CalendarLabelFormatter
  getCalendarLabelForInput: CalendarInputFormatter
  convertMonthInputToOffset: MonthInputConverter
}

type GpContributionFormState = {
  partner: string
  amountUsd: string
  contributionMonth: string
}

type LoanFormState = {
  costName: string
  loanMode: LoanMode
  loanAmountUsd: string
  interestRatePct: string
  loanTermMonths: string
  fundingMonth: string
  repaymentStartMonth: string
}

const parseOptionalNumber = (value: string) => {
  if (value.trim() === '') return null
  return Number(value)
}

const toNumberOrNull = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const createDefaultGpForm = (): GpContributionFormState => ({
  partner: '',
  amountUsd: '',
  contributionMonth: '1',
})

export function FundingTab({
  project,
  projectId,
  onProjectRefresh,
  formatOffsetForInput,
  getCalendarLabelForOffset,
  getCalendarLabelForInput,
  convertMonthInputToOffset,
}: FundingTabProps) {
  const [activeModal, setActiveModal] = useState<FundingModalType | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalStatus, setModalStatus] = useState<RequestStatus>('idle')
  const [modalError, setModalError] = useState('')
  const [gpForm, setGpForm] = useState<GpContributionFormState>(() => createDefaultGpForm())
  const [loanForm, setLoanForm] = useState<LoanFormState>(() => createDefaultLoanForm() as LoanFormState)
  const [editingGpId, setEditingGpId] = useState<EntityId | null>(null)
  const [editingLoanId, setEditingLoanId] = useState<EntityId | null>(null)
  const [pendingGpDeleteId, setPendingGpDeleteId] = useState<EntityId | null>(null)
  const [gpDeleteStatus, setGpDeleteStatus] = useState<RequestStatus>('idle')
  const [gpDeleteError, setGpDeleteError] = useState('')
  const [pendingLoanDelete, setPendingLoanDelete] = useState<CarryingCostRow | null>(null)
  const [loanDeleteStatus, setLoanDeleteStatus] = useState<RequestStatus>('idle')
  const [loanDeleteError, setLoanDeleteError] = useState('')

  const gpRows: GpContributionRow[] = project?.gpContributions ?? []
  const partnerOptions = useMemo(() => {
    if (!project) return []
    const options: { id: string; label: string }[] = []
    if (project.owner?.id) {
      options.push({ id: project.owner.id as string, label: project.owner.displayName || project.owner.email || 'Owner' })
    }
    project.collaborators?.forEach((collab) => {
      if (collab.userId) {
        options.push({ id: collab.userId, label: collab.displayName || collab.email || 'Collaborator' })
      }
    })
    return options
  }, [project])
  const loanRows: CarryingCostRow[] = useMemo(() => {
    if (!project?.carryingCosts) return []
    return project.carryingCosts.filter((row) => row.carryingType === 'loan')
  }, [project?.carryingCosts])

  const loanLabelMap = loanModeLabels as Record<LoanMode, string>

  const totalGpContributions = useMemo(
    () => gpRows.reduce((sum, row) => sum + (row.amountUsd || 0), 0),
    [gpRows],
  )

  const totalMonthlyLoanPayments = useMemo(() => {
    return loanRows.reduce((sum, row) => {
      const preview = calculateLoanPreview(row)
      return sum + (preview.monthlyPayment || 0)
    }, 0)
  }, [loanRows])

  const refreshProject = async () => {
    if (!projectId || !onProjectRefresh) return
    await onProjectRefresh(projectId)
  }

  const resetForms = useCallback(() => {
    setGpForm(createDefaultGpForm())
    setLoanForm(createDefaultLoanForm() as LoanFormState)
    setEditingGpId(null)
    setEditingLoanId(null)
    setModalStatus('idle')
    setModalError('')
  }, [])

  useEffect(() => {
    resetForms()
    setActiveModal(null)
    setIsModalOpen(false)
    setPendingGpDeleteId(null)
    setGpDeleteError('')
    setGpDeleteStatus('idle')
    setPendingLoanDelete(null)
    setLoanDeleteError('')
    setLoanDeleteStatus('idle')
  }, [projectId, resetForms])

  const openModal = (type: FundingModalType, row?: GpContributionRow | CarryingCostRow | null) => {
    setActiveModal(type)
    setIsModalOpen(true)
    setModalStatus('idle')
    setModalError('')
    if (type === 'gp') {
      const gpRow = row as GpContributionRow | null
      if (gpRow) {
        setGpForm({
          partner: gpRow.partner || '',
          amountUsd: gpRow.amountUsd ? String(gpRow.amountUsd) : '',
          contributionMonth: formatOffsetForInput(gpRow.contributionMonth ?? 0),
        })
      } else {
        setGpForm(createDefaultGpForm())
      }
      setEditingGpId(gpRow?.id || null)
      setEditingLoanId(null)
    } else {
      const loanRow = row && 'carryingType' in (row as CarryingCostRow) ? (row as CarryingCostRow) : null
      if (loanRow) {
        setLoanForm(buildLoanFormFromRow(loanRow, formatOffsetForInput) as LoanFormState)
      } else {
        setLoanForm(createDefaultLoanForm() as LoanFormState)
      }
      setEditingLoanId(loanRow?.id || null)
      setEditingGpId(null)
    }
  }

  const closeModal = () => {
    if (modalStatus === 'saving') return
    setIsModalOpen(false)
    setActiveModal(null)
    resetForms()
  }

  const buildGpPayload = () => ({
    partner: gpForm.partner || null,
    amountUsd: parseOptionalNumber(gpForm.amountUsd),
    contributionMonth: convertMonthInputToOffset(gpForm.contributionMonth),
  })

  const requireMonth = (value: string, label: string) => {
    if (!value) throw new Error(label)
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
    const repaymentStartMonth = requireMonth(loanForm.repaymentStartMonth, 'Repayment start month is required.')

    if (fundingMonth > repaymentStartMonth) {
      throw new Error('Funding month cannot be after the first payment month.')
    }

    return {
      carryingType: 'loan' as CarryingType,
      costName: loanForm.costName.trim() || 'Loan',
      loanMode: loanForm.loanMode,
      loanAmountUsd: amount,
      interestRatePct: rate,
      loanTermMonths: term,
      fundingMonth,
      repaymentStartMonth,
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId || !activeModal) return
    setModalStatus('saving')
    setModalError('')

    try {
      if (activeModal === 'gp') {
        const payload = buildGpPayload()
        const validation = gpContributionInputSchema.safeParse(payload)
        if (!validation.success) {
          throw new Error(formatZodErrors(validation.error))
        }
        if (editingGpId) {
          await updateGpContribution(projectId, editingGpId, validation.data)
        } else {
          await createGpContribution(projectId, validation.data)
        }
      } else {
        const payload = buildLoanPayload()
        if (editingLoanId) {
          await updateCarryingCost(projectId, editingLoanId, payload)
        } else {
          await createCarryingCost(projectId, payload)
        }
      }
      setModalStatus('idle')
      setIsModalOpen(false)
      resetForms()
      await refreshProject()
    } catch (err) {
      setModalStatus('error')
      setModalError(getErrorMessage(err))
    }
  }

  const handleDeleteGp = (id: EntityId) => {
    if (!projectId) return
    setGpDeleteError('')
    setPendingGpDeleteId(id)
  }

  const confirmDeleteGp = async () => {
    if (!projectId || !pendingGpDeleteId) return
    setGpDeleteStatus('saving')
    setGpDeleteError('')
    try {
      await deleteGpContribution(projectId, pendingGpDeleteId)
      setPendingGpDeleteId(null)
      setGpDeleteStatus('idle')
      await refreshProject()
    } catch (err) {
      setGpDeleteStatus('error')
      setGpDeleteError(getErrorMessage(err))
    }
  }

  const cancelDeleteGp = () => {
    if (gpDeleteStatus === 'saving') return
    setPendingGpDeleteId(null)
    setGpDeleteError('')
    setGpDeleteStatus('idle')
  }

  const handleDeleteLoan = (row: CarryingCostRow) => {
    if (!projectId) return
    setLoanDeleteError('')
    setPendingLoanDelete(row)
  }

  const confirmDeleteLoan = async () => {
    if (!projectId || !pendingLoanDelete) return
    setLoanDeleteStatus('saving')
    setLoanDeleteError('')
    try {
      await deleteCarryingCost(projectId, pendingLoanDelete.id)
      setPendingLoanDelete(null)
      setLoanDeleteStatus('idle')
      await refreshProject()
    } catch (err) {
      setLoanDeleteStatus('error')
      setLoanDeleteError(getErrorMessage(err))
    }
  }

  const cancelDeleteLoan = () => {
    if (loanDeleteStatus === 'saving') return
    setPendingLoanDelete(null)
    setLoanDeleteError('')
    setLoanDeleteStatus('idle')
  }

  const formatMonthDisplay = (offset?: number | null) => {
    const normalized = offset ?? 0
    const monthLabel = formatOffsetForInput(normalized)
    const calendarHint = getCalendarLabelForOffset(normalized)
    return (
      <div className="month-label">
        <span>{`Month ${monthLabel}`}</span>
        <span className="month-calendar">{calendarHint}</span>
      </div>
    )
  }

  if (!project || !projectId) {
    return (
      <div className="funding-tab">
        <p className="muted">Select a project to manage funding assumptions.</p>
      </div>
    )
  }

  return (
    <>
      <div className="funding-tab">
        <div className="funding-header">
          <h3>Funding</h3>
          <p className="muted tiny">Track equity injections and construction loans in one place.</p>
        </div>

        <div className="funding-sections">
          <section className="funding-section">
            <div className="section-header">
              <div>
                <h4>GP Contributions</h4>
                <p className="muted tiny">One-time capital infusions from sponsors.</p>
              </div>
              <button type="button" className="primary" onClick={() => openModal('gp')}>
                + Add Contribution
              </button>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Amount (USD)</th>
                    <th>Month</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {gpRows.map((row) => {
                    const collaborator = project?.collaborators?.find((collab) => collab.userId === row.partner)
                    const ownerLabel =
                      project?.ownerId === row.partner ? project.owner?.displayName || project.owner?.email : null
                    const partnerLabel =
                      collaborator?.displayName || collaborator?.email || ownerLabel || row.partner || 'GP'
                    return (
                      <tr key={row.id}>
                        <td>{partnerLabel}</td>
                        <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                        <td>
                          <div className="month-label">
                            <span>{`Month ${formatOffsetForInput(row.contributionMonth ?? 0)}`}</span>
                            <span className="month-calendar">{getCalendarLabelForOffset(row.contributionMonth ?? 0)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="icon-button" onClick={() => openModal('gp', row)}>
                              ✏️
                            </button>
                            <button type="button" className="icon-delete" onClick={() => handleDeleteGp(row.id)}>
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {gpRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>No GP contributions yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="funding-section">
            <div className="section-header">
              <div>
                <h4>Loans</h4>
                <p className="muted tiny">Funding month injects proceeds; repayment drives the cashflow automatically.</p>
              </div>
              <button type="button" className="primary" onClick={() => openModal('loan')}>
                + Add Loan
              </button>
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
                            <button type="button" className="icon-button" onClick={() => openModal('loan', row)}>
                              ✏️
                            </button>
                            <button type="button" className="icon-delete" onClick={() => handleDeleteLoan(row)}>
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
        </div>

        <div className="funding-summary">
          <div>
            <span>Total GP Contributions</span>
            <strong>{formatCurrency(totalGpContributions)}</strong>
          </div>
          <div>
            <span>Monthly Loan Payments</span>
            <strong>{formatCurrency(totalMonthlyLoanPayments)}</strong>
          </div>
        </div>
      </div>

      {isModalOpen && activeModal && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>{editingGpId || editingLoanId ? 'Edit' : 'Add'} {activeModal === 'gp' ? 'GP Contribution' : 'Loan'}</h3>
            <form className="modal-form" onSubmit={handleSubmit}>
              {activeModal === 'gp' ? (
                <>
                  <label>
                    Partner
                    <select value={gpForm.partner} onChange={(e) => setGpForm((prev) => ({ ...prev, partner: e.target.value }))}>
                      <option value="">Select partner</option>
                      {partnerOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Amount (USD)
                    <input
                      type="number"
                      value={gpForm.amountUsd}
                      onChange={(e) => setGpForm((prev) => ({ ...prev, amountUsd: e.target.value }))}
                    />
                  </label>
                  <label>
                    Contribution Month
                    <input
                      type="number"
                      min="1"
                      value={gpForm.contributionMonth}
                      onChange={(e) => setGpForm((prev) => ({ ...prev, contributionMonth: e.target.value }))}
                    />
                    <span className="muted tiny">{getCalendarLabelForInput(gpForm.contributionMonth)}</span>
                  </label>
                </>
              ) : (
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
              )}
              {modalError && <p className="error">{modalError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeModal} disabled={modalStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={modalStatus === 'saving'}>
                  {modalStatus === 'saving' ? 'Saving…' : editingGpId || editingLoanId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingGpDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete GP contribution?</h3>
            {gpDeleteError && <p className="error">{gpDeleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteGp} disabled={gpDeleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="icon-delete" onClick={confirmDeleteGp} disabled={gpDeleteStatus === 'saving'}>
                {gpDeleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingLoanDelete && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete loan?</h3>
            <p className="muted tiny">{pendingLoanDelete.costName || 'Loan'} will be removed from the cashflow.</p>
            {loanDeleteError && <p className="error">{loanDeleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteLoan} disabled={loanDeleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="icon-delete" onClick={confirmDeleteLoan} disabled={loanDeleteStatus === 'saving'}>
                {loanDeleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

