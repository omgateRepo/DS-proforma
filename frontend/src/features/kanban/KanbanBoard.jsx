export function KanbanBoard({
  stageOptions,
  projectsByStage,
  onSelectProject,
  onStageChange,
  stageUpdatingFor,
  onAddProject,
  weather,
  weatherStatus,
  weatherError,
}) {
  return (
    <>
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
          <button className="primary" type="button" onClick={onAddProject}>
            + Add Project
          </button>
        </div>
      </header>
      <section className="kanban-section">
        <div className="kanban">
          {stageOptions.map((stage) => {
            const projects = projectsByStage[stage.id] || []
            return (
              <div className="kanban-column" key={stage.id}>
                <div className="column-header">
                  <h3>{stage.label}</h3>
                  <span className="pill">{projects.length}</span>
                </div>
                <div className="column-body">
                  {projects.length > 0 ? (
                    projects.map((project) => (
                      <article key={project.id} className="project-card">
                        <div
                          onClick={() => onSelectProject(project.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && onSelectProject(project.id)}
                        >
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
                          onChange={(e) => onStageChange(project.id, e.target.value)}
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
            )
          })}
        </div>
      </section>
    </>
  )
}

