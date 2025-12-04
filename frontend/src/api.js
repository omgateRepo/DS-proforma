import {
  apartmentRevenueInputSchema,
  retailRevenueInputSchema,
  parkingRevenueInputSchema,
  gpContributionInputSchema,
} from '@ds-proforma/types'

export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const baseUrl = (API_BASE || '').replace(/\/$/, '')
const AUTH_STORAGE_KEY = 'ds-proforma-basic-auth'
const unauthorizedListeners = new Set()
let cachedCredentials = null
let authLoaded = false

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const notifyUnauthorized = () => {
  unauthorizedListeners.forEach((handler) => {
    try {
      handler()
    } catch (err) {
      console.error('Auth handler failed', err)
    }
  })
}

function ensureAuthLoaded() {
  if (authLoaded || !isBrowser) return
  authLoaded = true
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed?.username && parsed?.password) {
      cachedCredentials = { username: parsed.username, password: parsed.password }
    }
  } catch (err) {
    console.warn('Failed to read auth credentials', err)
    cachedCredentials = null
  }
}

function getAuthHeader() {
  ensureAuthLoaded()
  if (!cachedCredentials?.username || !cachedCredentials?.password) return null
  const token = btoa(`${cachedCredentials.username}:${cachedCredentials.password}`)
  return `Basic ${token}`
}

function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const authHeader = getAuthHeader()
  if (authHeader) headers.set('Authorization', authHeader)
  return fetch(`${baseUrl}${path}`, { ...options, headers })
}

async function handleJsonResponse(res, errorMessage) {
  if (res.status === 401) {
    notifyUnauthorized()
    throw new Error('Authentication required')
  }

  if (!res.ok) {
    let details = {}
    try {
      details = await res.json()
    } catch (err) {
      // ignore
    }
    const parts = []
    if (details.error) parts.push(details.error)
    if (details.details && details.details !== details.error) parts.push(details.details)
    if (details.id) parts.push(`ID: ${details.id}`)
    throw new Error(parts.join(' - ') || errorMessage)
  }
  if (res.status === 204) return null
  return res.json()
}

export function getAuthCredentials() {
  ensureAuthLoaded()
  return cachedCredentials
}

export function setAuthCredentials(credentials) {
  cachedCredentials = credentials
  if (isBrowser) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(credentials))
  }
}

export function clearAuthCredentials() {
  cachedCredentials = null
  if (isBrowser) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }
}

export function onUnauthorized(handler) {
  unauthorizedListeners.add(handler)
  return () => {
    unauthorizedListeners.delete(handler)
  }
}

export function stageLabels() {
  return [
    { id: 'new', label: 'New' },
    { id: 'offer_submitted', label: 'Offer Submitted' },
    { id: 'under_contract', label: 'Under Contract' },
    { id: 'in_development', label: 'In Development' },
    { id: 'stabilized', label: 'Stabilized' },
  ]
}

export async function fetchProjects() {
  const res = await request('/api/projects')
  return handleJsonResponse(res, 'Failed to load projects')
}

export async function fetchProjectDetail(id) {
  const res = await request(`/api/projects/${id}`)
  return handleJsonResponse(res, 'Failed to load project detail')
}

export async function fetchCurrentUser() {
  const res = await request('/api/me')
  return handleJsonResponse(res, 'Failed to load current user')
}

export async function fetchWeather(lat, lon, label) {
  const params = new URLSearchParams()
  if (typeof lat === 'number' && Number.isFinite(lat)) params.set('lat', String(lat))
  if (typeof lon === 'number' && Number.isFinite(lon)) params.set('lon', String(lon))
  if (label) params.set('label', label)
  const query = params.toString()
  const res = await request(`/api/weather${query ? `?${query}` : ''}`)
  return handleJsonResponse(res, 'Failed to load weather')
}

export async function createProject(name) {
  if (!name) throw new Error('Project name is required')
  const res = await request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return handleJsonResponse(res, 'Failed to create project')
}

export async function deleteProject(id) {
  const res = await request(`/api/projects/${id}`, { method: 'DELETE' })
  return handleJsonResponse(res, 'Failed to delete project')
}

export async function fetchUsers() {
  const res = await request('/api/users')
  return handleJsonResponse(res, 'Failed to load users')
}

export async function createUser(payload) {
  const res = await request('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to create user')
}

export async function updateUser(userId, payload) {
  const res = await request(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update user')
}

export async function deleteUser(userId) {
  const res = await request(`/api/users/${userId}`, { method: 'DELETE' })
  return handleJsonResponse(res, 'Failed to delete user')
}

export async function updateCurrentUser(payload) {
  const res = await request('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update current user')
}

export async function updateProjectGeneral(id, payload) {
  const res = await request(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update project')
}

export async function updateProjectStage(id, stage) {
  const res = await request(`/api/projects/${id}/stage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  })
  return handleJsonResponse(res, 'Failed to update stage')
}

export async function fetchProjectCollaborators(projectId) {
  const res = await request(`/api/projects/${projectId}/collaborators`)
  return handleJsonResponse(res, 'Failed to load collaborators')
}

export async function addProjectCollaborator(projectId, email) {
  const res = await request(`/api/projects/${projectId}/collaborators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return handleJsonResponse(res, 'Failed to add collaborator')
}

export async function removeProjectCollaborator(projectId, collaboratorId) {
  const res = await request(`/api/projects/${projectId}/collaborators/${collaboratorId}`, {
    method: 'DELETE',
  })
  return handleJsonResponse(res, 'Failed to remove collaborator')
}

export async function createRevenueItem(projectId, payload) {
  const parsed = apartmentRevenueInputSchema.parse(payload)
  const res = await request(`/api/projects/${projectId}/revenue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  })
  return handleJsonResponse(res, 'Failed to add revenue item')
}

export async function updateRevenueItem(projectId, revenueId, payload) {
  const res = await request(`/api/projects/${projectId}/revenue/${revenueId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update revenue item')
}

export async function deleteRevenueItem(projectId, revenueId) {
  const res = await request(`/api/projects/${projectId}/revenue/${revenueId}`, {
    method: 'DELETE',
  })
  return handleJsonResponse(res, 'Failed to delete revenue item')
}

export async function createRetailRevenue(projectId, payload) {
  const parsed = retailRevenueInputSchema.parse(payload)
  const res = await request(`/api/projects/${projectId}/retail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  })
  return handleJsonResponse(res, 'Failed to add retail revenue item')
}

export async function updateRetailRevenue(projectId, retailId, payload) {
  const res = await request(`/api/projects/${projectId}/retail/${retailId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update retail revenue item')
}

export async function deleteRetailRevenue(projectId, retailId) {
  const res = await request(`/api/projects/${projectId}/retail/${retailId}`, {
    method: 'DELETE',
  })
  return handleJsonResponse(res, 'Failed to delete retail revenue item')
}

export async function createSoftCost(projectId, payload) {
  const res = await request(`/api/projects/${projectId}/soft-costs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to add soft cost')
}

export async function updateSoftCost(projectId, costId, payload) {
  const res = await request(`/api/projects/${projectId}/soft-costs/${costId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update soft cost')
}

export async function deleteSoftCost(projectId, costId) {
  const res = await request(`/api/projects/${projectId}/soft-costs/${costId}`, {
    method: 'DELETE',
  })
  return handleJsonResponse(res, 'Failed to delete soft cost')
}

export async function createHardCost(projectId, payload) {
  const res = await request(`/api/projects/${projectId}/hard-costs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to add hard cost')
}

export async function updateHardCost(projectId, costId, payload) {
  const res = await request(`/api/projects/${projectId}/hard-costs/${costId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update hard cost')
}

export async function deleteHardCost(projectId, costId) {
  const res = await request(`/api/projects/${projectId}/hard-costs/${costId}`, {
    method: 'DELETE',
  })
  return handleJsonResponse(res, 'Failed to delete hard cost')
}

export async function createCarryingCost(projectId, payload) {
  const res = await request(`/api/projects/${projectId}/carrying-costs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to add carrying cost')
}

export async function updateCarryingCost(projectId, costId, payload) {
  const res = await request(`/api/projects/${projectId}/carrying-costs/${costId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update carrying cost')
}

export async function deleteCarryingCost(projectId, costId) {
  const res = await request(`/api/projects/${projectId}/carrying-costs/${costId}`, {
    method: 'DELETE',
  })
  return handleJsonResponse(res, 'Failed to delete carrying cost')
}

export async function createParkingRevenue(projectId, payload) {
  const parsed = parkingRevenueInputSchema.parse(payload)
  const res = await request(`/api/projects/${projectId}/parking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  })
  return handleJsonResponse(res, 'Failed to add parking revenue')
}

export async function updateParkingRevenue(projectId, parkingId, payload) {
  const res = await request(`/api/projects/${projectId}/parking/${parkingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res, 'Failed to update parking revenue')
}

export async function deleteParkingRevenue(projectId, parkingId) {
  const res = await request(`/api/projects/${projectId}/parking/${parkingId}`, {
    method: 'DELETE',
  })
  return handleJsonResponse(res, 'Failed to delete parking revenue')
}

export async function createGpContribution(projectId, payload) {
  const parsed = gpContributionInputSchema.parse(payload)
  const res = await request(`/api/projects/${projectId}/gp-contributions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  })
  return handleJsonResponse(res, 'Failed to add GP contribution')
}

export async function updateGpContribution(projectId, contributionId, payload) {
  const parsed = gpContributionInputSchema.partial().parse(payload)
  const res = await request(`/api/projects/${projectId}/gp-contributions/${contributionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  })
  return handleJsonResponse(res, 'Failed to update GP contribution')
}

export async function deleteGpContribution(projectId, contributionId) {
  const res = await request(`/api/projects/${projectId}/gp-contributions/${contributionId}`, {
    method: 'DELETE',
  })
  return handleJsonResponse(res, 'Failed to delete GP contribution')
}

export async function searchAddresses(query) {
  if (!query.trim()) return []
  const res = await request(`/api/geocode/search?q=${encodeURIComponent(query)}`)
  return handleJsonResponse(res, 'Failed to search addresses')
}
