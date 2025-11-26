export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const baseUrl = (API_BASE || '').replace(/\/$/, '')

async function handleJsonResponse(res, errorMessage) {
  if (!res.ok) {
    let details = {}
    try {
      details = await res.json()
    } catch (err) {
      // ignore
    }
    throw new Error(details.error || errorMessage)
  }
  return res.json()
}

export function stageLabels() {
  return [
    { id: 'new', label: 'New' },
    { id: 'offer_submitted', label: 'Offer Submitted' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'stabilized', label: 'Stabilized' },
  ]
}

export async function fetchProjects() {
  const res = await fetch(`${baseUrl}/api/projects`)
  return handleJsonResponse(res, 'Failed to load projects')
}

export async function fetchProjectDetail(id) {
  const res = await fetch(`${baseUrl}/api/projects/${id}`)
  return handleJsonResponse(res, 'Failed to load project detail')
}

export async function fetchPhiladelphiaWeather() {
  const res = await fetch(`${baseUrl}/api/weather`)
  return handleJsonResponse(res, 'Failed to load Philadelphia weather')
}

export async function createProject(name) {
  if (!name) throw new Error('Project name is required')
  const res = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return handleJsonResponse(res, 'Failed to create project')
}

export async function deleteProject(id) {
  const res = await fetch(`${baseUrl}/api/projects/${id}`, { method: 'DELETE' })
  return handleJsonResponse(res, 'Failed to delete project')
}

export async function updateProjectGeneral(id, payload) {
  const res = await fetch(`${baseUrl}/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update project')
}

export async function updateProjectStage(id, stage) {
  const res = await fetch(`${baseUrl}/api/projects/${id}/stage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  })
  return handleJsonResponse(res, 'Failed to update stage')
}

export async function createRevenueItem(projectId, payload) {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/revenue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to add revenue item')
}

export async function updateRevenueItem(projectId, revenueId, payload) {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/revenue/${revenueId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update revenue item')
}

export async function deleteRevenueItem(projectId, revenueId) {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/revenue/${revenueId}`, {
    method: 'DELETE',
  })
  return handleJsonResponse(res, 'Failed to delete revenue item')
}

export async function createSoftCost(projectId, payload) {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/soft-costs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to add soft cost')
}

export async function updateSoftCost(projectId, costId, payload) {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/soft-costs/${costId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update soft cost')
}

export async function deleteSoftCost(projectId, costId) {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/soft-costs/${costId}`, {
    method: 'DELETE',
  })
  return handleJsonResponse(res, 'Failed to delete soft cost')
}

export async function searchAddresses(query) {
  if (!query.trim()) return []
  const res = await fetch(`${baseUrl}/api/geocode/search?q=${encodeURIComponent(query)}`)
  return handleJsonResponse(res, 'Failed to search addresses')
}
