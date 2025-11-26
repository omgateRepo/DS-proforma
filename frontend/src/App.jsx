import { useEffect, useState } from 'react'
import './App.css'
import {
  fetchProjects,
  fetchPhiladelphiaWeather,
  createProject,
  deleteProject,
  API_BASE,
} from './api.js'

function App() {
  const [projects, setProjects] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [weather, setWeather] = useState(null)
  const [weatherStatus, setWeatherStatus] = useState('loading')
  const [weatherError, setWeatherError] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [createStatus, setCreateStatus] = useState('idle')
  const [createError, setCreateError] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const loadProjects = () =>
    fetchProjects()
      .then((rows) => {
        setProjects(rows)
        setStatus('loaded')
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })

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

  async function handleCreateProject(event) {
    event.preventDefault()
    setCreateError('')
    if (!newProjectName.trim()) {
      setCreateError('Project name is required')
      return
    }

    try {
      setCreateStatus('saving')
      await createProject(newProjectName.trim())
      setNewProjectName('')
      await loadProjects()
      setCreateStatus('idle')
    } catch (err) {
      setCreateError(err.message)
      setCreateStatus('error')
    }
  }

  async function handleDeleteProject(id) {
    setDeleteError('')
    try {
      await deleteProject(id)
      await loadProjects()
    } catch (err) {
      setDeleteError(err.message)
    }
  }

  return (
    <div className="app-shell">
      <header>
        <h1>DS Proforma</h1>
        <p>API: {API_BASE || 'local'} </p>
      </header>

      <section>
        <h2>Philadelphia Temperature</h2>
        {weatherStatus === 'loading' && <p>Sampling current temperature…</p>}
        {weatherStatus === 'error' && <p className="error">Failed to load weather: {weatherError}</p>}
        {weatherStatus === 'loaded' && weather && (
          <p>
            {weather.city}: {weather.temperature_c}°C (sampled at {new Date(weather.sampled_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York' })})
          </p>
        )}
      </section>

      <section>
        <h2>Create Project</h2>
        <form onSubmit={handleCreateProject} className="project-form">
          <label>
            Project Name
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g., Roadmap MVP"
              required
              disabled={createStatus === 'saving'}
            />
          </label>
          <button type="submit" disabled={createStatus === 'saving'}>
            {createStatus === 'saving' ? 'Creating…' : 'Create project'}
          </button>
        </form>
        {createError && <p className="error">{createError}</p>}
      </section>

      {status === 'loading' && <p>Loading projects…</p>}
      {status === 'error' && <p className="error">Failed to load: {error}</p>}

      {status === 'loaded' && (
        <section>
          <h2>Projects</h2>
          {projects.length === 0 ? (
            <p>No projects yet. Use the form above to create one.</p>
          ) : (
            <ul>
              {projects.map((project) => (
                <li key={project.id}>
                  <span>
                    <strong>{project.name}</strong> — {project.status}
                  </span>
                  <button
                    type="button"
                    className="delete-btn"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => handleDeleteProject(project.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {deleteError && <p className="error">{deleteError}</p>}
        </section>
      )}
    </div>
  )
}

export default App
