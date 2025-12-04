import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  API_BASE,
  addProjectCollaborator,
  clearAuthCredentials,
  createProject,
  createUser,
  deleteProject,
  deleteUser,
  fetchCurrentUser,
  fetchProjectDetail,
  fetchProjectCollaborators,
  fetchProjects,
  fetchUsers,
  fetchWeather,
  getAuthCredentials,
  onUnauthorized,
  removeProjectCollaborator,
  searchAddresses,
  setAuthCredentials,
  stageLabels,
  updateCurrentUser,
  updateProjectGeneral,
  updateProjectStage,
  updateUser,
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
  buildRampedRevenueValues,
  buildCashflowRows,
  buildExpenseSeries,
  buildCarryingSeries,
} from './features/cashflow/cashflowHelpers.js'
import { CarryingCostsSection } from './features/carrying/CarryingCostsSection'
import { FundingTab } from './features/funding/FundingTab'
import { MetricsTab } from './features/metrics/MetricsTab'
import type {
  AddressSuggestion,
  ApartmentRevenueRow,
  RetailRevenueRow,
  CarryingCostRow,
  CarryingType,
  EntityId,
  GeneralFormState,
  GpContributionRow,
  IntervalUnit,
  ParkingRevenueRow,
  ProjectCollaborator,
  ProjectDetail,
  ProjectStage,
  ProjectSummary,
  UserSummary,
  WeatherReading,
} from './types'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'hard', label: 'Hard Costs' },
  { id: 'soft', label: 'Soft Costs' },
  { id: 'funding', label: 'Funding' },
  { id: 'carrying', label: 'Carrying Costs' },
  { id: 'cashflow', label: 'Cashflow' },
  { id: 'metrics', label: 'Metrics & Sensitivities' },
] as const

type TabId = (typeof TABS)[number]['id']
type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'
type RequestStatus = 'idle' | 'saving' | 'error'
type AddressSearchStatus = 'idle' | 'loading' | 'loaded' | 'error'
type SelectedCoords = { lat: number; lon: number } | null
type CashflowMonthMeta = { index: number; label: string; calendarLabel: string; year: number }
type AuthFormState = { username: string; password: string }
type AutoManagementRow = { id: string; label: string; monthlyAmount: number; startMonth: number | null }

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
  startLeasingDate: '',
  stabilizedDate: '',
  latitude: '',
  longitude: '',
  targetUnits: '',
  targetSqft: '',
  description: '',
}

type ProjectWeatherCardProps = {
  status: LoadStatus
  weather: WeatherReading | null
  error: string
  hasCoords: boolean
}

function ProjectWeatherCard({ status, weather, error, hasCoords }: ProjectWeatherCardProps) {
  let body = null
  if (!hasCoords) {
    body = <p className="muted tiny">Add latitude/longitude to view this project&apos;s local weather.</p>
  } else if (status === 'loading') {
    body = <p className="muted tiny">Updating forecast…</p>
  } else if (status === 'error') {
    body = <p className="error tiny">{error}</p>
  } else if (status === 'loaded' && weather) {
    body = (
      <>
        <strong className="weather-temp">{Math.round(weather.temperature_c)}°C</strong>
        <p className="muted tiny">{weather.label || weather.city}</p>
        <p className="muted tiny">Wind {Math.round(weather.windspeed_kmh)} km/h</p>
      </>
    )
  } else {
    body = <p className="muted tiny">Select a project to view the forecast.</p>
  }
  return (
    <div className="project-weather-card">
      <p className="eyebrow tiny">Local Weather</p>
      {body}
    </div>
  )
}

type CollaboratorsPanelProps = {
  ownerName: string
  ownerEmail: string
  collaborators: ProjectCollaborator[]
  canEdit: boolean
  inputValue: string
  status: RequestStatus
  error: string
  onInputChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onRemove: (id: string) => void
}

function CollaboratorsPanel({
  ownerName,
  ownerEmail,
  collaborators,
  canEdit,
  inputValue,
  status,
  error,
  onInputChange,
  onSubmit,
  onRemove,
}: CollaboratorsPanelProps) {
  return (
    <section className="collaborators-panel">
      <div className="section-header">
        <h4>Collaborators</h4>
        {canEdit && <p className="muted tiny">Owners and super admins can invite teammates.</p>}
      </div>
      <div className="collaborator-owner">
        <span className="pill">Owner</span>
        <div>
          <strong>{ownerName}</strong>
          <p className="muted tiny">{ownerEmail}</p>
        </div>
      </div>
      <ul className="collaborator-list">
        {collaborators.length === 0 && <li className="muted tiny">No collaborators yet.</li>}
        {collaborators.map((collab) => (
          <li key={collab.id}>
            <div>
              <strong>{collab.displayName || collab.email || 'User'}</strong>
              <p className="muted tiny">{collab.email}</p>
            </div>
            {canEdit && (
              <button type="button" className="ghost tiny" onClick={() => onRemove(collab.id)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form onSubmit={onSubmit} className="collaborator-form">
          <label>
            <span className="muted tiny">Invite collaborator</span>
            <input
              type="email"
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="user@example.com"
              disabled={status === 'saving'}
            />
          </label>
          {error && <p className="error tiny">{error}</p>}
          <button type="submit" className="primary" disabled={status === 'saving'}>
            {status === 'saving' ? 'Adding…' : 'Add collaborator'}
          </button>
        </form>
      )}
    </section>
  )
}

type AccountSettingsModalProps = {
  currentUser: UserSummary
  isAdmin: boolean
  onClose: () => void
  onLogout: () => void
  users: UserSummary[]
  usersStatus: LoadStatus
  usersError: string
  userActionStatus: RequestStatus
  userActionError: string
  onRefreshUsers: () => Promise<void>
  onCreateUser: (payload: { email: string; displayName: string; password: string; isSuperAdmin: boolean }) => Promise<void>
  onToggleAdmin: (userId: EntityId, nextValue: boolean) => Promise<void>
  onResetPassword: (userId: EntityId, password: string) => Promise<void>
  onDeleteUser: (userId: EntityId) => Promise<void>
  displayNameInput: string
  displayNameStatus: RequestStatus
  displayNameError: string
  onDisplayNameChange: (value: string) => void
  onSaveDisplayName: (event: FormEvent<HTMLFormElement>) => void
  onEditDisplayName: () => void
  onCancelDisplayName: () => void
  isEditingDisplayName: boolean
}

function AccountSettingsModal({
  currentUser,
  isAdmin,
  onClose,
  onLogout,
  users,
  usersStatus,
  usersError,
  userActionStatus,
  userActionError,
  onRefreshUsers,
  onCreateUser,
  onToggleAdmin,
  onResetPassword,
  onDeleteUser,
  displayNameInput,
  displayNameStatus,
  displayNameError,
  onDisplayNameChange,
  onSaveDisplayName,
  onEditDisplayName,
  onCancelDisplayName,
  isEditingDisplayName,
}: AccountSettingsModalProps) {
  const [form, setForm] = useState({
    email: '',
    displayName: '',
    password: '',
    isSuperAdmin: false,
  })
  const [localError, setLocalError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.email.trim() || !form.displayName.trim() || !form.password.trim()) {
      setLocalError('All fields are required')
      return
    }
    setLocalError('')
    await onCreateUser({
      email: form.email.trim(),
      displayName: form.displayName.trim(),
      password: form.password.trim(),
      isSuperAdmin: form.isSuperAdmin,
    })
    setForm({ email: '', displayName: '', password: '', isSuperAdmin: false })
  }

  const handleToggleRole = async (user: UserSummary) => {
    await onToggleAdmin(user.id, !user.isSuperAdmin)
  }

  const handleResetPasswordClick = async (user: UserSummary) => {
    const nextPassword = window.prompt(`Enter a new password for ${user.email}`)
    if (!nextPassword || !nextPassword.trim()) return
    await onResetPassword(user.id, nextPassword.trim())
  }

  const handleDeleteUserClick = async (user: UserSummary) => {
    if (!window.confirm(`Remove ${user.email}?`)) return
    await onDeleteUser(user.id)
  }

  return (
    <div className="modal-backdrop account-settings-backdrop">
      <div className="account-modal">
        <header>
          <div>
            <h3>Account settings</h3>
            <p className="muted tiny">{currentUser.email}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            ✕
          </button>
        </header>

        <section className="account-section">
          <div className="section-header">
            <h4>Profile</h4>
            <p className="muted tiny">Your display name is shown in project headers and collaborator lists.</p>
          </div>
          <div className="profile-body">
            {!isEditingDisplayName && (
              <>
                <strong>{currentUser.displayName || currentUser.email}</strong>
                <p className="muted tiny">{currentUser.isSuperAdmin ? 'Super admin' : 'Collaborator'}</p>
              </>
            )}
            {isEditingDisplayName && (
              <form className="profile-form" onSubmit={onSaveDisplayName}>
                <label>
                  <span>Display Name</span>
                  <input
                    type="text"
                    value={displayNameInput}
                    onChange={(event) => onDisplayNameChange(event.target.value)}
                    disabled={displayNameStatus === 'saving'}
                  />
                </label>
                {displayNameError && <p className="error tiny">{displayNameError}</p>}
                <div className="profile-form-actions">
                  <button type="submit" className="primary" disabled={displayNameStatus === 'saving'}>
                    {displayNameStatus === 'saving' ? 'Saving…' : 'Save name'}
                  </button>
                  <button
                    type="button"
                    className="ghost tiny"
                    onClick={onCancelDisplayName}
                    disabled={displayNameStatus === 'saving'}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            <div className="profile-actions">
              {!isEditingDisplayName && (
                <button type="button" className="ghost tiny" onClick={onEditDisplayName}>
                  Edit display name
                </button>
              )}
              <button type="button" className="ghost tiny" onClick={onLogout}>
                Sign out
              </button>
            </div>
          </div>
        </section>

        {isAdmin && (
          <section className="account-section">
            <div className="section-header">
              <h4>Manage Users</h4>
              <button type="button" className="ghost tiny" onClick={onRefreshUsers} disabled={usersStatus === 'loading'}>
                Refresh
              </button>
            </div>
            <form className="add-user-form" onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                disabled={userActionStatus === 'saving'}
              />
              <input
                type="text"
                placeholder="Display name"
                value={form.displayName}
                onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
                disabled={userActionStatus === 'saving'}
              />
              <input
                type="password"
                placeholder="Temporary password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                disabled={userActionStatus === 'saving'}
              />
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.isSuperAdmin}
                  onChange={(e) => setForm((prev) => ({ ...prev, isSuperAdmin: e.target.checked }))}
                  disabled={userActionStatus === 'saving'}
                />
                <span>Super admin</span>
              </label>
              {(localError || userActionError) && (
                <p className="error tiny">{localError || userActionError}</p>
              )}
              <button type="submit" className="primary" disabled={userActionStatus === 'saving'}>
                {userActionStatus === 'saving' ? 'Creating…' : 'Create user'}
              </button>
            </form>

            {usersStatus === 'error' && <p className="error tiny">{usersError}</p>}
            {usersStatus === 'loading' && <p className="muted tiny">Loading users…</p>}
            {usersStatus === 'loaded' && users.length === 0 && (
              <p className="muted tiny">No users yet.</p>
            )}
            {usersStatus === 'loaded' && users.length > 0 && (
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div>
                          <strong>{user.displayName || user.email}</strong>
                          <p className="muted tiny">{user.email}</p>
                        </div>
                      </td>
                      <td>{user.isSuperAdmin ? 'Super admin' : 'User'}</td>
                      <td>
                        <div className="user-actions">
                          <button type="button" className="ghost tiny" onClick={() => handleToggleRole(user)}>
                            {user.isSuperAdmin ? 'Revoke admin' : 'Make admin'}
                          </button>
                          <button
                            type="button"
                            className="ghost tiny"
                            onClick={() => handleResetPasswordClick(user)}
                          >
                            Reset password
                          </button>
                          <button
                            type="button"
                            className="ghost tiny"
                            onClick={() => handleDeleteUserClick(user)}
                            disabled={currentUser.id === user.id}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default App
const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
const getCoordKey = (id: EntityId) => String(id)

function App() {
  const initialAuth = getAuthCredentials()
  const initialProjectsStatus: LoadStatus = initialAuth ? 'loading' : 'idle'
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
  const [currentUser, setCurrentUser] = useState<UserSummary | null>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false)
  const [users, setUsers] = useState<UserSummary[]>([])
  const [usersStatus, setUsersStatus] = useState<LoadStatus>('idle')
  const [usersError, setUsersError] = useState('')
  const [userActionStatus, setUserActionStatus] = useState<RequestStatus>('idle')
  const [userActionError, setUserActionError] = useState('')
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [displayNameStatus, setDisplayNameStatus] = useState<RequestStatus>('idle')
  const [displayNameError, setDisplayNameError] = useState('')
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false)
  const [projectWeather, setProjectWeather] = useState<WeatherReading | null>(null)
  const [projectWeatherStatus, setProjectWeatherStatus] = useState<LoadStatus>('idle')
  const [projectWeatherError, setProjectWeatherError] = useState('')
  const [collaboratorInput, setCollaboratorInput] = useState('')
  const [collaboratorStatus, setCollaboratorStatus] = useState<RequestStatus>('idle')
  const [collaboratorError, setCollaboratorError] = useState('')
  const accountMenuRef = useRef<HTMLDivElement | null>(null)

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

  const parseCoordinateValue = (value: number | string | null | undefined) => {
    if (value === null || value === undefined) return null
    const parsed = typeof value === 'string' ? Number(value) : value
    return Number.isFinite(parsed) ? parsed : null
  }

  const ownerName = selectedProject?.owner?.displayName || selectedProject?.owner?.email || 'Owner'
  const canEditCollaborators =
    Boolean(currentUser?.isSuperAdmin) ||
    Boolean(currentUser && selectedProject?.ownerId && selectedProject.ownerId === currentUser.id)
  const latForWeather = parseCoordinateValue(
    selectedCoords?.lat ?? selectedProject?.general?.latitude ?? null,
  )
  const lonForWeather = parseCoordinateValue(
    selectedCoords?.lon ?? selectedProject?.general?.longitude ?? null,
  )
  const hasWeatherCoords = latForWeather !== null && lonForWeather !== null

  const getOffsetFromDate = useCallback(
    (value: string | null | undefined) => {
      if (!value) return null
      const target = new Date(value)
      if (Number.isNaN(target.getTime())) return null
      return (target.getFullYear() - baseDate.getFullYear()) * 12 + (target.getMonth() - baseDate.getMonth())
    },
    [baseDate],
  )

  const leasingStartDateValue = generalForm.startLeasingDate || selectedProject?.general?.startLeasingDate || null
  const stabilizedDateValue = generalForm.stabilizedDate || selectedProject?.general?.stabilizedDate || null

  const leasingStartOffset = useMemo(() => {
    const diff = getOffsetFromDate(leasingStartDateValue)
    if (diff === null) return null
    return Math.max(0, diff)
  }, [getOffsetFromDate, leasingStartDateValue])

  const stabilizedOffsetRaw = useMemo(() => {
    const diff = getOffsetFromDate(stabilizedDateValue)
    if (diff === null) return null
    return Math.max(0, diff)
  }, [getOffsetFromDate, stabilizedDateValue])

  const stabilizedOffset = useMemo(() => {
    if (stabilizedOffsetRaw === null) {
      return leasingStartOffset !== null ? leasingStartOffset + 12 : null
    }
    if (leasingStartOffset !== null && stabilizedOffsetRaw < leasingStartOffset) {
      return leasingStartOffset
    }
    return stabilizedOffsetRaw
  }, [leasingStartOffset, stabilizedOffsetRaw])

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
  const retailRevenueRows: RetailRevenueRow[] = selectedProject?.retailRevenue ?? []
  const parkingRevenueRows: ParkingRevenueRow[] = selectedProject?.parkingRevenue ?? []
  const gpContributionRows: GpContributionRow[] = selectedProject?.gpContributions ?? []
  const carryingCostRows: CarryingCostRow[] = selectedProject?.carryingCosts ?? []

  const totalApartmentUnits = useMemo(() => {
    const explicitUnits = apartmentRevenueRows.reduce((sum, row) => sum + (row.unitCount || 0), 0)
    if (explicitUnits > 0) return explicitUnits
    return selectedProject?.general?.targetUnits ?? 0
  }, [apartmentRevenueRows, selectedProject?.general?.targetUnits])

  const totalRetailUnits = useMemo(() => {
    if (!retailRevenueRows.length) return 0
    return retailRevenueRows.reduce((sum, row) => {
      const units = row.unitCount
      if (units && units > 0) return sum + units
      return sum + 1
    }, 0)
  }, [retailRevenueRows])

  const apartmentTurnoverAnnualCost = useMemo(() => {
    const turnoverPct = selectedProject?.apartmentTurnover?.turnoverPct ?? 0
    const turnoverCost = selectedProject?.apartmentTurnover?.turnoverCostUsd ?? 0
    if (!turnoverPct || !turnoverCost || !totalApartmentUnits) return 0
    return (turnoverPct / 100) * totalApartmentUnits * turnoverCost
  }, [selectedProject?.apartmentTurnover?.turnoverCostUsd, selectedProject?.apartmentTurnover?.turnoverPct, totalApartmentUnits])

  const retailTurnoverAnnualCost = useMemo(() => {
    const turnoverPct = selectedProject?.retailTurnover?.turnoverPct ?? 0
    const turnoverCost = selectedProject?.retailTurnover?.turnoverCostUsd ?? 0
    if (!turnoverPct || !turnoverCost || !totalRetailUnits) return 0
    return (turnoverPct / 100) * totalRetailUnits * turnoverCost
  }, [selectedProject?.retailTurnover?.turnoverCostUsd, selectedProject?.retailTurnover?.turnoverPct, totalRetailUnits])

  const apartmentTurnoverMonthlyCost = apartmentTurnoverAnnualCost / 12
  const retailTurnoverMonthlyCost = retailTurnoverAnnualCost / 12
  const turnoverStartMonth = leasingStartOffset ?? null

  const autoManagementRows = useMemo<AutoManagementRow[]>(() => {
    const rows: AutoManagementRow[] = []
    if (apartmentTurnoverMonthlyCost) {
      rows.push({
        id: 'turnover-apartments',
        label: 'Apartment Turnover (auto)',
        monthlyAmount: apartmentTurnoverMonthlyCost,
        startMonth: turnoverStartMonth,
      })
    }
    if (retailTurnoverMonthlyCost) {
      rows.push({
        id: 'turnover-retail',
        label: 'Retail Turnover (auto)',
        monthlyAmount: retailTurnoverMonthlyCost,
        startMonth: turnoverStartMonth,
      })
    }
    return rows
  }, [apartmentTurnoverMonthlyCost, retailTurnoverMonthlyCost, turnoverStartMonth])

  const carryingCostRowsWithTurnover = useMemo(() => {
    if (!autoManagementRows.length) return carryingCostRows
    const autoRows: CarryingCostRow[] = autoManagementRows.map((row) => ({
      id: row.id,
      carryingType: 'management' as CarryingType,
      costName: row.label,
      amountUsd: row.monthlyAmount,
      intervalUnit: 'monthly' as IntervalUnit,
      startMonth: (row.startMonth ?? 0) as number,
      endMonth: null,
    }))
    return [...carryingCostRows, ...autoRows]
  }, [autoManagementRows, carryingCostRows])

  const cashflowMonths = useMemo<CashflowMonthMeta[]>(() => {
    return Array.from({ length: CASHFLOW_MONTHS }, (_, index) => {
      const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + index, 1)
      return {
        index,
        label: `M${index + 1}`,
        calendarLabel: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
        year: date.getFullYear(),
      }
    })
  }, [baseDate])

  const revenueSeries = useMemo(() => {
    const apartmentLineItems = apartmentRevenueRows.map((row, index) => {
      const net = calculateNetRevenue(row)
      return {
        id: row.id || `apt-${index}`,
        label: `Apartment • ${row.typeLabel || 'Unit type'}`,
        values: buildRampedRevenueValues(net, row.startMonth ?? 0, leasingStartOffset, stabilizedOffset, CASHFLOW_MONTHS),
      }
    })

    const retailLineItems = retailRevenueRows.map((row, index) => {
      const net = calculateNetRevenue(row)
      return {
        id: row.id || `retail-${index}`,
        label: `Retail • ${row.typeLabel || 'Retail'}`,
        values: buildRampedRevenueValues(net, row.startMonth ?? 0, leasingStartOffset, stabilizedOffset, CASHFLOW_MONTHS),
      }
    })

    const parkingLineItems = parkingRevenueRows.map((row, index) => {
      const net = calculateNetParking(row)
      return {
        id: row.id || `park-${index}`,
        label: `Parking • ${row.typeLabel || 'Parking'}`,
        values: buildRampedRevenueValues(net, row.startMonth ?? 0, leasingStartOffset, stabilizedOffset, CASHFLOW_MONTHS),
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

    const lineItems = [...apartmentLineItems, ...retailLineItems, ...parkingLineItems, ...gpLineItems]
    const baseValues = Array(CASHFLOW_MONTHS).fill(0)
    lineItems.forEach((item) => {
      item.values.forEach((value, idx) => {
        baseValues[idx] += value
      })
    })

    return { label: 'Revenues', type: 'revenue', baseValues, lineItems }
  }, [
    apartmentRevenueRows,
    retailRevenueRows,
    parkingRevenueRows,
    gpContributionRows,
    leasingStartOffset,
    stabilizedOffset,
  ])

  const softCostSeries = useMemo(
    () => buildExpenseSeries(selectedProject?.softCosts || [], 'Soft Costs', CASHFLOW_MONTHS),
    [selectedProject],
  )

  const hardCostSeries = useMemo(
    () => buildExpenseSeries(selectedProject?.hardCosts || [], 'Hard Costs', CASHFLOW_MONTHS),
    [selectedProject],
  )

  const carryingCostSeries = useMemo(
    () => buildCarryingSeries(carryingCostRowsWithTurnover, CASHFLOW_MONTHS),
    [carryingCostRowsWithTurnover],
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
  const showAccountMenu = isAuthReady && !isAuthModalOpen && Boolean(currentUser)

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

  const loadCurrentUser = useCallback(async () => {
    try {
      const me = (await fetchCurrentUser()) as UserSummary
      setCurrentUser(me)
      setDisplayNameInput(me.displayName || me.email || '')
    } catch (err) {
      setCurrentUser(null)
      setDisplayNameInput('')
    }
  }, [])

  const refreshUsers = useCallback(async () => {
    if (!currentUser?.isSuperAdmin) return
    setUsersStatus('loading')
    setUsersError('')
    try {
      const list = (await fetchUsers()) as UserSummary[]
      setUsers(list)
      setUsersStatus('loaded')
    } catch (err) {
      setUsersError(getErrorMessage(err))
      setUsersStatus('error')
    }
  }, [currentUser?.isSuperAdmin])

  const handleCreateUserAccount = useCallback(
    async (payload: { email: string; displayName: string; password: string; isSuperAdmin: boolean }) => {
      if (!currentUser?.isSuperAdmin) return
      setUserActionStatus('saving')
      setUserActionError('')
      try {
        await createUser(payload)
        await refreshUsers()
        setUserActionStatus('idle')
      } catch (err) {
        setUserActionStatus('error')
        setUserActionError(getErrorMessage(err))
      }
    },
    [currentUser?.isSuperAdmin, refreshUsers],
  )

  const handleToggleUserAdmin = useCallback(
    async (userId: EntityId, nextValue: boolean) => {
      if (!currentUser?.isSuperAdmin) return
      setUserActionStatus('saving')
      setUserActionError('')
      try {
        await updateUser(userId, { isSuperAdmin: nextValue })
        await refreshUsers()
        setUserActionStatus('idle')
      } catch (err) {
        setUserActionStatus('error')
        setUserActionError(getErrorMessage(err))
      }
    },
    [currentUser?.isSuperAdmin, refreshUsers],
  )

  const handleResetUserPassword = useCallback(
    async (userId: EntityId, password: string) => {
      if (!currentUser?.isSuperAdmin) return
      setUserActionStatus('saving')
      setUserActionError('')
      try {
        await updateUser(userId, { password })
        setUserActionStatus('idle')
      } catch (err) {
        setUserActionStatus('error')
        setUserActionError(getErrorMessage(err))
      }
    },
    [currentUser?.isSuperAdmin],
  )

  const handleDeleteUserAccount = useCallback(
    async (userId: EntityId) => {
      if (!currentUser?.isSuperAdmin) return
      setUserActionStatus('saving')
      setUserActionError('')
      try {
        await deleteUser(userId)
        await refreshUsers()
        setUserActionStatus('idle')
      } catch (err) {
        setUserActionStatus('error')
        setUserActionError(getErrorMessage(err))
      }
    },
    [currentUser?.isSuperAdmin, refreshUsers],
  )

  const handleSaveDisplayName = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!currentUser) return
      const nextName = displayNameInput.trim()
      if (!nextName) {
        setDisplayNameStatus('error')
        setDisplayNameError('Display name is required')
        return
      }
      setDisplayNameStatus('saving')
      setDisplayNameError('')
      try {
        const updated = (await updateCurrentUser({ displayName: nextName })) as UserSummary
        setCurrentUser(updated)
        setDisplayNameInput(updated.displayName || updated.email || '')
        setDisplayNameStatus('idle')
        setIsEditingDisplayName(false)
      } catch (err) {
        setDisplayNameStatus('error')
        setDisplayNameError(getErrorMessage(err))
      }
    },
    [currentUser, displayNameInput],
  )

  const handleDisplayNameChange = useCallback(
    (value: string) => {
      setDisplayNameInput(value)
      if (displayNameStatus === 'error') setDisplayNameStatus('idle')
      if (displayNameError) setDisplayNameError('')
    },
    [displayNameStatus, displayNameError],
  )

  const handleDisplayNameCancel = useCallback(() => {
    if (!currentUser) return
    setDisplayNameInput(currentUser.displayName || currentUser.email || '')
    setDisplayNameStatus('idle')
    setDisplayNameError('')
    setIsEditingDisplayName(false)
  }, [currentUser])

  const handleDisplayNameEdit = useCallback(() => {
    setIsEditingDisplayName(true)
    setDisplayNameStatus('idle')
    setDisplayNameError('')
  }, [])

  useEffect(() => {
    if (!currentUser) return
    setDisplayNameInput(currentUser.displayName || currentUser.email || '')
    setIsEditingDisplayName(false)
  }, [currentUser?.displayName, currentUser?.email])

  const loadProjectDetail = async (projectId: EntityId) => {
    if (!projectId) return
    setDetailStatus('loading')
    setDetailError('')
    try {
      const detail = (await fetchProjectDetail(projectId)) as ProjectDetail
      detail.retailRevenue = detail.retailRevenue || []
      detail.parkingRevenue = detail.parkingRevenue || []
      detail.gpContributions = detail.gpContributions || []
      detail.apartmentTurnover = detail.apartmentTurnover || { turnoverPct: null, turnoverCostUsd: null }
      detail.retailTurnover = detail.retailTurnover || { turnoverPct: null, turnoverCostUsd: null }
      detail.collaborators = detail.collaborators || []
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
        startLeasingDate: formatDateForInput(detail.general.startLeasingDate),
        stabilizedDate: formatDateForInput(detail.general.stabilizedDate),
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
    loadCurrentUser()
  }, [isAuthReady, loadCurrentUser])

useEffect(() => {
  if (!isAccountSettingsOpen || !currentUser?.isSuperAdmin) return
  refreshUsers()
}, [isAccountSettingsOpen, currentUser?.isSuperAdmin, refreshUsers])

  useEffect(() => {
    setExpandedCashflowRows(new Set())
  }, [selectedProjectId])

  useEffect(() => {
    if (!accountMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [accountMenuOpen])

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      clearAuthCredentials()
      setIsAuthReady(false)
      setIsAuthModalOpen(true)
      setAuthStatus('error')
      setAuthError('Authentication required. Please sign in again.')
      setAuthForm((prev) => ({ ...prev, password: '' }))
      setCurrentUser(null)
      setAccountMenuOpen(false)
      setIsAccountSettingsOpen(false)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetail(selectedProjectId)
    }
  }, [selectedProjectId])

useEffect(() => {
  if (!selectedProject) {
    setProjectWeather(null)
    setProjectWeatherStatus('idle')
    setProjectWeatherError('')
    return
  }
  const latCandidate = selectedCoords?.lat ?? selectedProject.general.latitude
  const lonCandidate = selectedCoords?.lon ?? selectedProject.general.longitude
  const lat = parseCoordinateValue(latCandidate)
  const lon = parseCoordinateValue(lonCandidate)
  if (lat === null || lon === null) {
    setProjectWeather(null)
    setProjectWeatherStatus('idle')
    setProjectWeatherError('')
    return
  }
  let cancelled = false
  setProjectWeatherStatus('loading')
  setProjectWeatherError('')
  fetchWeather(lat, lon, selectedProject.name)
    .then((reading) => {
      if (!cancelled) {
        setProjectWeather(reading as WeatherReading)
        setProjectWeatherStatus('loaded')
      }
    })
    .catch((err) => {
      if (!cancelled) {
        setProjectWeather(null)
        setProjectWeatherStatus('error')
        setProjectWeatherError(getErrorMessage(err))
      }
    })
  return () => {
    cancelled = true
  }
}, [
  selectedProject,
  selectedCoords?.lat,
  selectedCoords?.lon,
  selectedProject?.general.latitude,
  selectedProject?.general.longitude,
])

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
      await Promise.all([loadProjects(), loadCurrentUser()])
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
    setCurrentUser(null)
    setAccountMenuOpen(false)
    setIsAccountSettingsOpen(false)
    setProfileName('')
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

  async function handleCollaboratorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProjectId) return
    if (!collaboratorInput.trim()) {
      setCollaboratorError('Email is required')
      setCollaboratorStatus('error')
      return
    }
    setCollaboratorStatus('saving')
    setCollaboratorError('')
    try {
      const list = (await addProjectCollaborator(
        selectedProjectId,
        collaboratorInput.trim(),
      )) as ProjectCollaborator[]
      setSelectedProject((prev) => (prev ? { ...prev, collaborators: list } : prev))
      setCollaboratorInput('')
      setCollaboratorStatus('idle')
    } catch (err) {
      setCollaboratorStatus('error')
      setCollaboratorError(getErrorMessage(err))
    }
  }

  async function handleCollaboratorRemove(collaboratorId: string) {
    if (!selectedProjectId) return
    setCollaboratorStatus('saving')
    setCollaboratorError('')
    try {
      const list = (await removeProjectCollaborator(
        selectedProjectId,
        collaboratorId,
      )) as ProjectCollaborator[]
      setSelectedProject((prev) => (prev ? { ...prev, collaborators: list } : prev))
      setCollaboratorStatus('idle')
    } catch (err) {
      setCollaboratorStatus('error')
      setCollaboratorError(getErrorMessage(err))
    }
  }

  const handleAccountMenuToggle = () => {
    setAccountMenuOpen((prev) => !prev)
  }

  const handleOpenAccountSettings = () => {
    setAccountMenuOpen(false)
    setIsAccountSettingsOpen(true)
  }

  const handleCloseAccountSettings = () => {
    setIsAccountSettingsOpen(false)
    setUserActionError('')
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
        startLeasingDate: generalForm.startLeasingDate || null,
        stabilizedDate: generalForm.stabilizedDate || null,
        latitude: parseFloatOrNull(generalForm.latitude),
        longitude: parseFloatOrNull(generalForm.longitude),
        targetUnits: generalForm.targetUnits ? Number(generalForm.targetUnits) : null,
        targetSqft: generalForm.targetSqft ? Number(generalForm.targetSqft) : null,
      }
      ;['addressLine2', 'city', 'state', 'zip', 'description'].forEach((field) => {
        payload[field] = normalizeOptionalField(generalForm[field as keyof GeneralFormState])
      })
      const updated = (await updateProjectGeneral(selectedProjectId, payload)) as ProjectDetail
      setSelectedProject((prev) =>
        prev
          ? {
              ...prev,
              name: updated.name,
              general: updated.general,
              apartmentTurnover: updated.apartmentTurnover,
              retailTurnover: updated.retailTurnover,
              owner: updated.owner ?? prev.owner,
              ownerId: updated.ownerId ?? prev.ownerId,
              collaborators: updated.collaborators ?? prev.collaborators,
            }
          : prev,
      )
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
      {showAccountMenu && currentUser && (
        <div className="user-menu" ref={accountMenuRef}>
          <button type="button" className="avatar-button" onClick={handleAccountMenuToggle}>
            <span className="avatar-chip">
              {(currentUser.displayName || currentUser.email || '?').charAt(0).toUpperCase()}
            </span>
            <span className="user-name">{currentUser.displayName || currentUser.email}</span>
          </button>
          {accountMenuOpen && (
            <div className="user-menu-dropdown">
              <button type="button" onClick={handleOpenAccountSettings}>
                Account settings
              </button>
              <button type="button" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          )}
        </div>
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
                  <ProjectWeatherCard
                    status={projectWeatherStatus}
                    weather={projectWeather}
                    error={projectWeatherError}
                    hasCoords={hasWeatherCoords}
                  />
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
                <>
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
                  <CollaboratorsPanel
                    ownerName={ownerName}
                    ownerEmail={selectedProject.owner?.email || ''}
                    collaborators={selectedProject.collaborators || []}
                    canEdit={canEditCollaborators}
                    inputValue={collaboratorInput}
                    status={collaboratorStatus}
                    error={collaboratorError}
                    onInputChange={setCollaboratorInput}
                    onSubmit={handleCollaboratorSubmit}
                    onRemove={handleCollaboratorRemove}
                  />
                </>
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
            defaultStartMonth={leasingStartOffset}
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

              {activeTab === 'funding' && (
                <FundingTab
                  project={selectedProject}
                  projectId={selectedProjectId}
                  onProjectRefresh={loadProjectDetail}
                  formatOffsetForInput={formatOffsetForInput}
                  getCalendarLabelForOffset={getCalendarLabelForOffset}
                  getCalendarLabelForInput={getCalendarLabelForInput}
                  convertMonthInputToOffset={convertMonthInputToOffset}
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
            autoManagementRows={autoManagementRows}
            defaultManagementStartMonth={leasingStartOffset ?? null}
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

      {isAccountSettingsOpen && currentUser && (
        <AccountSettingsModal
          currentUser={currentUser}
          isAdmin={Boolean(currentUser.isSuperAdmin)}
          onClose={handleCloseAccountSettings}
          onLogout={handleLogout}
          users={users}
          usersStatus={usersStatus}
          usersError={usersError}
          userActionStatus={userActionStatus}
          userActionError={userActionError}
          onRefreshUsers={refreshUsers}
          onCreateUser={handleCreateUserAccount}
          onToggleAdmin={handleToggleUserAdmin}
          onResetPassword={handleResetUserPassword}
          onDeleteUser={handleDeleteUserAccount}
        displayNameInput={displayNameInput}
        displayNameStatus={displayNameStatus}
        displayNameError={displayNameError}
        onDisplayNameChange={handleDisplayNameChange}
        onSaveDisplayName={handleSaveDisplayName}
          onEditDisplayName={handleDisplayNameEdit}
          onCancelDisplayName={handleDisplayNameCancel}
          isEditingDisplayName={isEditingDisplayName}
        />
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
