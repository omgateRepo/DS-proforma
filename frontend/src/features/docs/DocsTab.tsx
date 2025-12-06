import { FormEvent, useCallback, useEffect, useState } from 'react'
import { formatZodErrors, documentInputSchema } from '@ds-proforma/types'
import { createDocument, updateDocument, deleteDocument } from '../../api.js'
import type { DocumentCategory, DocumentRow, EntityId, ProjectDetail } from '../../types'
import { DOCUMENT_CATEGORIES } from '../../types'

type RequestStatus = 'idle' | 'saving' | 'error'

type DocsProjectSlice = Pick<ProjectDetail, 'documents'>

type DocsTabProps = {
  project: DocsProjectSlice | null
  projectId: EntityId | null
  onProjectRefresh?: (projectId: EntityId) => Promise<void>
}

type DocumentFormState = {
  title: string
  url: string
  category: DocumentCategory | ''
  description: string
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  contracts: 'Contracts',
  permits: 'Permits',
  plans: 'Plans',
  financials: 'Financials',
  legal: 'Legal',
  other: 'Other',
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const createDefaultForm = (): DocumentFormState => ({
  title: '',
  url: '',
  category: '',
  description: '',
})

export function DocsTab({ project, projectId, onProjectRefresh }: DocsTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalStatus, setModalStatus] = useState<RequestStatus>('idle')
  const [modalError, setModalError] = useState('')
  const [form, setForm] = useState<DocumentFormState>(() => createDefaultForm())
  const [editingId, setEditingId] = useState<EntityId | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<EntityId | null>(null)
  const [deleteStatus, setDeleteStatus] = useState<RequestStatus>('idle')
  const [deleteError, setDeleteError] = useState('')

  const documents: DocumentRow[] = project?.documents ?? []

  // Group documents by category
  const groupedDocs = DOCUMENT_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = documents.filter((doc) => doc.category === cat)
    return acc
  }, {} as Record<DocumentCategory, DocumentRow[]>)

  const refreshProject = async () => {
    if (!projectId || !onProjectRefresh) return
    await onProjectRefresh(projectId)
  }

  const resetForm = useCallback(() => {
    setForm(createDefaultForm())
    setEditingId(null)
    setModalStatus('idle')
    setModalError('')
  }, [])

  useEffect(() => {
    resetForm()
    setIsModalOpen(false)
    setPendingDeleteId(null)
    setDeleteError('')
    setDeleteStatus('idle')
  }, [projectId, resetForm])

  const openModal = (doc?: DocumentRow | null) => {
    setIsModalOpen(true)
    setModalStatus('idle')
    setModalError('')
    if (doc) {
      setForm({
        title: doc.title,
        url: doc.url,
        category: doc.category as DocumentCategory,
        description: doc.description || '',
      })
      setEditingId(doc.id)
    } else {
      setForm(createDefaultForm())
      setEditingId(null)
    }
  }

  const closeModal = () => {
    if (modalStatus === 'saving') return
    setIsModalOpen(false)
    resetForm()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId) return
    setModalStatus('saving')
    setModalError('')

    try {
      const payload = {
        title: form.title.trim() || undefined,
        url: form.url.trim(),
        category: form.category as DocumentCategory,
        description: form.description.trim() || undefined,
      }

      const validation = documentInputSchema.safeParse(payload)
      if (!validation.success) {
        throw new Error(formatZodErrors(validation.error))
      }

      if (editingId) {
        await updateDocument(projectId, editingId, validation.data)
      } else {
        await createDocument(projectId, validation.data)
      }

      setModalStatus('idle')
      setIsModalOpen(false)
      resetForm()
      await refreshProject()
    } catch (err) {
      setModalStatus('error')
      setModalError(getErrorMessage(err))
    }
  }

  const handleDelete = (id: EntityId) => {
    if (!projectId) return
    setDeleteError('')
    setPendingDeleteId(id)
  }

  const confirmDelete = async () => {
    if (!projectId || !pendingDeleteId) return
    setDeleteStatus('saving')
    setDeleteError('')
    try {
      await deleteDocument(projectId, pendingDeleteId)
      setPendingDeleteId(null)
      setDeleteStatus('idle')
      await refreshProject()
    } catch (err) {
      setDeleteStatus('error')
      setDeleteError(getErrorMessage(err))
    }
  }

  const cancelDelete = () => {
    if (deleteStatus === 'saving') return
    setPendingDeleteId(null)
    setDeleteError('')
    setDeleteStatus('idle')
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  if (!project || !projectId) {
    return (
      <div className="docs-tab">
        <p className="muted">Select a project to manage documents.</p>
      </div>
    )
  }

  return (
    <>
      <div className="docs-tab">
        <div className="docs-header">
          <div>
            <h3>Documents</h3>
            <p className="muted tiny">Link external documents (Google Drive, Dropbox, etc.) to this project.</p>
          </div>
          <button type="button" className="primary" onClick={() => openModal()}>
            + Add Document
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="docs-empty">
            <p className="muted">No documents yet. Add your first document to get started.</p>
          </div>
        ) : (
          <div className="docs-sections">
            {DOCUMENT_CATEGORIES.map((category) => {
              const categoryDocs = groupedDocs[category]
              if (categoryDocs.length === 0) return null
              return (
                <section key={category} className="docs-section">
                  <h4 className="docs-category-header">{CATEGORY_LABELS[category]}</h4>
                  <div className="docs-list">
                    {categoryDocs.map((doc) => (
                      <div key={doc.id} className="doc-card">
                        <div className="doc-info">
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="doc-title"
                          >
                            {doc.title}
                            <span className="doc-external-icon">↗</span>
                          </a>
                          {doc.description && (
                            <p className="doc-description muted tiny">{doc.description}</p>
                          )}
                          <span className="doc-date muted tiny">Added {formatDate(doc.createdAt)}</span>
                        </div>
                        <div className="doc-actions">
                          <button type="button" className="icon-button" onClick={() => openModal(doc)}>
                            ✏️
                          </button>
                          <button type="button" className="icon-delete" onClick={() => handleDelete(doc.id)}>
                            🗑
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>{editingId ? 'Edit Document' : 'Add Document'}</h3>
            <form className="modal-form" onSubmit={handleSubmit}>
              <label>
                Title
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Auto-generated from URL if blank"
                />
              </label>

              <label>
                URL *
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                  placeholder="https://drive.google.com/..."
                  required
                />
                <span className="muted tiny">Must be an HTTPS link</span>
              </label>

              <label>
                Category *
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as DocumentCategory }))}
                  required
                >
                  <option value="">Select category</option>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief notes about this document (optional)"
                  rows={3}
                />
              </label>

              {modalError && <p className="error">{modalError}</p>}

              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeModal} disabled={modalStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={modalStatus === 'saving'}>
                  {modalStatus === 'saving' ? 'Saving…' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Remove Document Link?</h3>
            <p className="muted tiny">
              This only removes the link from this project. The external file will not be affected.
            </p>
            {deleteError && <p className="error">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDelete} disabled={deleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="icon-delete" onClick={confirmDelete} disabled={deleteStatus === 'saving'}>
                {deleteStatus === 'saving' ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

