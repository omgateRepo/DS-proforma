import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  apartmentRevenueInputSchema,
  parkingRevenueInputSchema,
  gpContributionInputSchema,
  formatZodErrors,
} from '@ds-proforma/types'
import {
  createGpContribution,
  createParkingRevenue,
  createRevenueItem,
  deleteGpContribution,
  deleteParkingRevenue,
  deleteRevenueItem,
  updateGpContribution,
  updateParkingRevenue,
  updateRevenueItem,
} from '../../api.js'
import { calculateNetParking, calculateNetRevenue, gpPartners } from './revenueHelpers.js'
import type {
  ApartmentRevenueRow,
  CarryingCostRow,
  EntityId,
  GpContributionRow,
  ParkingRevenueRow,
  ProjectDetail,
} from '../../types'
type RequestStatus = 'idle' | 'saving' | 'error'
type RevenueModalType = 'apartment' | 'parking' | 'gp'

type OffsetFormatter = (offset?: number | null) => string
type CalendarLabelFormatter = (offset: number) => string
type CalendarInputFormatter = (value: string | number | null | undefined) => string
type MonthInputConverter = (value: string | number | null | undefined) => number

type RevenueProjectSlice = Pick<ProjectDetail, 'id' | 'revenue' | 'parkingRevenue' | 'gpContributions'>

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

type GpContributionFormState = {
  partner: string
  amountUsd: string
  contributionMonth: string
}

const parseOptionalNumber = (value: string) => {
  if (value.trim() === '') return null
  return Number(value)
}

const parseNumberWithDefault = (value: string, fallback: number) => {
  if (value.trim() === '') return fallback
  return Number(value)
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

const createDefaultGpForm = (): GpContributionFormState => ({
  partner: gpPartners[0].id,
  amountUsd: '',
  contributionMonth: '1',
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
  const [parkingForm, setParkingForm] = useState<ParkingFormState>(() => createDefaultParkingForm())
  const [gpContributionForm, setGpContributionForm] = useState<GpContributionFormState>(() => createDefaultGpForm())
  const [editingRevenueId, setEditingRevenueId] = useState<EntityId | null>(null)
  const [editingParkingId, setEditingParkingId] = useState<EntityId | null>(null)
  const [editingGpId, setEditingGpId] = useState<EntityId | null>(null)
  const [pendingRevenueDeleteId, setPendingRevenueDeleteId] = useState<EntityId | null>(null)
  const [pendingParkingDeleteId, setPendingParkingDeleteId] = useState<EntityId | null>(null)
  const [pendingGpDeleteId, setPendingGpDeleteId] = useState<EntityId | null>(null)
  const [parkingDeleteStatus, setParkingDeleteStatus] = useState<RequestStatus>('idle')
  const [parkingDeleteError, setParkingDeleteError] = useState('')
  const [gpDeleteStatus, setGpDeleteStatus] = useState<RequestStatus>('idle')
  const [gpDeleteError, setGpDeleteError] = useState('')
  const [revenueMenuOpen, setRevenueMenuOpen] = useState(false)
  const revenueMenuRef = useRef<HTMLDivElement | null>(null)

  const apartmentRows: ApartmentRevenueRow[] = project?.revenue ?? []
  const parkingRows: ParkingRevenueRow[] = project?.parkingRevenue ?? []
  const gpRows: GpContributionRow[] = project?.gpContributions ?? []

  const isEditingApartment = Boolean(editingRevenueId)
  const isEditingParking = Boolean(editingParkingId)
  const isEditingGp = Boolean(editingGpId)

  const totalMonthlyRevenue = useMemo(() => {
    const apartments = apartmentRows.reduce((sum, row) => sum + calculateNetRevenue(row), 0)
    const parking = parkingRows.reduce((sum, row) => sum + calculateNetParking(row), 0)
    return apartments + parking
  }, [apartmentRows, parkingRows])

  const resetRevenueForms = useCallback(() => {
    setRevenueForm(createDefaultRevenueForm())
    setParkingForm(createDefaultParkingForm())
    setGpContributionForm(createDefaultGpForm())
    setEditingRevenueId(null)
    setEditingParkingId(null)
    setEditingGpId(null)
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
    setPendingParkingDeleteId(null)
    setPendingGpDeleteId(null)
    setParkingDeleteError('')
    setGpDeleteError('')
    setParkingDeleteStatus('idle')
    setGpDeleteStatus('idle')
  }, [projectId, resetRevenueForms])

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
    setEditingGpId(null)
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
    setEditingGpId(null)
    setIsRevenueModalOpen(true)
  }

  const startEditGpContribution = (row: GpContributionRow) => {
    setRevenueModalError('')
    setGpContributionForm({
      partner: row.partner || gpPartners[0].id,
      amountUsd: row.amountUsd !== null && row.amountUsd !== undefined ? String(row.amountUsd) : '',
      contributionMonth: formatOffsetForInput(row.contributionMonth),
    })
    setRevenueModalType('gp')
    setEditingGpId(row.id)
    setEditingRevenueId(null)
    setEditingParkingId(null)
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

  const buildParkingPayload = () => ({
    typeLabel: parkingForm.typeLabel.trim(),
    spaceCount: parseOptionalNumber(parkingForm.spaceCount),
    monthlyRentUsd: parseOptionalNumber(parkingForm.monthlyRentUsd),
    vacancyPct: parseNumberWithDefault(parkingForm.vacancyPct, 5),
    startMonth: convertMonthInputToOffset(parkingForm.startMonth),
  })

  const buildGpPayload = () => ({
    partner: gpContributionForm.partner,
    amountUsd: parseOptionalNumber(gpContributionForm.amountUsd),
    contributionMonth: convertMonthInputToOffset(gpContributionForm.contributionMonth),
  })

  const refreshProject = async () => {
    if (!projectId || !onProjectRefresh) return
    await onProjectRefresh(projectId)
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
      } else if (revenueModalType === 'parking') {
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
      } else {
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
      }
      setRevenueStatus('idle')
      setIsRevenueModalOpen(false)
      resetRevenueForms()
      await refreshProject()
    } catch (err) {
      setRevenueStatus('error')
      setRevenueModalError(getErrorMessage(err))
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

  const handleDeleteGpContribution = (id: EntityId) => {
    if (!projectId) return
    setGpDeleteError('')
    setPendingGpDeleteId(id)
  }

  const confirmDeleteGpContribution = async () => {
    if (!projectId || !pendingGpDeleteId) return
    setGpDeleteStatus('saving')
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

  const cancelDeleteGpContribution = () => {
    if (gpDeleteStatus === 'saving') return
    setPendingGpDeleteId(null)
    setGpDeleteError('')
    setGpDeleteStatus('idle')
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
                <button type="button" onClick={() => openRevenueModal('parking')}>
                  Parking Type
                </button>
                <button type="button" onClick={() => openRevenueModal('gp')}>
                  GP Contribution
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="revenue-sections">
          <section className="revenue-section">
            <div className="section-header">
              <h4>Apartments</h4>
              <p className="muted tiny">Start month controls when revenue begins</p>
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
              <h4>Parking</h4>
              <p className="muted tiny">Tracks garages, covered, uncovered, etc.</p>
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

          <section className="revenue-section">
            <div className="section-header">
              <h4>GP Contributions</h4>
              <p className="muted tiny">One-time capital infusions</p>
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
                  {gpRows.map((row) => (
                    <tr key={row.id}>
                      <td>{gpPartners.find((p) => p.id === row.partner)?.label || row.partner}</td>
                      <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                      <td>
                        <div className="month-label">
                          <span>{`Month ${formatOffsetForInput(row.contributionMonth)}`}</span>
                          <span className="month-calendar">{getCalendarLabelForOffset(row.contributionMonth)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="icon-button" onClick={() => startEditGpContribution(row)}>
                            ✏️
                          </button>
                          <button type="button" className="icon-delete" onClick={() => handleDeleteGpContribution(row.id)}>
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {gpRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>No GP contributions yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="revenue-summary">
            <span>Recurring monthly revenue (Apartments + Parking)</span>
            <strong>
              $
              {totalMonthlyRevenue.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </strong>
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
                : revenueModalType === 'parking'
                  ? isEditingParking
                    ? 'Edit Parking Type'
                    : 'Add Parking Type'
                  : isEditingGp
                    ? 'Edit GP Contribution'
                    : 'Add GP Contribution'}
            </h3>
            <form className="modal-form" onSubmit={handleAddRevenue}>
              {revenueModalType === 'apartment' && (
                <>
                  <label>
                    Type label
                    <input
                      type="text"
                      value={revenueForm.typeLabel}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, typeLabel: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                      required
                    />
                  </label>
                  <label>
                    Unit SqFt
                    <input
                      type="number"
                      value={revenueForm.unitSqft}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, unitSqft: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Number of units
                    <input
                      type="number"
                      value={revenueForm.unitCount}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, unitCount: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Monthly rent (USD)
                    <input
                      type="number"
                      value={revenueForm.rentBudget}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, rentBudget: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Vacancy %
                    <input
                      type="number"
                      value={revenueForm.vacancyPct}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, vacancyPct: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Start month
                    <input
                      type="number"
                      value={revenueForm.startMonth}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, startMonth: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                    <span className="month-hint">{getCalendarLabelForInput(revenueForm.startMonth)}</span>
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

              {revenueModalType === 'gp' && (
                <>
                  <label>
                    Partner
                    <select
                      value={gpContributionForm.partner}
                      onChange={(e) => setGpContributionForm((prev) => ({ ...prev, partner: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    >
                      {gpPartners.map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Contribution amount (USD)
                    <input
                      type="number"
                      value={gpContributionForm.amountUsd}
                      onChange={(e) => setGpContributionForm((prev) => ({ ...prev, amountUsd: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Contribution month
                    <input
                      type="number"
                      value={gpContributionForm.contributionMonth}
                      onChange={(e) =>
                        setGpContributionForm((prev) => ({ ...prev, contributionMonth: e.target.value }))
                      }
                      disabled={revenueStatus === 'saving'}
                    />
                    <span className="month-hint">{getCalendarLabelForInput(gpContributionForm.contributionMonth)}</span>
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
                      : revenueModalType === 'parking'
                        ? isEditingParking
                          ? 'Save Changes'
                          : 'Save Parking Type'
                        : isEditingGp
                          ? 'Save Changes'
                          : 'Save GP Contribution'}
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

      {pendingGpDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete GP contribution?</h3>
            <p>This will remove the one-time contribution entry.</p>
            {gpDeleteError && <p className="error">{gpDeleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteGpContribution} disabled={gpDeleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDeleteGpContribution} disabled={gpDeleteStatus === 'saving'}>
                {gpDeleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

