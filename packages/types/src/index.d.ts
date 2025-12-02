import type { z } from 'zod'

export type Nullable<T> = T | null
export type EntityId = string | number
export type ProjectStage = 'new' | 'offer_submitted' | 'under_contract' | 'in_development' | 'stabilized'

export interface ProjectSummary {
  id: EntityId
  name: string
  stage: ProjectStage
  city?: string | null
  state?: string | null
  targetUnits?: number | null
  purchasePriceUsd?: number | null
}

export interface ProjectGeneral {
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  zip: string | null
  propertyType: string | null
  purchasePriceUsd: number | null
  closingDate: string | null
  latitude: number | null
  longitude: number | null
  targetUnits: number | null
  targetSqft: number | null
  description: string | null
}

export interface ApartmentTurnoverSettings {
  turnoverPct: number | null
  turnoverCostUsd: number | null
}

export interface AddressSuggestion {
  id: string
  label: string
  addressLine1: string
  city: string | null
  state: string | null
  zip: string | null
  latitude: number | null
  longitude: number | null
}

export type ProjectDetail = ProjectSummary & {
  general: ProjectGeneral
  apartmentTurnover: ApartmentTurnoverSettings
  revenue: ApartmentRevenue[]
  retailRevenue: RetailRevenue[]
  parkingRevenue: ParkingRevenue[]
  gpContributions: GpContribution[]
  softCosts: SoftCostRow[]
  hardCosts: HardCostRow[]
  carryingCosts: CarryingCostRow[]
  cashflow: CashflowRow[]
}

export const SOFT_COST_CATEGORY_IDS: readonly [
  'architect',
  'legal',
  'permits',
  'consulting',
  'marketing',
  'other',
]

export const HARD_COST_CATEGORY_IDS: readonly [
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

export const MEASUREMENT_UNITS: readonly ['none', 'sqft', 'linear_feet', 'apartment', 'building']
export const COST_PAYMENT_MODES: readonly ['single', 'range', 'multi']
export const CARRYING_TYPES: readonly ['loan', 'property_tax', 'management']
export const LOAN_MODES: readonly ['interest_only', 'amortizing']
export const INTERVAL_UNITS: readonly ['monthly', 'quarterly', 'yearly']
export const PROPERTY_TAX_PHASES: readonly ['construction', 'stabilized']

export type CostPaymentMode = typeof COST_PAYMENT_MODES[number]
export type MeasurementUnit = typeof MEASUREMENT_UNITS[number]
export type CarryingType = typeof CARRYING_TYPES[number]
export type LoanMode = typeof LOAN_MODES[number]
export type IntervalUnit = typeof INTERVAL_UNITS[number]
export type PropertyTaxPhase = typeof PROPERTY_TAX_PHASES[number]

export interface ApartmentRevenueInput {
  typeLabel: string
  unitSqft?: number | null
  unitCount: number
  rentBudget: number | null
  vacancyPct?: number
  startMonth?: number
}

export interface ApartmentRevenue extends ApartmentRevenueInput {
  id: EntityId
}

export interface RetailRevenueInput {
  typeLabel: string
  unitSqft?: number | null
  unitCount: number
  rentBudget: number | null
  vacancyPct?: number
  startMonth?: number
}

export interface RetailRevenue extends RetailRevenueInput {
  id: EntityId
}

export interface ParkingRevenueInput {
  typeLabel: string
  spaceCount: number
  monthlyRentUsd: number
  vacancyPct?: number
  startMonth?: number
}

export interface ParkingRevenue extends ParkingRevenueInput {
  id: EntityId
}

export interface GpContributionInput {
  partner: 'darmon' | 'sherman'
  amountUsd: number
  contributionMonth: number
}

export interface GpContribution extends GpContributionInput {
  id: EntityId
}

export interface SoftCostInput {
  softCategory: typeof SOFT_COST_CATEGORY_IDS[number]
  costName: string
  amountUsd: number
  paymentMode: CostPaymentMode
  paymentMonth?: number | null
  rangeStartMonth?: number | null
  rangeEndMonth?: number | null
  monthList?: number[]
  monthPercentages?: number[]
}

export interface HardCostInput extends SoftCostInput {
  hardCategory: typeof HARD_COST_CATEGORY_IDS[number]
  measurementUnit: MeasurementUnit
  pricePerUnit?: number | null
  unitsCount?: number | null
}

export interface SoftCostRow extends SoftCostInput {
  id: EntityId
  costGroup?: string | null
}

export interface HardCostRow extends HardCostInput {
  id: EntityId
  costGroup?: string | null
}

export interface LoanCarryingInput {
  carryingType: 'loan'
  costName?: string
  loanMode: LoanMode
  loanAmountUsd: number
  interestRatePct: number
  loanTermMonths: number
  fundingMonth: number
  repaymentStartMonth: number
}

export interface RecurringCarryingInput {
  carryingType: 'property_tax' | 'management'
  costName?: string
  amountUsd: number
  intervalUnit: IntervalUnit
  startMonth: number
  endMonth?: number | null
  propertyTaxPhase?: PropertyTaxPhase
}

export type CarryingCostInput = LoanCarryingInput | RecurringCarryingInput

export interface CarryingCostRow {
  id: EntityId
  carryingType: CarryingType
  costName?: string | null
  costGroup?: string | null
  amountUsd?: number | null
  intervalUnit?: IntervalUnit | null
  startMonth?: number | null
  endMonth?: number | null
  loanMode?: LoanMode | null
  loanAmountUsd?: number | null
  interestRatePct?: number | null
  loanTermMonths?: number | null
  fundingMonth?: number | null
  repaymentStartMonth?: number | null
  propertyTaxPhase?: PropertyTaxPhase | null
}

export interface CashflowRow {
  id: EntityId
  monthIndex: number
  budgetInflows: number | null
  budgetOutflows: number | null
  actualInflows: number | null
  actualOutflows: number | null
  notes: string | null
}

export interface WeatherReading {
  city: string
  temperature_c: number
  windspeed_kmh: number
  sampled_at: string
  source: string
}

export declare const projectCreateSchema: z.ZodType<{ name: string }>
export declare const projectUpdateSchema: z.ZodTypeAny
export declare const apartmentRevenueInputSchema: z.ZodType<ApartmentRevenueInput>
export declare const apartmentRevenueUpdateSchema: z.ZodType<Partial<ApartmentRevenueInput>>
export declare const retailRevenueInputSchema: z.ZodType<RetailRevenueInput>
export declare const retailRevenueUpdateSchema: z.ZodType<Partial<RetailRevenueInput>>
export declare const parkingRevenueInputSchema: z.ZodType<ParkingRevenueInput>
export declare const parkingRevenueUpdateSchema: z.ZodType<Partial<ParkingRevenueInput>>
export declare const gpContributionInputSchema: z.ZodType<GpContributionInput>
export declare const gpContributionUpdateSchema: z.ZodType<Partial<GpContributionInput>>
export declare const softCostInputSchema: z.ZodType<SoftCostInput>
export declare const softCostUpdateSchema: z.ZodType<Partial<SoftCostInput>>
export declare const hardCostInputSchema: z.ZodType<HardCostInput>
export declare const hardCostUpdateSchema: z.ZodType<Partial<HardCostInput>>
export declare const loanCarryingInputSchema: z.ZodType<LoanCarryingInput>
export declare const recurringCarryingInputSchema: z.ZodType<RecurringCarryingInput>
export declare const formatZodErrors: (error: z.ZodError) => string

export { z } from 'zod'

