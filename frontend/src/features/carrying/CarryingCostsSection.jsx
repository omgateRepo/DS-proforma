import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
} from './carryingHelpers.js'

const toNumberOrNull = (value) => {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (Number.isNaN(parsed)) return null
  return parsed
}

export function CarryingCostsSection({
  project,
  projectId,
  onProjectRefresh,
  formatOffsetForInput,
  convertMonthInputToOffset,
  getCalendarLabelForInput,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loanForm, setLoanForm] = useState(createDefaultLoanForm)
  const [propertyForm, setPropertyForm] = useState(() => createDefaultRecurringForm('property_tax'))
  const [managementForm, setManagementForm] = useState(() => createDefaultRecurringForm('management'))
  const [editingId, setEditingId] = useState(null)
  const [status, setStatus] = useState('idle')
  const [modalError, setModalError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleteStatus, setDeleteStatus] = useState('idle')
  const [deleteError, setDeleteError] = useState('')
  const addMenuRef = useRef(null)

  const carryingRows = project?.carryingCosts || []
  const loanRows = useMemo(() => carryingRows.filter((row) => row.carryingType === 'loan'), [carryingRows])
  const propertyRows = useMemo(
    () => carryingRows.filter((row) => row.carryingType === 'property_tax'),
    [carryingRows],
  )
  const managementRows = useMemo(
    () => carryingRows.filter((row) => row.carryingType === 'management'),
    [carryingRows],
  )

  const totalMonthlyLoans = useMemo(() => {
    return loanRows.reduce((sum, row) => sum + Math.max(calculateLoanPreview(row).monthlyPayment || 0, 0), 0)
  }, [loanRows])

  const totalMonthlyRecurring = useMemo(() => {
    return [...propertyRows, ...managementRows].reduce((sum, row) => sum + (calculateRecurringAverage(row) || 0), 0)
  }, [propertyRows, managementRows])

  const totalMonthlyCarrying = totalMonthlyLoans + totalMonthlyRecurring

  const resetForms = useCallback(() => {
    setLoanForm(createDefaultLoanForm())
    setPropertyForm(createDefaultRecurringForm('property_tax'))
    setManagementForm(createDefaultRecurringForm('management'))
    setEditingId(null)
    setModalError('')
    setStatus('idle')
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (event) => {
      if (!addMenuRef.current) return
      if (addMenuRef.current.contains(event.target)) return
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

  const openModal = (type, row = null) => {
    setActiveModal(type)
    setIsModalOpen(true)
    setModalError('')
    setStatus('idle')
    if (type === 'loan') {
      setLoanForm(row ? buildLoanFormFromRow(row, formatOffsetForInput) : createDefaultLoanForm())
    } else if (type === 'property_tax') {
      setPropertyForm(row ? buildRecurringFormFromRow(row, formatOffsetForInput) : createDefaultRecurringForm('property_tax'))
    } else {
      setManagementForm(row ? buildRecurringFormFromRow(row, formatOffsetForInput) : createDefaultRecurringForm('management'))
    }
    setEditingId(row?.id || null)
  }

  const closeModal = () => {
    if (status === 'saving') return
    setIsModalOpen(false)
    setActiveModal(null)
    resetForms()
  }

  const requireMonth = (value, message) => {
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

  const buildRecurringPayload = (type) => {
    const form = type === 'property_tax' ? propertyForm : managementForm
    const amount = toNumberOrNull(form.amountUsd)
    if (amount === null) throw new Error('Amount is required.')
    const startMonth = requireMonth(form.startMonth, 'Start month is required.')
    const payload = {
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
    return payload
  }

  const handleSubmit = async (event) => {
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
      setModalError(err.message)
    }
  }

  const handleDelete = (row) => {
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
      setDeleteError(err.message)
    }
  }

  const cancelDelete = () => {
    if (deleteStatus === 'saving') return
    setPendingDelete(null)
    setDeleteError('')
  }

  const startEdit = (row) => {
    openModal(row.carryingType, row)
  }

  const formatMonthDisplay = (offset) => (
    <div className="month-label">
      <span>{`Month ${formatOffsetForInput(offset ?? 0)}`}</span>
      <span className="month-calendar">{getCalendarLabelForInput(formatOffsetForInput(offset ?? 0))}</span>
    </div>
  )

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
                  <td>{loanModeLabels[row.loanMode] || row.loanMode || '—'}</td>
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

  const renderRecurringTable = (rows, title) => (
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
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.costName || title}</td>
                <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                <td>{intervalLabels[row.intervalUnit] || row.intervalUnit || '—'}</td>
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
            ))}
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
            <select value={loanForm.loanMode} onChange={(e) => setLoanForm((prev) => ({ ...prev, loanMode: e.target.value }))}>
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

    const form = activeModal === 'property_tax' ? propertyForm : managementForm
    const setter = activeModal === 'property_tax' ? setPropertyForm : setManagementForm

    return (
      <>
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
          <select value={form.intervalUnit} onChange={(e) => setter((prev) => ({ ...prev, intervalUnit: e.target.value }))}>
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
                      openModal(option.id)
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
        {renderRecurringTable(propertyRows, 'Property Tax')}
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

