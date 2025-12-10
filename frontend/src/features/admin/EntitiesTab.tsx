import { useState, useEffect, useCallback } from 'react'
import type { AdminEntity, AdminEntityWithOwnership, AdminEntityType, AdminEntityStatus, EntityId } from '../../types'
import { ADMIN_ENTITY_TYPES, ADMIN_ENTITY_STATUS } from '../../types'
import {
  fetchAdminEntities,
  fetchAdminEntity,
  createAdminEntity,
  updateAdminEntity,
  deleteAdminEntity,
  createEntityOwnership,
  deleteEntityOwnership,
} from '../../api'

const ENTITY_TYPE_LABELS: Record<AdminEntityType, string> = {
  llc: 'LLC',
  c_corp: 'C-Corp',
  s_corp: 'S-Corp',
  lp: 'Limited Partnership',
  trust: 'Trust',
  individual: 'Individual',
}

const STATUS_LABELS: Record<AdminEntityStatus, string> = {
  active: 'Active',
  dissolved: 'Dissolved',
  inactive: 'Inactive',
}

type EntitiesTabProps = {
  onError: (msg: string) => void
}

export function EntitiesTab({ onError }: EntitiesTabProps) {
  const [entities, setEntities] = useState<AdminEntity[]>([])
  const [selectedEntity, setSelectedEntity] = useState<AdminEntityWithOwnership | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingEntity, setEditingEntity] = useState<AdminEntity | null>(null)
  const [showOwnershipModal, setShowOwnershipModal] = useState(false)

  // Form state
  const [formState, setFormState] = useState({
    name: '',
    entityType: 'llc' as AdminEntityType,
    ein: '',
    stateOfFormation: '',
    formationDate: '',
    registeredAgent: '',
    address: '',
    status: 'active' as AdminEntityStatus,
    notes: '',
  })

  // Ownership form
  const [ownershipForm, setOwnershipForm] = useState({
    parentEntityId: '',
    childEntityId: '',
    ownershipPercentage: '',
    notes: '',
  })

  const loadEntities = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAdminEntities()
      setEntities(data)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load entities')
    } finally {
      setLoading(false)
    }
  }, [onError])

  const loadEntityDetail = useCallback(async (entityId: EntityId) => {
    try {
      const data = await fetchAdminEntity(String(entityId))
      setSelectedEntity(data)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load entity detail')
    }
  }, [onError])

  useEffect(() => {
    loadEntities()
  }, [loadEntities])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        name: formState.name,
        entityType: formState.entityType,
        ein: formState.ein || null,
        stateOfFormation: formState.stateOfFormation || null,
        formationDate: formState.formationDate || null,
        registeredAgent: formState.registeredAgent || null,
        address: formState.address || null,
        status: formState.status,
        notes: formState.notes || null,
      }

      if (editingEntity) {
        await updateAdminEntity(String(editingEntity.id), payload)
      } else {
        await createAdminEntity(payload)
      }

      setShowModal(false)
      setEditingEntity(null)
      resetForm()
      await loadEntities()
      if (selectedEntity && editingEntity?.id === selectedEntity.id) {
        await loadEntityDetail(selectedEntity.id)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save entity')
    }
  }

  const handleDelete = async (entityId: EntityId) => {
    if (!confirm('Are you sure you want to delete this entity?')) return
    try {
      await deleteAdminEntity(String(entityId))
      if (selectedEntity?.id === entityId) {
        setSelectedEntity(null)
      }
      await loadEntities()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete entity')
    }
  }

  const handleAddOwnership = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ownershipForm.parentEntityId || !ownershipForm.childEntityId || !ownershipForm.ownershipPercentage) return
    try {
      await createEntityOwnership({
        parentEntityId: ownershipForm.parentEntityId,
        childEntityId: ownershipForm.childEntityId,
        ownershipPercentage: parseFloat(ownershipForm.ownershipPercentage),
        notes: ownershipForm.notes || null,
      })
      setShowOwnershipModal(false)
      setOwnershipForm({ parentEntityId: '', childEntityId: '', ownershipPercentage: '', notes: '' })
      if (selectedEntity) {
        await loadEntityDetail(selectedEntity.id)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create ownership')
    }
  }

  const handleRemoveOwnership = async (ownershipId: EntityId) => {
    if (!confirm('Remove this ownership relationship?')) return
    try {
      await deleteEntityOwnership(String(ownershipId))
      if (selectedEntity) {
        await loadEntityDetail(selectedEntity.id)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to remove ownership')
    }
  }

  const resetForm = () => {
    setFormState({
      name: '',
      entityType: 'llc',
      ein: '',
      stateOfFormation: '',
      formationDate: '',
      registeredAgent: '',
      address: '',
      status: 'active',
      notes: '',
    })
  }

  const openAddModal = () => {
    setEditingEntity(null)
    resetForm()
    setShowModal(true)
  }

  const openEditModal = (entity: AdminEntity) => {
    setEditingEntity(entity)
    setFormState({
      name: entity.name,
      entityType: entity.entityType,
      ein: entity.ein || '',
      stateOfFormation: entity.stateOfFormation || '',
      formationDate: entity.formationDate || '',
      registeredAgent: entity.registeredAgent || '',
      address: entity.address || '',
      status: entity.status,
      notes: entity.notes || '',
    })
    setShowModal(true)
  }

  // Group entities by type for display
  const entitiesByType = entities.reduce((acc, entity) => {
    if (!acc[entity.entityType]) acc[entity.entityType] = []
    acc[entity.entityType].push(entity)
    return acc
  }, {} as Record<AdminEntityType, AdminEntity[]>)

  if (loading) {
    return <div className="loading-state">Loading entities...</div>
  }

  return (
    <div className="admin-entities-tab">
      <div className="entities-layout">
        {/* Left Panel - Entity List */}
        <div className="entities-list-panel">
          <div className="panel-header">
            <h3>Legal Entities</h3>
            <button className="btn btn-primary btn-sm" onClick={openAddModal}>
              + Add Entity
            </button>
          </div>

          <div className="entities-grouped">
            {(ADMIN_ENTITY_TYPES as readonly AdminEntityType[]).map((type) => {
              const typeEntities = entitiesByType[type] || []
              if (typeEntities.length === 0) return null
              return (
                <div key={type} className="entity-group">
                  <h4 className="group-header">{ENTITY_TYPE_LABELS[type]}s</h4>
                  <div className="entity-cards">
                    {typeEntities.map((entity) => (
                      <div
                        key={entity.id}
                        className={`entity-card ${selectedEntity?.id === entity.id ? 'selected' : ''}`}
                        onClick={() => loadEntityDetail(entity.id)}
                      >
                        <div className="entity-card-header">
                          <span className="entity-name">{entity.name}</span>
                          <span className={`status-badge status-${entity.status}`}>
                            {STATUS_LABELS[entity.status]}
                          </span>
                        </div>
                        <div className="entity-card-meta">
                          {entity.stateOfFormation && <span>{entity.stateOfFormation}</span>}
                          {entity.ein && <span>EIN: {entity.ein}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {entities.length === 0 && (
              <div className="empty-state">
                <p>No entities yet. Click "Add Entity" to create one.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Entity Detail */}
        <div className="entity-detail-panel">
          {selectedEntity ? (
            <>
              <div className="detail-header">
                <h2>{selectedEntity.name}</h2>
                <div className="detail-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(selectedEntity)}>
                    Edit
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selectedEntity.id)}>
                    Delete
                  </button>
                </div>
              </div>

              <div className="detail-sections">
                <div className="detail-section">
                  <h4>Basic Information</h4>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <label>Entity Type</label>
                      <span>{ENTITY_TYPE_LABELS[selectedEntity.entityType]}</span>
                    </div>
                    <div className="detail-item">
                      <label>Status</label>
                      <span className={`status-badge status-${selectedEntity.status}`}>
                        {STATUS_LABELS[selectedEntity.status]}
                      </span>
                    </div>
                    <div className="detail-item">
                      <label>EIN</label>
                      <span>{selectedEntity.ein || '—'}</span>
                    </div>
                    <div className="detail-item">
                      <label>State of Formation</label>
                      <span>{selectedEntity.stateOfFormation || '—'}</span>
                    </div>
                    <div className="detail-item">
                      <label>Formation Date</label>
                      <span>{selectedEntity.formationDate || '—'}</span>
                    </div>
                    <div className="detail-item">
                      <label>Registered Agent</label>
                      <span>{selectedEntity.registeredAgent || '—'}</span>
                    </div>
                    <div className="detail-item full-width">
                      <label>Address</label>
                      <span>{selectedEntity.address || '—'}</span>
                    </div>
                    {selectedEntity.notes && (
                      <div className="detail-item full-width">
                        <label>Notes</label>
                        <span>{selectedEntity.notes}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ownership Section */}
                <div className="detail-section">
                  <div className="section-header">
                    <h4>Ownership Structure</h4>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowOwnershipModal(true)}>
                      + Add Ownership
                    </button>
                  </div>

                  {/* Owned By (Parents) */}
                  {selectedEntity.parentRelationships.length > 0 && (
                    <div className="ownership-group">
                      <h5>Owned By:</h5>
                      <div className="ownership-list">
                        {selectedEntity.parentRelationships.map((rel) => (
                          <div key={rel.id} className="ownership-item">
                            <span className="ownership-entity">{rel.parentEntity?.name}</span>
                            <span className="ownership-pct">{rel.ownershipPercentage}%</span>
                            <button
                              className="btn-icon"
                              onClick={() => handleRemoveOwnership(rel.id)}
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Owns (Children) */}
                  {selectedEntity.childRelationships.length > 0 && (
                    <div className="ownership-group">
                      <h5>Owns:</h5>
                      <div className="ownership-list">
                        {selectedEntity.childRelationships.map((rel) => (
                          <div key={rel.id} className="ownership-item">
                            <span className="ownership-entity">{rel.childEntity?.name}</span>
                            <span className="ownership-pct">{rel.ownershipPercentage}%</span>
                            <button
                              className="btn-icon"
                              onClick={() => handleRemoveOwnership(rel.id)}
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedEntity.parentRelationships.length === 0 && selectedEntity.childRelationships.length === 0 && (
                    <p className="muted">No ownership relationships defined.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-detail">
              <p>Select an entity to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Entity Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEntity ? 'Edit Entity' : 'Add Entity'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Entity Name *</label>
                    <input
                      type="text"
                      value={formState.name}
                      onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Entity Type *</label>
                    <select
                      value={formState.entityType}
                      onChange={(e) => setFormState({ ...formState, entityType: e.target.value as AdminEntityType })}
                    >
                      {(ADMIN_ENTITY_TYPES as readonly AdminEntityType[]).map((type) => (
                        <option key={type} value={type}>{ENTITY_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>EIN</label>
                    <input
                      type="text"
                      value={formState.ein}
                      onChange={(e) => setFormState({ ...formState, ein: e.target.value })}
                      placeholder="XX-XXXXXXX"
                    />
                  </div>
                  <div className="form-group">
                    <label>State of Formation</label>
                    <input
                      type="text"
                      value={formState.stateOfFormation}
                      onChange={(e) => setFormState({ ...formState, stateOfFormation: e.target.value })}
                      placeholder="e.g., Delaware"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Formation Date</label>
                    <input
                      type="date"
                      value={formState.formationDate}
                      onChange={(e) => setFormState({ ...formState, formationDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formState.status}
                      onChange={(e) => setFormState({ ...formState, status: e.target.value as AdminEntityStatus })}
                    >
                      {(ADMIN_ENTITY_STATUS as readonly AdminEntityStatus[]).map((status) => (
                        <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Registered Agent</label>
                  <input
                    type="text"
                    value={formState.registeredAgent}
                    onChange={(e) => setFormState({ ...formState, registeredAgent: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    value={formState.address}
                    onChange={(e) => setFormState({ ...formState, address: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={formState.notes}
                    onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingEntity ? 'Save Changes' : 'Create Entity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ownership Modal */}
      {showOwnershipModal && (
        <div className="modal-overlay" onClick={() => setShowOwnershipModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Ownership Relationship</h3>
              <button className="modal-close" onClick={() => setShowOwnershipModal(false)}>×</button>
            </div>
            <form onSubmit={handleAddOwnership}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Parent Entity (Owner) *</label>
                  <select
                    value={ownershipForm.parentEntityId}
                    onChange={(e) => setOwnershipForm({ ...ownershipForm, parentEntityId: e.target.value })}
                    required
                  >
                    <option value="">Select parent entity...</option>
                    {entities
                      .filter((e) => e.id !== selectedEntity?.id)
                      .map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Child Entity (Owned) *</label>
                  <select
                    value={ownershipForm.childEntityId}
                    onChange={(e) => setOwnershipForm({ ...ownershipForm, childEntityId: e.target.value })}
                    required
                  >
                    <option value="">Select child entity...</option>
                    {entities
                      .filter((e) => e.id !== selectedEntity?.id && e.id !== ownershipForm.parentEntityId)
                      .map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Ownership Percentage *</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={ownershipForm.ownershipPercentage}
                    onChange={(e) => setOwnershipForm({ ...ownershipForm, ownershipPercentage: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={ownershipForm.notes}
                    onChange={(e) => setOwnershipForm({ ...ownershipForm, notes: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowOwnershipModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">Add Ownership</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

