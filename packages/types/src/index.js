import { z } from 'zod'

const nonEmptyString = z.string().min(1, 'This field is required')
const optionalString = z.string().min(1).optional()
const nullableString = z.string().min(1).nullable().optional()
const optionalNullableString = z.union([z.string().min(1), z.null()]).optional()
const baseNumber = z.number().finite()
const optionalNumber = baseNumber.optional()
const nullableNumber = baseNumber.nullable().optional()
const positiveInt = baseNumber.int().nonnegative()
const optionalPositiveInt = positiveInt.optional()
const money = baseNumber.min(0)
const percentage = baseNumber.min(0).max(100)
const costPaymentModes = ['single', 'range', 'multi']
const softCostCategories = ['architect', 'legal', 'permits', 'consulting', 'marketing', 'other']
const hardCostCategories = [
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
const measurementUnits = ['none', 'sqft', 'linear_feet', 'apartment', 'building']
const carryingTypes = ['loan', 'property_tax', 'management']
const loanModes = ['interest_only', 'amortizing']
const intervalUnits = ['monthly', 'quarterly', 'yearly']
const propertyTaxPhases = ['construction', 'stabilized']

export const SOFT_COST_CATEGORY_IDS = [...softCostCategories]
export const HARD_COST_CATEGORY_IDS = [...hardCostCategories]
export const MEASUREMENT_UNITS = [...measurementUnits]
export const COST_PAYMENT_MODES = [...costPaymentModes]
export const CARRYING_TYPES = [...carryingTypes]
export const LOAN_MODES = [...loanModes]
export const INTERVAL_UNITS = [...intervalUnits]
export const PROPERTY_TAX_PHASES = [...propertyTaxPhases]

const costScheduleBaseFields = {
  costName: nonEmptyString,
  amountUsd: money,
  paymentMode: z.enum(costPaymentModes),
  paymentMonth: optionalPositiveInt.nullable(),
  rangeStartMonth: optionalPositiveInt.nullable(),
  rangeEndMonth: optionalPositiveInt.nullable(),
  monthList: z.array(positiveInt).optional(),
  monthPercentages: z.array(baseNumber).optional(),
}

const applyCostScheduleConstraints = (schema) =>
  schema.superRefine((data, ctx) => {
    if (data.paymentMode === 'single' && (data.paymentMonth === null || data.paymentMonth === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paymentMonth'], message: 'paymentMonth is required' })
    }
    if (data.paymentMode === 'range') {
      if (data.rangeStartMonth === null || data.rangeStartMonth === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rangeStartMonth'], message: 'Start month is required' })
      }
      if (data.rangeEndMonth === null || data.rangeEndMonth === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rangeEndMonth'], message: 'End month is required' })
      }
    }
    if (data.paymentMode === 'multi') {
      if (!data.monthList || data.monthList.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['monthList'], message: 'Provide at least one month' })
      }
      if (data.monthPercentages && data.monthPercentages.length > 0) {
        if (!data.monthList || data.monthPercentages.length !== data.monthList.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['monthPercentages'],
            message: 'Percentages must match the number of months',
          })
        }
      }
    }
  })

const costScheduleBaseSchema = z.object(costScheduleBaseFields)

const softCostBaseSchema = costScheduleBaseSchema.extend({
  softCategory: z.enum(softCostCategories),
})

export const softCostInputSchema = applyCostScheduleConstraints(softCostBaseSchema)
export const softCostUpdateSchema = softCostBaseSchema.partial()

const hardCostBaseSchema = costScheduleBaseSchema.extend({
  hardCategory: z.enum(hardCostCategories),
  measurementUnit: z.enum(measurementUnits),
  pricePerUnit: nullableNumber,
  unitsCount: nullableNumber,
})

export const hardCostInputSchema = applyCostScheduleConstraints(
  hardCostBaseSchema.superRefine((data, ctx) => {
    const needsMeasurement = data.measurementUnit && data.measurementUnit !== 'none'
    if (needsMeasurement) {
      if (data.pricePerUnit === null || data.pricePerUnit === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pricePerUnit'], message: 'pricePerUnit is required' })
      }
      if (data.unitsCount === null || data.unitsCount === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unitsCount'], message: 'unitsCount is required' })
      }
    }
  }),
)

export const hardCostUpdateSchema = hardCostBaseSchema.partial()

export const loanCarryingInputSchema = z
  .object({
    carryingType: z.literal('loan'),
    costName: optionalString.or(z.literal('')).optional(),
    loanMode: z.enum(loanModes),
    loanAmountUsd: money,
    interestRatePct: baseNumber.min(0),
    loanTermMonths: positiveInt.min(1),
    fundingMonth: positiveInt,
    repaymentStartMonth: positiveInt,
  })
  .superRefine((data, ctx) => {
    if (data.repaymentStartMonth < data.fundingMonth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['repaymentStartMonth'],
        message: 'repaymentStartMonth cannot be before fundingMonth',
      })
    }
  })

export const recurringCarryingInputSchema = z
  .object({
    carryingType: z.enum(carryingTypes.filter((type) => type !== 'loan')),
    costName: optionalString.or(z.literal('')).optional(),
    amountUsd: money,
    intervalUnit: z.enum(intervalUnits),
    startMonth: positiveInt,
    endMonth: optionalPositiveInt.nullable(),
    propertyTaxPhase: z.enum(propertyTaxPhases).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.carryingType === 'property_tax') {
      if (!data.propertyTaxPhase) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['propertyTaxPhase'],
          message: 'taxPhase is required for property tax rows',
        })
      }
    } else if (data.propertyTaxPhase) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['propertyTaxPhase'],
        message: 'taxPhase can only be set for property tax rows',
      })
    }
    if (data.endMonth !== null && data.endMonth !== undefined && data.endMonth < data.startMonth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endMonth'],
        message: 'endMonth cannot be earlier than startMonth',
      })
    }
  })

export const projectCreateSchema = z.object({
  name: nonEmptyString,
})

export const projectUpdateSchema = z
  .object({
    name: nonEmptyString.optional(),
    addressLine1: nonEmptyString.optional(),
    addressLine2: optionalNullableString,
    city: optionalNullableString,
    state: optionalNullableString,
    zip: optionalNullableString,
    propertyType: optionalNullableString,
    purchasePriceUsd: nullableNumber,
    closingDate: nullableString,
    startLeasingDate: nullableString,
    stabilizedDate: nullableString,
    latitude: nullableNumber,
    longitude: nullableNumber,
    targetUnits: optionalPositiveInt.nullable(),
    targetSqft: optionalPositiveInt.nullable(),
    description: optionalNullableString,
    turnoverPct: percentage.optional().nullable(),
    turnoverCostUsd: nullableNumber,
  retailTurnoverPct: percentage.optional().nullable(),
  retailTurnoverCostUsd: nullableNumber,
  })
  .strict()

const unitRevenueInputSchema = z.object({
  typeLabel: nonEmptyString,
  unitSqft: positiveInt.nullable().optional(),
  unitCount: positiveInt,
  rentBudget: nullableNumber,
  vacancyPct: percentage.optional().default(5),
  startMonth: positiveInt.default(0),
})

const unitRevenueUpdateSchema = unitRevenueInputSchema.partial()

export const apartmentRevenueInputSchema = unitRevenueInputSchema
export const apartmentRevenueUpdateSchema = unitRevenueUpdateSchema
export const retailRevenueInputSchema = unitRevenueInputSchema
export const retailRevenueUpdateSchema = unitRevenueUpdateSchema

export const parkingRevenueInputSchema = z.object({
  typeLabel: nonEmptyString,
  spaceCount: positiveInt,
  monthlyRentUsd: money,
  vacancyPct: percentage.optional().default(5),
  startMonth: positiveInt.default(0),
})

export const parkingRevenueUpdateSchema = parkingRevenueInputSchema.partial()

export const gpContributionInputSchema = z.object({
  partner: z.enum(['darmon', 'sherman']),
  amountUsd: money,
  contributionMonth: positiveInt,
})

export const gpContributionUpdateSchema = gpContributionInputSchema.partial()

export const formatZodErrors = (error) =>
  error.issues
    .map((issue) => {
      if (issue.path.length) {
        return `${issue.path.join('.')}: ${issue.message}`
      }
      return issue.message
    })
    .join('; ')

export { z }

