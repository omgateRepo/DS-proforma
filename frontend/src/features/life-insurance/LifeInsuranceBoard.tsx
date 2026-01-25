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
// These are approximations based on industry averages
const PREMIUM_RATES: Record<string, Record<string, Record<number, number>>> = {
  male: {
    preferred_plus: { 25: 6, 30: 7, 35: 9, 40: 12, 45: 16, 50: 21, 55: 28, 60: 38, 65: 52 },
    preferred: { 25: 7, 30: 8, 35: 11, 40: 14, 45: 19, 50: 25, 55: 33, 60: 44, 65: 60 },
    standard: { 25: 9, 30: 10, 35: 14, 40: 18, 45: 24, 50: 32, 55: 42, 60: 55, 65: 75 },
    substandard: { 25: 12, 30: 14, 35: 19, 40: 25, 45: 33, 50: 44, 55: 58, 60: 76, 65: 103 },
  },
  female: {
    preferred_plus: { 25: 5, 30: 6, 35: 8, 40: 10, 45: 14, 50: 18, 55: 24, 60: 33, 65: 45 },
    preferred: { 25: 6, 30: 7, 35: 9, 40: 12, 45: 16, 50: 22, 55: 29, 60: 38, 65: 52 },
    standard: { 25: 8, 30: 9, 35: 12, 40: 15, 45: 20, 50: 27, 55: 36, 60: 48, 65: 65 },
    substandard: { 25: 10, 30: 12, 35: 16, 40: 21, 45: 28, 50: 37, 55: 50, 60: 66, 65: 90 },
  },
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

// Estimate annual premium given face amount
function estimatePremium(
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

// Estimate face amount given premium budget
function estimateFaceAmount(
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
  return Math.max(18, Math.min(80, age))
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
  cashValue: number
  surrenderValue: number
  deathBenefit: number
  puaCashValue: number
  puaDeathBenefit: number
  dividendAmount: number
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

export function LifeInsuranceBoard({ onPolicyCountChange }: { onPolicyCountChange?: () => void }) {
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

  // Computed values for planning
  const formAge = useMemo(() => getAgeFromDob(policyForm.insuredDob), [policyForm.insuredDob])
  
  const estimatedPremium = useMemo(() => {
    if (!policyForm.faceAmount || !policyForm.insuredDob) return null
    return estimatePremium(
      parseFloat(policyForm.faceAmount) || 0,
      formAge,
      policyForm.insuredSex,
      policyForm.healthClass,
      parseInt(policyForm.premiumPaymentYears) || 20
    )
  }, [policyForm.faceAmount, formAge, policyForm.insuredSex, policyForm.healthClass, policyForm.premiumPaymentYears])

  const estimatedFaceAmount = useMemo(() => {
    if (!policyForm.annualPremium || !policyForm.insuredDob) return null
    return estimateFaceAmount(
      parseFloat(policyForm.annualPremium) || 0,
      formAge,
      policyForm.insuredSex,
      policyForm.healthClass,
      parseInt(policyForm.premiumPaymentYears) || 20
    )
  }, [policyForm.annualPremium, formAge, policyForm.insuredSex, policyForm.healthClass, policyForm.premiumPaymentYears])

  // Payment period comparison
  const paymentComparison = useMemo(() => {
    if (!policyForm.insuredDob) return []
    const baseAmount = planningMode === 'coverage_first' 
      ? parseFloat(policyForm.faceAmount) || 500000
      : estimatedFaceAmount || 500000
    
    const periods = [10, 15, 20, 30]
    return periods.map(years => ({
      years,
      annualPremium: estimatePremium(baseAmount, formAge, policyForm.insuredSex, policyForm.healthClass, years),
      totalPremiums: estimatePremium(baseAmount, formAge, policyForm.insuredSex, policyForm.healthClass, years) * years,
    }))
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
    try {
      await updateLifeInsurancePolicy(selectedPolicyId, {
        policyNumber: policyForm.policyNumber || null,
        carrier: policyForm.carrier || null,
        faceAmount: parseFloat(policyForm.faceAmount),
        issueDate: policyForm.issueDate,
        insuredName: policyForm.insuredName || null,
        insuredDob: policyForm.insuredDob,
        insuredSex: policyForm.insuredSex,
        healthClass: policyForm.healthClass,
        annualPremium: parseFloat(policyForm.annualPremium),
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
    setIsEditModalOpen(true)
  }

  // Render list view
  if (!selectedPolicyId) {
    return (
      <div className="life-insurance-board">
        <div className="board-header">
          <h2>Life Insurance Policies</h2>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setPolicyForm(defaultPolicyForm)
              setIsCreateModalOpen(true)
            }}
          >
            + Add Policy
          </button>
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

                  {/* Estimation Display */}
                  {planningMode === 'coverage_first' && estimatedPremium && policyForm.faceAmount && (
                    <div className="estimation-box">
                      <div className="estimation-result">
                        <span className="estimation-label">Estimated Annual Premium:</span>
                        <span className="estimation-value">{formatCurrency(estimatedPremium)}</span>
                      </div>
                      <p className="estimation-note">
                        For {formatCurrency(parseFloat(policyForm.faceAmount))} coverage over {policyForm.premiumPaymentYears} years
                      </p>
                    </div>
                  )}
                  {planningMode === 'budget_first' && estimatedFaceAmount && policyForm.annualPremium && (
                    <div className="estimation-box">
                      <div className="estimation-result">
                        <span className="estimation-label">Estimated Death Benefit:</span>
                        <span className="estimation-value">{formatCurrency(estimatedFaceAmount)}</span>
                      </div>
                      <p className="estimation-note">
                        With {formatCurrency(parseFloat(policyForm.annualPremium))}/yr premium over {policyForm.premiumPaymentYears} years
                      </p>
                    </div>
                  )}

                  {/* Payment Period Comparison */}
                  {policyForm.insuredDob && (planningMode === 'coverage_first' ? policyForm.faceAmount : policyForm.annualPremium) && (
                    <div className="payment-comparison">
                      <h5>Payment Period Comparison</h5>
                      <table className="comparison-table">
                        <thead>
                          <tr>
                            <th>Pay Period</th>
                            <th>Annual Premium</th>
                            <th>Total Paid</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentComparison.map((opt) => (
                            <tr 
                              key={opt.years} 
                              className={String(opt.years) === policyForm.premiumPaymentYears ? 'selected' : ''}
                            >
                              <td>{opt.years} years</td>
                              <td>{formatCurrency(opt.annualPremium)}</td>
                              <td>{formatCurrency(opt.totalPremiums)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
  const hasMec = projections.some((p) => p.isMec)
  const firstMecYear = projections.find((p) => p.isMec)?.policyYear
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
      {hasMec && (
        <div className="mec-warning">
          <strong>⚠️ MEC Alert:</strong> This policy becomes a Modified Endowment Contract in Year {firstMecYear}.
          Loans and withdrawals will be taxed as income (gains first) with a 10% penalty if under age 59½.
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
        <h3>Year-Over-Year Projections</h3>
        {projections.length === 0 ? (
          <p className="muted">No projections available.</p>
        ) : (
          <>
            <div className="projections-table-wrapper">
              <table className="projections-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Age</th>
                    <th>Premium</th>
                    <th>Cumulative Premium</th>
                    <th>Cash Value</th>
                    <th>Death Benefit</th>
                    <th>Loan Balance</th>
                    <th>Net Cash Value</th>
                    <th>Net Death Benefit</th>
                    <th>MEC</th>
                  </tr>
                </thead>
                <tbody>
                  {projections.filter((_, i) => i % 5 === 0 || i < 10).map((p) => (
                    <tr key={p.policyYear} className={`${p.isMec ? 'mec-row' : ''} ${p.lapsed ? 'lapsed-row' : ''}`}>
                      <td>{p.policyYear}</td>
                      <td>{p.age}</td>
                      <td>{formatCurrency(p.premium)}</td>
                      <td>{formatCurrency(p.cumulativePremium)}</td>
                      <td>{formatCurrency(p.cashValue)}</td>
                      <td>{formatCurrency(p.deathBenefit)}</td>
                      <td>{p.loanBalance > 0 ? formatCurrency(p.loanBalance) : '—'}</td>
                      <td className={p.netCashValue < 0 ? 'negative' : ''}>{formatCurrency(p.netCashValue)}</td>
                      <td>{formatCurrency(p.netDeathBenefit)}</td>
                      <td>{p.isMec ? '⚠️' : '✓'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted tiny">Showing every 5th year. Full projection available in detailed view.</p>
          </>
        )}
      </div>

      {/* Edit Policy Modal */}
      {isEditModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Policy</h3>
            <form onSubmit={handleUpdatePolicy}>
              <div className="form-grid">
                <label>
                  Carrier
                  <input
                    type="text"
                    value={policyForm.carrier}
                    onChange={(e) => setPolicyForm({ ...policyForm, carrier: e.target.value })}
                  />
                </label>
                <label>
                  Policy Number
                  <input
                    type="text"
                    value={policyForm.policyNumber}
                    onChange={(e) => setPolicyForm({ ...policyForm, policyNumber: e.target.value })}
                  />
                </label>
                <label>
                  Insured Name
                  <input
                    type="text"
                    value={policyForm.insuredName}
                    onChange={(e) => setPolicyForm({ ...policyForm, insuredName: e.target.value })}
                  />
                </label>
                <label>
                  Insured DOB *
                  <input
                    type="date"
                    value={policyForm.insuredDob}
                    onChange={(e) => setPolicyForm({ ...policyForm, insuredDob: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Face Amount *
                  <input
                    type="number"
                    value={policyForm.faceAmount}
                    onChange={(e) => setPolicyForm({ ...policyForm, faceAmount: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Annual Premium *
                  <input
                    type="number"
                    value={policyForm.annualPremium}
                    onChange={(e) => setPolicyForm({ ...policyForm, annualPremium: e.target.value })}
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
                <label>
                  Guaranteed Interest Rate
                  <input
                    type="number"
                    step="0.001"
                    value={policyForm.guaranteedRate}
                    onChange={(e) => setPolicyForm({ ...policyForm, guaranteedRate: e.target.value })}
                  />
                </label>
                {policyForm.isParticipating && (
                  <label>
                    Expected Dividend Rate
                    <input
                      type="number"
                      step="0.001"
                      value={policyForm.dividendRate}
                      onChange={(e) => setPolicyForm({ ...policyForm, dividendRate: e.target.value })}
                    />
                  </label>
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
