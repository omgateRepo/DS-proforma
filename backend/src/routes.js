import { Router } from 'express'
import fetch from 'node-fetch'
import pool from './db.js'

const router = Router()
const SKIP_DB = process.env.SKIP_DB === 'true'
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=39.9526&longitude=-75.1652&current_weather=true&timezone=America%2FNew_York'

router.get('/health', async (_req, res) => {
  if (SKIP_DB) return res.json({ ok: true, mode: 'stub' })
  try {
    const result = await pool.query('SELECT NOW() AS now')
    res.json({ ok: true, time: result.rows[0].now })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/projects', async (_req, res) => {
  if (SKIP_DB) {
    return res.json([
      { id: 'stub-1', name: 'Hello World Project', status: 'sample' },
    ])
  }
  try {
    const result = await pool.query('SELECT id, name, status FROM projects ORDER BY updated_at DESC LIMIT 20')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to load projects', details: err.message })
  }
})

router.post('/projects', async (req, res) => {
  const { name, status } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  if (SKIP_DB) {
    return res.status(201).json({ id: `stub-${Date.now()}`, name, status: status || 'planned' })
  }
  try {
    const result = await pool.query(
      'INSERT INTO projects (name, status) VALUES ($1, $2) RETURNING *',
      [name, status || 'planned'],
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project', details: err.message })
  }
})

router.get('/weather', async (_req, res) => {
  try {
    const response = await fetch(WEATHER_URL)
    if (!response.ok) throw new Error(`Weather request failed (${response.status})`)
    const payload = await response.json()
    const current = payload?.current_weather
    if (!current) throw new Error('Weather payload missing current_weather')
    res.json({
      city: 'Philadelphia',
      temperature_c: current.temperature,
      windspeed_kmh: current.windspeed,
      sampled_at: current.time,
      source: 'open-meteo',
    })
  } catch (err) {
    console.error('Weather fetch failed', err)
    res.status(500).json({ error: 'Failed to fetch Philadelphia temperature', details: err.message })
  }
})

router.delete('/projects/:id', async (req, res) => {
  const { id } = req.params
  if (SKIP_DB) {
    return res.status(200).json({ id, deleted: true })
  }
  try {
    const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [id])
    if (result.rowCount === 0) return res.status(404).json({ error: 'Project not found' })
    res.json({ id, deleted: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project', details: err.message })
  }
})

export default router
