import { Fragment, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  API_BASE,
  clearAuthCredentials,
  createProject,
  deleteProject,
  fetchPhiladelphiaWeather,
  fetchProjectDetail,
  fetchProjects,
  getAuthCredentials,
  onUnauthorized,
  searchAddresses,
  setAuthCredentials,
  stageLabels,
  updateProjectGeneral,
  updateProjectStage,
} from './api.js'
import { RevenueSection } from './features/revenue/RevenueSection'
import { HardCostsSection } from './features/costs/HardCostsSection'
import { SoftCostsSection } from './features/costs/SoftCostsSection'
import { GeneralTab } from './features/general/GeneralTab'
import { KanbanBoard } from './features/kanban/KanbanBoard'
import { CashflowBoard } from './features/cashflow/CashflowBoard'
import { calculateNetParking, calculateNetRevenue, gpPartners } from './features/revenue/revenueHelpers.js'
import {
  buildContributionValues,
  buildRecurringLineValues,
  buildCashflowRows,
  buildExpenseSeries,
  buildCarryingSeries,
} from './features/cashflow/cashflowHelpers.js'
import { CarryingCostsSection } from './features/carrying/CarryingCostsSection'
import { MetricsTab } from './features/metrics/MetricsTab'
import type {
  AddressSuggestion,
  ApartmentRevenueRow,
  CarryingCostRow,
  EntityId,
  GeneralFormState,
  GpContributionRow,
  ParkingRevenueRow,
  ProjectDetail,
  ProjectStage,
  ProjectSummary,
  WeatherReading,
} from './types'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'hard', label: 'Hard Costs' },
  { id: 'soft', label: 'Soft Costs' },
  { id: 'carrying', label: 'Carrying Costs' },
  { id: 'cashflow', label: 'Cashflow' },
  { id: 'metrics', label: 'Metrics & Sensitivities' },
] as const

type TabId = (typeof TABS)[number]['id']
type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'
type RequestStatus = 'idle' | 'saving' | 'error'
type AddressSearchStatus = 'idle' | 'loading' | 'loaded' | 'error'
type SelectedCoords = { lat: number; lon: number } | null
type CashflowMonthMeta = { index: number; label: string; calendarLabel: string }
type AuthFormState = { username: string; password: string }

const CASHFLOW_MONTHS = 60
const defaultGeneralForm: GeneralFormState = {
  name: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
  purchasePriceUsd: '',
  closingDate: '',
  latitude: '',
  longitude: '',
  targetUnits: '',
  targetSqft: '',
  description: '',
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
const getCoordKey = (id: EntityId) => String(id)

function App() {
  const initialAuth = getAuthCredentials()
  const initialProjectsStatus: LoadStatus = initialAuth ? 'loading' : 'idle'
  const initialWeatherStatus: LoadStatus = initialAuth ? 'loading' : 'idle'
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectsStatus, setProjectsStatus] = useState<LoadStatus>(initialProjectsStatus)
  const [projectsError, setProjectsError] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<EntityId | null>(null)
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null)
  const [detailStatus, setDetailStatus] = useState<LoadStatus>('idle')
  const [detailError, setDetailError] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [generalForm, setGeneralForm] = useState<GeneralFormState>(defaultGeneralForm)
  const [generalStatus, setGeneralStatus] = useState<RequestStatus>('idle')
  const [newProjectName, setNewProjectName] = useState('')
  const [createStatus, setCreateStatus] = useState<RequestStatus>('idle')
  const [createError, setCreateError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [weather, setWeather] = useState<WeatherReading | null>(null)
  const [weatherStatus, setWeatherStatus] = useState<LoadStatus>(initialWeatherStatus)
  const [weatherError, setWeatherError] = useState('')
  const [stageUpdatingFor, setStageUpdatingFor] = useState<EntityId | null>(null)
  const [addressQuery, setAddressQuery] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [addressSearchStatus, setAddressSearchStatus] = useState<AddressSearchStatus>('idle')
  const [addressSearchError, setAddressSearchError] = useState('')
  const [addressInputTouched, setAddressInputTouched] = useState(false)
  const [selectedCoords, setSelectedCoords] = useState<SelectedCoords>(null)
  const [projectCoords, setProjectCoords] = useState<Record<string, { lat: number; lon: number }>>({})
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<EntityId | null>(null)
  const [deleteStatus, setDeleteStatus] = useState<RequestStatus>('idle')
  const [expandedCashflowRows, setExpandedCashflowRows] = useState<Set<string>>(() => new Set<string>())
  const [authForm, setAuthForm] = useState<AuthFormState>({
    username: initialAuth?.username ?? '',
    password: initialAuth?.password ?? '',
  })
  const [authStatus, setAuthStatus] = useState<RequestStatus>('idle')
  const [authError, setAuthError] = useState('')
  const [isAuthReady, setIsAuthReady] = useState(Boolean(initialAuth))
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(!initialAuth)

  const stageOptions = stageLabels() as Array<{ id: ProjectStage; label: string }>
  const apiOrigin = (API_BASE || '').replace(/\/$/, '')
  const baseDate = useMemo(() => {
    const closingDate = selectedProject?.general?.closingDate
    const parsed = closingDate ? new Date(closingDate) : new Date()
    if (Number.isNaN(parsed.getTime())) return new Date()
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1)
  }, [selectedProject?.general?.closingDate])

  const normalizeMonthInputValue = (value: string | number, fallback = 1) => {
    const num = Number(value)
    if (Number.isNaN(num)) return fallback
    return Math.max(1, Math.min(CASHFLOW_MONTHS, Math.trunc(num)))
  }

  const clampInputToCashflowMonth = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    if (Number.isNaN(parsed)) return null
    return Math.min(CASHFLOW_MONTHS - 1, Math.max(0, Math.trunc(parsed)))
  }

  const convertMonthInputToOffset = (value: string | number | null | undefined) => {
    const normalized = normalizeMonthInputValue(value ?? 1) - 1
    return Math.max(0, Math.min(CASHFLOW_MONTHS - 1, normalized))
  }

  const formatOffsetForInput = (offset?: number | null) => String((offset ?? 0) + 1)

  const getCalendarLabelForOffset = (offset: number | null) => {
    const clamped = clampInputToCashflowMonth(offset)
    if (clamped === null) return ''
    const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + clamped, 1)
    return date.toLocaleString('default', { month: 'short', year: 'numeric' })
  }

  const getCalendarLabelForInput = (value: string | number | null | undefined) => {
    if (value === '' || value === null || value === undefined) return ''
    const display = normalizeMonthInputValue(value)
    return `Month ${display} • ${getCalendarLabelForOffset(display - 1)}`
  }

  const getCalendarLabelsForListInput = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return ''
    const normalized = typeof value === 'number' ? String(value) : value
    if (!normalized) return ''
    const entries = normalized
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean)
    if (!entries.length) return ''
    return entries.map((segment) => getCalendarLabelForInput(segment)).filter(Boolean).join(', ')
  }

  const formatDateForInput = (value: string | null | undefined) => {
    if (!value) return ''
    return value.split('T')[0]
  }

  const formatNumberForInput = (value: number | string | null | undefined) =>
    value === null || value === undefined ? '' : String(value)

  const parseFloatOrNull = (value: string | number | null | undefined) => {
    if (value === '' || value === null || value === undefined) return null
    const parsed = Number(value)
    return Number.isNaN(parsed) ? null : parsed
  }

  const toggleCashflowRow = (rowId: string) => {
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

  const handleGeneralFieldChange = (field: keyof GeneralFormState, value: string) => {
    setGeneralForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleAddressInputChange = (value: string) => {
    setAddressQuery(value)
    setGeneralForm((prev) => ({
      ...prev,
      addressLine1: value,
    }))
  }

  const handleAddressInputFocus = () => {
    setAddressInputTouched(true)
  }

  const apartmentRevenueRows: ApartmentRevenueRow[] = selectedProject?.revenue ?? []
  const parkingRevenueRows: ParkingRevenueRow[] = selectedProject?.parkingRevenue ?? []
  const gpContributionRows: GpContributionRow[] = selectedProject?.gpContributions ?? []
  const carryingCostRows: CarryingCostRow[] = selectedProject?.carryingCosts ?? []

  const cashflowMonths = useMemo<CashflowMonthMeta[]>(() => {
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

  const projectsByStage = useMemo<Record<ProjectStage, ProjectSummary[]>>(() => {
    return stageOptions.reduce((acc, stage) => {
      acc[stage.id] = projects.filter((project) => project.stage === stage.id)
      return acc
    }, {} as Record<ProjectStage, ProjectSummary[]>)
  }, [projects, stageOptions])
  const isKanbanView = !selectedProjectId
  const showSignOut = isAuthReady && !isAuthModalOpen

  const loadProjects = async () => {
    setProjectsStatus('loading')
    setProjectsError('')
    try {
      const rows = (await fetchProjects()) as ProjectSummary[]
      setProjects(rows)
      if (selectedProjectId && !rows.some((row) => row.id === selectedProjectId)) {
        setSelectedProjectId(null)
        setSelectedProject(null)
      }
      setProjectsStatus('loaded')
    } catch (err) {
      setProjectsError(getErrorMessage(err))
      setProjectsStatus('error')
    }
  }

  const loadWeather = async () => {
    setWeatherStatus('loading')
    setWeatherError('')
    try {
      const reading = (await fetchPhiladelphiaWeather()) as WeatherReading
      setWeather(reading)
      setWeatherStatus('loaded')
    } catch (err) {
      setWeatherError(getErrorMessage(err))
      setWeatherStatus('error')
    }
  }

  const loadProjectDetail = async (projectId: EntityId) => {
    if (!projectId) return
    setDetailStatus('loading')
    setDetailError('')
    try {
      const detail = (await fetchProjectDetail(projectId)) as ProjectDetail
      detail.parkingRevenue = detail.parkingRevenue || []
      detail.gpContributions = detail.gpContributions || []
      setSelectedProject(detail)
      setGeneralForm({
        ...defaultGeneralForm,
        name: detail.name,
        addressLine1: detail.general.addressLine1 ?? '',
        addressLine2: detail.general.addressLine2 ?? '',
        city: detail.general.city ?? '',
        state: detail.general.state ?? '',
        zip: detail.general.zip ?? '',
        purchasePriceUsd: formatNumberForInput(detail.general.purchasePriceUsd),
        closingDate: formatDateForInput(detail.general.closingDate),
        latitude: formatNumberForInput(detail.general.latitude),
        longitude: formatNumberForInput(detail.general.longitude),
        targetUnits: formatNumberForInput(detail.general.targetUnits),
        targetSqft: formatNumberForInput(detail.general.targetSqft),
        description: detail.general.description ?? '',
      })
      setAddressQuery(detail.general.addressLine1 || '')
      setAddressInputTouched(false)
      setAddressSuggestions([])
      const coordsFromDetail =
        detail.general.latitude !== null && detail.general.longitude !== null
          ? { lat: detail.general.latitude, lon: detail.general.longitude }
          : null
      const coordKey = getCoordKey(projectId)
      const savedCoords = coordsFromDetail || projectCoords[coordKey] || null
      setSelectedCoords(savedCoords || null)
      if (coordsFromDetail) {
        setProjectCoords((prev) => ({ ...prev, [coordKey]: coordsFromDetail }))
      }
      setDetailStatus('loaded')
    } catch (err) {
      setDetailError(getErrorMessage(err))
      setDetailStatus('error')
    }
  }

  useEffect(() => {
    if (!isAuthReady) return
    loadProjects()
    loadWeather()
  }, [isAuthReady])

  useEffect(() => {
    setExpandedCashflowRows(new Set())
  }, [selectedProjectId])

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      clearAuthCredentials()
      setIsAuthReady(false)
      setIsAuthModalOpen(true)
      setAuthStatus('error')
      setAuthError('Authentication required. Please sign in again.')
      setAuthForm((prev) => ({ ...prev, password: '' }))
    })
    return unsubscribe
  }, [])

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
        const results = (await searchAddresses(addressQuery)) as AddressSuggestion[]
        setAddressSuggestions(results)
        setAddressSearchStatus('loaded')
      } catch (err) {
        setAddressSearchStatus('error')
        setAddressSearchError(getErrorMessage(err))
        setAddressSuggestions([])
      }
    }, 400)
    return () => clearTimeout(timeout)
  }, [addressQuery, addressInputTouched])

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authForm.username.trim() || !authForm.password) {
      setAuthError('Username and password are required')
      return
    }
    setAuthStatus('saving')
    setAuthError('')
    try {
      setAuthCredentials({
        username: authForm.username.trim(),
        password: authForm.password,
      })
      await fetchProjects()
      setIsAuthReady(true)
      setIsAuthModalOpen(false)
      setAuthStatus('idle')
      await loadProjects()
      await loadWeather()
    } catch (err) {
      clearAuthCredentials()
      setAuthStatus('error')
      setAuthError(getErrorMessage(err))
    }
  }

  function handleLogout() {
    clearAuthCredentials()
    setIsAuthReady(false)
    setIsAuthModalOpen(true)
    setAuthForm({ username: '', password: '' })
    setAuthError('')
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
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
      setCreateError(getErrorMessage(err))
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

  function requestDeleteProject(id: EntityId) {
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
        const coordKey = getCoordKey(pendingDeleteProjectId)
        if (!prev[coordKey]) return prev
        const next = { ...prev }
        delete next[coordKey]
        return next
      })
      await loadProjects()
      setPendingDeleteProjectId(null)
    } catch (err) {
      setDeleteError(getErrorMessage(err))
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

  async function handleStageChange(projectId: EntityId, stage: ProjectStage) {
    setStageUpdatingFor(projectId)
    try {
      await updateProjectStage(projectId, stage)
      await loadProjects()
      if (projectId === selectedProjectId) {
        setSelectedProject((prev) => (prev ? { ...prev, stage } : prev))
      }
    } catch (err) {
      alert(getErrorMessage(err))
    } finally {
      setStageUpdatingFor(null)
    }
  }

  const normalizeOptionalField = (value: string) => {
    if (!value) return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }

  async function handleGeneralSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProjectId) return
    setGeneralStatus('saving')
    try {
      const payload: Record<string, unknown> = {
        name: generalForm.name.trim(),
        addressLine1: generalForm.addressLine1.trim(),
        purchasePriceUsd: generalForm.purchasePriceUsd ? Number(generalForm.purchasePriceUsd) : null,
        closingDate: generalForm.closingDate || null,
        latitude: parseFloatOrNull(generalForm.latitude),
        longitude: parseFloatOrNull(generalForm.longitude),
        targetUnits: generalForm.targetUnits ? Number(generalForm.targetUnits) : null,
        targetSqft: generalForm.targetSqft ? Number(generalForm.targetSqft) : null,
      }
      ;['addressLine2', 'city', 'state', 'zip', 'description'].forEach((field) => {
        payload[field] = normalizeOptionalField(generalForm[field as keyof GeneralFormState])
      })
      const updated = (await updateProjectGeneral(selectedProjectId, payload)) as ProjectDetail
      setSelectedProject((prev) => (prev ? { ...prev, name: updated.name, general: updated.general } : prev))
      setAddressQuery(updated.general.addressLine1 || '')
      setGeneralForm((prev) => ({
        ...prev,
        closingDate: formatDateForInput(updated.general.closingDate),
        latitude: formatNumberForInput(updated.general.latitude),
        longitude: formatNumberForInput(updated.general.longitude),
      }))
      const coordKey = getCoordKey(selectedProjectId)
      if (updated.general.latitude !== null && updated.general.longitude !== null) {
        const coords = { lat: updated.general.latitude, lon: updated.general.longitude }
        setSelectedCoords(coords)
        setProjectCoords((prev) => ({ ...prev, [coordKey]: coords }))
      } else {
        setProjectCoords((prev) => {
          if (!prev[coordKey]) return prev
          const next = { ...prev }
          delete next[coordKey]
          return next
        })
        setSelectedCoords(null)
      }
      setGeneralStatus('idle')
      await loadProjects()
    } catch (err) {
      setGeneralStatus('error')
      alert(getErrorMessage(err))
    }
  }

  function handleAddressSelect(suggestion: AddressSuggestion) {
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
        const coordKey = getCoordKey(selectedProjectId)
        setProjectCoords((prev) => ({ ...prev, [coordKey]: coords }))
      }
    }
  }

  return (
    <div className="app-shell">
      <div className="session-actions">
        {showSignOut && (
          <button type="button" className="ghost tiny" onClick={handleLogout}>
            Sign out
          </button>
        )}
      </div>
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

              {activeTab === 'metrics' && (
                <MetricsTab project={selectedProject} projectId={selectedProjectId} />
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

      {isAuthModalOpen && (
        <div className="auth-overlay">
          <div className="auth-panel">
            <h2>Sign in to continue</h2>
            <p className="muted">Environment protected with HTTP Basic Auth.</p>
            <form onSubmit={handleAuthSubmit}>
              <label>
                <span>Username</span>
                <input
                  type="text"
                  value={authForm.username}
                  onChange={(e) => {
                    setAuthForm((prev) => ({
                      ...prev,
                      username: e.target.value,
                    }))
                    if (authStatus !== 'idle') setAuthStatus('idle')
                    if (authError) setAuthError('')
                  }}
                  autoComplete="username"
                  placeholder="Username"
                  disabled={authStatus === 'saving'}
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(e) => {
                    setAuthForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                    if (authStatus !== 'idle') setAuthStatus('idle')
                    if (authError) setAuthError('')
                  }}
                  autoComplete="current-password"
                  placeholder="Password"
                  disabled={authStatus === 'saving'}
                />
              </label>
              {authError && <p className="error auth-error">{authError}</p>}
              <button type="submit" className="primary" disabled={authStatus === 'saving'}>
                {authStatus === 'saving' ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
