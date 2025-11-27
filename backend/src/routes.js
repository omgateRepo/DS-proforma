import { Router } from 'express'
import fetch from 'node-fetch'
import pool from './db.js'

const router = Router()
const SKIP_DB = process.env.SKIP_DB === 'true'
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=39.9526&longitude=-75.1652&current_weather=true&timezone=America%2FNew_York'

const STAGES = ['new', 'offer_submitted', 'in_progress', 'stabilized']
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN
const SOFT_COST_CATEGORIES = ['architect', 'legal', 'permits', 'consulting', 'marketing', 'other']
const HARD_COST_CATEGORIES = [
  'structure',
  'framing',
  'roof',
  'windows',
  'fasade',
  'rough_plumbing',
  'rough_electric',
  'rough_havac',
  'fire_supresion',
  'insulation',
  'drywall',
  'tiles',
  'paint',
  'flooring',
  'molding_doors',
  'kitchen',
  'finished_plumbing',
  'finished_electric',
  'appliances',
  'gym',
  'study_lounge',
  'roof_top',
]
const MEASUREMENT_UNITS = ['none', 'sqft', 'linear_feet', 'apartment', 'building']
const PAYMENT_MODES = ['single', 'range', 'multi']

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
      vacancyPct: 5,
      startMonth: 0,
      rentActual: 0,
    },
  ],
  parkingRevenue: [
    {
      id: 'park-1',
      typeLabel: 'Garage Parking',
      spaceCount: 10,
      monthlyRentUsd: 200,
      vacancyPct: 5,
      startMonth: 3,
    },
  ],
  gpContributions: [
    { id: 'gp-1', partner: 'darmon', amountUsd: 250000, contributionMonth: 2 },
  ],
  hardCosts: [],
  softCosts: [],
  carryingCosts: [],
  cashflow: [],
}

const toNumber = (value) => (value === null || value === undefined ? null : Number(value))

const toInt = (value) => (value === null || value === undefined ? null : Number(value))

const parseJsonField = (value) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const coerceInt = (value) => {
  if (value === null || value === undefined || value === '') return null
  const asNumber = Number(value)
  return Number.isNaN(asNumber) ? null : Math.trunc(asNumber)
}

const coerceNumberStrict = (value) => {
  if (value === null || value === undefined || value === '') return null
  const asNumber = Number(value)
  return Number.isNaN(asNumber) ? null : asNumber
}

const coerceNumberArray = (value) => {
  if (!value) return []
  const raw = Array.isArray(value) ? value : String(value).split(',')
  return raw
    .map((entry) => entry?.toString().trim())
    .filter(Boolean)
    .map((entry) => Number(entry))
    .filter((num) => !Number.isNaN(num))
}

function normalizeScheduledCostPayload(body, { categoryField, allowedCategories }) {
  const costName = (body.costName || '').trim()
  if (!costName) return { error: 'costName is required' }

  const amountUsd = coerceNumberStrict(body.amountUsd)
  if (amountUsd === null) return { error: 'amountUsd is required' }

  const categoryValue = (body[categoryField] || '').toLowerCase()
  if (!allowedCategories.includes(categoryValue)) {
    return { error: `${categoryField} is invalid` }
  }

  const paymentMode = PAYMENT_MODES.includes(body.paymentMode) ? body.paymentMode : 'single'

  let paymentMonth = null
  let rangeStartMonth = null
  let rangeEndMonth = null
  let monthList = null
  let monthPercentages = null

  if (paymentMode === 'single') {
    paymentMonth = coerceInt(body.paymentMonth)
    if (paymentMonth === null) return { error: 'paymentMonth is required for single payment mode' }
  } else if (paymentMode === 'range') {
    rangeStartMonth = coerceInt(body.rangeStartMonth)
    rangeEndMonth = coerceInt(body.rangeEndMonth)
    if (rangeStartMonth === null || rangeEndMonth === null) {
      return { error: 'rangeStartMonth and rangeEndMonth are required for range mode' }
    }
    if (rangeEndMonth < rangeStartMonth) return { error: 'rangeEndMonth cannot be before rangeStartMonth' }
  } else if (paymentMode === 'multi') {
    const months = coerceNumberArray(body.monthList).map((value) => Math.trunc(value))
    if (months.length === 0) return { error: 'monthList must include at least one month for multi mode' }
    monthList = months

    const hasPercentages =
      (Array.isArray(body.monthPercentages) && body.monthPercentages.length > 0) ||
      (!!body.monthPercentages && !Array.isArray(body.monthPercentages))

    if (hasPercentages) {
      monthPercentages = coerceNumberArray(body.monthPercentages)
      if (monthPercentages.length !== monthList.length) {
        return { error: 'monthPercentages length must match monthList length' }
      }
      const total = monthPercentages.reduce((sum, value) => sum + value, 0)
      if (Math.abs(total - 100) > 0.25) {
        return { error: 'monthPercentages must add up to 100%' }
      }
    }
  }

  return {
    costName,
    amountUsd,
    categoryValue,
    paymentMode,
    paymentMonth,
    rangeStartMonth,
    rangeEndMonth,
    monthList,
    monthPercentages,
  }
}

function normalizeHardCostPayload(body) {
  const measurementUnit = (body.measurementUnit || 'none').toLowerCase()
  if (!MEASUREMENT_UNITS.includes(measurementUnit)) {
    return { error: 'measurementUnit is invalid' }
  }

  let pricePerUnit = null
  let unitsCount = null
  let derivedAmount = body.amountUsd

  if (measurementUnit !== 'none') {
    pricePerUnit = coerceNumberStrict(body.pricePerUnit)
    unitsCount = coerceNumberStrict(body.unitsCount)
    if (pricePerUnit === null) return { error: 'pricePerUnit is required for measured hard costs' }
    if (unitsCount === null) return { error: 'unitsCount is required for measured hard costs' }
    derivedAmount = pricePerUnit * unitsCount
  }

  const base = normalizeScheduledCostPayload(
    { ...body, amountUsd: derivedAmount },
    { categoryField: 'hardCategory', allowedCategories: HARD_COST_CATEGORIES },
  )
  if (base.error) return base

  return {
    ...base,
    measurementUnit,
    pricePerUnit,
    unitsCount,
    amountUsd: derivedAmount,
  }
}

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
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
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
  vacancyPct: toNumber(row.vacancy_pct),
  startMonth: toInt(row.start_month),
  rentActual: toNumber(row.rent_actual),
})

const mapParkingRow = (row) => ({
  id: row.id,
  typeLabel: row.type_label,
  spaceCount: row.space_count,
  monthlyRentUsd: toNumber(row.monthly_rent_usd),
  vacancyPct: toNumber(row.vacancy_pct),
  startMonth: toInt(row.start_month),
})

const mapGpContributionRow = (row) => ({
  id: row.id,
  partner: row.partner,
  amountUsd: toNumber(row.amount_usd),
  contributionMonth: toInt(row.contribution_month),
})

const mapCostRow = (row) => ({
  id: row.id,
  category: row.category,
  costName: row.cost_name,
  costGroup: row.cost_group,
  amountUsd: toNumber(row.amount_usd),
  paymentMonth: row.payment_month,
  startMonth: row.start_month,
  endMonth: row.end_month,
  paymentMode: row.payment_mode || 'single',
  monthList: parseJsonField(row.month_list) || [],
  monthPercentages: parseJsonField(row.month_percentages) || [],
  measurementUnit: row.measurement_unit || 'none',
  pricePerUnit: toNumber(row.price_per_unit),
  unitsCount: toNumber(row.units_count),
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
        latitude,
        longitude,
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

    const [revenue, parking, contributions, costs, cashflow] = await Promise.all([
      pool.query('SELECT * FROM apartment_types WHERE project_id = $1 ORDER BY created_at ASC', [req.params.id]),
      pool.query('SELECT * FROM parking_types WHERE project_id = $1 ORDER BY created_at ASC', [req.params.id]),
      pool.query('SELECT * FROM gp_contributions WHERE project_id = $1 ORDER BY created_at ASC', [req.params.id]),
      pool.query('SELECT * FROM cost_items WHERE project_id = $1 ORDER BY created_at ASC', [req.params.id]),
      pool.query('SELECT * FROM cashflow_entries WHERE project_id = $1 ORDER BY month_index ASC', [req.params.id]),
    ])

    project.revenue = revenue.rows.map(mapRevenueRow)
    project.parkingRevenue = parking.rows.map(mapParkingRow)
    project.gpContributions = contributions.rows.map(mapGpContributionRow)
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
    const result = await pool.query('INSERT INTO projects (name, stage) VALUES ($1, $2) RETURNING *', [name, 'new'])
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
  latitude: 'latitude',
  longitude: 'longitude',
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
  const { typeLabel, unitSqft, unitCount, rentBudget, vacancyPct, startMonth } = req.body
  if (!typeLabel) return res.status(400).json({ error: 'typeLabel is required' })
  const vacancy = vacancyPct !== undefined && vacancyPct !== null ? Number(vacancyPct) : 5
  const start = startMonth !== undefined && startMonth !== null ? Number(startMonth) : 0
  if (SKIP_DB) {
    return res
      .status(201)
      .json({ id: `rev-${Date.now()}`, typeLabel, unitSqft, unitCount, rentBudget, vacancyPct: vacancy, startMonth: start })
  }
  try {
    const { rows } = await pool.query(
      `
      INSERT INTO apartment_types (project_id, type_label, unit_sqft, unit_count, rent_budget, vacancy_pct, start_month)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [req.params.id, typeLabel, unitSqft || null, unitCount || 0, rentBudget || null, vacancy, start],
    )
    res.status(201).json(mapRevenueRow(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add revenue item', details: err.message })
  }
})

router.patch('/projects/:id/revenue/:revenueId', async (req, res) => {
  const { typeLabel, unitSqft, unitCount, rentBudget, vacancyPct, startMonth } = req.body
  if (SKIP_DB) {
    return res.json({
      id: req.params.revenueId,
      typeLabel: typeLabel || 'stub',
      unitSqft: unitSqft || 0,
      unitCount: unitCount || 0,
      rentBudget: rentBudget || 0,
      vacancyPct: vacancyPct ?? 5,
      startMonth: startMonth ?? 0,
    })
  }

  const fields = []
  const values = []

  const map = {
    typeLabel: 'type_label',
    unitSqft: 'unit_sqft',
    unitCount: 'unit_count',
    rentBudget: 'rent_budget',
    vacancyPct: 'vacancy_pct',
    startMonth: 'start_month',
  }

  Object.entries(map).forEach(([key, column]) => {
    if (req.body[key] !== undefined) {
      fields.push(`${column} = $${fields.length + 1}`)
      if (key === 'vacancyPct') {
        values.push(Number(req.body[key]))
      } else if (key === 'unitSqft' || key === 'unitCount') {
        values.push(req.body[key] === null ? null : Number(req.body[key]))
      } else if (key === 'rentBudget') {
        values.push(req.body[key] === null ? null : Number(req.body[key]))
      } else {
        values.push(req.body[key])
      }
    }
  })

  if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' })

  try {
    const { rows } = await pool.query(
      `
      UPDATE apartment_types
      SET ${fields.join(', ')}, created_at = created_at
      WHERE id = $${fields.length + 1} AND project_id = $${fields.length + 2}
      RETURNING *
    `,
      [...values, req.params.revenueId, req.params.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Revenue item not found' })
    res.json(mapRevenueRow(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update revenue item', details: err.message })
  }
})

router.post('/projects/:id/soft-costs', async (req, res) => {
  const normalized = normalizeScheduledCostPayload(req.body, {
    categoryField: 'softCategory',
    allowedCategories: SOFT_COST_CATEGORIES,
  })
  if (normalized.error) return res.status(400).json({ error: normalized.error })

  if (SKIP_DB) {
    return res.status(201).json({
      id: `soft-${Date.now()}`,
      category: 'soft',
      costName: normalized.costName,
      costGroup: normalized.categoryValue,
      amountUsd: normalized.amountUsd,
      paymentMonth: normalized.paymentMonth,
      startMonth: normalized.rangeStartMonth,
      endMonth: normalized.rangeEndMonth,
      paymentMode: normalized.paymentMode,
      monthList: normalized.monthList || [],
      monthPercentages: normalized.monthPercentages || [],
    })
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO cost_items (
        project_id,
        category,
        cost_name,
        cost_group,
        amount_usd,
        payment_month,
        start_month,
        end_month,
        payment_mode,
        month_list,
        month_percentages
      )
      VALUES ($1, 'soft', $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `,
      [
        req.params.id,
        normalized.costName,
        normalized.categoryValue,
        normalized.amountUsd,
        normalized.paymentMonth,
        normalized.rangeStartMonth,
        normalized.rangeEndMonth,
        normalized.paymentMode,
        normalized.monthList ? JSON.stringify(normalized.monthList) : null,
        normalized.monthPercentages ? JSON.stringify(normalized.monthPercentages) : null,
      ],
    )
    res.status(201).json(mapCostRow(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add soft cost', details: err.message })
  }
})

router.patch('/projects/:id/soft-costs/:costId', async (req, res) => {
  const normalized = normalizeScheduledCostPayload(req.body, {
    categoryField: 'softCategory',
    allowedCategories: SOFT_COST_CATEGORIES,
  })
  if (normalized.error) return res.status(400).json({ error: normalized.error })

  if (SKIP_DB) {
    return res.json({
      id: req.params.costId,
      category: 'soft',
      costName: normalized.costName,
      costGroup: normalized.categoryValue,
      amountUsd: normalized.amountUsd,
      paymentMonth: normalized.paymentMonth,
      startMonth: normalized.rangeStartMonth,
      endMonth: normalized.rangeEndMonth,
      paymentMode: normalized.paymentMode,
      monthList: normalized.monthList || [],
      monthPercentages: normalized.monthPercentages || [],
    })
  }

  try {
    const { rows } = await pool.query(
      `
      UPDATE cost_items
      SET
        cost_name = $3,
        cost_group = $4,
        amount_usd = $5,
        payment_month = $6,
        start_month = $7,
        end_month = $8,
        payment_mode = $9,
        month_list = $10,
        month_percentages = $11
      WHERE id = $2 AND project_id = $1 AND category = 'soft'
      RETURNING *
    `,
      [
        req.params.id,
        req.params.costId,
        normalized.costName,
        normalized.categoryValue,
        normalized.amountUsd,
        normalized.paymentMonth,
        normalized.rangeStartMonth,
        normalized.rangeEndMonth,
        normalized.paymentMode,
        normalized.monthList ? JSON.stringify(normalized.monthList) : null,
        normalized.monthPercentages ? JSON.stringify(normalized.monthPercentages) : null,
      ],
    )
    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Soft cost not found',
        details: `Soft cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.json(mapCostRow(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update soft cost', details: err.message })
  }
})

router.delete('/projects/:id/soft-costs/:costId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.costId, deleted: true })
  }

  try {
    const result = await pool.query(
      'DELETE FROM cost_items WHERE id = $1 AND project_id = $2 AND category = \'soft\' RETURNING id',
      [req.params.costId, req.params.id],
    )
    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Soft cost not found',
        details: `Soft cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.json({ id: req.params.costId, deleted: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete soft cost', details: err.message })
  }
})

router.post('/projects/:id/hard-costs', async (req, res) => {
  const normalized = normalizeHardCostPayload(req.body)
  if (normalized.error) return res.status(400).json({ error: normalized.error })

  if (SKIP_DB) {
    return res.status(201).json({
      id: `hard-${Date.now()}`,
      category: 'hard',
      costName: normalized.costName,
      costGroup: normalized.categoryValue,
      amountUsd: normalized.amountUsd,
      paymentMonth: normalized.paymentMonth,
      startMonth: normalized.rangeStartMonth,
      endMonth: normalized.rangeEndMonth,
      paymentMode: normalized.paymentMode,
      monthList: normalized.monthList || [],
      monthPercentages: normalized.monthPercentages || [],
      measurementUnit: normalized.measurementUnit,
      pricePerUnit: normalized.pricePerUnit,
      unitsCount: normalized.unitsCount,
    })
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO cost_items (
        project_id,
        category,
        cost_name,
        cost_group,
        amount_usd,
        payment_month,
        start_month,
        end_month,
        payment_mode,
        month_list,
        month_percentages,
        measurement_unit,
        price_per_unit,
        units_count
      )
      VALUES ($1, 'hard', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `,
      [
        req.params.id,
        normalized.costName,
        normalized.categoryValue,
        normalized.amountUsd,
        normalized.paymentMonth,
        normalized.rangeStartMonth,
        normalized.rangeEndMonth,
        normalized.paymentMode,
        normalized.monthList ? JSON.stringify(normalized.monthList) : null,
        normalized.monthPercentages ? JSON.stringify(normalized.monthPercentages) : null,
        normalized.measurementUnit,
        normalized.pricePerUnit,
        normalized.unitsCount,
      ],
    )
    res.status(201).json(mapCostRow(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add hard cost', details: err.message })
  }
})

router.patch('/projects/:id/hard-costs/:costId', async (req, res) => {
  const normalized = normalizeHardCostPayload(req.body)
  if (normalized.error) return res.status(400).json({ error: normalized.error })

  if (SKIP_DB) {
    return res.json({
      id: req.params.costId,
      category: 'hard',
      costName: normalized.costName,
      costGroup: normalized.categoryValue,
      amountUsd: normalized.amountUsd,
      paymentMonth: normalized.paymentMonth,
      startMonth: normalized.rangeStartMonth,
      endMonth: normalized.rangeEndMonth,
      paymentMode: normalized.paymentMode,
      monthList: normalized.monthList || [],
      monthPercentages: normalized.monthPercentages || [],
      measurementUnit: normalized.measurementUnit,
      pricePerUnit: normalized.pricePerUnit,
      unitsCount: normalized.unitsCount,
    })
  }

  try {
    const { rows } = await pool.query(
      `
      UPDATE cost_items
      SET
        cost_name = $3,
        cost_group = $4,
        amount_usd = $5,
        payment_month = $6,
        start_month = $7,
        end_month = $8,
        payment_mode = $9,
        month_list = $10,
        month_percentages = $11,
        measurement_unit = $12,
        price_per_unit = $13,
        units_count = $14
      WHERE id = $2 AND project_id = $1 AND category = 'hard'
      RETURNING *
    `,
      [
        req.params.id,
        req.params.costId,
        normalized.costName,
        normalized.categoryValue,
        normalized.amountUsd,
        normalized.paymentMonth,
        normalized.rangeStartMonth,
        normalized.rangeEndMonth,
        normalized.paymentMode,
        normalized.monthList ? JSON.stringify(normalized.monthList) : null,
        normalized.monthPercentages ? JSON.stringify(normalized.monthPercentages) : null,
        normalized.measurementUnit,
        normalized.pricePerUnit,
        normalized.unitsCount,
      ],
    )
    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Hard cost not found',
        details: `Hard cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.json(mapCostRow(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update hard cost', details: err.message })
  }
})

router.delete('/projects/:id/hard-costs/:costId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.costId, deleted: true })
  }

  try {
    const result = await pool.query(
      'DELETE FROM cost_items WHERE id = $1 AND project_id = $2 AND category = \'hard\' RETURNING id',
      [req.params.costId, req.params.id],
    )
    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Hard cost not found',
        details: `Hard cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.json({ id: req.params.costId, deleted: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete hard cost', details: err.message })
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

const normalizeParkingPayload = (body) => {
  const typeLabel = (body.typeLabel || '').trim()
  if (!typeLabel) return { error: 'typeLabel is required' }
  const spaceCount = coerceInt(body.spaceCount)
  if (spaceCount === null || spaceCount < 0) return { error: 'spaceCount is required' }
  const monthlyRentUsd = coerceNumberStrict(body.monthlyRentUsd)
  if (monthlyRentUsd === null) return { error: 'monthlyRentUsd is required' }
  const vacancyPct = body.vacancyPct !== undefined && body.vacancyPct !== null ? Number(body.vacancyPct) : 5
  const startMonth = coerceInt(body.startMonth) ?? 0
  return { typeLabel, spaceCount, monthlyRentUsd, vacancyPct, startMonth }
}

router.post('/projects/:id/parking', async (req, res) => {
  const normalized = normalizeParkingPayload(req.body)
  if (normalized.error) return res.status(400).json({ error: normalized.error })
  if (SKIP_DB) {
    return res.status(201).json({
      id: `park-${Date.now()}`,
      ...normalized,
    })
  }
  try {
    const { rows } = await pool.query(
      `
      INSERT INTO parking_types (project_id, type_label, space_count, monthly_rent_usd, vacancy_pct, start_month)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [req.params.id, normalized.typeLabel, normalized.spaceCount, normalized.monthlyRentUsd, normalized.vacancyPct, normalized.startMonth],
    )
    res.status(201).json(mapParkingRow(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add parking revenue', details: err.message })
  }
})

router.patch('/projects/:id/parking/:parkingId', async (req, res) => {
  const normalized = normalizeParkingPayload(req.body)
  if (normalized.error) return res.status(400).json({ error: normalized.error })
  if (SKIP_DB) {
    return res.json({ id: req.params.parkingId, ...normalized })
  }
  try {
    const { rows } = await pool.query(
      `
      UPDATE parking_types
      SET type_label = $3,
          space_count = $4,
          monthly_rent_usd = $5,
          vacancy_pct = $6,
          start_month = $7
      WHERE id = $2 AND project_id = $1
      RETURNING *
    `,
      [
        req.params.id,
        req.params.parkingId,
        normalized.typeLabel,
        normalized.spaceCount,
        normalized.monthlyRentUsd,
        normalized.vacancyPct,
        normalized.startMonth,
      ],
    )
    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Parking revenue not found',
        details: `Parking item ${req.params.parkingId} does not exist for project ${req.params.id}`,
      })
    }
    res.json(mapParkingRow(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update parking revenue', details: err.message })
  }
})

router.delete('/projects/:id/parking/:parkingId', async (req, res) => {
  if (SKIP_DB) return res.json({ id: req.params.parkingId, deleted: true })
  try {
    const result = await pool.query('DELETE FROM parking_types WHERE id = $1 AND project_id = $2 RETURNING id', [
      req.params.parkingId,
      req.params.id,
    ])
    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Parking revenue not found',
        details: `Parking item ${req.params.parkingId} does not exist for project ${req.params.id}`,
      })
    }
    res.json({ id: req.params.parkingId, deleted: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete parking revenue', details: err.message })
  }
})

const normalizeGpContributionPayload = (body) => {
  const partner = (body.partner || '').toLowerCase()
  if (!['darmon', 'sherman'].includes(partner)) return { error: 'partner is invalid' }
  const amountUsd = coerceNumberStrict(body.amountUsd)
  if (amountUsd === null) return { error: 'amountUsd is required' }
  const contributionMonth = coerceInt(body.contributionMonth)
  if (contributionMonth === null) return { error: 'contributionMonth is required' }
  return { partner, amountUsd, contributionMonth }
}

router.post('/projects/:id/gp-contributions', async (req, res) => {
  const normalized = normalizeGpContributionPayload(req.body)
  if (normalized.error) return res.status(400).json({ error: normalized.error })
  if (SKIP_DB) {
    return res.status(201).json({ id: `gpc-${Date.now()}`, ...normalized })
  }
  try {
    const { rows } = await pool.query(
      `
      INSERT INTO gp_contributions (project_id, partner, amount_usd, contribution_month)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [req.params.id, normalized.partner, normalized.amountUsd, normalized.contributionMonth],
    )
    res.status(201).json(mapGpContributionRow(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add GP contribution', details: err.message })
  }
})

router.patch('/projects/:id/gp-contributions/:contributionId', async (req, res) => {
  const normalized = normalizeGpContributionPayload(req.body)
  if (normalized.error) return res.status(400).json({ error: normalized.error })
  if (SKIP_DB) {
    return res.json({ id: req.params.contributionId, ...normalized })
  }
  try {
    const { rows } = await pool.query(
      `
      UPDATE gp_contributions
      SET partner = $3,
          amount_usd = $4,
          contribution_month = $5
      WHERE id = $2 AND project_id = $1
      RETURNING *
    `,
      [req.params.id, req.params.contributionId, normalized.partner, normalized.amountUsd, normalized.contributionMonth],
    )
    if (rows.length === 0) {
      return res.status(404).json({
        error: 'GP contribution not found',
        details: `GP contribution ${req.params.contributionId} does not exist for project ${req.params.id}`,
      })
    }
    res.json(mapGpContributionRow(rows[0]))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update GP contribution', details: err.message })
  }
})

router.delete('/projects/:id/gp-contributions/:contributionId', async (req, res) => {
  if (SKIP_DB) return res.json({ id: req.params.contributionId, deleted: true })
  try {
    const result = await pool.query(
      'DELETE FROM gp_contributions WHERE id = $1 AND project_id = $2 RETURNING id',
      [req.params.contributionId, req.params.id],
    )
    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'GP contribution not found',
        details: `GP contribution ${req.params.contributionId} does not exist for project ${req.params.id}`,
      })
    }
    res.json({ id: req.params.contributionId, deleted: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete GP contribution', details: err.message })
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
