import { Router } from 'express'
import fetch from 'node-fetch'
import prisma from './prisma.js'
import {
  projectCreateSchema,
  projectUpdateSchema,
  apartmentRevenueInputSchema,
  apartmentRevenueUpdateSchema,
  retailRevenueInputSchema,
  retailRevenueUpdateSchema,
  parkingRevenueInputSchema,
  parkingRevenueUpdateSchema,
  gpContributionInputSchema,
  gpContributionUpdateSchema,
  formatZodErrors,
} from '@ds-proforma/types'
import {
  toNumber,
  toInt,
  parseJsonField,
  coerceInt,
  coerceNumberStrict,
  coerceNumberArray,
} from './utils/dataTransforms.js'
import {
  CARRYING_TYPES,
  INTERVAL_UNITS,
  LOAN_MODES,
  encodePropertyTaxGroup,
  decodePropertyTaxPhase,
  normalizeCarryingPayload,
} from './utils/carrying.js'

const router = Router()
const SKIP_DB = process.env.SKIP_DB === 'true'
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=39.9526&longitude=-75.1652&current_weather=true&timezone=America%2FNew_York'

const STAGES = ['new', 'offer_submitted', 'under_contract', 'in_development', 'stabilized']
const STAGE_LABELS = {
  new: 'New',
  offer_submitted: 'Offer Submitted',
  under_contract: 'Under Contract',
  in_development: 'In Development',
  stabilized: 'Stabilized',
}
const STAGE_REQUIREMENTS = {
  offer_submitted: ['address_line1', 'city', 'state', 'zip', 'purchase_price_usd'],
  under_contract: ['address_line1', 'city', 'state', 'zip', 'purchase_price_usd', 'target_units', 'target_sqft', 'closing_date'],
  in_development: ['address_line1', 'city', 'state', 'zip', 'purchase_price_usd', 'target_units', 'target_sqft', 'closing_date'],
  stabilized: ['address_line1', 'city', 'state', 'zip', 'purchase_price_usd', 'target_units', 'target_sqft', 'closing_date'],
}
const STAGE_FIELD_LABELS = {
  address_line1: 'Address line 1',
  city: 'City',
  state: 'State',
  zip: 'ZIP code',
  purchase_price_usd: 'Purchase price',
  target_units: 'Target units',
  target_sqft: 'Target SqFt',
  closing_date: 'Closing date',
}
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
    startLeasingDate: null,
    stabilizedDate: null,
  },
  apartmentTurnover: {
    turnoverPct: 15,
    turnoverCostUsd: 2500,
  },
  retailTurnover: {
    turnoverPct: 10,
    turnoverCostUsd: 1500,
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
  retailRevenue: [
    {
      id: 'retail-1',
      typeLabel: 'Retail Suite A',
      unitSqft: 1200,
      unitCount: 1,
      rentBudget: 4200,
      vacancyPct: 5,
      startMonth: 3,
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

const projectFieldMap = {
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
  turnoverPct: 'turnover_pct',
  turnoverCostUsd: 'turnover_cost_usd',
  retailTurnoverPct: 'retail_turnover_pct',
  retailTurnoverCostUsd: 'retail_turnover_cost',
  startLeasingDate: 'start_leasing_date',
  stabilizedDate: 'stabilized_date',
}

const projectFieldTransforms = {
  closingDate: (value) => {
    if (value === null || value === undefined || value === '') return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return null
    }
    return date
  },
  startLeasingDate: (value) => {
    if (value === null || value === undefined || value === '') return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  },
  stabilizedDate: (value) => {
    if (value === null || value === undefined || value === '') return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  },
}

const buildProjectUpdateData = (payload) => {
  return Object.entries(projectFieldMap).reduce((acc, [key, column]) => {
    if (payload[key] !== undefined) {
      const transform = projectFieldTransforms[key]
      acc[column] = transform ? transform(payload[key]) : payload[key]
    }
    return acc
  }, {})
}

const parseBody = (schema, body, res) => {
  const result = schema.safeParse(body)
  if (!result.success) {
    res.status(400).json({ error: formatZodErrors(result.error) })
    return null
  }
  return result.data
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
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    propertyType: row.propertyType,
    purchasePriceUsd: toNumber(row.purchasePriceUsd),
    closingDate: row.closingDate,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    targetUnits: toInt(row.targetUnits),
    targetSqft: toInt(row.targetSqft),
    description: row.description,
    startLeasingDate: row.startLeasingDate,
    stabilizedDate: row.stabilizedDate,
  },
  apartmentTurnover: {
    turnoverPct: toNumber(row.turnoverPct),
    turnoverCostUsd: toNumber(row.turnoverCostUsd),
  },
  retailTurnover: {
    turnoverPct: toNumber(row.retailTurnoverPct),
    turnoverCostUsd: toNumber(row.retailTurnoverCostUsd),
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

const mapRetailRow = (row) => ({
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
  loanMode: row.loan_mode || null,
  loanAmountUsd: toNumber(row.loan_amount_usd ?? row.principal_amount_usd),
  interestRatePct: toNumber(row.interest_rate_pct),
  loanTermMonths:
    row.loan_term_months !== undefined && row.loan_term_months !== null
      ? toInt(row.loan_term_months)
      : row.term_years
      ? Number(row.term_years) * 12
      : null,
  fundingMonth: toInt(row.funding_month),
  repaymentStartMonth: toInt(row.repayment_start_month),
  intervalUnit: row.interval_unit || row.interval || null,
  propertyTaxPhase:
    row.carrying_type === 'property_tax' ? decodePropertyTaxPhase(row.cost_group) : null,
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
    const rows = await prisma.$queryRaw`SELECT NOW() AS now`
    res.json({ ok: true, time: rows?.[0]?.now ?? null })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/projects', async (_req, res) => {
  if (SKIP_DB) {
    return res.json([stubProject])
  }
  try {
    const projects = await prisma.projects.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        stage: true,
        city: true,
        state: true,
        target_units: true,
        purchase_price_usd: true,
      },
    })
    res.json(projects.map(mapProjectRow))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load projects', details: err.message })
  }
})

router.get('/projects/:id', async (req, res) => {
  if (SKIP_DB) {
    return res.json(stubProject)
  }
  try {
    const projectRow = await prisma.projects.findFirst({
      where: { id: req.params.id, deleted_at: null },
      select: {
        id: true,
        name: true,
        stage: true,
        address_line1: true,
        address_line2: true,
        city: true,
        state: true,
        zip: true,
        property_type: true,
        purchase_price_usd: true,
        closing_date: true,
        latitude: true,
        longitude: true,
        target_units: true,
        target_sqft: true,
        description: true,
        turnover_pct: true,
        turnover_cost_usd: true,
        retail_turnover_pct: true,
        retail_turnover_cost: true,
        start_leasing_date: true,
        stabilized_date: true,
      },
    })
    if (!projectRow) return res.status(404).json({ error: 'Project not found' })

    const project = mapProjectDetail({
      ...projectRow,
      addressLine1: projectRow.address_line1,
      addressLine2: projectRow.address_line2,
      propertyType: projectRow.property_type,
      purchasePriceUsd: projectRow.purchase_price_usd,
      closingDate: projectRow.closing_date,
      targetUnits: projectRow.target_units,
      targetSqft: projectRow.target_sqft,
      turnoverPct: projectRow.turnover_pct,
      turnoverCostUsd: projectRow.turnover_cost_usd,
      retailTurnoverPct: projectRow.retail_turnover_pct,
      retailTurnoverCostUsd: projectRow.retail_turnover_cost,
      startLeasingDate: projectRow.start_leasing_date,
      stabilizedDate: projectRow.stabilized_date,
    })

    const [revenue, retail, parking, contributions, costs, cashflow] = await Promise.all([
      prisma.apartment_types.findMany({
        where: { project_id: req.params.id },
        orderBy: { created_at: 'asc' },
      }),
      prisma.retail_spaces.findMany({
        where: { project_id: req.params.id },
        orderBy: { created_at: 'asc' },
      }),
      prisma.parking_types.findMany({
        where: { project_id: req.params.id },
        orderBy: { created_at: 'asc' },
      }),
      prisma.gp_contributions.findMany({
        where: { project_id: req.params.id },
        orderBy: { created_at: 'asc' },
      }),
      prisma.cost_items.findMany({
        where: { project_id: req.params.id },
        orderBy: { created_at: 'asc' },
      }),
      prisma.cashflow_entries.findMany({
        where: { project_id: req.params.id },
        orderBy: { month_index: 'asc' },
      }),
    ])

    project.revenue = revenue.map(mapRevenueRow)
    project.retailRevenue = retail.map(mapRetailRow)
    project.parkingRevenue = parking.map(mapParkingRow)
    project.gpContributions = contributions.map(mapGpContributionRow)
    const costRows = costs.map(mapCostRow)
    project.hardCosts = costRows.filter((row) => row.category === 'hard')
    project.softCosts = costRows.filter((row) => row.category === 'soft')
    project.carryingCosts = costRows.filter((row) => row.category === 'carrying')
    project.cashflow = cashflow.map(mapCashflowRow)

    res.json(project)
  } catch (err) {
    res.status(500).json({ error: 'Failed to load project detail', details: err.message })
  }
})

router.post('/projects', async (req, res) => {
  const payload = parseBody(projectCreateSchema, req.body, res)
  if (!payload) return
  const { name } = payload
  if (SKIP_DB) {
    return res
      .status(201)
      .json({ id: `stub-${Date.now()}`, name, stage: 'new', city: 'Philadelphia', state: 'PA', targetUnits: 0 })
  }
  try {
    const project = await prisma.projects.create({
      data: {
        name,
        stage: 'new',
      },
      select: {
        id: true,
        name: true,
        stage: true,
        city: true,
        state: true,
        target_units: true,
        purchase_price_usd: true,
      },
    })
    res.status(201).json(mapProjectRow(project))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project', details: err.message })
  }
})

router.patch('/projects/:id', async (req, res) => {
  if (SKIP_DB) {
    const { turnoverPct, turnoverCostUsd, retailTurnoverPct, retailTurnoverCostUsd, name, ...generalFields } = req.body
    return res.json({
      ...stubProject,
      name: name ?? stubProject.name,
      general: { ...stubProject.general, ...generalFields },
      apartmentTurnover: {
        turnoverPct:
          turnoverPct !== undefined ? turnoverPct : stubProject.apartmentTurnover.turnoverPct,
        turnoverCostUsd:
          turnoverCostUsd !== undefined ? turnoverCostUsd : stubProject.apartmentTurnover.turnoverCostUsd,
      },
      retailTurnover: {
        turnoverPct:
          retailTurnoverPct !== undefined ? retailTurnoverPct : stubProject.retailTurnover.turnoverPct,
        turnoverCostUsd:
          retailTurnoverCostUsd !== undefined
            ? retailTurnoverCostUsd
            : stubProject.retailTurnover.turnoverCostUsd,
      },
    })
  }

  const payload = parseBody(projectUpdateSchema, req.body, res)
  if (!payload) return

  const data = buildProjectUpdateData(payload)
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  try {
    const updated = await prisma.projects.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true,
        name: true,
        stage: true,
        address_line1: true,
        address_line2: true,
        city: true,
        state: true,
        zip: true,
        property_type: true,
        purchase_price_usd: true,
        closing_date: true,
        latitude: true,
        longitude: true,
        target_units: true,
        target_sqft: true,
        description: true,
        turnover_pct: true,
        turnover_cost_usd: true,
      },
    })
    res.json(
      mapProjectDetail({
        ...updated,
        addressLine1: updated.address_line1,
        addressLine2: updated.address_line2,
        propertyType: updated.property_type,
        purchasePriceUsd: updated.purchase_price_usd,
        closingDate: updated.closing_date,
        targetUnits: updated.target_units,
        targetSqft: updated.target_sqft,
        turnoverPct: updated.turnover_pct,
        turnoverCostUsd: updated.turnover_cost_usd,
      }),
    )
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Project not found' })
    }
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
    const requirementFields = STAGE_REQUIREMENTS[stage] || []
    const selectFields = { stage: true }
    requirementFields.forEach((field) => {
      selectFields[field] = true
    })
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.projects.findFirst({
        where: { id: req.params.id },
        select: selectFields,
      })
      if (!existing) {
        return { notFound: true }
      }
      if (existing.stage === stage) {
        return { stage }
      }

      if (requirementFields.length) {
        const missingFields = requirementFields.filter((field) => {
          const value = existing[field]
          if (value === null || value === undefined) return true
          if (typeof value === 'string') return value.trim().length === 0
          return false
        })
        if (missingFields.length) {
          return { missingFields }
        }
      }

      await tx.projects.update({
        where: { id: req.params.id },
        data: { stage, updated_at: new Date() },
      })

      await tx.project_stage_history.create({
        data: {
          project_id: req.params.id,
          from_stage: existing.stage,
          to_stage: stage,
        },
      })

      return { stage }
    })

    if (result.notFound) {
      return res.status(404).json({ error: 'Project not found' })
    }
    if (result.missingFields) {
      const missingLabels = result.missingFields.map((field) => STAGE_FIELD_LABELS[field] || field)
      return res.status(400).json({
        error: `Cannot move to ${STAGE_LABELS[stage]} without: ${missingLabels.join(', ')}`,
      })
    }

    return res.json({ id: req.params.id, stage: result.stage })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update stage', details: err.message })
  }
})

router.post('/projects/:id/revenue', async (req, res) => {
  const payload = parseBody(apartmentRevenueInputSchema, req.body, res)
  if (!payload) return
  const { typeLabel, unitSqft, unitCount, rentBudget, vacancyPct, startMonth } = payload
  const vacancy = vacancyPct ?? 5
  const start = startMonth ?? 0
  if (SKIP_DB) {
    return res
      .status(201)
      .json({ id: `rev-${Date.now()}`, typeLabel, unitSqft, unitCount, rentBudget, vacancyPct: vacancy, startMonth: start })
  }
  try {
    const row = await prisma.apartment_types.create({
      data: {
        project_id: req.params.id,
        type_label: typeLabel,
        unit_sqft: unitSqft || null,
        unit_count: unitCount || 0,
        rent_budget: rentBudget || null,
        vacancy_pct: vacancy,
        start_month: start,
      },
    })
    res.status(201).json(mapRevenueRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add revenue item', details: err.message })
  }
})

router.post('/projects/:id/retail', async (req, res) => {
  const payload = parseBody(retailRevenueInputSchema, req.body, res)
  if (!payload) return
  const { typeLabel, unitSqft, unitCount, rentBudget, vacancyPct, startMonth } = payload
  const vacancy = vacancyPct ?? 5
  const start = startMonth ?? 0
  if (SKIP_DB) {
    return res.status(201).json({
      id: `retail-${Date.now()}`,
      typeLabel,
      unitSqft,
      unitCount,
      rentBudget,
      vacancyPct: vacancy,
      startMonth: start,
    })
  }
  try {
    const row = await prisma.retail_spaces.create({
      data: {
        project_id: req.params.id,
        type_label: typeLabel,
        unit_sqft: unitSqft || null,
        unit_count: unitCount || 0,
        rent_budget: rentBudget || null,
        vacancy_pct: vacancy,
        start_month: start,
      },
    })
    res.status(201).json(mapRetailRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add retail revenue item', details: err.message })
  }
})

router.patch('/projects/:id/retail/:retailId', async (req, res) => {
  const payload = parseBody(retailRevenueUpdateSchema, req.body, res)
  if (!payload) return
  if (SKIP_DB) {
    return res.json({
      id: req.params.retailId,
      typeLabel: payload.typeLabel || 'retail',
      unitSqft: payload.unitSqft || 0,
      unitCount: payload.unitCount || 0,
      rentBudget: payload.rentBudget || 0,
      vacancyPct: payload.vacancyPct ?? 5,
      startMonth: payload.startMonth ?? 0,
    })
  }

  const data = {}
  if (payload.typeLabel !== undefined) data.type_label = payload.typeLabel
  if (payload.unitSqft !== undefined) data.unit_sqft = payload.unitSqft
  if (payload.unitCount !== undefined) data.unit_count = payload.unitCount
  if (payload.rentBudget !== undefined) data.rent_budget = payload.rentBudget
  if (payload.vacancyPct !== undefined) data.vacancy_pct = payload.vacancyPct
  if (payload.startMonth !== undefined) data.start_month = payload.startMonth

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No valid fields to update' })

  try {
    const row = await prisma.retail_spaces.update({
      where: { id: req.params.retailId },
      data,
    })
    if (row.project_id !== req.params.id) {
      return res.status(404).json({ error: 'Retail revenue item not found' })
    }
    res.json(mapRetailRow(row))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Retail revenue item not found' })
    }
    res.status(500).json({ error: 'Failed to update retail revenue item', details: err.message })
  }
})

router.patch('/projects/:id/revenue/:revenueId', async (req, res) => {
  const payload = parseBody(apartmentRevenueUpdateSchema, req.body, res)
  if (!payload) return
  if (SKIP_DB) {
    return res.json({
      id: req.params.revenueId,
      typeLabel: payload.typeLabel || 'stub',
      unitSqft: payload.unitSqft || 0,
      unitCount: payload.unitCount || 0,
      rentBudget: payload.rentBudget || 0,
      vacancyPct: payload.vacancyPct ?? 5,
      startMonth: payload.startMonth ?? 0,
    })
  }

  const data = {}
  if (payload.typeLabel !== undefined) data.type_label = payload.typeLabel
  if (payload.unitSqft !== undefined) data.unit_sqft = payload.unitSqft
  if (payload.unitCount !== undefined) data.unit_count = payload.unitCount
  if (payload.rentBudget !== undefined) data.rent_budget = payload.rentBudget
  if (payload.vacancyPct !== undefined) data.vacancy_pct = payload.vacancyPct
  if (payload.startMonth !== undefined) data.start_month = payload.startMonth

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No valid fields to update' })

  try {
    const row = await prisma.apartment_types.update({
      where: { id: req.params.revenueId },
      data,
    })
    if (row.project_id !== req.params.id) {
      return res.status(404).json({ error: 'Revenue item not found' })
    }
    res.json(mapRevenueRow(row))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Revenue item not found' })
    }
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
    const row = await prisma.cost_items.create({
      data: {
        project_id: req.params.id,
        category: 'soft',
        cost_name: normalized.costName,
        cost_group: normalized.categoryValue,
        amount_usd: normalized.amountUsd,
        payment_month: normalized.paymentMonth,
        start_month: normalized.rangeStartMonth,
        end_month: normalized.rangeEndMonth,
        payment_mode: normalized.paymentMode,
        month_list: normalized.monthList ?? null,
        month_percentages: normalized.monthPercentages ?? null,
      },
    })
    res.status(201).json(mapCostRow(row))
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
    const row = await prisma.cost_items.update({
      where: { id: req.params.costId },
      data: {
        cost_name: normalized.costName,
        cost_group: normalized.categoryValue,
        amount_usd: normalized.amountUsd,
        payment_month: normalized.paymentMonth,
        start_month: normalized.rangeStartMonth,
        end_month: normalized.rangeEndMonth,
        payment_mode: normalized.paymentMode,
        month_list: normalized.monthList ?? null,
        month_percentages: normalized.monthPercentages ?? null,
      },
    })
    if (row.project_id !== req.params.id || row.category !== 'soft') {
      return res.status(404).json({
        error: 'Soft cost not found',
        details: `Soft cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.json(mapCostRow(row))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Soft cost not found',
        details: `Soft cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.status(500).json({ error: 'Failed to update soft cost', details: err.message })
  }
})

router.delete('/projects/:id/soft-costs/:costId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.costId, deleted: true })
  }

  try {
    const result = await prisma.cost_items.deleteMany({
      where: { id: req.params.costId, project_id: req.params.id, category: 'soft' },
    })
    if (result.count === 0) {
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
    const row = await prisma.cost_items.create({
      data: {
        project_id: req.params.id,
        category: 'hard',
        cost_name: normalized.costName,
        cost_group: normalized.categoryValue,
        amount_usd: normalized.amountUsd,
        payment_month: normalized.paymentMonth,
        start_month: normalized.rangeStartMonth,
        end_month: normalized.rangeEndMonth,
        payment_mode: normalized.paymentMode,
        month_list: normalized.monthList ?? null,
        month_percentages: normalized.monthPercentages ?? null,
        measurement_unit: normalized.measurementUnit,
        price_per_unit: normalized.pricePerUnit,
        units_count: normalized.unitsCount,
      },
    })
    res.status(201).json(mapCostRow(row))
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
    const row = await prisma.cost_items.update({
      where: { id: req.params.costId },
      data: {
        cost_name: normalized.costName,
        cost_group: normalized.categoryValue,
        amount_usd: normalized.amountUsd,
        payment_month: normalized.paymentMonth,
        start_month: normalized.rangeStartMonth,
        end_month: normalized.rangeEndMonth,
        payment_mode: normalized.paymentMode,
        month_list: normalized.monthList ?? null,
        month_percentages: normalized.monthPercentages ?? null,
        measurement_unit: normalized.measurementUnit,
        price_per_unit: normalized.pricePerUnit,
        units_count: normalized.unitsCount,
      },
    })
    if (row.project_id !== req.params.id || row.category !== 'hard') {
      return res.status(404).json({
        error: 'Hard cost not found',
        details: `Hard cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.json(mapCostRow(row))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Hard cost not found',
        details: `Hard cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.status(500).json({ error: 'Failed to update hard cost', details: err.message })
  }
})

router.delete('/projects/:id/hard-costs/:costId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.costId, deleted: true })
  }

  try {
    const result = await prisma.cost_items.deleteMany({
      where: { id: req.params.costId, project_id: req.params.id, category: 'hard' },
    })
    if (result.count === 0) {
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

router.post('/projects/:id/carrying-costs', async (req, res) => {
  const normalized = normalizeCarryingPayload(req.body)
  if (normalized.error) return res.status(400).json({ error: normalized.error })
  const costGroup =
    normalized.carryingType === 'property_tax'
      ? encodePropertyTaxGroup(normalized.propertyTaxPhase || 'construction')
      : normalized.carryingType

  if (SKIP_DB) {
    return res.status(201).json({
      id: `carry-${Date.now()}`,
      category: 'carrying',
      costName: normalized.costName,
      costGroup,
      carryingType: normalized.carryingType,
      amountUsd: normalized.amountUsd,
      startMonth: normalized.startMonth,
      endMonth: normalized.endMonth,
      intervalUnit: normalized.intervalUnit,
      loanMode: normalized.loanMode,
      loanAmountUsd: normalized.loanAmountUsd,
      interestRatePct: normalized.interestRatePct,
      loanTermMonths: normalized.loanTermMonths,
      fundingMonth: normalized.fundingMonth,
      repaymentStartMonth: normalized.repaymentStartMonth,
      propertyTaxPhase: normalized.propertyTaxPhase || null,
    })
  }

  try {
    const row = await prisma.cost_items.create({
      data: {
        project_id: req.params.id,
        category: 'carrying',
        cost_name: normalized.costName,
        cost_group: costGroup,
        amount_usd: normalized.amountUsd,
        start_month: normalized.startMonth,
        end_month: normalized.endMonth,
        carrying_type: normalized.carryingType,
        loan_mode: normalized.loanMode,
        loan_amount_usd: normalized.loanAmountUsd,
        loan_term_months: normalized.loanTermMonths,
        interest_rate_pct: normalized.interestRatePct,
        funding_month: normalized.fundingMonth,
        repayment_start_month: normalized.repaymentStartMonth,
        interval_unit: normalized.intervalUnit,
      },
    })
    res.status(201).json(mapCostRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add carrying cost', details: err.message })
  }
})

router.patch('/projects/:id/carrying-costs/:costId', async (req, res) => {
  const normalized = normalizeCarryingPayload(req.body)
  if (normalized.error) return res.status(400).json({ error: normalized.error })
  const costGroup =
    normalized.carryingType === 'property_tax'
      ? encodePropertyTaxGroup(normalized.propertyTaxPhase || 'construction')
      : normalized.carryingType

  if (SKIP_DB) {
    return res.json({
      id: req.params.costId,
      category: 'carrying',
      costName: normalized.costName,
      costGroup,
      carryingType: normalized.carryingType,
      amountUsd: normalized.amountUsd,
      startMonth: normalized.startMonth,
      endMonth: normalized.endMonth,
      intervalUnit: normalized.intervalUnit,
      loanMode: normalized.loanMode,
      loanAmountUsd: normalized.loanAmountUsd,
      interestRatePct: normalized.interestRatePct,
      loanTermMonths: normalized.loanTermMonths,
      fundingMonth: normalized.fundingMonth,
      repaymentStartMonth: normalized.repaymentStartMonth,
      propertyTaxPhase: normalized.propertyTaxPhase || null,
    })
  }

  try {
    const row = await prisma.cost_items.update({
      where: { id: req.params.costId },
      data: {
        cost_name: normalized.costName,
        cost_group: costGroup,
        amount_usd: normalized.amountUsd,
        start_month: normalized.startMonth,
        end_month: normalized.endMonth,
        carrying_type: normalized.carryingType,
        loan_mode: normalized.loanMode,
        loan_amount_usd: normalized.loanAmountUsd,
        loan_term_months: normalized.loanTermMonths,
        interest_rate_pct: normalized.interestRatePct,
        funding_month: normalized.fundingMonth,
        repayment_start_month: normalized.repaymentStartMonth,
        interval_unit: normalized.intervalUnit,
      },
    })
    if (row.project_id !== req.params.id || row.category !== 'carrying') {
      return res.status(404).json({
        error: 'Carrying cost not found',
        details: `Carrying cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.json(mapCostRow(row))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Carrying cost not found',
        details: `Carrying cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.status(500).json({ error: 'Failed to update carrying cost', details: err.message })
  }
})

router.delete('/projects/:id/carrying-costs/:costId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.costId, deleted: true })
  }

  try {
    const result = await prisma.cost_items.deleteMany({
      where: { id: req.params.costId, project_id: req.params.id, category: 'carrying' },
    })
    if (result.count === 0) {
      return res.status(404).json({
        error: 'Carrying cost not found',
        details: `Carrying cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.json({ id: req.params.costId, deleted: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete carrying cost', details: err.message })
  }
})

router.delete('/projects/:id/revenue/:revenueId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.revenueId, deleted: true })
  }
  try {
    const result = await prisma.apartment_types.deleteMany({
      where: { id: req.params.revenueId, project_id: req.params.id },
    })
    if (result.count === 0) return res.status(404).json({ error: 'Revenue item not found' })
    res.json({ id: req.params.revenueId, deleted: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete revenue item', details: err.message })
  }
})

router.delete('/projects/:id/retail/:retailId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.retailId, deleted: true })
  }

  try {
    const deleted = await prisma.retail_spaces.delete({
      where: { id: req.params.retailId, project_id: req.params.id },
    })
    res.json({ id: deleted.id, deleted: true })
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Retail revenue item not found' })
    }
    res.status(500).json({ error: 'Failed to delete retail revenue item', details: err.message })
  }
})

router.post('/projects/:id/parking', async (req, res) => {
  const payload = parseBody(parkingRevenueInputSchema, req.body, res)
  if (!payload) return
  if (SKIP_DB) {
    return res.status(201).json({
      id: `park-${Date.now()}`,
      ...payload,
    })
  }
  try {
    const row = await prisma.parking_types.create({
      data: {
        project_id: req.params.id,
        type_label: payload.typeLabel,
        space_count: payload.spaceCount,
        monthly_rent_usd: payload.monthlyRentUsd,
        vacancy_pct: payload.vacancyPct ?? 5,
        start_month: payload.startMonth ?? 0,
      },
    })
    res.status(201).json(mapParkingRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add parking revenue', details: err.message })
  }
})

router.patch('/projects/:id/parking/:parkingId', async (req, res) => {
  const payload = parseBody(parkingRevenueUpdateSchema, req.body, res)
  if (!payload) return
  if (SKIP_DB) {
    return res.json({ id: req.params.parkingId, ...payload })
  }
  try {
    const row = await prisma.parking_types.update({
      where: { id: req.params.parkingId },
      data: {
        ...(payload.typeLabel !== undefined && { type_label: payload.typeLabel }),
        ...(payload.spaceCount !== undefined && { space_count: payload.spaceCount }),
        ...(payload.monthlyRentUsd !== undefined && { monthly_rent_usd: payload.monthlyRentUsd }),
        ...(payload.vacancyPct !== undefined && { vacancy_pct: payload.vacancyPct }),
        ...(payload.startMonth !== undefined && { start_month: payload.startMonth }),
      },
    })
    if (row.project_id !== req.params.id) {
      return res.status(404).json({
        error: 'Parking revenue not found',
        details: `Parking item ${req.params.parkingId} does not exist for project ${req.params.id}`,
      })
    }
    res.json(mapParkingRow(row))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Parking revenue not found',
        details: `Parking item ${req.params.parkingId} does not exist for project ${req.params.id}`,
      })
    }
    res.status(500).json({ error: 'Failed to update parking revenue', details: err.message })
  }
})

router.delete('/projects/:id/parking/:parkingId', async (req, res) => {
  if (SKIP_DB) return res.json({ id: req.params.parkingId, deleted: true })
  try {
    const result = await prisma.parking_types.deleteMany({
      where: { id: req.params.parkingId, project_id: req.params.id },
    })
    if (result.count === 0) {
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

router.post('/projects/:id/gp-contributions', async (req, res) => {
  const payload = parseBody(gpContributionInputSchema, req.body, res)
  if (!payload) return
  if (SKIP_DB) {
    return res.status(201).json({ id: `gpc-${Date.now()}`, ...payload })
  }
  try {
    const row = await prisma.gp_contributions.create({
      data: {
        project_id: req.params.id,
        partner: payload.partner,
        amount_usd: payload.amountUsd,
        contribution_month: payload.contributionMonth,
      },
    })
    res.status(201).json(mapGpContributionRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add GP contribution', details: err.message })
  }
})

router.patch('/projects/:id/gp-contributions/:contributionId', async (req, res) => {
  const payload = parseBody(gpContributionUpdateSchema, req.body, res)
  if (!payload) return
  if (SKIP_DB) {
    return res.json({ id: req.params.contributionId, ...payload })
  }
  try {
    const row = await prisma.gp_contributions.update({
      where: { id: req.params.contributionId },
      data: {
        ...(payload.partner !== undefined && { partner: payload.partner }),
        ...(payload.amountUsd !== undefined && { amount_usd: payload.amountUsd }),
        ...(payload.contributionMonth !== undefined && { contribution_month: payload.contributionMonth }),
      },
    })
    if (row.project_id !== req.params.id) {
      return res.status(404).json({
        error: 'GP contribution not found',
        details: `GP contribution ${req.params.contributionId} does not exist for project ${req.params.id}`,
      })
    }
    res.json(mapGpContributionRow(row))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'GP contribution not found',
        details: `GP contribution ${req.params.contributionId} does not exist for project ${req.params.id}`,
      })
    }
    res.status(500).json({ error: 'Failed to update GP contribution', details: err.message })
  }
})

router.delete('/projects/:id/gp-contributions/:contributionId', async (req, res) => {
  if (SKIP_DB) return res.json({ id: req.params.contributionId, deleted: true })
  try {
    const result = await prisma.gp_contributions.deleteMany({
      where: { id: req.params.contributionId, project_id: req.params.id },
    })
    if (result.count === 0) {
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
    await prisma.projects.delete({ where: { id: req.params.id } })
    res.json({ id: req.params.id, deleted: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Project not found' })
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
    const suggestions = (data.features || []).map((feature) => {
      const streetNumber = feature.address || feature.properties?.address || ''
      const streetName = feature.text || ''
      const addressLine1 = [streetNumber, streetName].filter(Boolean).join(' ').trim() || feature.place_name || ''
      return {
        id: feature.id,
        label: feature.place_name,
        addressLine1,
        city: getContextValue(feature, 'place') || getContextValue(feature, 'locality'),
        state: getContextValue(feature, 'region'),
        zip: getContextValue(feature, 'postcode'),
        latitude: feature.center?.[1],
        longitude: feature.center?.[0],
      }
    })
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
