import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  API_BASE,
  createProject,
  createRevenueItem,
  deleteProject,
  deleteRevenueItem,
  fetchPhiladelphiaWeather,
  fetchProjectDetail,
  fetchProjects,
  searchAddresses,
  stageLabels,
  updateProjectGeneral,
  updateProjectStage,
} from './api.js'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'hard', label: 'Hard Costs' },
  { id: 'soft', label: 'Soft Costs' },
  { id: 'carrying', label: 'Carrying Costs' },
  { id: 'cashflow', label: 'Cashflow' },
]

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
  targetUnits: '',
  targetSqft: '',
  description: '',
}

const defaultRevenueForm = {
  typeLabel: '',
  unitSqft: '',
  unitCount: '',
  rentBudget: '',
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
  const [revenueForm, setRevenueForm] = useState(defaultRevenueForm)
  const [revenueStatus, setRevenueStatus] = useState('idle')
  const [stageUpdatingFor, setStageUpdatingFor] = useState(null)
  const [addressQuery, setAddressQuery] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState([])
  const [addressSearchStatus, setAddressSearchStatus] = useState('idle')
  const [addressSearchError, setAddressSearchError] = useState('')
  const [addressInputTouched, setAddressInputTouched] = useState(false)
  const [selectedCoords, setSelectedCoords] = useState(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState(null)
  const [deleteStatus, setDeleteStatus] = useState('idle')
  const [pendingRevenueDeleteId, setPendingRevenueDeleteId] = useState(null)

  const stageOptions = stageLabels()
  const apiOrigin = (API_BASE || '').replace(/\/$/, '')

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
      if (!selectedProjectId && rows.length > 0) {
        setSelectedProjectId(rows[0].id)
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
      setSelectedProject(detail)
      setGeneralForm({
        ...defaultGeneralForm,
        name: detail.name,
        ...detail.general,
        purchasePriceUsd: detail.general.purchasePriceUsd || '',
        targetUnits: detail.general.targetUnits || '',
        targetSqft: detail.general.targetSqft || '',
      })
      setAddressQuery(detail.general.addressLine1 || '')
      setAddressInputTouched(false)
      setAddressSuggestions([])
      setSelectedCoords(null)
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
      setNewProjectName('')
      await loadProjects()
      setSelectedProjectId(created.id)
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
        targetUnits: generalForm.targetUnits ? Number(generalForm.targetUnits) : null,
        targetSqft: generalForm.targetSqft ? Number(generalForm.targetSqft) : null,
      }
      const updated = await updateProjectGeneral(selectedProjectId, payload)
      setSelectedProject((prev) => (prev ? { ...prev, name: updated.name, general: updated.general } : prev))
      setAddressQuery(updated.general.addressLine1 || '')
      setGeneralStatus('idle')
      await loadProjects()
    } catch (err) {
      setGeneralStatus('error')
      alert(err.message)
    }
  }

  async function handleAddRevenue(event) {
    event.preventDefault()
    if (!selectedProjectId) return
    setRevenueStatus('saving')
    try {
      await createRevenueItem(selectedProjectId, {
        typeLabel: revenueForm.typeLabel,
        unitSqft: revenueForm.unitSqft ? Number(revenueForm.unitSqft) : null,
        unitCount: revenueForm.unitCount ? Number(revenueForm.unitCount) : null,
        rentBudget: revenueForm.rentBudget ? Number(revenueForm.rentBudget) : null,
      })
      setRevenueForm(defaultRevenueForm)
      setRevenueStatus('idle')
      await loadProjectDetail(selectedProjectId)
    } catch (err) {
      setRevenueStatus('error')
      alert(err.message)
    }
  }

  async function handleDeleteRevenue(revenueId) {
    if (!selectedProjectId) return
    setPendingRevenueDeleteId(revenueId)
  }

  async function confirmDeleteRevenue() {
    if (!selectedProjectId || !pendingRevenueDeleteId) return
    setRevenueStatus('saving')
    try {
      await deleteRevenueItem(selectedProjectId, pendingRevenueDeleteId)
      setPendingRevenueDeleteId(null)
      setRevenueStatus('idle')
      await loadProjectDetail(selectedProjectId)
    } catch (err) {
      setRevenueStatus('error')
      alert(err.message)
    }
  }

  function cancelDeleteRevenue() {
    if (revenueStatus === 'saving') return
    setPendingRevenueDeleteId(null)
    if (revenueStatus === 'error') {
      setRevenueStatus('idle')
    }
  }

  function handleAddressSelect(suggestion) {
    setGeneralForm((prev) => ({
      ...prev,
      addressLine1: suggestion.addressLine1 || '',
      city: suggestion.city || '',
      state: suggestion.state || '',
      zip: suggestion.zip || '',
    }))
    setAddressQuery(suggestion.label || suggestion.addressLine1 || '')
    setAddressSuggestions([])
    setAddressInputTouched(false)
    if (suggestion.latitude && suggestion.longitude) {
      setSelectedCoords({ lat: suggestion.latitude, lon: suggestion.longitude })
    }
  }

  return (
    <div className="app-shell">
      {isKanbanView && (
        <header className="app-header">
          <div>
            <p className="eyebrow">Real Estate Control Center</p>
            <h1>DS Proforma</h1>
            <p className="muted">API: {API_BASE || 'local'} </p>
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
                        <article
                          key={project.id}
                          className="project-card"
                          onClick={() => setSelectedProjectId(project.id)}
                        >
                          <div>
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
                              e.stopPropagation()
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
                <button className="danger" type="button" onClick={() => requestDeleteProject(selectedProject.id)}>
                  Delete Project
                </button>
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
                    <div className="satellite-preview">
                      <img
                        src={`${apiOrigin || ''}/api/geocode/satellite?lat=${selectedCoords.lat}&lon=${selectedCoords.lon}&zoom=16`}
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
                <div className="revenue-tab">
                  <form className="revenue-form" onSubmit={handleAddRevenue}>
                    <input
                      type="text"
                      placeholder="Type label (e.g., 1bd/1bth)"
                      value={revenueForm.typeLabel}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, typeLabel: e.target.value }))}
                      required
                    />
                    <input
                      type="number"
                      placeholder="Unit SqFt"
                      value={revenueForm.unitSqft}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, unitSqft: e.target.value }))}
                    />
                    <input
                      type="number"
                      placeholder="# Units"
                      value={revenueForm.unitCount}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, unitCount: e.target.value }))}
                    />
                    <input
                      type="number"
                      placeholder="Monthly rent"
                      value={revenueForm.rentBudget}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, rentBudget: e.target.value }))}
                    />
                    <button type="submit" disabled={revenueStatus === 'saving'}>
                      {revenueStatus === 'saving' ? 'Adding…' : 'Add Type'}
                    </button>
                  </form>

                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>SqFt</th>
                          <th>Units</th>
                          <th>Rent (USD)</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProject.revenue?.map((row) => (
                          <tr key={row.id}>
                            <td>{row.typeLabel}</td>
                            <td>{row.unitSqft || '—'}</td>
                            <td>{row.unitCount || '—'}</td>
                            <td>{row.rentBudget ? `$${row.rentBudget.toLocaleString()}` : '—'}</td>
                            <td>
                              <button
                                type="button"
                                className="text danger"
                                onClick={() => handleDeleteRevenue(row.id)}
                                disabled={revenueStatus === 'saving'}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                        {selectedProject.revenue?.length === 0 && (
                          <tr>
                            <td colSpan={5}>No revenue rows yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab !== 'general' && activeTab !== 'revenue' && (
                <div className="placeholder">
                  <p>
                    {activeTab === 'hard' && 'Hard costs'}
                    {activeTab === 'soft' && 'Soft costs'}
                    {activeTab === 'carrying' && 'Carrying costs'}
                    {activeTab === 'cashflow' && 'Cashflow'} will be implemented next.
                  </p>
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
    </div>
  )
}

export default App
