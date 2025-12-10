import { useState, useEffect, useCallback, useMemo } from 'react'
import type { AdminEntity, AdminEntityOwnership, EntityId } from '../../types'
import { fetchAdminEntities, fetchEntityOwnership } from '../../api'

type OwnershipChartProps = {
  onError: (msg: string) => void
  onSelectEntity?: (entityId: EntityId) => void
}

type TreeNode = {
  entity: AdminEntity
  children: { node: TreeNode; percentage: number }[]
}

export function OwnershipChart({ onError, onSelectEntity }: OwnershipChartProps) {
  const [entities, setEntities] = useState<AdminEntity[]>([])
  const [ownership, setOwnership] = useState<AdminEntityOwnership[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState<EntityId | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [ents, owns] = await Promise.all([
        fetchAdminEntities(),
        fetchEntityOwnership(),
      ])
      setEntities(ents)
      setOwnership(owns)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load ownership data')
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Build tree structure
  const { rootNodes, orphanedEntities } = useMemo(() => {
    // Find entities that are not owned by any other entity (root nodes)
    const childEntityIds = new Set(ownership.map((o) => String(o.childEntityId)))
    const roots = entities.filter((e) => !childEntityIds.has(String(e.id)))
    
    // Build lookup for children
    const childrenByParent = new Map<string, { entity: AdminEntity; percentage: number }[]>()
    ownership.forEach((o) => {
      const parentId = String(o.parentEntityId)
      const childEntity = entities.find((e) => String(e.id) === String(o.childEntityId))
      if (!childEntity) return
      
      if (!childrenByParent.has(parentId)) {
        childrenByParent.set(parentId, [])
      }
      childrenByParent.get(parentId)!.push({
        entity: childEntity,
        percentage: o.ownershipPercentage,
      })
    })

    // Recursive function to build tree
    const buildTree = (entity: AdminEntity): TreeNode => {
      const children = childrenByParent.get(String(entity.id)) || []
      return {
        entity,
        children: children.map((c) => ({
          node: buildTree(c.entity),
          percentage: c.percentage,
        })),
      }
    }

    const rootNodes = roots.map(buildTree)
    
    // Find entities not connected to any tree (no ownership relationships)
    const connectedEntityIds = new Set<string>()
    const collectConnected = (node: TreeNode) => {
      connectedEntityIds.add(String(node.entity.id))
      node.children.forEach((c) => collectConnected(c.node))
    }
    rootNodes.forEach(collectConnected)
    
    const orphanedEntities = entities.filter(
      (e) => !connectedEntityIds.has(String(e.id)) && !roots.some((r) => String(r.id) === String(e.id))
    )

    return { rootNodes, orphanedEntities }
  }, [entities, ownership])

  const handleNodeClick = (entityId: EntityId) => {
    setSelectedNodeId(entityId)
    onSelectEntity?.(entityId)
  }

  if (loading) {
    return <div className="loading-state">Loading ownership chart...</div>
  }

  if (entities.length === 0) {
    return (
      <div className="empty-state">
        <p>No entities to display. Add entities in the Entities tab first.</p>
      </div>
    )
  }

  return (
    <div className="ownership-chart">
      <div className="chart-header">
        <h3>Entity Ownership Structure</h3>
        <p className="chart-hint">Click on an entity to select it. Lines show ownership percentages.</p>
      </div>

      <div className="chart-container">
        {rootNodes.length === 0 && orphanedEntities.length === entities.length ? (
          <div className="no-hierarchy">
            <p>No ownership relationships defined yet.</p>
            <p className="muted">Add ownership relationships in the Entities tab to see the hierarchy.</p>
          </div>
        ) : (
          <div className="tree-view">
            {rootNodes.map((rootNode) => (
              <TreeNodeComponent
                key={rootNode.entity.id}
                node={rootNode}
                level={0}
                selectedId={selectedNodeId}
                onSelect={handleNodeClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Standalone entities (no ownership relationships) */}
      {orphanedEntities.length > 0 && (
        <div className="standalone-entities">
          <h4>Standalone Entities</h4>
          <p className="muted">These entities have no ownership relationships:</p>
          <div className="standalone-list">
            {orphanedEntities.map((entity) => (
              <div
                key={entity.id}
                className={`standalone-card ${selectedNodeId === entity.id ? 'selected' : ''}`}
                onClick={() => handleNodeClick(entity.id)}
              >
                {entity.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Recursive tree node component
function TreeNodeComponent({
  node,
  level,
  selectedId,
  onSelect,
  parentPercentage,
}: {
  node: TreeNode
  level: number
  selectedId: EntityId | null
  onSelect: (id: EntityId) => void
  parentPercentage?: number
}) {
  const isSelected = selectedId === node.entity.id
  const hasChildren = node.children.length > 0

  return (
    <div className="tree-node-wrapper" style={{ marginLeft: level > 0 ? '2rem' : 0 }}>
      <div className="tree-node-container">
        {level > 0 && (
          <div className="tree-connector">
            <div className="connector-line" />
            {parentPercentage !== undefined && (
              <span className="ownership-percentage">{parentPercentage}%</span>
            )}
          </div>
        )}
        <div
          className={`tree-node ${isSelected ? 'selected' : ''} ${hasChildren ? 'has-children' : ''}`}
          onClick={() => onSelect(node.entity.id)}
        >
          <div className="node-name">{node.entity.name}</div>
          <div className="node-type">{node.entity.entityType.toUpperCase()}</div>
          {node.entity.status !== 'active' && (
            <span className={`node-status status-${node.entity.status}`}>
              {node.entity.status}
            </span>
          )}
        </div>
      </div>
      
      {hasChildren && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.node.entity.id}
              node={child.node}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              parentPercentage={child.percentage}
            />
          ))}
        </div>
      )}
    </div>
  )
}

