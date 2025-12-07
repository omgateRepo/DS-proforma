import { FormEvent, Fragment, useMemo, useState } from 'react'
import { createLeaseupCost, deleteLeaseupCost, updateLeaseupCost } from '../../api.js'
import {
  buildCostFormFromRow,
  buildScheduledCostPayload,
  createDefaultLeaseupCostForm,
  formatCostSchedule,
  leaseupCategoryLabel,
  leaseupCostCategories,
} from './costHelpers.js'
import type { EntityId, LeaseupCostRow, ProjectDetail } from '../../types'

type RequestStatus = 'idle' | 'saving' | 'error'

type OffsetFormatter = (offset?: number | null) => string
type CalendarLabelFormatter = (value: string | number | null | undefined) => string
type CalendarListFormatter = (value: string | number | null | undefined) => string
type MonthOffsetConverter = (value: string | number | null | undefined) => number

type LeaseupCostFormState = {
  leaseupCategory: string
  costName: string
  amountUsd: string
  paymentMode: 'single' | 'range' | 'multi'
  paymentMonth: string
  rangeStartMonth: string
  rangeEndMonth: string
  monthsInput: string
  monthPercentagesInput: string
}

type LeaseUpCostsSectionProps = {
  project: ProjectDetail | null
  projectId: EntityId | null
  onProjectRefresh?: (projectId: EntityId) => Promise<void>
  formatOffsetForInput: OffsetFormatter
  convertMonthInputToOffset: MonthOffsetConverter
  getCalendarLabelForInput: CalendarLabelFormatter
  getCalendarLabelsForListInput: CalendarListFormatter
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function LeaseUpCostsSection({
  project,
  projectId,
  onProjectRefresh,
  formatOffsetForInput,
  convertMonthInputToOffset,
  getCalendarLabelForInput,
  getCalendarLabelsForListInput,
}: LeaseUpCostsSectionProps) {
  const [costForm, setCostForm] = useState<LeaseupCostFormState>(createDefaultLeaseupCostForm() as LeaseupCostFormState)
  const [costStatus, setCostStatus] = useState<RequestStatus>('idle')
  const [modalError, setModalError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCostId, setEditingCostId] = useState<EntityId | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<EntityId | null>(null)
  const [deleteStatus, setDeleteStatus] = useState<RequestStatus>('idle')
  const [deleteError, setDeleteError] = useState('')

  const rows: LeaseupCostRow[] = project?.leaseupCosts ?? []

  const totalLeaseupCosts = useMemo(() => {
    return rows.reduce((sum, row) => sum + (row.amountUsd || 0), 0)
  }, [rows])

  const refreshProject = async () => {
    if (!projectId || !onProjectRefresh) return
    await onProjectRefresh(projectId)
  }

  const openModal = () => {
    if (!projectId) return
    setModalError('')
    setCostForm(createDefaultLeaseupCostForm() as LeaseupCostFormState)
    setEditingCostId(null)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (costStatus === 'saving') return
    setIsModalOpen(false)
    setModalError('')
    setEditingCostId(null)
    setCostForm(createDefaultLeaseupCostForm() as LeaseupCostFormState)
  }

  const startEditCost = (row: LeaseupCostRow) => {
    setModalError('')
    setCostForm(
      buildCostFormFromRow(
        row,
        'leaseupCategory',
        leaseupCostCategories[0]?.id || 'other',
        formatOffsetForInput,
      ) as LeaseupCostFormState,
    )
    setEditingCostId(row.id)
    setIsModalOpen(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId) return
    setCostStatus('saving')
    setModalError('')
    const payload = buildScheduledCostPayload(costForm, 'leaseupCategory', convertMonthInputToOffset) as any

    try {
      if (editingCostId) {
        await updateLeaseupCost(projectId, editingCostId, payload)
      } else {
        await createLeaseupCost(projectId, payload)
      }
      setCostStatus('idle')
      closeModal()
      await refreshProject()
    } catch (err) {
      setCostStatus('error')
      setModalError(getErrorMessage(err))
    }
  }

  const handleDelete = (costId: EntityId) => {
    if (!projectId) return
    setDeleteError('')
    setPendingDeleteId(costId)
  }

  const confirmDelete = async () => {
    if (!projectId || !pendingDeleteId) return
    setDeleteStatus('saving')
    setDeleteError('')
    try {
      await deleteLeaseupCost(projectId, pendingDeleteId)
      setDeleteStatus('idle')
      setPendingDeleteId(null)
      await refreshProject()
    } catch (err) {
      setDeleteStatus('error')
      setDeleteError(getErrorMessage(err))
    }
  }

  const cancelDelete = () => {
    if (deleteStatus === 'saving') return
    setPendingDeleteId(null)
    setDeleteError('')
    setDeleteStatus('idle')
  }

  if (!project || !projectId) {
    return (
      <div className="soft-tab">
        <p className="muted">Select a project to manage lease-up costs.</p>
      </div>
    )
  }

  return (
    <>
      <div className="soft-tab">
        <div className="soft-header">
          <div>
            <h3>Lease-Up Costs</h3>
            <p className="muted tiny">Marketing, staging, leasing agents, tenant improvements.</p>
          </div>
          <button type="button" className="primary" onClick={openModal}>
            + Add Lease-Up Cost
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Cost Name</th>
                <th>Amount (USD)</th>
                <th>Schedule</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{leaseupCategoryLabel(row.costGroup)}</td>
                  <td>{row.costName}</td>
                  <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                  <td>{formatCostSchedule(row)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => startEditCost(row)}
                        disabled={costStatus === 'saving' || deleteStatus === 'saving'}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="icon-delete"
                        onClick={() => handleDelete(row.id)}
                        disabled={costStatus === 'saving' || deleteStatus === 'saving'}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5}>No lease-up costs yet.</td>
                </tr>
              )}
            </tbody>
            {rows.length ? (
              <tfoot>
                <tr>
                  <td colSpan={3} className="revenue-total-label">
                    Total lease-up costs
                  </td>
                  <td colSpan={2} className="revenue-total-value">
                    $
                    {totalLeaseupCosts.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>{editingCostId ? 'Edit Lease-Up Cost' : 'Add Lease-Up Cost'}</h3>
            <form className="modal-form" onSubmit={handleSubmit}>
              <label>
                Category
                <select
                  value={costForm.leaseupCategory}
                  onChange={(e) => setCostForm((prev) => ({ ...prev, leaseupCategory: e.target.value }))}
                  disabled={costStatus === 'saving'}
                >
                  {leaseupCostCategories.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cost name
                <input
                  type="text"
                  value={costForm.costName}
                  onChange={(e) => setCostForm((prev) => ({ ...prev, costName: e.target.value }))}
                  required
                  disabled={costStatus === 'saving'}
                />
              </label>
              <label>
                Amount (USD)
                <input
                  type="number"
                  value={costForm.amountUsd}
                  onChange={(e) => setCostForm((prev) => ({ ...prev, amountUsd: e.target.value }))}
                  required
                  disabled={costStatus === 'saving'}
                />
              </label>
              <label>
                Payment mode
                <select
                  value={costForm.paymentMode}
                  onChange={(e) =>
                    setCostForm((prev) => ({
                      ...prev,
                      paymentMode: e.target.value as LeaseupCostFormState['paymentMode'],
                    }))
                  }
                  disabled={costStatus === 'saving'}
                >
                  <option value="single">Single month</option>
                  <option value="range">Range</option>
                  <option value="multi">Multiple months</option>
                </select>
              </label>

              {costForm.paymentMode === 'single' && (
                <label>
                  Payment month
                  <input
                    type="number"
                    value={costForm.paymentMonth}
                    onChange={(e) => setCostForm((prev) => ({ ...prev, paymentMonth: e.target.value }))}
                    placeholder="e.g., 1"
                    disabled={costStatus === 'saving'}
                  />
                  <span className="month-hint">{getCalendarLabelForInput(costForm.paymentMonth)}</span>
                </label>
              )}

              {costForm.paymentMode === 'range' && (
                <div className="dual-fields">
                  <label>
                    Start month
                    <input
                      type="number"
                      value={costForm.rangeStartMonth}
                      onChange={(e) => setCostForm((prev) => ({ ...prev, rangeStartMonth: e.target.value }))}
                      placeholder="e.g., 1"
                      disabled={costStatus === 'saving'}
                    />
                    <span className="month-hint">
                      {getCalendarLabelForInput(costForm.rangeStartMonth)}
                    </span>
                  </label>
                  <label>
                    End month
                    <input
                      type="number"
                      value={costForm.rangeEndMonth}
                      onChange={(e) => setCostForm((prev) => ({ ...prev, rangeEndMonth: e.target.value }))}
                      placeholder="e.g., 5"
                      disabled={costStatus === 'saving'}
                    />
                    <span className="month-hint">{getCalendarLabelForInput(costForm.rangeEndMonth)}</span>
                  </label>
                  <p className="helper-text">Amount will be spread evenly across the range.</p>
                </div>
              )}

              {costForm.paymentMode === 'multi' && (
                <Fragment>
                  <label>
                    Months (comma separated)
                    <input
                      type="text"
                      value={costForm.monthsInput}
                      onChange={(e) => setCostForm((prev) => ({ ...prev, monthsInput: e.target.value }))}
                      placeholder="e.g., 1,2,3"
                      disabled={costStatus === 'saving'}
                    />
                    <span className="month-hint">
                      {getCalendarLabelsForListInput(costForm.monthsInput)}
                    </span>
                  </label>
                  <label>
                    Percent per month (comma separated, optional)
                    <input
                      type="text"
                      value={costForm.monthPercentagesInput}
                      onChange={(e) =>
                        setCostForm((prev) => ({ ...prev, monthPercentagesInput: e.target.value }))
                      }
                      placeholder="e.g., 40,30,30"
                      disabled={costStatus === 'saving'}
                    />
                  </label>
                  <p className="helper-text">
                    If omitted, the amount will be split evenly. Percentages must total 100%.
                  </p>
                </Fragment>
              )}

              {modalError && <p className="error">{modalError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeModal} disabled={costStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={costStatus === 'saving'}>
                  {costStatus === 'saving'
                    ? editingCostId
                      ? 'Saving…'
                      : 'Adding…'
                    : editingCostId
                      ? 'Save Changes'
                      : 'Save Lease-Up Cost'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete lease-up cost?</h3>
            <p>This action cannot be undone.</p>
            {deleteError && <p className="error">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDelete} disabled={deleteStatus === 'saving'}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={confirmDelete}
                disabled={deleteStatus === 'saving'}
              >
                {deleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

