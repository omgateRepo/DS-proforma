import { useState, useMemo, FormEvent } from 'react'
import type { SubscriptionPackage, PackageItem, PackageMetricType, EntityId } from '../../types'
import {
  fetchPackages,
  createPackage,
  updatePackage,
  deletePackage,
  createPackageItem,
  updatePackageItem,
  deletePackageItem,
} from '../../api'

interface UnitEconomyTabProps {
  projectId: EntityId
  packages: SubscriptionPackage[]
  onRefresh: () => Promise<void>
}

const METRIC_TYPE_LABELS: Record<PackageMetricType, string> = {
  frequency: 'Frequency',
  quantity: 'Quantity',
  na: 'N/A',
}

const formatCurrency = (value: number) => `$${value.toLocaleString()}`

export function UnitEconomyTab({ projectId, packages, onRefresh }: UnitEconomyTabProps) {
  // Package modal state
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false)
  const [editingPackage, setEditingPackage] = useState<SubscriptionPackage | null>(null)
  const [packageForm, setPackageForm] = useState({ name: '', description: '', suggestedPrice: '' })
  const [packageStatus, setPackageStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [packageError, setPackageError] = useState('')

  // Item modal state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false)
  const [activePackageId, setActivePackageId] = useState<EntityId | null>(null)
  const [editingItem, setEditingItem] = useState<PackageItem | null>(null)
  const [itemForm, setItemForm] = useState({
    name: '',
    metricType: 'frequency' as PackageMetricType,
    metricValue: '',
    cost: '',
  })
  const [itemStatus, setItemStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [itemError, setItemError] = useState('')

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'package' | 'item'; packageId: EntityId; itemId?: EntityId } | null>(null)
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting'>('idle')

  // Package handlers
  const openPackageModal = (pkg?: SubscriptionPackage) => {
    if (pkg) {
      setEditingPackage(pkg)
      setPackageForm({
        name: pkg.name,
        description: pkg.description || '',
        suggestedPrice: String(pkg.suggestedPrice),
      })
    } else {
      setEditingPackage(null)
      setPackageForm({ name: '', description: '', suggestedPrice: '' })
    }
    setPackageError('')
    setPackageStatus('idle')
    setIsPackageModalOpen(true)
  }

  const closePackageModal = () => {
    if (packageStatus === 'saving') return
    setIsPackageModalOpen(false)
    setEditingPackage(null)
  }

  const handlePackageSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!packageForm.name.trim() || !packageForm.suggestedPrice) {
      setPackageError('Name and price are required')
      return
    }
    setPackageStatus('saving')
    setPackageError('')
    try {
      const payload = {
        name: packageForm.name.trim(),
        description: packageForm.description.trim() || null,
        suggestedPrice: Number(packageForm.suggestedPrice),
      }
      if (editingPackage) {
        await updatePackage(projectId, editingPackage.id, payload)
      } else {
        await createPackage(projectId, payload)
      }
      await onRefresh()
      closePackageModal()
    } catch (err) {
      setPackageStatus('error')
      setPackageError(err instanceof Error ? err.message : 'Failed to save package')
    }
  }

  // Item handlers
  const openItemModal = (packageId: EntityId, item?: PackageItem) => {
    setActivePackageId(packageId)
    if (item) {
      setEditingItem(item)
      setItemForm({
        name: item.name,
        metricType: item.metricType,
        metricValue: item.metricValue || '',
        cost: String(item.cost),
      })
    } else {
      setEditingItem(null)
      setItemForm({ name: '', metricType: 'frequency', metricValue: '', cost: '' })
    }
    setItemError('')
    setItemStatus('idle')
    setIsItemModalOpen(true)
  }

  const closeItemModal = () => {
    if (itemStatus === 'saving') return
    setIsItemModalOpen(false)
    setActivePackageId(null)
    setEditingItem(null)
  }

  const handleItemSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!activePackageId) return
    if (!itemForm.name.trim() || !itemForm.cost) {
      setItemError('Name and cost are required')
      return
    }
    setItemStatus('saving')
    setItemError('')
    try {
      const payload = {
        name: itemForm.name.trim(),
        metricType: itemForm.metricType,
        metricValue: itemForm.metricType === 'na' ? null : itemForm.metricValue.trim() || null,
        cost: Number(itemForm.cost),
      }
      if (editingItem) {
        await updatePackageItem(projectId, activePackageId, editingItem.id, payload)
      } else {
        await createPackageItem(projectId, activePackageId, payload)
      }
      await onRefresh()
      closeItemModal()
    } catch (err) {
      setItemStatus('error')
      setItemError(err instanceof Error ? err.message : 'Failed to save item')
    }
  }

  // Delete handlers
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteStatus('deleting')
    try {
      if (deleteTarget.type === 'package') {
        await deletePackage(projectId, deleteTarget.packageId)
      } else if (deleteTarget.itemId) {
        await deletePackageItem(projectId, deleteTarget.packageId, deleteTarget.itemId)
      }
      await onRefresh()
      setDeleteTarget(null)
    } catch (err) {
      console.error('Delete failed:', err)
    }
    setDeleteStatus('idle')
  }

  return (
    <div className="unit-economy-tab">
      <div className="unit-economy-header">
        <div>
          <h3>Subscription Packages</h3>
          <p className="muted tiny">Build your offering by defining packages and their components.</p>
        </div>
        <button type="button" className="primary" onClick={() => openPackageModal()}>
          + New Package
        </button>
      </div>

      {packages.length === 0 ? (
        <div className="empty-state">
          <p>No packages defined yet.</p>
          <p className="muted tiny">Create your first subscription package to start building your unit economics.</p>
        </div>
      ) : (
        <div className="packages-list">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onEditPackage={() => openPackageModal(pkg)}
              onDeletePackage={() => setDeleteTarget({ type: 'package', packageId: pkg.id })}
              onAddItem={() => openItemModal(pkg.id)}
              onEditItem={(item) => openItemModal(pkg.id, item)}
              onDeleteItem={(itemId) => setDeleteTarget({ type: 'item', packageId: pkg.id, itemId })}
            />
          ))}
        </div>
      )}

      <div className="billing-terms">
        <h4>Billing Terms</h4>
        <ul>
          <li>Monthly billing, auto-renew</li>
          <li>Cancel anytime</li>
          <li>First month free</li>
        </ul>
      </div>

      {/* Package Modal */}
      {isPackageModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>{editingPackage ? 'Edit Package' : 'New Package'}</h3>
            <form className="modal-form" onSubmit={handlePackageSubmit}>
              <label>
                Package Name *
                <input
                  type="text"
                  value={packageForm.name}
                  onChange={(e) => setPackageForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Longevity Monthly"
                />
              </label>
              <label>
                Description
                <textarea
                  value={packageForm.description}
                  onChange={(e) => setPackageForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="What does this package offer?"
                  rows={3}
                />
              </label>
              <label>
                Suggested Price ($/month) *
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={packageForm.suggestedPrice}
                  onChange={(e) => setPackageForm((prev) => ({ ...prev, suggestedPrice: e.target.value }))}
                  placeholder="299"
                />
              </label>
              {packageError && <p className="error">{packageError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closePackageModal} disabled={packageStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={packageStatus === 'saving'}>
                  {packageStatus === 'saving' ? 'Saving...' : editingPackage ? 'Save Changes' : 'Create Package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {isItemModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>{editingItem ? 'Edit Item' : 'Add Item'}</h3>
            <form className="modal-form" onSubmit={handleItemSubmit}>
              <label>
                Item Name *
                <input
                  type="text"
                  value={itemForm.name}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Weekly Meal Delivery"
                />
              </label>
              <label>
                Metric Type
                <select
                  value={itemForm.metricType}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, metricType: e.target.value as PackageMetricType }))}
                >
                  <option value="frequency">Frequency (e.g., 1/week)</option>
                  <option value="quantity">Quantity (e.g., 5 meals)</option>
                  <option value="na">N/A (included)</option>
                </select>
              </label>
              {itemForm.metricType !== 'na' && (
                <label>
                  Metric Value
                  <input
                    type="text"
                    value={itemForm.metricValue}
                    onChange={(e) => setItemForm((prev) => ({ ...prev, metricValue: e.target.value }))}
                    placeholder={itemForm.metricType === 'frequency' ? '1/week' : '5 meals'}
                  />
                </label>
              )}
              <label>
                Cost ($/month) *
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemForm.cost}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, cost: e.target.value }))}
                  placeholder="50"
                />
              </label>
              {itemError && <p className="error">{itemError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeItemModal} disabled={itemStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={itemStatus === 'saving'}>
                  {itemStatus === 'saving' ? 'Saving...' : editingItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete {deleteTarget.type === 'package' ? 'Package' : 'Item'}?</h3>
            <p>This action cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setDeleteTarget(null)} disabled={deleteStatus === 'deleting'}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDelete} disabled={deleteStatus === 'deleting'}>
                {deleteStatus === 'deleting' ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Package Card Component
interface PackageCardProps {
  pkg: SubscriptionPackage
  onEditPackage: () => void
  onDeletePackage: () => void
  onAddItem: () => void
  onEditItem: (item: PackageItem) => void
  onDeleteItem: (itemId: EntityId) => void
}

function PackageCard({ pkg, onEditPackage, onDeletePackage, onAddItem, onEditItem, onDeleteItem }: PackageCardProps) {
  const totalCost = useMemo(() => pkg.items.reduce((sum, item) => sum + item.cost, 0), [pkg.items])
  const margin = pkg.suggestedPrice - totalCost
  const marginPercent = pkg.suggestedPrice > 0 ? (margin / pkg.suggestedPrice) * 100 : 0
  const isPositive = margin > 0

  return (
    <div className="package-card">
      <div className="package-header">
        <div className="package-title">
          <h4>{pkg.name}</h4>
          {pkg.description && <p className="muted tiny">{pkg.description}</p>}
        </div>
        <div className="package-actions">
          <button type="button" className="icon-button" onClick={onEditPackage} title="Edit package">
            ✏️
          </button>
          <button type="button" className="icon-delete" onClick={onDeletePackage} title="Delete package">
            🗑
          </button>
        </div>
      </div>

      <div className="package-items">
        <div className="items-header">
          <span className="items-label">Items</span>
          <button type="button" className="ghost tiny" onClick={onAddItem}>
            + Add Item
          </button>
        </div>
        {pkg.items.length === 0 ? (
          <p className="muted tiny">No items yet. Add items to build this package.</p>
        ) : (
          <table className="items-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Metric</th>
                <th>Cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pkg.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="metric-cell">
                    {item.metricType === 'na' ? (
                      <span className="metric-na">Included</span>
                    ) : (
                      <span>{item.metricValue || '—'}</span>
                    )}
                  </td>
                  <td>{formatCurrency(item.cost)}</td>
                  <td className="item-actions">
                    <button type="button" className="icon-button tiny" onClick={() => onEditItem(item)}>
                      ✏️
                    </button>
                    <button type="button" className="icon-delete tiny" onClick={() => onDeleteItem(item.id)}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="package-summary">
        <div className="summary-row">
          <span>Total Cost:</span>
          <span>{formatCurrency(totalCost)}/month</span>
        </div>
        <div className="summary-row">
          <span>Suggested Price:</span>
          <span>{formatCurrency(pkg.suggestedPrice)}/month</span>
        </div>
        <div className={`summary-row margin-row ${isPositive ? 'positive' : 'negative'}`}>
          <span>Margin:</span>
          <span>
            {formatCurrency(margin)}/month ({marginPercent.toFixed(1)}%) {isPositive ? '✅' : '⚠️'}
          </span>
        </div>
      </div>
    </div>
  )
}

