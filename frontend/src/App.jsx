import { Fragment, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  API_BASE,
  createProject,
  deleteProject,
  fetchPhiladelphiaWeather,
  fetchProjectDetail,
  fetchProjects,
  searchAddresses,
  stageLabels,
  updateProjectGeneral,
  updateProjectStage,
} from './api.js'
import { RevenueSection } from './features/revenue/RevenueSection.jsx'
import { HardCostsSection } from './features/costs/HardCostsSection.jsx'
import { SoftCostsSection } from './features/costs/SoftCostsSection.jsx'
import { calculateNetParking, calculateNetRevenue, gpPartners } from './features/revenue/revenueHelpers.js'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'hard', label: 'Hard Costs' },
  { id: 'soft', label: 'Soft Costs' },
  { id: 'carrying', label: 'Carrying Costs' },
  { id: 'cashflow', label: 'Cashflow' },
]

const CASHFLOW_MONTHS = 60

const clampCashflowMonth = (value) => {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.min(CASHFLOW_MONTHS - 1, Math.trunc(parsed)))
}

const defaultGeneralForm = {
  name: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
  propertyType: '',
  purchasePriceUsd: '',
  closingDate: '',
  latitude: '',
  longitude: '',
  targetUnits: '',
  targetSqft: '',
  description: '',
}

const buildRecurringLineValues = (netAmount, startMonth) => {
  const startIndex = clampCashflowMonth(startMonth)
  const values = Array(CASHFLOW_MONTHS).fill(0)
  for (let idx = startIndex; idx < CASHFLOW_MONTHS; idx += 1) {
    values[idx] = netAmount
  }
  return values
}

const buildContributionValues = (amount, monthIndex) => {
  const values = Array(CASHFLOW_MONTHS).fill(0)
  const index = clampCashflowMonth(monthIndex)
  values[index] = amount || 0
  return values
}

function App() {
  const [projects, setProjects] = useState([])
  const [projectsStatus, setProjectsStatus] = useState('loading')
  const [projectsError, setProjectsError] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)
  const [detailStatus, setDetailStatus] = useState('idle')
  const [detailError, setDetailError] = useState('')
  const [activeTab, setActiveTab] = useState('general')
  const [generalForm, setGeneralForm] = useState(defaultGeneralForm)
  const [generalStatus, setGeneralStatus] = useState('idle')
  const [newProjectName, setNewProjectName] = useState('')
  const [createStatus, setCreateStatus] = useState('idle')
  const [createError, setCreateError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [weather, setWeather] = useState(null)
  const [weatherStatus, setWeatherStatus] = useState('loading')
  const [weatherError, setWeatherError] = useState('')
  const [stageUpdatingFor, setStageUpdatingFor] = useState(null)
  const [addressQuery, setAddressQuery] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState([])
  const [addressSearchStatus, setAddressSearchStatus] = useState('idle')
  const [addressSearchError, setAddressSearchError] = useState('')
  const [addressInputTouched, setAddressInputTouched] = useState(false)
  const [selectedCoords, setSelectedCoords] = useState(null)
  const [projectCoords, setProjectCoords] = useState({})
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState(null)
  const [deleteStatus, setDeleteStatus] = useState('idle')
  const [expandedCashflowRows, setExpandedCashflowRows] = useState(() => new Set())

  const stageOptions = stageLabels()
  const apiOrigin = (API_BASE || '').replace(/\/$/, '')
  const baseDate = useMemo(() => {
    const closingDate = selectedProject?.general?.closingDate
    const parsed = closingDate ? new Date(closingDate) : new Date()
    if (Number.isNaN(parsed.getTime())) return new Date()
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1)
  }, [selectedProject?.general?.closingDate])

  const normalizeMonthInputValue = (value, fallback = 1) => {
    const num = Number(value)
    if (Number.isNaN(num)) return fallback
    return Math.max(1, Math.min(CASHFLOW_MONTHS, Math.trunc(num)))
  }

  const convertMonthInputToOffset = (value) => clampCashflowMonth(normalizeMonthInputValue(value) - 1)

  const formatOffsetForInput = (offset) => String((offset ?? 0) + 1)

  const getCalendarLabelForOffset = (offset) => {
    const clamped = clampCashflowMonth(offset)
    const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + clamped, 1)
    return date.toLocaleString('default', { month: 'short', year: 'numeric' })
  }

  const getCalendarLabelForInput = (value) => {
    if (value === '' || value === null || value === undefined) return ''
    const display = normalizeMonthInputValue(value)
    return `Month ${display} • ${getCalendarLabelForOffset(display - 1)}`
  }

  const getCalendarLabelsForListInput = (value) => {
    if (!value) return ''
    const entries = value
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean)
    if (!entries.length) return ''
    return entries.map((segment) => getCalendarLabelForInput(segment)).filter(Boolean).join(', ')
  }

  const formatDateForInput = (value) => {
    if (!value) return ''
    return value.split('T')[0]
  }

const formatNumberForInput = (value) => (value === null || value === undefined ? '' : String(value))

const parseFloatOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

  const formatCurrencyCell = (value) => {
    if (!value) return '—'
    const amount = Number(value)
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.005) return '—'
    return `${amount < 0 ? '-' : ''}$${Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`
  }

  const toggleCashflowRow = (rowId) => {
    setExpandedCashflowRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  const apartmentRevenueRows = selectedProject?.revenue || []
  const parkingRevenueRows = selectedProject?.parkingRevenue || []
  const gpContributionRows = selectedProject?.gpContributions || []

  const buildAllocationsForCost = (row) => {
    const allocations = Array(CASHFLOW_MONTHS).fill(0)
    const amount = Number(row?.amountUsd) || 0
    if (!amount) return allocations

    const addShare = (month, share) => {
      const idx = clampCashflowMonth(month)
      if (idx === null || !Number.isFinite(share)) return
      allocations[idx] += share
    }

    const paymentMode = row.paymentMode || 'single'

    if (paymentMode === 'range') {
      let start = clampCashflowMonth(row.startMonth ?? row.paymentMonth ?? 0)
      let end = clampCashflowMonth(row.endMonth ?? row.startMonth ?? start)
      if (start === null) start = 0
      if (end === null) end = start
      if (end < start) {
        const swap = start
        start = end
        end = swap
      }
      const span = end - start + 1
      const share = span > 0 ? amount / span : amount
      for (let month = start; month <= end; month += 1) {
        addShare(month, share)
      }
      return allocations
    }

    if (paymentMode === 'multi') {
      let months = Array.isArray(row.monthList) ? row.monthList : []
      if (!months.length && (row.paymentMonth ?? '') !== '') {
        months = [row.paymentMonth]
      }
      const normalizedMonths = months
        .map((entry) => clampCashflowMonth(entry))
        .filter((entry) => entry !== null)
      if (!normalizedMonths.length) {
        addShare(0, amount)
        return allocations
      }
      let pctArray = Array.isArray(row.monthPercentages) ? row.monthPercentages : []
      pctArray = pctArray.map((value) => Number(value))
      const hasValidPercents =
        pctArray.length === normalizedMonths.length && pctArray.every((value) => Number.isFinite(value))
      if (hasValidPercents) {
        normalizedMonths.forEach((month, index) => {
          addShare(month, (amount * pctArray[index]) / 100)
        })
      } else {
        const evenShare = amount / normalizedMonths.length
        normalizedMonths.forEach((month) => addShare(month, evenShare))
      }
      return allocations
    }

    const month = clampCashflowMonth(row.paymentMonth ?? 0) ?? 0
    addShare(month, amount)
    return allocations
  }

  const buildExpenseSeries = (rows = [], headerLabel) => {
    const totals = Array(CASHFLOW_MONTHS).fill(0)
    const lineItems = rows.map((row, index) => {
      const allocations = buildAllocationsForCost(row)
      allocations.forEach((value, idx) => {
        totals[idx] += value
      })
      return {
        id: row.id || `${headerLabel}-${index}`,
        label: row.costName || `${headerLabel} ${index + 1}`,
        values: allocations.map((value) => value * -1),
      }
    })
    return {
      label: headerLabel,
      type: 'expense',
      baseValues: totals.map((value) => value * -1),
      lineItems,
    }
  }

  const cashflowMonths = useMemo(() => {
    return Array.from({ length: CASHFLOW_MONTHS }, (_, index) => {
      const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + index, 1)
      return {
        index,
        label: `M${index}`,
        calendarLabel: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
      }
    })
  }, [baseDate])

  const revenueSeries = useMemo(() => {
    const apartmentLineItems = apartmentRevenueRows.map((row, index) => {
      const net = calculateNetRevenue(row)
      return {
        id: row.id || `apt-${index}`,
        label: `Apartment • ${row.typeLabel || 'Unit type'}`,
        values: buildRecurringLineValues(net, row.startMonth ?? 0),
      }
    })

    const parkingLineItems = parkingRevenueRows.map((row, index) => {
      const net = calculateNetParking(row)
      return {
        id: row.id || `park-${index}`,
        label: `Parking • ${row.typeLabel || 'Parking'}`,
        values: buildRecurringLineValues(net, row.startMonth ?? 0),
      }
    })

    const gpLineItems = gpContributionRows.map((row, index) => {
      const partnerLabel = gpPartners.find((p) => p.id === row.partner)?.label || row.partner || 'GP'
      return {
        id: row.id || `gp-${index}`,
        label: `GP • ${partnerLabel}`,
        values: buildContributionValues(row.amountUsd || 0, row.contributionMonth ?? 0),
      }
    })

    const lineItems = [...apartmentLineItems, ...parkingLineItems, ...gpLineItems]
    const baseValues = Array(CASHFLOW_MONTHS).fill(0)
    lineItems.forEach((item) => {
      item.values.forEach((value, idx) => {
        baseValues[idx] += value
      })
    })

    return { label: 'Revenues', type: 'revenue', baseValues, lineItems }
  }, [apartmentRevenueRows, parkingRevenueRows, gpContributionRows])

  const softCostSeries = useMemo(
    () => buildExpenseSeries(selectedProject?.softCosts || [], 'Soft Costs'),
    [selectedProject],
  )

  const hardCostSeries = useMemo(
    () => buildExpenseSeries(selectedProject?.hardCosts || [], 'Hard Costs'),
    [selectedProject],
  )

  const carryingCostSeries = useMemo(
    () => ({ label: 'Carrying Costs', type: 'expense', baseValues: Array(CASHFLOW_MONTHS).fill(0), lineItems: [] }),
    [],
  )

  const cashflowRows = useMemo(() => {
    const buildRow = (id, series) => ({
      id,
      label: series.label,
      type: series.type,
      values: series.baseValues,
      subRows: series.lineItems,
    })
    const totalRowValues = cashflowMonths.map((_, index) => {
      return (
        (revenueSeries.baseValues[index] || 0) +
        (softCostSeries.baseValues[index] || 0) +
        (hardCostSeries.baseValues[index] || 0) +
        (carryingCostSeries.baseValues[index] || 0)
      )
    })
    const rows = [
      buildRow('revenues', revenueSeries),
      buildRow('soft', softCostSeries),
      buildRow('hard', hardCostSeries),
      buildRow('carrying', carryingCostSeries),
    ]

    rows.push({
        id: 'total',
        label: 'Total',
        type: 'total',
        values: totalRowValues,
        subRows: [],
    })

    const balanceValues = []
    let runningBalance = 0
    totalRowValues.forEach((value, idx) => {
      runningBalance += value || 0
      balanceValues[idx] = runningBalance
    })

    rows.push({
      id: 'balance',
      label: 'Balance',
      type: 'total',
      values: balanceValues,
      subRows: [],
    })

    return rows
  }, [cashflowMonths, revenueSeries, softCostSeries, hardCostSeries, carryingCostSeries])

  const closingMonthLabel = useMemo(() => {
    if (!selectedProject?.general?.closingDate) return null
    const parsed = new Date(selectedProject.general.closingDate)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toLocaleString('default', { month: 'long', year: 'numeric' })
  }, [selectedProject])

  const projectsByStage = useMemo(() => {
    return stageOptions.reduce((acc, stage) => {
      acc[stage.id] = projects.filter((project) => project.stage === stage.id)
      return acc
    }, {})
  }, [projects, stageOptions])
  const isKanbanView = !selectedProjectId

  const loadProjects = async () => {
    setProjectsStatus('loading')
    setProjectsError('')
    try {
      const rows = await fetchProjects()
        setProjects(rows)
      if (selectedProjectId && !rows.some((row) => row.id === selectedProjectId)) {
        setSelectedProjectId(null)
        setSelectedProject(null)
      }
      setProjectsStatus('loaded')
    } catch (err) {
      setProjectsError(err.message)
      setProjectsStatus('error')
    }
  }

  const loadProjectDetail = async (projectId) => {
    if (!projectId) return
    setDetailStatus('loading')
    setDetailError('')
    try {
      const detail = await fetchProjectDetail(projectId)
      detail.parkingRevenue = detail.parkingRevenue || []
      detail.gpContributions = detail.gpContributions || []
      setSelectedProject(detail)
      setGeneralForm({
        ...defaultGeneralForm,
        name: detail.name,
        ...detail.general,
        purchasePriceUsd: detail.general.purchasePriceUsd || '',
        closingDate: formatDateForInput(detail.general.closingDate),
        latitude: formatNumberForInput(detail.general.latitude),
        longitude: formatNumberForInput(detail.general.longitude),
        targetUnits: detail.general.targetUnits || '',
        targetSqft: detail.general.targetSqft || '',
      })
      setAddressQuery(detail.general.addressLine1 || '')
      setAddressInputTouched(false)
      setAddressSuggestions([])
      const coordsFromDetail =
        detail.general.latitude !== null && detail.general.longitude !== null
          ? { lat: detail.general.latitude, lon: detail.general.longitude }
          : null
      const savedCoords = coordsFromDetail || projectCoords[projectId] || null
      setSelectedCoords(savedCoords || null)
      if (coordsFromDetail) {
        setProjectCoords((prev) => ({ ...prev, [projectId]: coordsFromDetail }))
      }
      setDetailStatus('loaded')
    } catch (err) {
      setDetailError(err.message)
      setDetailStatus('error')
    }
  }

  useEffect(() => {
    loadProjects()
    fetchPhiladelphiaWeather()
      .then((reading) => {
        setWeather(reading)
        setWeatherStatus('loaded')
      })
      .catch((err) => {
        setWeatherError(err.message)
        setWeatherStatus('error')
      })
  }, [])

  useEffect(() => {
    setExpandedCashflowRows(new Set())
  }, [selectedProjectId])

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetail(selectedProjectId)
    }
  }, [selectedProjectId])

  useEffect(() => {
    if (!addressInputTouched) return
    if (!addressQuery || addressQuery.length < 3) {
      setAddressSuggestions([])
      return
    }
    setAddressSearchStatus('loading')
    setAddressSearchError('')
    const timeout = setTimeout(async () => {
      try {
        const results = await searchAddresses(addressQuery)
        setAddressSuggestions(results)
        setAddressSearchStatus('loaded')
      } catch (err) {
        setAddressSearchStatus('error')
        setAddressSearchError(err.message)
        setAddressSuggestions([])
      }
    }, 400)
    return () => clearTimeout(timeout)
  }, [addressQuery, addressInputTouched])

  async function handleCreateProject(event) {
    event.preventDefault()
    setCreateError('')
    if (!newProjectName.trim()) {
      setCreateError('Project name is required')
      return
    }

    try {
      setCreateStatus('saving')
      const created = await createProject(newProjectName.trim())
      setProjects((prev) => [created, ...prev])
      setNewProjectName('')
      await loadProjects()
      setIsCreateModalOpen(false)
      setCreateStatus('idle')
    } catch (err) {
      setCreateError(err.message)
      setCreateStatus('error')
    }
  }

  function openCreateModal() {
    setCreateError('')
    setNewProjectName('')
    setIsCreateModalOpen(true)
  }

  function closeCreateModal() {
    if (createStatus === 'saving') return
    setIsCreateModalOpen(false)
  }

  function requestDeleteProject(id) {
    setDeleteError('')
    setPendingDeleteProjectId(id)
  }

  async function confirmDeleteProject() {
    if (!pendingDeleteProjectId) return
    setDeleteStatus('saving')
    try {
      await deleteProject(pendingDeleteProjectId)
      if (pendingDeleteProjectId === selectedProjectId) {
        handleBackToKanban()
      }
      setProjectCoords((prev) => {
        if (!prev[pendingDeleteProjectId]) return prev
        const next = { ...prev }
        delete next[pendingDeleteProjectId]
        return next
      })
      await loadProjects()
      setPendingDeleteProjectId(null)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleteStatus('idle')
    }
  }

  function handleBackToKanban() {
    setSelectedProjectId(null)
    setSelectedProject(null)
  }

  function cancelDeleteProject() {
    if (deleteStatus === 'saving') return
    setPendingDeleteProjectId(null)
    setDeleteError('')
  }

  async function handleStageChange(projectId, stage) {
    setStageUpdatingFor(projectId)
    try {
      await updateProjectStage(projectId, stage)
      await loadProjects()
      if (projectId === selectedProjectId) {
        setSelectedProject((prev) => (prev ? { ...prev, stage } : prev))
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setStageUpdatingFor(null)
    }
  }

  async function handleGeneralSave(event) {
    event.preventDefault()
    if (!selectedProjectId) return
    setGeneralStatus('saving')
    try {
      const payload = {
        ...generalForm,
        purchasePriceUsd: generalForm.purchasePriceUsd ? Number(generalForm.purchasePriceUsd) : null,
        closingDate: generalForm.closingDate || null,
        latitude: parseFloatOrNull(generalForm.latitude),
        longitude: parseFloatOrNull(generalForm.longitude),
        targetUnits: generalForm.targetUnits ? Number(generalForm.targetUnits) : null,
        targetSqft: generalForm.targetSqft ? Number(generalForm.targetSqft) : null,
      }
      const updated = await updateProjectGeneral(selectedProjectId, payload)
      setSelectedProject((prev) => (prev ? { ...prev, name: updated.name, general: updated.general } : prev))
      setAddressQuery(updated.general.addressLine1 || '')
      setGeneralForm((prev) => ({
        ...prev,
        closingDate: formatDateForInput(updated.general.closingDate),
        latitude: formatNumberForInput(updated.general.latitude),
        longitude: formatNumberForInput(updated.general.longitude),
      }))
      if (updated.general.latitude !== null && updated.general.longitude !== null) {
        const coords = { lat: updated.general.latitude, lon: updated.general.longitude }
        setSelectedCoords(coords)
        setProjectCoords((prev) => ({ ...prev, [selectedProjectId]: coords }))
      } else {
        setProjectCoords((prev) => {
          if (!prev[selectedProjectId]) return prev
          const next = { ...prev }
          delete next[selectedProjectId]
          return next
        })
        setSelectedCoords(null)
      }
      setGeneralStatus('idle')
      await loadProjects()
    } catch (err) {
      setGeneralStatus('error')
      alert(err.message)
    }
  }

  function handleAddressSelect(suggestion) {
    setGeneralForm((prev) => ({
      ...prev,
      addressLine1: suggestion.addressLine1 || '',
      city: suggestion.city || '',
      state: suggestion.state || '',
      zip: suggestion.zip || '',
      latitude: suggestion.latitude ? String(suggestion.latitude) : '',
      longitude: suggestion.longitude ? String(suggestion.longitude) : '',
    }))
    setAddressQuery(suggestion.label || suggestion.addressLine1 || '')
    setAddressSuggestions([])
    setAddressInputTouched(false)
    if (suggestion.latitude && suggestion.longitude) {
      const coords = { lat: suggestion.latitude, lon: suggestion.longitude }
      setSelectedCoords(coords)
      if (selectedProjectId) {
        setProjectCoords((prev) => ({ ...prev, [selectedProjectId]: coords }))
      }
    }
  }

  return (
    <div className="app-shell">
      {isKanbanView && (
        <header className="app-header">
          <div>
            <p className="eyebrow">Real Estate Control Center</p>
        <h1>DS Proforma</h1>
          </div>
          <div className="header-actions">
            <div className="weather-card">
              <h3>Philadelphia Weather</h3>
              {weatherStatus === 'loading' && <p>Sampling temperature…</p>}
              {weatherStatus === 'error' && <p className="error">{weatherError}</p>}
              {weatherStatus === 'loaded' && weather && (
                <>
                  <p className="weather-temp">{weather.temperature_c}°C</p>
                  <p className="muted">Sampled at {new Date(weather.sampled_at).toLocaleTimeString('en-US')}</p>
                </>
              )}
            </div>
            <button className="primary" type="button" onClick={openCreateModal}>
              + Add Project
            </button>
          </div>
      </header>
      )}

      {isKanbanView ? (
        <>
          <section className="kanban-section">
            <div className="kanban">
              {stageOptions.map((stage) => (
                <div className="kanban-column" key={stage.id}>
                  <div className="column-header">
                    <h3>{stage.label}</h3>
                    <span className="pill">{projectsByStage[stage.id]?.length ?? 0}</span>
                  </div>
                  <div className="column-body">
                    {projectsByStage[stage.id] && projectsByStage[stage.id].length > 0 ? (
                      projectsByStage[stage.id].map((project) => (
                        <article key={project.id} className="project-card">
                          <div onClick={() => setSelectedProjectId(project.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelectedProjectId(project.id)}>
                            <h4>{project.name}</h4>
                            <p className="muted">
                              {project.city || 'City'}, {project.state || 'State'}
                            </p>
                            <p className="muted">
                              Units: {project.targetUnits ?? '—'} • Budget:{' '}
                              {project.purchasePriceUsd ? `$${(project.purchasePriceUsd / 1_000_000).toFixed(2)}M` : '—'}
                            </p>
                          </div>
                          <select
                            value={project.stage}
                            onChange={(e) => {
                              handleStageChange(project.id, e.target.value)
                            }}
                            disabled={stageUpdatingFor === project.id}
                          >
                            {stageOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </article>
                      ))
                    ) : (
                      <p className="muted empty">No deals</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="detail-section detail-full">
          <div className="detail-nav">
            <button type="button" className="ghost" onClick={handleBackToKanban}>
              ← Back to pipeline
            </button>
          </div>
          {detailStatus === 'loading' && <p>Loading project…</p>}
          {detailStatus === 'error' && <p className="error">{detailError}</p>}
          {selectedProject && detailStatus === 'loaded' && (
            <>
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Project</p>
                  <h2>{selectedProject.name}</h2>
                </div>
              </div>

              <div className="tabs">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    className={tab.id === activeTab ? 'active' : ''}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'general' && (
                <form className="general-form" onSubmit={handleGeneralSave}>
                  <div className="form-grid">
                    <label>
                      Project Name
                      <input
                        type="text"
                        value={generalForm.name}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, name: e.target.value }))}
                        required
                      />
                    </label>
                    <label className="address-autocomplete">
                      Address Line 1
                      <input
                        type="text"
                        value={addressQuery}
                        placeholder="Start typing address"
                        onFocus={() => setAddressInputTouched(true)}
                        onChange={(e) => {
                          setAddressQuery(e.target.value)
                          setGeneralForm((prev) => ({ ...prev, addressLine1: e.target.value }))
                        }}
                      />
                      {addressSearchStatus === 'loading' && <span className="muted tiny">Searching…</span>}
                      {addressSuggestions.length > 0 && (
                        <ul className="address-suggestions">
                          {addressSuggestions.map((suggestion) => (
                            <li key={suggestion.id} onMouseDown={() => handleAddressSelect(suggestion)}>
                              <strong>{suggestion.addressLine1}</strong>
                              <span>{suggestion.label}</span>
                </li>
              ))}
            </ul>
                      )}
                      {addressSearchStatus === 'error' && addressSearchError && (
                        <span className="error tiny">{addressSearchError}</span>
                      )}
                    </label>
                    <label>
                      Address Line 2
                      <input
                        type="text"
                        value={generalForm.addressLine2}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, addressLine2: e.target.value }))}
                      />
                    </label>
                    <label>
                      City
                      <input
                        type="text"
                        value={generalForm.city}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, city: e.target.value }))}
                      />
                    </label>
                    <label>
                      State
                      <input
                        type="text"
                        value={generalForm.state}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, state: e.target.value }))}
                      />
                    </label>
                    <label>
                      ZIP
                      <input
                        type="text"
                        value={generalForm.zip}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, zip: e.target.value }))}
                      />
                    </label>
                    <label>
                      Purchase Price (USD)
                      <input
                        type="number"
                        value={generalForm.purchasePriceUsd}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, purchasePriceUsd: e.target.value }))}
                      />
                    </label>
                    <label>
                      Closing Date
                      <input
                        type="date"
                        value={generalForm.closingDate}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, closingDate: e.target.value }))}
                      />
                    </label>
                    <label>
                      Latitude
                      <input
                        type="number"
                        step="any"
                        value={generalForm.latitude}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, latitude: e.target.value }))}
                      />
                    </label>
                    <label>
                      Longitude
                      <input
                        type="number"
                        step="any"
                        value={generalForm.longitude}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, longitude: e.target.value }))}
                      />
                    </label>
                    <label>
                      Target Units
                      <input
                        type="number"
                        value={generalForm.targetUnits}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, targetUnits: e.target.value }))}
                      />
                    </label>
                    <label>
                      Target SqFt
                      <input
                        type="number"
                        value={generalForm.targetSqft}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, targetSqft: e.target.value }))}
                      />
                    </label>
                  </div>
                  {selectedCoords && (
                    <div className="satellite-preview small">
                      <img
                        src={`${apiOrigin || ''}/api/geocode/satellite?lat=${selectedCoords.lat}&lon=${selectedCoords.lon}&zoom=18`}
                        alt="Satellite preview"
                      />
                    </div>
                  )}
                  <label>
                    Description / Notes
                    <textarea
                      rows={4}
                      value={generalForm.description}
                      onChange={(e) => setGeneralForm((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </label>
                  <div className="actions">
                    <button type="submit" disabled={generalStatus === 'saving'}>
                      {generalStatus === 'saving' ? 'Saving…' : 'Save General Info'}
                    </button>
                  </div>
                </form>
              )}

              {activeTab === 'revenue' && (
                <RevenueSection
                  project={selectedProject}
                  projectId={selectedProjectId}
                  onProjectRefresh={loadProjectDetail}
                  formatOffsetForInput={formatOffsetForInput}
                  getCalendarLabelForOffset={getCalendarLabelForOffset}
                  getCalendarLabelForInput={getCalendarLabelForInput}
                  convertMonthInputToOffset={convertMonthInputToOffset}
                />
              )}

              {activeTab === 'hard' && (
                <HardCostsSection
                  project={selectedProject}
                  projectId={selectedProjectId}
                  onProjectRefresh={loadProjectDetail}
                  formatOffsetForInput={formatOffsetForInput}
                  convertMonthInputToOffset={convertMonthInputToOffset}
                  getCalendarLabelForInput={getCalendarLabelForInput}
                  getCalendarLabelsForListInput={getCalendarLabelsForListInput}
                />
              )}

              {activeTab === 'soft' && (
                <SoftCostsSection
                  project={selectedProject}
                  projectId={selectedProjectId}
                  onProjectRefresh={loadProjectDetail}
                  formatOffsetForInput={formatOffsetForInput}
                  convertMonthInputToOffset={convertMonthInputToOffset}
                  getCalendarLabelForInput={getCalendarLabelForInput}
                  getCalendarLabelsForListInput={getCalendarLabelsForListInput}
                />
              )}

              {activeTab === 'cashflow' && (
                <div className="cashflow-tab">
                  <div className="cashflow-header">
                    <div>
                      <h3>Cashflow (60 months)</h3>
                      <p className="muted tiny">
                        Starting {closingMonthLabel || 'from the current month'} · revenues + hard/soft costs shown
                        (carrying coming next)
                      </p>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table className="cashflow-grid">
                      <thead>
                        <tr>
                          <th>Category</th>
                          {cashflowMonths.map((month) => (
                            <th key={month.index}>
                              <div className="month-label">
                                <span>{month.label}</span>
                                <span className="month-calendar">{month.calendarLabel}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cashflowRows.map((row) => {
                          const isExpandable = row.subRows && row.subRows.length > 0
                          const expanded = isExpandable && expandedCashflowRows.has(row.id)
                          return (
                            <Fragment key={row.id}>
                              <tr className={`cashflow-row ${row.type}`}>
                                <td>
                                  {isExpandable ? (
                                    <button
                                      type="button"
                                      className="cashflow-toggle"
                                      onClick={() => toggleCashflowRow(row.id)}
                                    >
                                      <span>{expanded ? '▾' : '▸'}</span>
                                      {row.label}
                                    </button>
                                  ) : (
                                    row.label
                                  )}
                                </td>
                                {cashflowMonths.map((month) => (
                                  <td key={`${row.id}-${month.index}`}>{formatCurrencyCell(row.values[month.index])}</td>
                                ))}
                              </tr>
                              {expanded &&
                                row.subRows.map((subRow) => (
                                  <tr key={`${row.id}-${subRow.id}`} className="cashflow-row sub cashflow-sub-row">
                                    <td>{subRow.label}</td>
                                    {cashflowMonths.map((month) => (
                                      <td key={`${row.id}-${subRow.id}-${month.index}`}>
                                        {formatCurrencyCell(subRow.values[month.index])}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'carrying' && (
                <div className="placeholder">
                  <p>
                    Carrying costs will be implemented next.
                  </p>
                </div>
              )}

              {activeTab === 'general' && (
                <div className="floating-delete">
                  <button className="icon-delete" type="button" onClick={() => requestDeleteProject(selectedProject.id)}>
                    🗑
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {isCreateModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Add Project</h3>
            <form onSubmit={handleCreateProject} className="modal-form">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                required
                disabled={createStatus === 'saving'}
              />
              {createError && <p className="error">{createError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeCreateModal} disabled={createStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={createStatus === 'saving'}>
                  {createStatus === 'saving' ? 'Creating…' : 'Create'}
                </button>
    </div>
            </form>
          </div>
        </div>
      )}


      {pendingDeleteProjectId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete project?</h3>
            <p>This will permanently remove the project and all related data.</p>
            {deleteError && <p className="error">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteProject} disabled={deleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDeleteProject} disabled={deleteStatus === 'saving'}>
                {deleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
