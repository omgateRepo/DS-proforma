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
import { GeneralTab } from './features/general/GeneralTab.jsx'
import { KanbanBoard } from './features/kanban/KanbanBoard.jsx'
import { CashflowBoard } from './features/cashflow/CashflowBoard.jsx'
import { calculateNetParking, calculateNetRevenue, gpPartners } from './features/revenue/revenueHelpers.js'
import {
  buildContributionValues,
  buildRecurringLineValues,
  buildCashflowRows,
  buildExpenseSeries,
  buildCarryingSeries,
} from './features/cashflow/cashflowHelpers.js'
import { CarryingCostsSection } from './features/carrying/CarryingCostsSection.jsx'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'hard', label: 'Hard Costs' },
  { id: 'soft', label: 'Soft Costs' },
  { id: 'carrying', label: 'Carrying Costs' },
  { id: 'cashflow', label: 'Cashflow' },
]

const CASHFLOW_MONTHS = 60

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

  const clampInputToCashflowMonth = (value) => {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    if (Number.isNaN(parsed)) return null
    return Math.min(CASHFLOW_MONTHS - 1, Math.max(0, Math.trunc(parsed)))
  }

  const convertMonthInputToOffset = (value) => {
    const normalized = normalizeMonthInputValue(value) - 1
    return Math.max(0, Math.min(CASHFLOW_MONTHS - 1, normalized))
  }

  const formatOffsetForInput = (offset) => String((offset ?? 0) + 1)

  const getCalendarLabelForOffset = (offset) => {
    const clamped = clampInputToCashflowMonth(offset)
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

  const handleGeneralFieldChange = (field, value) => {
    setGeneralForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleAddressInputChange = (value) => {
    setAddressQuery(value)
    setGeneralForm((prev) => ({
      ...prev,
      addressLine1: value,
    }))
  }

  const handleAddressInputFocus = () => {
    setAddressInputTouched(true)
  }

  const apartmentRevenueRows = selectedProject?.revenue || []
  const parkingRevenueRows = selectedProject?.parkingRevenue || []
  const gpContributionRows = selectedProject?.gpContributions || []
  const carryingCostRows = selectedProject?.carryingCosts || []

  const cashflowMonths = useMemo(() => {
    return Array.from({ length: CASHFLOW_MONTHS }, (_, index) => {
      const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + index, 1)
      return {
        index,
        label: `M${index + 1}`,
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
    () => buildExpenseSeries(selectedProject?.softCosts || [], 'Soft Costs', CASHFLOW_MONTHS),
    [selectedProject],
  )

  const hardCostSeries = useMemo(
    () => buildExpenseSeries(selectedProject?.hardCosts || [], 'Hard Costs', CASHFLOW_MONTHS),
    [selectedProject],
  )

  const carryingCostSeries = useMemo(
    () => buildCarryingSeries(carryingCostRows, CASHFLOW_MONTHS),
    [carryingCostRows],
  )

  const cashflowRows = useMemo(() => {
    return buildCashflowRows({
      months: cashflowMonths,
      revenueSeries,
      softCostSeries,
      hardCostSeries,
      carryingCostSeries,
    })
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
      {isKanbanView ? (
        <KanbanBoard
          stageOptions={stageOptions}
          projectsByStage={projectsByStage}
          onSelectProject={setSelectedProjectId}
          onStageChange={handleStageChange}
          stageUpdatingFor={stageUpdatingFor}
          onAddProject={openCreateModal}
          weather={weather}
          weatherStatus={weatherStatus}
          weatherError={weatherError}
        />
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
                <GeneralTab
                  form={generalForm}
                  generalStatus={generalStatus}
                  onSubmit={handleGeneralSave}
                  onFieldChange={handleGeneralFieldChange}
                  addressQuery={addressQuery}
                  onAddressQueryChange={handleAddressInputChange}
                  addressSuggestions={addressSuggestions}
                  addressSearchStatus={addressSearchStatus}
                  addressSearchError={addressSearchError}
                  onAddressInputFocus={handleAddressInputFocus}
                  onAddressSelect={handleAddressSelect}
                  selectedCoords={selectedCoords}
                  apiOrigin={apiOrigin}
                />
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

              {activeTab === 'carrying' && (
                <CarryingCostsSection
                  project={selectedProject}
                  projectId={selectedProjectId}
                  onProjectRefresh={loadProjectDetail}
                  formatOffsetForInput={formatOffsetForInput}
                  convertMonthInputToOffset={convertMonthInputToOffset}
                  getCalendarLabelForInput={getCalendarLabelForInput}
                />
              )}

              {activeTab === 'cashflow' && (
                <CashflowBoard
                  months={cashflowMonths}
                  rows={cashflowRows}
                  closingMonthLabel={closingMonthLabel}
                  expandedRows={expandedCashflowRows}
                  onToggleRow={toggleCashflowRow}
                />
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
