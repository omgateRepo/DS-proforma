import { FormEvent, Fragment, useMemo, useState } from 'react'
import { createHardCost, deleteHardCost, updateHardCost } from '../../api.js'
import {
  buildCostFormFromRow,
  buildScheduledCostPayload,
  createDefaultHardCostForm,
  formatCostSchedule,
  formatMeasurementSummary,
  getDefaultMeasurementForCategory,
  hardCategoryLabel,
  hardCostCategories,
  measurementUnitOptions,
  recomputeHardCostAmount,
  requiresMeasurementDetails,
} from './costHelpers.js'
import type { EntityId, HardCostRow, ProjectDetail } from '../../types'

type RequestStatus = 'idle' | 'saving' | 'error'

type OffsetFormatter = (offset?: number | null) => string
type CalendarLabelFormatter = (value: string | number | null | undefined) => string
type CalendarListFormatter = (value: string | number | null | undefined) => string
type MonthOffsetConverter = (value: string | number | null | undefined) => number

type HardCostFormState = {
  hardCategory: string
  measurementUnit: 'none' | 'sqft' | 'linear_feet' | 'apartment' | 'building'
  costName: string
  amountUsd: string
  pricePerUnit: string
  unitsCount: string
  paymentMode: 'single' | 'range' | 'multi'
  paymentMonth: string
  rangeStartMonth: string
  rangeEndMonth: string
  monthsInput: string
  monthPercentagesInput: string
}

type HardCostsSectionProps = {
  project: ProjectDetail | null
  projectId: EntityId | null
  onProjectRefresh?: (projectId: EntityId) => Promise<void>
  formatOffsetForInput: OffsetFormatter
  convertMonthInputToOffset: MonthOffsetConverter
  getCalendarLabelForInput: CalendarLabelFormatter
  getCalendarLabelsForListInput: CalendarListFormatter
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function HardCostsSection({
  project,
  projectId,
  onProjectRefresh,
  formatOffsetForInput,
  convertMonthInputToOffset,
  getCalendarLabelForInput,
  getCalendarLabelsForListInput,
}: HardCostsSectionProps) {
  const [hardCostForm, setHardCostForm] = useState<HardCostFormState>(createDefaultHardCostForm() as HardCostFormState)
  const [hardCostStatus, setHardCostStatus] = useState<RequestStatus>('idle')
  const [hardCostModalError, setHardCostModalError] = useState('')
  const [isHardCostModalOpen, setIsHardCostModalOpen] = useState(false)
  const [editingHardCostId, setEditingHardCostId] = useState<EntityId | null>(null)
  const [pendingHardCostDeleteId, setPendingHardCostDeleteId] = useState<EntityId | null>(null)
  const [hardCostDeleteStatus, setHardCostDeleteStatus] = useState<RequestStatus>('idle')
  const [hardCostDeleteError, setHardCostDeleteError] = useState('')

  const hardRows: HardCostRow[] = project?.hardCosts ?? []

  const totalHardCosts = useMemo(() => {
    return hardRows.reduce((sum, row) => sum + (row.amountUsd || 0), 0)
  }, [hardRows])

  const refreshProject = async () => {
    if (!projectId || !onProjectRefresh) return
    await onProjectRefresh(projectId)
  }

  const openHardCostModal = () => {
    if (!projectId) return
    setHardCostModalError('')
    setHardCostForm(createDefaultHardCostForm() as HardCostFormState)
    setEditingHardCostId(null)
    setIsHardCostModalOpen(true)
  }

  const closeHardCostModal = () => {
    if (hardCostStatus === 'saving') return
    setIsHardCostModalOpen(false)
    setHardCostModalError('')
    setEditingHardCostId(null)
    setHardCostForm(createDefaultHardCostForm() as HardCostFormState)
  }

  const startEditHardCost = (row: HardCostRow) => {
    setHardCostModalError('')
    const form = buildCostFormFromRow(
      row,
      'hardCategory',
      hardCostCategories[0]?.id || 'structure',
      formatOffsetForInput,
      {
        includeMeasurement: true,
        defaultMeasurement: getDefaultMeasurementForCategory(row.costGroup || hardCostCategories[0]?.id || 'structure'),
      },
    ) as HardCostFormState
    setHardCostForm(recomputeHardCostAmount(form) as HardCostFormState)
    setEditingHardCostId(row.id)
    setIsHardCostModalOpen(true)
  }

  const handleHardCategoryChange = (value: string) => {
    setHardCostForm((prev) => {
      const measurementUnit = getDefaultMeasurementForCategory(value)
      const next = {
        ...prev,
        hardCategory: value,
        measurementUnit,
      }
      if (measurementUnit === 'none') {
        next.pricePerUnit = ''
        next.unitsCount = ''
        next.amountUsd = ''
      } else {
        next.pricePerUnit = ''
        next.unitsCount = ''
      }
      return recomputeHardCostAmount(next) as HardCostFormState
    })
  }

  const handleHardMeasurementChange = (value: HardCostFormState['measurementUnit']) => {
    setHardCostForm((prev) => {
      const next = {
        ...prev,
        measurementUnit: value,
      }
      if (value === 'none') {
        next.pricePerUnit = ''
        next.unitsCount = ''
        next.amountUsd = ''
      } else if (value !== prev.measurementUnit) {
        next.pricePerUnit = ''
        next.unitsCount = ''
      }
      return recomputeHardCostAmount(next) as HardCostFormState
    })
  }

  const handleHardCostSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId) return
    setHardCostStatus('saving')
    setHardCostModalError('')

    const needsUnits = requiresMeasurementDetails(hardCostForm.measurementUnit)
    if (needsUnits) {
      if (!hardCostForm.pricePerUnit || !hardCostForm.unitsCount) {
        setHardCostStatus('idle')
        setHardCostModalError('Price per unit and number of units are required.')
        return
      }
    } else if (!hardCostForm.amountUsd) {
      setHardCostStatus('idle')
      setHardCostModalError('Amount is required.')
      return
    }

    const payload = buildScheduledCostPayload(hardCostForm, 'hardCategory', convertMonthInputToOffset) as any
    payload.measurementUnit = hardCostForm.measurementUnit

    if (needsUnits) {
      payload.pricePerUnit = Number(hardCostForm.pricePerUnit)
      payload.unitsCount = Number(hardCostForm.unitsCount)
      payload.amountUsd = Number(hardCostForm.amountUsd || 0)
    } else {
      payload.pricePerUnit = null
      payload.unitsCount = null
      payload.amountUsd = payload.amountUsd === null ? null : Number(payload.amountUsd)
    }

    try {
      if (editingHardCostId) {
        await updateHardCost(projectId, editingHardCostId, payload)
      } else {
        await createHardCost(projectId, payload)
      }
      setHardCostStatus('idle')
      closeHardCostModal()
      await refreshProject()
    } catch (err) {
      setHardCostStatus('error')
      setHardCostModalError(getErrorMessage(err))
    }
  }

  const handleDeleteHardCost = (costId: EntityId) => {
    if (!projectId) return
    setHardCostDeleteError('')
    setPendingHardCostDeleteId(costId)
  }

  const confirmDeleteHardCost = async () => {
    if (!projectId || !pendingHardCostDeleteId) return
    setHardCostDeleteStatus('saving')
    setHardCostDeleteError('')
    try {
      await deleteHardCost(projectId, pendingHardCostDeleteId)
      setHardCostDeleteStatus('idle')
      setPendingHardCostDeleteId(null)
      await refreshProject()
    } catch (err) {
      setHardCostDeleteStatus('error')
      setHardCostDeleteError(getErrorMessage(err))
    }
  }

  const cancelDeleteHardCost = () => {
    if (hardCostDeleteStatus === 'saving') return
    setPendingHardCostDeleteId(null)
    setHardCostDeleteError('')
    setHardCostDeleteStatus('idle')
  }

  if (!project || !projectId) {
    return (
      <div className="soft-tab">
        <p className="muted">Select a project to manage hard costs.</p>
      </div>
    )
  }

  return (
    <>
      <div className="soft-tab">
        <div className="soft-header">
          <div>
            <h3>Hard Costs</h3>
            <p className="muted tiny">Construction scope: site work, structure, envelope, interiors.</p>
          </div>
          <button type="button" className="primary" onClick={openHardCostModal}>
            + Add Hard Cost
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Cost Name</th>
                <th>Units</th>
                <th>Amount (USD)</th>
                <th>Schedule</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {hardRows.map((row) => (
                <tr key={row.id}>
                  <td>{hardCategoryLabel(row.costGroup)}</td>
                  <td>{row.costName}</td>
                  <td>{formatMeasurementSummary(row)}</td>
                  <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                  <td>{formatCostSchedule(row)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => startEditHardCost(row)}
                        disabled={hardCostStatus === 'saving' || hardCostDeleteStatus === 'saving'}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="icon-delete"
                        onClick={() => handleDeleteHardCost(row.id)}
                        disabled={hardCostStatus === 'saving' || hardCostDeleteStatus === 'saving'}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {hardRows.length === 0 && (
                <tr>
                  <td colSpan={6}>No hard costs yet.</td>
                </tr>
              )}
            </tbody>
            {hardRows.length ? (
              <tfoot>
                <tr>
                  <td colSpan={4} className="revenue-total-label">
                    Total hard costs
                  </td>
                  <td colSpan={2} className="revenue-total-value">
                    $
                    {totalHardCosts.toLocaleString(undefined, {
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

      {isHardCostModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>{editingHardCostId ? 'Edit Hard Cost' : 'Add Hard Cost'}</h3>
            <form className="modal-form" onSubmit={handleHardCostSubmit}>
              <label>
                Category
                <select
                  value={hardCostForm.hardCategory}
                  onChange={(e) => handleHardCategoryChange(e.target.value)}
                  disabled={hardCostStatus === 'saving'}
                >
                  {hardCostCategories.map((option) => (
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
                  value={hardCostForm.costName}
                  onChange={(e) => setHardCostForm((prev) => ({ ...prev, costName: e.target.value }))}
                  required
                  disabled={hardCostStatus === 'saving'}
                />
              </label>
              {requiresMeasurementDetails(hardCostForm.measurementUnit) ? (
                <Fragment>
                  <div className="dual-fields">
                    <label>
                      Price per unit
                      <input
                        type="number"
                        value={hardCostForm.pricePerUnit}
                        onChange={(e) =>
                          setHardCostForm((prev) => recomputeHardCostAmount({ ...prev, pricePerUnit: e.target.value }))
                        }
                        disabled={hardCostStatus === 'saving'}
                      />
                    </label>
                    <label>
                      Number of units
                      <input
                        type="number"
                        value={hardCostForm.unitsCount}
                        onChange={(e) =>
                          setHardCostForm((prev) => recomputeHardCostAmount({ ...prev, unitsCount: e.target.value }))
                        }
                        disabled={hardCostStatus === 'saving'}
                      />
                    </label>
                  </div>
                  <label>
                    Calculated amount (USD)
                    <input type="number" value={hardCostForm.amountUsd} readOnly disabled />
                  </label>
                </Fragment>
              ) : (
                <label>
                  Amount (USD)
                  <input
                    type="number"
                    value={hardCostForm.amountUsd}
                    onChange={(e) => setHardCostForm((prev) => ({ ...prev, amountUsd: e.target.value }))}
                    disabled={hardCostStatus === 'saving'}
                  />
                </label>
              )}
              <label>
                Measurement unit
                <select
                  value={hardCostForm.measurementUnit}
                  onChange={(e) => handleHardMeasurementChange(e.target.value as HardCostFormState['measurementUnit'])}
                  disabled={hardCostStatus === 'saving'}
                >
                  {measurementUnitOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Payment mode
                <select
                  value={hardCostForm.paymentMode}
                  onChange={(e) =>
                    setHardCostForm((prev) => ({
                      ...prev,
                      paymentMode: e.target.value as HardCostFormState['paymentMode'],
                    }))
                  }
                  disabled={hardCostStatus === 'saving'}
                >
                  <option value="single">Single month</option>
                  <option value="range">Range</option>
                  <option value="multi">Multiple months</option>
                </select>
              </label>

              {hardCostForm.paymentMode === 'single' && (
                <label>
                  Payment month
                  <input
                    type="number"
                    value={hardCostForm.paymentMonth}
                    onChange={(e) => setHardCostForm((prev) => ({ ...prev, paymentMonth: e.target.value }))}
                    placeholder="e.g., 1"
                    disabled={hardCostStatus === 'saving'}
                  />
                  <span className="month-hint">{getCalendarLabelForInput(hardCostForm.paymentMonth)}</span>
                </label>
              )}

              {hardCostForm.paymentMode === 'range' && (
                <div className="dual-fields">
                  <label>
                    Start month
                    <input
                      type="number"
                      value={hardCostForm.rangeStartMonth}
                      onChange={(e) => setHardCostForm((prev) => ({ ...prev, rangeStartMonth: e.target.value }))}
                      placeholder="e.g., 1"
                      disabled={hardCostStatus === 'saving'}
                    />
                    <span className="month-hint">{getCalendarLabelForInput(hardCostForm.rangeStartMonth)}</span>
                  </label>
                  <label>
                    End month
                    <input
                      type="number"
                      value={hardCostForm.rangeEndMonth}
                      onChange={(e) => setHardCostForm((prev) => ({ ...prev, rangeEndMonth: e.target.value }))}
                      placeholder="e.g., 5"
                      disabled={hardCostStatus === 'saving'}
                    />
                    <span className="month-hint">{getCalendarLabelForInput(hardCostForm.rangeEndMonth)}</span>
                  </label>
                  <p className="helper-text">Amount will be spread evenly across the range.</p>
                </div>
              )}

              {hardCostForm.paymentMode === 'multi' && (
                <Fragment>
                  <label>
                    Months (comma separated)
                    <input
                      type="text"
                      value={hardCostForm.monthsInput}
                      onChange={(e) => setHardCostForm((prev) => ({ ...prev, monthsInput: e.target.value }))}
                      placeholder="e.g., 1,2,3"
                      disabled={hardCostStatus === 'saving'}
                    />
                    <span className="month-hint">
                      {getCalendarLabelsForListInput(hardCostForm.monthsInput)}
                    </span>
                  </label>
                  <label>
                    Percent per month (comma separated, optional)
                    <input
                      type="text"
                      value={hardCostForm.monthPercentagesInput}
                      onChange={(e) =>
                        setHardCostForm((prev) => ({ ...prev, monthPercentagesInput: e.target.value }))
                      }
                      placeholder="e.g., 40,30,30"
                      disabled={hardCostStatus === 'saving'}
                    />
                  </label>
                  <p className="helper-text">
                    If omitted, the amount will be split evenly. Percentages must total 100%.
                  </p>
                </Fragment>
              )}

              {hardCostModalError && <p className="error">{hardCostModalError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeHardCostModal} disabled={hardCostStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={hardCostStatus === 'saving'}>
                  {hardCostStatus === 'saving'
                    ? editingHardCostId
                      ? 'Saving…'
                      : 'Adding…'
                    : editingHardCostId
                      ? 'Save Changes'
                      : 'Save Hard Cost'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingHardCostDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete hard cost?</h3>
            <p>This action cannot be undone.</p>
            {hardCostDeleteError && <p className="error">{hardCostDeleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteHardCost} disabled={hardCostDeleteStatus === 'saving'}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={confirmDeleteHardCost}
                disabled={hardCostDeleteStatus === 'saving'}
              >
                {hardCostDeleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

