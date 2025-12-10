import { useState, useMemo, useCallback, type KeyboardEvent, type FormEvent } from 'react'
import type { Trip, TripInput, EntityId } from '../../types'

type QuarterOption = {
  id: string
  label: string
}

type TripsBoardProps = {
  trips: Trip[]
  tripsStatus: 'idle' | 'loading' | 'loaded' | 'error'
  tripsError: string
  onCreateTrip: (input: TripInput) => Promise<void>
  onUpdateTrip: (tripId: EntityId, input: Partial<TripInput>) => Promise<void>
  onDeleteTrip: (tripId: EntityId) => Promise<void>
}

function getQuarterFromDate(date: Date): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1
  const year = date.getFullYear()
  return `Q${quarter}-${year}`
}

function getQuarterFromDateString(dateStr: string | null): string {
  if (!dateStr) {
    // Default to current quarter if no date
    return getQuarterFromDate(new Date())
  }
  return getQuarterFromDate(new Date(dateStr))
}

function getQuarterOptions(): QuarterOption[] {
  const now = new Date()
  const currentQuarter = Math.floor(now.getMonth() / 3)
  const currentYear = now.getFullYear()
  
  const quarters: QuarterOption[] = []
  for (let i = 0; i < 5; i++) {
    const quarterOffset = currentQuarter + i
    const year = currentYear + Math.floor(quarterOffset / 4)
    const quarter = (quarterOffset % 4) + 1
    const id = `Q${quarter}-${year}`
    quarters.push({
      id,
      label: `Q${quarter} ${year}`,
    })
  }
  return quarters
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function TripsBoard({
  trips,
  tripsStatus,
  tripsError,
  onCreateTrip,
  onUpdateTrip,
  onDeleteTrip,
}: TripsBoardProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', destination: '', startDate: '', endDate: '' })
  const [addStatus, setAddStatus] = useState<'idle' | 'saving'>('idle')

  const quarterOptions = useMemo(() => getQuarterOptions(), [])
  
  // Group trips by quarter based on their start date
  const tripsByQuarter = useMemo(() => {
    const map: Record<string, Trip[]> = {}
    for (const q of quarterOptions) {
      map[q.id] = []
    }
    for (const trip of trips) {
      const quarter = getQuarterFromDateString(trip.startDate)
      if (map[quarter]) {
        map[quarter].push(trip)
      }
    }
    return map
  }, [trips, quarterOptions])

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, tripId: EntityId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      // Could open a detail modal here in the future
    }
  }

  const handleDelete = useCallback(async (tripId: EntityId) => {
    if (!confirm('Delete this trip?')) return
    await onDeleteTrip(tripId)
  }, [onDeleteTrip])

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!addForm.name.trim() || !addForm.startDate) return
    setAddStatus('saving')
    try {
      const quarter = getQuarterFromDateString(addForm.startDate)
      await onCreateTrip({
        name: addForm.name.trim(),
        destination: addForm.destination?.trim() || null,
        startDate: addForm.startDate || null,
        endDate: addForm.endDate || null,
        quarter,
      })
      setShowAddModal(false)
      setAddForm({ name: '', destination: '', startDate: '', endDate: '' })
    } finally {
      setAddStatus('idle')
    }
  }

  const openAddModal = () => {
    setAddForm({ name: '', destination: '', startDate: '', endDate: '' })
    setShowAddModal(true)
  }

  if (tripsStatus === 'loading') {
    return <p className="muted">Loading trips...</p>
  }

  if (tripsStatus === 'error') {
    return <p className="error">{tripsError || 'Failed to load trips'}</p>
  }

  return (
    <>
      <div className="trips-header">
        <h2>Trips</h2>
        <button type="button" className="primary" onClick={() => openAddModal()}>
          + Add Trip
        </button>
      </div>

      <section className="kanban-section">
        <div className="kanban">
          {quarterOptions.map((quarter) => {
            const quarterTrips = tripsByQuarter[quarter.id] || []
            return (
              <div className="kanban-column" key={quarter.id}>
                <div className="column-header">
                  <h3>{quarter.label}</h3>
                  <span className="pill">{quarterTrips.length}</span>
                </div>
                <div className="column-body">
                  {quarterTrips.length > 0 ? (
                    quarterTrips.map((trip) => (
                      <article key={trip.id} className="project-card trip-card">
                        <div
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => handleCardKeyDown(e, trip.id)}
                        >
                          <h4>{trip.name}</h4>
                          {trip.destination && (
                            <p className="muted">{trip.destination}</p>
                          )}
                          {(trip.startDate || trip.endDate) && (
                            <p className="muted tiny">
                              {trip.startDate && trip.endDate
                                ? `${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}`
                                : trip.startDate
                                  ? `From ${formatDate(trip.startDate)}`
                                  : `Until ${formatDate(trip.endDate)}`
                              }
                            </p>
                          )}
                        </div>
                        <div className="trip-card-actions">
                          <button
                            type="button"
                            className="icon-btn danger"
                            onClick={() => handleDelete(trip.id)}
                            title="Delete trip"
                          >
                            🗑
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="muted empty">No trips</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Trip</h3>
            <form onSubmit={handleAddSubmit}>
              <label>
                Name *
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Trip name"
                  autoFocus
                  required
                />
              </label>
              <label>
                Destination
                <input
                  type="text"
                  value={addForm.destination || ''}
                  onChange={(e) => setAddForm((f) => ({ ...f, destination: e.target.value }))}
                  placeholder="City, Country"
                />
              </label>
              <div className="form-row">
                <label>
                  Start Date *
                  <input
                    type="date"
                    value={addForm.startDate || ''}
                    onChange={(e) => setAddForm((f) => ({ ...f, startDate: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  End Date
                  <input
                    type="date"
                    value={addForm.endDate || ''}
                    onChange={(e) => setAddForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={addStatus === 'saving'}>
                  {addStatus === 'saving' ? 'Adding...' : 'Add Trip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
