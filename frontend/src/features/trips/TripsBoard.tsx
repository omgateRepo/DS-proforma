import { useState, useMemo, useCallback, type KeyboardEvent } from 'react'
import type { Trip, TripInput, TripItem, TripItemInput, TripCollaborator, EntityId, UserSummary } from '../../types'
import { TripDetailView } from './TripDetailView'

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
  // Trip items
  tripItems: TripItem[]
  tripItemsStatus: 'idle' | 'loading' | 'loaded' | 'error'
  onLoadTripItems: (tripId: EntityId) => Promise<void>
  onCreateTripItem: (tripId: EntityId, input: TripItemInput) => Promise<void>
  onUpdateTripItem: (itemId: EntityId, input: Partial<TripItemInput>) => Promise<void>
  onDeleteTripItem: (itemId: EntityId) => Promise<void>
  // Trip collaborators
  onAddTripCollaborator: (tripId: EntityId, email: string) => Promise<void>
  onRemoveTripCollaborator: (tripId: EntityId, collaboratorId: string) => Promise<void>
  onReorderTripItems: (tripId: EntityId, items: { id: string; sortOrder: number }[]) => Promise<void>
  // Users for collaboration
  users: UserSummary[]
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
  tripItems,
  tripItemsStatus,
  onLoadTripItems,
  onCreateTripItem,
  onUpdateTripItem,
  onDeleteTripItem,
  onReorderTripItems,
  onAddTripCollaborator,
  onRemoveTripCollaborator,
  users,
}: TripsBoardProps) {
  const [selectedTripId, setSelectedTripId] = useState<EntityId | null>(null)
  
  const selectedTrip = useMemo(() => {
    if (!selectedTripId) return null
    return trips.find((t) => t.id === selectedTripId) || null
  }, [trips, selectedTripId])

  // Filter available users for collaboration (exclude owner and existing collaborators)
  const availableUsersForTrip = useMemo(() => {
    if (!selectedTrip) return []
    const excluded = new Set<string>()
    if (selectedTrip.ownerId) excluded.add(String(selectedTrip.ownerId))
    selectedTrip.collaborators?.forEach((collab) => {
      if (collab.userId) excluded.add(String(collab.userId))
    })
    return users.filter((user) => user.id && !excluded.has(String(user.id)))
  }, [selectedTrip, users])
  
  const handleSelectTrip = useCallback(async (tripId: EntityId) => {
    setSelectedTripId(tripId)
    await onLoadTripItems(tripId)
  }, [onLoadTripItems])

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
      handleSelectTrip(tripId)
    }
  }
  
  const handleCardClick = (tripId: EntityId) => {
    handleSelectTrip(tripId)
  }

  const handleDelete = useCallback(async (tripId: EntityId) => {
    if (!confirm('Delete this trip?')) return
    await onDeleteTrip(tripId)
  }, [onDeleteTrip])

  if (tripsStatus === 'loading') {
    return <p className="muted">Loading trips...</p>
  }

  if (tripsStatus === 'error') {
    return <p className="error">{tripsError || 'Failed to load trips'}</p>
  }

  // If a trip is selected, show full-screen detail view
  if (selectedTrip) {
    return (
      <div className="trip-detail-fullscreen">
        <TripDetailView
          trip={selectedTrip}
          items={tripItems}
          itemsStatus={tripItemsStatus}
          onCreateItem={(input) => onCreateTripItem(selectedTrip.id, input)}
          onUpdateItem={onUpdateTripItem}
          onDeleteItem={onDeleteTripItem}
          onReorderItems={(items) => onReorderTripItems(selectedTrip.id, items)}
          onClose={() => setSelectedTripId(null)}
          ownerName={selectedTrip.ownerName}
          ownerEmail={selectedTrip.ownerEmail}
          collaborators={selectedTrip.collaborators.map((c) => ({
            id: c.id,
            displayName: c.displayName || '',
            email: c.email,
          }))}
          availableUsers={availableUsersForTrip}
          onAddCollaborator={(email) => onAddTripCollaborator(selectedTrip.id, email)}
          onRemoveCollaborator={(collaboratorId) => onRemoveTripCollaborator(selectedTrip.id, collaboratorId)}
        />
      </div>
    )
  }

  return (
    <>
      <section className="kanban-section">
        <div className="kanban">
          {quarterOptions.map((quarter) => {
            const quarterTrips = tripsByQuarter[quarter.id] || []
            return (
              <div className="kanban-column" key={quarter.id}>
                <div className="kanban-column-header">
                  <h3>{quarter.label}</h3>
                  <span className="pill">{quarterTrips.length}</span>
                </div>
                <div className="column-body">
                  {quarterTrips.length > 0 ? (
                    quarterTrips.map((trip) => (
                      <article 
                        key={trip.id} 
                        className="project-card trip-card"
                        onClick={() => handleCardClick(trip.id)}
                      >
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
                            className="btn-icon danger"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(trip.id)
                            }}
                            title="Delete trip"
                          >
                            🗑️
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
    </>
  )
}
