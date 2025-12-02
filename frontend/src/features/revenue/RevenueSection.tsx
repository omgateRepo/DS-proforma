import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apartmentRevenueInputSchema, retailRevenueInputSchema, parkingRevenueInputSchema, formatZodErrors } from '@ds-proforma/types'
import {
  createParkingRevenue,
  createRevenueItem,
  createRetailRevenue,
  deleteParkingRevenue,
  deleteRevenueItem,
  deleteRetailRevenue,
  updateParkingRevenue,
  updateProjectGeneral,
  updateRevenueItem,
  updateRetailRevenue,
} from '../../api.js'
import { calculateNetParking, calculateNetRevenue } from './revenueHelpers.js'
import type {
  ApartmentRevenueRow,
  RetailRevenueRow,
  EntityId,
  ParkingRevenueRow,
  ProjectDetail,
} from '../../types'
type RequestStatus = 'idle' | 'saving' | 'error'
type RevenueModalType = 'apartment' | 'retail' | 'parking'

type OffsetFormatter = (offset?: number | null) => string
type CalendarLabelFormatter = (offset: number) => string
type CalendarInputFormatter = (value: string | number | null | undefined) => string
type MonthInputConverter = (value: string | number | null | undefined) => number

type RevenueProjectSlice = Pick<ProjectDetail, 'id' | 'revenue' | 'retailRevenue' | 'parkingRevenue' | 'apartmentTurnover'>

type RevenueSectionProps = {
  project: RevenueProjectSlice | null
  projectId: EntityId | null
  onProjectRefresh?: (projectId: EntityId) => Promise<void>
  formatOffsetForInput: OffsetFormatter
  getCalendarLabelForOffset: CalendarLabelFormatter
  getCalendarLabelForInput: CalendarInputFormatter
  convertMonthInputToOffset: MonthInputConverter
}

type ApartmentFormState = {
  typeLabel: string
  unitSqft: string
  unitCount: string
  rentBudget: string
  vacancyPct: string
  startMonth: string
}

type ParkingFormState = {
  typeLabel: string
  spaceCount: string
  monthlyRentUsd: string
  vacancyPct: string
  startMonth: string
}

const parseOptionalNumber = (value: string) => {
  if (value.trim() === '') return null
  return Number(value)
}

const parseNumberWithDefault = (value: string, fallback: number) => {
  if (value.trim() === '') return fallback
  return Number(value)
}

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value) || value === 0) return '$0'
  const prefix = value < 0 ? '-' : ''
  return `${prefix}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const createDefaultRevenueForm = (): ApartmentFormState => ({
  typeLabel: '',
  unitSqft: '',
  unitCount: '',
  rentBudget: '',
  vacancyPct: '5',
  startMonth: '1',
})

const createDefaultParkingForm = (): ParkingFormState => ({
  typeLabel: '',
  spaceCount: '',
  monthlyRentUsd: '',
  vacancyPct: '5',
  startMonth: '1',
})

export function RevenueSection({
  project,
  projectId,
  onProjectRefresh,
  formatOffsetForInput,
  getCalendarLabelForOffset,
  getCalendarLabelForInput,
  convertMonthInputToOffset,
}: RevenueSectionProps) {
  const [revenueModalType, setRevenueModalType] = useState<RevenueModalType>('apartment')
  const [isRevenueModalOpen, setIsRevenueModalOpen] = useState(false)
  const [revenueModalError, setRevenueModalError] = useState('')
  const [revenueStatus, setRevenueStatus] = useState<RequestStatus>('idle')
  const [revenueForm, setRevenueForm] = useState<ApartmentFormState>(() => createDefaultRevenueForm())
  const [retailForm, setRetailForm] = useState<ApartmentFormState>(() => createDefaultRevenueForm())
  const [parkingForm, setParkingForm] = useState<ParkingFormState>(() => createDefaultParkingForm())
  const [editingRevenueId, setEditingRevenueId] = useState<EntityId | null>(null)
  const [editingRetailId, setEditingRetailId] = useState<EntityId | null>(null)
  const [editingParkingId, setEditingParkingId] = useState<EntityId | null>(null)
  const [pendingRevenueDeleteId, setPendingRevenueDeleteId] = useState<EntityId | null>(null)
  const [pendingRetailDeleteId, setPendingRetailDeleteId] = useState<EntityId | null>(null)
  const [pendingParkingDeleteId, setPendingParkingDeleteId] = useState<EntityId | null>(null)
  const [retailDeleteStatus, setRetailDeleteStatus] = useState<RequestStatus>('idle')
  const [retailDeleteError, setRetailDeleteError] = useState('')
  const [parkingDeleteStatus, setParkingDeleteStatus] = useState<RequestStatus>('idle')
  const [parkingDeleteError, setParkingDeleteError] = useState('')
  const [revenueMenuOpen, setRevenueMenuOpen] = useState(false)
  const revenueMenuRef = useRef<HTMLDivElement | null>(null)
  const [turnoverPctInput, setTurnoverPctInput] = useState('')
  const [turnoverCostInput, setTurnoverCostInput] = useState('')
  const [turnoverStatus, setTurnoverStatus] = useState<RequestStatus>('idle')
  const [turnoverError, setTurnoverError] = useState('')

  const apartmentRows: ApartmentRevenueRow[] = project?.revenue ?? []
  const retailRows: RetailRevenueRow[] = project?.retailRevenue ?? []
  const parkingRows: ParkingRevenueRow[] = project?.parkingRevenue ?? []
  const isEditingApartment = Boolean(editingRevenueId)
  const isUnitModal = revenueModalType === 'apartment' || revenueModalType === 'retail'
  const activeUnitForm = revenueModalType === 'retail' ? retailForm : revenueForm
  const updateUnitForm = revenueModalType === 'retail' ? setRetailForm : setRevenueForm
  const unitModalLabel = revenueModalType === 'retail' ? 'Retail' : 'Apartment'
  const isEditingRetail = Boolean(editingRetailId)
  const isEditingParking = Boolean(editingParkingId)

  const totalMonthlyRevenue = useMemo(() => {
    const apartments = apartmentRows.reduce((sum, row) => sum + calculateNetRevenue(row), 0)
    const retail = retailRows.reduce((sum, row) => sum + calculateNetRevenue(row), 0)
    const parking = parkingRows.reduce((sum, row) => sum + calculateNetParking(row), 0)
    return apartments + retail + parking
  }, [apartmentRows, retailRows, parkingRows])

  const apartmentMonthlyTotal = useMemo(() => {
    return apartmentRows.reduce((sum, row) => sum + calculateNetRevenue(row), 0)
  }, [apartmentRows])

  const retailMonthlyTotal = useMemo(() => {
    return retailRows.reduce((sum, row) => sum + calculateNetRevenue(row), 0)
  }, [retailRows])

  const parkingMonthlyTotal = useMemo(() => {
    return parkingRows.reduce((sum, row) => sum + calculateNetParking(row), 0)
  }, [parkingRows])

  const resetRevenueForms = useCallback(() => {
    setRevenueForm(createDefaultRevenueForm())
    setRetailForm(createDefaultRevenueForm())
    setParkingForm(createDefaultParkingForm())
    setEditingRevenueId(null)
    setEditingRetailId(null)
    setEditingParkingId(null)
    setRevenueModalType('apartment')
  }, [])

  useEffect(() => {
    if (!revenueMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (!revenueMenuRef.current) return
      if (event.target instanceof Node && revenueMenuRef.current.contains(event.target)) return
      setRevenueMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [revenueMenuOpen])

  useEffect(() => {
    resetRevenueForms()
    setRevenueMenuOpen(false)
    setPendingRevenueDeleteId(null)
     setPendingRetailDeleteId(null)
    setPendingParkingDeleteId(null)
     setRetailDeleteError('')
     setRetailDeleteStatus('idle')
    setParkingDeleteError('')
    setParkingDeleteStatus('idle')
  }, [projectId, resetRevenueForms])

  useEffect(() => {
    const pct = project?.apartmentTurnover?.turnoverPct
    setTurnoverPctInput(pct !== null && pct !== undefined ? String(pct) : '')
    const cost = project?.apartmentTurnover?.turnoverCostUsd
    setTurnoverCostInput(cost !== null && cost !== undefined ? String(cost) : '')
    setTurnoverError('')
    setTurnoverStatus('idle')
  }, [project?.id, project?.apartmentTurnover?.turnoverPct, project?.apartmentTurnover?.turnoverCostUsd])

  const openRevenueModal = (type: RevenueModalType) => {
    if (!projectId) return
    setRevenueModalError('')
    resetRevenueForms()
    setRevenueModalType(type)
    setIsRevenueModalOpen(true)
    setRevenueMenuOpen(false)
  }

  const closeRevenueModal = () => {
    if (revenueStatus === 'saving') return
    setIsRevenueModalOpen(false)
    setRevenueModalError('')
    resetRevenueForms()
  }

  const startEditApartment = (row: ApartmentRevenueRow) => {
    setRevenueModalError('')
    setRevenueForm({
      typeLabel: row.typeLabel || '',
      unitSqft: row.unitSqft !== null && row.unitSqft !== undefined ? String(row.unitSqft) : '',
      unitCount: row.unitCount !== null && row.unitCount !== undefined ? String(row.unitCount) : '',
      rentBudget: row.rentBudget !== null && row.rentBudget !== undefined ? String(row.rentBudget) : '',
      vacancyPct: row.vacancyPct !== null && row.vacancyPct !== undefined ? String(row.vacancyPct) : '5',
      startMonth: formatOffsetForInput(row.startMonth),
    })
    setRevenueModalType('apartment')
    setEditingRevenueId(row.id)
    setEditingParkingId(null)
    setIsRevenueModalOpen(true)
  }

  const startEditRetail = (row: RetailRevenueRow) => {
    setRevenueModalError('')
    setRetailForm({
      typeLabel: row.typeLabel || '',
      unitSqft: row.unitSqft !== null && row.unitSqft !== undefined ? String(row.unitSqft) : '',
      unitCount: row.unitCount !== null && row.unitCount !== undefined ? String(row.unitCount) : '',
      rentBudget: row.rentBudget !== null && row.rentBudget !== undefined ? String(row.rentBudget) : '',
      vacancyPct: row.vacancyPct !== null && row.vacancyPct !== undefined ? String(row.vacancyPct) : '5',
      startMonth: formatOffsetForInput(row.startMonth),
    })
    setRevenueModalType('retail')
    setEditingRetailId(row.id)
    setEditingRevenueId(null)
    setEditingParkingId(null)
    setIsRevenueModalOpen(true)
  }

  const startEditParking = (row: ParkingRevenueRow) => {
    setRevenueModalError('')
    setParkingForm({
      typeLabel: row.typeLabel || '',
      spaceCount: row.spaceCount !== null && row.spaceCount !== undefined ? String(row.spaceCount) : '',
      monthlyRentUsd:
        row.monthlyRentUsd !== null && row.monthlyRentUsd !== undefined ? String(row.monthlyRentUsd) : '',
      vacancyPct: row.vacancyPct !== null && row.vacancyPct !== undefined ? String(row.vacancyPct) : '5',
      startMonth: formatOffsetForInput(row.startMonth),
    })
    setRevenueModalType('parking')
    setEditingParkingId(row.id)
    setEditingRevenueId(null)
    setIsRevenueModalOpen(true)
  }

  const buildApartmentPayload = () => ({
    typeLabel: revenueForm.typeLabel.trim(),
    unitSqft: parseOptionalNumber(revenueForm.unitSqft),
    unitCount: parseOptionalNumber(revenueForm.unitCount),
    rentBudget: parseOptionalNumber(revenueForm.rentBudget),
    vacancyPct: parseNumberWithDefault(revenueForm.vacancyPct, 5),
    startMonth: convertMonthInputToOffset(revenueForm.startMonth),
  })

  const buildRetailPayload = () => ({
    typeLabel: retailForm.typeLabel.trim(),
    unitSqft: parseOptionalNumber(retailForm.unitSqft),
    unitCount: parseOptionalNumber(retailForm.unitCount),
    rentBudget: parseOptionalNumber(retailForm.rentBudget),
    vacancyPct: parseNumberWithDefault(retailForm.vacancyPct, 5),
    startMonth: convertMonthInputToOffset(retailForm.startMonth),
  })

  const buildParkingPayload = () => ({
    typeLabel: parkingForm.typeLabel.trim(),
    spaceCount: parseOptionalNumber(parkingForm.spaceCount),
    monthlyRentUsd: parseOptionalNumber(parkingForm.monthlyRentUsd),
    vacancyPct: parseNumberWithDefault(parkingForm.vacancyPct, 5),
    startMonth: convertMonthInputToOffset(parkingForm.startMonth),
  })

  const buildTurnoverPayload = () => ({
    turnoverPct: parseOptionalNumber(turnoverPctInput),
    turnoverCostUsd: parseOptionalNumber(turnoverCostInput),
  })

  const refreshProject = async () => {
    if (!projectId || !onProjectRefresh) return
    await onProjectRefresh(projectId)
  }

  const handleTurnoverSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId) return
    setTurnoverStatus('saving')
    setTurnoverError('')
    try {
      const payload = buildTurnoverPayload()
      await updateProjectGeneral(projectId, payload)
      await refreshProject()
      setTurnoverStatus('idle')
    } catch (err) {
      setTurnoverStatus('error')
      setTurnoverError(getErrorMessage(err))
    }
  }

  const handleAddRevenue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId) return
    setRevenueStatus('saving')
    setRevenueModalError('')

    try {
      if (revenueModalType === 'apartment') {
        const payload = buildApartmentPayload()
        const validation = apartmentRevenueInputSchema.safeParse(payload)
        if (!validation.success) {
          throw new Error(formatZodErrors(validation.error))
        }
        if (editingRevenueId) {
          await updateRevenueItem(projectId, editingRevenueId, validation.data)
        } else {
          await createRevenueItem(projectId, validation.data)
        }
      } else if (revenueModalType === 'retail') {
        const payload = buildRetailPayload()
        const validation = retailRevenueInputSchema.safeParse(payload)
        if (!validation.success) {
          throw new Error(formatZodErrors(validation.error))
        }
        if (editingRetailId) {
          await updateRetailRevenue(projectId, editingRetailId, validation.data)
        } else {
          await createRetailRevenue(projectId, validation.data)
        }
      } else {
        const payload = buildParkingPayload()
        const validation = parkingRevenueInputSchema.safeParse(payload)
        if (!validation.success) {
          throw new Error(formatZodErrors(validation.error))
        }
        if (editingParkingId) {
          await updateParkingRevenue(projectId, editingParkingId, validation.data)
        } else {
          await createParkingRevenue(projectId, validation.data)
        }
      }
      setRevenueStatus('idle')
      setIsRevenueModalOpen(false)
      resetRevenueForms()
      await refreshProject()
    } catch (err) {
      setRevenueStatus('error')
      setRevenueModalError(`Failed to add revenue item: ${getErrorMessage(err)}`)
    }
  }

  const handleDeleteRevenue = (id: EntityId) => {
    if (!projectId) return
    setPendingRevenueDeleteId(id)
  }

  const confirmDeleteRevenue = async () => {
    if (!projectId || !pendingRevenueDeleteId) return
    setRevenueStatus('saving')
    try {
      await deleteRevenueItem(projectId, pendingRevenueDeleteId)
      setPendingRevenueDeleteId(null)
      setRevenueStatus('idle')
      await refreshProject()
    } catch (err) {
      setRevenueStatus('error')
      setRevenueModalError(getErrorMessage(err))
    }
  }

  const cancelDeleteRevenue = () => {
    if (revenueStatus === 'saving') return
    setPendingRevenueDeleteId(null)
    if (revenueStatus === 'error') {
      setRevenueStatus('idle')
    }
  }

  const handleDeleteRetail = (id: EntityId) => {
    if (!projectId) return
    setRetailDeleteError('')
    setPendingRetailDeleteId(id)
  }

  const confirmDeleteRetail = async () => {
    if (!projectId || !pendingRetailDeleteId) return
    setRetailDeleteStatus('saving')
    try {
      await deleteRetailRevenue(projectId, pendingRetailDeleteId)
      setPendingRetailDeleteId(null)
      setRetailDeleteStatus('idle')
      await refreshProject()
    } catch (err) {
      setRetailDeleteStatus('error')
      setRetailDeleteError(getErrorMessage(err))
    }
  }

  const cancelDeleteRetail = () => {
    if (retailDeleteStatus === 'saving') return
    setPendingRetailDeleteId(null)
    setRetailDeleteError('')
    setRetailDeleteStatus('idle')
  }

  const handleDeleteParking = (id: EntityId) => {
    if (!projectId) return
    setParkingDeleteError('')
    setPendingParkingDeleteId(id)
  }

  const confirmDeleteParking = async () => {
    if (!projectId || !pendingParkingDeleteId) return
    setParkingDeleteStatus('saving')
    try {
      await deleteParkingRevenue(projectId, pendingParkingDeleteId)
      setPendingParkingDeleteId(null)
      setParkingDeleteStatus('idle')
      await refreshProject()
    } catch (err) {
      setParkingDeleteStatus('error')
      setParkingDeleteError(getErrorMessage(err))
    }
  }

  const cancelDeleteParking = () => {
    if (parkingDeleteStatus === 'saving') return
    setPendingParkingDeleteId(null)
    setParkingDeleteError('')
    setParkingDeleteStatus('idle')
  }

  if (!project || !projectId) {
    return (
      <div className="revenue-tab">
        <p className="muted">Select a project to manage revenue.</p>
      </div>
    )
  }

  return (
    <>
      <div className="revenue-tab">
        <div className="revenue-header">
          <h3>Revenue</h3>
          <div className="add-menu" ref={revenueMenuRef}>
            <button type="button" className="primary" onClick={() => setRevenueMenuOpen((prev) => !prev)}>
              + Add
            </button>
            {revenueMenuOpen && (
              <div className="add-menu-dropdown">
                <button type="button" onClick={() => openRevenueModal('apartment')}>
                  Apartment Type
                </button>
                <button type="button" onClick={() => openRevenueModal('retail')}>
                  Retail Type
                </button>
                <button type="button" onClick={() => openRevenueModal('parking')}>
                  Parking Type
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="revenue-sections">
          <section className="revenue-section turnover-section">
            <div className="section-header">
              <h4>Apartment Turnover</h4>
              <p className="muted tiny">Applies across every apartment unit</p>
            </div>
            <form className="turnover-form" onSubmit={handleTurnoverSave}>
              <label>
                Annual turnover %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={turnoverPctInput}
                  onChange={(e) => setTurnoverPctInput(e.target.value)}
                  disabled={turnoverStatus === 'saving'}
                  aria-label="Apartment turnover percent"
                />
              </label>
              <label>
                Turnover cost per unit (USD)
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={turnoverCostInput}
                  onChange={(e) => setTurnoverCostInput(e.target.value)}
                  disabled={turnoverStatus === 'saving'}
                  aria-label="Turnover cost per unit"
                />
              </label>
              <div className="turnover-actions">
                <button type="submit" className="secondary" disabled={turnoverStatus === 'saving'}>
                  {turnoverStatus === 'saving' ? 'Saving…' : 'Save Turnover'}
                </button>
                {turnoverError && <span className="error tiny">{turnoverError}</span>}
              </div>
            </form>
          </section>

          <section className="revenue-section">
            <div className="section-header">
              <h4>Apartments</h4>
              <p className="muted tiny">Start month controls when revenue begins</p>
            </div>
            <div className="revenue-section-summary">
              <div>
                <span>Monthly</span>
                <strong>{formatCurrency(apartmentMonthlyTotal)}</strong>
              </div>
              <div>
                <span>Annualized</span>
                <strong>{formatCurrency(apartmentMonthlyTotal * 12)}</strong>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>SqFt</th>
                    <th>Units</th>
                    <th>Rent (USD)</th>
                    <th>Vacancy %</th>
                    <th>Start Month</th>
                    <th>Net Monthly</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {apartmentRows.map((row) => {
                    const netMonthly = calculateNetRevenue(row)
                    return (
                      <tr key={row.id}>
                        <td>{row.typeLabel}</td>
                        <td>{row.unitSqft || '—'}</td>
                        <td>{row.unitCount || '—'}</td>
                        <td>{row.rentBudget ? `$${row.rentBudget.toLocaleString()}` : '—'}</td>
                        <td>{row.vacancyPct ?? 5}%</td>
                        <td>
                          <div className="month-label">
                            <span>{`Month ${formatOffsetForInput(row.startMonth ?? 0)}`}</span>
                            <span className="month-calendar">{getCalendarLabelForOffset(row.startMonth ?? 0)}</span>
                          </div>
                        </td>
                        <td>
                          {netMonthly
                            ? `$${netMonthly.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                            : '—'}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="icon-button" onClick={() => startEditApartment(row)}>
                              ✏️
                            </button>
                            <button type="button" className="icon-delete" onClick={() => handleDeleteRevenue(row.id)}>
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {apartmentRows.length === 0 && (
                    <tr>
                      <td colSpan={8}>No apartment revenue yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

        <section className="revenue-section">
          <div className="section-header">
            <h4>Retail</h4>
            <p className="muted tiny">Street-level or podium retail assumptions</p>
          </div>
          <div className="revenue-section-summary">
            <div>
              <span>Monthly</span>
              <strong>{formatCurrency(retailMonthlyTotal)}</strong>
            </div>
            <div>
              <span>Annualized</span>
              <strong>{formatCurrency(retailMonthlyTotal * 12)}</strong>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>SqFt</th>
                  <th>Units</th>
                  <th>Rent (USD)</th>
                  <th>Vacancy %</th>
                  <th>Start Month</th>
                  <th>Net Monthly</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {retailRows.map((row) => {
                  const netMonthly = calculateNetRevenue(row)
                  return (
                    <tr key={row.id}>
                      <td>{row.typeLabel}</td>
                      <td>{row.unitSqft || '—'}</td>
                      <td>{row.unitCount || '—'}</td>
                      <td>{row.rentBudget ? `$${row.rentBudget.toLocaleString()}` : '—'}</td>
                      <td>{row.vacancyPct ?? 5}%</td>
                      <td>
                        <div className="month-label">
                          <span>{`Month ${formatOffsetForInput(row.startMonth ?? 0)}`}</span>
                          <span className="month-calendar">{getCalendarLabelForOffset(row.startMonth ?? 0)}</span>
                        </div>
                      </td>
                      <td>
                        {netMonthly
                          ? `$${netMonthly.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : '—'}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="icon-button" onClick={() => startEditRetail(row)}>
                            ✏️
                          </button>
                          <button type="button" className="icon-delete" onClick={() => handleDeleteRetail(row.id)}>
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {retailRows.length === 0 && (
                  <tr>
                    <td colSpan={8}>No retail revenue yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

          <section className="revenue-section">
            <div className="section-header">
              <h4>Parking</h4>
              <p className="muted tiny">Tracks garages, covered, uncovered, etc.</p>
            </div>
            <div className="revenue-section-summary">
              <div>
                <span>Monthly</span>
                <strong>{formatCurrency(parkingMonthlyTotal)}</strong>
              </div>
              <div>
                <span>Annualized</span>
                <strong>{formatCurrency(parkingMonthlyTotal * 12)}</strong>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Spaces</th>
                    <th>Rent (USD)</th>
                    <th>Vacancy %</th>
                    <th>Start Month</th>
                    <th>Net Monthly</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {parkingRows.map((row) => {
                    const netMonthly = calculateNetParking(row)
                    return (
                      <tr key={row.id}>
                        <td>{row.typeLabel}</td>
                        <td>{row.spaceCount || '—'}</td>
                        <td>{row.monthlyRentUsd ? `$${row.monthlyRentUsd.toLocaleString()}` : '—'}</td>
                        <td>{row.vacancyPct ?? 5}%</td>
                        <td>
                          <div className="month-label">
                            <span>{`Month ${formatOffsetForInput(row.startMonth ?? 0)}`}</span>
                            <span className="month-calendar">{getCalendarLabelForOffset(row.startMonth ?? 0)}</span>
                          </div>
                        </td>
                        <td>
                          {netMonthly
                            ? `$${netMonthly.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                            : '—'}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="icon-button" onClick={() => startEditParking(row)}>
                              ✏️
                            </button>
                            <button type="button" className="icon-delete" onClick={() => handleDeleteParking(row.id)}>
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {parkingRows.length === 0 && (
                    <tr>
                      <td colSpan={7}>No parking revenue yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="revenue-summary">
            <div>
              <span>Total Monthly (Apartments + Retail + Parking)</span>
              <strong>{formatCurrency(totalMonthlyRevenue)}</strong>
            </div>
            <div>
              <span>Total Annualized</span>
              <strong>{formatCurrency(totalMonthlyRevenue * 12)}</strong>
            </div>
          </div>
        </div>
      </div>

      {isRevenueModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>
              {revenueModalType === 'apartment'
                ? isEditingApartment
                  ? 'Edit Apartment Type'
                  : 'Add Apartment Type'
                : revenueModalType === 'retail'
                  ? isEditingRetail
                    ? 'Edit Retail Type'
                    : 'Add Retail Type'
                  : isEditingParking
                    ? 'Edit Parking Type'
                    : 'Add Parking Type'}
            </h3>
            <form className="modal-form" onSubmit={handleAddRevenue}>
              {isUnitModal && (
                <>
                  <label>
                    Type label
                    <input
                      type="text"
                      value={activeUnitForm.typeLabel}
                      onChange={(e) => updateUnitForm((prev) => ({ ...prev, typeLabel: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                      required
                    />
                  </label>
                  <label>
                    Unit SqFt
                    <input
                      type="number"
                      value={activeUnitForm.unitSqft}
                      onChange={(e) => updateUnitForm((prev) => ({ ...prev, unitSqft: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Number of units
                    <input
                      type="number"
                      value={activeUnitForm.unitCount}
                      onChange={(e) => updateUnitForm((prev) => ({ ...prev, unitCount: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Monthly rent (USD)
                    <input
                      type="number"
                      value={activeUnitForm.rentBudget}
                      onChange={(e) => updateUnitForm((prev) => ({ ...prev, rentBudget: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Vacancy %
                    <input
                      type="number"
                      value={activeUnitForm.vacancyPct}
                      onChange={(e) => updateUnitForm((prev) => ({ ...prev, vacancyPct: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Start month
                    <input
                      type="number"
                      value={activeUnitForm.startMonth}
                      onChange={(e) => updateUnitForm((prev) => ({ ...prev, startMonth: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                    <span className="month-hint">{getCalendarLabelForInput(activeUnitForm.startMonth)}</span>
                  </label>
                </>
              )}

              {revenueModalType === 'parking' && (
                <>
                  <label>
                    Type label
                    <input
                      type="text"
                      value={parkingForm.typeLabel}
                      onChange={(e) => setParkingForm((prev) => ({ ...prev, typeLabel: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                      required
                    />
                  </label>
                  <label>
                    Number of spaces
                    <input
                      type="number"
                      value={parkingForm.spaceCount}
                      onChange={(e) => setParkingForm((prev) => ({ ...prev, spaceCount: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Monthly rent per space (USD)
                    <input
                      type="number"
                      value={parkingForm.monthlyRentUsd}
                      onChange={(e) => setParkingForm((prev) => ({ ...prev, monthlyRentUsd: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Vacancy %
                    <input
                      type="number"
                      value={parkingForm.vacancyPct}
                      onChange={(e) => setParkingForm((prev) => ({ ...prev, vacancyPct: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Start month
                    <input
                      type="number"
                      value={parkingForm.startMonth}
                      onChange={(e) => setParkingForm((prev) => ({ ...prev, startMonth: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                    <span className="month-hint">{getCalendarLabelForInput(parkingForm.startMonth)}</span>
                  </label>
                </>
              )}


              {revenueModalError && (
                <p className="error" role="alert">
                  {revenueModalError}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeRevenueModal} disabled={revenueStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={revenueStatus === 'saving'}>
                  {revenueStatus === 'saving'
                    ? 'Saving…'
                    : revenueModalType === 'apartment'
                      ? isEditingApartment
                        ? 'Save Changes'
                        : 'Save Apartment Type'
                      : revenueModalType === 'retail'
                        ? isEditingRetail
                          ? 'Save Changes'
                          : 'Save Retail Type'
                        : isEditingParking
                          ? 'Save Changes'
                          : 'Save Parking Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingRevenueDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete revenue row?</h3>
            <p>Are you sure you want to remove this unit type?</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteRevenue} disabled={revenueStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDeleteRevenue} disabled={revenueStatus === 'saving'}>
                {revenueStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingParkingDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete parking row?</h3>
            <p>Are you sure you want to remove this parking type?</p>
            {parkingDeleteError && <p className="error">{parkingDeleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteParking} disabled={parkingDeleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDeleteParking} disabled={parkingDeleteStatus === 'saving'}>
                {parkingDeleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRetailDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete retail row?</h3>
            <p>Are you sure you want to remove this retail type?</p>
            {retailDeleteError && <p className="error">{retailDeleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteRetail} disabled={retailDeleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDeleteRetail} disabled={retailDeleteStatus === 'saving'}>
                {retailDeleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}

