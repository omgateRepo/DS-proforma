import { useState, useEffect, useCallback } from 'react'
import type { AdminEntity, AdminEntityWithOwnership, AdminEntityType, AdminEntityStatus, CompanyType, LegalStructure, TaxStatus, EntityId } from '../../types'
import { ADMIN_ENTITY_TYPES, ADMIN_ENTITY_STATUS, COMPANY_TYPES, LEGAL_STRUCTURES, TAX_STATUSES } from '../../types'
import {
  fetchAdminEntities,
  fetchAdminEntity,
  createAdminEntity,
  updateAdminEntity,
  deleteAdminEntity,
  createEntityOwnership,
  deleteEntityOwnership,
  fetchProjectDetail,
} from '../../api'

// Note: createEntityOwnership and deleteEntityOwnership are still used by Holdings management

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

const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  regular: 'Regular Company',
  holding: 'Holding Company',
}

const LEGAL_STRUCTURE_LABELS: Record<LegalStructure, string> = {
  llc: 'LLC',
  c_corp: 'C-Corp',
}

const TAX_STATUS_LABELS: Record<TaxStatus, string> = {
  passthrough: 'Pass-through',
  blocked: 'Blocked',
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
    // Company classification
    companyType: 'regular' as CompanyType,
    legalStructure: 'llc' as LegalStructure,
    taxStatus: 'passthrough' as TaxStatus,
  })

  
  // Holdings modal state (for holding companies)
  const [showHoldingsModal, setShowHoldingsModal] = useState(false)
  const [selectedHoldings, setSelectedHoldings] = useState<string[]>([])
  const [holdingOwnershipPcts, setHoldingOwnershipPcts] = useState<Record<string, string>>({})
  const [loadingOwnership, setLoadingOwnership] = useState(false)

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
        // Company classification
        companyType: formState.companyType,
        legalStructure: formState.legalStructure,
        taxStatus: formState.legalStructure === 'llc' ? formState.taxStatus : null,
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


  // Fetch ownership % from GP contributions for a linked project
  const fetchOwnershipFromProject = useCallback(async (projectId: string, currentUserId?: string) => {
    try {
      const project = await fetchProjectDetail(projectId)
      if (project?.gpContributions && currentUserId) {
        // Find GP contribution for current user and return their holding %
        const userContribution = project.gpContributions.find(
          (gp: { partner?: string; holdingPct?: number }) => gp.partner === currentUserId
        )
        return userContribution?.holdingPct || null
      }
      return null
    } catch {
      return null
    }
  }, [])

  // Open holdings modal for a holding company
  const openHoldingsModal = () => {
    if (!selectedEntity || selectedEntity.companyType !== 'holding') return
    // Pre-select existing holdings
    const existingHoldings = selectedEntity.childRelationships.map(rel => String(rel.childEntityId))
    setSelectedHoldings(existingHoldings)
    // Pre-populate ownership percentages
    const pcts: Record<string, string> = {}
    selectedEntity.childRelationships.forEach(rel => {
      pcts[String(rel.childEntityId)] = String(rel.ownershipPercentage)
    })
    setHoldingOwnershipPcts(pcts)
    setShowHoldingsModal(true)
  }

  // Handle selecting/deselecting an entity for holding
  const handleHoldingSelect = async (entityId: string, checked: boolean) => {
    if (checked) {
      setSelectedHoldings(prev => [...prev, entityId])
      // Try to auto-populate ownership from GP contributions
      const entity = entities.find(e => String(e.id) === entityId)
      if (entity?.linkedProjectId) {
        setLoadingOwnership(true)
        const pct = await fetchOwnershipFromProject(String(entity.linkedProjectId))
        if (pct !== null) {
          setHoldingOwnershipPcts(prev => ({ ...prev, [entityId]: String(pct) }))
        }
        setLoadingOwnership(false)
      }
    } else {
      setSelectedHoldings(prev => prev.filter(id => id !== entityId))
    }
  }

  // Save holdings
  const handleSaveHoldings = async () => {
    if (!selectedEntity) return
    try {
      // Get current holdings
      const currentHoldings = selectedEntity.childRelationships.map(rel => String(rel.childEntityId))
      
      // Remove deselected holdings
      for (const rel of selectedEntity.childRelationships) {
        if (!selectedHoldings.includes(String(rel.childEntityId))) {
          await deleteEntityOwnership(String(rel.id))
        }
      }
      
      // Add new holdings
      for (const entityId of selectedHoldings) {
        if (!currentHoldings.includes(entityId)) {
          const pct = parseFloat(holdingOwnershipPcts[entityId] || '0')
          if (pct > 0) {
            await createEntityOwnership({
              parentEntityId: String(selectedEntity.id),
              childEntityId: entityId,
              ownershipPercentage: pct,
              notes: null,
            })
          }
        }
      }
      
      setShowHoldingsModal(false)
      await loadEntityDetail(selectedEntity.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save holdings')
    }
  }

  // Get holdable entities (non-holding, non-self)
  const getHoldableEntities = () => {
    return entities.filter(e => 
      e.id !== selectedEntity?.id && 
      e.companyType !== 'holding'
    )
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
      companyType: 'regular',
      legalStructure: 'llc',
      taxStatus: 'passthrough',
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
      companyType: entity.companyType || 'regular',
      legalStructure: entity.legalStructure || 'llc',
      taxStatus: entity.taxStatus || 'passthrough',
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
            <button className="btn btn-accent btn-sm" onClick={openAddModal}>
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
                          <div className="entity-badges">
                            {entity.companyType === 'holding' && (
                              <span className="badge badge-holding">Holding</span>
                            )}
                            <span className={`status-badge status-${entity.status}`}>
                              {STATUS_LABELS[entity.status]}
                            </span>
                          </div>
                        </div>
                        <div className="entity-card-meta">
                          {entity.stateOfFormation && <span>{entity.stateOfFormation}</span>}
                          {entity.legalStructure && (
                            <span>
                              {LEGAL_STRUCTURE_LABELS[entity.legalStructure]}
                              {entity.legalStructure === 'llc' && entity.taxStatus && ` (${TAX_STATUS_LABELS[entity.taxStatus]})`}
                            </span>
                          )}
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
                  <button className="btn-icon" onClick={() => openEditModal(selectedEntity)} title="Edit">
                    ✏️
                  </button>
                  <button className="btn-icon danger" onClick={() => handleDelete(selectedEntity.id)} title="Delete">
                    🗑️
                  </button>
                </div>
              </div>

              <div className="detail-sections">
                {/* Company Classification */}
                <div className="detail-section">
                  <h4>Classification</h4>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <label>Company Type</label>
                      <span>
                        {selectedEntity.companyType ? COMPANY_TYPE_LABELS[selectedEntity.companyType] : '—'}
                        {selectedEntity.companyType === 'holding' && ' 🏢'}
                      </span>
                    </div>
                    <div className="detail-item">
                      <label>Legal Structure</label>
                      <span>{selectedEntity.legalStructure ? LEGAL_STRUCTURE_LABELS[selectedEntity.legalStructure] : '—'}</span>
                    </div>
                    {selectedEntity.legalStructure === 'llc' && (
                      <div className="detail-item">
                        <label>Tax Status</label>
                        <span>{selectedEntity.taxStatus ? TAX_STATUS_LABELS[selectedEntity.taxStatus] : '—'}</span>
                      </div>
                    )}
                    {selectedEntity.linkedProjectId && (
                      <div className="detail-item linked-project">
                        <label>Linked Project</label>
                        <span className="badge badge-project">🏠 Real Estate Project</span>
                      </div>
                    )}
                  </div>
                </div>

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

                {/* Holdings Section (for Holding Companies) */}
                {selectedEntity.companyType === 'holding' && (
                  <div className="detail-section holdings-section">
                    <div className="section-header">
                      <h4>🏢 Holdings</h4>
                      <button className="btn btn-primary btn-sm" onClick={openHoldingsModal}>
                        Manage Holdings
                      </button>
                    </div>
                    {selectedEntity.childRelationships.length > 0 ? (
                      <div className="holdings-grid">
                        {selectedEntity.childRelationships.map((rel) => (
                          <div key={rel.id} className="holding-card">
                            <div className="holding-info">
                              <span className="holding-name">{rel.childEntity?.name}</span>
                              {rel.childEntity?.linkedProjectId && (
                                <span className="holding-badge">🏠 RE Project</span>
                              )}
                            </div>
                            <div className="holding-pct">{rel.ownershipPercentage}%</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">No holdings yet. Click "Manage Holdings" to add companies this holding company owns.</p>
                    )}
                  </div>
                )}

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
                {/* Company Classification Section */}
                <div className="form-section">
                  <h4 className="form-section-title">Company Classification</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Company Type</label>
                      <div className="radio-group">
                        {(COMPANY_TYPES as readonly CompanyType[]).map((type) => (
                          <label key={type} className="radio-label">
                            <input
                              type="radio"
                              name="companyType"
                              value={type}
                              checked={formState.companyType === type}
                              onChange={(e) => setFormState({ ...formState, companyType: e.target.value as CompanyType })}
                            />
                            {COMPANY_TYPE_LABELS[type]}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Legal Structure</label>
                      <div className="radio-group">
                        {(LEGAL_STRUCTURES as readonly LegalStructure[]).map((structure) => (
                          <label key={structure} className="radio-label">
                            <input
                              type="radio"
                              name="legalStructure"
                              value={structure}
                              checked={formState.legalStructure === structure}
                              onChange={(e) => setFormState({ ...formState, legalStructure: e.target.value as LegalStructure })}
                            />
                            {LEGAL_STRUCTURE_LABELS[structure]}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  {formState.legalStructure === 'llc' && (
                    <div className="form-group">
                      <label>Tax Status (LLC)</label>
                      <div className="radio-group">
                        {(TAX_STATUSES as readonly TaxStatus[]).map((status) => (
                          <label key={status} className="radio-label">
                            <input
                              type="radio"
                              name="taxStatus"
                              value={status}
                              checked={formState.taxStatus === status}
                              onChange={(e) => setFormState({ ...formState, taxStatus: e.target.value as TaxStatus })}
                            />
                            {TAX_STATUS_LABELS[status]}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Entity Details Section */}
                <div className="form-section">
                  <h4 className="form-section-title">Entity Details</h4>
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

      {/* Holdings Modal */}
      {showHoldingsModal && selectedEntity?.companyType === 'holding' && (
        <div className="modal-overlay" onClick={() => setShowHoldingsModal(false)}>
          <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Holdings for {selectedEntity.name}</h3>
              <button className="modal-close" onClick={() => setShowHoldingsModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="muted" style={{ marginBottom: '1rem' }}>
                Select the entities this holding company owns. For entities linked to Real Estate projects, 
                ownership percentages will auto-populate from GP contributions.
              </p>
              {loadingOwnership && <p className="loading-text">Loading ownership data...</p>}
              <div className="holdings-checklist">
                {getHoldableEntities().map((entity) => {
                  const isSelected = selectedHoldings.includes(String(entity.id))
                  return (
                    <div key={entity.id} className={`holding-checkbox-row ${isSelected ? 'selected' : ''}`}>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleHoldingSelect(String(entity.id), e.target.checked)}
                        />
                        <span className="checkbox-text">
                          {entity.name}
                          {entity.linkedProjectId && <span className="linked-badge">🏠 RE</span>}
                        </span>
                      </label>
                      {isSelected && (
                        <div className="ownership-input">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={holdingOwnershipPcts[String(entity.id)] || ''}
                            onChange={(e) => setHoldingOwnershipPcts(prev => ({
                              ...prev,
                              [String(entity.id)]: e.target.value
                            }))}
                            placeholder="%"
                          />
                          <span>%</span>
                        </div>
                      )}
                    </div>
                  )
                })}
                {getHoldableEntities().length === 0 && (
                  <p className="muted">No holdable entities available. Create regular companies or wait for Real Estate projects to reach "Under Contract" stage.</p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowHoldingsModal(false)}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleSaveHoldings}
                disabled={selectedHoldings.length === 0}
              >
                Save Holdings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

