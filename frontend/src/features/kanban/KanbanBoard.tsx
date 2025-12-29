import type { KeyboardEvent } from 'react'
import type { EntityId, ProjectStage, ProjectSummary } from '../../types'

type StageOption = {
  id: ProjectStage
  label: string
}

type KanbanBoardProps = {
  stageOptions: StageOption[]
  stageOptionsForDropdown?: StageOption[]
  projectsByStage: Record<ProjectStage, ProjectSummary[]>
  onSelectProject: (projectId: EntityId) => void
  onStageChange: (projectId: EntityId, stage: ProjectStage) => void
  stageUpdatingFor: EntityId | null
  onAddProject: () => void
}

export function KanbanBoard({
  stageOptions,
  stageOptionsForDropdown,
  projectsByStage,
  onSelectProject,
  onStageChange,
  stageUpdatingFor,
  onAddProject,
}: KanbanBoardProps) {
  const dropdownOptions = stageOptionsForDropdown || stageOptions
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, projectId: EntityId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelectProject(projectId)
    }
  }

  return (
    <>
      <section className="kanban-section">
        <div className="kanban">
          {stageOptions.map((stage) => {
            const projects = projectsByStage[stage.id] || []
            return (
              <div className={`kanban-column ${stage.id === 'archived' ? 'archived' : ''}`} key={stage.id}>
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
                          onKeyDown={(e) => handleCardKeyDown(e, project.id)}
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
                          onChange={(e) => onStageChange(project.id, e.target.value as ProjectStage)}
                          disabled={stageUpdatingFor === project.id}
                        >
                          {dropdownOptions.map((option) => (
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

