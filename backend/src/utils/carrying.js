import { coerceInt, coerceNumberStrict } from './dataTransforms.js'

export const CARRYING_TYPES = ['loan', 'property_tax', 'management']
export const LOAN_MODES = ['interest_only', 'amortizing']
export const INTERVAL_UNITS = ['monthly', 'quarterly', 'yearly']
export const PROPERTY_TAX_PHASES = ['construction', 'stabilized']

const PROPERTY_TAX_PREFIX = 'property_tax_'

const defaultCarryingTitles = {
  loan: 'Loan',
  property_tax: 'Property Tax',
  management: 'Management Fee',
}

const propertyTaxTitles = {
  construction: 'Construction RE Tax',
  stabilized: 'Stabilized RE Tax',
}

export const encodePropertyTaxGroup = (phase) =>
  PROPERTY_TAX_PHASES.includes(phase) ? `${PROPERTY_TAX_PREFIX}${phase}` : 'property_tax'

export const decodePropertyTaxPhase = (costGroup) => {
  if (!costGroup || typeof costGroup !== 'string') return null
  if (!costGroup.startsWith(PROPERTY_TAX_PREFIX)) return null
  const phase = costGroup.slice(PROPERTY_TAX_PREFIX.length)
  return PROPERTY_TAX_PHASES.includes(phase) ? phase : null
}

const resolveDefaultTitle = (carryingType, propertyTaxPhase) => {
  if (carryingType === 'property_tax' && propertyTaxPhase && propertyTaxTitles[propertyTaxPhase]) {
    return propertyTaxTitles[propertyTaxPhase]
  }
  return defaultCarryingTitles[carryingType] || 'Carrying Cost'
}

export function normalizeCarryingPayload(body) {
  const carryingType = (body.carryingType || body.type || '').toLowerCase()
  if (!CARRYING_TYPES.includes(carryingType)) {
    return { error: 'carryingType is invalid' }
  }
  let propertyTaxPhase = null
  if (carryingType === 'property_tax') {
    const rawPhase = (body.propertyTaxPhase || body.taxPhase || body.phase || '').toLowerCase()
    if (!PROPERTY_TAX_PHASES.includes(rawPhase)) {
      return { error: 'taxPhase is required for property tax rows' }
    }
    propertyTaxPhase = rawPhase
  }

  const defaultTitle = resolveDefaultTitle(carryingType, propertyTaxPhase)
  const costName = (body.costName || body.title || '').trim() || defaultTitle

  if (carryingType === 'loan') {
    const loanMode = (body.loanMode || '').toLowerCase()
    if (!LOAN_MODES.includes(loanMode)) return { error: 'loanMode is invalid' }

    const loanAmountUsd = coerceNumberStrict(body.loanAmountUsd)
    if (loanAmountUsd === null) return { error: 'loanAmountUsd is required' }

    const interestRatePct = coerceNumberStrict(body.interestRatePct)
    if (interestRatePct === null) return { error: 'interestRatePct is required' }

    const loanTermMonths = coerceInt(body.loanTermMonths)
    if (loanTermMonths === null || loanTermMonths <= 0) {
      return { error: 'loanTermMonths must be greater than 0' }
    }

    const fundingMonth = coerceInt(body.fundingMonth)
    if (fundingMonth === null) return { error: 'fundingMonth is required' }

    const repaymentStartMonth = coerceInt(body.repaymentStartMonth)
    if (repaymentStartMonth === null) return { error: 'repaymentStartMonth is required' }
    if (repaymentStartMonth < fundingMonth) {
      return { error: 'repaymentStartMonth cannot be before fundingMonth' }
    }

    return {
      costName,
      carryingType,
      loanMode,
      loanAmountUsd,
      interestRatePct,
      loanTermMonths,
      fundingMonth,
      repaymentStartMonth,
      amountUsd: loanAmountUsd,
      intervalUnit: null,
      startMonth: null,
      endMonth: null,
      propertyTaxPhase: null,
    }
  }

  const amountUsd = coerceNumberStrict(body.amountUsd)
  if (amountUsd === null) return { error: 'amountUsd is required' }

  const startMonth = coerceInt(body.startMonth)
  if (startMonth === null) return { error: 'startMonth is required' }

  const hasEndMonth = body.endMonth !== undefined && body.endMonth !== null && body.endMonth !== ''
  const endMonth = hasEndMonth ? coerceInt(body.endMonth) : null
  if (hasEndMonth && endMonth === null) return { error: 'endMonth is invalid' }
  if (endMonth !== null && endMonth < startMonth) return { error: 'endMonth cannot be before startMonth' }

  const intervalUnit = (body.intervalUnit || body.interval || 'monthly').toLowerCase()
  if (!INTERVAL_UNITS.includes(intervalUnit)) return { error: 'intervalUnit is invalid' }

  return {
    costName,
    carryingType,
    amountUsd,
    startMonth,
    endMonth,
    intervalUnit,
    loanMode: null,
    loanAmountUsd: null,
    interestRatePct: null,
    loanTermMonths: null,
    fundingMonth: null,
    repaymentStartMonth: null,
    propertyTaxPhase,
  }
}

