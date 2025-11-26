export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export async function fetchProjects() {
  const base = (API_BASE || '').replace(/\/$/, '')
  const res = await fetch(`${base}/api/projects`)
  if (!res.ok) throw new Error('Failed to load projects')
  return res.json()
}

export async function fetchPhiladelphiaWeather() {
  const base = (API_BASE || '').replace(/\/$/, '')
  const res = await fetch(`${base}/api/weather`)
  if (!res.ok) throw new Error('Failed to load Philadelphia weather')
  return res.json()
}
