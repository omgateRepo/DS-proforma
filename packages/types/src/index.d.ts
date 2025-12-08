import type { z } from 'zod'

export type Nullable<T> = T | null
export type EntityId = string | number
export type ProjectStage = 'new' | 'offer_submitted' | 'under_contract' | 'in_development' | 'stabilized'

export interface UserSummary {
  id: EntityId
  email: string
  displayName: string
  isSuperAdmin: boolean
  createdAt?: string | null
}

export interface ProjectCollaborator {
  id: string
  userId: string
  email: string | null
  displayName: string | null
}

export interface ProjectSummary {
  id: EntityId
  name: string
  stage: ProjectStage
  city?: string | null
  state?: string | null
  targetUnits?: number | null
  purchasePriceUsd?: number | null
  ownerId?: EntityId | null
  owner?: UserSummary | null
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
  startLeasingDate: string | null
  stabilizedDate: string | null
  buildingImageUrl: string | null
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
  retailTurnover: ApartmentTurnoverSettings
  revenue: ApartmentRevenue[]
  retailRevenue: RetailRevenue[]
  parkingRevenue: ParkingRevenue[]
  gpContributions: GpContribution[]
  softCosts: SoftCostRow[]
  leaseupCosts: LeaseupCostRow[]
  hardCosts: HardCostRow[]
  carryingCosts: CarryingCostRow[]
  cashflow: CashflowRow[]
  documents: Document[]
  owner?: UserSummary | null
  ownerId?: EntityId | null
  collaborators: ProjectCollaborator[]
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
  'foundation',
  'other_hard',
]

export const MEASUREMENT_UNITS: readonly ['none', 'sqft', 'linear_feet', 'apartment', 'building']
export const COST_PAYMENT_MODES: readonly ['single', 'range', 'multi']
export const CARRYING_TYPES: readonly ['loan', 'property_tax', 'management']
export const LOAN_MODES: readonly ['interest_only', 'amortizing']
export const INTERVAL_UNITS: readonly ['monthly', 'quarterly', 'yearly']
export const PROPERTY_TAX_PHASES: readonly ['construction', 'stabilized']
export const DOCUMENT_CATEGORIES: readonly ['contracts', 'permits', 'plans', 'financials', 'legal', 'other']

export type CostPaymentMode = typeof COST_PAYMENT_MODES[number]
export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number]
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
  partner: string
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

export interface LeaseupCostRow extends SoftCostInput {
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
  label?: string
  temperature_c: number
  windspeed_kmh: number
  sampled_at: string
  source: string
  latitude?: number
  longitude?: number
}

export interface DocumentInput {
  title?: string
  url: string
  category: DocumentCategory
  description?: string
}

export interface Document {
  id: EntityId
  title: string
  url: string
  category: DocumentCategory
  description?: string
  createdAt: string
  updatedAt: string
}

// ============================================
// BUSINESS PROJECTS TYPES
// ============================================

export type BusinessStage = 'exploring' | 'product_market_fit' | 'unit_economics' | 'sustainable_growth'

export declare const BUSINESS_STAGES: readonly BusinessStage[]

export declare const BUSINESS_STAGE_LABELS: Record<BusinessStage, string>

export declare const BUSINESS_STAGE_CRITERIA: Record<BusinessStage, string[]>

export type LegalEntityType = 'llc' | 'c_corp' | 's_corp' | 'partnership' | 'sole_prop'

export interface BusinessProjectSummary {
  id: EntityId
  name: string
  description?: string | null
  stage: BusinessStage
  stageEnteredAt: string
  legalEntityName?: string | null
  legalEntityType?: LegalEntityType | null
  jurisdiction?: string | null
  formedAt?: string | null
  industry: string
  targetMarket?: string | null
  totalInvested?: number | null
  currentMrr?: number | null
  currentRunway?: number | null
  ownerId?: EntityId | null
  createdAt: string
  updatedAt: string
}

export interface BusinessFounder {
  id: EntityId
  name: string
  role: string
  equityPercent?: number | null
  createdAt: string
}

export interface BusinessMonthlyMetrics {
  id: EntityId
  month: string // YYYY-MM
  mrr?: number | null
  arr?: number | null
  revenueGrowthPct?: number | null
  totalCustomers?: number | null
  newCustomers?: number | null
  churnedCustomers?: number | null
  churnRatePct?: number | null
  cac?: number | null
  ltv?: number | null
  ltvCacRatio?: number | null
  grossMarginPct?: number | null
  cashBalance?: number | null
  burnRate?: number | null
  runwayMonths?: number | null
  teamSize?: number | null
  notes?: string | null
  createdAt: string
}

export interface BusinessStageCriterion {
  id: EntityId
  stage: BusinessStage
  criterionKey: string
  description: string
  completed: boolean
  completedAt?: string | null
  notes?: string | null
  createdAt: string
}

export interface BusinessCollaborator {
  id: EntityId
  email: string
  displayName: string
}

export interface BusinessProjectDetail extends BusinessProjectSummary {
  founders: BusinessFounder[]
  monthlyMetrics: BusinessMonthlyMetrics[]
  stageCriteria: BusinessStageCriterion[]
  documents: Document[]
  collaborators: BusinessCollaborator[]
}

export interface BusinessProjectCreateInput {
  name: string
  description?: string
  industry?: string
  targetMarket?: string
}

export interface BusinessProjectUpdateInput {
  name?: string
  description?: string | null
  stage?: BusinessStage
  legalEntityName?: string | null
  legalEntityType?: LegalEntityType | null
  jurisdiction?: string | null
  formedAt?: string | null
  industry?: string
  targetMarket?: string | null
  totalInvested?: number | null
  currentMrr?: number | null
  currentRunway?: number | null
}

export interface BusinessFounderInput {
  name: string
  role?: string
  equityPercent?: number | null
}

export interface BusinessMetricsInput {
  month: string
  mrr?: number | null
  arr?: number | null
  revenueGrowthPct?: number | null
  totalCustomers?: number | null
  newCustomers?: number | null
  churnedCustomers?: number | null
  churnRatePct?: number | null
  cac?: number | null
  ltv?: number | null
  ltvCacRatio?: number | null
  grossMarginPct?: number | null
  cashBalance?: number | null
  burnRate?: number | null
  runwayMonths?: number | null
  teamSize?: number | null
  notes?: string | null
}

export interface ProjectCounts {
  realEstate: number
  business: number
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
export declare const documentInputSchema: z.ZodType<DocumentInput>
export declare const documentUpdateSchema: z.ZodType<Partial<DocumentInput>>
export declare const formatZodErrors: (error: z.ZodError) => string

export { z } from 'zod'

