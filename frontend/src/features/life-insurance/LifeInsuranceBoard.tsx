import { useState, useEffect, useMemo, FormEvent } from 'react'
import {
  fetchLifeInsurancePolicies,
  fetchLifeInsurancePolicy,
  createLifeInsurancePolicy,
  updateLifeInsurancePolicy,
  deleteLifeInsurancePolicy,
  addPolicyWithdrawal,
  deletePolicyWithdrawal,
} from '../../api'

type LoadStatus = 'idle' | 'loading' | 'saving' | 'error'
type PlanningMode = 'coverage_first' | 'budget_first' | 'manual'

// Premium rate tables per $1,000 of face amount (annual, whole-life pay basis)
// These are approximations based on industry averages, extended for all ages
const PREMIUM_RATES: Record<string, Record<string, Record<number, number>>> = {
  male: {
    preferred_plus: { 
      0: 1.8, 5: 2.0, 10: 2.2, 15: 2.8, 18: 3.5, 20: 4.5, 
      25: 6, 30: 7, 35: 9, 40: 12, 45: 16, 50: 21, 55: 28, 60: 38, 65: 52, 70: 72, 75: 100, 80: 140 
    },
    preferred: { 
      0: 2.2, 5: 2.4, 10: 2.7, 15: 3.4, 18: 4.2, 20: 5.5,
      25: 7, 30: 8, 35: 11, 40: 14, 45: 19, 50: 25, 55: 33, 60: 44, 65: 60, 70: 84, 75: 118, 80: 165 
    },
    standard: { 
      0: 2.8, 5: 3.0, 10: 3.4, 15: 4.2, 18: 5.5, 20: 7,
      25: 9, 30: 10, 35: 14, 40: 18, 45: 24, 50: 32, 55: 42, 60: 55, 65: 75, 70: 105, 75: 147, 80: 205 
    },
    substandard: { 
      0: 3.8, 5: 4.0, 10: 4.5, 15: 5.6, 18: 7.5, 20: 9.5,
      25: 12, 30: 14, 35: 19, 40: 25, 45: 33, 50: 44, 55: 58, 60: 76, 65: 103, 70: 145, 75: 200, 80: 280 
    },
  },
  female: {
    preferred_plus: { 
      0: 1.5, 5: 1.7, 10: 1.9, 15: 2.4, 18: 3.0, 20: 3.8,
      25: 5, 30: 6, 35: 8, 40: 10, 45: 14, 50: 18, 55: 24, 60: 33, 65: 45, 70: 62, 75: 86, 80: 120 
    },
    preferred: { 
      0: 1.8, 5: 2.0, 10: 2.3, 15: 2.9, 18: 3.6, 20: 4.6,
      25: 6, 30: 7, 35: 9, 40: 12, 45: 16, 50: 22, 55: 29, 60: 38, 65: 52, 70: 72, 75: 100, 80: 140 
    },
    standard: { 
      0: 2.4, 5: 2.6, 10: 2.9, 15: 3.6, 18: 4.7, 20: 6,
      25: 8, 30: 9, 35: 12, 40: 15, 45: 20, 50: 27, 55: 36, 60: 48, 65: 65, 70: 90, 75: 126, 80: 175 
    },
    substandard: { 
      0: 3.2, 5: 3.4, 10: 3.9, 15: 4.8, 18: 6.3, 20: 8,
      25: 10, 30: 12, 35: 16, 40: 21, 45: 28, 50: 37, 55: 50, 60: 66, 65: 90, 70: 125, 75: 175, 80: 245 
    },
  },
}

// 7-Pay limit per $1000 face amount by issue age (IRS guideline premium limits)
// Young ages have HIGHER limits (more permissive) due to low mortality
// Based on Section 7702A and actuarial guideline standards
const SEVEN_PAY_RATES: Record<number, number> = {
  // Children: Very high limits - can fund aggressively
  0: 74.00, 5: 58.00, 10: 45.00, 15: 32.00, 
  // Young adults: Gradually decreasing
  18: 22.00, 20: 17.50, 
  // Adults: Standard progression
  25: 12.50, 30: 13.80, 35: 15.40, 40: 17.50, 45: 20.20, 50: 23.80,
  55: 28.50, 60: 35.00, 65: 44.00, 70: 56.00, 75: 72.00, 80: 95.00, 85: 125.00
}

// Interpolate rate for ages not in the table
function interpolateRate(rates: Record<number, number>, age: number): number {
  const ages = Object.keys(rates).map(Number).sort((a, b) => a - b)
  if (age <= ages[0]) return rates[ages[0]]
  if (age >= ages[ages.length - 1]) return rates[ages[ages.length - 1]]
  
  for (let i = 0; i < ages.length - 1; i++) {
    if (age >= ages[i] && age < ages[i + 1]) {
      const ratio = (age - ages[i]) / (ages[i + 1] - ages[i])
      return rates[ages[i]] + ratio * (rates[ages[i + 1]] - rates[ages[i]])
    }
  }
  return rates[ages[Math.floor(ages.length / 2)]]
}

// Get 7-pay rate for an age (max premium per $1000 to avoid MEC)
function getSevenPayRate(age: number): number {
  return interpolateRate(SEVEN_PAY_RATES, age)
}

// Get base rate per $1,000 (whole-life pay basis)
function getBaseRate(age: number, sex: string, healthClass: string): number {
  const sexRates = PREMIUM_RATES[sex] || PREMIUM_RATES['male']
  const classRates = sexRates[healthClass] || sexRates['standard']
  return interpolateRate(classRates, age)
}

// Payment period multiplier (shorter pay = higher annual premium)
function getPaymentMultiplier(payYears: number, issueAge: number): number {
  const yearsToAge100 = Math.max(1, 100 - issueAge)
  
  // If paying for ~life expectancy, no multiplier
  if (payYears >= yearsToAge100 * 0.9) return 1.0
  
  // Compression ratio with discount for time value of money
  const compressionRatio = yearsToAge100 / payYears
  const discountFactor = 0.55 + (0.45 / Math.sqrt(compressionRatio))
  
  return Math.min(3.5, compressionRatio * discountFactor)
}

// Calculate MEC limit for a given face amount
function getMecLimit(faceAmount: number, age: number): number {
  const sevenPayRate = getSevenPayRate(age)
  return Math.round((faceAmount / 1000) * sevenPayRate)
}

// Calculate minimum face amount needed for a premium to avoid MEC
function getMinFaceAmountForMec(premium: number, age: number): number {
  const sevenPayRate = getSevenPayRate(age)
  return Math.ceil((premium * 1000) / sevenPayRate)
}

// Estimate annual premium given face amount (actuarial estimate, may exceed MEC limit)
function estimateActuarialPremium(
  faceAmount: number,
  age: number,
  sex: string,
  healthClass: string,
  payYears: number
): number {
  const baseRate = getBaseRate(age, sex, healthClass)
  const multiplier = getPaymentMultiplier(payYears, age)
  return Math.round((faceAmount / 1000) * baseRate * multiplier)
}

// Estimate face amount given premium budget (actuarial estimate, may result in MEC)
function estimateActuarialFaceAmount(
  premium: number,
  age: number,
  sex: string,
  healthClass: string,
  payYears: number
): number {
  const baseRate = getBaseRate(age, sex, healthClass)
  const multiplier = getPaymentMultiplier(payYears, age)
  return Math.round((premium / (baseRate * multiplier)) * 1000)
}

interface PremiumEstimate {
  actuarialPremium: number      // What insurance pricing suggests
  mecSafePremium: number        // Max premium to avoid MEC
  isMecAdjusted: boolean        // True if we had to reduce premium
  savingsFromMecLimit: number   // How much less you pay per year
  totalSavingsOverPayPeriod: number
  tradeOff: string              // Explanation of the trade-off
}

interface FaceAmountEstimate {
  actuarialFaceAmount: number   // What the premium would normally buy (max cash value focus)
  mecSafeFaceAmount: number     // Minimum face amount to avoid MEC
  isMecAdjusted: boolean        // True if we had to increase face amount
  extraCoverage: number         // Additional death benefit you get
  tradeOff: string              // Explanation of the trade-off
  // Range options for user to choose
  minFaceAmount: number         // Minimum (MEC-safe, max DB focus)
  maxFaceAmount: number         // Maximum (actuarial, max CV focus) - capped for reasonableness
  rangeOptions: FaceAmountOption[]  // Pre-calculated options across the range
}

interface FaceAmountOption {
  faceAmount: number
  label: string
  cvFocusPercent: number        // 0% = all DB focus, 100% = max CV focus
  estimatedCvYear10: number     // Rough estimate of CV at year 10
  estimatedCvYear20: number     // Rough estimate of CV at year 20
}

// Coverage First: User enters face amount, we calculate premium (capped at MEC limit)
function estimatePremiumWithMec(
  faceAmount: number,
  age: number,
  sex: string,
  healthClass: string,
  payYears: number
): PremiumEstimate {
  const actuarialPremium = estimateActuarialPremium(faceAmount, age, sex, healthClass, payYears)
  const mecLimit = getMecLimit(faceAmount, age)
  const isMecAdjusted = actuarialPremium > mecLimit
  const mecSafePremium = Math.min(actuarialPremium, mecLimit)
  const savingsFromMecLimit = actuarialPremium - mecSafePremium
  const totalSavingsOverPayPeriod = savingsFromMecLimit * payYears

  let tradeOff = ''
  if (isMecAdjusted) {
    tradeOff = `Typical insurance pricing would charge ${formatCurrency(actuarialPremium)}/year, but that exceeds the MEC limit. ` +
      `To keep tax advantages, your premium is capped at ${formatCurrency(mecSafePremium)}/year. ` +
      `You save ${formatCurrency(savingsFromMecLimit)}/year (${formatCurrency(totalSavingsOverPayPeriod)} over ${payYears} years), ` +
      `but cash value will grow slower.`
  }

  return {
    actuarialPremium,
    mecSafePremium,
    isMecAdjusted,
    savingsFromMecLimit,
    totalSavingsOverPayPeriod,
    tradeOff
  }
}

// Rough estimate of cash value at a given year (simplified model for UI display)
function estimateCashValueAtYear(
  premium: number,
  payYears: number,
  faceAmount: number,
  age: number,
  targetYear: number,
  guaranteedRate: number = 0.04,
  dividendRate: number = 0.05
): number {
  let cv = 0
  const totalRate = guaranteedRate + dividendRate
  
  for (let year = 1; year <= targetYear; year++) {
    const isPremiumYear = year <= payYears
    const yearPremium = isPremiumYear ? premium : 0
    
    // Simplified CV factor (increases over time)
    const cvFactor = year <= 2 ? 0.3 : year <= 5 ? 0.6 : 0.75
    
    // Simplified COI (increases with age, decreases as CV builds)
    const currentAge = age + year
    const mortalityRate = currentAge < 30 ? 0.001 : currentAge < 50 ? 0.003 : currentAge < 70 ? 0.01 : 0.03
    const nar = Math.max(0, faceAmount - cv)
    const coi = nar * mortalityRate
    
    // CV grows
    cv = cv + (yearPremium * cvFactor) + (cv * totalRate) - coi
    cv = Math.max(0, cv)
  }
  
  return Math.round(cv)
}

// Budget First: User enters premium, we calculate face amount range
function estimateFaceAmountWithMec(
  premium: number,
  age: number,
  sex: string,
  healthClass: string,
  payYears: number
): FaceAmountEstimate {
  const actuarialFaceAmount = estimateActuarialFaceAmount(premium, age, sex, healthClass, payYears)
  const minFaceAmountForMec = getMinFaceAmountForMec(premium, age)
  const isMecAdjusted = actuarialFaceAmount < minFaceAmountForMec
  const mecSafeFaceAmount = Math.max(actuarialFaceAmount, minFaceAmountForMec)
  const extraCoverage = mecSafeFaceAmount - actuarialFaceAmount

  // Calculate the range - min is MEC-safe minimum, max is actuarial (capped at 3x MEC minimum for reasonableness)
  const minFaceAmount = minFaceAmountForMec
  const maxFaceAmount = Math.max(actuarialFaceAmount, minFaceAmountForMec) // Can't go below MEC minimum

  // Generate range options (5 options from max CV focus to max DB focus)
  // Lower DB = more premium to CV = "Max Cash Value"
  // Higher DB = more premium to COI = "Max Death Benefit"
  const rangeOptions: FaceAmountOption[] = []
  const steps = 5
  
  for (let i = 0; i < steps; i++) {
    // At i=0 (lowest DB), CV focus is highest (100%)
    // At i=4 (highest DB), CV focus is lowest (0%)
    const cvFocusPercent = ((steps - 1 - i) / (steps - 1)) * 100
    // Interpolate: i=0 = minFaceAmount (min DB, max CV), i=4 = maxFaceAmount (max DB, min CV)
    const faceAmount = Math.round(minFaceAmount + (maxFaceAmount - minFaceAmount) * (i / (steps - 1)))
    
    let label: string
    if (i === 0) label = 'Max Cash Value'  // Lowest DB = most to CV
    else if (i === steps - 1) label = 'Max Death Benefit'  // Highest DB = most protection
    else if (i === Math.floor(steps / 2)) label = 'Balanced'
    else label = `${Math.round(cvFocusPercent)}% CV Focus`
    
    rangeOptions.push({
      faceAmount,
      label,
      cvFocusPercent,
      estimatedCvYear10: estimateCashValueAtYear(premium, payYears, faceAmount, age, 10),
      estimatedCvYear20: estimateCashValueAtYear(premium, payYears, faceAmount, age, 20),
    })
  }

  let tradeOff = ''
  if (isMecAdjusted) {
    tradeOff = `For ${formatCurrency(premium)}/year, insurance pricing would typically provide ${formatCurrency(actuarialFaceAmount)} coverage. ` +
      `However, to avoid MEC status, the minimum death benefit must be ${formatCurrency(mecSafeFaceAmount)}. ` +
      `You get ${formatCurrency(extraCoverage)} MORE coverage (${Math.round((extraCoverage / actuarialFaceAmount) * 100)}% bonus), ` +
      `but cash value per dollar of coverage is lower.`
  }

  return {
    actuarialFaceAmount,
    mecSafeFaceAmount,
    isMecAdjusted,
    extraCoverage,
    tradeOff,
    minFaceAmount,
    maxFaceAmount,
    rangeOptions
  }
}

// Calculate age from DOB
function getAgeFromDob(dob: string): number {
  if (!dob) return 35 // default
  const birthDate = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  // Allow ages 0-85 (children can have life insurance policies)
  return Math.max(0, Math.min(85, age))
}

interface Withdrawal {
  id: string
  startAge: number
  annualAmount: number
  years: number
  withdrawalType: string
}

interface Projection {
  policyYear: number
  age: number
  premium: number
  cumulativePremium: number
  // Premium allocation breakdown
  premiumToCv: number
  premiumToCoi: number
  premiumToExpenses: number
  interestEarned: number
  // Values
  cashValue: number
  surrenderValue: number
  deathBenefit: number
  puaCashValue: number
  puaDeathBenefit: number
  dividendAmount: number
  // PUA breakdown (from dividends)
  puaDividendToCv: number
  puaDividendToDb: number
  sevenPayLimit: number
  isMec: boolean
  loanBalance: number
  netCashValue: number
  netDeathBenefit: number
  lapsed: boolean
  lapseReason?: string
}

interface Policy {
  id: string
  policyNumber?: string
  carrier?: string
  faceAmount: number
  issueDate: string
  insuredName?: string
  insuredDob: string
  insuredSex: string
  healthClass: string
  annualPremium: number
  premiumPaymentYears: number
  guaranteedRate: number
  isParticipating: boolean
  dividendRate?: number
  dividendOption: string
  loanInterestRate: number
  notes?: string
  withdrawals: Withdrawal[]
  projections?: Projection[]
}

interface PolicyFormState {
  policyNumber: string
  carrier: string
  faceAmount: string
  issueDate: string
  insuredName: string
  insuredDob: string
  insuredSex: string
  healthClass: string
  annualPremium: string
  premiumPaymentYears: string
  guaranteedRate: string
  isParticipating: boolean
  dividendRate: string
  dividendOption: string
  loanInterestRate: string
  notes: string
}

interface WithdrawalFormState {
  startAge: string
  annualAmount: string
  years: string
  withdrawalType: string
}

const defaultPolicyForm: PolicyFormState = {
  policyNumber: '',
  carrier: '',
  faceAmount: '',
  issueDate: '',
  insuredName: '',
  insuredDob: '',
  insuredSex: 'male',
  healthClass: 'standard',
  annualPremium: '',
  premiumPaymentYears: '20',
  guaranteedRate: '0.04',
  isParticipating: true,
  dividendRate: '0.05',
  dividendOption: 'paid_up_additions',
  loanInterestRate: '0.06',
  notes: '',
}

const defaultWithdrawalForm: WithdrawalFormState = {
  startAge: '65',
  annualAmount: '',
  years: '20',
  withdrawalType: 'loan',
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

interface LifeInsuranceBoardProps {
  onPolicyCountChange?: () => void
  openCreateModalTrigger?: number  // Increment to trigger opening the create modal
}

export function LifeInsuranceBoard({ onPolicyCountChange, openCreateModalTrigger }: LifeInsuranceBoardProps) {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [detailStatus, setDetailStatus] = useState<LoadStatus>('idle')
  const [error, setError] = useState('')

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false)
  const [policyForm, setPolicyForm] = useState<PolicyFormState>(defaultPolicyForm)
  const [withdrawalForm, setWithdrawalForm] = useState<WithdrawalFormState>(defaultWithdrawalForm)
  const [formStatus, setFormStatus] = useState<LoadStatus>('idle')
  const [formError, setFormError] = useState('')
  const [planningMode, setPlanningMode] = useState<PlanningMode>('coverage_first')

  // Inline loan input state (tracks loan amount input for each age)
  const [inlineLoanInputs, setInlineLoanInputs] = useState<Record<number, string>>({})
  const [addingLoanForAge, setAddingLoanForAge] = useState<number | null>(null)

  // Projections filter: show only years with activity (premium or loan)
  const [showOnlyActivityYears, setShowOnlyActivityYears] = useState(false)

  // Budget First mode: selected face amount option index (0 = max DB, 4 = max CV)
  const [selectedFaceAmountOptionIndex, setSelectedFaceAmountOptionIndex] = useState(2) // Default to "Balanced"

  // Computed values for planning
  const formAge = useMemo(() => getAgeFromDob(policyForm.insuredDob), [policyForm.insuredDob])
  
  // Coverage First mode: estimate premium with MEC adjustment
  const premiumEstimate = useMemo((): PremiumEstimate | null => {
    if (!policyForm.faceAmount || !policyForm.insuredDob) return null
    return estimatePremiumWithMec(
      parseFloat(policyForm.faceAmount) || 0,
      formAge,
      policyForm.insuredSex,
      policyForm.healthClass,
      parseInt(policyForm.premiumPaymentYears) || 20
    )
  }, [policyForm.faceAmount, formAge, policyForm.insuredSex, policyForm.healthClass, policyForm.premiumPaymentYears])

  // For backward compatibility
  const estimatedPremium = premiumEstimate?.mecSafePremium ?? null

  // Budget First mode: estimate face amount with MEC adjustment
  const faceAmountEstimate = useMemo((): FaceAmountEstimate | null => {
    if (!policyForm.annualPremium || !policyForm.insuredDob) return null
    return estimateFaceAmountWithMec(
      parseFloat(policyForm.annualPremium) || 0,
      formAge,
      policyForm.insuredSex,
      policyForm.healthClass,
      parseInt(policyForm.premiumPaymentYears) || 20
    )
  }, [policyForm.annualPremium, formAge, policyForm.insuredSex, policyForm.healthClass, policyForm.premiumPaymentYears])

  // For backward compatibility
  const estimatedFaceAmount = faceAmountEstimate?.mecSafeFaceAmount ?? null

  // 7-pay limit info for display
  const sevenPayInfo = useMemo(() => {
    if (!policyForm.insuredDob) return null
    const rate = getSevenPayRate(formAge)
    return {
      rate,
      perMillion: Math.round(rate * 1000)
    }
  }, [policyForm.insuredDob, formAge])

  // Payment period comparison (using MEC-safe values)
  const paymentComparison = useMemo(() => {
    if (!policyForm.insuredDob) return []
    const baseAmount = planningMode === 'coverage_first' 
      ? parseFloat(policyForm.faceAmount) || 500000
      : estimatedFaceAmount || 500000
    
    const periods = [10, 15, 20, 30]
    return periods.map(years => {
      const estimate = estimatePremiumWithMec(baseAmount, formAge, policyForm.insuredSex, policyForm.healthClass, years)
      return {
        years,
        annualPremium: estimate.mecSafePremium,
        totalPremiums: estimate.mecSafePremium * years,
        isMecAdjusted: estimate.isMecAdjusted,
        actuarialPremium: estimate.actuarialPremium,
      }
    })
  }, [policyForm.faceAmount, policyForm.insuredDob, policyForm.insuredSex, policyForm.healthClass, formAge, estimatedFaceAmount, planningMode])

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deleteStatus, setDeleteStatus] = useState<LoadStatus>('idle')

  // Load policies
  const loadPolicies = async () => {
    setStatus('loading')
    setError('')
    try {
      const data = await fetchLifeInsurancePolicies()
      setPolicies(data as Policy[])
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load policies')
      setStatus('error')
    }
  }

  // Load policy detail with projections
  const loadPolicyDetail = async (policyId: string) => {
    setDetailStatus('loading')
    try {
      const data = await fetchLifeInsurancePolicy(policyId)
      setSelectedPolicy(data as Policy)
      setDetailStatus('idle')
    } catch (err) {
      setDetailStatus('error')
    }
  }

  useEffect(() => {
    loadPolicies()
  }, [])

  useEffect(() => {
    if (selectedPolicyId) {
      loadPolicyDetail(selectedPolicyId)
    } else {
      setSelectedPolicy(null)
    }
  }, [selectedPolicyId])

  // Open create modal when triggered from parent (header button)
  useEffect(() => {
    if (openCreateModalTrigger && openCreateModalTrigger > 0) {
      setPolicyForm(defaultPolicyForm)
      setIsCreateModalOpen(true)
    }
  }, [openCreateModalTrigger])

  // MEC analysis calculations (must be before any early returns to maintain hook order)
  const mecAnalysis = useMemo(() => {
    if (!selectedPolicy) return null
    
    const projections = selectedPolicy.projections || []
    const firstMecProjection = projections.find((p: Projection) => p.isMec)
    if (!firstMecProjection) return null

    const faceAmount = Number(selectedPolicy.faceAmount)
    const annualPremium = Number(selectedPolicy.annualPremium)
    const premiumYears = selectedPolicy.premiumPaymentYears

    // Get the 7-pay limit at the year it becomes MEC
    const sevenPayLimit = firstMecProjection.sevenPayLimit
    const cumulativePremium = firstMecProjection.cumulativePremium
    const overage = cumulativePremium - sevenPayLimit

    // Calculate the max annual premium that would avoid MEC
    // The 7-pay limit after 7 years is the full limit
    const year7Projection = projections.find((p: Projection) => p.policyYear === 7)
    const fullSevenPayLimit = year7Projection?.sevenPayLimit || sevenPayLimit

    // Max premium to avoid MEC: if paying for X years, total must be <= 7-pay limit
    // For payments within 7 years: max_annual = sevenPayLimit / min(premiumYears, 7)
    const effectivePaymentYears = Math.min(premiumYears, 7)
    const maxAnnualPremium = fullSevenPayLimit / effectivePaymentYears

    // Required face amount increase to make current premium safe
    // annual_premium <= (faceAmount / 1000) * sevenPayRate / effectivePaymentYears
    // faceAmount >= (annual_premium * effectivePaymentYears * 1000) / sevenPayRate
    // We can estimate sevenPayRate from the limit: sevenPayRate = (fullSevenPayLimit * 1000) / faceAmount / 7
    const sevenPayRate = (fullSevenPayLimit / 7) * 1000 / faceAmount
    const requiredFaceAmount = (annualPremium * effectivePaymentYears * 1000) / sevenPayRate

    // Alternative: spread payments over more years
    const yearsNeededForCurrentPremium = Math.ceil((annualPremium * premiumYears) / (fullSevenPayLimit / 7))

    return {
      yearBecameMec: firstMecProjection.policyYear,
      ageBecameMec: firstMecProjection.age,
      cumulativePremiumAtMec: cumulativePremium,
      sevenPayLimitAtMec: sevenPayLimit,
      overage,
      currentAnnualPremium: annualPremium,
      maxAnnualPremium,
      currentFaceAmount: faceAmount,
      requiredFaceAmount,
      currentPremiumYears: premiumYears,
      yearsNeededForCurrentPremium: Math.max(yearsNeededForCurrentPremium, premiumYears),
      fullSevenPayLimit
    }
  }, [selectedPolicy])

  // Handlers
  const handleCreatePolicy = async (e: FormEvent) => {
    e.preventDefault()
    setFormStatus('saving')
    setFormError('')
    
    // Calculate derived values based on planning mode
    let faceAmount: number
    let annualPremium: number
    
    if (planningMode === 'coverage_first') {
      faceAmount = parseFloat(policyForm.faceAmount) || 0
      annualPremium = estimatedPremium || 0
    } else if (planningMode === 'budget_first') {
      annualPremium = parseFloat(policyForm.annualPremium) || 0
      faceAmount = estimatedFaceAmount || 0
    } else {
      faceAmount = parseFloat(policyForm.faceAmount) || 0
      annualPremium = parseFloat(policyForm.annualPremium) || 0
    }
    
    try {
      await createLifeInsurancePolicy({
        policyNumber: policyForm.policyNumber || null,
        carrier: policyForm.carrier || null,
        faceAmount,
        issueDate: policyForm.issueDate,
        insuredName: policyForm.insuredName || null,
        insuredDob: policyForm.insuredDob,
        insuredSex: policyForm.insuredSex,
        healthClass: policyForm.healthClass,
        annualPremium,
        premiumPaymentYears: parseInt(policyForm.premiumPaymentYears),
        guaranteedRate: parseFloat(policyForm.guaranteedRate),
        isParticipating: policyForm.isParticipating,
        dividendRate: policyForm.isParticipating ? parseFloat(policyForm.dividendRate) : null,
        dividendOption: policyForm.dividendOption,
        loanInterestRate: parseFloat(policyForm.loanInterestRate),
        notes: policyForm.notes || null,
      })
      await loadPolicies()
      setIsCreateModalOpen(false)
      setPolicyForm(defaultPolicyForm)
      setFormStatus('idle')
      onPolicyCountChange?.()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create policy')
      setFormStatus('error')
    }
  }

  const handleUpdatePolicy = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedPolicyId) return
    setFormStatus('saving')
    setFormError('')

    // Calculate derived values based on planning mode
    let faceAmount: number
    let annualPremium: number

    if (planningMode === 'coverage_first') {
      faceAmount = parseFloat(policyForm.faceAmount) || 0
      annualPremium = estimatedPremium || 0
    } else if (planningMode === 'budget_first') {
      annualPremium = parseFloat(policyForm.annualPremium) || 0
      faceAmount = estimatedFaceAmount || 0
    } else {
      faceAmount = parseFloat(policyForm.faceAmount) || 0
      annualPremium = parseFloat(policyForm.annualPremium) || 0
    }

    try {
      await updateLifeInsurancePolicy(selectedPolicyId, {
        policyNumber: policyForm.policyNumber || null,
        carrier: policyForm.carrier || null,
        faceAmount,
        issueDate: policyForm.issueDate,
        insuredName: policyForm.insuredName || null,
        insuredDob: policyForm.insuredDob,
        insuredSex: policyForm.insuredSex,
        healthClass: policyForm.healthClass,
        annualPremium,
        premiumPaymentYears: parseInt(policyForm.premiumPaymentYears),
        guaranteedRate: parseFloat(policyForm.guaranteedRate),
        isParticipating: policyForm.isParticipating,
        dividendRate: policyForm.isParticipating ? parseFloat(policyForm.dividendRate) : null,
        dividendOption: policyForm.dividendOption,
        loanInterestRate: parseFloat(policyForm.loanInterestRate),
        notes: policyForm.notes || null,
      })
      await loadPolicies()
      await loadPolicyDetail(selectedPolicyId)
      setIsEditModalOpen(false)
      setFormStatus('idle')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update policy')
      setFormStatus('error')
    }
  }

  const handleDeletePolicy = async () => {
    if (!pendingDelete) return
    setDeleteStatus('saving')
    try {
      await deleteLifeInsurancePolicy(pendingDelete)
      await loadPolicies()
      if (selectedPolicyId === pendingDelete) {
        setSelectedPolicyId(null)
      }
      setPendingDelete(null)
      setDeleteStatus('idle')
      onPolicyCountChange?.()
    } catch (err) {
      setDeleteStatus('error')
    }
  }

  const handleAddWithdrawal = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedPolicyId) return
    setFormStatus('saving')
    setFormError('')
    try {
      await addPolicyWithdrawal(selectedPolicyId, {
        startAge: parseInt(withdrawalForm.startAge),
        annualAmount: parseFloat(withdrawalForm.annualAmount),
        years: parseInt(withdrawalForm.years),
        withdrawalType: withdrawalForm.withdrawalType,
      })
      await loadPolicyDetail(selectedPolicyId)
      setIsWithdrawalModalOpen(false)
      setWithdrawalForm(defaultWithdrawalForm)
      setFormStatus('idle')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add withdrawal')
      setFormStatus('error')
    }
  }

  const handleDeleteWithdrawal = async (withdrawalId: string) => {
    if (!selectedPolicyId) return
    try {
      await deletePolicyWithdrawal(selectedPolicyId, withdrawalId)
      await loadPolicyDetail(selectedPolicyId)
    } catch (err) {
      console.error('Failed to delete withdrawal', err)
    }
  }

  // Handle adding a loan directly from the projections table
  const handleInlineLoanAdd = async (age: number) => {
    const amount = parseFloat(inlineLoanInputs[age] || '0')
    if (!amount || amount <= 0 || !selectedPolicyId) {
      setInlineLoanInputs(prev => ({ ...prev, [age]: '' }))
      setAddingLoanForAge(null)
      return
    }

    setAddingLoanForAge(age)
    try {
      await addPolicyWithdrawal(selectedPolicyId, {
        startAge: age,
        annualAmount: amount,
        years: 1, // Single year loan
        withdrawalType: 'loan',
      })
      await loadPolicyDetail(selectedPolicyId)
      setInlineLoanInputs(prev => ({ ...prev, [age]: '' }))
    } catch (err) {
      console.error('Failed to add loan', err)
    }
    setAddingLoanForAge(null)
  }

  // Get existing withdrawal amount for an age (if any)
  const getWithdrawalForAge = (age: number): number => {
    if (!selectedPolicy) return 0
    return selectedPolicy.withdrawals
      .filter(w => age >= w.startAge && age < w.startAge + w.years)
      .reduce((sum, w) => sum + Number(w.annualAmount), 0)
  }

  const openEditModal = () => {
    if (!selectedPolicy) return
    setPolicyForm({
      policyNumber: selectedPolicy.policyNumber || '',
      carrier: selectedPolicy.carrier || '',
      faceAmount: String(selectedPolicy.faceAmount),
      issueDate: selectedPolicy.issueDate.split('T')[0],
      insuredName: selectedPolicy.insuredName || '',
      insuredDob: selectedPolicy.insuredDob.split('T')[0],
      insuredSex: selectedPolicy.insuredSex,
      healthClass: selectedPolicy.healthClass,
      annualPremium: String(selectedPolicy.annualPremium),
      premiumPaymentYears: String(selectedPolicy.premiumPaymentYears),
      guaranteedRate: String(selectedPolicy.guaranteedRate),
      isParticipating: selectedPolicy.isParticipating,
      dividendRate: String(selectedPolicy.dividendRate || 0.05),
      dividendOption: selectedPolicy.dividendOption,
      loanInterestRate: String(selectedPolicy.loanInterestRate),
      notes: selectedPolicy.notes || '',
    })
    // Keep the current planning mode (don't reset) so user can continue with same mode
    setIsEditModalOpen(true)
  }

  // Render list view
  if (!selectedPolicyId) {
    return (
      <div className="life-insurance-board">
        <div className="board-header">
          <h2>Life Insurance Policies</h2>
        </div>

        {status === 'loading' && <p className="loading">Loading policies...</p>}
        {status === 'error' && <p className="error">{error}</p>}

        {status === 'idle' && policies.length === 0 && (
          <div className="empty-state">
            <p>No life insurance policies yet.</p>
            <p className="muted">Add your first policy to start tracking cash value and death benefits.</p>
          </div>
        )}

        {policies.length > 0 && (
          <>
            <div className="policies-summary">
              <div className="summary-card">
                <span className="label">Total Coverage</span>
                <span className="value">{formatCurrency(policies.reduce((sum, p) => sum + Number(p.faceAmount), 0))}</span>
              </div>
              <div className="summary-card">
                <span className="label">Annual Premiums</span>
                <span className="value">{formatCurrency(policies.reduce((sum, p) => sum + Number(p.annualPremium), 0))}</span>
              </div>
              <div className="summary-card">
                <span className="label">Policies</span>
                <span className="value">{policies.length}</span>
              </div>
            </div>

            <div className="policies-list">
              {policies.map((policy) => (
                <div
                  key={policy.id}
                  className="policy-card"
                  onClick={() => setSelectedPolicyId(policy.id)}
                >
                  <div className="policy-header">
                    <strong>{policy.carrier || policy.insuredName || 'Policy'}</strong>
                    {policy.policyNumber && <span className="policy-number">#{policy.policyNumber}</span>}
                  </div>
                  <div className="policy-details">
                    <div>
                      <span className="label">Insured</span>
                      <span>{policy.insuredName || '—'}</span>
                    </div>
                    <div>
                      <span className="label">Face Amount</span>
                      <span>{formatCurrency(Number(policy.faceAmount))}</span>
                    </div>
                    <div>
                      <span className="label">Premium</span>
                      <span>{formatCurrency(Number(policy.annualPremium))}/yr</span>
                    </div>
                    <div>
                      <span className="label">Since</span>
                      <span>{formatDate(policy.issueDate)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Create Policy Modal */}
        {isCreateModalOpen && (
          <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
            <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
              <h3>Add Life Insurance Policy</h3>
              <form onSubmit={handleCreatePolicy}>
                {/* Planning Mode Selector */}
                <div className="planning-mode-selector">
                  <span className="planning-label">Planning Mode:</span>
                  <div className="planning-options">
                    <label className={`planning-option ${planningMode === 'coverage_first' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="planningMode"
                        checked={planningMode === 'coverage_first'}
                        onChange={() => setPlanningMode('coverage_first')}
                      />
                      Coverage First
                    </label>
                    <label className={`planning-option ${planningMode === 'budget_first' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="planningMode"
                        checked={planningMode === 'budget_first'}
                        onChange={() => setPlanningMode('budget_first')}
                      />
                      Budget First
                    </label>
                    <label className={`planning-option ${planningMode === 'manual' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="planningMode"
                        checked={planningMode === 'manual'}
                        onChange={() => setPlanningMode('manual')}
                      />
                      Manual Entry
                    </label>
                  </div>
                </div>

                <div className="form-section">
                  <h4>Insured Information</h4>
                  <div className="form-grid">
                    <label>
                      Insured Name
                      <input
                        type="text"
                        value={policyForm.insuredName}
                        onChange={(e) => setPolicyForm({ ...policyForm, insuredName: e.target.value })}
                        placeholder="Optional"
                      />
                    </label>
                    <label>
                      Date of Birth *
                      <input
                        type="date"
                        value={policyForm.insuredDob}
                        onChange={(e) => setPolicyForm({ ...policyForm, insuredDob: e.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Sex *
                      <select
                        value={policyForm.insuredSex}
                        onChange={(e) => setPolicyForm({ ...policyForm, insuredSex: e.target.value })}
                        required
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </label>
                    <label>
                      Health Class *
                      <select
                        value={policyForm.healthClass}
                        onChange={(e) => setPolicyForm({ ...policyForm, healthClass: e.target.value })}
                        required
                      >
                        <option value="preferred_plus">Preferred Plus</option>
                        <option value="preferred">Preferred</option>
                        <option value="standard">Standard</option>
                        <option value="substandard">Substandard</option>
                      </select>
                    </label>
                  </div>
                  {policyForm.insuredDob && (
                    <p className="age-display">Age: {formAge} years old</p>
                  )}
                </div>

                <div className="form-section">
                  <h4>Policy Configuration</h4>
                  <div className="form-grid">
                    {planningMode === 'coverage_first' && (
                      <>
                        <label>
                          Death Benefit (Face Amount) *
                          <input
                            type="number"
                            value={policyForm.faceAmount}
                            onChange={(e) => setPolicyForm({ ...policyForm, faceAmount: e.target.value })}
                            placeholder="e.g., 500000"
                            required
                          />
                        </label>
                        <label>
                          Premium Payment Years *
                          <select
                            value={policyForm.premiumPaymentYears}
                            onChange={(e) => setPolicyForm({ ...policyForm, premiumPaymentYears: e.target.value })}
                            required
                          >
                            <option value="1">1 year (Single Pay)</option>
                            <option value="2">2 years</option>
                            <option value="3">3 years</option>
                            <option value="5">5 years</option>
                            <option value="7">7 years (Max MEC)</option>
                            <option value="10">10 years</option>
                            <option value="15">15 years</option>
                            <option value="20">20 years</option>
                            <option value="30">30 years</option>
                            <option value="65">Pay to age 65</option>
                          </select>
                        </label>
                      </>
                    )}
                    {planningMode === 'budget_first' && (
                      <>
                        <label>
                          Annual Premium Budget *
                          <input
                            type="number"
                            value={policyForm.annualPremium}
                            onChange={(e) => setPolicyForm({ ...policyForm, annualPremium: e.target.value })}
                            placeholder="e.g., 10000"
                            required
                          />
                        </label>
                        <label>
                          Premium Payment Years *
                          <select
                            value={policyForm.premiumPaymentYears}
                            onChange={(e) => setPolicyForm({ ...policyForm, premiumPaymentYears: e.target.value })}
                            required
                          >
                            <option value="1">1 year (Single Pay)</option>
                            <option value="2">2 years</option>
                            <option value="3">3 years</option>
                            <option value="5">5 years</option>
                            <option value="7">7 years (Max MEC)</option>
                            <option value="10">10 years</option>
                            <option value="15">15 years</option>
                            <option value="20">20 years</option>
                            <option value="30">30 years</option>
                            <option value="65">Pay to age 65</option>
                          </select>
                        </label>
                      </>
                    )}
                    {planningMode === 'manual' && (
                      <>
                        <label>
                          Death Benefit (Face Amount) *
                          <input
                            type="number"
                            value={policyForm.faceAmount}
                            onChange={(e) => setPolicyForm({ ...policyForm, faceAmount: e.target.value })}
                            placeholder="e.g., 500000"
                            required
                          />
                        </label>
                        <label>
                          Annual Premium *
                          <input
                            type="number"
                            value={policyForm.annualPremium}
                            onChange={(e) => setPolicyForm({ ...policyForm, annualPremium: e.target.value })}
                            placeholder="e.g., 8500"
                            required
                          />
                        </label>
                        <label>
                          Premium Payment Years *
                          <input
                            type="number"
                            value={policyForm.premiumPaymentYears}
                            onChange={(e) => setPolicyForm({ ...policyForm, premiumPaymentYears: e.target.value })}
                            required
                          />
                        </label>
                      </>
                    )}
                    <label>
                      Issue/Start Date *
                      <input
                        type="date"
                        value={policyForm.issueDate}
                        onChange={(e) => setPolicyForm({ ...policyForm, issueDate: e.target.value })}
                        required
                      />
                    </label>
                  </div>

                  {/* Estimation Display - Coverage First */}
                  {planningMode === 'coverage_first' && premiumEstimate && policyForm.faceAmount && (
                    <div className={`estimation-box ${premiumEstimate.isMecAdjusted ? 'mec-adjusted' : ''}`}>
                      <div className="estimation-result">
                        <span className="estimation-label">Annual Premium (MEC-Safe):</span>
                        <span className="estimation-value">{formatCurrency(premiumEstimate.mecSafePremium)}</span>
                      </div>
                      
                      {premiumEstimate.isMecAdjusted && (
                        <div className="mec-adjustment-info">
                          <div className="adjustment-header">
                            <span className="adjustment-icon">💡</span>
                            <strong>Tax-Advantaged Adjustment Applied</strong>
                          </div>
                          <div className="adjustment-comparison">
                            <div className="comparison-item">
                              <span className="label">Typical Insurance Premium:</span>
                              <span className="value strikethrough">{formatCurrency(premiumEstimate.actuarialPremium)}/yr</span>
                            </div>
                            <div className="comparison-item">
                              <span className="label">MEC-Safe Premium (what you pay):</span>
                              <span className="value highlight">{formatCurrency(premiumEstimate.mecSafePremium)}/yr</span>
                            </div>
                            <div className="comparison-item savings">
                              <span className="label">Your Savings:</span>
                              <span className="value">{formatCurrency(premiumEstimate.savingsFromMecLimit)}/yr ({formatCurrency(premiumEstimate.totalSavingsOverPayPeriod)} over {policyForm.premiumPaymentYears} yrs)</span>
                            </div>
                          </div>
                          <p className="adjustment-explanation">
                            {premiumEstimate.tradeOff}
                          </p>
                          {sevenPayInfo && (
                            <p className="mec-limit-note">
                              <strong>7-Pay Limit for age {formAge}:</strong> {formatCurrency(sevenPayInfo.perMillion)} per $1M of coverage
                            </p>
                          )}
                        </div>
                      )}
                      
                      {!premiumEstimate.isMecAdjusted && (
                        <p className="estimation-note success">
                          ✓ This premium is within the 7-pay limit — full tax advantages preserved!
                        </p>
                      )}
                    </div>
                  )}

                  {/* Estimation Display - Budget First with Range Selector */}
                  {planningMode === 'budget_first' && faceAmountEstimate && policyForm.annualPremium && (
                    <div className="estimation-box budget-first-range">
                      <div className="range-header">
                        <h5>Choose Your Death Benefit / Cash Value Balance</h5>
                        <p className="range-hint">Higher death benefit = more protection. Lower death benefit = faster cash value growth.</p>
                      </div>
                      
                      {/* Range Options Table */}
                      <div className="range-options-table">
                        <table>
                          <thead>
                            <tr>
                              <th></th>
                              <th>Focus</th>
                              <th>Death Benefit</th>
                              <th>Est. CV Year 10</th>
                              <th>Est. CV Year 20</th>
                            </tr>
                          </thead>
                          <tbody>
                            {faceAmountEstimate.rangeOptions.map((opt, idx) => (
                              <tr 
                                key={idx}
                                className={`range-option ${selectedFaceAmountOptionIndex === idx ? 'selected' : ''}`}
                                onClick={() => {
                                  setSelectedFaceAmountOptionIndex(idx)
                                  setPolicyForm({ ...policyForm, faceAmount: String(opt.faceAmount) })
                                }}
                              >
                                <td>
                                  <input 
                                    type="radio" 
                                    name="faceAmountOption" 
                                    checked={selectedFaceAmountOptionIndex === idx}
                                    onChange={() => {
                                      setSelectedFaceAmountOptionIndex(idx)
                                      setPolicyForm({ ...policyForm, faceAmount: String(opt.faceAmount) })
                                    }}
                                  />
                                </td>
                                <td className="option-label">{opt.label}</td>
                                <td className="option-db">{formatCurrency(opt.faceAmount)}</td>
                                <td className="option-cv">{formatCurrency(opt.estimatedCvYear10)}</td>
                                <td className="option-cv">{formatCurrency(opt.estimatedCvYear20)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="selected-option-summary">
                        <div className="summary-item">
                          <span className="label">Selected Death Benefit:</span>
                          <span className="value">{formatCurrency(faceAmountEstimate.rangeOptions[selectedFaceAmountOptionIndex]?.faceAmount || 0)}</span>
                        </div>
                        <div className="summary-item">
                          <span className="label">Annual Premium:</span>
                          <span className="value">{formatCurrency(parseFloat(policyForm.annualPremium))}</span>
                        </div>
                      </div>

                      {/* Premium Allocation Breakdown */}
                      {(() => {
                        const premium = parseFloat(policyForm.annualPremium) || 0
                        const faceAmount = faceAmountEstimate.rangeOptions[selectedFaceAmountOptionIndex]?.faceAmount || 0
                        
                        // Simplified allocation calculation for display
                        // In early years: more goes to expenses and COI
                        // COI based on mortality rate and net amount at risk
                        const mortalityRate = formAge < 10 ? 0.001 : formAge < 30 ? 0.002 : formAge < 50 ? 0.005 : 0.015
                        const expenseLoad = premium * 0.15 // ~15% expenses/commissions
                        const coi = faceAmount * mortalityRate // Cost of Insurance (simplified)
                        const toCashValue = Math.max(0, premium - expenseLoad - coi)
                        
                        const expensePercent = (expenseLoad / premium * 100).toFixed(1)
                        const coiPercent = (coi / premium * 100).toFixed(1)
                        const cvPercent = (toCashValue / premium * 100).toFixed(1)
                        
                        return (
                          <div className="premium-allocation">
                            <h5>Year 1 Premium Allocation (Estimated)</h5>
                            <div className="allocation-bars">
                              <div className="allocation-item">
                                <div className="allocation-bar" style={{ width: `${Math.min(100, parseFloat(cvPercent))}%`, background: '#10b981' }}></div>
                                <div className="allocation-details">
                                  <span className="allocation-label">💰 Cash Value</span>
                                  <span className="allocation-value">{formatCurrency(toCashValue)} ({cvPercent}%)</span>
                                </div>
                              </div>
                              <div className="allocation-item">
                                <div className="allocation-bar" style={{ width: `${Math.min(100, parseFloat(coiPercent))}%`, background: '#f59e0b' }}></div>
                                <div className="allocation-details">
                                  <span className="allocation-label">🛡️ Cost of Insurance (COI)</span>
                                  <span className="allocation-value">{formatCurrency(coi)} ({coiPercent}%)</span>
                                </div>
                              </div>
                              <div className="allocation-item">
                                <div className="allocation-bar" style={{ width: `${Math.min(100, parseFloat(expensePercent))}%`, background: '#6b7280' }}></div>
                                <div className="allocation-details">
                                  <span className="allocation-label">📋 Expenses & Fees</span>
                                  <span className="allocation-value">{formatCurrency(expenseLoad)} ({expensePercent}%)</span>
                                </div>
                              </div>
                            </div>
                            <p className="allocation-note">
                              <small>Year 1 has highest expenses. By year 5+, ~75% goes to cash value. COI increases with age.</small>
                            </p>
                          </div>
                        )
                      })()}

                      {sevenPayInfo && (
                        <p className="mec-limit-note">
                          <strong>MEC Limit for age {formAge}:</strong> Max {formatCurrency(sevenPayInfo.perMillion)} premium per $1M of death benefit. All options above are MEC-safe.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Payment Period Comparison */}
                  {policyForm.insuredDob && (planningMode === 'coverage_first' ? policyForm.faceAmount : policyForm.annualPremium) && (
                    <div className="payment-comparison">
                      <h5>Payment Period Comparison (MEC-Safe)</h5>
                      <table className="comparison-table">
                        <thead>
                          <tr>
                            <th>Pay Period</th>
                            <th>Annual Premium</th>
                            <th>Total Paid</th>
                            <th>MEC Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentComparison.map((opt) => (
                            <tr 
                              key={opt.years} 
                              className={`${String(opt.years) === policyForm.premiumPaymentYears ? 'selected' : ''} ${opt.isMecAdjusted ? 'mec-adjusted-row' : ''}`}
                            >
                              <td>{opt.years} years</td>
                              <td>
                                {formatCurrency(opt.annualPremium)}
                                {opt.isMecAdjusted && (
                                  <small className="original-premium"> (was {formatCurrency(opt.actuarialPremium)})</small>
                                )}
                              </td>
                              <td>{formatCurrency(opt.totalPremiums)}</td>
                              <td className={opt.isMecAdjusted ? 'adjusted' : 'ok'}>
                                {opt.isMecAdjusted ? '⚡ Capped' : '✓ OK'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="comparison-note">
                        <small>⚡ Capped = Premium reduced to stay under 7-pay MEC limit. You pay less but cash value grows slower.</small>
                      </p>
                    </div>
                  )}
                </div>

                <div className="form-section">
                  <h4>Policy Details (Optional)</h4>
                  <div className="form-grid">
                    <label>
                      Carrier
                      <input
                        type="text"
                        value={policyForm.carrier}
                        onChange={(e) => setPolicyForm({ ...policyForm, carrier: e.target.value })}
                        placeholder="e.g., Northwestern Mutual"
                      />
                    </label>
                    <label>
                      Policy Number
                      <input
                        type="text"
                        value={policyForm.policyNumber}
                        onChange={(e) => setPolicyForm({ ...policyForm, policyNumber: e.target.value })}
                        placeholder="Optional"
                      />
                    </label>
                  <label>
                    Guaranteed Interest Rate
                    <input
                      type="number"
                      step="0.001"
                      value={policyForm.guaranteedRate}
                      onChange={(e) => setPolicyForm({ ...policyForm, guaranteedRate: e.target.value })}
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={policyForm.isParticipating}
                      onChange={(e) => setPolicyForm({ ...policyForm, isParticipating: e.target.checked })}
                    />
                    Participating (Pays Dividends)
                  </label>
                  {policyForm.isParticipating && (
                    <>
                      <label>
                        Expected Dividend Rate
                        <input
                          type="number"
                          step="0.001"
                          value={policyForm.dividendRate}
                          onChange={(e) => setPolicyForm({ ...policyForm, dividendRate: e.target.value })}
                        />
                      </label>
                      <label>
                        Dividend Option
                        <select
                          value={policyForm.dividendOption}
                          onChange={(e) => setPolicyForm({ ...policyForm, dividendOption: e.target.value })}
                        >
                          <option value="paid_up_additions">Paid-Up Additions</option>
                          <option value="cash">Cash</option>
                          <option value="premium_reduction">Premium Reduction</option>
                          <option value="accumulate">Accumulate at Interest</option>
                        </select>
                      </label>
                    </>
                  )}
                    <label>
                      Loan Interest Rate
                      <input
                        type="number"
                        step="0.001"
                        value={policyForm.loanInterestRate}
                        onChange={(e) => setPolicyForm({ ...policyForm, loanInterestRate: e.target.value })}
                      />
                    </label>
                  </div>
                  <label>
                    Notes
                    <textarea
                      value={policyForm.notes}
                      onChange={(e) => setPolicyForm({ ...policyForm, notes: e.target.value })}
                      rows={2}
                    />
                  </label>
                </div>
                {formError && <p className="error">{formError}</p>}
                <div className="modal-actions">
                  <button type="button" onClick={() => setIsCreateModalOpen(false)} disabled={formStatus === 'saving'}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={formStatus === 'saving'}>
                    {formStatus === 'saving' ? 'Creating...' : 'Create Policy'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Render detail view
  if (!selectedPolicy) {
    return (
      <div className="life-insurance-board">
        <button type="button" className="back-btn" onClick={() => setSelectedPolicyId(null)}>
          ← Back to Policies
        </button>
        {detailStatus === 'loading' && <p className="loading">Loading policy details...</p>}
      </div>
    )
  }

  const projections = selectedPolicy.projections || []
  const hasMec = mecAnalysis !== null
  const lapsedProjection = projections.find((p) => p.lapsed)

  return (
    <div className="life-insurance-board policy-detail">
      <div className="detail-header">
        <button type="button" className="back-btn" onClick={() => setSelectedPolicyId(null)}>
          ← Back to Policies
        </button>
        <div className="detail-actions">
          <button type="button" onClick={openEditModal}>Edit Policy</button>
          <button type="button" className="btn-danger" onClick={() => setPendingDelete(selectedPolicy.id)}>
            Delete
          </button>
        </div>
      </div>

      <div className="policy-overview">
        <h2>{selectedPolicy.carrier || 'Policy'}{selectedPolicy.policyNumber ? ` - #${selectedPolicy.policyNumber}` : ''}</h2>
        <div className="overview-grid">
          <div>
            <span className="label">Insured</span>
            <span>{selectedPolicy.insuredName || '—'}</span>
          </div>
          <div>
            <span className="label">Date of Birth</span>
            <span>{formatDate(selectedPolicy.insuredDob)}</span>
          </div>
          <div>
            <span className="label">Issue Date</span>
            <span>{formatDate(selectedPolicy.issueDate)}</span>
          </div>
          <div>
            <span className="label">Face Amount</span>
            <span>{formatCurrency(Number(selectedPolicy.faceAmount))}</span>
          </div>
          <div>
            <span className="label">Annual Premium</span>
            <span>{formatCurrency(Number(selectedPolicy.annualPremium))}</span>
          </div>
          <div>
            <span className="label">Premium Years</span>
            <span>{selectedPolicy.premiumPaymentYears} years</span>
          </div>
          <div>
            <span className="label">Guaranteed Rate</span>
            <span>{(Number(selectedPolicy.guaranteedRate) * 100).toFixed(1)}%</span>
          </div>
          <div>
            <span className="label">Dividend Rate</span>
            <span>{selectedPolicy.isParticipating ? `${(Number(selectedPolicy.dividendRate || 0) * 100).toFixed(1)}%` : 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* MEC Warning */}
      {hasMec && mecAnalysis && (
        <div className="mec-warning detailed">
          <div className="mec-header">
            <strong>⚠️ MEC Alert:</strong> This policy becomes a Modified Endowment Contract in Year {mecAnalysis.yearBecameMec} (Age {mecAnalysis.ageBecameMec})
          </div>
          
          <div className="mec-explanation">
            <h4>Why is this a MEC?</h4>
            <p>
              The IRS 7-Pay Test limits how quickly you can fund a life insurance policy. 
              If cumulative premiums exceed the maximum allowed (as if you paid evenly over 7 years), 
              the policy loses its tax-advantaged status.
            </p>
            <div className="mec-numbers">
              <div className="mec-stat">
                <span className="label">Your Cumulative Premium (Year {mecAnalysis.yearBecameMec})</span>
                <span className="value over">{formatCurrency(mecAnalysis.cumulativePremiumAtMec)}</span>
              </div>
              <div className="mec-stat">
                <span className="label">7-Pay Limit (Year {mecAnalysis.yearBecameMec})</span>
                <span className="value limit">{formatCurrency(mecAnalysis.sevenPayLimitAtMec)}</span>
              </div>
              <div className="mec-stat">
                <span className="label">Overfunded By</span>
                <span className="value over">{formatCurrency(mecAnalysis.overage)}</span>
              </div>
            </div>
          </div>

          <div className="mec-consequences">
            <h4>Tax Consequences</h4>
            <ul>
              <li>Withdrawals and loans are taxed as <strong>income</strong> (gains come out first, LIFO)</li>
              <li><strong>10% penalty</strong> on gains if taken before age 59½</li>
              <li>Death benefit remains income tax-free to beneficiaries</li>
            </ul>
          </div>

          <div className="mec-solutions">
            <h4>How to Avoid MEC Status</h4>
            <p>Choose <strong>one</strong> of these options when setting up your policy:</p>
            <table className="mec-options-table">
              <thead>
                <tr>
                  <th>Option</th>
                  <th>Current Value</th>
                  <th>Recommended Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Reduce Annual Premium</strong>
                    <small>Pay less each year to stay under the 7-pay limit</small>
                  </td>
                  <td>{formatCurrency(mecAnalysis.currentAnnualPremium)}</td>
                  <td className="recommended">{formatCurrency(Math.floor(mecAnalysis.maxAnnualPremium))} or less</td>
                </tr>
                <tr>
                  <td>
                    <strong>Increase Face Amount</strong>
                    <small>Higher death benefit = higher 7-pay limit</small>
                  </td>
                  <td>{formatCurrency(mecAnalysis.currentFaceAmount)}</td>
                  <td className="recommended">{formatCurrency(Math.ceil(mecAnalysis.requiredFaceAmount / 10000) * 10000)} or more</td>
                </tr>
                <tr>
                  <td>
                    <strong>Extend Payment Period</strong>
                    <small>Spread payments over more years</small>
                  </td>
                  <td>{mecAnalysis.currentPremiumYears} years</td>
                  <td className="recommended">
                    {mecAnalysis.yearsNeededForCurrentPremium > mecAnalysis.currentPremiumYears 
                      ? `${mecAnalysis.yearsNeededForCurrentPremium}+ years`
                      : 'Already optimal'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mec-note">
            <small>
              <strong>Note:</strong> Some investors intentionally create MECs for maximum cash value accumulation 
              if they don't plan to take loans/withdrawals before 59½ or don't mind the tax treatment.
            </small>
          </div>
        </div>
      )}

      {/* Lapse Warning */}
      {lapsedProjection && (
        <div className="lapse-warning">
          <strong>⚠️ Lapse Warning:</strong> Policy may lapse at age {lapsedProjection.age} (Year {lapsedProjection.policyYear}).
          {lapsedProjection.lapseReason && ` Reason: ${lapsedProjection.lapseReason}`}
        </div>
      )}

      {/* Withdrawal Schedule */}
      <div className="withdrawals-section">
        <div className="section-header">
          <h3>Withdrawal Schedule</h3>
          <button type="button" onClick={() => setIsWithdrawalModalOpen(true)}>+ Add Withdrawal</button>
        </div>
        {selectedPolicy.withdrawals.length === 0 ? (
          <p className="muted">No withdrawals scheduled. Add a withdrawal to see how loans affect your policy.</p>
        ) : (
          <table className="withdrawals-table">
            <thead>
              <tr>
                <th>Start Age</th>
                <th>Annual Amount</th>
                <th>Years</th>
                <th>Type</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {selectedPolicy.withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>{w.startAge}</td>
                  <td>{formatCurrency(Number(w.annualAmount))}</td>
                  <td>{w.years}</td>
                  <td>{w.withdrawalType === 'loan' ? 'Policy Loan' : 'Partial Surrender'}</td>
                  <td>{formatCurrency(Number(w.annualAmount) * w.years)}</td>
                  <td>
                    <button type="button" className="btn-small" onClick={() => handleDeleteWithdrawal(w.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Projections Table */}
      <div className="projections-section">
        <div className="projections-header">
          <h3>Year-Over-Year Projections</h3>
          <div className="projections-controls">
            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={showOnlyActivityYears}
                onChange={(e) => setShowOnlyActivityYears(e.target.checked)}
              />
              Show only years with activity
            </label>
            <button 
              type="button" 
              className="btn-export"
              onClick={() => {
                // Build CSV content
                const headers = ['Age', 'Premium', 'Premium→CV', 'Premium→COI', 'Premium→Expenses', 'Cash Value', 'Death Benefit', 'PUA→CV', 'PUA→DB', 'Withdrawal', 'Loan Balance', 'Net Cash Value', 'Net Death Benefit', 'MEC', 'Lapsed']
                const rows = projections.map(p => [
                  p.age,
                  p.premium,
                  (p.premiumToCv || 0).toFixed(2),
                  (p.premiumToCoi || 0).toFixed(2),
                  (p.premiumToExpenses || 0).toFixed(2),
                  p.cashValue.toFixed(2),
                  p.deathBenefit.toFixed(2),
                  (p.puaDividendToCv || 0).toFixed(2),
                  (p.puaDividendToDb || 0).toFixed(2),
                  getWithdrawalForAge(p.age) || '',
                  p.loanBalance.toFixed(2),
                  p.netCashValue.toFixed(2),
                  p.netDeathBenefit.toFixed(2),
                  p.isMec ? 'Yes' : 'No',
                  p.lapsed ? 'Yes' : 'No'
                ])
                
                // Add policy info at top
                const policyInfo = [
                  ['Policy Information'],
                  ['Face Amount', selectedPolicy?.faceAmount],
                  ['Annual Premium', selectedPolicy?.annualPremium],
                  ['Premium Years', selectedPolicy?.premiumPaymentYears],
                  ['Issue Age', projections[0]?.age - 1],
                  ['Guaranteed Rate', selectedPolicy?.guaranteedRate],
                  ['Dividend Rate', selectedPolicy?.dividendRate || 'N/A'],
                  ['Loan Interest Rate', selectedPolicy?.loanInterestRate],
                  [''],
                  ['Withdrawals'],
                  ...(selectedPolicy?.withdrawals.map(w => [`Age ${w.startAge} for ${w.years} years`, w.annualAmount]) || []),
                  [''],
                ]
                
                const csvContent = [
                  ...policyInfo.map(row => row.join(',')),
                  headers.join(','),
                  ...rows.map(row => row.join(','))
                ].join('\n')
                
                // Download
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                const link = document.createElement('a')
                link.href = URL.createObjectURL(blob)
                link.download = `life-insurance-projection-${selectedPolicy?.carrier || 'policy'}-${new Date().toISOString().split('T')[0]}.csv`
                link.click()
              }}
            >
              📊 Export to CSV
            </button>
          </div>
        </div>
        <p className="section-hint">Enter a loan amount in any age to see how it affects the policy. Press Enter to add.</p>
        {projections.length === 0 ? (
          <p className="muted">No projections available.</p>
        ) : (
          <>
            <div className="projections-table-wrapper">
              <table className="projections-table full-projections">
                <thead>
                  <tr>
                    <th>Age</th>
                    <th>Premium</th>
                    <th colSpan={3} className="breakdown-header">Premium Allocation</th>
                    <th>Cash Value</th>
                    <th>Death Benefit</th>
                    <th colSpan={2} className="breakdown-header">PUA (from Dividends)</th>
                    <th className="loan-column">Add Loan</th>
                    <th>Loan Balance</th>
                    <th>Net Cash Value</th>
                    <th>Net Death Benefit</th>
                    <th>MEC</th>
                  </tr>
                  <tr className="subheader">
                    <th></th>
                    <th></th>
                    <th className="breakdown-sub">→ CV</th>
                    <th className="breakdown-sub">→ COI</th>
                    <th className="breakdown-sub">→ Exp.</th>
                    <th></th>
                    <th></th>
                    <th className="breakdown-sub">→ CV</th>
                    <th className="breakdown-sub">→ DB</th>
                    <th></th>
                    <th></th>
                    <th></th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {projections
                    .filter((p) => {
                      if (!showOnlyActivityYears) return true
                      const hasWithdrawal = getWithdrawalForAge(p.age) > 0
                      const hasPremium = p.premium > 0
                      const hasLoanBalanceChange = p.loanBalance > 0
                      return hasWithdrawal || hasPremium || hasLoanBalanceChange
                    })
                    .map((p) => {
                      const existingWithdrawal = getWithdrawalForAge(p.age)
                      return (
                        <tr key={p.policyYear} className={`${p.isMec ? 'mec-row' : ''} ${p.lapsed ? 'lapsed-row' : ''} ${existingWithdrawal > 0 ? 'has-withdrawal' : ''}`}>
                          <td>{p.age}</td>
                          <td>{p.premium > 0 ? formatCurrency(p.premium) : '—'}</td>
                          <td className="breakdown-value cv">{p.premiumToCv > 0 ? formatCurrency(p.premiumToCv) : '—'}</td>
                          <td className="breakdown-value coi">{p.premiumToCoi > 0 ? formatCurrency(p.premiumToCoi) : '—'}</td>
                          <td className="breakdown-value exp">{p.premiumToExpenses > 0 ? formatCurrency(p.premiumToExpenses) : '—'}</td>
                          <td>{formatCurrency(p.cashValue)}</td>
                          <td>{formatCurrency(p.deathBenefit)}</td>
                          <td className="breakdown-value pua-cv">{p.puaDividendToCv > 0 ? formatCurrency(p.puaDividendToCv) : '—'}</td>
                          <td className="breakdown-value pua-db">{p.puaDividendToDb > 0 ? formatCurrency(p.puaDividendToDb) : '—'}</td>
                          <td className="loan-input-cell">
                            {existingWithdrawal > 0 ? (
                              <span className="existing-withdrawal" title="Withdrawal already scheduled">
                                {formatCurrency(existingWithdrawal)}
                              </span>
                            ) : (
                              <input
                                type="number"
                                className="inline-loan-input"
                                placeholder="—"
                                value={inlineLoanInputs[p.age] || ''}
                                onChange={(e) => setInlineLoanInputs(prev => ({ ...prev, [p.age]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    handleInlineLoanAdd(p.age)
                                  }
                                }}
                                onBlur={() => {
                                  if (inlineLoanInputs[p.age]) {
                                    handleInlineLoanAdd(p.age)
                                  }
                                }}
                                disabled={addingLoanForAge === p.age || p.lapsed}
                              />
                            )}
                          </td>
                          <td className={p.loanBalance > 0 ? 'has-loan' : ''}>{p.loanBalance > 0 ? formatCurrency(p.loanBalance) : '—'}</td>
                          <td className={p.netCashValue < 0 ? 'negative' : ''}>{formatCurrency(p.netCashValue)}</td>
                          <td>{formatCurrency(p.netDeathBenefit)}</td>
                          <td>{p.isMec ? '⚠️' : '✓'}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Edit Policy Modal */}
      {isEditModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Policy</h3>
            <form onSubmit={handleUpdatePolicy}>
              {/* Planning Mode Selector */}
              <div className="planning-mode-selector">
                <span className="planning-label">Planning Mode:</span>
                <div className="planning-options">
                  <label className={`planning-option ${planningMode === 'coverage_first' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="editPlanningMode"
                      checked={planningMode === 'coverage_first'}
                      onChange={() => setPlanningMode('coverage_first')}
                    />
                    Coverage First
                  </label>
                  <label className={`planning-option ${planningMode === 'budget_first' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="editPlanningMode"
                      checked={planningMode === 'budget_first'}
                      onChange={() => setPlanningMode('budget_first')}
                    />
                    Budget First
                  </label>
                  <label className={`planning-option ${planningMode === 'manual' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="editPlanningMode"
                      checked={planningMode === 'manual'}
                      onChange={() => setPlanningMode('manual')}
                    />
                    Manual Entry
                  </label>
                </div>
              </div>

              <div className="form-section">
                <h4>Insured Information</h4>
                <div className="form-grid">
                  <label>
                    Insured Name
                    <input
                      type="text"
                      value={policyForm.insuredName}
                      onChange={(e) => setPolicyForm({ ...policyForm, insuredName: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>
                  <label>
                    Date of Birth *
                    <input
                      type="date"
                      value={policyForm.insuredDob}
                      onChange={(e) => setPolicyForm({ ...policyForm, insuredDob: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Sex *
                    <select
                      value={policyForm.insuredSex}
                      onChange={(e) => setPolicyForm({ ...policyForm, insuredSex: e.target.value })}
                      required
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </label>
                  <label>
                    Health Class *
                    <select
                      value={policyForm.healthClass}
                      onChange={(e) => setPolicyForm({ ...policyForm, healthClass: e.target.value })}
                      required
                    >
                      <option value="preferred_plus">Preferred Plus</option>
                      <option value="preferred">Preferred</option>
                      <option value="standard">Standard</option>
                      <option value="substandard">Substandard</option>
                    </select>
                  </label>
                </div>
                {policyForm.insuredDob && (
                  <p className="age-display">Age: {formAge} years old</p>
                )}
              </div>

              <div className="form-section">
                <h4>Policy Configuration</h4>
                <div className="form-grid">
                  {planningMode === 'coverage_first' && (
                    <>
                      <label>
                        Death Benefit (Face Amount) *
                        <input
                          type="number"
                          value={policyForm.faceAmount}
                          onChange={(e) => setPolicyForm({ ...policyForm, faceAmount: e.target.value })}
                          placeholder="e.g., 500000"
                          required
                        />
                      </label>
                      <label>
                        Premium Payment Years *
                        <select
                          value={policyForm.premiumPaymentYears}
                          onChange={(e) => setPolicyForm({ ...policyForm, premiumPaymentYears: e.target.value })}
                          required
                        >
                          <option value="10">10 years</option>
                          <option value="15">15 years</option>
                          <option value="20">20 years</option>
                          <option value="30">30 years</option>
                          <option value="65">Pay to age 65</option>
                        </select>
                      </label>
                    </>
                  )}
                  {planningMode === 'budget_first' && (
                    <>
                      <label>
                        Annual Premium Budget *
                        <input
                          type="number"
                          value={policyForm.annualPremium}
                          onChange={(e) => setPolicyForm({ ...policyForm, annualPremium: e.target.value })}
                          placeholder="e.g., 10000"
                          required
                        />
                      </label>
                      <label>
                        Premium Payment Years *
                        <select
                          value={policyForm.premiumPaymentYears}
                          onChange={(e) => setPolicyForm({ ...policyForm, premiumPaymentYears: e.target.value })}
                          required
                        >
                          <option value="10">10 years</option>
                          <option value="15">15 years</option>
                          <option value="20">20 years</option>
                          <option value="30">30 years</option>
                          <option value="65">Pay to age 65</option>
                        </select>
                      </label>
                    </>
                  )}
                  {planningMode === 'manual' && (
                    <>
                      <label>
                        Death Benefit (Face Amount) *
                        <input
                          type="number"
                          value={policyForm.faceAmount}
                          onChange={(e) => setPolicyForm({ ...policyForm, faceAmount: e.target.value })}
                          placeholder="e.g., 500000"
                          required
                        />
                      </label>
                      <label>
                        Annual Premium *
                        <input
                          type="number"
                          value={policyForm.annualPremium}
                          onChange={(e) => setPolicyForm({ ...policyForm, annualPremium: e.target.value })}
                          placeholder="e.g., 8500"
                          required
                        />
                      </label>
                      <label>
                        Premium Payment Years *
                        <input
                          type="number"
                          value={policyForm.premiumPaymentYears}
                          onChange={(e) => setPolicyForm({ ...policyForm, premiumPaymentYears: e.target.value })}
                          required
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Issue/Start Date *
                    <input
                      type="date"
                      value={policyForm.issueDate}
                      onChange={(e) => setPolicyForm({ ...policyForm, issueDate: e.target.value })}
                      required
                    />
                  </label>
                </div>

                {/* Estimation Display - Coverage First */}
                {planningMode === 'coverage_first' && premiumEstimate && policyForm.faceAmount && (
                  <div className={`estimation-box ${premiumEstimate.isMecAdjusted ? 'mec-adjusted' : ''}`}>
                    <div className="estimation-result">
                      <span className="estimation-label">Annual Premium (MEC-Safe):</span>
                      <span className="estimation-value">{formatCurrency(premiumEstimate.mecSafePremium)}</span>
                    </div>
                    
                    {premiumEstimate.isMecAdjusted && (
                      <div className="mec-adjustment-info">
                        <div className="adjustment-header">
                          <span className="adjustment-icon">💡</span>
                          <strong>Tax-Advantaged Adjustment</strong>
                        </div>
                        <p className="adjustment-explanation">
                          Typical: {formatCurrency(premiumEstimate.actuarialPremium)}/yr → MEC-Safe: {formatCurrency(premiumEstimate.mecSafePremium)}/yr
                          (saves {formatCurrency(premiumEstimate.savingsFromMecLimit)}/yr)
                        </p>
                      </div>
                    )}
                    
                    {!premiumEstimate.isMecAdjusted && (
                      <p className="estimation-note success">✓ Within 7-pay limit</p>
                    )}
                  </div>
                )}

                {/* Estimation Display - Budget First */}
                {planningMode === 'budget_first' && faceAmountEstimate && policyForm.annualPremium && (
                  <div className={`estimation-box ${faceAmountEstimate.isMecAdjusted ? 'mec-adjusted' : ''}`}>
                    <div className="estimation-result">
                      <span className="estimation-label">Death Benefit (MEC-Safe):</span>
                      <span className="estimation-value">{formatCurrency(faceAmountEstimate.mecSafeFaceAmount)}</span>
                    </div>
                    
                    {faceAmountEstimate.isMecAdjusted && (
                      <div className="mec-adjustment-info">
                        <div className="adjustment-header">
                          <span className="adjustment-icon">💡</span>
                          <strong>Tax-Advantaged Adjustment</strong>
                        </div>
                        <p className="adjustment-explanation">
                          Typical: {formatCurrency(faceAmountEstimate.actuarialFaceAmount)} → MEC-Safe: {formatCurrency(faceAmountEstimate.mecSafeFaceAmount)}
                          (+{formatCurrency(faceAmountEstimate.extraCoverage)} extra coverage)
                        </p>
                      </div>
                    )}
                    
                    {!faceAmountEstimate.isMecAdjusted && (
                      <p className="estimation-note success">✓ Within 7-pay limit</p>
                    )}
                  </div>
                )}
              </div>

              <div className="form-section">
                <h4>Policy Details</h4>
                <div className="form-grid">
                  <label>
                    Carrier
                    <input
                      type="text"
                      value={policyForm.carrier}
                      onChange={(e) => setPolicyForm({ ...policyForm, carrier: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>
                  <label>
                    Policy Number
                    <input
                      type="text"
                      value={policyForm.policyNumber}
                      onChange={(e) => setPolicyForm({ ...policyForm, policyNumber: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>
                  <label>
                    Guaranteed Interest Rate
                    <input
                      type="number"
                      step="0.001"
                      value={policyForm.guaranteedRate}
                      onChange={(e) => setPolicyForm({ ...policyForm, guaranteedRate: e.target.value })}
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={policyForm.isParticipating}
                      onChange={(e) => setPolicyForm({ ...policyForm, isParticipating: e.target.checked })}
                    />
                    Participating (Pays Dividends)
                  </label>
                  {policyForm.isParticipating && (
                    <>
                      <label>
                        Expected Dividend Rate
                        <input
                          type="number"
                          step="0.001"
                          value={policyForm.dividendRate}
                          onChange={(e) => setPolicyForm({ ...policyForm, dividendRate: e.target.value })}
                        />
                      </label>
                      <label>
                        Dividend Option
                        <select
                          value={policyForm.dividendOption}
                          onChange={(e) => setPolicyForm({ ...policyForm, dividendOption: e.target.value })}
                        >
                          <option value="paid_up_additions">Paid-Up Additions (PUAs)</option>
                          <option value="cash">Cash Payment</option>
                          <option value="premium_reduction">Reduce Premium</option>
                          <option value="accumulate">Accumulate at Interest</option>
                        </select>
                      </label>
                    </>
                  )}
                  <label>
                    Loan Interest Rate
                    <input
                      type="number"
                      step="0.001"
                      value={policyForm.loanInterestRate}
                      onChange={(e) => setPolicyForm({ ...policyForm, loanInterestRate: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="form-section">
                <label>
                  Notes
                  <textarea
                    value={policyForm.notes}
                    onChange={(e) => setPolicyForm({ ...policyForm, notes: e.target.value })}
                    rows={3}
                    placeholder="Optional notes about this policy..."
                  />
                </label>
              </div>

              {formError && <p className="error">{formError}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setIsEditModalOpen(false)} disabled={formStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={formStatus === 'saving'}>
                  {formStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Withdrawal Modal */}
      {isWithdrawalModalOpen && (
        <div className="modal-overlay" onClick={() => setIsWithdrawalModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Withdrawal Schedule</h3>
            <form onSubmit={handleAddWithdrawal}>
              <label>
                Start Age *
                <input
                  type="number"
                  value={withdrawalForm.startAge}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, startAge: e.target.value })}
                  required
                />
              </label>
              <label>
                Annual Amount *
                <input
                  type="number"
                  value={withdrawalForm.annualAmount}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, annualAmount: e.target.value })}
                  placeholder="e.g., 25000"
                  required
                />
              </label>
              <label>
                Number of Years *
                <input
                  type="number"
                  value={withdrawalForm.years}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, years: e.target.value })}
                  required
                />
              </label>
              <label>
                Withdrawal Type
                <select
                  value={withdrawalForm.withdrawalType}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, withdrawalType: e.target.value })}
                >
                  <option value="loan">Policy Loan (tax-free)</option>
                  <option value="partial_surrender">Partial Surrender (may be taxable)</option>
                </select>
              </label>
              {formError && <p className="error">{formError}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setIsWithdrawalModalOpen(false)} disabled={formStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={formStatus === 'saving'}>
                  {formStatus === 'saving' ? 'Adding...' : 'Add Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div className="modal-overlay" onClick={() => setPendingDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Policy?</h3>
            <p>Are you sure you want to delete this policy? This action cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={deleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={handleDeletePolicy} disabled={deleteStatus === 'saving'}>
                {deleteStatus === 'saving' ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
