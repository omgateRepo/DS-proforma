import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createCarryingCost, deleteCarryingCost, updateCarryingCost } from '../../api.js'
import {
  buildRecurringFormFromRow,
  calculateRecurringAverage,
  carryingMenuOptions,
  createDefaultRecurringForm,
  formatCurrency,
  intervalLabels,
  intervalUnitOptions,
  propertyTaxPhaseLabels,
} from './carryingHelpers.js'
import type { CarryingCostRow, CarryingType, EntityId, IntervalUnit, ProjectDetail, PropertyTaxPhase } from '../../types'

type RequestStatus = 'idle' | 'saving' | 'error'

type OffsetFormatter = (offset?: number | null) => string
type MonthOffsetConverter = (value: string | number | null | undefined) => number
type CalendarLabelFormatter = (value: string | number | null | undefined) => string

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

type RecurringCarryingType = Extract<CarryingType, 'property_tax' | 'management'>
type AutoRow = { id: string; label: string; monthlyAmount: number; startMonth: number | null }

type CarryingCostsSectionProps = {
  project: ProjectDetail | null
  projectId: EntityId | null
  onProjectRefresh?: (projectId: EntityId) => Promise<void>
  formatOffsetForInput: OffsetFormatter
  convertMonthInputToOffset: MonthOffsetConverter
  getCalendarLabelForInput: CalendarLabelFormatter
  autoManagementRows?: AutoRow[]
  defaultManagementStartMonth?: number | null
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
const intervalLabelMap = intervalLabels as Record<IntervalUnit, string>
const propertyPhaseLabelMap = propertyTaxPhaseLabels as Record<PropertyTaxPhase, string>
const DEFAULT_PROPERTY_TAX_PHASE: PropertyTaxPhase = 'stabilized'

export function CarryingCostsSection({
  project,
  projectId,
  onProjectRefresh,
  formatOffsetForInput,
  convertMonthInputToOffset,
  getCalendarLabelForInput,
  autoManagementRows = [],
  defaultManagementStartMonth = null,
}: CarryingCostsSectionProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<RecurringCarryingType | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
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
  const recurringMenuOptions = useMemo(
    () =>
      carryingMenuOptions.filter(
        (option): option is { id: RecurringCarryingType; label: string } =>
          option.id === 'property_tax' || option.id === 'management',
      ),
    [],
  )

  const isManagementRow = (row: CarryingCostRow): row is CarryingCostRow & { carryingType: 'management' } =>
    row.carryingType === 'management'

  const propertyRows = useMemo(
    () =>
      carryingRows.filter(
        (row) =>
          row.carryingType === 'property_tax' &&
          ((row.propertyTaxPhase as PropertyTaxPhase | undefined) ?? DEFAULT_PROPERTY_TAX_PHASE) ===
            DEFAULT_PROPERTY_TAX_PHASE,
      ),
    [carryingRows],
  )
  const managementRows = useMemo(() => carryingRows.filter(isManagementRow), [carryingRows])

  const autoManagementMonthlyTotal = useMemo(() => {
    return autoManagementRows.reduce((sum, row) => sum + (row.monthlyAmount || 0), 0)
  }, [autoManagementRows])
  const managementMonthlyTotal = useMemo(() => {
    const base = managementRows.reduce((sum, row) => sum + (calculateRecurringAverage(row) || 0), 0)
    return base + autoManagementMonthlyTotal
  }, [managementRows, autoManagementMonthlyTotal])

  const defaultManagementStartInput = useMemo(() => {
    if (defaultManagementStartMonth === null || defaultManagementStartMonth === undefined) return '1'
    return String(defaultManagementStartMonth + 1)
  }, [defaultManagementStartMonth])

  const buildDefaultManagementForm = useCallback(() => {
    return createDefaultRecurringForm('management', { defaultStartMonth: defaultManagementStartInput }) as RecurringFormState
  }, [defaultManagementStartInput])

  const resetForms = useCallback(() => {
    setPropertyForm(
      createDefaultRecurringForm('property_tax', { propertyTaxPhase: DEFAULT_PROPERTY_TAX_PHASE }) as RecurringFormState,
    )
    setManagementForm(buildDefaultManagementForm())
    setEditingId(null)
    setModalError('')
    setStatus('idle')
  }, [buildDefaultManagementForm])

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

  const openModal = (type: RecurringCarryingType, row: CarryingCostRow | null = null) => {
    setActiveModal(type)
    setIsModalOpen(true)
    setModalError('')
    setStatus('idle')
    if (type === 'property_tax') {
      setPropertyForm(
        row
          ? (buildRecurringFormFromRow(row, formatOffsetForInput) as RecurringFormState)
          : (createDefaultRecurringForm('property_tax', { propertyTaxPhase: DEFAULT_PROPERTY_TAX_PHASE }) as RecurringFormState),
      )
    } else {
      setManagementForm(
        row
          ? (buildRecurringFormFromRow(row, formatOffsetForInput) as RecurringFormState)
          : buildDefaultManagementForm(),
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

  const buildRecurringPayload = (type: RecurringCarryingType) => {
    const form = type === 'property_tax' ? propertyForm : managementForm
    const amount = toNumberOrNull(form.amountUsd)
    if (amount === null) throw new Error('Amount is required.')
    const startMonth = requireMonth(form.startMonth, 'Start month is required.')
    const payload: RecurringPayload = {
      carryingType: type,
      costName: form.costName.trim() || (type === 'property_tax' ? 'Stabilized RE Tax' : 'Management Fee'),
      amountUsd: amount,
      intervalUnit: form.intervalUnit,
      startMonth,
      endMonth: form.endMonth ? convertMonthInputToOffset(form.endMonth) : null,
    }
    if (payload.endMonth !== null && payload.endMonth < startMonth) {
      throw new Error('End month cannot be earlier than start month.')
    }
    if (type === 'property_tax') {
      payload.propertyTaxPhase = DEFAULT_PROPERTY_TAX_PHASE
    }
    return payload
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId || !activeModal) return
    setStatus('saving')
    setModalError('')
    try {
      const payload = buildRecurringPayload(activeModal)

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
    if (row.carryingType !== 'property_tax' && row.carryingType !== 'management') return
    openModal(row.carryingType, row)
  }

  const formatMonthDisplay = (offset?: number | null) => {
    if (offset === null || offset === undefined) return '—'
    const normalized = offset
    const monthLabel = formatOffsetForInput(normalized)
    const calendarHint = getCalendarLabelForInput(normalized)
    return (
    <div className="month-label">
        <span>{`Month ${monthLabel}`}</span>
        <span className="month-calendar">{calendarHint}</span>
    </div>
  )
  }

  const renderPropertyTaxTable = () => (
    <section className="carrying-section">
      <div className="section-header">
        <h4>Stabilized RE Tax</h4>
        <p className="muted tiny">
          Focus on stabilized RE tax once the asset is leased; it feeds the metrics/NOI pages.
        </p>
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

  const renderRecurringTable = (rows: CarryingCostRow[], title: string, extraRows?: ReactNode) => (
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
            {extraRows}
          </tbody>
        </table>
      </div>
    </section>
  )

  const renderModalBody = () => {
    if (!activeModal) return null
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
          <h3>Stabilized Phase Costs</h3>
          <div className="add-menu" ref={addMenuRef}>
            <button type="button" className="primary" onClick={() => setMenuOpen((prev) => !prev)}>
              + Add
            </button>
            {menuOpen && (
              <div className="add-menu-dropdown">
                {recurringMenuOptions.map((option) => (
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

        {renderPropertyTaxTable()}
        {renderRecurringTable(
          managementRows,
          'Stabilized Expenses',
          autoManagementRows.map((row) => (
            <tr className="readonly-row" key={row.id}>
              <td>{row.label}</td>
              <td>{formatCurrency(row.monthlyAmount)}</td>
              <td>Monthly (auto)</td>
              <td>{formatMonthDisplay(row.startMonth)}</td>
              <td>—</td>
              <td>—</td>
            </tr>
          )),
        )}

        <div className="management-summary">
          <div>
            <span>Management Monthly</span>
            <strong>{formatCurrency(managementMonthlyTotal)}</strong>
          </div>
          <div>
            <span>Management Annualized</span>
            <strong>{formatCurrency(managementMonthlyTotal * 12)}</strong>
          </div>
        </div>
      </div>

      {isModalOpen && activeModal && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>
              {editingId ? 'Edit' : 'Add'} {activeModal === 'property_tax' ? 'Property Tax' : 'Management Fee'}
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

