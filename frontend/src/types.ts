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
  HardCostRow,
  CarryingCostRow,
  CashflowRow,
  AddressSuggestion,
  WeatherReading,
  CostPaymentMode,
  MeasurementUnit,
  CarryingType,
  LoanMode,
  IntervalUnit,
  PropertyTaxPhase,
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
}
