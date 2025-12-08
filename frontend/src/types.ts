export type {
  Nullable,
  EntityId,
  ProjectStage,
  ProjectSummary,
  ProjectGeneral,
  ProjectDetail,
  ApartmentRevenue as ApartmentRevenueRow,
  RetailRevenue as RetailRevenueRow,
  ParkingRevenue as ParkingRevenueRow,
  GpContribution as GpContributionRow,
  SoftCostRow,
  LeaseupCostRow,
  HardCostRow,
  CarryingCostRow,
  CashflowRow,
  AddressSuggestion,
  WeatherReading,
  UserSummary,
  ProjectCollaborator,
  CostPaymentMode,
  MeasurementUnit,
  CarryingType,
  LoanMode,
  IntervalUnit,
  PropertyTaxPhase,
  DocumentCategory,
  DocumentInput,
  Document as DocumentRow,
  // Business Projects
  BusinessStage,
  BusinessProjectSummary,
  BusinessProjectDetail,
  BusinessFounder,
  BusinessMonthlyMetrics,
  BusinessStageCriterion,
  BusinessCollaborator,
  BusinessProjectCreateInput,
  BusinessProjectUpdateInput,
  BusinessFounderInput,
  BusinessMetricsInput,
  ProjectCounts,
  LegalEntityType,
} from '@ds-proforma/types'

export {
  SOFT_COST_CATEGORY_IDS,
  HARD_COST_CATEGORY_IDS,
  MEASUREMENT_UNITS,
  COST_PAYMENT_MODES,
  CARRYING_TYPES,
  LOAN_MODES,
  INTERVAL_UNITS,
  PROPERTY_TAX_PHASES,
  DOCUMENT_CATEGORIES,
  // Business Projects
  BUSINESS_STAGES,
  BUSINESS_STAGE_LABELS,
  BUSINESS_STAGE_CRITERIA,
} from '@ds-proforma/types'

export type GeneralFormState = {
  name: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  zip: string
  purchasePriceUsd: string
  closingDate: string
  startLeasingDate: string
  stabilizedDate: string
  latitude: string
  longitude: string
  targetUnits: string
  targetSqft: string
  description: string
  buildingImageUrl: string
}
