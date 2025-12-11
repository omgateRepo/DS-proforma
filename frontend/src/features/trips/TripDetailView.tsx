import { useState, useMemo, useCallback, type FormEvent } from 'react'
import type { Trip, TripItem, TripItemInput, TripItemType, EntityId, UserSummary } from '../../types'

const ITEM_TYPE_ICONS: Record<TripItemType, string> = {
  flight: '✈️',
  stay: '🏨',
  vehicle: '🚗',
  attraction: '🎡',
}

const ITEM_TYPE_LABELS: Record<TripItemType, string> = {
  flight: 'Flight',
  stay: 'Stay',
  vehicle: 'Vehicle',
  attraction: 'Attraction',
}

type TripTab = 'itinerary' | 'collaboration'

type TripDetailViewProps = {
  trip: Trip
  items: TripItem[]
  itemsStatus: 'idle' | 'loading' | 'loaded' | 'error'
  onCreateItem: (input: TripItemInput) => Promise<void>
  onUpdateItem: (itemId: EntityId, input: Partial<TripItemInput>) => Promise<void>
  onDeleteItem: (itemId: EntityId) => Promise<void>
  onReorderItems: (items: { id: string; sortOrder: number }[]) => Promise<void>
  onClose: () => void
  // Collaboration props
  ownerName?: string
  ownerEmail?: string
  collaborators?: { id: string; displayName: string; email: string }[]
  availableUsers?: UserSummary[]
  onAddCollaborator?: (email: string) => Promise<void>
  onRemoveCollaborator?: (collaboratorId: string) => Promise<void>
}

type ItemFormState = {
  itemType: TripItemType
  name: string
  location: string
  confirmationNo: string
  bookingUrl: string
  notes: string
  costUsd: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  departTime: string
  arriveTime: string
}

const EMPTY_FORM: ItemFormState = {
  itemType: 'flight',
  name: '',
  location: '',
  confirmationNo: '',
  bookingUrl: '',
  notes: '',
  costUsd: '',
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  departTime: '',
  arriveTime: '',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return ''
  return timeStr
}

function formatCost(cost: number | null): string {
  if (cost === null || cost === undefined) return ''
  return `$${cost.toLocaleString()}`
}

export function TripDetailView({
  trip,
  items,
  itemsStatus,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
  onClose,
  ownerName = 'Owner',
  ownerEmail = '',
  collaborators = [],
  availableUsers = [],
  onAddCollaborator,
  onRemoveCollaborator,
}: TripDetailViewProps) {
  const [activeTab, setActiveTab] = useState<TripTab>('itinerary')
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState<TripItem | null>(null)
  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_FORM)
  const [formStatus, setFormStatus] = useState<'idle' | 'saving'>('idle')
  const [showAddDropdown, setShowAddDropdown] = useState(false)
  const [draggedItemId, setDraggedItemId] = useState<EntityId | null>(null)
  const [collaboratorSelection, setCollaboratorSelection] = useState('')
  const [collaboratorStatus, setCollaboratorStatus] = useState<'idle' | 'saving'>('idle')

  // Sort items by sort_order (allows manual reordering via drag and drop)
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.sortOrder - b.sortOrder)
  }, [items])

  const openAddModal = useCallback((itemType: TripItemType) => {
    setEditingItem(null)
    setItemForm({ ...EMPTY_FORM, itemType })
    setShowItemModal(true)
    setShowAddDropdown(false)
  }, [])

  const openEditModal = useCallback((item: TripItem) => {
    setEditingItem(item)
    setItemForm({
      itemType: item.itemType,
      name: item.name,
      location: item.location || '',
      confirmationNo: item.confirmationNo || '',
      bookingUrl: item.bookingUrl || '',
      notes: item.notes || '',
      costUsd: item.costUsd != null ? String(item.costUsd) : '',
      startDate: item.startDate || '',
      startTime: item.startTime || '',
      endDate: item.endDate || '',
      endTime: item.endTime || '',
      departTime: item.departTime || '',
      arriveTime: item.arriveTime || '',
    })
    setShowItemModal(true)
  }, [])

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!itemForm.name.trim() || !itemForm.startDate) return

    setFormStatus('saving')
    try {
      const input: TripItemInput = {
        itemType: itemForm.itemType,
        name: itemForm.name.trim(),
        location: itemForm.location.trim() || null,
        confirmationNo: itemForm.confirmationNo.trim() || null,
        bookingUrl: itemForm.bookingUrl.trim() || null,
        notes: itemForm.notes.trim() || null,
        costUsd: itemForm.costUsd ? parseFloat(itemForm.costUsd) : null,
        startDate: itemForm.startDate,
        startTime: itemForm.startTime || null,
        endDate: itemForm.endDate || null,
        endTime: itemForm.endTime || null,
        departTime: itemForm.departTime || null,
        arriveTime: itemForm.arriveTime || null,
      }

      if (editingItem) {
        await onUpdateItem(editingItem.id, input)
      } else {
        await onCreateItem(input)
      }
      setShowItemModal(false)
      setItemForm(EMPTY_FORM)
      setEditingItem(null)
    } finally {
      setFormStatus('idle')
    }
  }

  const handleDelete = useCallback(async (itemId: EntityId) => {
    if (!confirm('Delete this item?')) return
    await onDeleteItem(itemId)
  }, [onDeleteItem])

  // Drag and drop handlers
  const handleDragStart = (itemId: EntityId) => {
    setDraggedItemId(itemId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (targetItemId: EntityId) => {
    if (!draggedItemId || draggedItemId === targetItemId) {
      setDraggedItemId(null)
      return
    }

    const draggedIndex = sortedItems.findIndex((i) => i.id === draggedItemId)
    const targetIndex = sortedItems.findIndex((i) => i.id === targetItemId)
    
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItemId(null)
      return
    }

    // Create new order
    const newItems = [...sortedItems]
    const [draggedItem] = newItems.splice(draggedIndex, 1)
    newItems.splice(targetIndex, 0, draggedItem)

    // Update sort orders
    const reorderPayload = newItems.map((item, index) => ({
      id: item.id as string,
      sortOrder: index,
    }))

    await onReorderItems(reorderPayload)
    setDraggedItemId(null)
  }

  const handleDragEnd = () => {
    setDraggedItemId(null)
  }

  const handleAddCollaborator = async (e: FormEvent) => {
    e.preventDefault()
    if (!collaboratorSelection || !onAddCollaborator) return
    const selectedUser = availableUsers.find((u) => String(u.id) === collaboratorSelection)
    if (!selectedUser?.email) return
    setCollaboratorStatus('saving')
    try {
      await onAddCollaborator(selectedUser.email)
      setCollaboratorSelection('')
    } finally {
      setCollaboratorStatus('idle')
    }
  }

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    if (!onRemoveCollaborator) return
    setCollaboratorStatus('saving')
    try {
      await onRemoveCollaborator(collaboratorId)
    } finally {
      setCollaboratorStatus('idle')
    }
  }

  return (
    <div className="trip-detail-view">
      {/* Back button */}
      <div className="detail-nav">
        <button type="button" className="ghost" onClick={onClose}>
          ← Back to trips
        </button>
      </div>

      {/* Header */}
      <div className="trip-detail-header">
        <div className="trip-detail-info">
          <p className="eyebrow">Trip</p>
          <h2>{trip.name}</h2>
          {trip.destination && <p className="trip-destination">📍 {trip.destination}</p>}
          {(trip.startDate || trip.endDate) && (
            <p className="trip-dates">
              📅 {trip.startDate && trip.endDate
                ? `${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}`
                : trip.startDate
                  ? `From ${formatDate(trip.startDate)}`
                  : `Until ${formatDate(trip.endDate)}`
              }
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="trip-tabs">
        <button
          type="button"
          className={activeTab === 'itinerary' ? 'active' : ''}
          onClick={() => setActiveTab('itinerary')}
        >
          📋 Itinerary
        </button>
        <button
          type="button"
          className={activeTab === 'collaboration' ? 'active' : ''}
          onClick={() => setActiveTab('collaboration')}
        >
          👥 Collaboration
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'itinerary' && (
        <div className="trip-items-section">
          <div className="section-header">
            <h3>Itinerary</h3>
            <div className="add-item-dropdown">
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={() => setShowAddDropdown(!showAddDropdown)}
              >
                + Add Item
              </button>
              {showAddDropdown && (
                <div className="dropdown-menu">
                  <button type="button" onClick={() => openAddModal('flight')}>
                    {ITEM_TYPE_ICONS.flight} Flight
                  </button>
                  <button type="button" onClick={() => openAddModal('stay')}>
                    {ITEM_TYPE_ICONS.stay} Stay
                  </button>
                  <button type="button" onClick={() => openAddModal('vehicle')}>
                    {ITEM_TYPE_ICONS.vehicle} Vehicle
                  </button>
                  <button type="button" onClick={() => openAddModal('attraction')}>
                    {ITEM_TYPE_ICONS.attraction} Attraction
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="trip-items-list">
            {itemsStatus === 'loading' ? (
              <p className="muted">Loading items...</p>
            ) : sortedItems.length === 0 ? (
              <div className="empty-state">
                <p>No items yet. Add flights, stays, vehicles, or attractions.</p>
              </div>
            ) : (
              sortedItems.map((item) => (
            <div
              key={item.id}
              className={`trip-item-card ${draggedItemId === item.id ? 'dragging' : ''}`}
              draggable
              onDragStart={() => handleDragStart(item.id)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(item.id)}
              onDragEnd={handleDragEnd}
            >
              <div className="trip-item-drag-handle" title="Drag to reorder">⋮⋮</div>
              <div className={`trip-item-icon trip-item-icon-${item.itemType}`}>
                {ITEM_TYPE_ICONS[item.itemType]}
              </div>
              <div className="trip-item-content">
                <div className="trip-item-header">
                  <h4>{item.name}</h4>
                  {item.costUsd != null && (
                    <span className="trip-item-cost">{formatCost(item.costUsd)}</span>
                  )}
                </div>
                {item.location && (
                  <p className="trip-item-location">{item.location}</p>
                )}
                <div className="trip-item-datetime">
                  <span className="trip-item-date">{formatDate(item.startDate)}</span>
                  {item.itemType === 'flight' ? (
                    <span className="trip-item-time">
                      {item.departTime && `Depart: ${formatTime(item.departTime)}`}
                      {item.departTime && item.arriveTime && ' → '}
                      {item.arriveTime && `Arrive: ${formatTime(item.arriveTime)}`}
                    </span>
                  ) : item.startTime && (
                    <span className="trip-item-time">{formatTime(item.startTime)}</span>
                  )}
                  {item.endDate && item.endDate !== item.startDate && (
                    <span className="trip-item-end-date">
                      → {formatDate(item.endDate)}
                      {item.endTime && ` at ${formatTime(item.endTime)}`}
                    </span>
                  )}
                </div>
                {item.confirmationNo && (
                  <p className="trip-item-confirmation">Conf: {item.confirmationNo}</p>
                )}
                {item.bookingUrl && (
                  <a 
                    href={item.bookingUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="trip-item-booking-link"
                  >
                    🔗 View Booking
                  </a>
                )}
                {item.notes && (
                  <p className="trip-item-notes">{item.notes}</p>
                )}
              </div>
              <div className="trip-item-actions">
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => openEditModal(item)}
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  className="btn-icon danger"
                  onClick={() => handleDelete(item.id)}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
          </div>
        </div>
      )}

      {/* Collaboration Tab */}
      {activeTab === 'collaboration' && (
        <div className="trip-collaboration-wrapper">
          <section className="collaborators-panel">
            <div className="section-header">
              <h4>Collaborators</h4>
            </div>
            <div className="collaborator-owner">
              <span className="pill">Owner</span>
              <div>
                <strong>{ownerName}</strong>
                {ownerEmail && <p className="muted tiny">{ownerEmail}</p>}
              </div>
            </div>
            <ul className="collaborator-list">
              {collaborators.length === 0 && (
                <li className="muted tiny">No collaborators yet.</li>
              )}
              {collaborators.map((collab) => (
                <li key={collab.id} className="collaborator-item">
                  <div>
                    <strong>{collab.displayName || collab.email || 'User'}</strong>
                    <p className="muted tiny">{collab.email}</p>
                  </div>
                  {onRemoveCollaborator && (
                    <button
                      type="button"
                      className="btn-icon danger"
                      onClick={() => handleRemoveCollaborator(collab.id)}
                      disabled={collaboratorStatus === 'saving'}
                      title="Remove collaborator"
                    >
                      🗑️
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {onAddCollaborator && availableUsers.length > 0 && (
              <form onSubmit={handleAddCollaborator} className="collaborator-form">
                <label>
                  <span className="muted tiny">Invite collaborator</span>
                  <select
                    value={collaboratorSelection}
                    onChange={(e) => setCollaboratorSelection(e.target.value)}
                    disabled={collaboratorStatus === 'saving'}
                  >
                    <option value="">Select a user…</option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName || user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="primary"
                  disabled={collaboratorStatus === 'saving' || !collaboratorSelection}
                >
                  {collaboratorStatus === 'saving' ? 'Adding…' : 'Add collaborator'}
                </button>
              </form>
            )}
            {!onAddCollaborator && (
              <p className="muted tiny">Collaboration features coming soon.</p>
            )}
          </section>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {showItemModal && (
        <div className="modal-overlay" onClick={() => setShowItemModal(false)}>
          <div className="modal-content trip-item-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-icon" data-type={itemForm.itemType}>
                {ITEM_TYPE_ICONS[itemForm.itemType]}
              </div>
              <div>
                <h3>{editingItem ? 'Edit' : 'Add'} {ITEM_TYPE_LABELS[itemForm.itemType]}</h3>
                <p className="modal-subtitle">
                  {itemForm.itemType === 'flight' ? 'Add your flight details' :
                   itemForm.itemType === 'stay' ? 'Add your accommodation' :
                   itemForm.itemType === 'vehicle' ? 'Add your rental car' :
                   'Add an activity or attraction'}
                </p>
              </div>
              <button className="modal-close" onClick={() => setShowItemModal(false)}>×</button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="modal-body">
                {/* Basic Info Section */}
                <div className="form-section">
                  <div className="form-section-title">Basic Info</div>
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      value={itemForm.name}
                      onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={
                        itemForm.itemType === 'flight' ? 'e.g., United UA123' :
                        itemForm.itemType === 'stay' ? 'e.g., Hilton Downtown' :
                        itemForm.itemType === 'vehicle' ? 'e.g., Hertz - SUV' :
                        'e.g., City Walking Tour'
                      }
                      autoFocus
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Location</label>
                    <input
                      type="text"
                      value={itemForm.location}
                      onChange={(e) => setItemForm((f) => ({ ...f, location: e.target.value }))}
                      placeholder={
                        itemForm.itemType === 'flight' ? 'e.g., JFK → LAX' :
                        itemForm.itemType === 'stay' ? 'e.g., 123 Main St, City' :
                        itemForm.itemType === 'vehicle' ? 'e.g., Airport Terminal 1' :
                        'e.g., Museum of Art'
                      }
                    />
                  </div>
                </div>

                {/* Date & Time Section */}
                <div className="form-section">
                  <div className="form-section-title">
                    {itemForm.itemType === 'flight' ? 'Flight Schedule' :
                     itemForm.itemType === 'stay' ? 'Check-in / Check-out' :
                     itemForm.itemType === 'vehicle' ? 'Pickup / Drop-off' :
                     'Date & Time'}
                  </div>
                  
                  {itemForm.itemType === 'flight' ? (
                    <>
                      <div className="form-row form-row-3">
                        <div className="form-group">
                          <label>Departure Date *</label>
                          <input
                            type="date"
                            value={itemForm.startDate}
                            onChange={(e) => setItemForm((f) => ({ ...f, startDate: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label>Depart Time *</label>
                          <input
                            type="time"
                            value={itemForm.departTime}
                            onChange={(e) => setItemForm((f) => ({ ...f, departTime: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label>Arrive Time *</label>
                          <input
                            type="time"
                            value={itemForm.arriveTime}
                            onChange={(e) => setItemForm((f) => ({ ...f, arriveTime: e.target.value }))}
                            required
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Arrival Date</label>
                          <input
                            type="date"
                            value={itemForm.endDate}
                            onChange={(e) => setItemForm((f) => ({ ...f, endDate: e.target.value }))}
                          />
                        </div>
                        <div className="form-group" />
                      </div>
                    </>
                  ) : itemForm.itemType === 'stay' || itemForm.itemType === 'vehicle' ? (
                    <>
                      <div className="form-row">
                        <div className="form-group">
                          <label>{itemForm.itemType === 'stay' ? 'Check-in Date *' : 'Pickup Date *'}</label>
                          <input
                            type="date"
                            value={itemForm.startDate}
                            onChange={(e) => setItemForm((f) => ({ ...f, startDate: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label>{itemForm.itemType === 'stay' ? 'Check-in Time' : 'Pickup Time'}</label>
                          <input
                            type="time"
                            value={itemForm.startTime}
                            onChange={(e) => setItemForm((f) => ({ ...f, startTime: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>{itemForm.itemType === 'stay' ? 'Check-out Date' : 'Drop-off Date'}</label>
                          <input
                            type="date"
                            value={itemForm.endDate}
                            onChange={(e) => setItemForm((f) => ({ ...f, endDate: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label>{itemForm.itemType === 'stay' ? 'Check-out Time' : 'Drop-off Time'}</label>
                          <input
                            type="time"
                            value={itemForm.endTime}
                            onChange={(e) => setItemForm((f) => ({ ...f, endTime: e.target.value }))}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="form-row">
                      <div className="form-group">
                        <label>Date *</label>
                        <input
                          type="date"
                          value={itemForm.startDate}
                          onChange={(e) => setItemForm((f) => ({ ...f, startDate: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Time</label>
                        <input
                          type="time"
                          value={itemForm.startTime}
                          onChange={(e) => setItemForm((f) => ({ ...f, startTime: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Booking Details Section */}
                <div className="form-section">
                  <div className="form-section-title">Booking Details</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Confirmation #</label>
                      <input
                        type="text"
                        value={itemForm.confirmationNo}
                        onChange={(e) => setItemForm((f) => ({ ...f, confirmationNo: e.target.value }))}
                        placeholder="e.g., ABC123"
                      />
                    </div>
                    <div className="form-group">
                      <label>Cost (USD)</label>
                      <input
                        type="number"
                        value={itemForm.costUsd}
                        onChange={(e) => setItemForm((f) => ({ ...f, costUsd: e.target.value }))}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Booking Link</label>
                    <input
                      type="url"
                      value={itemForm.bookingUrl}
                      onChange={(e) => setItemForm((f) => ({ ...f, bookingUrl: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <textarea
                      value={itemForm.notes}
                      onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Additional notes or reminders..."
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowItemModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formStatus === 'saving'}>
                  {formStatus === 'saving' ? 'Saving...' : editingItem ? 'Save Changes' : `Add ${ITEM_TYPE_LABELS[itemForm.itemType]}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
