import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ApartmentRevenueRow,
  RetailRevenueRow,
  CarryingCostRow,
  GpContributionRow,
  ParkingRevenueRow,
  ProjectDetail,
  PropertyTaxPhase,
} from '../../types'
import type { EntityId } from '../../types'

type Scenario = 'wc' | 'default' | 'bc'

const scenarioOptions: Array<{ id: Scenario; label: string }> = [
  { id: 'wc', label: 'WC' },
  { id: 'default', label: 'Base' },
  { id: 'bc', label: 'BC' },
]

type RevenueOverride = {
  monthlyRentWC: string
  monthlyRentBC: string
  occupancy: string
  scenario: Scenario
}

type CarryingOverride = {
  wc: string
  bc: string
  scenario: Scenario
}

const defaultScenario: Scenario = 'default'

const getDefaultOccupancy = (vacancyPct?: number | null) => clampPercentage(100 - (vacancyPct ?? 5))

const isParkingRow = (row: ApartmentRevenueRow | ParkingRevenueRow): row is ParkingRevenueRow => 'spaceCount' in row

const createDefaultOverride = (row: ApartmentRevenueRow | ParkingRevenueRow): RevenueOverride => ({
  monthlyRentWC: '',
  monthlyRentBC: '',
  occupancy: String(getDefaultOccupancy('vacancyPct' in row ? row.vacancyPct : undefined)),
  scenario: defaultScenario,
})

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const clampPercentage = (value: string | number, fallback = 95) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(100, parsed))
}

const getPropertyTaxPhase = (row: CarryingCostRow): PropertyTaxPhase => {
  if (row.propertyTaxPhase === 'construction' || row.propertyTaxPhase === 'stabilized') {
    return row.propertyTaxPhase
  }
  if (row.costGroup?.includes('construction')) return 'construction'
  return 'stabilized'
}

const toMonthlyAmount = (row: CarryingCostRow) => {
  const amount = toNumber(row.amountUsd)
  if (!amount) return 0
  if (row.intervalUnit === 'monthly' || !row.intervalUnit) return amount
  if (row.intervalUnit === 'quarterly') return amount / 3
  if (row.intervalUnit === 'yearly') return amount / 12
  return amount
}

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) return '—'
  const prefix = value < 0 ? '-' : ''
  return `${prefix}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

type MetricsTabProps = {
  projectId: EntityId | null
  project: ProjectDetail | null
}

type MetricsPreferences = {
  apartments: Record<string, RevenueOverride>
  retail: Record<string, RevenueOverride>
  parking: Record<string, RevenueOverride>
  buildCostOverride: CarryingOverride
  managementOverride: CarryingOverride
  stabilizedTaxOverride: CarryingOverride
  constructionPeriodMonths: string
  interestRatePct: string
  stabilizedInterestRatePct: string
  stabilizedTermYears: string
  refinanceAmount: string
  salesCostPct: string
  preferredReturnPct: string
  stabilizationPeriodMonths: string
  sellingCapRatePct: string
}

const STORAGE_KEY = 'metrics-preferences-v1'
const isBrowser = typeof window !== 'undefined'

const loadPreferences = (projectId: EntityId | null): MetricsPreferences | null => {
  if (!isBrowser || !projectId) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.[projectId] ?? null
  } catch {
    return null
  }
}

const savePreferences = (projectId: EntityId, prefs: MetricsPreferences) => {
  if (!isBrowser) return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const existing = raw ? JSON.parse(raw) : {}
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, [projectId]: prefs }))
  } catch {
    // ignore storage errors
  }
}

export function MetricsTab({ project, projectId }: MetricsTabProps) {
  const [apartmentOverrides, setApartmentOverrides] = useState<Record<string, RevenueOverride>>({})
  const [retailOverrides, setRetailOverrides] = useState<Record<string, RevenueOverride>>({})
  const [parkingOverrides, setParkingOverrides] = useState<Record<string, RevenueOverride>>({})
  const [buildCostOverride, setBuildCostOverride] = useState<CarryingOverride>({
    wc: '',
    bc: '',
    scenario: 'default',
  })
  const [managementOverride, setManagementOverride] = useState<CarryingOverride>({
    wc: '',
    bc: '',
    scenario: 'default',
  })
  const [stabilizedTaxOverride, setStabilizedTaxOverride] = useState<CarryingOverride>({
    wc: '',
    bc: '',
    scenario: 'default',
  })
  const [constructionPeriodMonths, setConstructionPeriodMonths] = useState('24')
  const [interestRatePct, setInterestRatePct] = useState('6.25')
  const [stabilizedInterestRatePct, setStabilizedInterestRatePct] = useState('5.25')
  const [stabilizedTermYears, setStabilizedTermYears] = useState('30')
  const [refinanceAmount, setRefinanceAmount] = useState('0')
  const [salesCostPct, setSalesCostPct] = useState('2')
  const [preferredReturnPct, setPreferredReturnPct] = useState('0')
  const [stabilizationPeriodMonths, setStabilizationPeriodMonths] = useState('12')
  const [sellingCapRatePct, setSellingCapRatePct] = useState('6')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')
  const hydratingRef = useRef(false)
  const markDirty = () => {
    if (!hydratingRef.current) setSaveStatus('idle')
  }

useEffect(() => {
  hydratingRef.current = true
  if (!project || !projectId) {
    setApartmentOverrides({})
    setRetailOverrides({})
    setParkingOverrides({})
    setBuildCostOverride({ wc: '', bc: '', scenario: defaultScenario })
    setManagementOverride({ wc: '', bc: '', scenario: defaultScenario })
    setStabilizedTaxOverride({ wc: '', bc: '', scenario: defaultScenario })
    setConstructionPeriodMonths('24')
    setInterestRatePct('6.25')
    setStabilizedInterestRatePct('5.25')
    setStabilizedTermYears('30')
    setRefinanceAmount('0')
    setSalesCostPct('2')
    setPreferredReturnPct('0')
    setStabilizationPeriodMonths('12')
    setSellingCapRatePct('6')
    setSaveStatus('idle')
    hydratingRef.current = false
    return
  }

  const stored = loadPreferences(projectId)
  const nextApts: Record<string, RevenueOverride> = {}
  project.revenue?.forEach((row) => {
    nextApts[row.id] = stored?.apartments?.[row.id] ?? createDefaultOverride(row)
  })
  const nextRetail: Record<string, RevenueOverride> = {}
  project.retailRevenue?.forEach((row) => {
    nextRetail[row.id] = stored?.retail?.[row.id] ?? createDefaultOverride(row)
  })
  const nextParking: Record<string, RevenueOverride> = {}
  project.parkingRevenue?.forEach((row) => {
    nextParking[row.id] = stored?.parking?.[row.id] ?? createDefaultOverride(row)
  })
  setApartmentOverrides(nextApts)
  setRetailOverrides(nextRetail)
  setParkingOverrides(nextParking)
  setBuildCostOverride(stored?.buildCostOverride ?? { wc: '', bc: '', scenario: defaultScenario })
  setManagementOverride(stored?.managementOverride ?? { wc: '', bc: '', scenario: defaultScenario })
  setStabilizedTaxOverride(stored?.stabilizedTaxOverride ?? { wc: '', bc: '', scenario: defaultScenario })
  setConstructionPeriodMonths(stored?.constructionPeriodMonths ?? '24')
  setInterestRatePct(stored?.interestRatePct ?? '6.25')
  setStabilizedInterestRatePct(stored?.stabilizedInterestRatePct ?? '5.25')
  setStabilizedTermYears(stored?.stabilizedTermYears ?? '30')
  setRefinanceAmount(stored?.refinanceAmount ?? '0')
  setSalesCostPct(stored?.salesCostPct ?? '2')
  setPreferredReturnPct(stored?.preferredReturnPct ?? '0')
  setStabilizationPeriodMonths(stored?.stabilizationPeriodMonths ?? '12')
  setSellingCapRatePct(stored?.sellingCapRatePct ?? '6')
  setSaveStatus('idle')
  hydratingRef.current = false
}, [project?.id, projectId])

  const handleSavePreferences = () => {
    if (!projectId) return
    const payload: MetricsPreferences = {
      apartments: apartmentOverrides,
      retail: retailOverrides,
      parking: parkingOverrides,
      buildCostOverride,
      managementOverride,
      stabilizedTaxOverride,
      constructionPeriodMonths,
      interestRatePct,
      stabilizedInterestRatePct,
      stabilizedTermYears,
      refinanceAmount,
      salesCostPct,
      preferredReturnPct,
      stabilizationPeriodMonths,
      sellingCapRatePct,
    }
    savePreferences(projectId, payload)
    setSaveStatus('saved')
  }

  if (!project) {
    return (
      <div className="metrics-tab">
        <p className="muted">Select a project to view metrics.</p>
      </div>
    )
  }

  const apartments = project.revenue ?? []
  const retail = project.retailRevenue ?? []
  const parking = project.parkingRevenue ?? []

  const totalApartmentUnits = useMemo(
    () => apartments.reduce((sum, row) => sum + (row.unitCount || 0), 0),
    [apartments],
  )
  const hardCostsTotal = project.hardCosts?.reduce((sum, row) => sum + toNumber(row.amountUsd), 0) ?? 0
  const softCostsTotal = project.softCosts?.reduce((sum, row) => sum + toNumber(row.amountUsd), 0) ?? 0
  const gpContributions: GpContributionRow[] = project.gpContributions ?? []
  const carryingRows: CarryingCostRow[] = project.carryingCosts ?? []
  const gpTotal = gpContributions.reduce((sum, row) => sum + toNumber(row.amountUsd), 0)
  const purchasePrice = toNumber(project.general.purchasePriceUsd)
  const buildableSqft = toNumber(project.general.targetSqft)

  const constructionPeriod = Math.max(0, Math.trunc(toNumber(constructionPeriodMonths)))
  const interestRate = toNumber(interestRatePct)
  const stabilizedRate = Math.max(0, toNumber(stabilizedInterestRatePct))
  const stabilizedTermYearsValue = Math.max(1, toNumber(stabilizedTermYears) || 1)
  const stabilizedTermMonths = Math.max(1, Math.trunc(stabilizedTermYearsValue * 12))
  const refinanceAmountValue = Math.max(0, toNumber(refinanceAmount))

  const propertyTaxRows = carryingRows.filter((row) => row.carryingType === 'property_tax')
  const managementRows = carryingRows.filter((row) => row.carryingType === 'management')

  const constructionTaxMonthly = propertyTaxRows
    .filter((row) => getPropertyTaxPhase(row) === 'construction')
    .reduce((sum, row) => sum + toMonthlyAmount(row), 0)

  const stabilizedTaxMonthlyBase = propertyTaxRows
    .filter((row) => getPropertyTaxPhase(row) === 'stabilized')
    .reduce((sum, row) => sum + toMonthlyAmount(row), 0)

  const managementMonthlyBase = managementRows.reduce((sum, row) => sum + toMonthlyAmount(row), 0)

  const constructionRealEstateForLoan = constructionTaxMonthly * constructionPeriod
  const stabilizedTaxAnnualBase = stabilizedTaxMonthlyBase * 12
  const managementAnnualBase = managementMonthlyBase * 12

  const selectScenarioValue = (override: CarryingOverride, base: number) => {
    if (override.scenario === 'wc') {
      const value = toNumber(override.wc)
      return value || base
    }
    if (override.scenario === 'bc') {
      const value = toNumber(override.bc)
      return value || base
    }
    return base
  }

  const selectedManagementAnnual = selectScenarioValue(managementOverride, managementAnnualBase)
  const selectedStabilizedTaxAnnual = selectScenarioValue(stabilizedTaxOverride, stabilizedTaxAnnualBase)
  const selectedExpensesAnnual = selectedManagementAnnual + selectedStabilizedTaxAnnual

const hardSoftBaseTotal = hardCostsTotal + softCostsTotal
const buildCostPerSqftDefault = buildableSqft > 0 ? hardCostsTotal / buildableSqft : hardCostsTotal
const selectedBuildCostPerSqft = selectScenarioValue(buildCostOverride, buildCostPerSqftDefault)
const selectedHardSoftTotal =
  buildableSqft > 0 ? selectedBuildCostPerSqft * buildableSqft : hardCostsTotal

  const computeRevenueLine = (
    row: ApartmentRevenueRow | ParkingRevenueRow,
    overrides: Record<string, RevenueOverride>,
  ) => {
    const override = overrides[row.id] ?? createDefaultOverride(row)
    const defaultRent = isParkingRow(row) ? toNumber(row.monthlyRentUsd) : toNumber(row.rentBudget)
    const rentWC = toNumber(override.monthlyRentWC) || defaultRent
    const rentBC = toNumber(override.monthlyRentBC) || defaultRent
    const occupancy = clampPercentage(override.occupancy, getDefaultOccupancy(row.vacancyPct))
    const scenario = override.scenario
    const rent = scenario === 'wc' ? rentWC : scenario === 'bc' ? rentBC : defaultRent
    const units = isParkingRow(row) ? row.spaceCount : row.unitCount
    const monthly = units * rent * (occupancy / 100)
    return { rentWC, rentBC, rentDefault: defaultRent, occupancy, scenario, monthly }
  }

  const apartmentSummaries = useMemo(() => {
    return apartments.map((row) => computeRevenueLine(row, apartmentOverrides))
  }, [apartments, apartmentOverrides])

  const retailSummaries = useMemo(() => {
    return retail.map((row) => computeRevenueLine(row, retailOverrides))
  }, [retail, retailOverrides])

  const parkingSummaries = useMemo(() => {
    return parking.map((row) => computeRevenueLine(row, parkingOverrides))
  }, [parking, parkingOverrides])

  const apartmentsMonthlyTotal = apartmentSummaries.reduce((sum, summary) => sum + summary.monthly, 0)
  const retailMonthlyTotal = retailSummaries.reduce((sum, summary) => sum + summary.monthly, 0)
  const parkingMonthlyTotal = parkingSummaries.reduce((sum, summary) => sum + summary.monthly, 0)
  const totalMonthlyRevenue = apartmentsMonthlyTotal + retailMonthlyTotal + parkingMonthlyTotal
  const totalAnnualRevenue = totalMonthlyRevenue * 12

  const loanBase = purchasePrice + selectedHardSoftTotal - gpTotal + constructionRealEstateForLoan
  const interestAccrued = loanBase * (interestRate / 100) * (constructionPeriod / 12)
  const constructionLoanAmount = Math.max(0, loanBase + interestAccrued)
  const loanToCostRatio = constructionLoanAmount + gpTotal === 0 ? 0 : constructionLoanAmount / (constructionLoanAmount + gpTotal)

  const noi = totalAnnualRevenue - selectedExpensesAnnual
  const capRate = constructionLoanAmount + gpTotal === 0 ? 0 : noi / (constructionLoanAmount + gpTotal)

  const stabilizedLoanPrincipal = Math.max(0, constructionLoanAmount + refinanceAmountValue)
  const stabilizedMonthlyRate = stabilizedRate / 100 / 12
  let stabilizedMonthlyDebtService = 0
  if (stabilizedLoanPrincipal && stabilizedTermMonths) {
    if (stabilizedMonthlyRate === 0) {
      stabilizedMonthlyDebtService = stabilizedLoanPrincipal / stabilizedTermMonths
    } else {
      stabilizedMonthlyDebtService =
        (stabilizedLoanPrincipal * stabilizedMonthlyRate * (1 + stabilizedMonthlyRate) ** stabilizedTermMonths) /
        ((1 + stabilizedMonthlyRate) ** stabilizedTermMonths - 1 || 1)
    }
  }
  const stabilizedAnnualDebtService = stabilizedMonthlyDebtService * 12
  const stabilizedDcr = stabilizedAnnualDebtService ? noi / stabilizedAnnualDebtService : null
  const availableCashAnnual = noi - stabilizedAnnualDebtService
  const availableCashMonthly = availableCashAnnual / 12

  // Before Refi calculations (debt service on construction loan only, without refi cash-out)
  const beforeRefiLoanPrincipal = Math.max(0, constructionLoanAmount)
  let beforeRefiMonthlyDebtService = 0
  if (beforeRefiLoanPrincipal && stabilizedTermMonths) {
    if (stabilizedMonthlyRate === 0) {
      beforeRefiMonthlyDebtService = beforeRefiLoanPrincipal / stabilizedTermMonths
    } else {
      beforeRefiMonthlyDebtService =
        (beforeRefiLoanPrincipal * stabilizedMonthlyRate * (1 + stabilizedMonthlyRate) ** stabilizedTermMonths) /
        ((1 + stabilizedMonthlyRate) ** stabilizedTermMonths - 1 || 1)
    }
  }
  const beforeRefiAnnualDebtService = beforeRefiMonthlyDebtService * 12
  const availableCashBeforeRefi = noi - beforeRefiAnnualDebtService

  // Helper to get partner display name
  const getPartnerLabel = (partnerId: string | null | undefined) => {
    if (!partnerId) return 'Unknown'
    if (partnerId === 'LP') return 'LP'
    if (project.owner?.id === partnerId) {
      return project.owner.displayName || project.owner.email || 'Owner'
    }
    const collaborator = project.collaborators?.find((c) => c.userId === partnerId)
    if (collaborator) {
      return collaborator.displayName || collaborator.email || 'Collaborator'
    }
    return partnerId
  }

  const scenarioBadge = (value: Scenario) =>
    scenarioOptions.find((opt) => opt.id === value)?.label ?? 'Base'

  return (
    <div className="metrics-tab">
      <div className="metrics-header">
        <h3>Metrics &amp; Sensitivities</h3>
        <button type="button" className="primary" onClick={handleSavePreferences} disabled={!projectId}>
          Save Preferences
        </button>
        {saveStatus === 'saved' && <span className="muted tiny">Saved</span>}
      </div>

      <section>
        <h3>Revenues (Stabilized)</h3>
        {apartments.length > 0 && (
          <p className="muted tiny">Total apartments: {totalApartmentUnits.toLocaleString()}</p>
        )}
        <div className="metrics-table-wrapper">
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Apartment Type</th>
                <th>Units</th>
                <th>Base Rent</th>
                <th>WC Rent</th>
                <th>BC Rent</th>
                <th>Occupancy %</th>
                <th>Scenario</th>
                <th>Monthly Total</th>
              </tr>
            </thead>
            <tbody>
              {apartments.length === 0 && (
                <tr>
                  <td colSpan={8}>No apartment revenue defined.</td>
                </tr>
              )}
              {apartments.map((row, index) => {
                const override = apartmentOverrides[row.id] ?? createDefaultOverride(row)
                const summary = apartmentSummaries[index]
                return (
                  <tr key={row.id}>
                    <td>{row.typeLabel}</td>
                    <td>{row.unitCount}</td>
                    <td>{formatCurrency(summary.rentDefault)}</td>
                    <td>
                      <input
                        type="number"
                        value={override.monthlyRentWC}
                        onChange={(e) => {
                          setApartmentOverrides((prev) => ({
                            ...prev,
                            [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), monthlyRentWC: e.target.value },
                          }))
                          markDirty()
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={override.monthlyRentBC}
                        onChange={(e) => {
                          setApartmentOverrides((prev) => ({
                            ...prev,
                            [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), monthlyRentBC: e.target.value },
                          }))
                          markDirty()
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={override.occupancy}
                        onChange={(e) => {
                          setApartmentOverrides((prev) => ({
                            ...prev,
                            [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), occupancy: e.target.value },
                          }))
                          markDirty()
                        }}
                      />
                    </td>
                    <td>
                      <div className="scenario-options">
                        {scenarioOptions.map((option) => (
                          <label key={option.id}>
                            <input
                              type="radio"
                              name={`apt-${row.id}`}
                              value={option.id}
                              checked={override.scenario === option.id}
                              onChange={() => {
                                setApartmentOverrides((prev) => ({
                                  ...prev,
                                  [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), scenario: option.id },
                                }))
                                markDirty()
                              }}
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td>{formatCurrency(summary.monthly)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>Apartments Monthly Total</td>
                <td>{formatCurrency(apartmentsMonthlyTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="metrics-table-wrapper">
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Retail Type</th>
                <th>Units</th>
                <th>Base Rent</th>
                <th>WC Rent</th>
                <th>BC Rent</th>
                <th>Occupancy %</th>
                <th>Scenario</th>
                <th>Monthly Total</th>
              </tr>
            </thead>
            <tbody>
              {retail.length === 0 && (
                <tr>
                  <td colSpan={8}>No retail revenue defined.</td>
                </tr>
              )}
              {retail.map((row, index) => {
                const override = retailOverrides[row.id] ?? createDefaultOverride(row)
                const summary = retailSummaries[index]
                return (
                  <tr key={row.id}>
                    <td>{row.typeLabel}</td>
                    <td>{row.unitCount}</td>
                    <td>{formatCurrency(summary.rentDefault)}</td>
                    <td>
                      <input
                        type="number"
                        value={override.monthlyRentWC}
                        onChange={(e) => {
                          setRetailOverrides((prev) => ({
                            ...prev,
                            [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), monthlyRentWC: e.target.value },
                          }))
                          markDirty()
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={override.monthlyRentBC}
                        onChange={(e) => {
                          setRetailOverrides((prev) => ({
                            ...prev,
                            [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), monthlyRentBC: e.target.value },
                          }))
                          markDirty()
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={override.occupancy}
                        onChange={(e) => {
                          setRetailOverrides((prev) => ({
                            ...prev,
                            [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), occupancy: e.target.value },
                          }))
                          markDirty()
                        }}
                      />
                    </td>
                    <td>
                      <div className="scenario-options">
                        {scenarioOptions.map((option) => (
                          <label key={option.id}>
                            <input
                              type="radio"
                              name={`retail-${row.id}`}
                              value={option.id}
                              checked={override.scenario === option.id}
                              onChange={() => {
                                setRetailOverrides((prev) => ({
                                  ...prev,
                                  [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), scenario: option.id },
                                }))
                                markDirty()
                              }}
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td>{formatCurrency(summary.monthly)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>Retail Monthly Total</td>
                <td>{formatCurrency(retailMonthlyTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="metrics-table-wrapper">
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Parking Type</th>
                <th>Spaces</th>
                <th>Base Rent</th>
                <th>WC Rent</th>
                <th>BC Rent</th>
                <th>Occupancy %</th>
                <th>Scenario</th>
                <th>Monthly Total</th>
              </tr>
            </thead>
            <tbody>
              {parking.length === 0 && (
                <tr>
                  <td colSpan={8}>No parking revenue defined.</td>
                </tr>
              )}
              {parking.map((row, index) => {
                const override = parkingOverrides[row.id] ?? createDefaultOverride(row)
                const summary = parkingSummaries[index]
                return (
                  <tr key={row.id}>
                    <td>{row.typeLabel}</td>
                    <td>{row.spaceCount}</td>
                    <td>{formatCurrency(summary.rentDefault)}</td>
                    <td>
                      <input
                        type="number"
                        value={override.monthlyRentWC}
                        onChange={(e) => {
                          setParkingOverrides((prev) => ({
                            ...prev,
                            [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), monthlyRentWC: e.target.value },
                          }))
                          markDirty()
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={override.monthlyRentBC}
                        onChange={(e) => {
                          setParkingOverrides((prev) => ({
                            ...prev,
                            [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), monthlyRentBC: e.target.value },
                          }))
                          markDirty()
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={override.occupancy}
                        onChange={(e) => {
                          setParkingOverrides((prev) => ({
                            ...prev,
                            [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), occupancy: e.target.value },
                          }))
                          markDirty()
                        }}
                      />
                    </td>
                    <td>
                      <div className="scenario-options">
                        {scenarioOptions.map((option) => (
                          <label key={option.id}>
                            <input
                              type="radio"
                              name={`parking-${row.id}`}
                              value={option.id}
                              checked={override.scenario === option.id}
                              onChange={() => {
                                setParkingOverrides((prev) => ({
                                  ...prev,
                                  [row.id]: { ...(prev[row.id] ?? createDefaultOverride(row)), scenario: option.id },
                                }))
                                markDirty()
                              }}
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td>{formatCurrency(summary.monthly)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>Parking Monthly Total</td>
                <td>{formatCurrency(parkingMonthlyTotal)}</td>
              </tr>
              <tr>
                <td colSpan={7}>Overall Monthly Revenue</td>
                <td>{formatCurrency(totalMonthlyRevenue)}</td>
              </tr>
              <tr>
                <td colSpan={7}>Overall Yearly Revenue</td>
                <td>{formatCurrency(totalAnnualRevenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section>
        <h3>Development Costs</h3>
        <div className="metrics-grid">
          <div>
            <p className="label">Purchase Price</p>
            <strong>{formatCurrency(purchasePrice)}</strong>
          </div>
          <div>
            <p className="label">Hard Costs</p>
            <strong>{formatCurrency(hardCostsTotal)}</strong>
          </div>
          <div>
            <p className="label">Soft Costs</p>
            <strong>{formatCurrency(softCostsTotal)}</strong>
          </div>
          <div>
            <p className="label">Buildable SqFt</p>
            <strong>{buildableSqft ? buildableSqft.toLocaleString() : '—'}</strong>
          </div>
          <div className="override-card">
            <p className="label">Build Cost / SqFt</p>
            <div className="scenario-inputs">
              <div>
                <span>WC</span>
                <input
                  type="number"
                  value={buildCostOverride.wc}
                  onChange={(e) => {
                    setBuildCostOverride((prev) => ({ ...prev, wc: e.target.value }))
                    markDirty()
                  }}
                />
              </div>
              <div>
                <span>BC</span>
                <input
                  type="number"
                  value={buildCostOverride.bc}
                  onChange={(e) => {
                    setBuildCostOverride((prev) => ({ ...prev, bc: e.target.value }))
                    markDirty()
                  }}
                />
              </div>
            </div>
            <div className="scenario-options">
              {scenarioOptions.map((option) => (
                <label key={option.id}>
                  <input
                    type="radio"
                    name="build-cost-scenario"
                    value={option.id}
                    checked={buildCostOverride.scenario === option.id}
                    onChange={() => {
                      setBuildCostOverride((prev) => ({ ...prev, scenario: option.id }))
                      markDirty()
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <strong>{formatCurrency(selectedBuildCostPerSqft)}</strong>
          </div>
          <div>
            <p className="label">Development Costs (selected)</p>
            <strong>{formatCurrency(selectedHardSoftTotal)}</strong>
          </div>
        </div>
      </section>

      <section>
        <h3>Stabilized Expenses</h3>
        <div className="metrics-table-wrapper">
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Line Item</th>
                <th>Base</th>
                <th>WC</th>
                <th>BC</th>
                <th>Scenario</th>
                <th>Selected</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Building Expenses</td>
                <td>{formatCurrency(managementAnnualBase)}</td>
                <td>
                  <input
                    type="number"
                    value={managementOverride.wc}
                    onChange={(e) => {
                      setManagementOverride((prev) => ({ ...prev, wc: e.target.value }))
                      markDirty()
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={managementOverride.bc}
                    onChange={(e) => {
                      setManagementOverride((prev) => ({ ...prev, bc: e.target.value }))
                      markDirty()
                    }}
                  />
                </td>
                <td>
                  <div className="scenario-options">
                    {scenarioOptions.map((option) => (
                      <label key={option.id}>
                        <input
                          type="radio"
                          name="management-scenario"
                          value={option.id}
                          checked={managementOverride.scenario === option.id}
                          onChange={() => {
                            setManagementOverride((prev) => ({ ...prev, scenario: option.id }))
                            markDirty()
                          }}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </td>
                <td>{formatCurrency(selectedManagementAnnual)}</td>
              </tr>
              <tr>
                <td>Stabilized Property Tax</td>
                <td>{formatCurrency(stabilizedTaxAnnualBase)}</td>
                <td>
                  <input
                    type="number"
                    value={stabilizedTaxOverride.wc}
                    onChange={(e) => {
                      setStabilizedTaxOverride((prev) => ({ ...prev, wc: e.target.value }))
                      markDirty()
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={stabilizedTaxOverride.bc}
                    onChange={(e) => {
                      setStabilizedTaxOverride((prev) => ({ ...prev, bc: e.target.value }))
                      markDirty()
                    }}
                  />
                </td>
                <td>
                  <div className="scenario-options">
                    {scenarioOptions.map((option) => (
                      <label key={option.id}>
                        <input
                          type="radio"
                          name="tax-scenario"
                          value={option.id}
                          checked={stabilizedTaxOverride.scenario === option.id}
                          onChange={() => {
                            setStabilizedTaxOverride((prev) => ({ ...prev, scenario: option.id }))
                            markDirty()
                          }}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </td>
                <td>{formatCurrency(selectedStabilizedTaxAnnual)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3>Loan Assumptions</h3>
        <div className="metrics-grid">
          <div>
            <label>
              Construction Period (months)
              <input
                type="number"
                value={constructionPeriodMonths}
                onChange={(e) => {
                  setConstructionPeriodMonths(e.target.value)
                  markDirty()
                }}
              />
            </label>
          </div>
          <div>
            <label>
              Interest Rate (%)
              <input
                type="number"
                step="0.01"
                value={interestRatePct}
                onChange={(e) => {
                  setInterestRatePct(e.target.value)
                  markDirty()
                }}
              />
            </label>
          </div>
          <div>
            <p className="label">Construction RE Tax (loan)</p>
            <strong>{formatCurrency(constructionRealEstateForLoan)}</strong>
          </div>
          <div>
            <p className="label">Interest Accrued</p>
            <strong>{formatCurrency(interestAccrued)}</strong>
          </div>
          <div className={`loan-badge ${loanToCostRatio > 0.75 ? 'warning' : ''}`}>
            <p className="label">Construction Loan Amount</p>
            <strong>{formatCurrency(constructionLoanAmount)}</strong>
            <span>{formatPercent(loanToCostRatio)}</span>
          </div>
          <div>
            <p className="label">Founders Equity (GP)</p>
            <strong>{formatCurrency(gpTotal)}</strong>
          </div>
        </div>
      </section>

      <section>
        <h3>Metrics</h3>
        <div className="metrics-grid">
          <div>
            <p className="label">Annual Revenue ({scenarioBadge(defaultScenario)})</p>
            <strong>{formatCurrency(totalAnnualRevenue)}</strong>
          </div>
          <div>
            <p className="label">Expenses (Mgmt + RE Tax)</p>
            <strong>{formatCurrency(selectedExpensesAnnual)}</strong>
          </div>
          <div>
            <p className="label">NOI</p>
            <strong>{formatCurrency(noi)}</strong>
          </div>
          <div>
            <p className="label">CAP Rate</p>
            <strong>{capRate ? formatPercent(capRate) : '—'}</strong>
          </div>
        </div>
      </section>

      <section>
        <h3>Stabilized Cashflow &amp; Refi</h3>
        <div className="stabilized-grid">
          <div className="stabilized-card">
            <p className="label">Loan Amount (post-build)</p>
            <strong>{formatCurrency(stabilizedLoanPrincipal)}</strong>
            <label>
              Stabilized Interest Rate (%)
              <input
                type="number"
                step="0.01"
                value={stabilizedInterestRatePct}
                onChange={(e) => {
                  setStabilizedInterestRatePct(e.target.value)
                  markDirty()
                }}
              />
            </label>
            <label>
              Amortization (years)
              <input
                type="number"
                step="1"
                min="1"
                value={stabilizedTermYears}
                onChange={(e) => {
                  setStabilizedTermYears(e.target.value)
                  markDirty()
                }}
              />
            </label>
          </div>

          <div className="stabilized-card">
            <label>
              Refinance / Cash-Out (USD)
              <input
                type="number"
                min="0"
                step="10000"
                value={refinanceAmount}
                onChange={(e) => {
                  setRefinanceAmount(e.target.value)
                  markDirty()
                }}
              />
            </label>
            <p className="label">Debt Coverage Ratio</p>
            <strong>{stabilizedDcr ? stabilizedDcr.toFixed(2) : '—'}</strong>
            <p className="muted tiny">NOI / Annual Debt Service</p>
          </div>

          <div className="stabilized-card">
            <div className="metric-row">
              <span>NOI (annual)</span>
              <strong>{formatCurrency(noi)}</strong>
            </div>
            <div className="metric-row">
              <span>Debt Service (annual)</span>
              <strong>{formatCurrency(stabilizedAnnualDebtService)}</strong>
            </div>
            <div className="metric-row">
              <span>Debt Service (monthly)</span>
              <strong>{formatCurrency(stabilizedMonthlyDebtService)}</strong>
            </div>
            <div className="metric-row highlight">
              <span>Available Cash (annual)</span>
              <strong>{formatCurrency(availableCashAnnual)}</strong>
            </div>
            <div className="metric-row highlight">
              <span>Available Cash (monthly)</span>
              <strong>{formatCurrency(availableCashMonthly)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3>Exit Strategy</h3>
        <div className="exit-strategy-controls">
          <label>
            Sales Costs (%)
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={salesCostPct}
              onChange={(e) => {
                setSalesCostPct(e.target.value)
                markDirty()
              }}
            />
          </label>
          <p className="muted tiny">Total Project Costs: {formatCurrency(constructionLoanAmount + gpTotal)}</p>
    </div>
        <div className="metrics-table-wrapper">
          <table className="metrics-table exit-table">
            <thead>
              <tr>
                <th>Exit Cap Rate</th>
                <th>Sale Price</th>
                <th>Sales Costs</th>
                <th>Net Proceeds</th>
                <th>Total Project Costs</th>
                <th>Money in Hand</th>
              </tr>
            </thead>
            <tbody>
              {[7.5, 7, 6.5, 6, 5.5, 5].map((capRateValue) => {
                const salePrice = noi && capRateValue ? noi / (capRateValue / 100) : 0
                const salesCostValue = toNumber(salesCostPct)
                const salesCosts = salePrice * (salesCostValue / 100)
                const netProceeds = salePrice - salesCosts
                const totalProjectCosts = constructionLoanAmount + gpTotal
                const moneyInHand = netProceeds - totalProjectCosts
                return (
                  <tr key={capRateValue} className={moneyInHand >= 0 ? 'positive' : 'negative'}>
                    <td><strong>{capRateValue}%</strong></td>
                    <td>{formatCurrency(salePrice)}</td>
                    <td>{formatCurrency(salesCosts)}</td>
                    <td>{formatCurrency(netProceeds)}</td>
                    <td>{formatCurrency(totalProjectCosts)}</td>
                    <td className={moneyInHand >= 0 ? 'money-positive' : 'money-negative'}>
                      <strong>{formatCurrency(moneyInHand)}</strong>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted tiny">Sale Price = NOI ({formatCurrency(noi)}) ÷ Cap Rate</p>
      </section>

      <section>
        <h3>GP/LP Returns</h3>
        <div className="gp-lp-controls">
          <label>
            Preferred Interest Rate (% yearly)
            <input
              type="number"
              step="0.1"
              min="0"
              value={preferredReturnPct}
              placeholder="e.g. 8"
              onChange={(e) => {
                setPreferredReturnPct(e.target.value)
                markDirty()
              }}
            />
          </label>
          <label>
            Stabilization Period (months)
            <input
              type="number"
              step="1"
              min="0"
              value={stabilizationPeriodMonths}
              onChange={(e) => {
                setStabilizationPeriodMonths(e.target.value)
                markDirty()
              }}
            />
          </label>
          <label>
            Selling Cap Rate (%)
            <input
              type="number"
              step="0.25"
              min="0"
              value={sellingCapRatePct}
              placeholder="e.g. 6"
              onChange={(e) => {
                setSellingCapRatePct(e.target.value)
                markDirty()
              }}
            />
          </label>
          <p className="muted tiny">
            Preferred return period: {constructionPeriodMonths} (construction) + {stabilizationPeriodMonths} (stabilization) = {toNumber(constructionPeriodMonths) + toNumber(stabilizationPeriodMonths)} months
          </p>
        </div>
        {(() => {
          // Calculate preferred return for LP only
          const prefReturnRate = toNumber(preferredReturnPct) / 100
          const totalPeriodMonths = toNumber(constructionPeriodMonths) + toNumber(stabilizationPeriodMonths)
          const totalPeriodYears = totalPeriodMonths / 12

          // Calculate preferred return owed to each LP
          const preferredReturnOwed: Record<string, number> = {}
          let totalPreferredOwed = 0
          gpContributions.forEach((row) => {
            const isLp = row.partner === 'LP'
            if (isLp && prefReturnRate > 0) {
              const contribution = toNumber(row.amountUsd)
              const prefReturn = contribution * prefReturnRate * totalPeriodYears
              preferredReturnOwed[row.id as string] = prefReturn
              totalPreferredOwed += prefReturn
            } else {
              preferredReturnOwed[row.id as string] = 0
            }
          })

          // Refi distribution: First pay preferred return, then capital return
          // Step 1: Pay preferred return from refi (if enough)
          const preferredPaidFromRefi: Record<string, number> = {}
          let refiAfterPreferred = refinanceAmountValue

          if (totalPreferredOwed > 0 && refinanceAmountValue > 0) {
            // Pay preferred returns proportionally if not enough refi
            const prefPaymentRatio = Math.min(1, refinanceAmountValue / totalPreferredOwed)
            gpContributions.forEach((row) => {
              const owed = preferredReturnOwed[row.id as string] || 0
              const paid = owed * prefPaymentRatio
              preferredPaidFromRefi[row.id as string] = paid
            })
            refiAfterPreferred = Math.max(0, refinanceAmountValue - totalPreferredOwed)
          }

          // Step 2: Distribute remaining refi as capital return (by contribution %)
          const capitalReturnFromRefi: Record<string, number> = {}
          if (gpTotal > 0 && refiAfterPreferred > 0) {
            gpContributions.forEach((row) => {
              const contribution = toNumber(row.amountUsd)
              const capitalSharePct = contribution / gpTotal
              capitalReturnFromRefi[row.id as string] = refiAfterPreferred * capitalSharePct
            })
          }

          // Calculate profit after selling based on selling cap rate
          const sellingCapRate = toNumber(sellingCapRatePct)
          const salePrice = noi && sellingCapRate ? noi / (sellingCapRate / 100) : 0
          const salesCostValue = toNumber(salesCostPct)
          const salesCosts = salePrice * (salesCostValue / 100)
          const netProceeds = salePrice - salesCosts
          const totalProjectCosts = constructionLoanAmount + gpTotal
          const totalProfitAfterSale = netProceeds - totalProjectCosts

          return (
            <>
              <div className="metrics-table-wrapper">
                <table className="metrics-table gp-returns-table">
                  <thead>
                    <tr>
                      <th>Partner</th>
                      <th>Type</th>
                      <th>Contribution</th>
                      <th>Holding %</th>
                      <th>CoC if NO Refi</th>
                      <th>Pref Return Owed</th>
                      <th>Pref Return Paid</th>
                      <th>Capital Return</th>
                      <th>Total Refi</th>
                      <th>Profit After Sale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gpContributions.length === 0 && (
                      <tr>
                        <td colSpan={10}>No GP/LP contributions defined.</td>
                      </tr>
                    )}
                    {gpContributions.map((row) => {
                      const contribution = toNumber(row.amountUsd)
                      const holdingPct = toNumber(row.holdingPct) / 100
                      const cashShareBeforeRefi = availableCashBeforeRefi * holdingPct
                      const cocBeforeRefi = contribution > 0 ? cashShareBeforeRefi / contribution : 0
                      const isLp = row.partner === 'LP'
                      const prefReturnOwed = preferredReturnOwed[row.id as string] || 0
                      const prefReturnPaid = preferredPaidFromRefi[row.id as string] || 0
                      const capitalReturn = capitalReturnFromRefi[row.id as string] || 0
                      const totalRefiReceived = prefReturnPaid + capitalReturn
                      const profitAfterSale = totalProfitAfterSale * holdingPct
                      return (
                        <tr key={row.id}>
                          <td>{getPartnerLabel(row.partner)}</td>
                          <td>{isLp ? 'LP' : 'GP'}</td>
                          <td>{formatCurrency(contribution)}</td>
                          <td>{row.holdingPct != null ? `${row.holdingPct}%` : '—'}</td>
                          <td className={cocBeforeRefi >= 0 ? 'coc-positive' : 'coc-negative'}>
                            <strong>{formatPercent(cocBeforeRefi)}</strong>
                            <span className="coc-detail">{formatCurrency(cashShareBeforeRefi)}/yr</span>
                          </td>
                          <td>{prefReturnOwed > 0 ? formatCurrency(prefReturnOwed) : '—'}</td>
                          <td>{prefReturnPaid > 0 ? formatCurrency(prefReturnPaid) : '—'}</td>
                          <td>{formatCurrency(capitalReturn)}</td>
                          <td><strong>{formatCurrency(totalRefiReceived)}</strong></td>
                          <td className={profitAfterSale >= 0 ? 'money-positive' : 'money-negative'}>
                            <strong>{formatCurrency(profitAfterSale)}</strong>
                          </td>
                        </tr>
                      )
                    })}
                    {gpContributions.length > 0 && (() => {
                      const totalHoldingPct = gpContributions.reduce((sum, row) => sum + toNumber(row.holdingPct), 0) / 100
                      const totalCashBeforeRefi = availableCashBeforeRefi * totalHoldingPct
                      const totalPrefOwed = Object.values(preferredReturnOwed).reduce((sum, v) => sum + v, 0)
                      const totalPrefPaid = Object.values(preferredPaidFromRefi).reduce((sum, v) => sum + v, 0)
                      const totalCapitalReturn = Object.values(capitalReturnFromRefi).reduce((sum, v) => sum + v, 0)
                      const totalRefi = totalPrefPaid + totalCapitalReturn
                      const totalProfitForHolders = totalProfitAfterSale * totalHoldingPct
                      return (
                        <tr className="totals-row">
                          <td><strong>Total</strong></td>
                          <td></td>
                          <td><strong>{formatCurrency(gpTotal)}</strong></td>
                          <td><strong>{(totalHoldingPct * 100).toFixed(1)}%</strong></td>
                          <td>
                            <strong>{formatCurrency(totalCashBeforeRefi)}/yr</strong>
                          </td>
                          <td><strong>{formatCurrency(totalPrefOwed)}</strong></td>
                          <td><strong>{formatCurrency(totalPrefPaid)}</strong></td>
                          <td><strong>{formatCurrency(totalCapitalReturn)}</strong></td>
                          <td><strong>{formatCurrency(totalRefi)}</strong></td>
                          <td className={totalProfitForHolders >= 0 ? 'money-positive' : 'money-negative'}>
                            <strong>{formatCurrency(totalProfitForHolders)}</strong>
                          </td>
                        </tr>
                      )
                    })()}
                  </tbody>
                </table>
              </div>
              <p className="muted tiny">Preferred Return = LP Capital × Rate × ({toNumber(constructionPeriodMonths) + toNumber(stabilizationPeriodMonths)} months / 12)</p>
              <p className="muted tiny">Refi waterfall: 1) Pay LP Preferred Return → 2) Capital Return by contribution %</p>
              <p className="muted tiny">Profit After Sale = (Sale Price − Sales Costs − Loans − GP/LP Capital) × Holding %</p>
              {sellingCapRate > 0 && (
                <p className="muted tiny">Sale @ {sellingCapRate}% cap: {formatCurrency(salePrice)} − {formatCurrency(salesCosts)} costs − {formatCurrency(totalProjectCosts)} project = {formatCurrency(totalProfitAfterSale)} profit</p>
              )}
            </>
          )
        })()}
      </section>
    </div>
  )
}

