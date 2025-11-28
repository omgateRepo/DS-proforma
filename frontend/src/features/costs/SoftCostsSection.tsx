import { FormEvent, Fragment, useMemo, useState } from 'react'
import { createSoftCost, deleteSoftCost, updateSoftCost } from '../../api.js'
import {
  buildCostFormFromRow,
  buildScheduledCostPayload,
  createDefaultSoftCostForm,
  formatCostSchedule,
  softCategoryLabel,
  softCostCategories,
} from './costHelpers.js'
import type { EntityId, ProjectDetail, SoftCostRow } from '../../types'

type RequestStatus = 'idle' | 'saving' | 'error'

type OffsetFormatter = (offset?: number | null) => string
type CalendarLabelFormatter = (value: string | number | null | undefined) => string
type CalendarListFormatter = (value: string | number | null | undefined) => string
type MonthOffsetConverter = (value: string | number | null | undefined) => number

type SoftCostFormState = {
  softCategory: string
  costName: string
  amountUsd: string
  paymentMode: 'single' | 'range' | 'multi'
  paymentMonth: string
  rangeStartMonth: string
  rangeEndMonth: string
  monthsInput: string
  monthPercentagesInput: string
}

type SoftCostsSectionProps = {
  project: ProjectDetail | null
  projectId: EntityId | null
  onProjectRefresh?: (projectId: EntityId) => Promise<void>
  formatOffsetForInput: OffsetFormatter
  convertMonthInputToOffset: MonthOffsetConverter
  getCalendarLabelForInput: CalendarLabelFormatter
  getCalendarLabelsForListInput: CalendarListFormatter
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function SoftCostsSection({
  project,
  projectId,
  onProjectRefresh,
  formatOffsetForInput,
  convertMonthInputToOffset,
  getCalendarLabelForInput,
  getCalendarLabelsForListInput,
}: SoftCostsSectionProps) {
  const [softCostForm, setSoftCostForm] = useState<SoftCostFormState>(createDefaultSoftCostForm() as SoftCostFormState)
  const [softCostStatus, setSoftCostStatus] = useState<RequestStatus>('idle')
  const [softCostModalError, setSoftCostModalError] = useState('')
  const [isSoftCostModalOpen, setIsSoftCostModalOpen] = useState(false)
  const [editingSoftCostId, setEditingSoftCostId] = useState<EntityId | null>(null)
  const [pendingSoftCostDeleteId, setPendingSoftCostDeleteId] = useState<EntityId | null>(null)
  const [softCostDeleteStatus, setSoftCostDeleteStatus] = useState<RequestStatus>('idle')
  const [softCostDeleteError, setSoftCostDeleteError] = useState('')

  const softRows: SoftCostRow[] = project?.softCosts ?? []

  const totalSoftCosts = useMemo(() => {
    return softRows.reduce((sum, row) => sum + (row.amountUsd || 0), 0)
  }, [softRows])

  const refreshProject = async () => {
    if (!projectId || !onProjectRefresh) return
    await onProjectRefresh(projectId)
  }

  const openSoftCostModal = () => {
    if (!projectId) return
    setSoftCostModalError('')
    setSoftCostForm(createDefaultSoftCostForm() as SoftCostFormState)
    setEditingSoftCostId(null)
    setIsSoftCostModalOpen(true)
  }

  const closeSoftCostModal = () => {
    if (softCostStatus === 'saving') return
    setIsSoftCostModalOpen(false)
    setSoftCostModalError('')
    setEditingSoftCostId(null)
    setSoftCostForm(createDefaultSoftCostForm() as SoftCostFormState)
  }

  const startEditSoftCost = (row: SoftCostRow) => {
    setSoftCostModalError('')
    setSoftCostForm(
      buildCostFormFromRow(
        row,
        'softCategory',
        softCostCategories[0]?.id || 'other',
        formatOffsetForInput,
      ) as SoftCostFormState,
    )
    setEditingSoftCostId(row.id)
    setIsSoftCostModalOpen(true)
  }

  const handleSoftCostSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId) return
    setSoftCostStatus('saving')
    setSoftCostModalError('')
    const payload = buildScheduledCostPayload(softCostForm, 'softCategory', convertMonthInputToOffset) as any

    try {
      if (editingSoftCostId) {
        await updateSoftCost(projectId, editingSoftCostId, payload)
      } else {
        await createSoftCost(projectId, payload)
      }
      setSoftCostStatus('idle')
      closeSoftCostModal()
      await refreshProject()
    } catch (err) {
      setSoftCostStatus('error')
      setSoftCostModalError(getErrorMessage(err))
    }
  }

  const handleDeleteSoftCost = (costId: EntityId) => {
    if (!projectId) return
    setSoftCostDeleteError('')
    setPendingSoftCostDeleteId(costId)
  }

  const confirmDeleteSoftCost = async () => {
    if (!projectId || !pendingSoftCostDeleteId) return
    setSoftCostDeleteStatus('saving')
    setSoftCostDeleteError('')
    try {
      await deleteSoftCost(projectId, pendingSoftCostDeleteId)
      setSoftCostDeleteStatus('idle')
      setPendingSoftCostDeleteId(null)
      await refreshProject()
    } catch (err) {
      setSoftCostDeleteStatus('error')
      setSoftCostDeleteError(getErrorMessage(err))
    }
  }

  const cancelDeleteSoftCost = () => {
    if (softCostDeleteStatus === 'saving') return
    setPendingSoftCostDeleteId(null)
    setSoftCostDeleteError('')
    setSoftCostDeleteStatus('idle')
  }

  if (!project || !projectId) {
    return (
      <div className="soft-tab">
        <p className="muted">Select a project to manage soft costs.</p>
      </div>
    )
  }

  return (
    <>
      <div className="soft-tab">
        <div className="soft-header">
          <div>
            <h3>Soft Costs</h3>
            <p className="muted tiny">Architects, legal, permits, consultants, marketing.</p>
          </div>
          <button type="button" className="primary" onClick={openSoftCostModal}>
            + Add Soft Cost
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
              {softRows.map((row) => (
                <tr key={row.id}>
                  <td>{softCategoryLabel(row.costGroup)}</td>
                  <td>{row.costName}</td>
                  <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                  <td>{formatCostSchedule(row)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => startEditSoftCost(row)}
                        disabled={softCostStatus === 'saving' || softCostDeleteStatus === 'saving'}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="icon-delete"
                        onClick={() => handleDeleteSoftCost(row.id)}
                        disabled={softCostStatus === 'saving' || softCostDeleteStatus === 'saving'}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {softRows.length === 0 && (
                <tr>
                  <td colSpan={5}>No soft costs yet.</td>
                </tr>
              )}
            </tbody>
            {softRows.length ? (
              <tfoot>
                <tr>
                  <td colSpan={3} className="revenue-total-label">
                    Total soft costs
                  </td>
                  <td colSpan={2} className="revenue-total-value">
                    $
                    {totalSoftCosts.toLocaleString(undefined, {
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

      {isSoftCostModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>{editingSoftCostId ? 'Edit Soft Cost' : 'Add Soft Cost'}</h3>
            <form className="modal-form" onSubmit={handleSoftCostSubmit}>
              <label>
                Category
                <select
                  value={softCostForm.softCategory}
                  onChange={(e) => setSoftCostForm((prev) => ({ ...prev, softCategory: e.target.value }))}
                  disabled={softCostStatus === 'saving'}
                >
                  {softCostCategories.map((option) => (
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
                  value={softCostForm.costName}
                  onChange={(e) => setSoftCostForm((prev) => ({ ...prev, costName: e.target.value }))}
                  required
                  disabled={softCostStatus === 'saving'}
                />
              </label>
              <label>
                Amount (USD)
                <input
                  type="number"
                  value={softCostForm.amountUsd}
                  onChange={(e) => setSoftCostForm((prev) => ({ ...prev, amountUsd: e.target.value }))}
                  required
                  disabled={softCostStatus === 'saving'}
                />
              </label>
              <label>
                Payment mode
                <select
                  value={softCostForm.paymentMode}
                  onChange={(e) =>
                    setSoftCostForm((prev) => ({
                      ...prev,
                      paymentMode: e.target.value as SoftCostFormState['paymentMode'],
                    }))
                  }
                  disabled={softCostStatus === 'saving'}
                >
                  <option value="single">Single month</option>
                  <option value="range">Range</option>
                  <option value="multi">Multiple months</option>
                </select>
              </label>

              {softCostForm.paymentMode === 'single' && (
                <label>
                  Payment month
                  <input
                    type="number"
                    value={softCostForm.paymentMonth}
                    onChange={(e) => setSoftCostForm((prev) => ({ ...prev, paymentMonth: e.target.value }))}
                    placeholder="e.g., 1"
                    disabled={softCostStatus === 'saving'}
                  />
                  <span className="month-hint">{getCalendarLabelForInput(softCostForm.paymentMonth)}</span>
                </label>
              )}

              {softCostForm.paymentMode === 'range' && (
                <div className="dual-fields">
                  <label>
                    Start month
                    <input
                      type="number"
                      value={softCostForm.rangeStartMonth}
                      onChange={(e) => setSoftCostForm((prev) => ({ ...prev, rangeStartMonth: e.target.value }))}
                      placeholder="e.g., 1"
                      disabled={softCostStatus === 'saving'}
                    />
                    <span className="month-hint">
                      {getCalendarLabelForInput(softCostForm.rangeStartMonth)}
                    </span>
                  </label>
                  <label>
                    End month
                    <input
                      type="number"
                      value={softCostForm.rangeEndMonth}
                      onChange={(e) => setSoftCostForm((prev) => ({ ...prev, rangeEndMonth: e.target.value }))}
                      placeholder="e.g., 5"
                      disabled={softCostStatus === 'saving'}
                    />
                    <span className="month-hint">{getCalendarLabelForInput(softCostForm.rangeEndMonth)}</span>
                  </label>
                  <p className="helper-text">Amount will be spread evenly across the range.</p>
                </div>
              )}

              {softCostForm.paymentMode === 'multi' && (
                <Fragment>
                  <label>
                    Months (comma separated)
                    <input
                      type="text"
                      value={softCostForm.monthsInput}
                      onChange={(e) => setSoftCostForm((prev) => ({ ...prev, monthsInput: e.target.value }))}
                      placeholder="e.g., 1,2,3"
                      disabled={softCostStatus === 'saving'}
                    />
                    <span className="month-hint">
                      {getCalendarLabelsForListInput(softCostForm.monthsInput)}
                    </span>
                  </label>
                  <label>
                    Percent per month (comma separated, optional)
                    <input
                      type="text"
                      value={softCostForm.monthPercentagesInput}
                      onChange={(e) =>
                        setSoftCostForm((prev) => ({ ...prev, monthPercentagesInput: e.target.value }))
                      }
                      placeholder="e.g., 40,30,30"
                      disabled={softCostStatus === 'saving'}
                    />
                  </label>
                  <p className="helper-text">
                    If omitted, the amount will be split evenly. Percentages must total 100%.
                  </p>
                </Fragment>
              )}

              {softCostModalError && <p className="error">{softCostModalError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeSoftCostModal} disabled={softCostStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={softCostStatus === 'saving'}>
                  {softCostStatus === 'saving'
                    ? editingSoftCostId
                      ? 'Saving…'
                      : 'Adding…'
                    : editingSoftCostId
                      ? 'Save Changes'
                      : 'Save Soft Cost'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingSoftCostDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete soft cost?</h3>
            <p>This action cannot be undone.</p>
            {softCostDeleteError && <p className="error">{softCostDeleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteSoftCost} disabled={softCostDeleteStatus === 'saving'}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={confirmDeleteSoftCost}
                disabled={softCostDeleteStatus === 'saving'}
              >
                {softCostDeleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

