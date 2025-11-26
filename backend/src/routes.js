import { Router } from 'express'
import fetch from 'node-fetch'
import pool from './db.js'

const router = Router()
const SKIP_DB = process.env.SKIP_DB === 'true'
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=39.9526&longitude=-75.1652&current_weather=true&timezone=America%2FNew_York'

const STAGES = ['new', 'offer_submitted', 'in_progress', 'stabilized']
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN

const stubProject = {
  id: 'stub-1',
  name: 'Sample Multifamily Deal',
  stage: 'new',
  city: 'Philadelphia',
  state: 'PA',
  targetUnits: 42,
  purchasePriceUsd: 7500000,
  general: {
    addressLine1: '123 Market St',
    city: 'Philadelphia',
    state: 'PA',
    zip: '19106',
    propertyType: 'existing_building',
    purchasePriceUsd: 7500000,
    targetUnits: 42,
    targetSqft: 52000,
    description: 'Initial stub record',
  },
  revenue: [
    {
      id: 'rev-1',
      typeLabel: '1bd/1bth',
      unitSqft: 650,
      unitCount: 20,
      rentBudget: 2100,
      rentActual: 0,
    },
  ],
  hardCosts: [],
  softCosts: [],
  carryingCosts: [],
  cashflow: [],
}

const toNumber = (value) => (value === null || value === undefined ? null : Number(value))

const toInt = (value) => (value === null || value === undefined ? null : Number(value))

const mapProjectRow = (row) => ({
  id: row.id,
  name: row.name,
  stage: row.stage,
  city: row.city,
  state: row.state,
  targetUnits: toInt(row.target_units),
  purchasePriceUsd: toNumber(row.purchase_price_usd),
})

const mapProjectDetail = (row) => ({
  id: row.id,
  name: row.name,
  stage: row.stage,
  general: {
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    propertyType: row.property_type,
    purchasePriceUsd: toNumber(row.purchase_price_usd),
    closingDate: row.closing_date,
    targetUnits: toInt(row.target_units),
    targetSqft: toInt(row.target_sqft),
    description: row.description,
  },
})

const mapRevenueRow = (row) => ({
  id: row.id,
  typeLabel: row.type_label,
  unitSqft: row.unit_sqft,
  unitCount: row.unit_count,
  rentBudget: toNumber(row.rent_budget),
  rentActual: toNumber(row.rent_actual),
})

const mapCostRow = (row) => ({
  id: row.id,
  category: row.category,
  costName: row.cost_name,
  amountUsd: toNumber(row.amount_usd),
  paymentMonth: row.payment_month,
  startMonth: row.start_month,
  endMonth: row.end_month,
  carryingType: row.carrying_type,
  principalAmountUsd: toNumber(row.principal_amount_usd),
  interestRatePct: toNumber(row.interest_rate_pct),
  termYears: toNumber(row.term_years),
  interval: row.interval,
  startDate: row.start_date,
})

const mapCashflowRow = (row) => ({
  id: row.id,
  monthIndex: row.month_index,
  budgetInflows: toNumber(row.budget_inflows),
  budgetOutflows: toNumber(row.budget_outflows),
  actualInflows: toNumber(row.actual_inflows),
  actualOutflows: toNumber(row.actual_outflows),
  notes: row.notes,
})

const getContextValue = (feature, prefix) =>
  feature?.context?.find((entry) => entry.id?.startsWith(prefix))?.text || null

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
    return res.json([stubProject])
  }
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        stage,
        city,
        state,
        target_units,
        purchase_price_usd
      FROM projects
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `,
    )
    res.json(result.rows.map(mapProjectRow))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load projects', details: err.message })
  }
})

router.get('/projects/:id', async (req, res) => {
  if (SKIP_DB) {
    return res.json(stubProject)
  }
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        name,
        stage,
        address_line1,
        address_line2,
        city,
        state,
        zip,
        property_type,
        purchase_price_usd,
        closing_date,
        target_units,
        target_sqft,
        description
      FROM projects
      WHERE id = $1 AND deleted_at IS NULL
    `,
      [req.params.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' })

    const project = mapProjectDetail(rows[0])

    const [revenue, costs, cashflow] = await Promise.all([
      pool.query('SELECT * FROM apartment_types WHERE project_id = $1 ORDER BY created_at ASC', [req.params.id]),
      pool.query('SELECT * FROM cost_items WHERE project_id = $1 ORDER BY created_at ASC', [req.params.id]),
      pool.query('SELECT * FROM cashflow_entries WHERE project_id = $1 ORDER BY month_index ASC', [req.params.id]),
    ])

    project.revenue = revenue.rows.map(mapRevenueRow)
    const costRows = costs.rows.map(mapCostRow)
    project.hardCosts = costRows.filter((row) => row.category === 'hard')
    project.softCosts = costRows.filter((row) => row.category === 'soft')
    project.carryingCosts = costRows.filter((row) => row.category === 'carrying')
    project.cashflow = cashflow.rows.map(mapCashflowRow)

    res.json(project)
  } catch (err) {
    res.status(500).json({ error: 'Failed to load project detail', details: err.message })
  }
})

router.post('/projects', async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  if (SKIP_DB) {
    return res
      .status(201)
      .json({ id: `stub-${Date.now()}`, name, stage: 'new', city: 'Philadelphia', state: 'PA', targetUnits: 0 })
  }
  try {
    const result = await pool.query('INSERT INTO projects (name) VALUES ($1) RETURNING *', [name])
    res.status(201).json(mapProjectRow(result.rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project', details: err.message })
  }
})

router.patch('/projects/:id', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ ...stubProject, general: { ...stubProject.general, ...req.body } })
  }

const fieldMap = {
  name: 'name',
    addressLine1: 'address_line1',
    addressLine2: 'address_line2',
    city: 'city',
    state: 'state',
    zip: 'zip',
    propertyType: 'property_type',
    purchasePriceUsd: 'purchase_price_usd',
    closingDate: 'closing_date',
    targetUnits: 'target_units',
    targetSqft: 'target_sqft',
    description: 'description',
  }

  const updates = []
  const values = []
  Object.entries(fieldMap).forEach(([key, column]) => {
    if (req.body[key] !== undefined) {
      updates.push(`${column} = $${updates.length + 1}`)
      values.push(req.body[key])
    }
  })

  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' })

  try {
    const { rows } = await pool.query(
      `
      UPDATE projects
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${updates.length + 1} AND deleted_at IS NULL
      RETURNING
        id,
        name,
        stage,
        address_line1,
        address_line2,
        city,
        state,
        zip,
        property_type,
        purchase_price_usd,
        closing_date,
        target_units,
        target_sqft,
        description
    `,
      [...values, req.params.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' })
    res.json(mapProjectDetail(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update project', details: err.message })
  }
})

router.patch('/projects/:id/stage', async (req, res) => {
  const { stage } = req.body
  if (!STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' })
  if (SKIP_DB) {
    return res.json({ ...stubProject, stage })
  }
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query('SELECT stage FROM projects WHERE id = $1 FOR UPDATE', [req.params.id])
      if (rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Project not found' })
      }
      const previousStage = rows[0].stage
      if (previousStage === stage) {
        await client.query('ROLLBACK')
        return res.json({ id: req.params.id, stage })
      }
      await client.query('UPDATE projects SET stage = $1, updated_at = NOW() WHERE id = $2', [stage, req.params.id])
      await client.query(
        'INSERT INTO project_stage_history (project_id, from_stage, to_stage) VALUES ($1, $2, $3)',
        [req.params.id, previousStage, stage],
      )
      await client.query('COMMIT')
      res.json({ id: req.params.id, stage })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update stage', details: err.message })
  }
})

router.post('/projects/:id/revenue', async (req, res) => {
  const { typeLabel, unitSqft, unitCount, rentBudget } = req.body
  if (!typeLabel) return res.status(400).json({ error: 'typeLabel is required' })
  if (SKIP_DB) {
    return res.status(201).json({ id: `rev-${Date.now()}`, typeLabel, unitSqft, unitCount, rentBudget })
  }
  try {
    const { rows } = await pool.query(
      `
      INSERT INTO apartment_types (project_id, type_label, unit_sqft, unit_count, rent_budget)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
      [req.params.id, typeLabel, unitSqft || null, unitCount || 0, rentBudget || null],
    )
    res.status(201).json(mapRevenueRow(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add revenue item', details: err.message })
  }
})

router.delete('/projects/:id/revenue/:revenueId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.revenueId, deleted: true })
  }
  try {
    const result = await pool.query('DELETE FROM apartment_types WHERE id = $1 AND project_id = $2 RETURNING id', [
      req.params.revenueId,
      req.params.id,
    ])
    if (result.rowCount === 0) return res.status(404).json({ error: 'Revenue item not found' })
    res.json({ id: req.params.revenueId, deleted: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete revenue item', details: err.message })
  }
})

router.delete('/projects/:id', async (req, res) => {
  if (SKIP_DB) {
    return res.status(200).json({ id: req.params.id, deleted: true })
  }
  try {
    const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [req.params.id])
    if (result.rowCount === 0) return res.status(404).json({ error: 'Project not found' })
    res.json({ id: req.params.id, deleted: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project', details: err.message })
  }
})

router.get('/geocode/search', async (req, res) => {
  if (!MAPBOX_TOKEN) return res.status(503).json({ error: 'Geocoding is not configured' })
  const query = (req.query.q || '').trim()
  if (!query) return res.json([])
  try {
    const requestUrl = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
    )
    requestUrl.searchParams.set('access_token', MAPBOX_TOKEN)
    requestUrl.searchParams.set('autocomplete', 'true')
    requestUrl.searchParams.set('limit', '5')
    requestUrl.searchParams.set('country', 'us')
    requestUrl.searchParams.set('types', 'address,place')

    const response = await fetch(requestUrl.href, {
      headers: { 'User-Agent': 'DS-Proforma/1.0 (+https://ds-proforma)' },
    })
    if (!response.ok) throw new Error(`Geocoder responded with ${response.status}`)
    const data = await response.json()
    const suggestions = (data.features || []).map((feature) => ({
      id: feature.id,
      label: feature.place_name,
      addressLine1: feature.text,
      city: getContextValue(feature, 'place') || getContextValue(feature, 'locality'),
      state: getContextValue(feature, 'region'),
      zip: getContextValue(feature, 'postcode'),
      latitude: feature.center?.[1],
      longitude: feature.center?.[0],
    }))
    res.json(suggestions)
  } catch (err) {
    console.error('Geocode search failed', err)
    res.status(500).json({ error: 'Failed to search addresses', details: err.message })
  }
})

router.get('/geocode/satellite', async (req, res) => {
  if (!MAPBOX_TOKEN) return res.status(503).json({ error: 'Satellite imagery not configured' })
  const { lat, lon, zoom = '16' } = req.query
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required' })
  try {
    const imageUrl = new URL(
      `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lon},${lat},${zoom}/600x400`,
    )
    imageUrl.searchParams.set('access_token', MAPBOX_TOKEN)
    imageUrl.searchParams.set('attribution', 'false')
    imageUrl.searchParams.set('logo', 'false')

    const response = await fetch(imageUrl.href)
    if (!response.ok) throw new Error(`Satellite request failed ${response.status}`)
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=300')
    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('Satellite fetch failed', err)
    res.status(500).json({ error: 'Failed to load satellite image', details: err.message })
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

export default router
