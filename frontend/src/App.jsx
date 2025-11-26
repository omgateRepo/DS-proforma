import { useEffect, useState } from 'react'
import './App.css'
import { fetchProjects, fetchPhiladelphiaWeather, API_BASE } from './api.js'

function App() {
  const [projects, setProjects] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [weather, setWeather] = useState(null)
  const [weatherStatus, setWeatherStatus] = useState('loading')
  const [weatherError, setWeatherError] = useState('')

  useEffect(() => {
    fetchProjects()
      .then((rows) => {
        setProjects(rows)
        setStatus('loaded')
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })

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

      {status === 'loading' && <p>Loading projects…</p>}
      {status === 'error' && <p className="error">Failed to load: {error}</p>}

      {status === 'loaded' && (
        <section>
          <h2>Projects</h2>
          {projects.length === 0 ? (
            <p>No projects yet. POST to /api/projects to create one.</p>
          ) : (
            <ul>
              {projects.map((project) => (
                <li key={project.id}>
                  <strong>{project.name}</strong> — {project.status}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

export default App
