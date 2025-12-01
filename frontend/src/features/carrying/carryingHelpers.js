export const carryingMenuOptions = [
  { id: 'property_tax', label: 'Property Tax' },
  { id: 'management', label: 'Management Fee' },
]

export const loanModeOptions = [
  { id: 'interest_only', label: 'Interest-Only' },
  { id: 'amortizing', label: 'Amortizing' },
]

export const intervalUnitOptions = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
]

export const intervalLabels = intervalUnitOptions.reduce((acc, option) => {
  acc[option.id] = option.label
  return acc
}, {})

export const loanModeLabels = loanModeOptions.reduce((acc, option) => {
  acc[option.id] = option.label
  return acc
}, {})

export const propertyTaxPhaseOptions = [
  { id: 'construction', label: 'Construction RE Tax' },
  { id: 'stabilized', label: 'Stabilized RE Tax' },
]

export const propertyTaxPhaseLabels = propertyTaxPhaseOptions.reduce((acc, option) => {
  acc[option.id] = option.label
  return acc
}, {})

export const createDefaultLoanForm = () => ({
  costName: '',
  loanMode: 'interest_only',
  loanAmountUsd: '',
  interestRatePct: '',
  loanTermMonths: '',
  fundingMonth: '1',
  repaymentStartMonth: '1',
})

export const createDefaultRecurringForm = (type, options = {}) => {
  const base = {
    costName: type === 'management' ? '' : (options.defaultTitle || 'Property Tax'),
    amountUsd: '',
    intervalUnit: 'monthly',
    startMonth: '1',
    endMonth: '',
  }
  if (type === 'property_tax') {
    const phase = options.propertyTaxPhase || 'construction'
    return {
      ...base,
      costName: propertyTaxPhaseLabels[phase] || base.costName,
      propertyTaxPhase: phase,
    }
  }
  return base
}

export const buildLoanFormFromRow = (row, formatOffsetForInput) => ({
  costName: row.costName || '',
  loanMode: row.loanMode || 'interest_only',
  loanAmountUsd: row.loanAmountUsd ? String(row.loanAmountUsd) : '',
  interestRatePct: row.interestRatePct ? String(row.interestRatePct) : '',
  loanTermMonths: row.loanTermMonths ? String(row.loanTermMonths) : '',
  fundingMonth: formatOffsetForInput(row.fundingMonth ?? 0),
  repaymentStartMonth: formatOffsetForInput(row.repaymentStartMonth ?? row.fundingMonth ?? 0),
})

export const buildRecurringFormFromRow = (row, formatOffsetForInput) => ({
  costName: row.costName || '',
  amountUsd: row.amountUsd ? String(row.amountUsd) : '',
  intervalUnit: row.intervalUnit || 'monthly',
  startMonth: formatOffsetForInput(row.startMonth ?? 0),
  endMonth: row.endMonth !== null && row.endMonth !== undefined ? formatOffsetForInput(row.endMonth) : '',
  propertyTaxPhase: row.carryingType === 'property_tax' ? row.propertyTaxPhase || 'construction' : undefined,
})

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const calculateLoanPreview = (row) => {
  const amount = Number(row.loanAmountUsd || row.amountUsd) || 0
  const term = Number(row.loanTermMonths) || 0
  const monthlyRate = (Number(row.interestRatePct) || 0) / 100 / 12
  if (!amount || !term) {
    return { monthlyPayment: 0, monthlyInterest: 0 }
  }

  if (row.loanMode === 'interest_only') {
    const monthlyInterest = amount * monthlyRate
    return {
      monthlyPayment: monthlyInterest,
      monthlyInterest,
      monthlyPrincipal: 0,
    }
  }

  const payment =
    monthlyRate === 0
      ? amount / term
      : (amount * monthlyRate * (1 + monthlyRate) ** term) / ((1 + monthlyRate) ** term - 1 || 1)

  return {
    monthlyPayment: payment,
    monthlyInterest: null,
    monthlyPrincipal: null,
  }
}

export const calculateRecurringAverage = (row, months = 60) => {
  const amount = Number(row.amountUsd) || 0
  if (!amount) return 0
  const interval = row.intervalUnit || 'monthly'
  if (interval === 'monthly') return amount
  if (interval === 'quarterly') return amount / 3
  if (interval === 'yearly') return amount / 12
  return amount
}

export const formatCurrency = (value) => {
  if (value === null || value === undefined) return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  const prefix = amount < 0 ? '-' : ''
  return `${prefix}$${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

