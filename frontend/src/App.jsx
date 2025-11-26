import { useEffect, useState } from 'react'
import './App.css'
import { fetchProjects, API_BASE } from './api.js'

function App() {
  const [projects, setProjects] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

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
  }, [])

  return (
    <div className="app-shell">
      <header>
        <h1>DS Proforma</h1>
        <p>API: {API_BASE || 'local'} </p>
      </header>

      {status === 'loading' && <p>Loading projects…</p>}
      {status === 'error' && <p className="error">Failed to load: {error}</p>}

      {status === 'loaded' && (
        <section>
          <h2>DS Projects</h2>
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
