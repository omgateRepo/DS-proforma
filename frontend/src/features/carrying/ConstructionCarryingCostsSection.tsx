import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildRecurringFormFromRow,
  createDefaultRecurringForm,
  formatCurrency,
  intervalLabels,
  intervalUnitOptions,
} from './carryingHelpers.js'
import { createCarryingCost, deleteCarryingCost, updateCarryingCost } from '../../api.js'
import type { CarryingCostRow, EntityId, IntervalUnit, ProjectDetail } from '../../types'

type OffsetFormatter = (offset?: number | null) => string
type MonthOffsetConverter = (value: string | number | null | undefined) => number
type CalendarLabelFormatter = (value: string | number | null | undefined) => string
type RecurringFormState = {
  costName: string
  amountUsd: string
  intervalUnit: IntervalUnit
  startMonth: string
  endMonth: string
}

const CATEGORY_OPTIONS = [
  { id: 'construction_re_tax', label: 'Real Estate Tax', fixedDates: true },
  { id: 'insurance', label: 'Insurance', fixedDates: true },
  { id: 'other', label: 'Other', fixedDates: false },
] as const

type CategoryId = (typeof CATEGORY_OPTIONS)[number]['id']
type CategoryOption = (typeof CATEGORY_OPTIONS)[number]

const intervalLabelMap = intervalLabels as Record<IntervalUnit, string>
const DEFAULT_CATEGORY = CATEGORY_OPTIONS[0]

// Calculate total cost for a row over a given period
const calculateRowTotal = (row: CarryingCostRow, stabilizedMonth: number | null): number => {
  if (!row.amountUsd || !stabilizedMonth) return 0
  const startMonth = row.startMonth ?? 1
  const endMonth = row.endMonth ?? stabilizedMonth
  const effectiveEnd = Math.min(endMonth, stabilizedMonth)
  if (effectiveEnd < startMonth) return 0
  
  const months = effectiveEnd - startMonth + 1
  const amount = row.amountUsd
  
  switch (row.intervalUnit) {
    case 'monthly':
      return amount * months
    case 'quarterly':
      return amount * Math.ceil(months / 3)
    case 'yearly':
      return amount * Math.ceil(months / 12)
    default:
      return amount * months
  }
}

const buildDefaultForm = () =>
  createDefaultRecurringForm('property_tax', { propertyTaxPhase: 'construction' }) as RecurringFormState

const requireMonth = (value: string, message: string, convert: MonthOffsetConverter) => {
  if (!value) throw new Error(message)
  return convert(value)
}

const toNumberOrThrow = (value: string) => {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) throw new Error('Amount is required.')
  return parsed
}

export function ConstructionCarryingCostsSection({
  project,
  projectId,
  onProjectRefresh,
  formatOffsetForInput,
  convertMonthInputToOffset,
  getCalendarLabelForInput,
  stabilizedOffset,
}: {
  project: ProjectDetail | null
  projectId: EntityId | null
  onProjectRefresh?: (projectId: EntityId) => Promise<void>
  formatOffsetForInput: OffsetFormatter
  convertMonthInputToOffset: MonthOffsetConverter
  getCalendarLabelForInput: CalendarLabelFormatter
  stabilizedOffset?: number | null
}) {
  const [form, setForm] = useState(buildDefaultForm())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<EntityId | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [modalError, setModalError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<CarryingCostRow | null>(null)
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [deleteError, setDeleteError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryOption>(DEFAULT_CATEGORY)
  const addMenuRef = useRef<HTMLDivElement | null>(null)

  const rows = useMemo(
    () =>
      project?.carryingCosts?.filter(
        (row) => row.carryingType === 'property_tax' && ((row.propertyTaxPhase as string) || 'construction') === 'construction',
      ) ?? [],
    [project?.carryingCosts],
  )

  const refreshProject = async () => {
    if (!projectId || !onProjectRefresh) return
    await onProjectRefresh(projectId)
  }

  const getCategoryById = (id: string | null | undefined): CategoryOption =>
    CATEGORY_OPTIONS.find((option) => option.id === id) ?? CATEGORY_OPTIONS[CATEGORY_OPTIONS.length - 1]

  const openModal = (category: CategoryOption, row: CarryingCostRow | null = null) => {
    setActiveCategory(category)
    setEditingId(row?.id || null)
    setStatus('idle')
    setModalError('')
    if (row) {
      setForm(buildRecurringFormFromRow(row, formatOffsetForInput) as RecurringFormState)
    } else {
      setForm(buildDefaultForm())
    }
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (status === 'saving') return
    setIsModalOpen(false)
    setEditingId(null)
    setForm(buildDefaultForm())
    setModalError('')
  }

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId) return
    setStatus('saving')
    setModalError('')
    try {
      // For fixed-date categories (RE Tax, Insurance), use closing (1) to stabilized
      const isFixedDates = activeCategory.fixedDates
      const payload = {
        carryingType: 'property_tax',
        costName: form.costName.trim() || activeCategory.label,
        amountUsd: toNumberOrThrow(form.amountUsd),
        intervalUnit: form.intervalUnit,
        startMonth: isFixedDates ? 1 : requireMonth(form.startMonth, 'Start month is required.', convertMonthInputToOffset),
        endMonth: isFixedDates ? (stabilizedOffset ?? null) : (form.endMonth ? convertMonthInputToOffset(form.endMonth) : null),
        propertyTaxPhase: 'construction',
        costGroup: activeCategory.id,
      }
      if (editingId) {
        await updateCarryingCost(projectId, editingId, payload)
      } else {
        await createCarryingCost(projectId, payload)
      }
      await refreshProject()
      setStatus('idle')
      closeModal()
    } catch (err) {
      setStatus('error')
      setModalError(err instanceof Error ? err.message : String(err))
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
      setDeleteStatus('idle')
      setPendingDelete(null)
      await refreshProject()
    } catch (err) {
      setDeleteStatus('error')
      setDeleteError(err instanceof Error ? err.message : String(err))
    }
  }

  const cancelDelete = () => {
    if (deleteStatus === 'saving') return
    setPendingDelete(null)
    setDeleteError('')
  }

  const formatMonthDisplay = (offset?: number | null) => {
    if (offset === null || offset === undefined) return '—'
    const label = formatOffsetForInput(offset)
    const calendar = getCalendarLabelForInput(offset)
    return (
      <div className="month-label">
        <span>{`Month ${label}`}</span>
        <span className="month-calendar">{calendar}</span>
      </div>
    )
  }

  const renderCategoryLabel = (row: CarryingCostRow) => {
    return getCategoryById(row.costGroup || null).label
  }

  const renderPeriodDisplay = (row: CarryingCostRow) => {
    const cat = getCategoryById(row.costGroup || null)
    if (cat.fixedDates) {
      return <span className="period-badge">Closing → Stabilized</span>
    }
    return (
      <>
        {formatMonthDisplay(row.startMonth)} → {row.endMonth !== null && row.endMonth !== undefined ? formatMonthDisplay(row.endMonth) : 'Ongoing'}
      </>
    )
  }

  const renderRowTotal = (row: CarryingCostRow) => {
    const rowTotal = calculateRowTotal(row, stabilizedOffset ?? null)
    return rowTotal > 0 ? <strong>{formatCurrency(rowTotal)}</strong> : '—'
  }

  return (
    <>
      <div className="soft-tab">
        <div className="soft-header">
          <div>
            <h3>Development Carrying Costs</h3>
            <p className="muted tiny">Track the development-phase RE tax plus insurance/other expenses.</p>
          </div>
          <div className="add-menu" ref={addMenuRef}>
            <button type="button" className="primary" onClick={() => setMenuOpen((prev) => !prev)}>
              + Add Carrying Cost
            </button>
            {menuOpen && (
              <div className="add-menu-dropdown">
                {CATEGORY_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => {
                      setMenuOpen(false)
                      openModal(option)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Title</th>
                <th>Amount</th>
                <th>Interval</th>
                <th>Period</th>
                <th>Total*</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7}>No development carrying costs yet.</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{renderCategoryLabel(row)}</td>
                  <td>{row.costName || renderCategoryLabel(row)}</td>
                  <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                  <td>{row.intervalUnit ? intervalLabelMap[row.intervalUnit] : '—'}</td>
                  <td>{renderPeriodDisplay(row)}</td>
                  <td>{renderRowTotal(row)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => openModal(getCategoryById(row.costGroup || null), row)}
                      >
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
        {rows.length > 0 && <p className="muted tiny">* Total calculated from Closing to Stabilized date</p>}
      </div>

      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>{editingId ? 'Edit' : 'Add'} {activeCategory.label}</h3>
            <form className="modal-form" onSubmit={handleSubmit}>
              <label>
                Title
                <input
                  type="text"
                  value={form.costName}
                  onChange={(e) => setForm((prev) => ({ ...prev, costName: e.target.value }))}
                />
              </label>
              <label>
                Amount (per interval)
                <input
                  type="number"
                  value={form.amountUsd}
                  onChange={(e) => setForm((prev) => ({ ...prev, amountUsd: e.target.value }))}
                />
              </label>
              <label>
                Interval
                <select
                  value={form.intervalUnit}
                  onChange={(e) => setForm((prev) => ({ ...prev, intervalUnit: e.target.value as IntervalUnit }))}
                >
                  {intervalUnitOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {activeCategory.fixedDates ? (
                <div className="fixed-period-notice">
                  <p className="muted">
                    📅 <strong>Period:</strong> Closing → Stabilized
                  </p>
                  <p className="muted tiny">This cost applies from closing date until stabilized date automatically.</p>
                </div>
              ) : (
                <>
                  <label>
                    Start Month
                    <input
                      type="number"
                      min="1"
                      value={form.startMonth}
                      onChange={(e) => setForm((prev) => ({ ...prev, startMonth: e.target.value }))}
                    />
                    <span className="muted tiny">{getCalendarLabelForInput(form.startMonth)}</span>
                  </label>
                  <label>
                    End Month (optional)
                    <input
                      type="number"
                      min="1"
                      value={form.endMonth}
                      onChange={(e) => setForm((prev) => ({ ...prev, endMonth: e.target.value }))}
                    />
                    {form.endMonth && <span className="muted tiny">{getCalendarLabelForInput(form.endMonth)}</span>}
                  </label>
                </>
              )}
              {modalError && <p className="error">{modalError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeModal} disabled={status === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={status === 'saving'}>
                  {status === 'saving' ? (editingId ? 'Saving…' : 'Creating…') : editingId ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete {pendingDelete.costName || renderCategoryLabel(pendingDelete)}?</h3>
            <p>This action cannot be undone.</p>
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

