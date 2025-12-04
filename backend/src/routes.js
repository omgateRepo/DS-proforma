import { Router } from 'express'
import fetch from 'node-fetch'
import bcrypt from 'bcryptjs'
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
const HASH_ROUNDS = Number(process.env.AUTH_HASH_ROUNDS || 10)
const WEATHER_DEFAULT_LOCATION = { lat: 39.9526, lon: -75.1652, label: 'Philadelphia' }
const WEATHER_URL_BASE = 'https://api.open-meteo.com/v1/forecast'

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
const GOOGLE_STREET_VIEW_KEY = process.env.GOOGLE_STREET_VIEW_API_KEY
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
const stubUser = {
  id: 'stub-user',
  email: 'ds',
  display_name: 'Stub Admin',
  displayName: 'Stub Admin',
  isSuperAdmin: true,
  synthetic: true,
}
const stubProject = {
  id: 'stub-1',
  name: 'Sample Multifamily Deal',
  stage: 'new',
  city: 'Philadelphia',
  state: 'PA',
  targetUnits: 42,
  purchasePriceUsd: 7500000,
  ownerId: stubUser.id,
  owner: stubUser,
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
  collaborators: [],
}

const userSelectFields = {
  id: true,
  email: true,
  display_name: true,
  is_super_admin: true,
  created_at: true,
}

const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

const sanitizeUserRow = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  isSuperAdmin: Boolean(row.is_super_admin),
  createdAt: row.created_at,
})

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

const mapUserSummary = (row) =>
  row
    ? {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        isSuperAdmin: Boolean(row.is_super_admin),
        createdAt: row.created_at || null,
      }
    : null

const mapCollaboratorRow = (row) => {
  const user = row.user || null
  return {
    id: row.id,
    userId: row.user_id,
    email: user?.email || null,
    displayName: user?.display_name || null,
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
  ownerId: row.owner_id,
  owner: row.owner ? mapUserSummary(row.owner) : null,
})

const mapProjectDetail = (row) => ({
  id: row.id,
  name: row.name,
  stage: row.stage,
  ownerId: row.owner_id ?? row.ownerId ?? null,
  owner: row.owner ? mapUserSummary(row.owner) : null,
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
  collaborators: Array.isArray(row.collaborators)
    ? row.collaborators
    : row.project_collaborators
    ? row.project_collaborators.map(mapCollaboratorRow)
    : [],
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

const isPublicRoute = (req) => {
  const path = (req.path || req.originalUrl || '').toLowerCase()
  return path.startsWith('/geocode/')
}

router.use((req, res, next) => {
  if (isPublicRoute(req)) {
    return next()
  }
  if (!req.user && SKIP_DB) {
    req.user = stubUser
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  return next()
})

router.get('/me', (req, res) => {
  res.json(mapCurrentUser(req.user))
})

router.get('/users', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  const projectId =
    typeof req.query?.projectId === 'string' && req.query?.projectId ? req.query.projectId : null
  let projectContext = null
  if (projectId) {
    if (!isUuid(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' })
    }
    projectContext = await prisma.projects.findUnique({
      where: { id: projectId },
      select: { owner_id: true },
    })
    if (!projectContext) {
      return res.status(404).json({ error: 'Project not found' })
    }
    if (!canManageCollaborators(req.user, projectContext)) {
      return res.status(403).json({ error: 'Not authorized to list users for this project' })
    }
  } else if (!ensureSuperAdmin(req, res)) {
    return
  }
  if (SKIP_DB) {
    return res.json([
      sanitizeUserRow({
        ...stubUser,
        id: 'stub-user',
        created_at: new Date().toISOString(),
      }),
    ])
  }
  try {
    const users = await prisma.users.findMany({
      orderBy: { created_at: 'asc' },
      select: userSelectFields,
    })
    res.json(users.map(sanitizeUserRow))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load users', details: err.message })
  }
})

router.post('/users', async (req, res) => {
  if (!ensureSuperAdmin(req, res)) return
  if (SKIP_DB) {
    return res.status(201).json(
      sanitizeUserRow({
        ...stubUser,
        id: `stub-${Date.now()}`,
        email: req.body?.email || stubUser.email,
        display_name: req.body?.displayName || stubUser.display_name,
        is_super_admin: Boolean(req.body?.isSuperAdmin),
        created_at: new Date().toISOString(),
      }),
    )
  }
  const email = normalizeEmail(req.body?.email)
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : ''
  const isSuperAdmin = Boolean(req.body?.isSuperAdmin)
  if (!email || !displayName || !password) {
    return res.status(400).json({ error: 'email, displayName, and password are required' })
  }
  try {
    const passwordHash = await bcrypt.hash(password, HASH_ROUNDS)
    const created = await prisma.users.create({
      data: {
        email,
        display_name: displayName,
        password_hash: passwordHash,
        is_super_admin: isSuperAdmin,
      },
      select: userSelectFields,
    })
    res.status(201).json(sanitizeUserRow(created))
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Email already exists' })
    }
    res.status(500).json({ error: 'Failed to create user', details: err.message })
  }
})

router.patch('/users/me', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  if (req.user.synthetic) {
    return res.status(403).json({ error: 'Synthetic accounts cannot be edited' })
  }
  const displayName =
    typeof req.body?.displayName === 'string' && req.body.displayName.trim()
      ? req.body.displayName.trim()
      : null
  if (!displayName) {
    return res.status(400).json({ error: 'displayName is required' })
  }
  if (SKIP_DB) {
    return res.json(
      sanitizeUserRow({
        ...stubUser,
        display_name: displayName,
        displayName,
        created_at: new Date().toISOString(),
      }),
    )
  }
  try {
    const updated = await prisma.users.update({
      where: { id: req.user.id },
      data: { display_name: displayName },
      select: userSelectFields,
    })
    req.user = {
      ...req.user,
      displayName: updated.display_name,
    }
    res.json(sanitizeUserRow(updated))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' })
    }
    res.status(500).json({ error: 'Failed to update display name', details: err.message })
  }
})

router.patch('/users/:userId', async (req, res) => {
  if (!ensureSuperAdmin(req, res)) return
  if (SKIP_DB) {
    return res.json(
      sanitizeUserRow({
        ...stubUser,
        id: req.params.userId,
        email: req.body?.email || stubUser.email,
        display_name: req.body?.displayName || stubUser.display_name,
        is_super_admin: req.body?.isSuperAdmin ?? stubUser.isSuperAdmin,
        created_at: new Date().toISOString(),
      }),
    )
  }
  const data = {}
  if (typeof req.body?.displayName === 'string' && req.body.displayName.trim()) {
    data.display_name = req.body.displayName.trim()
  }
  if (typeof req.body?.isSuperAdmin === 'boolean') {
    data.is_super_admin = req.body.isSuperAdmin
  }
  if (typeof req.body?.password === 'string' && req.body.password.trim()) {
    data.password_hash = await bcrypt.hash(req.body.password.trim(), HASH_ROUNDS)
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }
  try {
    const updated = await prisma.users.update({
      where: { id: req.params.userId },
      data,
      select: userSelectFields,
    })
    res.json(sanitizeUserRow(updated))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' })
    }
    res.status(500).json({ error: 'Failed to update user', details: err.message })
  }
})

router.delete('/users/:userId', async (req, res) => {
  if (!ensureSuperAdmin(req, res)) return
  if (SKIP_DB) {
    return res.json({ id: req.params.userId, deleted: true })
  }
  if (req.user?.id === req.params.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account' })
  }
  try {
    await prisma.users.delete({ where: { id: req.params.userId } })
    res.json({ id: req.params.userId, deleted: true })
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' })
    }
    res.status(500).json({ error: 'Failed to delete user', details: err.message })
  }
})

router.patch('/users/me', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  if (req.user.synthetic) {
    return res.status(403).json({ error: 'Synthetic accounts cannot be edited' })
  }
  const displayName =
    typeof req.body?.displayName === 'string' && req.body.displayName.trim()
      ? req.body.displayName.trim()
      : null
  if (!displayName) {
    return res.status(400).json({ error: 'displayName is required' })
  }
  if (SKIP_DB) {
    return res.json(
      sanitizeUserRow({
        ...stubUser,
        display_name: displayName,
        displayName,
        created_at: new Date().toISOString(),
      }),
    )
  }
  try {
    const updated = await prisma.users.update({
      where: { id: req.user.id },
      data: { display_name: displayName },
      select: userSelectFields,
    })
    req.user = {
      ...req.user,
      displayName: updated.display_name,
    }
    res.json(sanitizeUserRow(updated))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' })
    }
    res.status(500).json({ error: 'Failed to update display name', details: err.message })
  }
})

router.use('/projects/:id', async (req, res, next) => {
  if (SKIP_DB) {
    req.project = stubProject
    return next()
  }

  const projectId = req.params.id
  if (!isUuid(projectId)) {
    return res.status(400).json({ error: 'Invalid project id' })
  }

  try {
    const project = await prisma.projects.findFirst({
      where: { id: projectId, deleted_at: null, ...projectAccessWhere(req.user) },
      select: { id: true, owner_id: true },
    })
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }
    req.project = project
    return next()
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify project access', details: err.message })
  }
})

const projectAccessWhere = (user) => {
  if (user?.isSuperAdmin) return {}
  const filters = []
  if (user?.id && !user.synthetic) {
    filters.push({ owner_id: user.id })
    filters.push({
      project_collaborators: {
        some: { user_id: user.id },
      },
    })
  } else {
    // synthetic env/stub users get super-admin access
    return {}
  }
  return filters.length ? { OR: filters } : {}
}

router.patch('/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  const data = {}
  if (typeof req.body?.displayName === 'string' && req.body.displayName.trim()) {
    data.display_name = req.body.displayName.trim()
  }
  if (!Object.keys(data).length) {
    return res.status(400).json({ error: 'displayName is required' })
  }
  if (SKIP_DB) {
    return res.json({
      id: req.user.id,
      email: req.user.email,
      displayName: req.body.displayName.trim(),
      isSuperAdmin: Boolean(req.user.isSuperAdmin),
      createdAt: new Date().toISOString(),
    })
  }
  try {
    const updated = await prisma.users.update({
      where: { id: req.user.id },
      data,
      select: userSelectFields,
    })
    res.json(sanitizeUserRow(updated))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile', details: err.message })
  }
})

const canUseUserId = (user) => Boolean(user && !user.synthetic && user.id)

const mapCurrentUser = (user) =>
  user
    ? {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isSuperAdmin: Boolean(user.isSuperAdmin),
      }
    : null

const isUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const canManageCollaborators = (user, project) => {
  if (user?.isSuperAdmin) return true
  if (!project?.owner_id) return false
  return canUseUserId(user) && project.owner_id === user.id
}

const ensureSuperAdmin = (req, res) => {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: 'Super admin access required' })
    return false
  }
  return true
}

const fetchProjectCollaborators = (projectId) =>
  prisma.project_collaborators.findMany({
    where: { project_id: projectId },
    orderBy: { created_at: 'asc' },
    include: {
      user: {
        select: userSelectFields,
      },
    },
  })

const buildWeatherUrl = (lat, lon) => {
  const url = new URL(WEATHER_URL_BASE)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('current_weather', 'true')
  url.searchParams.set('timezone', 'UTC')
  return url
}

router.get('/health', async (_req, res) => {
  if (SKIP_DB) return res.json({ ok: true, mode: 'stub' })
  try {
    const rows = await prisma.$queryRaw`SELECT NOW() AS now`
    res.json({ ok: true, time: rows?.[0]?.now ?? null })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/projects', async (req, res) => {
  if (SKIP_DB) {
    return res.json([stubProject])
  }
  try {
    const projects = await prisma.projects.findMany({
      where: { deleted_at: null, ...projectAccessWhere(req.user) },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        stage: true,
        city: true,
        state: true,
        target_units: true,
        purchase_price_usd: true,
        owner_id: true,
        owner: {
          select: {
            id: true,
            email: true,
            display_name: true,
            is_super_admin: true,
            created_at: true,
          },
        },
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
      where: { id: req.params.id, deleted_at: null, ...projectAccessWhere(req.user) },
      select: {
        id: true,
        name: true,
        stage: true,
        owner_id: true,
        owner: {
          select: {
            id: true,
            email: true,
            display_name: true,
            is_super_admin: true,
            created_at: true,
          },
        },
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
        project_collaborators: {
          include: {
            user: {
              select: userSelectFields,
            },
          },
        },
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
      owner: projectRow.owner,
      ownerId: projectRow.owner_id,
      collaborators: projectRow.project_collaborators,
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

router.get('/projects/:id/collaborators', async (req, res) => {
  if (SKIP_DB) {
    return res.json(stubProject.collaborators)
  }
  try {
    const rows = await fetchProjectCollaborators(req.params.id)
    res.json(rows.map(mapCollaboratorRow))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load collaborators', details: err.message })
  }
})

router.post('/projects', async (req, res) => {
  const payload = parseBody(projectCreateSchema, req.body, res)
  if (!payload) return
  const { name } = payload
  if (SKIP_DB) {
    return res
      .status(201)
      .json({
        id: `stub-${Date.now()}`,
        name,
        stage: 'new',
        city: 'Philadelphia',
        state: 'PA',
        targetUnits: 0,
        ownerId: stubProject.ownerId,
        owner: stubProject.owner,
        collaborators: [],
      })
  }
  try {
    let ownerId = canUseUserId(req.user) ? req.user.id : null
    if (!ownerId) {
      const fallbackOwner = await prisma.users.findFirst({
        where: { is_super_admin: true },
        select: { id: true },
      })
      ownerId = fallbackOwner?.id || null
    }
    const ownerData = ownerId ? { owner_id: ownerId } : {}
    const project = await prisma.projects.create({
      data: {
        name,
        stage: 'new',
        ...ownerData,
      },
      select: {
        id: true,
        name: true,
        stage: true,
        city: true,
        state: true,
        target_units: true,
        purchase_price_usd: true,
        owner_id: true,
        owner: {
          select: {
            id: true,
            email: true,
            display_name: true,
            is_super_admin: true,
            created_at: true,
          },
        },
      },
    })
    res.status(201).json(mapProjectRow(project))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project', details: err.message })
  }
})

router.post('/projects/:id/collaborators', async (req, res) => {
  if (SKIP_DB) {
    return res.status(201).json(stubProject.collaborators)
  }
  const project = req.project
  if (!canManageCollaborators(req.user, project)) {
    return res.status(403).json({ error: 'Only owners or super admins can manage collaborators' })
  }
  const email = normalizeEmail(req.body?.email)
  if (!email) {
    return res.status(400).json({ error: 'email is required' })
  }
  try {
    const user = await prisma.users.findUnique({
      where: { email },
      select: userSelectFields,
    })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    if (user.id === project.owner_id) {
      return res.status(400).json({ error: 'Owner already has access' })
    }
    const existing = await prisma.project_collaborators.findFirst({
      where: { project_id: project.id, user_id: user.id },
    })
    if (existing) {
      return res.status(400).json({ error: 'User already added to this project' })
    }
    await prisma.project_collaborators.create({
      data: {
        project_id: project.id,
        user_id: user.id,
      },
    })
    const collaborators = await fetchProjectCollaborators(project.id)
    res.status(201).json(collaborators.map(mapCollaboratorRow))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add collaborator', details: err.message })
  }
})

router.delete('/projects/:id/collaborators/:collaboratorId', async (req, res) => {
  if (SKIP_DB) {
    return res.json(stubProject.collaborators)
  }
  const project = req.project
  if (!canManageCollaborators(req.user, project)) {
    return res.status(403).json({ error: 'Only owners or super admins can manage collaborators' })
  }
  try {
    const collaborator = await prisma.project_collaborators.findFirst({
      where: { id: req.params.collaboratorId, project_id: project.id },
    })
    if (!collaborator) {
      return res.status(404).json({ error: 'Collaborator not found' })
    }
    await prisma.project_collaborators.delete({ where: { id: collaborator.id } })
    const collaborators = await fetchProjectCollaborators(project.id)
    res.json(collaborators.map(mapCollaboratorRow))
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove collaborator', details: err.message })
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
        owner_id: true,
        owner: {
          select: {
            id: true,
            email: true,
            display_name: true,
            is_super_admin: true,
            created_at: true,
          },
        },
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
        start_leasing_date: true,
        stabilized_date: true,
        retail_turnover_pct: true,
        retail_turnover_cost: true,
        project_collaborators: {
          include: {
            user: {
              select: userSelectFields,
            },
          },
        },
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
        retailTurnoverPct: updated.retail_turnover_pct,
        retailTurnoverCostUsd: updated.retail_turnover_cost,
        startLeasingDate: updated.start_leasing_date,
        stabilizedDate: updated.stabilized_date,
        owner: updated.owner,
        ownerId: updated.owner_id,
        collaborators: updated.project_collaborators,
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

router.get('/geocode/front', async (req, res) => {
  const { lat, lon, zoom = '16', bearing = '0', pitch = '60' } = req.query
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required' })
  if (!MAPBOX_TOKEN && !GOOGLE_STREET_VIEW_KEY) {
    return res.status(503).json({ error: 'Building front imagery not configured' })
  }
  try {
    let imageUrl
    if (GOOGLE_STREET_VIEW_KEY) {
      imageUrl = new URL('https://maps.googleapis.com/maps/api/streetview')
      imageUrl.searchParams.set('size', '600x400')
      imageUrl.searchParams.set('location', `${lat},${lon}`)
      imageUrl.searchParams.set('heading', bearing)
      imageUrl.searchParams.set('pitch', pitch)
      imageUrl.searchParams.set('fov', '90')
      imageUrl.searchParams.set('key', GOOGLE_STREET_VIEW_KEY)
    } else {
      imageUrl = new URL(
        `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/${lon},${lat},${zoom},${bearing},${pitch}/600x400`,
      )
      imageUrl.searchParams.set('access_token', MAPBOX_TOKEN)
      imageUrl.searchParams.set('attribution', 'false')
      imageUrl.searchParams.set('logo', 'false')
    }

    const response = await fetch(imageUrl.href)
    if (!response.ok) throw new Error(`Building front request failed ${response.status}`)
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=300')
    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('Building front fetch failed', err)
    res.status(500).json({ error: 'Failed to load building front image', details: err.message })
  }
})

router.get('/weather', async (req, res) => {
  const requestedLat = Number.parseFloat(req.query.lat)
  const requestedLon = Number.parseFloat(req.query.lon)
  const label =
    (typeof req.query.label === 'string' && req.query.label.trim()) || WEATHER_DEFAULT_LOCATION.label
  const latitude = Number.isFinite(requestedLat) ? requestedLat : WEATHER_DEFAULT_LOCATION.lat
  const longitude = Number.isFinite(requestedLon) ? requestedLon : WEATHER_DEFAULT_LOCATION.lon

  try {
    const weatherUrl = buildWeatherUrl(latitude, longitude)
    const response = await fetch(weatherUrl.href)
    if (!response.ok) throw new Error(`Weather request failed (${response.status})`)
    const payload = await response.json()
    const current = payload?.current_weather
    if (!current) throw new Error('Weather payload missing current_weather')
    res.json({
      city: label,
      label,
      temperature_c: current.temperature,
      windspeed_kmh: current.windspeed,
      sampled_at: current.time,
      source: 'open-meteo',
      latitude,
      longitude,
    })
  } catch (err) {
    console.error('Weather fetch failed', err)
    res.status(500).json({ error: 'Failed to fetch weather', details: err.message })
  }
})

export default router
