import { useState, useEffect, useCallback } from 'react'
import type { AdminTeamMember, AdminEngagement, AdminEntity, TeamMemberRole, EngagementStatus, EntityId } from '../../types'
import { TEAM_MEMBER_ROLES, ENGAGEMENT_STATUS } from '../../types'
import {
  fetchTeamMembers,
  fetchTeamMember,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  fetchEngagements,
  createEngagement,
  updateEngagement,
  deleteEngagement,
  fetchAdminEntities,
} from '../../api'

const ROLE_LABELS: Record<TeamMemberRole, string> = {
  attorney: 'Attorney',
  cpa: 'CPA / Accountant',
  property_manager: 'Property Manager',
  banker: 'Banker',
  insurance_agent: 'Insurance Agent',
  other: 'Other',
}

const ROLE_ICONS: Record<TeamMemberRole, string> = {
  attorney: '⚖️',
  cpa: '📊',
  property_manager: '🏢',
  banker: '🏦',
  insurance_agent: '🛡️',
  other: '👤',
}

const STATUS_LABELS: Record<EngagementStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  terminated: 'Terminated',
}

type TeamDirectoryTabProps = {
  onError: (msg: string) => void
}

type TeamMemberWithEngagements = AdminTeamMember & {
  engagements: AdminEngagement[]
}

export function TeamDirectoryTab({ onError }: TeamDirectoryTabProps) {
  const [teamMembers, setTeamMembers] = useState<AdminTeamMember[]>([])
  const [selectedMember, setSelectedMember] = useState<TeamMemberWithEngagements | null>(null)
  const [entities, setEntities] = useState<AdminEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [showEngagementModal, setShowEngagementModal] = useState(false)
  const [editingMember, setEditingMember] = useState<AdminTeamMember | null>(null)
  const [editingEngagement, setEditingEngagement] = useState<AdminEngagement | null>(null)

  const [memberForm, setMemberForm] = useState({
    name: '',
    role: 'attorney' as TeamMemberRole,
    company: '',
    email: '',
    phone: '',
    address: '',
    specialty: '',
    hourlyRate: '',
    notes: '',
  })

  const [engagementForm, setEngagementForm] = useState({
    entityId: '',
    title: '',
    startDate: '',
    endDate: '',
    scope: '',
    feeStructure: '',
    documentUrl: '',
    status: 'active' as EngagementStatus,
    notes: '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [members, ents] = await Promise.all([
        fetchTeamMembers(),
        fetchAdminEntities(),
      ])
      setTeamMembers(members)
      setEntities(ents)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load team data')
    } finally {
      setLoading(false)
    }
  }, [onError])

  const loadMemberDetail = useCallback(async (memberId: EntityId) => {
    try {
      const data = await fetchTeamMember(String(memberId))
      setSelectedMember(data)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load team member')
    }
  }, [onError])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Member CRUD
  const handleMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        name: memberForm.name,
        role: memberForm.role,
        company: memberForm.company || null,
        email: memberForm.email || null,
        phone: memberForm.phone || null,
        address: memberForm.address || null,
        specialty: memberForm.specialty || null,
        hourlyRate: memberForm.hourlyRate ? parseFloat(memberForm.hourlyRate) : null,
        notes: memberForm.notes || null,
      }

      if (editingMember) {
        await updateTeamMember(String(editingMember.id), payload)
      } else {
        await createTeamMember(payload)
      }

      setShowMemberModal(false)
      setEditingMember(null)
      resetMemberForm()
      await loadData()
      if (selectedMember && editingMember?.id === selectedMember.id) {
        await loadMemberDetail(selectedMember.id)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save team member')
    }
  }

  const handleMemberDelete = async (memberId: EntityId) => {
    if (!confirm('Are you sure you want to delete this team member?')) return
    try {
      await deleteTeamMember(String(memberId))
      if (selectedMember?.id === memberId) {
        setSelectedMember(null)
      }
      await loadData()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete team member')
    }
  }

  // Engagement CRUD
  const handleEngagementSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMember) return
    try {
      const payload = {
        teamMemberId: String(selectedMember.id),
        entityId: engagementForm.entityId || null,
        title: engagementForm.title,
        startDate: engagementForm.startDate || null,
        endDate: engagementForm.endDate || null,
        scope: engagementForm.scope || null,
        feeStructure: engagementForm.feeStructure || null,
        documentUrl: engagementForm.documentUrl || null,
        status: engagementForm.status,
        notes: engagementForm.notes || null,
      }

      if (editingEngagement) {
        await updateEngagement(String(editingEngagement.id), payload)
      } else {
        await createEngagement(payload)
      }

      setShowEngagementModal(false)
      setEditingEngagement(null)
      resetEngagementForm()
      await loadMemberDetail(selectedMember.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save engagement')
    }
  }

  const handleEngagementDelete = async (engagementId: EntityId) => {
    if (!confirm('Are you sure you want to delete this engagement?')) return
    try {
      await deleteEngagement(String(engagementId))
      if (selectedMember) {
        await loadMemberDetail(selectedMember.id)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete engagement')
    }
  }

  const resetMemberForm = () => {
    setMemberForm({
      name: '',
      role: 'attorney',
      company: '',
      email: '',
      phone: '',
      address: '',
      specialty: '',
      hourlyRate: '',
      notes: '',
    })
  }

  const resetEngagementForm = () => {
    setEngagementForm({
      entityId: '',
      title: '',
      startDate: '',
      endDate: '',
      scope: '',
      feeStructure: '',
      documentUrl: '',
      status: 'active',
      notes: '',
    })
  }

  const openAddMemberModal = () => {
    setEditingMember(null)
    resetMemberForm()
    setShowMemberModal(true)
  }

  const openEditMemberModal = (member: AdminTeamMember) => {
    setEditingMember(member)
    setMemberForm({
      name: member.name,
      role: member.role,
      company: member.company || '',
      email: member.email || '',
      phone: member.phone || '',
      address: member.address || '',
      specialty: member.specialty || '',
      hourlyRate: member.hourlyRate?.toString() || '',
      notes: member.notes || '',
    })
    setShowMemberModal(true)
  }

  const openAddEngagementModal = () => {
    setEditingEngagement(null)
    resetEngagementForm()
    setShowEngagementModal(true)
  }

  const openEditEngagementModal = (engagement: AdminEngagement) => {
    setEditingEngagement(engagement)
    setEngagementForm({
      entityId: engagement.entityId ? String(engagement.entityId) : '',
      title: engagement.title,
      startDate: engagement.startDate || '',
      endDate: engagement.endDate || '',
      scope: engagement.scope || '',
      feeStructure: engagement.feeStructure || '',
      documentUrl: engagement.documentUrl || '',
      status: engagement.status,
      notes: engagement.notes || '',
    })
    setShowEngagementModal(true)
  }

  // Group members by role
  const membersByRole = teamMembers.reduce((acc, member) => {
    if (!acc[member.role]) acc[member.role] = []
    acc[member.role].push(member)
    return acc
  }, {} as Record<TeamMemberRole, AdminTeamMember[]>)

  if (loading) {
    return <div className="loading-state">Loading team directory...</div>
  }

  return (
    <div className="team-directory-tab">
      <div className="team-layout">
        {/* Left Panel - Team List */}
        <div className="team-list-panel">
          <div className="panel-header">
            <h3>Team Directory</h3>
            <button className="btn btn-primary btn-sm" onClick={openAddMemberModal}>
              + Add Member
            </button>
          </div>

          <div className="team-cards">
            {teamMembers.length === 0 ? (
              <div className="empty-state">
                <p>No team members yet.</p>
              </div>
            ) : (
              teamMembers.map((member) => (
                <div
                  key={member.id}
                  className={`team-card ${selectedMember?.id === member.id ? 'selected' : ''}`}
                  onClick={() => loadMemberDetail(member.id)}
                >
                  <div className="team-card-icon">{ROLE_ICONS[member.role]}</div>
                  <div className="team-card-content">
                    <div className="team-card-name">{member.name}</div>
                    <div className="team-card-role">{ROLE_LABELS[member.role]}</div>
                    {member.company && <div className="team-card-company">{member.company}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Member Detail */}
        <div className="team-detail-panel">
          {selectedMember ? (
            <>
              <div className="detail-header">
                <div className="member-header-info">
                  <span className="member-icon-lg">{ROLE_ICONS[selectedMember.role]}</span>
                  <div>
                    <h2>{selectedMember.name}</h2>
                    <span className="role-badge">{ROLE_LABELS[selectedMember.role]}</span>
                  </div>
                </div>
                <div className="detail-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => openEditMemberModal(selectedMember)}>
                    Edit
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleMemberDelete(selectedMember.id)}>
                    Delete
                  </button>
                </div>
              </div>

              <div className="detail-sections">
                {/* Contact Info */}
                <div className="detail-section">
                  <h4>Contact Information</h4>
                  <div className="detail-grid">
                    {selectedMember.company && (
                      <div className="detail-item">
                        <label>Company / Firm</label>
                        <span>{selectedMember.company}</span>
                      </div>
                    )}
                    {selectedMember.email && (
                      <div className="detail-item">
                        <label>Email</label>
                        <a href={`mailto:${selectedMember.email}`}>{selectedMember.email}</a>
                      </div>
                    )}
                    {selectedMember.phone && (
                      <div className="detail-item">
                        <label>Phone</label>
                        <a href={`tel:${selectedMember.phone}`}>{selectedMember.phone}</a>
                      </div>
                    )}
                    {selectedMember.address && (
                      <div className="detail-item full-width">
                        <label>Address</label>
                        <span>{selectedMember.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Professional Info */}
                <div className="detail-section">
                  <h4>Professional Details</h4>
                  <div className="detail-grid">
                    {selectedMember.specialty && (
                      <div className="detail-item">
                        <label>Specialty</label>
                        <span>{selectedMember.specialty}</span>
                      </div>
                    )}
                    {selectedMember.hourlyRate && (
                      <div className="detail-item">
                        <label>Hourly Rate</label>
                        <span>${selectedMember.hourlyRate}/hr</span>
                      </div>
                    )}
                    {selectedMember.notes && (
                      <div className="detail-item full-width">
                        <label>Notes</label>
                        <span>{selectedMember.notes}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Engagements */}
                <div className="detail-section">
                  <div className="section-header">
                    <h4>Engagements</h4>
                    <button className="btn btn-secondary btn-sm" onClick={openAddEngagementModal}>
                      + Add Engagement
                    </button>
                  </div>

                  {selectedMember.engagements.length === 0 ? (
                    <p className="muted">No engagements recorded.</p>
                  ) : (
                    <div className="engagements-list">
                      {selectedMember.engagements.map((eng) => (
                        <div key={eng.id} className="engagement-card">
                          <div className="engagement-header">
                            <h5>{eng.title}</h5>
                            <span className={`status-badge status-${eng.status}`}>
                              {STATUS_LABELS[eng.status]}
                            </span>
                          </div>
                          {eng.entity && (
                            <div className="engagement-entity">For: {eng.entity.name}</div>
                          )}
                          <div className="engagement-dates">
                            {eng.startDate && <span>Start: {eng.startDate}</span>}
                            {eng.endDate && <span>End: {eng.endDate}</span>}
                          </div>
                          {eng.scope && <div className="engagement-scope">{eng.scope}</div>}
                          {eng.feeStructure && (
                            <div className="engagement-fee">Fee: {eng.feeStructure}</div>
                          )}
                          {eng.documentUrl && (
                            <a href={eng.documentUrl} target="_blank" rel="noopener noreferrer" className="doc-link">
                              📄 View Document
                            </a>
                          )}
                          <div className="engagement-actions">
                            <button className="btn-icon" onClick={() => openEditEngagementModal(eng)}>
                              ✏️
                            </button>
                            <button className="btn-icon" onClick={() => handleEngagementDelete(eng.id)}>
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-detail">
              <p>Select a team member to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Member Modal */}
      {showMemberModal && (
        <div className="modal-overlay" onClick={() => setShowMemberModal(false)}>
          <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingMember ? 'Edit Team Member' : 'Add Team Member'}</h3>
              <button className="modal-close" onClick={() => setShowMemberModal(false)}>×</button>
            </div>
            <form onSubmit={handleMemberSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      value={memberForm.name}
                      onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Role *</label>
                    <select
                      value={memberForm.role}
                      onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value as TeamMemberRole })}
                    >
                      {(TEAM_MEMBER_ROLES as readonly TeamMemberRole[]).map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Company / Firm</label>
                    <input
                      type="text"
                      value={memberForm.company}
                      onChange={(e) => setMemberForm({ ...memberForm, company: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Specialty</label>
                    <input
                      type="text"
                      value={memberForm.specialty}
                      onChange={(e) => setMemberForm({ ...memberForm, specialty: e.target.value })}
                      placeholder="e.g., Real Estate Law"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={memberForm.email}
                      onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={memberForm.phone}
                      onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    value={memberForm.address}
                    onChange={(e) => setMemberForm({ ...memberForm, address: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label>Hourly Rate (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={memberForm.hourlyRate}
                    onChange={(e) => setMemberForm({ ...memberForm, hourlyRate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={memberForm.notes}
                    onChange={(e) => setMemberForm({ ...memberForm, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowMemberModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingMember ? 'Save Changes' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Engagement Modal */}
      {showEngagementModal && (
        <div className="modal-overlay" onClick={() => setShowEngagementModal(false)}>
          <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEngagement ? 'Edit Engagement' : 'Add Engagement'}</h3>
              <button className="modal-close" onClick={() => setShowEngagementModal(false)}>×</button>
            </div>
            <form onSubmit={handleEngagementSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={engagementForm.title}
                    onChange={(e) => setEngagementForm({ ...engagementForm, title: e.target.value })}
                    required
                    placeholder="e.g., 2024 Tax Filing Services"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Entity (optional)</label>
                    <select
                      value={engagementForm.entityId}
                      onChange={(e) => setEngagementForm({ ...engagementForm, entityId: e.target.value })}
                    >
                      <option value="">— General / Personal —</option>
                      {entities.map((ent) => (
                        <option key={ent.id} value={ent.id}>{ent.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={engagementForm.status}
                      onChange={(e) => setEngagementForm({ ...engagementForm, status: e.target.value as EngagementStatus })}
                    >
                      {(ENGAGEMENT_STATUS as readonly EngagementStatus[]).map((status) => (
                        <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Date</label>
                    <input
                      type="date"
                      value={engagementForm.startDate}
                      onChange={(e) => setEngagementForm({ ...engagementForm, startDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>End Date</label>
                    <input
                      type="date"
                      value={engagementForm.endDate}
                      onChange={(e) => setEngagementForm({ ...engagementForm, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Scope of Work</label>
                  <textarea
                    value={engagementForm.scope}
                    onChange={(e) => setEngagementForm({ ...engagementForm, scope: e.target.value })}
                    rows={3}
                    placeholder="Describe the scope of services..."
                  />
                </div>
                <div className="form-group">
                  <label>Fee Structure</label>
                  <input
                    type="text"
                    value={engagementForm.feeStructure}
                    onChange={(e) => setEngagementForm({ ...engagementForm, feeStructure: e.target.value })}
                    placeholder="e.g., $5,000 flat fee, $350/hr"
                  />
                </div>
                <div className="form-group">
                  <label>Document URL</label>
                  <input
                    type="url"
                    value={engagementForm.documentUrl}
                    onChange={(e) => setEngagementForm({ ...engagementForm, documentUrl: e.target.value })}
                    placeholder="Link to engagement letter"
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={engagementForm.notes}
                    onChange={(e) => setEngagementForm({ ...engagementForm, notes: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEngagementModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingEngagement ? 'Save Changes' : 'Add Engagement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

