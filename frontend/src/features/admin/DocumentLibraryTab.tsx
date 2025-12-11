import { useState, useEffect, useCallback } from 'react'
import type { AdminEntityDocument, AdminEntity, EntityDocumentType, EntityId } from '../../types'
import { ENTITY_DOCUMENT_TYPES } from '../../types'
import {
  fetchEntityDocuments,
  createEntityDocument,
  updateEntityDocument,
  deleteEntityDocument,
  fetchAdminEntities,
} from '../../api'

const DOC_TYPE_LABELS: Record<EntityDocumentType, string> = {
  operating_agreement: 'Operating Agreement',
  tax_return: 'Tax Return',
  certificate: 'Certificate',
  contract: 'Contract',
  other: 'Other',
}

const DOC_TYPE_ICONS: Record<EntityDocumentType, string> = {
  operating_agreement: '📜',
  tax_return: '📋',
  certificate: '🏆',
  contract: '📝',
  other: '📄',
}

type DocumentLibraryTabProps = {
  onError: (msg: string) => void
}

export function DocumentLibraryTab({ onError }: DocumentLibraryTabProps) {
  const [documents, setDocuments] = useState<AdminEntityDocument[]>([])
  const [entities, setEntities] = useState<AdminEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingDoc, setEditingDoc] = useState<AdminEntityDocument | null>(null)
  const [filterEntity, setFilterEntity] = useState<string>('all')
  const [filterType, setFilterType] = useState<EntityDocumentType | 'all'>('all')

  const [formState, setFormState] = useState({
    entityId: '',
    documentType: 'other' as EntityDocumentType,
    name: '',
    fileUrl: '',
    year: '',
    notes: '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [docs, ents] = await Promise.all([
        fetchEntityDocuments(),
        fetchAdminEntities(),
      ])
      setDocuments(docs)
      setEntities(ents)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        entityId: formState.entityId,
        documentType: formState.documentType,
        name: formState.name,
        fileUrl: formState.fileUrl,
        year: formState.year ? parseInt(formState.year) : null,
        notes: formState.notes || null,
      }

      if (editingDoc) {
        await updateEntityDocument(String(editingDoc.id), payload)
      } else {
        await createEntityDocument(payload)
      }

      setShowModal(false)
      setEditingDoc(null)
      resetForm()
      await loadData()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save document')
    }
  }

  const handleDelete = async (docId: EntityId) => {
    if (!confirm('Are you sure you want to delete this document?')) return
    try {
      await deleteEntityDocument(String(docId))
      await loadData()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete document')
    }
  }

  const resetForm = () => {
    setFormState({
      entityId: '',
      documentType: 'other',
      name: '',
      fileUrl: '',
      year: '',
      notes: '',
    })
  }

  const openAddModal = () => {
    setEditingDoc(null)
    resetForm()
    setShowModal(true)
  }

  const openEditModal = (doc: AdminEntityDocument) => {
    setEditingDoc(doc)
    setFormState({
      entityId: String(doc.entityId),
      documentType: doc.documentType,
      name: doc.name,
      fileUrl: doc.fileUrl,
      year: doc.year?.toString() || '',
      notes: doc.notes || '',
    })
    setShowModal(true)
  }

  // Filter documents
  const filteredDocs = documents.filter((doc) => {
    if (filterEntity !== 'all' && String(doc.entityId) !== filterEntity) return false
    if (filterType !== 'all' && doc.documentType !== filterType) return false
    return true
  })

  // Group by entity for display
  const docsByEntity = filteredDocs.reduce((acc, doc) => {
    const entityId = String(doc.entityId)
    if (!acc[entityId]) acc[entityId] = []
    acc[entityId].push(doc)
    return acc
  }, {} as Record<string, AdminEntityDocument[]>)

  // Get entity name by ID
  const getEntityName = (entityId: EntityId) => {
    const entity = entities.find((e) => String(e.id) === String(entityId))
    return entity?.name || 'Unknown Entity'
  }

  // Generate year options
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 20 }, (_, i) => currentYear - i)

  if (loading) {
    return <div className="loading-state">Loading documents...</div>
  }

  return (
    <div className="document-library-tab">
      {/* Header */}
      <div className="library-header">
        <div className="filters">
          <div className="filter-group">
            <label>Entity:</label>
            <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}>
              <option value="all">All Entities</option>
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>{ent.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Type:</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as EntityDocumentType | 'all')}>
              <option value="all">All Types</option>
              {(ENTITY_DOCUMENT_TYPES as readonly EntityDocumentType[]).map((type) => (
                <option key={type} value={type}>{DOC_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn btn-accent" onClick={openAddModal}>
          + Add Document
        </button>
      </div>

      {/* Document Grid */}
      <div className="documents-grid">
        {filteredDocs.length === 0 ? (
          <div className="empty-state">
            <p>No documents found.</p>
            <button className="btn btn-primary" onClick={openAddModal}>
              Add your first document
            </button>
          </div>
        ) : filterEntity !== 'all' ? (
          // Flat list when filtering by entity
          <div className="documents-flat">
            {filteredDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onEdit={() => openEditModal(doc)}
                onDelete={() => handleDelete(doc.id)}
              />
            ))}
          </div>
        ) : (
          // Grouped by entity
          Object.entries(docsByEntity).map(([entityId, docs]) => (
            <div key={entityId} className="entity-documents-group">
              <h3 className="entity-group-header">{getEntityName(entityId)}</h3>
              <div className="documents-list">
                {docs.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    onEdit={() => openEditModal(doc)}
                    onDelete={() => handleDelete(doc.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingDoc ? 'Edit Document' : 'Add Document'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Entity *</label>
                    <select
                      value={formState.entityId}
                      onChange={(e) => setFormState({ ...formState, entityId: e.target.value })}
                      required
                    >
                      <option value="">Select entity...</option>
                      {entities.map((ent) => (
                        <option key={ent.id} value={ent.id}>{ent.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Document Type *</label>
                    <select
                      value={formState.documentType}
                      onChange={(e) => setFormState({ ...formState, documentType: e.target.value as EntityDocumentType })}
                    >
                      {(ENTITY_DOCUMENT_TYPES as readonly EntityDocumentType[]).map((type) => (
                        <option key={type} value={type}>{DOC_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Document Name *</label>
                  <input
                    type="text"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    required
                    placeholder="e.g., 2024 K-1, Operating Agreement - Signed"
                  />
                </div>
                <div className="form-group">
                  <label>Document URL *</label>
                  <input
                    type="url"
                    value={formState.fileUrl}
                    onChange={(e) => setFormState({ ...formState, fileUrl: e.target.value })}
                    required
                    placeholder="https://drive.google.com/..."
                  />
                </div>
                <div className="form-group">
                  <label>Year (optional)</label>
                  <select
                    value={formState.year}
                    onChange={(e) => setFormState({ ...formState, year: e.target.value })}
                  >
                    <option value="">— No specific year —</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
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
                  {editingDoc ? 'Save Changes' : 'Add Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Document Card Component
function DocumentCard({
  doc,
  onEdit,
  onDelete,
}: {
  doc: AdminEntityDocument
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="document-card">
      <div className="doc-icon">{DOC_TYPE_ICONS[doc.documentType]}</div>
      <div className="doc-content">
        <div className="doc-name">
          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
            {doc.name}
          </a>
        </div>
        <div className="doc-meta">
          <span className="doc-type">{DOC_TYPE_LABELS[doc.documentType]}</span>
          {doc.year && <span className="doc-year">{doc.year}</span>}
        </div>
        {doc.notes && <div className="doc-notes">{doc.notes}</div>}
      </div>
      <div className="doc-actions">
        <button className="btn-icon" onClick={onEdit} title="Edit">✏️</button>
        <button className="btn-icon" onClick={onDelete} title="Delete">🗑️</button>
      </div>
    </div>
  )
}

