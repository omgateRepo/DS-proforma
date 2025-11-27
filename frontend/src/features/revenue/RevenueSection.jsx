import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const createDefaultRevenueForm = () => ({
  typeLabel: '',
  unitSqft: '',
  unitCount: '',
  rentBudget: '',
  vacancyPct: '5',
  startMonth: '1',
})

const createDefaultParkingForm = () => ({
  typeLabel: '',
  spaceCount: '',
  monthlyRentUsd: '',
  vacancyPct: '5',
  startMonth: '1',
})

const createDefaultGpForm = () => ({
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
}) {
  const [revenueModalType, setRevenueModalType] = useState('apartment')
  const [isRevenueModalOpen, setIsRevenueModalOpen] = useState(false)
  const [revenueModalError, setRevenueModalError] = useState('')
  const [revenueStatus, setRevenueStatus] = useState('idle')
  const [revenueForm, setRevenueForm] = useState(createDefaultRevenueForm)
  const [parkingForm, setParkingForm] = useState(createDefaultParkingForm)
  const [gpContributionForm, setGpContributionForm] = useState(createDefaultGpForm)
  const [editingRevenueId, setEditingRevenueId] = useState(null)
  const [editingParkingId, setEditingParkingId] = useState(null)
  const [editingGpId, setEditingGpId] = useState(null)
  const [pendingRevenueDeleteId, setPendingRevenueDeleteId] = useState(null)
  const [pendingParkingDeleteId, setPendingParkingDeleteId] = useState(null)
  const [pendingGpDeleteId, setPendingGpDeleteId] = useState(null)
  const [parkingDeleteStatus, setParkingDeleteStatus] = useState('idle')
  const [parkingDeleteError, setParkingDeleteError] = useState('')
  const [gpDeleteStatus, setGpDeleteStatus] = useState('idle')
  const [gpDeleteError, setGpDeleteError] = useState('')
  const [revenueMenuOpen, setRevenueMenuOpen] = useState(false)
  const revenueMenuRef = useRef(null)

  const apartmentRows = project?.revenue || []
  const parkingRows = project?.parkingRevenue || []
  const gpRows = project?.gpContributions || []

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
    const handleClick = (event) => {
      if (!revenueMenuRef.current) return
      if (revenueMenuRef.current.contains(event.target)) return
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

  const openRevenueModal = (type) => {
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

  const startEditApartment = (row) => {
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

  const startEditParking = (row) => {
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

  const startEditGpContribution = (row) => {
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
    typeLabel: revenueForm.typeLabel,
    unitSqft: revenueForm.unitSqft ? Number(revenueForm.unitSqft) : null,
    unitCount: revenueForm.unitCount ? Number(revenueForm.unitCount) : null,
    rentBudget: revenueForm.rentBudget ? Number(revenueForm.rentBudget) : null,
    vacancyPct: revenueForm.vacancyPct ? Number(revenueForm.vacancyPct) : 5,
    startMonth: convertMonthInputToOffset(revenueForm.startMonth),
  })

  const buildParkingPayload = () => ({
    typeLabel: parkingForm.typeLabel,
    spaceCount: parkingForm.spaceCount ? Number(parkingForm.spaceCount) : null,
    monthlyRentUsd: parkingForm.monthlyRentUsd ? Number(parkingForm.monthlyRentUsd) : null,
    vacancyPct: parkingForm.vacancyPct ? Number(parkingForm.vacancyPct) : 5,
    startMonth: convertMonthInputToOffset(parkingForm.startMonth),
  })

  const buildGpPayload = () => ({
    partner: gpContributionForm.partner,
    amountUsd: gpContributionForm.amountUsd ? Number(gpContributionForm.amountUsd) : null,
    contributionMonth: convertMonthInputToOffset(gpContributionForm.contributionMonth),
  })

  const refreshProject = async () => {
    if (!projectId || !onProjectRefresh) return
    await onProjectRefresh(projectId)
  }

  const handleAddRevenue = async (event) => {
    event.preventDefault()
    if (!projectId) return
    setRevenueStatus('saving')
    setRevenueModalError('')

    try {
      if (revenueModalType === 'apartment') {
        const payload = buildApartmentPayload()
        if (!payload.typeLabel.trim()) throw new Error('Apartment type name is required.')
        if (!payload.unitCount) throw new Error('Number of units is required.')
        if (payload.rentBudget === null) throw new Error('Monthly rent is required.')
        if (editingRevenueId) {
          await updateRevenueItem(projectId, editingRevenueId, payload)
        } else {
          await createRevenueItem(projectId, payload)
        }
      } else if (revenueModalType === 'parking') {
        const payload = buildParkingPayload()
        if (!payload.typeLabel.trim()) throw new Error('Parking type name is required.')
        if (!payload.spaceCount) throw new Error('Number of spaces is required.')
        if (payload.monthlyRentUsd === null) throw new Error('Monthly rent per space is required.')
        if (editingParkingId) {
          await updateParkingRevenue(projectId, editingParkingId, payload)
        } else {
          await createParkingRevenue(projectId, payload)
        }
      } else {
        const payload = buildGpPayload()
        if (payload.amountUsd === null) throw new Error('Contribution amount is required.')
        if (editingGpId) {
          await updateGpContribution(projectId, editingGpId, payload)
        } else {
          await createGpContribution(projectId, payload)
        }
      }
      setRevenueStatus('idle')
      setIsRevenueModalOpen(false)
      resetRevenueForms()
      await refreshProject()
    } catch (err) {
      setRevenueStatus('error')
      setRevenueModalError(err.message)
    }
  }

  const handleDeleteRevenue = (id) => {
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
      setRevenueModalError(err.message)
    }
  }

  const cancelDeleteRevenue = () => {
    if (revenueStatus === 'saving') return
    setPendingRevenueDeleteId(null)
    if (revenueStatus === 'error') {
      setRevenueStatus('idle')
    }
  }

  const handleDeleteParking = (id) => {
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
      setParkingDeleteError(err.message)
    }
  }

  const cancelDeleteParking = () => {
    if (parkingDeleteStatus === 'saving') return
    setPendingParkingDeleteId(null)
    setParkingDeleteError('')
    setParkingDeleteStatus('idle')
  }

  const handleDeleteGpContribution = (id) => {
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
      setGpDeleteError(err.message)
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
                            <span>{`Month ${formatOffsetForInput(row.startMonth)}`}</span>
                            <span className="month-calendar">{getCalendarLabelForOffset(row.startMonth)}</span>
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
                            <span>{`Month ${formatOffsetForInput(row.startMonth)}`}</span>
                            <span className="month-calendar">{getCalendarLabelForOffset(row.startMonth)}</span>
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

              {revenueModalError && <p className="error">{revenueModalError}</p>}
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

