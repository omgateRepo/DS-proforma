import { useState, useEffect, useCallback } from 'react'
import type { AdminTaxItem, AdminEntity, TaxItemCategory, TaxItemStatus, EntityId } from '../../types'
import { TAX_ITEM_CATEGORIES, TAX_ITEM_STATUS } from '../../types'
import { fetchTaxItems, createTaxItem, updateTaxItem, deleteTaxItem, fetchAdminEntities } from '../../api'

const CATEGORY_LABELS: Record<TaxItemCategory, string> = {
  gift: 'Gifts',
  contribution: 'Contributions',
  return: 'Tax Returns',
  depreciation: 'Depreciation',
  deadline: 'Deadlines',
  other: 'Other',
}

const STATUS_LABELS: Record<TaxItemStatus, string> = {
  pending: 'Pending',
  filed: 'Filed',
  completed: 'Completed',
  overdue: 'Overdue',
}

const STATUS_COLORS: Record<TaxItemStatus, string> = {
  pending: '#f59e0b',
  filed: '#3b82f6',
  completed: '#22c55e',
  overdue: '#ef4444',
}

type TaxCenterTabProps = {
  onError: (msg: string) => void
}

export function TaxCenterTab({ onError }: TaxCenterTabProps) {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [taxItems, setTaxItems] = useState<AdminTaxItem[]>([])
  const [entities, setEntities] = useState<AdminEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<AdminTaxItem | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<TaxItemCategory | 'all'>('all')

  const [formState, setFormState] = useState({
    category: 'gift' as TaxItemCategory,
    entityId: '',
    description: '',
    amountUsd: '',
    recipientOrSource: '',
    itemDate: '',
    dueDate: '',
    status: 'pending' as TaxItemStatus,
    notes: '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [items, ents] = await Promise.all([
        fetchTaxItems(selectedYear),
        fetchAdminEntities(),
      ])
      setTaxItems(items)
      setEntities(ents)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load tax data')
    } finally {
      setLoading(false)
    }
  }, [selectedYear, onError])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        taxYear: selectedYear,
        category: formState.category,
        entityId: formState.entityId || null,
        description: formState.description,
        amountUsd: formState.amountUsd ? parseFloat(formState.amountUsd) : null,
        recipientOrSource: formState.recipientOrSource || null,
        itemDate: formState.itemDate || null,
        dueDate: formState.dueDate || null,
        status: formState.status,
        notes: formState.notes || null,
      }

      if (editingItem) {
        await updateTaxItem(String(editingItem.id), payload)
      } else {
        await createTaxItem(payload)
      }

      setShowModal(false)
      setEditingItem(null)
      resetForm()
      await loadData()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save tax item')
    }
  }

  const handleDelete = async (itemId: EntityId) => {
    if (!confirm('Are you sure you want to delete this item?')) return
    try {
      await deleteTaxItem(String(itemId))
      await loadData()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete tax item')
    }
  }

  const handleStatusChange = async (item: AdminTaxItem, newStatus: TaxItemStatus) => {
    try {
      await updateTaxItem(String(item.id), { status: newStatus })
      await loadData()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const resetForm = () => {
    setFormState({
      category: 'gift',
      entityId: '',
      description: '',
      amountUsd: '',
      recipientOrSource: '',
      itemDate: '',
      dueDate: '',
      status: 'pending',
      notes: '',
    })
  }

  const openAddModal = (category?: TaxItemCategory) => {
    setEditingItem(null)
    resetForm()
    if (category) {
      setFormState((prev) => ({ ...prev, category }))
    }
    setShowModal(true)
  }

  const openEditModal = (item: AdminTaxItem) => {
    setEditingItem(item)
    setFormState({
      category: item.category,
      entityId: item.entityId ? String(item.entityId) : '',
      description: item.description,
      amountUsd: item.amountUsd?.toString() || '',
      recipientOrSource: item.recipientOrSource || '',
      itemDate: item.itemDate || '',
      dueDate: item.dueDate || '',
      status: item.status,
      notes: item.notes || '',
    })
    setShowModal(true)
  }

  // Filter and group items
  const filteredItems = taxItems.filter(
    (item) => selectedCategory === 'all' || item.category === selectedCategory
  )

  const itemsByCategory = taxItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {} as Record<TaxItemCategory, AdminTaxItem[]>)

  // Generate year options
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i)

  // Calculate totals
  const totalsByCategory = Object.entries(itemsByCategory).reduce((acc, [cat, items]) => {
    acc[cat as TaxItemCategory] = items.reduce((sum, item) => sum + (item.amountUsd || 0), 0)
    return acc
  }, {} as Record<TaxItemCategory, number>)

  if (loading) {
    return <div className="loading-state">Loading tax data...</div>
  }

  return (
    <div className="tax-center-tab">
      {/* Header with Year Selector */}
      <div className="tax-header">
        <div className="year-selector">
          <label>Tax Year:</label>
          <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
            {yearOptions.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-accent" onClick={() => openAddModal()}>
          + Add Item
        </button>
      </div>

      {/* Category Filter Tabs */}
      <div className="category-tabs">
        <button
          className={`tab ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('all')}
        >
          All ({taxItems.length})
        </button>
        {(TAX_ITEM_CATEGORIES as readonly TaxItemCategory[]).map((cat) => (
          <button
            key={cat}
            className={`tab ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {CATEGORY_LABELS[cat]} ({itemsByCategory[cat]?.length || 0})
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="tax-summary">
        {(TAX_ITEM_CATEGORIES as readonly TaxItemCategory[])
          .filter((cat) => cat !== 'deadline')
          .map((cat) => (
            <div key={cat} className="summary-card">
              <h4>{CATEGORY_LABELS[cat]}</h4>
              <div className="summary-amount">
                ${(totalsByCategory[cat] || 0).toLocaleString()}
              </div>
              <div className="summary-count">
                {itemsByCategory[cat]?.length || 0} items
              </div>
            </div>
          ))}
      </div>

      {/* Items List */}
      <div className="tax-items-list">
        {filteredItems.length === 0 ? (
          <div className="empty-state">
            <p>No tax items for {selectedYear}.</p>
            <button className="btn btn-primary" onClick={() => openAddModal()}>
              Add your first item
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Entity</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="category-badge">{CATEGORY_LABELS[item.category]}</span>
                  </td>
                  <td>
                    <div className="item-description">{item.description}</div>
                    {item.recipientOrSource && (
                      <div className="item-meta">{item.recipientOrSource}</div>
                    )}
                  </td>
                  <td>{item.entity?.name || '—'}</td>
                  <td className="amount-cell">
                    {item.amountUsd ? `$${item.amountUsd.toLocaleString()}` : '—'}
                  </td>
                  <td>{item.itemDate || item.dueDate || '—'}</td>
                  <td>
                    <select
                      className={`status-select status-${item.status}`}
                      value={item.status}
                      onChange={(e) => handleStatusChange(item, e.target.value as TaxItemStatus)}
                      style={{ backgroundColor: STATUS_COLORS[item.status], color: '#fff' }}
                    >
                      {(TAX_ITEM_STATUS as readonly TaxItemStatus[]).map((status) => (
                        <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="actions-cell">
                    <button className="btn-icon" onClick={() => openEditModal(item)} title="Edit">
                      ✏️
                    </button>
                    <button className="btn-icon" onClick={() => handleDelete(item.id)} title="Delete">
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingItem ? 'Edit Tax Item' : 'Add Tax Item'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Category *</label>
                    <select
                      value={formState.category}
                      onChange={(e) => setFormState({ ...formState, category: e.target.value as TaxItemCategory })}
                    >
                      {(TAX_ITEM_CATEGORIES as readonly TaxItemCategory[]).map((cat) => (
                        <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Entity (optional)</label>
                    <select
                      value={formState.entityId}
                      onChange={(e) => setFormState({ ...formState, entityId: e.target.value })}
                    >
                      <option value="">— No specific entity —</option>
                      {entities.map((ent) => (
                        <option key={ent.id} value={ent.id}>{ent.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Description *</label>
                  <input
                    type="text"
                    value={formState.description}
                    onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                    required
                    placeholder="e.g., Annual gift to family trust"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Amount (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formState.amountUsd}
                      onChange={(e) => setFormState({ ...formState, amountUsd: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Recipient / Source</label>
                    <input
                      type="text"
                      value={formState.recipientOrSource}
                      onChange={(e) => setFormState({ ...formState, recipientOrSource: e.target.value })}
                      placeholder="e.g., Family Trust, IRS"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      value={formState.itemDate}
                      onChange={(e) => setFormState({ ...formState, itemDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Due Date</label>
                    <input
                      type="date"
                      value={formState.dueDate}
                      onChange={(e) => setFormState({ ...formState, dueDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formState.status}
                    onChange={(e) => setFormState({ ...formState, status: e.target.value as TaxItemStatus })}
                  >
                    {(TAX_ITEM_STATUS as readonly TaxItemStatus[]).map((status) => (
                      <option key={status} value={status}>{STATUS_LABELS[status]}</option>
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
                  {editingItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

