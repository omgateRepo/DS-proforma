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
  documentInputSchema,
  documentUpdateSchema,
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

const STAGES = ['new', 'offer_submitted', 'under_contract', 'in_development', 'stabilized', 'archived']
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
const LEASEUP_COST_CATEGORIES = ['marketing', 'staging', 'leasing_agent', 'tenant_improvements', 'legal', 'other']
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
  leaseupCosts: [],
  carryingCosts: [],
  cashflow: [],
  collaborators: [],
  documents: [],
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
  buildingImageUrl: 'building_image_url',
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
    buildingImageUrl: row.buildingImageUrl || row.building_image_url || null,
  },
  apartmentTurnover: {
    turnoverPct: toNumber(row.turnoverPct),
    turnoverCostUsd: toNumber(row.turnoverCostUsd),
  },
  retailTurnover: {
    turnoverPct: toNumber(row.retailTurnoverPct),
    turnoverCostUsd: toNumber(row.retailTurnoverCostUsd),
  },
  collaborators: Array.isArray(row.project_collaborators)
    ? row.project_collaborators.map(mapCollaboratorRow)
    : Array.isArray(row.collaborators)
    ? row.collaborators.map(mapCollaboratorRow)
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
  holdingPct: toNumber(row.holding_pct),
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
        building_image_url: true,
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
      buildingImageUrl: projectRow.building_image_url,
      owner: projectRow.owner,
      ownerId: projectRow.owner_id,
      collaborators: projectRow.project_collaborators,
    })

    const [revenue, retail, parking, contributions, costs, cashflow, documents] = await Promise.all([
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
      prisma.project_documents.findMany({
        where: { project_id: req.params.id },
        orderBy: { created_at: 'desc' },
      }),
    ])

    project.revenue = revenue.map(mapRevenueRow)
    project.retailRevenue = retail.map(mapRetailRow)
    project.parkingRevenue = parking.map(mapParkingRow)
    project.gpContributions = contributions.map(mapGpContributionRow)
    const costRows = costs.map(mapCostRow)
    project.hardCosts = costRows.filter((row) => row.category === 'hard')
    project.softCosts = costRows.filter((row) => row.category === 'soft')
    project.leaseupCosts = costRows.filter((row) => row.category === 'leaseup')
    project.carryingCosts = costRows.filter((row) => row.category === 'carrying')
    project.cashflow = cashflow.map(mapCashflowRow)
    project.documents = documents.map(mapDocumentRow)

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
        building_image_url: true,
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
        buildingImageUrl: updated.building_image_url,
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
    const selectFields = { stage: true, name: true, state: true }
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

      // Auto-create LLC entity when project moves to "under_contract" stage
      // Only if user is super admin and no entity exists for this project yet
      if (stage === 'under_contract' && req.user?.isSuperAdmin) {
        const existingEntity = await tx.admin_entities.findFirst({
          where: { linked_project_id: req.params.id, deleted_at: null },
        })
        if (!existingEntity) {
          await tx.admin_entities.create({
            data: {
              name: existing.name,
              entity_type: 'llc',
              state_of_formation: existing.state || null,
              status: 'active',
              owner_id: req.user.id,
              company_type: 'regular',
              legal_structure: 'llc',
              tax_status: 'passthrough', // Default for RE LLCs
              linked_project_id: req.params.id,
            },
          })
        }
      }

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

// Leaseup Costs
router.post('/projects/:id/leaseup-costs', async (req, res) => {
  const normalized = normalizeScheduledCostPayload(req.body, {
    categoryField: 'leaseupCategory',
    allowedCategories: LEASEUP_COST_CATEGORIES,
  })
  if (normalized.error) return res.status(400).json({ error: normalized.error })

  if (SKIP_DB) {
    return res.status(201).json({
      id: `leaseup-${Date.now()}`,
      category: 'leaseup',
      costName: normalized.costName,
      costGroup: normalized.categoryValue,
      amountUsd: normalized.amountUsd,
      paymentMonth: normalized.paymentMonth,
      startMonth: normalized.rangeStartMonth,
      endMonth: normalized.rangeEndMonth,
      paymentMode: normalized.paymentMode,
      monthList: normalized.monthList,
      monthPercentages: normalized.monthPercentages,
    })
  }

  try {
    const row = await prisma.cost_items.create({
      data: {
        project_id: req.params.id,
        category: 'leaseup',
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
    res.status(500).json({ error: 'Failed to create leaseup cost', details: err.message })
  }
})

router.patch('/projects/:id/leaseup-costs/:costId', async (req, res) => {
  const normalized = normalizeScheduledCostPayload(req.body, {
    categoryField: 'leaseupCategory',
    allowedCategories: LEASEUP_COST_CATEGORIES,
  })
  if (normalized.error) return res.status(400).json({ error: normalized.error })

  if (SKIP_DB) {
    return res.json({
      id: req.params.costId,
      category: 'leaseup',
      costName: normalized.costName,
      costGroup: normalized.categoryValue,
      amountUsd: normalized.amountUsd,
      paymentMonth: normalized.paymentMonth,
      startMonth: normalized.rangeStartMonth,
      endMonth: normalized.rangeEndMonth,
      paymentMode: normalized.paymentMode,
      monthList: normalized.monthList,
      monthPercentages: normalized.monthPercentages,
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
    if (row.project_id !== req.params.id || row.category !== 'leaseup') {
      return res.status(404).json({
        error: 'Leaseup cost not found',
        details: `Leaseup cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.json(mapCostRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update leaseup cost', details: err.message })
  }
})

router.delete('/projects/:id/leaseup-costs/:costId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.costId, deleted: true })
  }

  try {
    const result = await prisma.cost_items.deleteMany({
      where: { id: req.params.costId, project_id: req.params.id, category: 'leaseup' },
    })
    if (result.count === 0) {
      return res.status(404).json({
        error: 'Leaseup cost not found',
        details: `Leaseup cost ${req.params.costId} does not exist for project ${req.params.id}`,
      })
    }
    res.json({ id: req.params.costId, deleted: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete leaseup cost', details: err.message })
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
        holding_pct: payload.holdingPct ?? null,
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
        ...(payload.holdingPct !== undefined && { holding_pct: payload.holdingPct }),
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

// ============================================================================
// Project Documents
// ============================================================================

const mapDocumentRow = (row) => ({
  id: row.id,
  title: row.title,
  url: row.url,
  category: row.category,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const fetchTitleFromUrl = async (url) => {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000) // 5s timeout
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DocFetcher/1.0)',
      },
    })
    clearTimeout(timeout)
    
    if (!response.ok) return null
    
    const html = await response.text()
    
    // Extract title from <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch && titleMatch[1]) {
      let title = titleMatch[1].trim()
      
      // Clean up Google-specific suffixes
      title = title
        .replace(/ - Google Docs$/i, '')
        .replace(/ - Google Sheets$/i, '')
        .replace(/ - Google Slides$/i, '')
        .replace(/ - Google Drive$/i, '')
        .replace(/ - Dropbox$/i, '')
        .trim()
      
      if (title.length > 2 && title.length < 200) {
        return title
      }
    }
    return null
  } catch {
    return null
  }
}

const deriveTitleFromUrl = (url) => {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.replace('www.', '')
    
    // Try to get a meaningful name from the path
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    
    // For Google Drive/Docs URLs, use a friendly name
    if (hostname.includes('google.com')) {
      if (hostname.includes('drive')) return 'Google Drive Document'
      if (hostname.includes('docs')) return 'Google Doc'
      if (hostname.includes('sheets')) return 'Google Sheet'
      return 'Google Document'
    }
    
    // For Dropbox
    if (hostname.includes('dropbox.com')) return 'Dropbox File'
    
    // For other URLs, try to get the last path segment
    const lastSegment = pathParts[pathParts.length - 1]
    if (lastSegment && lastSegment.length > 3 && lastSegment.length < 50) {
      // Decode and clean up the segment
      const decoded = decodeURIComponent(lastSegment)
      // Remove common file extensions
      const cleaned = decoded.replace(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i, '')
      if (cleaned.length > 3) return cleaned
    }
    
    // Fallback to hostname
    return `Document from ${hostname}`
  } catch {
    return 'Untitled Document'
  }
}

router.get('/projects/:id/documents', async (req, res) => {
  if (SKIP_DB) {
    return res.json([])
  }
  try {
    const documents = await prisma.project_documents.findMany({
      where: { project_id: req.params.id },
      orderBy: { created_at: 'desc' },
    })
    res.json(documents.map(mapDocumentRow))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load documents', details: err.message })
  }
})

router.post('/projects/:id/documents', async (req, res) => {
  const payload = parseBody(documentInputSchema, req.body, res)
  if (!payload) return
  
  // Derive title: use provided title, or fetch from URL, or generate from URL
  let title = payload.title?.trim()
  if (!title) {
    title = await fetchTitleFromUrl(payload.url) || deriveTitleFromUrl(payload.url)
  }
  
  if (SKIP_DB) {
    return res.status(201).json({
      id: `doc-${Date.now()}`,
      ...payload,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  try {
    const row = await prisma.project_documents.create({
      data: {
        project_id: req.params.id,
        title,
        url: payload.url,
        category: payload.category,
        description: payload.description || null,
      },
    })
    res.status(201).json(mapDocumentRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add document', details: err.message })
  }
})

router.patch('/projects/:id/documents/:docId', async (req, res) => {
  const payload = parseBody(documentUpdateSchema, req.body, res)
  if (!payload) return
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }
  if (SKIP_DB) {
    return res.json({
      id: req.params.docId,
      title: payload.title || 'Document',
      url: payload.url || 'https://example.com',
      category: payload.category || 'other',
      description: payload.description || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  try {
    const data = {}
    if (payload.title !== undefined) data.title = payload.title
    if (payload.url !== undefined) data.url = payload.url
    if (payload.category !== undefined) data.category = payload.category
    if (payload.description !== undefined) data.description = payload.description || null
    
    const row = await prisma.project_documents.update({
      where: { id: req.params.docId },
      data,
    })
    if (row.project_id !== req.params.id) {
      return res.status(404).json({ error: 'Document not found' })
    }
    res.json(mapDocumentRow(row))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Document not found' })
    }
    res.status(500).json({ error: 'Failed to update document', details: err.message })
  }
})

router.delete('/projects/:id/documents/:docId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.docId, deleted: true })
  }
  try {
    const result = await prisma.project_documents.deleteMany({
      where: { id: req.params.docId, project_id: req.params.id },
    })
    if (result.count === 0) {
      return res.status(404).json({ error: 'Document not found' })
    }
    res.json({ id: req.params.docId, deleted: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document', details: err.message })
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

// ============================================
// BUSINESS PROJECTS API
// ============================================

const BUSINESS_STAGES = ['exploring', 'product_market_fit', 'unit_economics', 'sustainable_growth']
const BUSINESS_STAGE_LABELS = {
  exploring: 'Exploring',
  product_market_fit: 'Product-Market Fit',
  unit_economics: 'Positive Unit Economics',
  sustainable_growth: 'Sustainable Growth',
}

const mapBusinessProjectRow = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  stage: row.stage,
  stageEnteredAt: row.stage_entered_at,
  legalEntityName: row.legal_entity_name,
  legalEntityType: row.legal_entity_type,
  jurisdiction: row.jurisdiction,
  formedAt: row.formed_at,
  industry: row.industry,
  targetMarket: row.target_market,
  totalInvested: toNumber(row.total_invested),
  currentMrr: toNumber(row.current_mrr),
  currentRunway: row.current_runway,
  ownerId: row.owner_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapBusinessFounderRow = (row) => ({
  id: row.id,
  name: row.name,
  role: row.role,
  equityPercent: toNumber(row.equity_percent),
  createdAt: row.created_at,
})

const mapBusinessMetricsRow = (row) => ({
  id: row.id,
  month: row.month,
  mrr: toNumber(row.mrr),
  arr: toNumber(row.arr),
  revenueGrowthPct: toNumber(row.revenue_growth_pct),
  totalCustomers: row.total_customers,
  newCustomers: row.new_customers,
  churnedCustomers: row.churned_customers,
  churnRatePct: toNumber(row.churn_rate_pct),
  cac: toNumber(row.cac),
  ltv: toNumber(row.ltv),
  ltvCacRatio: toNumber(row.ltv_cac_ratio),
  grossMarginPct: toNumber(row.gross_margin_pct),
  cashBalance: toNumber(row.cash_balance),
  burnRate: toNumber(row.burn_rate),
  runwayMonths: row.runway_months,
  teamSize: row.team_size,
  notes: row.notes,
  createdAt: row.created_at,
})

const mapBusinessCriterionRow = (row) => ({
  id: row.id,
  stage: row.stage,
  criterionKey: row.criterion_key,
  description: row.description,
  completed: row.completed,
  completedAt: row.completed_at,
  notes: row.notes,
  createdAt: row.created_at,
})

const mapBusinessDocumentRow = (row) => ({
  id: row.id,
  title: row.title,
  url: row.url,
  category: row.category,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const stubBusinessProject = {
  id: 'stub-biz-1',
  name: 'Sample Retail SaaS',
  description: 'A sample business project',
  stage: 'exploring',
  stageEnteredAt: new Date().toISOString(),
  legalEntityName: null,
  legalEntityType: null,
  jurisdiction: null,
  formedAt: null,
  industry: 'retail_saas',
  targetMarket: 'SMB Retail',
  totalInvested: 0,
  currentMrr: 0,
  currentRunway: null,
  ownerId: 'stub-user',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  founders: [],
  monthlyMetrics: [],
  stageCriteria: [],
  documents: [],
  collaborators: [],
}

// List all business projects (for current user)
router.get('/business-projects', async (req, res) => {
  if (SKIP_DB) {
    return res.json([stubBusinessProject])
  }
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const projects = await prisma.business_projects.findMany({
      where: {
        deleted_at: null,
        OR: [
          { owner_id: userId },
          { collaborators: { some: { user_id: userId } } },
        ],
      },
      orderBy: { created_at: 'desc' },
    })

    res.json(projects.map(mapBusinessProjectRow))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load business projects', details: err.message })
  }
})

// Get business project detail
router.get('/business-projects/:id', async (req, res) => {
  if (SKIP_DB) {
    return res.json(stubBusinessProject)
  }
  try {
    const userId = req.user?.id
    const row = await prisma.business_projects.findFirst({
      where: {
        id: req.params.id,
        deleted_at: null,
        OR: [
          { owner_id: userId },
          { collaborators: { some: { user_id: userId } } },
        ],
      },
      include: {
        owner: { select: { id: true, email: true, display_name: true } },
      },
    })

    if (!row) {
      return res.status(404).json({ error: 'Business project not found' })
    }

    const [founders, monthlyMetrics, stageCriteria, documents, collaborators, packages] = await Promise.all([
      prisma.business_project_founders.findMany({
        where: { project_id: req.params.id },
        orderBy: { created_at: 'asc' },
      }),
      prisma.business_project_monthly_metrics.findMany({
        where: { project_id: req.params.id },
        orderBy: { month: 'desc' },
      }),
      prisma.business_project_stage_criteria.findMany({
        where: { project_id: req.params.id },
        orderBy: { created_at: 'asc' },
      }),
      prisma.business_project_documents.findMany({
        where: { project_id: req.params.id },
        orderBy: { created_at: 'asc' },
      }),
      prisma.business_project_collaborators.findMany({
        where: { project_id: req.params.id },
        include: { user: { select: { id: true, email: true, display_name: true } } },
      }),
      prisma.subscription_packages.findMany({
        where: { project_id: req.params.id },
        include: { items: { orderBy: { sort_order: 'asc' } } },
        orderBy: { sort_order: 'asc' },
      }),
    ])

    const project = mapBusinessProjectRow(row)
    project.ownerName = row.owner?.display_name || row.owner?.email || 'Unknown'
    project.ownerEmail = row.owner?.email || ''
    project.founders = founders.map(mapBusinessFounderRow)
    project.monthlyMetrics = monthlyMetrics.map(mapBusinessMetricsRow)
    project.stageCriteria = stageCriteria.map(mapBusinessCriterionRow)
    project.documents = documents.map(mapBusinessDocumentRow)
    project.collaborators = collaborators.map((c) => ({
      id: c.user.id,
      email: c.user.email,
      displayName: c.user.display_name,
    }))
    project.packages = packages.map(mapPackageRow)

    res.json(project)
  } catch (err) {
    res.status(500).json({ error: 'Failed to load business project', details: err.message })
  }
})

// Create business project
router.post('/business-projects', async (req, res) => {
  const { name, description, industry, targetMarket } = req.body || {}
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      ...stubBusinessProject,
      id: `stub-biz-${Date.now()}`,
      name: name.trim(),
      description: description || null,
      industry: industry || 'retail_saas',
      targetMarket: targetMarket || null,
    })
  }
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const row = await prisma.business_projects.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        industry: industry || 'retail_saas',
        target_market: targetMarket?.trim() || null,
        owner_id: userId,
      },
    })

    // Record initial stage history
    await prisma.business_project_stage_history.create({
      data: {
        project_id: row.id,
        from_stage: null,
        to_stage: 'exploring',
      },
    })

    const project = mapBusinessProjectRow(row)
    project.founders = []
    project.monthlyMetrics = []
    project.stageCriteria = []
    project.documents = []
    project.collaborators = []

    res.status(201).json(project)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create business project', details: err.message })
  }
})

// Update business project
router.patch('/business-projects/:id', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ ...stubBusinessProject, ...req.body })
  }
  try {
    const userId = req.user?.id
    const existing = await prisma.business_projects.findFirst({
      where: {
        id: req.params.id,
        deleted_at: null,
        OR: [
          { owner_id: userId },
          { collaborators: { some: { user_id: userId } } },
        ],
      },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Business project not found' })
    }

    const {
      name,
      description,
      stage,
      legalEntityName,
      legalEntityType,
      jurisdiction,
      formedAt,
      industry,
      targetMarket,
      totalInvested,
      currentMrr,
      currentRunway,
    } = req.body || {}

    const updateData = {}
    if (name !== undefined) updateData.name = name?.trim() || existing.name
    if (description !== undefined) updateData.description = description?.trim() || null
    if (legalEntityName !== undefined) updateData.legal_entity_name = legalEntityName?.trim() || null
    if (legalEntityType !== undefined) updateData.legal_entity_type = legalEntityType || null
    if (jurisdiction !== undefined) updateData.jurisdiction = jurisdiction?.trim() || null
    if (formedAt !== undefined) updateData.formed_at = formedAt ? new Date(formedAt) : null
    if (industry !== undefined) updateData.industry = industry || 'retail_saas'
    if (targetMarket !== undefined) updateData.target_market = targetMarket?.trim() || null
    if (totalInvested !== undefined) updateData.total_invested = totalInvested
    if (currentMrr !== undefined) updateData.current_mrr = currentMrr
    if (currentRunway !== undefined) updateData.current_runway = currentRunway

    // Handle stage change
    if (stage && stage !== existing.stage) {
      if (!BUSINESS_STAGES.includes(stage)) {
        return res.status(400).json({ error: `Invalid stage: ${stage}` })
      }
      updateData.stage = stage
      updateData.stage_entered_at = new Date()

      // Record stage history
      await prisma.business_project_stage_history.create({
        data: {
          project_id: req.params.id,
          from_stage: existing.stage,
          to_stage: stage,
        },
      })
    }

    updateData.updated_at = new Date()

    const row = await prisma.business_projects.update({
      where: { id: req.params.id },
      data: updateData,
    })

    res.json(mapBusinessProjectRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update business project', details: err.message })
  }
})

// Delete business project (soft delete)
router.delete('/business-projects/:id', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ success: true })
  }
  try {
    const userId = req.user?.id
    const existing = await prisma.business_projects.findFirst({
      where: {
        id: req.params.id,
        owner_id: userId, // Only owner can delete
        deleted_at: null,
      },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Business project not found or not authorized' })
    }

    await prisma.business_projects.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete business project', details: err.message })
  }
})

// ---- Business Project Collaborators ----

router.post('/business-projects/:id/collaborators', async (req, res) => {
  const { email } = req.body || {}
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({ id: 'stub-user', email, displayName: email })
  }
  try {
    const userId = req.user?.id
    const project = await prisma.business_projects.findFirst({
      where: { id: req.params.id, owner_id: userId, deleted_at: null },
    })
    if (!project) {
      return res.status(404).json({ error: 'Project not found or not authorized' })
    }

    const targetUser = await prisma.users.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' })
    }
    if (targetUser.id === userId) {
      return res.status(400).json({ error: 'Cannot add yourself as collaborator' })
    }

    await prisma.business_project_collaborators.upsert({
      where: { project_id_user_id: { project_id: req.params.id, user_id: targetUser.id } },
      create: { project_id: req.params.id, user_id: targetUser.id },
      update: {},
    })

    res.status(201).json({ id: targetUser.id, email: targetUser.email, displayName: targetUser.display_name })
  } catch (err) {
    res.status(500).json({ error: 'Failed to add collaborator', details: err.message })
  }
})

router.delete('/business-projects/:id/collaborators/:userId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ success: true })
  }
  try {
    const ownerId = req.user?.id
    const project = await prisma.business_projects.findFirst({
      where: { id: req.params.id, owner_id: ownerId, deleted_at: null },
    })
    if (!project) {
      return res.status(404).json({ error: 'Project not found or not authorized' })
    }

    await prisma.business_project_collaborators.deleteMany({
      where: { project_id: req.params.id, user_id: req.params.userId },
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove collaborator', details: err.message })
  }
})

// ---- Business Project Founders ----

router.post('/business-projects/:id/founders', async (req, res) => {
  const { name, role, equityPercent } = req.body || {}
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `founder-${Date.now()}`,
      name: name.trim(),
      role: role || '',
      equityPercent: equityPercent || null,
      createdAt: new Date().toISOString(),
    })
  }
  try {
    const row = await prisma.business_project_founders.create({
      data: {
        project_id: req.params.id,
        name: name.trim(),
        role: role?.trim() || '',
        equity_percent: equityPercent || null,
      },
    })
    res.status(201).json(mapBusinessFounderRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add founder', details: err.message })
  }
})

router.patch('/business-projects/:id/founders/:founderId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.founderId, ...req.body })
  }
  try {
    const { name, role, equityPercent } = req.body || {}
    const updateData = {}
    if (name !== undefined) updateData.name = name?.trim()
    if (role !== undefined) updateData.role = role?.trim() || ''
    if (equityPercent !== undefined) updateData.equity_percent = equityPercent

    const row = await prisma.business_project_founders.update({
      where: { id: req.params.founderId },
      data: updateData,
    })
    res.json(mapBusinessFounderRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update founder', details: err.message })
  }
})

router.delete('/business-projects/:id/founders/:founderId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ success: true })
  }
  try {
    await prisma.business_project_founders.delete({ where: { id: req.params.founderId } })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete founder', details: err.message })
  }
})

// ---- Business Project Monthly Metrics ----

router.post('/business-projects/:id/metrics', async (req, res) => {
  const { month, ...metrics } = req.body || {}
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Month is required (YYYY-MM format)' })
  }
  if (SKIP_DB) {
    return res.status(201).json({ id: `metric-${Date.now()}`, month, ...metrics, createdAt: new Date().toISOString() })
  }
  try {
    const row = await prisma.business_project_monthly_metrics.upsert({
      where: { project_id_month: { project_id: req.params.id, month } },
      create: {
        project_id: req.params.id,
        month,
        mrr: metrics.mrr,
        arr: metrics.arr,
        revenue_growth_pct: metrics.revenueGrowthPct,
        total_customers: metrics.totalCustomers,
        new_customers: metrics.newCustomers,
        churned_customers: metrics.churnedCustomers,
        churn_rate_pct: metrics.churnRatePct,
        cac: metrics.cac,
        ltv: metrics.ltv,
        ltv_cac_ratio: metrics.ltvCacRatio,
        gross_margin_pct: metrics.grossMarginPct,
        cash_balance: metrics.cashBalance,
        burn_rate: metrics.burnRate,
        runway_months: metrics.runwayMonths,
        team_size: metrics.teamSize,
        notes: metrics.notes,
      },
      update: {
        mrr: metrics.mrr,
        arr: metrics.arr,
        revenue_growth_pct: metrics.revenueGrowthPct,
        total_customers: metrics.totalCustomers,
        new_customers: metrics.newCustomers,
        churned_customers: metrics.churnedCustomers,
        churn_rate_pct: metrics.churnRatePct,
        cac: metrics.cac,
        ltv: metrics.ltv,
        ltv_cac_ratio: metrics.ltvCacRatio,
        gross_margin_pct: metrics.grossMarginPct,
        cash_balance: metrics.cashBalance,
        burn_rate: metrics.burnRate,
        runway_months: metrics.runwayMonths,
        team_size: metrics.teamSize,
        notes: metrics.notes,
      },
    })
    res.status(201).json(mapBusinessMetricsRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to save metrics', details: err.message })
  }
})

router.delete('/business-projects/:id/metrics/:metricId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ success: true })
  }
  try {
    await prisma.business_project_monthly_metrics.delete({ where: { id: req.params.metricId } })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete metrics', details: err.message })
  }
})

// ---- Business Project Stage Criteria ----

router.post('/business-projects/:id/criteria', async (req, res) => {
  const { stage, criterionKey, description } = req.body || {}
  if (!stage || !criterionKey || !description) {
    return res.status(400).json({ error: 'Stage, criterionKey, and description are required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `criterion-${Date.now()}`,
      stage,
      criterionKey,
      description,
      completed: false,
      completedAt: null,
      notes: null,
      createdAt: new Date().toISOString(),
    })
  }
  try {
    const row = await prisma.business_project_stage_criteria.upsert({
      where: { project_id_stage_criterion_key: { project_id: req.params.id, stage, criterion_key: criterionKey } },
      create: {
        project_id: req.params.id,
        stage,
        criterion_key: criterionKey,
        description,
      },
      update: { description },
    })
    res.status(201).json(mapBusinessCriterionRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to save criterion', details: err.message })
  }
})

router.patch('/business-projects/:id/criteria/:criterionId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ id: req.params.criterionId, ...req.body })
  }
  try {
    const { completed, notes } = req.body || {}
    const updateData = {}
    if (completed !== undefined) {
      updateData.completed = completed
      updateData.completed_at = completed ? new Date() : null
    }
    if (notes !== undefined) updateData.notes = notes

    const row = await prisma.business_project_stage_criteria.update({
      where: { id: req.params.criterionId },
      data: updateData,
    })
    res.json(mapBusinessCriterionRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update criterion', details: err.message })
  }
})

// ---- Business Project Documents ----

router.get('/business-projects/:id/documents', async (req, res) => {
  if (SKIP_DB) {
    return res.json([])
  }
  try {
    const documents = await prisma.business_project_documents.findMany({
      where: { project_id: req.params.id },
      orderBy: { created_at: 'asc' },
    })
    res.json(documents.map(mapBusinessDocumentRow))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load documents', details: err.message })
  }
})

router.post('/business-projects/:id/documents', async (req, res) => {
  const payload = parseBody(documentInputSchema, req.body, res)
  if (!payload) return
  const title = payload.title?.trim() || await fetchTitleFromUrl(payload.url) || deriveTitleFromUrl(payload.url)
  if (SKIP_DB) {
    return res.status(201).json({
      id: `doc-${Date.now()}`,
      ...payload,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  try {
    const row = await prisma.business_project_documents.create({
      data: {
        project_id: req.params.id,
        title,
        url: payload.url,
        category: payload.category,
        description: payload.description || null,
      },
    })
    res.status(201).json(mapBusinessDocumentRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add document', details: err.message })
  }
})

router.patch('/business-projects/:id/documents/:docId', async (req, res) => {
  const payload = parseBody(documentUpdateSchema, req.body, res)
  if (!payload) return
  if (SKIP_DB) {
    return res.json({ id: req.params.docId, ...payload, updatedAt: new Date().toISOString() })
  }
  try {
    const updateData = { updated_at: new Date() }
    if (payload.title !== undefined) updateData.title = payload.title
    if (payload.url !== undefined) updateData.url = payload.url
    if (payload.category !== undefined) updateData.category = payload.category
    if (payload.description !== undefined) updateData.description = payload.description || null

    const row = await prisma.business_project_documents.update({
      where: { id: req.params.docId },
      data: updateData,
    })
    res.json(mapBusinessDocumentRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update document', details: err.message })
  }
})

router.delete('/business-projects/:id/documents/:docId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ success: true })
  }
  try {
    await prisma.business_project_documents.delete({ where: { id: req.params.docId } })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document', details: err.message })
  }
})

// ============ Subscription Packages (Unit Economy) ============

const mapPackageRow = (row) => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name,
  description: row.description,
  suggestedPrice: row.suggested_price ? Number(row.suggested_price) : 0,
  sortOrder: row.sort_order,
  items: row.items?.map(mapPackageItemRow) || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapPackageItemRow = (row) => ({
  id: row.id,
  packageId: row.package_id,
  name: row.name,
  metricType: row.metric_type,
  metricValue: row.metric_value,
  cost: row.cost ? Number(row.cost) : 0,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

// GET all packages for a business project
router.get('/business-projects/:id/packages', async (req, res) => {
  if (SKIP_DB) {
    return res.json([])
  }
  try {
    const rows = await prisma.subscription_packages.findMany({
      where: { project_id: req.params.id },
      include: { items: { orderBy: { sort_order: 'asc' } } },
      orderBy: { sort_order: 'asc' },
    })
    res.json(rows.map(mapPackageRow))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load packages', details: err.message })
  }
})

// POST create a new package
router.post('/business-projects/:id/packages', async (req, res) => {
  const { name, description, suggestedPrice } = req.body
  if (!name || suggestedPrice === undefined) {
    return res.status(400).json({ error: 'name and suggestedPrice are required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `pkg-${Date.now()}`,
      projectId: req.params.id,
      name,
      description: description || null,
      suggestedPrice,
      sortOrder: 0,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  try {
    const maxSort = await prisma.subscription_packages.aggregate({
      where: { project_id: req.params.id },
      _max: { sort_order: true },
    })
    const row = await prisma.subscription_packages.create({
      data: {
        project_id: req.params.id,
        name,
        description: description || null,
        suggested_price: suggestedPrice,
        sort_order: (maxSort._max.sort_order ?? -1) + 1,
      },
      include: { items: true },
    })
    res.status(201).json(mapPackageRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create package', details: err.message })
  }
})

// PATCH update a package
router.patch('/business-projects/:id/packages/:packageId', async (req, res) => {
  const { name, description, suggestedPrice, sortOrder } = req.body
  const data = {}
  if (name !== undefined) data.name = name
  if (description !== undefined) data.description = description
  if (suggestedPrice !== undefined) data.suggested_price = suggestedPrice
  if (sortOrder !== undefined) data.sort_order = sortOrder

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }
  if (SKIP_DB) {
    return res.json({ id: req.params.packageId, ...req.body })
  }
  try {
    const row = await prisma.subscription_packages.update({
      where: { id: req.params.packageId },
      data,
      include: { items: { orderBy: { sort_order: 'asc' } } },
    })
    res.json(mapPackageRow(row))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Package not found' })
    }
    res.status(500).json({ error: 'Failed to update package', details: err.message })
  }
})

// DELETE a package
router.delete('/business-projects/:id/packages/:packageId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ success: true })
  }
  try {
    await prisma.subscription_packages.delete({ where: { id: req.params.packageId } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Package not found' })
    }
    res.status(500).json({ error: 'Failed to delete package', details: err.message })
  }
})

// ============ Package Items ============

// POST create a new package item
router.post('/business-projects/:id/packages/:packageId/items', async (req, res) => {
  const { name, metricType, metricValue, cost } = req.body
  if (!name || !metricType || cost === undefined) {
    return res.status(400).json({ error: 'name, metricType, and cost are required' })
  }
  if (!['frequency', 'quantity', 'na'].includes(metricType)) {
    return res.status(400).json({ error: 'metricType must be frequency, quantity, or na' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `item-${Date.now()}`,
      packageId: req.params.packageId,
      name,
      metricType,
      metricValue: metricValue || null,
      cost,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  try {
    const maxSort = await prisma.subscription_package_items.aggregate({
      where: { package_id: req.params.packageId },
      _max: { sort_order: true },
    })
    const row = await prisma.subscription_package_items.create({
      data: {
        package_id: req.params.packageId,
        name,
        metric_type: metricType,
        metric_value: metricValue || null,
        cost,
        sort_order: (maxSort._max.sort_order ?? -1) + 1,
      },
    })
    res.status(201).json(mapPackageItemRow(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create item', details: err.message })
  }
})

// PATCH update a package item
router.patch('/business-projects/:id/packages/:packageId/items/:itemId', async (req, res) => {
  const { name, metricType, metricValue, cost, sortOrder } = req.body
  const data = {}
  if (name !== undefined) data.name = name
  if (metricType !== undefined) {
    if (!['frequency', 'quantity', 'na'].includes(metricType)) {
      return res.status(400).json({ error: 'metricType must be frequency, quantity, or na' })
    }
    data.metric_type = metricType
  }
  if (metricValue !== undefined) data.metric_value = metricValue
  if (cost !== undefined) data.cost = cost
  if (sortOrder !== undefined) data.sort_order = sortOrder

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }
  if (SKIP_DB) {
    return res.json({ id: req.params.itemId, ...req.body })
  }
  try {
    const row = await prisma.subscription_package_items.update({
      where: { id: req.params.itemId },
      data,
    })
    res.json(mapPackageItemRow(row))
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Item not found' })
    }
    res.status(500).json({ error: 'Failed to update item', details: err.message })
  }
})

// DELETE a package item
router.delete('/business-projects/:id/packages/:packageId/items/:itemId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ success: true })
  }
  try {
    await prisma.subscription_package_items.delete({ where: { id: req.params.itemId } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Item not found' })
    }
    res.status(500).json({ error: 'Failed to delete item', details: err.message })
  }
})

// Get project counts for board visibility
router.get('/project-counts', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ realEstate: 1, business: 1, lifeInsurance: 1 })
  }
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const [realEstateCount, businessCount, lifeInsuranceCount] = await Promise.all([
      prisma.projects.count({
        where: {
          deleted_at: null,
          OR: [
            { owner_id: userId },
            { project_collaborators: { some: { user_id: userId } } },
          ],
        },
      }),
      prisma.business_projects.count({
        where: {
          deleted_at: null,
          OR: [
            { owner_id: userId },
            { collaborators: { some: { user_id: userId } } },
          ],
        },
      }),
      prisma.life_insurance_policies.count({
        where: {
          deleted_at: null,
          owner_id: userId,
        },
      }),
    ])

    res.json({ realEstate: realEstateCount, business: businessCount, lifeInsurance: lifeInsuranceCount })
  } catch (err) {
    res.status(500).json({ error: 'Failed to get project counts', details: err.message })
  }
})

// ============================================
// ADMIN HUB ROUTES (Super Admin Only)
// ============================================

const requireSuperAdmin = (req, res, next) => {
  if (SKIP_DB) return next()
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' })
  }
  next()
}

// Helper mappers for Admin Hub
const mapAdminEntity = (row) => ({
  id: row.id,
  name: row.name,
  entityType: row.entity_type,
  ein: row.ein,
  stateOfFormation: row.state_of_formation,
  formationDate: row.formation_date?.toISOString().split('T')[0] || null,
  registeredAgent: row.registered_agent,
  address: row.address,
  status: row.status,
  notes: row.notes,
  ownerId: row.owner_id,
  // Company classification
  companyType: row.company_type,
  legalStructure: row.legal_structure,
  taxStatus: row.tax_status,
  linkedProjectId: row.linked_project_id,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const mapAdminEntityOwnership = (row) => ({
  id: row.id,
  parentEntityId: row.parent_entity_id,
  childEntityId: row.child_entity_id,
  ownershipPercentage: toNumber(row.ownership_percentage),
  notes: row.notes,
  parentEntity: row.parent_entity ? mapAdminEntity(row.parent_entity) : undefined,
  childEntity: row.child_entity ? mapAdminEntity(row.child_entity) : undefined,
})

const mapAdminTaxItem = (row) => ({
  id: row.id,
  taxYear: row.tax_year,
  category: row.category,
  entityId: row.entity_id,
  description: row.description,
  amountUsd: toNumber(row.amount_usd),
  recipientOrSource: row.recipient_or_source,
  itemDate: row.item_date?.toISOString().split('T')[0] || null,
  dueDate: row.due_date?.toISOString().split('T')[0] || null,
  status: row.status,
  notes: row.notes,
  ownerId: row.owner_id,
  entity: row.entity ? mapAdminEntity(row.entity) : null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const mapAdminTeamMember = (row) => ({
  id: row.id,
  name: row.name,
  role: row.role,
  company: row.company,
  email: row.email,
  phone: row.phone,
  address: row.address,
  specialty: row.specialty,
  hourlyRate: toNumber(row.hourly_rate),
  notes: row.notes,
  ownerId: row.owner_id,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const mapAdminEngagement = (row) => ({
  id: row.id,
  teamMemberId: row.team_member_id,
  entityId: row.entity_id,
  title: row.title,
  startDate: row.start_date?.toISOString().split('T')[0] || null,
  endDate: row.end_date?.toISOString().split('T')[0] || null,
  scope: row.scope,
  feeStructure: row.fee_structure,
  documentUrl: row.document_url,
  status: row.status,
  notes: row.notes,
  ownerId: row.owner_id,
  teamMember: row.team_member ? mapAdminTeamMember(row.team_member) : undefined,
  entity: row.entity ? mapAdminEntity(row.entity) : null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const mapAdminEntityDocument = (row) => ({
  id: row.id,
  entityId: row.entity_id,
  documentType: row.document_type,
  name: row.name,
  fileUrl: row.file_url,
  year: row.year,
  notes: row.notes,
  uploadedBy: row.uploaded_by,
  entity: row.entity ? mapAdminEntity(row.entity) : undefined,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

// ---- ADMIN ENTITIES ROUTES ----

// GET all entities
router.get('/admin/entities', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) {
    return res.json([])
  }
  try {
    const rows = await prisma.admin_entities.findMany({
      where: { deleted_at: null, owner_id: req.user.id },
      orderBy: { name: 'asc' },
    })
    res.json(rows.map(mapAdminEntity))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch entities', details: err.message })
  }
})

// GET single entity with ownership
router.get('/admin/entities/:id', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) {
    return res.status(404).json({ error: 'Entity not found' })
  }
  try {
    const row = await prisma.admin_entities.findFirst({
      where: { id: req.params.id, deleted_at: null, owner_id: req.user.id },
      include: {
        parent_relationships: { include: { parent_entity: true } },
        child_relationships: { include: { child_entity: true } },
      },
    })
    if (!row) return res.status(404).json({ error: 'Entity not found' })
    res.json({
      ...mapAdminEntity(row),
      parentRelationships: row.parent_relationships.map(mapAdminEntityOwnership),
      childRelationships: row.child_relationships.map(mapAdminEntityOwnership),
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch entity', details: err.message })
  }
})

// POST create entity
router.post('/admin/entities', requireSuperAdmin, async (req, res) => {
  const { name, entityType, ein, stateOfFormation, formationDate, registeredAgent, address, status, notes, companyType, legalStructure, taxStatus, linkedProjectId } = req.body
  if (!name || !entityType) {
    return res.status(400).json({ error: 'name and entityType are required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `entity-${Date.now()}`,
      name, entityType, ein, stateOfFormation, formationDate, registeredAgent, address, status: status || 'active', notes,
      companyType, legalStructure, taxStatus, linkedProjectId,
      ownerId: 'stub-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  try {
    const row = await prisma.admin_entities.create({
      data: {
        name,
        entity_type: entityType,
        ein: ein || null,
        state_of_formation: stateOfFormation || null,
        formation_date: formationDate ? new Date(formationDate) : null,
        registered_agent: registeredAgent || null,
        address: address || null,
        status: status || 'active',
        notes: notes || null,
        owner_id: req.user.id,
        // Company classification
        company_type: companyType || null,
        legal_structure: legalStructure || null,
        tax_status: taxStatus || null,
        linked_project_id: linkedProjectId || null,
      },
    })
    res.status(201).json(mapAdminEntity(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create entity', details: err.message })
  }
})

// PATCH update entity
router.patch('/admin/entities/:id', requireSuperAdmin, async (req, res) => {
  const { name, entityType, ein, stateOfFormation, formationDate, registeredAgent, address, status, notes, companyType, legalStructure, taxStatus, linkedProjectId } = req.body
  const data = {}
  if (name !== undefined) data.name = name
  if (entityType !== undefined) data.entity_type = entityType
  if (ein !== undefined) data.ein = ein
  if (stateOfFormation !== undefined) data.state_of_formation = stateOfFormation
  if (formationDate !== undefined) data.formation_date = formationDate ? new Date(formationDate) : null
  if (registeredAgent !== undefined) data.registered_agent = registeredAgent
  if (address !== undefined) data.address = address
  if (status !== undefined) data.status = status
  if (notes !== undefined) data.notes = notes
  // Company classification
  if (companyType !== undefined) data.company_type = companyType
  if (legalStructure !== undefined) data.legal_structure = legalStructure
  if (taxStatus !== undefined) data.tax_status = taxStatus
  if (linkedProjectId !== undefined) data.linked_project_id = linkedProjectId

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }
  if (SKIP_DB) {
    return res.json({ id: req.params.id, ...req.body })
  }
  try {
    const row = await prisma.admin_entities.update({
      where: { id: req.params.id },
      data,
    })
    res.json(mapAdminEntity(row))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Entity not found' })
    res.status(500).json({ error: 'Failed to update entity', details: err.message })
  }
})

// DELETE entity (soft delete)
router.delete('/admin/entities/:id', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json({ success: true })
  try {
    await prisma.admin_entities.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Entity not found' })
    res.status(500).json({ error: 'Failed to delete entity', details: err.message })
  }
})

// ---- ENTITY OWNERSHIP ROUTES ----

// GET all ownership relationships
router.get('/admin/entity-ownership', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json([])
  try {
    const rows = await prisma.admin_entity_ownership.findMany({
      include: { parent_entity: true, child_entity: true },
    })
    res.json(rows.map(mapAdminEntityOwnership))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ownership', details: err.message })
  }
})

// POST create ownership relationship
router.post('/admin/entity-ownership', requireSuperAdmin, async (req, res) => {
  const { parentEntityId, childEntityId, ownershipPercentage, notes } = req.body
  if (!parentEntityId || !childEntityId || ownershipPercentage === undefined) {
    return res.status(400).json({ error: 'parentEntityId, childEntityId, and ownershipPercentage are required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `ownership-${Date.now()}`,
      parentEntityId, childEntityId, ownershipPercentage, notes,
    })
  }
  try {
    const row = await prisma.admin_entity_ownership.create({
      data: {
        parent_entity_id: parentEntityId,
        child_entity_id: childEntityId,
        ownership_percentage: ownershipPercentage,
        notes: notes || null,
      },
      include: { parent_entity: true, child_entity: true },
    })
    res.status(201).json(mapAdminEntityOwnership(row))
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Ownership relationship already exists' })
    res.status(500).json({ error: 'Failed to create ownership', details: err.message })
  }
})

// PATCH update ownership
router.patch('/admin/entity-ownership/:id', requireSuperAdmin, async (req, res) => {
  const { ownershipPercentage, notes } = req.body
  const data = {}
  if (ownershipPercentage !== undefined) data.ownership_percentage = ownershipPercentage
  if (notes !== undefined) data.notes = notes
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }
  if (SKIP_DB) return res.json({ id: req.params.id, ...req.body })
  try {
    const row = await prisma.admin_entity_ownership.update({
      where: { id: req.params.id },
      data,
      include: { parent_entity: true, child_entity: true },
    })
    res.json(mapAdminEntityOwnership(row))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Ownership not found' })
    res.status(500).json({ error: 'Failed to update ownership', details: err.message })
  }
})

// DELETE ownership relationship
router.delete('/admin/entity-ownership/:id', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json({ success: true })
  try {
    await prisma.admin_entity_ownership.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Ownership not found' })
    res.status(500).json({ error: 'Failed to delete ownership', details: err.message })
  }
})

// ---- TAX ITEMS ROUTES ----

// GET all tax items (optionally filter by year)
router.get('/admin/tax-items', requireSuperAdmin, async (req, res) => {
  const { year } = req.query
  if (SKIP_DB) return res.json([])
  try {
    const where = { owner_id: req.user.id }
    if (year) where.tax_year = parseInt(year, 10)
    const rows = await prisma.admin_tax_items.findMany({
      where,
      include: { entity: true },
      orderBy: [{ tax_year: 'desc' }, { item_date: 'desc' }],
    })
    res.json(rows.map(mapAdminTaxItem))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tax items', details: err.message })
  }
})

// POST create tax item
router.post('/admin/tax-items', requireSuperAdmin, async (req, res) => {
  const { taxYear, category, entityId, description, amountUsd, recipientOrSource, itemDate, dueDate, status, notes } = req.body
  if (!taxYear || !category || !description) {
    return res.status(400).json({ error: 'taxYear, category, and description are required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `tax-${Date.now()}`,
      taxYear, category, entityId, description, amountUsd, recipientOrSource, itemDate, dueDate,
      status: status || 'pending', notes, ownerId: 'stub-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  try {
    const row = await prisma.admin_tax_items.create({
      data: {
        tax_year: taxYear,
        category,
        entity_id: entityId || null,
        description,
        amount_usd: amountUsd || null,
        recipient_or_source: recipientOrSource || null,
        item_date: itemDate ? new Date(itemDate) : null,
        due_date: dueDate ? new Date(dueDate) : null,
        status: status || 'pending',
        notes: notes || null,
        owner_id: req.user.id,
      },
      include: { entity: true },
    })
    res.status(201).json(mapAdminTaxItem(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tax item', details: err.message })
  }
})

// PATCH update tax item
router.patch('/admin/tax-items/:id', requireSuperAdmin, async (req, res) => {
  const { taxYear, category, entityId, description, amountUsd, recipientOrSource, itemDate, dueDate, status, notes } = req.body
  const data = {}
  if (taxYear !== undefined) data.tax_year = taxYear
  if (category !== undefined) data.category = category
  if (entityId !== undefined) data.entity_id = entityId
  if (description !== undefined) data.description = description
  if (amountUsd !== undefined) data.amount_usd = amountUsd
  if (recipientOrSource !== undefined) data.recipient_or_source = recipientOrSource
  if (itemDate !== undefined) data.item_date = itemDate ? new Date(itemDate) : null
  if (dueDate !== undefined) data.due_date = dueDate ? new Date(dueDate) : null
  if (status !== undefined) data.status = status
  if (notes !== undefined) data.notes = notes

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }
  if (SKIP_DB) return res.json({ id: req.params.id, ...req.body })
  try {
    const row = await prisma.admin_tax_items.update({
      where: { id: req.params.id },
      data,
      include: { entity: true },
    })
    res.json(mapAdminTaxItem(row))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tax item not found' })
    res.status(500).json({ error: 'Failed to update tax item', details: err.message })
  }
})

// DELETE tax item
router.delete('/admin/tax-items/:id', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json({ success: true })
  try {
    await prisma.admin_tax_items.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tax item not found' })
    res.status(500).json({ error: 'Failed to delete tax item', details: err.message })
  }
})

// ---- TEAM MEMBERS ROUTES ----

// GET all team members
router.get('/admin/team-members', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json([])
  try {
    const rows = await prisma.admin_team_members.findMany({
      where: { deleted_at: null, owner_id: req.user.id },
      orderBy: { name: 'asc' },
    })
    res.json(rows.map(mapAdminTeamMember))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team members', details: err.message })
  }
})

// GET single team member with engagements and payments
router.get('/admin/team-members/:id', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.status(404).json({ error: 'Team member not found' })
  try {
    const row = await prisma.admin_team_members.findFirst({
      where: { id: req.params.id, deleted_at: null, owner_id: req.user.id },
      include: { 
        engagements: { include: { entity: true } },
        payments: { orderBy: { payment_date: 'desc' } },
      },
    })
    if (!row) return res.status(404).json({ error: 'Team member not found' })
    res.json({
      ...mapAdminTeamMember(row),
      engagements: row.engagements.map(mapAdminEngagement),
      payments: row.payments.map((p) => ({
        id: p.id,
        teamMemberId: p.team_member_id,
        invoiceUrl: p.invoice_url,
        amountUsd: toNumber(p.amount_usd),
        invoiceDate: p.invoice_date?.toISOString().split('T')[0] || null,
        paymentDate: p.payment_date?.toISOString().split('T')[0] || null,
        notes: p.notes,
        ownerId: p.owner_id,
        createdAt: p.created_at.toISOString(),
      })),
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team member', details: err.message })
  }
})

// POST create team member
router.post('/admin/team-members', requireSuperAdmin, async (req, res) => {
  const { name, role, company, email, phone, address, specialty, hourlyRate, notes } = req.body
  if (!name || !role) {
    return res.status(400).json({ error: 'name and role are required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `team-${Date.now()}`,
      name, role, company, email, phone, address, specialty, hourlyRate, notes,
      ownerId: 'stub-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  try {
    const row = await prisma.admin_team_members.create({
      data: {
        name,
        role,
        company: company || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        specialty: specialty || null,
        hourly_rate: hourlyRate || null,
        notes: notes || null,
        owner_id: req.user.id,
      },
    })
    res.status(201).json(mapAdminTeamMember(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create team member', details: err.message })
  }
})

// PATCH update team member
router.patch('/admin/team-members/:id', requireSuperAdmin, async (req, res) => {
  const { name, role, company, email, phone, address, specialty, hourlyRate, notes } = req.body
  const data = {}
  if (name !== undefined) data.name = name
  if (role !== undefined) data.role = role
  if (company !== undefined) data.company = company
  if (email !== undefined) data.email = email
  if (phone !== undefined) data.phone = phone
  if (address !== undefined) data.address = address
  if (specialty !== undefined) data.specialty = specialty
  if (hourlyRate !== undefined) data.hourly_rate = hourlyRate
  if (notes !== undefined) data.notes = notes

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }
  if (SKIP_DB) return res.json({ id: req.params.id, ...req.body })
  try {
    const row = await prisma.admin_team_members.update({
      where: { id: req.params.id },
      data,
    })
    res.json(mapAdminTeamMember(row))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Team member not found' })
    res.status(500).json({ error: 'Failed to update team member', details: err.message })
  }
})

// DELETE team member (soft delete)
router.delete('/admin/team-members/:id', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json({ success: true })
  try {
    await prisma.admin_team_members.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Team member not found' })
    res.status(500).json({ error: 'Failed to delete team member', details: err.message })
  }
})

// ---- ENGAGEMENTS ROUTES ----

// GET all engagements
router.get('/admin/engagements', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json([])
  try {
    const rows = await prisma.admin_engagements.findMany({
      where: { owner_id: req.user.id },
      include: { team_member: true, entity: true },
      orderBy: { start_date: 'desc' },
    })
    res.json(rows.map(mapAdminEngagement))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch engagements', details: err.message })
  }
})

// POST create engagement
router.post('/admin/engagements', requireSuperAdmin, async (req, res) => {
  const { teamMemberId, entityId, title, startDate, endDate, scope, feeStructure, documentUrl, status, notes } = req.body
  if (!teamMemberId || !title) {
    return res.status(400).json({ error: 'teamMemberId and title are required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `engagement-${Date.now()}`,
      teamMemberId, entityId, title, startDate, endDate, scope, feeStructure, documentUrl,
      status: status || 'active', notes, ownerId: 'stub-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  try {
    const row = await prisma.admin_engagements.create({
      data: {
        team_member_id: teamMemberId,
        entity_id: entityId || null,
        title,
        start_date: startDate ? new Date(startDate) : null,
        end_date: endDate ? new Date(endDate) : null,
        scope: scope || null,
        fee_structure: feeStructure || null,
        document_url: documentUrl || null,
        status: status || 'active',
        notes: notes || null,
        owner_id: req.user.id,
      },
      include: { team_member: true, entity: true },
    })
    res.status(201).json(mapAdminEngagement(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create engagement', details: err.message })
  }
})

// PATCH update engagement
router.patch('/admin/engagements/:id', requireSuperAdmin, async (req, res) => {
  const { teamMemberId, entityId, title, startDate, endDate, scope, feeStructure, documentUrl, status, notes } = req.body
  const data = {}
  if (teamMemberId !== undefined) data.team_member_id = teamMemberId
  if (entityId !== undefined) data.entity_id = entityId
  if (title !== undefined) data.title = title
  if (startDate !== undefined) data.start_date = startDate ? new Date(startDate) : null
  if (endDate !== undefined) data.end_date = endDate ? new Date(endDate) : null
  if (scope !== undefined) data.scope = scope
  if (feeStructure !== undefined) data.fee_structure = feeStructure
  if (documentUrl !== undefined) data.document_url = documentUrl
  if (status !== undefined) data.status = status
  if (notes !== undefined) data.notes = notes

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }
  if (SKIP_DB) return res.json({ id: req.params.id, ...req.body })
  try {
    const row = await prisma.admin_engagements.update({
      where: { id: req.params.id },
      data,
      include: { team_member: true, entity: true },
    })
    res.json(mapAdminEngagement(row))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Engagement not found' })
    res.status(500).json({ error: 'Failed to update engagement', details: err.message })
  }
})

// DELETE engagement
router.delete('/admin/engagements/:id', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json({ success: true })
  try {
    await prisma.admin_engagements.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Engagement not found' })
    res.status(500).json({ error: 'Failed to delete engagement', details: err.message })
  }
})

// ---- TEAM MEMBER PAYMENTS ROUTES ----

const mapAdminTeamMemberPayment = (row) => ({
  id: row.id,
  teamMemberId: row.team_member_id,
  invoiceUrl: row.invoice_url,
  amountUsd: toNumber(row.amount_usd),
  invoiceDate: row.invoice_date?.toISOString().split('T')[0] || null,
  paymentDate: row.payment_date?.toISOString().split('T')[0] || null,
  notes: row.notes,
  ownerId: row.owner_id,
  createdAt: row.created_at.toISOString(),
})

// GET payments for a team member
router.get('/admin/team-members/:id/payments', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json([])
  try {
    const rows = await prisma.admin_team_member_payments.findMany({
      where: { team_member_id: req.params.id, owner_id: req.user.id },
      orderBy: { payment_date: 'desc' },
    })
    res.json(rows.map(mapAdminTeamMemberPayment))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments', details: err.message })
  }
})

// POST create payment
router.post('/admin/team-member-payments', requireSuperAdmin, async (req, res) => {
  const { teamMemberId, invoiceUrl, amountUsd, invoiceDate, paymentDate, notes } = req.body
  if (!teamMemberId || amountUsd === undefined || !paymentDate) {
    return res.status(400).json({ error: 'teamMemberId, amountUsd, and paymentDate are required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `payment-${Date.now()}`,
      teamMemberId,
      invoiceUrl: invoiceUrl || null,
      amountUsd,
      invoiceDate: invoiceDate || null,
      paymentDate,
      notes: notes || null,
      ownerId: 'stub-user',
      createdAt: new Date().toISOString(),
    })
  }
  try {
    const row = await prisma.admin_team_member_payments.create({
      data: {
        team_member_id: teamMemberId,
        invoice_url: invoiceUrl || null,
        amount_usd: amountUsd,
        invoice_date: invoiceDate ? new Date(invoiceDate) : null,
        payment_date: new Date(paymentDate),
        notes: notes || null,
        owner_id: req.user.id,
      },
    })
    res.status(201).json(mapAdminTeamMemberPayment(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create payment', details: err.message })
  }
})

// PATCH update payment
router.patch('/admin/team-member-payments/:id', requireSuperAdmin, async (req, res) => {
  const { invoiceUrl, amountUsd, invoiceDate, paymentDate, notes } = req.body
  const data = {}
  if (invoiceUrl !== undefined) data.invoice_url = invoiceUrl || null
  if (amountUsd !== undefined) data.amount_usd = amountUsd
  if (invoiceDate !== undefined) data.invoice_date = invoiceDate ? new Date(invoiceDate) : null
  if (paymentDate !== undefined) data.payment_date = new Date(paymentDate)
  if (notes !== undefined) data.notes = notes || null

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }
  if (SKIP_DB) return res.json({ id: req.params.id, ...req.body })
  try {
    const row = await prisma.admin_team_member_payments.update({
      where: { id: req.params.id },
      data,
    })
    res.json(mapAdminTeamMemberPayment(row))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Payment not found' })
    res.status(500).json({ error: 'Failed to update payment', details: err.message })
  }
})

// DELETE payment
router.delete('/admin/team-member-payments/:id', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json({ success: true })
  try {
    await prisma.admin_team_member_payments.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Payment not found' })
    res.status(500).json({ error: 'Failed to delete payment', details: err.message })
  }
})

// ---- ENTITY DOCUMENTS ROUTES ----

// GET documents for an entity
router.get('/admin/entities/:entityId/documents', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json([])
  try {
    const rows = await prisma.admin_entity_documents.findMany({
      where: { entity_id: req.params.entityId },
      orderBy: [{ year: 'desc' }, { created_at: 'desc' }],
    })
    res.json(rows.map(mapAdminEntityDocument))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents', details: err.message })
  }
})

// GET all documents (for Document Library)
router.get('/admin/entity-documents', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json([])
  try {
    const rows = await prisma.admin_entity_documents.findMany({
      include: { entity: true },
      orderBy: [{ entity_id: 'asc' }, { year: 'desc' }],
    })
    res.json(rows.map(mapAdminEntityDocument))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents', details: err.message })
  }
})

// POST create entity document
router.post('/admin/entity-documents', requireSuperAdmin, async (req, res) => {
  const { entityId, documentType, name, fileUrl, year, notes } = req.body
  if (!entityId || !documentType || !name || !fileUrl) {
    return res.status(400).json({ error: 'entityId, documentType, name, and fileUrl are required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `doc-${Date.now()}`,
      entityId, documentType, name, fileUrl, year, notes, uploadedBy: 'stub-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  try {
    const row = await prisma.admin_entity_documents.create({
      data: {
        entity_id: entityId,
        document_type: documentType,
        name,
        file_url: fileUrl,
        year: year || null,
        notes: notes || null,
        uploaded_by: req.user.id,
      },
      include: { entity: true },
    })
    res.status(201).json(mapAdminEntityDocument(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create document', details: err.message })
  }
})

// PATCH update entity document
router.patch('/admin/entity-documents/:id', requireSuperAdmin, async (req, res) => {
  const { documentType, name, fileUrl, year, notes } = req.body
  const data = {}
  if (documentType !== undefined) data.document_type = documentType
  if (name !== undefined) data.name = name
  if (fileUrl !== undefined) data.file_url = fileUrl
  if (year !== undefined) data.year = year
  if (notes !== undefined) data.notes = notes

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }
  if (SKIP_DB) return res.json({ id: req.params.id, ...req.body })
  try {
    const row = await prisma.admin_entity_documents.update({
      where: { id: req.params.id },
      data,
      include: { entity: true },
    })
    res.json(mapAdminEntityDocument(row))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Document not found' })
    res.status(500).json({ error: 'Failed to update document', details: err.message })
  }
})

// DELETE entity document
router.delete('/admin/entity-documents/:id', requireSuperAdmin, async (req, res) => {
  if (SKIP_DB) return res.json({ success: true })
  try {
    await prisma.admin_entity_documents.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Document not found' })
    res.status(500).json({ error: 'Failed to delete document', details: err.message })
  }
})

// ============================================
// TRIPS ROUTES
// ============================================

const mapTrip = (row) => ({
  id: row.id,
  name: row.name,
  destination: row.destination,
  startDate: row.start_date?.toISOString().split('T')[0] || null,
  endDate: row.end_date?.toISOString().split('T')[0] || null,
  quarter: row.quarter,
  ownerId: row.owner_id,
  ownerName: row.owner?.display_name || row.owner?.email || 'Unknown',
  ownerEmail: row.owner?.email || '',
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  collaborators: Array.isArray(row.collaborators)
    ? row.collaborators.map((c) => ({
        id: c.id,
        email: c.user?.email,
        displayName: c.user?.display_name,
      }))
    : [],
})

// GET all trips for current user (owned or collaborator)
router.get('/trips', async (req, res) => {
  if (SKIP_DB) {
    return res.json([])
  }
  try {
    const rows = await prisma.trips.findMany({
      where: {
        OR: [
          { owner_id: req.user.id },
          { collaborators: { some: { user_id: req.user.id } } },
        ],
      },
      orderBy: [{ quarter: 'asc' }, { start_date: 'asc' }],
      include: {
        owner: { select: { id: true, email: true, display_name: true } },
        collaborators: {
          include: { user: { select: { id: true, email: true, display_name: true } } },
        },
      },
    })
    res.json(rows.map(mapTrip))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trips', details: err.message })
  }
})

// POST create trip
router.post('/trips', async (req, res) => {
  const { name, destination, startDate, endDate, quarter } = req.body
  if (!name || !quarter) {
    return res.status(400).json({ error: 'name and quarter are required' })
  }
  if (SKIP_DB) {
    return res.status(201).json({
      id: `trip-${Date.now()}`,
      name,
      destination: destination || null,
      startDate: startDate || null,
      endDate: endDate || null,
      quarter,
      ownerId: 'stub-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  try {
    const row = await prisma.trips.create({
      data: {
        name,
        destination: destination || null,
        start_date: startDate ? new Date(startDate) : null,
        end_date: endDate ? new Date(endDate) : null,
        quarter,
        owner_id: req.user.id,
      },
    })
    res.status(201).json(mapTrip(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create trip', details: err.message })
  }
})

// PUT update trip
router.put('/trips/:id', async (req, res) => {
  const { name, destination, startDate, endDate, quarter } = req.body
  const data = {}
  if (name !== undefined) data.name = name
  if (destination !== undefined) data.destination = destination || null
  if (startDate !== undefined) data.start_date = startDate ? new Date(startDate) : null
  if (endDate !== undefined) data.end_date = endDate ? new Date(endDate) : null
  if (quarter !== undefined) data.quarter = quarter

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }
  if (SKIP_DB) {
    return res.json({ id: req.params.id, ...req.body })
  }
  try {
    // Verify ownership
    const existing = await prisma.trips.findFirst({
      where: { id: req.params.id, owner_id: req.user.id },
    })
    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    const row = await prisma.trips.update({
      where: { id: req.params.id },
      data,
    })
    res.json(mapTrip(row))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Trip not found' })
    res.status(500).json({ error: 'Failed to update trip', details: err.message })
  }
})

// DELETE trip
router.delete('/trips/:id', async (req, res) => {
  if (SKIP_DB) return res.json({ success: true })
  try {
    // Verify ownership
    const existing = await prisma.trips.findFirst({
      where: { id: req.params.id, owner_id: req.user.id },
    })
    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    await prisma.trips.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Trip not found' })
    res.status(500).json({ error: 'Failed to delete trip', details: err.message })
  }
})

// ============================================
// TRIP COLLABORATORS ROUTES
// ============================================

const mapTripCollaborator = (row) => ({
  id: row.id,
  tripId: row.trip_id,
  userId: row.user_id,
  email: row.user?.email,
  displayName: row.user?.display_name,
  createdAt: row.created_at?.toISOString(),
})

const fetchTripCollaborators = (tripId) =>
  prisma.trip_collaborators.findMany({
    where: { trip_id: tripId },
    orderBy: { created_at: 'asc' },
    include: {
      user: {
        select: { id: true, email: true, display_name: true },
      },
    },
  })

const canManageTripCollaborators = (user, trip) => {
  if (user?.isSuperAdmin) return true
  if (!trip?.owner_id) return false
  return canUseUserId(user) && trip.owner_id === user.id
}

// GET trip collaborators
router.get('/trips/:tripId/collaborators', async (req, res) => {
  if (SKIP_DB) return res.json([])
  try {
    // Verify trip access
    const trip = await prisma.trips.findFirst({
      where: { id: req.params.tripId, owner_id: req.user.id },
    })
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    const rows = await fetchTripCollaborators(req.params.tripId)
    res.json(rows.map(mapTripCollaborator))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load trip collaborators', details: err.message })
  }
})

// POST add trip collaborator
router.post('/trips/:tripId/collaborators', async (req, res) => {
  if (SKIP_DB) return res.status(201).json([])
  try {
    const trip = await prisma.trips.findFirst({
      where: { id: req.params.tripId },
    })
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    if (!canManageTripCollaborators(req.user, trip)) {
      return res.status(403).json({ error: 'Only owners or super admins can manage collaborators' })
    }
    const email = normalizeEmail(req.body?.email)
    if (!email) {
      return res.status(400).json({ error: 'email is required' })
    }
    const user = await prisma.users.findUnique({
      where: { email },
      select: { id: true, email: true, display_name: true },
    })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    if (user.id === trip.owner_id) {
      return res.status(400).json({ error: 'Owner already has access' })
    }
    const existing = await prisma.trip_collaborators.findFirst({
      where: { trip_id: trip.id, user_id: user.id },
    })
    if (existing) {
      return res.status(400).json({ error: 'User already added to this trip' })
    }
    await prisma.trip_collaborators.create({
      data: {
        trip_id: trip.id,
        user_id: user.id,
      },
    })
    const collaborators = await fetchTripCollaborators(trip.id)
    res.status(201).json(collaborators.map(mapTripCollaborator))
  } catch (err) {
    res.status(500).json({ error: 'Failed to add collaborator', details: err.message })
  }
})

// DELETE trip collaborator
router.delete('/trips/:tripId/collaborators/:collaboratorId', async (req, res) => {
  if (SKIP_DB) return res.json([])
  try {
    const trip = await prisma.trips.findFirst({
      where: { id: req.params.tripId },
    })
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    if (!canManageTripCollaborators(req.user, trip)) {
      return res.status(403).json({ error: 'Only owners or super admins can manage collaborators' })
    }
    const collaborator = await prisma.trip_collaborators.findFirst({
      where: { id: req.params.collaboratorId, trip_id: trip.id },
    })
    if (!collaborator) {
      return res.status(404).json({ error: 'Collaborator not found' })
    }
    await prisma.trip_collaborators.delete({ where: { id: collaborator.id } })
    const collaborators = await fetchTripCollaborators(trip.id)
    res.json(collaborators.map(mapTripCollaborator))
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove collaborator', details: err.message })
  }
})

// ============================================
// TRIP ITEMS ROUTES
// ============================================

const mapTripItem = (row) => ({
  id: row.id,
  tripId: row.trip_id,
  itemType: row.item_type,
  name: row.name,
  location: row.location,
  confirmationNo: row.confirmation_no,
  bookingUrl: row.booking_url,
  notes: row.notes,
  costUsd: row.cost_usd != null ? Number(row.cost_usd) : null,
  startDate: row.start_date?.toISOString().split('T')[0] || null,
  startTime: row.start_time,
  endDate: row.end_date?.toISOString().split('T')[0] || null,
  endTime: row.end_time,
  departTime: row.depart_time,
  arriveTime: row.arrive_time,
  sortOrder: row.sort_order,
  ownerId: row.owner_id,
  createdAt: row.created_at?.toISOString(),
})

// GET all items for a trip
router.get('/trips/:tripId/items', async (req, res) => {
  if (SKIP_DB) return res.json([])
  try {
    // Verify trip ownership
    const trip = await prisma.trips.findFirst({
      where: { id: req.params.tripId, owner_id: req.user.id },
    })
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    const rows = await prisma.trip_items.findMany({
      where: { trip_id: req.params.tripId },
      orderBy: [{ start_date: 'asc' }, { start_time: 'asc' }, { sort_order: 'asc' }],
    })
    res.json(rows.map(mapTripItem))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trip items', details: err.message })
  }
})

// POST create trip item
router.post('/trips/:tripId/items', async (req, res) => {
  if (SKIP_DB) return res.status(201).json({ id: 'stub-trip-item', ...req.body })
  try {
    // Verify trip ownership
    const trip = await prisma.trips.findFirst({
      where: { id: req.params.tripId, owner_id: req.user.id },
    })
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    const {
      itemType,
      name,
      location,
      confirmationNo,
      bookingUrl,
      notes,
      costUsd,
      startDate,
      startTime,
      endDate,
      endTime,
      departTime,
      arriveTime,
      sortOrder,
    } = req.body
    if (!itemType || !name || !startDate) {
      return res.status(400).json({ error: 'itemType, name, and startDate are required' })
    }
    // Get max sort_order for this trip
    const maxSortItem = await prisma.trip_items.findFirst({
      where: { trip_id: req.params.tripId },
      orderBy: { sort_order: 'desc' },
    })
    const nextSortOrder = sortOrder ?? ((maxSortItem?.sort_order ?? -1) + 1)
    const row = await prisma.trip_items.create({
      data: {
        trip_id: req.params.tripId,
        item_type: itemType,
        name,
        location: location || null,
        confirmation_no: confirmationNo || null,
        booking_url: bookingUrl || null,
        notes: notes || null,
        cost_usd: costUsd != null ? costUsd : null,
        start_date: new Date(startDate),
        start_time: startTime || null,
        end_date: endDate ? new Date(endDate) : null,
        end_time: endTime || null,
        depart_time: departTime || null,
        arrive_time: arriveTime || null,
        sort_order: nextSortOrder,
        owner_id: req.user.id,
      },
    })
    res.status(201).json(mapTripItem(row))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create trip item', details: err.message })
  }
})

// PUT update trip item
router.put('/trip-items/:id', async (req, res) => {
  if (SKIP_DB) return res.json({ id: req.params.id, ...req.body })
  try {
    // Verify ownership via trip
    const existing = await prisma.trip_items.findFirst({
      where: { id: req.params.id },
      include: { trip: true },
    })
    if (!existing || existing.trip.owner_id !== req.user.id) {
      return res.status(404).json({ error: 'Trip item not found' })
    }
    const {
      itemType,
      name,
      location,
      confirmationNo,
      bookingUrl,
      notes,
      costUsd,
      startDate,
      startTime,
      endDate,
      endTime,
      departTime,
      arriveTime,
      sortOrder,
    } = req.body
    const data = {}
    if (itemType !== undefined) data.item_type = itemType
    if (name !== undefined) data.name = name
    if (location !== undefined) data.location = location || null
    if (confirmationNo !== undefined) data.confirmation_no = confirmationNo || null
    if (bookingUrl !== undefined) data.booking_url = bookingUrl || null
    if (notes !== undefined) data.notes = notes || null
    if (costUsd !== undefined) data.cost_usd = costUsd
    if (startDate !== undefined) data.start_date = new Date(startDate)
    if (startTime !== undefined) data.start_time = startTime || null
    if (endDate !== undefined) data.end_date = endDate ? new Date(endDate) : null
    if (endTime !== undefined) data.end_time = endTime || null
    if (departTime !== undefined) data.depart_time = departTime || null
    if (arriveTime !== undefined) data.arrive_time = arriveTime || null
    if (sortOrder !== undefined) data.sort_order = sortOrder
    const row = await prisma.trip_items.update({
      where: { id: req.params.id },
      data,
    })
    res.json(mapTripItem(row))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Trip item not found' })
    res.status(500).json({ error: 'Failed to update trip item', details: err.message })
  }
})

// DELETE trip item
router.delete('/trip-items/:id', async (req, res) => {
  if (SKIP_DB) return res.json({ success: true })
  try {
    // Verify ownership via trip
    const existing = await prisma.trip_items.findFirst({
      where: { id: req.params.id },
      include: { trip: true },
    })
    if (!existing || existing.trip.owner_id !== req.user.id) {
      return res.status(404).json({ error: 'Trip item not found' })
    }
    await prisma.trip_items.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Trip item not found' })
    res.status(500).json({ error: 'Failed to delete trip item', details: err.message })
  }
})

// PUT reorder trip items
router.put('/trips/:tripId/items/reorder', async (req, res) => {
  if (SKIP_DB) return res.json({ success: true })
  try {
    // Verify trip ownership
    const trip = await prisma.trips.findFirst({
      where: { id: req.params.tripId, owner_id: req.user.id },
    })
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    const { items } = req.body // Array of { id, sortOrder }
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' })
    }
    // Update all items in a transaction
    await prisma.$transaction(
      items.map(({ id, sortOrder }) =>
        prisma.trip_items.update({
          where: { id },
          data: { sort_order: sortOrder },
        })
      )
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to reorder items', details: err.message })
  }
})

// ============================================
// LIFE INSURANCE POLICIES
// ============================================

const stubLifeInsurancePolicy = {
  id: 'stub-li-1',
  policyNumber: 'POL-12345',
  carrier: 'Northwestern Mutual',
  faceAmount: 500000,
  issueDate: '2020-01-01',
  insuredName: 'John Doe',
  insuredDob: '1985-06-15',
  insuredSex: 'male',
  healthClass: 'standard',
  annualPremium: 8500,
  premiumPaymentYears: 20,
  guaranteedRate: 0.04,
  isParticipating: true,
  dividendRate: 0.05,
  dividendOption: 'paid_up_additions',
  loanInterestRate: 0.06,
  notes: null,
  ownerId: 'stub-user',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// Mortality rates per 1000 (2017 CSO approximation, extended for all ages)
// Children and young adults have very low mortality rates
const MORTALITY_RATES = {
  0: 0.58, 1: 0.39, 5: 0.14, 10: 0.10, 15: 0.28, 18: 0.38, 20: 0.42,
  25: 0.49, 30: 0.61, 35: 0.78, 40: 1.09, 45: 1.71, 50: 2.88,
  55: 4.96, 60: 7.96, 65: 12.51, 70: 19.89, 75: 32.36, 80: 53.88,
  85: 89.54, 90: 148.93, 95: 234.62, 100: 1000
}

function getMortalityRate(age) {
  const ages = Object.keys(MORTALITY_RATES).map(Number).sort((a, b) => a - b)
  if (age <= ages[0]) return MORTALITY_RATES[ages[0]]
  if (age >= ages[ages.length - 1]) return MORTALITY_RATES[ages[ages.length - 1]]
  // Linear interpolation
  for (let i = 0; i < ages.length - 1; i++) {
    if (age >= ages[i] && age < ages[i + 1]) {
      const ratio = (age - ages[i]) / (ages[i + 1] - ages[i])
      return MORTALITY_RATES[ages[i]] + ratio * (MORTALITY_RATES[ages[i + 1]] - MORTALITY_RATES[ages[i]])
    }
  }
  return MORTALITY_RATES[50]
}

// Cash value factor by policy year
function getCvFactor(year) {
  if (year === 1) return 0.10
  if (year === 2) return 0.55
  if (year === 3) return 0.65
  if (year === 4) return 0.70
  if (year === 5) return 0.72
  if (year <= 10) return 0.75
  if (year <= 20) return 0.78
  return 0.80
}

// 7-Pay limit per $1000 face amount by issue age (IRS guideline premium limits)
// Young ages have HIGHER limits (more permissive) due to low mortality
// Based on Section 7702A and actuarial guideline standards
const SEVEN_PAY_RATES = {
  // Children: Very high limits - can fund aggressively
  0: 74.00, 5: 58.00, 10: 45.00, 15: 32.00, 
  // Young adults: Gradually decreasing
  18: 22.00, 20: 17.50, 
  // Adults: Standard progression
  25: 12.50, 30: 13.80, 35: 15.40, 40: 17.50, 45: 20.20, 50: 23.80,
  55: 28.50, 60: 35.00, 65: 44.00, 70: 56.00, 75: 72.00, 80: 95.00, 85: 125.00
}

function getSevenPayRate(issueAge) {
  const ages = Object.keys(SEVEN_PAY_RATES).map(Number).sort((a, b) => a - b)
  if (issueAge <= ages[0]) return SEVEN_PAY_RATES[ages[0]]
  if (issueAge >= ages[ages.length - 1]) return SEVEN_PAY_RATES[ages[ages.length - 1]]
  for (let i = 0; i < ages.length - 1; i++) {
    if (issueAge >= ages[i] && issueAge < ages[i + 1]) {
      const ratio = (issueAge - ages[i]) / (ages[i + 1] - ages[i])
      return SEVEN_PAY_RATES[ages[i]] + ratio * (SEVEN_PAY_RATES[ages[i + 1]] - SEVEN_PAY_RATES[ages[i]])
    }
  }
  return SEVEN_PAY_RATES[40]
}

// Generate year-over-year projections
function generateProjections(policy, withdrawals = []) {
  const issueAge = policy.insuredDob 
    ? Math.floor((new Date(policy.issueDate) - new Date(policy.insuredDob)) / (365.25 * 24 * 60 * 60 * 1000))
    : 35
  
  const faceAmount = Number(policy.faceAmount)
  const annualPremium = Number(policy.annualPremium)
  const premiumYears = policy.premiumPaymentYears
  const guaranteedRate = Number(policy.guaranteedRate) || 0.04
  const dividendRate = policy.isParticipating ? (Number(policy.dividendRate) || 0.05) : 0
  const loanRate = Number(policy.loanInterestRate) || 0.06
  
  // 7-pay limit calculation
  const sevenPayRate = getSevenPayRate(issueAge)
  const annualSevenPayLimit = (faceAmount / 1000) * sevenPayRate
  
  // Build withdrawal schedule by age
  const withdrawalsByAge = {}
  withdrawals.forEach(w => {
    for (let y = 0; y < w.years; y++) {
      const age = w.startAge + y
      withdrawalsByAge[age] = (withdrawalsByAge[age] || 0) + Number(w.annualAmount)
    }
  })
  
  const projections = []
  let cashValue = 0
  let cumulativePremium = 0
  let loanBalance = 0
  let puaCashValue = 0
  let puaDeathBenefit = 0
  
  // Project until age 100
  const projectionYears = 100 - issueAge
  
  for (let year = 1; year <= projectionYears; year++) {
    const age = issueAge + year - 1
    const isPremiumYear = year <= premiumYears
    const premium = isPremiumYear ? annualPremium : 0
    cumulativePremium += premium
    
    // Calculate COI
    const mortalityRate = getMortalityRate(age)
    const netAmountAtRisk = Math.max(0, faceAmount + puaDeathBenefit - cashValue - puaCashValue)
    const coi = (netAmountAtRisk * mortalityRate) / 1000
    
    // Cash value contribution from premium
    const cvFactor = getCvFactor(year)
    const premiumContribution = premium * cvFactor
    
    // Expenses (what's left after CV contribution and before COI is applied)
    const expenseRatio = 1 - cvFactor
    const expenses = premium * expenseRatio
    
    // Interest on existing cash value
    const interest = cashValue * guaranteedRate
    
    // Dividends (if participating)
    const dividend = (cashValue + puaCashValue) * dividendRate
    
    // New cash value
    cashValue = Math.max(0, cashValue + premiumContribution + interest - coi)
    
    // PUAs from dividends
    if (dividend > 0 && policy.dividendOption === 'paid_up_additions') {
      puaCashValue += dividend * 0.85 // Approximate PUA cash value
      puaDeathBenefit += dividend * 2.5 // Approximate PUA death benefit multiplier
    }
    
    // Handle withdrawals/loans for this age
    const withdrawalAmount = withdrawalsByAge[age] || 0
    if (withdrawalAmount > 0) {
      loanBalance += withdrawalAmount
    }
    
    // Loan interest compounds
    if (loanBalance > 0) {
      loanBalance *= (1 + loanRate)
    }
    
    // MEC test
    const sevenPayLimit = annualSevenPayLimit * Math.min(year, 7)
    const isMec = cumulativePremium > sevenPayLimit
    
    // Net values
    const totalCashValue = cashValue + puaCashValue
    const totalDeathBenefit = faceAmount + puaDeathBenefit
    const netCashValue = totalCashValue - loanBalance
    const netDeathBenefit = totalDeathBenefit - loanBalance
    
    // Check for lapse
    if (loanBalance > totalCashValue * 0.95) {
      projections.push({
        policyYear: year,
        age,
        premium,
        cumulativePremium,
        // Premium allocation breakdown
        premiumToCv: premiumContribution,
        premiumToCoi: coi,
        premiumToExpenses: expenses,
        interestEarned: interest,
        // Values
        cashValue: totalCashValue,
        surrenderValue: Math.max(0, netCashValue),
        deathBenefit: totalDeathBenefit,
        puaCashValue,
        puaDeathBenefit,
        dividendAmount: dividend,
        // PUA breakdown (from dividends)
        puaDividendToCv: dividend > 0 && policy.dividendOption === 'paid_up_additions' ? dividend * 0.85 : 0,
        puaDividendToDb: dividend > 0 && policy.dividendOption === 'paid_up_additions' ? dividend * 2.5 : 0,
        sevenPayLimit,
        isMec,
        loanBalance,
        netCashValue,
        netDeathBenefit,
        lapsed: true,
        lapseReason: 'Loan balance exceeds cash value'
      })
      break
    }
    
    projections.push({
      policyYear: year,
      age,
      premium,
      cumulativePremium,
      // Premium allocation breakdown
      premiumToCv: premiumContribution,
      premiumToCoi: coi,
      premiumToExpenses: expenses,
      interestEarned: interest,
      // Values
      cashValue: totalCashValue,
      surrenderValue: Math.max(0, netCashValue),
      deathBenefit: totalDeathBenefit,
      puaCashValue,
      puaDeathBenefit,
      dividendAmount: dividend,
      // PUA breakdown (from dividends)
      puaDividendToCv: dividend > 0 && policy.dividendOption === 'paid_up_additions' ? dividend * 0.85 : 0,
      puaDividendToDb: dividend > 0 && policy.dividendOption === 'paid_up_additions' ? dividend * 2.5 : 0,
      sevenPayLimit,
      isMec,
      loanBalance,
      netCashValue,
      netDeathBenefit,
      lapsed: false
    })
  }
  
  return projections
}

function transformPolicy(row) {
  return {
    id: row.id,
    policyNumber: row.policy_number,
    carrier: row.carrier,
    faceAmount: row.face_amount,
    issueDate: row.issue_date,
    insuredName: row.insured_name,
    insuredDob: row.insured_dob,
    insuredSex: row.insured_sex,
    healthClass: row.health_class,
    annualPremium: row.annual_premium,
    premiumPaymentYears: row.premium_payment_years,
    guaranteedRate: row.guaranteed_rate,
    isParticipating: row.is_participating,
    dividendRate: row.dividend_rate,
    dividendOption: row.dividend_option,
    loanInterestRate: row.loan_interest_rate,
    notes: row.notes,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    withdrawals: row.withdrawals?.map(w => ({
      id: w.id,
      startAge: w.start_age,
      annualAmount: w.annual_amount,
      years: w.years,
      withdrawalType: w.withdrawal_type,
    })) || [],
  }
}

// List all life insurance policies
router.get('/life-insurance', async (req, res) => {
  if (SKIP_DB) {
    return res.json([stubLifeInsurancePolicy])
  }
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    
    const policies = await prisma.life_insurance_policies.findMany({
      where: {
        owner_id: userId,
        deleted_at: null,
      },
      include: {
        withdrawals: true,
      },
      orderBy: { created_at: 'desc' },
    })
    
    res.json(policies.map(transformPolicy))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch policies', details: err.message })
  }
})

// Get life insurance policy detail with projections
router.get('/life-insurance/:id', async (req, res) => {
  if (SKIP_DB) {
    const projections = generateProjections(stubLifeInsurancePolicy, [])
    return res.json({ ...stubLifeInsurancePolicy, projections })
  }
  try {
    const userId = req.user?.id
    const policy = await prisma.life_insurance_policies.findFirst({
      where: {
        id: req.params.id,
        owner_id: userId,
        deleted_at: null,
      },
      include: {
        withdrawals: true,
      },
    })
    
    if (!policy) {
      return res.status(404).json({ error: 'Policy not found' })
    }
    
    const transformed = transformPolicy(policy)
    const projections = generateProjections(transformed, transformed.withdrawals)
    
    res.json({ ...transformed, projections })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch policy', details: err.message })
  }
})

// Create life insurance policy
router.post('/life-insurance', async (req, res) => {
  const {
    policyNumber, carrier, faceAmount, issueDate, insuredName, insuredDob,
    insuredSex, healthClass, annualPremium, premiumPaymentYears,
    guaranteedRate, isParticipating, dividendRate, dividendOption,
    loanInterestRate, notes
  } = req.body || {}
  
  if (!faceAmount || !issueDate || !insuredDob || !insuredSex || !healthClass || !annualPremium || !premiumPaymentYears) {
    return res.status(400).json({ error: 'Missing required fields: faceAmount, issueDate, insuredDob, insuredSex, healthClass, annualPremium, premiumPaymentYears' })
  }
  
  if (SKIP_DB) {
    return res.status(201).json({
      ...stubLifeInsurancePolicy,
      id: `stub-li-${Date.now()}`,
      policyNumber,
      carrier,
      faceAmount,
    })
  }
  
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    
    const policy = await prisma.life_insurance_policies.create({
      data: {
        policy_number: policyNumber || null,
        carrier: carrier || null,
        face_amount: faceAmount,
        issue_date: new Date(issueDate),
        insured_name: insuredName || null,
        insured_dob: new Date(insuredDob),
        insured_sex: insuredSex,
        health_class: healthClass,
        annual_premium: annualPremium,
        premium_payment_years: premiumPaymentYears,
        guaranteed_rate: guaranteedRate || 0.04,
        is_participating: isParticipating !== false,
        dividend_rate: dividendRate || null,
        dividend_option: dividendOption || 'paid_up_additions',
        loan_interest_rate: loanInterestRate || 0.06,
        notes: notes || null,
        owner_id: userId,
      },
      include: {
        withdrawals: true,
      },
    })
    
    res.status(201).json(transformPolicy(policy))
  } catch (err) {
    res.status(500).json({ error: 'Failed to create policy', details: err.message })
  }
})

// Update life insurance policy
router.patch('/life-insurance/:id', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ ...stubLifeInsurancePolicy, ...req.body })
  }
  
  try {
    const userId = req.user?.id
    const existing = await prisma.life_insurance_policies.findFirst({
      where: {
        id: req.params.id,
        owner_id: userId,
        deleted_at: null,
      },
    })
    
    if (!existing) {
      return res.status(404).json({ error: 'Policy not found' })
    }
    
    const updateData = {}
    const {
      policyNumber, carrier, faceAmount, issueDate, insuredName, insuredDob,
      insuredSex, healthClass, annualPremium, premiumPaymentYears,
      guaranteedRate, isParticipating, dividendRate, dividendOption,
      loanInterestRate, notes
    } = req.body
    
    if (policyNumber !== undefined) updateData.policy_number = policyNumber
    if (carrier !== undefined) updateData.carrier = carrier
    if (faceAmount !== undefined) updateData.face_amount = faceAmount
    if (issueDate !== undefined) updateData.issue_date = new Date(issueDate)
    if (insuredName !== undefined) updateData.insured_name = insuredName
    if (insuredDob !== undefined) updateData.insured_dob = insuredDob ? new Date(insuredDob) : null
    if (insuredSex !== undefined) updateData.insured_sex = insuredSex
    if (healthClass !== undefined) updateData.health_class = healthClass
    if (annualPremium !== undefined) updateData.annual_premium = annualPremium
    if (premiumPaymentYears !== undefined) updateData.premium_payment_years = premiumPaymentYears
    if (guaranteedRate !== undefined) updateData.guaranteed_rate = guaranteedRate
    if (isParticipating !== undefined) updateData.is_participating = isParticipating
    if (dividendRate !== undefined) updateData.dividend_rate = dividendRate
    if (dividendOption !== undefined) updateData.dividend_option = dividendOption
    if (loanInterestRate !== undefined) updateData.loan_interest_rate = loanInterestRate
    if (notes !== undefined) updateData.notes = notes
    
    const updated = await prisma.life_insurance_policies.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        withdrawals: true,
      },
    })
    
    res.json(transformPolicy(updated))
  } catch (err) {
    res.status(500).json({ error: 'Failed to update policy', details: err.message })
  }
})

// Delete life insurance policy (soft delete)
router.delete('/life-insurance/:id', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ success: true })
  }
  
  try {
    const userId = req.user?.id
    const existing = await prisma.life_insurance_policies.findFirst({
      where: {
        id: req.params.id,
        owner_id: userId,
        deleted_at: null,
      },
    })
    
    if (!existing) {
      return res.status(404).json({ error: 'Policy not found' })
    }
    
    await prisma.life_insurance_policies.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    })
    
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete policy', details: err.message })
  }
})

// Add withdrawal schedule to policy
router.post('/life-insurance/:id/withdrawals', async (req, res) => {
  const { startAge, annualAmount, years, withdrawalType } = req.body || {}
  
  if (!startAge || !annualAmount || !years) {
    return res.status(400).json({ error: 'startAge, annualAmount, and years are required' })
  }
  
  if (SKIP_DB) {
    return res.status(201).json({
      id: `stub-w-${Date.now()}`,
      startAge,
      annualAmount,
      years,
      withdrawalType: withdrawalType || 'loan',
    })
  }
  
  try {
    const userId = req.user?.id
    const policy = await prisma.life_insurance_policies.findFirst({
      where: {
        id: req.params.id,
        owner_id: userId,
        deleted_at: null,
      },
    })
    
    if (!policy) {
      return res.status(404).json({ error: 'Policy not found' })
    }
    
    const withdrawal = await prisma.life_insurance_withdrawals.create({
      data: {
        policy_id: req.params.id,
        start_age: startAge,
        annual_amount: annualAmount,
        years,
        withdrawal_type: withdrawalType || 'loan',
      },
    })
    
    res.status(201).json({
      id: withdrawal.id,
      startAge: withdrawal.start_age,
      annualAmount: withdrawal.annual_amount,
      years: withdrawal.years,
      withdrawalType: withdrawal.withdrawal_type,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to add withdrawal', details: err.message })
  }
})

// Delete withdrawal from policy
router.delete('/life-insurance/:id/withdrawals/:withdrawalId', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ success: true })
  }
  
  try {
    const userId = req.user?.id
    const policy = await prisma.life_insurance_policies.findFirst({
      where: {
        id: req.params.id,
        owner_id: userId,
        deleted_at: null,
      },
    })
    
    if (!policy) {
      return res.status(404).json({ error: 'Policy not found' })
    }
    
    await prisma.life_insurance_withdrawals.delete({
      where: { id: req.params.withdrawalId },
    })
    
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete withdrawal', details: err.message })
  }
})

// Get policy count for dashboard
router.get('/life-insurance-count', async (req, res) => {
  if (SKIP_DB) {
    return res.json({ count: 1 })
  }
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.json({ count: 0 })
    }
    
    const count = await prisma.life_insurance_policies.count({
      where: {
        owner_id: userId,
        deleted_at: null,
      },
    })
    
    res.json({ count })
  } catch (err) {
    res.json({ count: 0 })
  }
})

export default router
