export const softCostCategories = [
  { id: 'architect', label: 'Architect / Design' },
  { id: 'legal', label: 'Legal' },
  { id: 'permits', label: 'Permits' },
  { id: 'consulting', label: 'Consulting' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'other', label: 'Other' },
]

export const leaseupCostCategories = [
  { id: 'marketing', label: 'Marketing' },
  { id: 'staging', label: 'Staging' },
  { id: 'leasing_agent', label: 'Leasing Agent' },
  { id: 'tenant_improvements', label: 'Tenant Improvements' },
  { id: 'legal', label: 'Legal' },
  { id: 'other', label: 'Other' },
]

export const hardCostCategories = [
  { id: 'structure', label: 'Structure' },
  { id: 'framing', label: 'Framing' },
  { id: 'roof', label: 'Roof' },
  { id: 'windows', label: 'Windows' },
  { id: 'fasade', label: 'Fasade' },
  { id: 'rough_plumbing', label: 'Rough Plumbing' },
  { id: 'rough_electric', label: 'Rough Electric' },
  { id: 'rough_havac', label: 'Rough HAVAC' },
  { id: 'fire_supresion', label: 'Fire Supresion' },
  { id: 'insulation', label: 'Insulation' },
  { id: 'drywall', label: 'Drywall' },
  { id: 'tiles', label: 'Tiles' },
  { id: 'paint', label: 'Paint' },
  { id: 'flooring', label: 'Flooring' },
  { id: 'molding_doors', label: 'Molding (+ doors)' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'finished_plumbing', label: 'Finished Plumbing' },
  { id: 'finished_electric', label: 'Finished Electric' },
  { id: 'appliances', label: 'Appliances' },
  { id: 'gym', label: 'Gym' },
  { id: 'study_lounge', label: 'Study Lounge' },
  { id: 'roof_top', label: 'Roof Top' },
  { id: 'foundation', label: 'Foundation' },
  { id: 'other_hard', label: 'Other (Lump Sum)' },
]

export const measurementUnitOptions = [
  { id: 'none', label: 'None (lump sum)' },
  { id: 'sqft', label: 'Per Square Feet' },
  { id: 'linear_feet', label: 'Per Linear Feet' },
  { id: 'apartment', label: 'Per Apartment' },
  { id: 'building', label: 'Per Building' },
]

export const measurementUnitMeta = {
  sqft: { label: 'Square Feet', short: 'sqft', plural: 'square feet' },
  linear_feet: { label: 'Linear Feet', short: 'lf', plural: 'linear feet' },
  apartment: { label: 'Apartment', short: 'apt', plural: 'apartments' },
  building: { label: 'Building', short: 'bldg', plural: 'buildings' },
}

const hardCostDefaultMeasurement = {
  structure: 'sqft',
  framing: 'sqft',
  roof: 'sqft',
  windows: 'sqft',
  fasade: 'sqft',
  rough_plumbing: 'apartment',
  rough_electric: 'apartment',
  rough_havac: 'apartment',
  fire_supresion: 'sqft',
  insulation: 'sqft',
  drywall: 'linear_feet',
  tiles: 'linear_feet',
  paint: 'linear_feet',
  flooring: 'apartment',
  molding_doors: 'sqft',
  kitchen: 'apartment',
  finished_plumbing: 'apartment',
  finished_electric: 'apartment',
  appliances: 'apartment',
  gym: 'building',
  study_lounge: 'building',
  roof_top: 'building',
  foundation: 'none',
  other_hard: 'none',
}

export const getDefaultMeasurementForCategory = (categoryId) =>
  hardCostDefaultMeasurement[categoryId] || 'none'

export const createDefaultSoftCostForm = () => ({
  softCategory: softCostCategories[0]?.id || 'other',
  costName: '',
  amountUsd: '',
  paymentMode: 'single',
  paymentMonth: '1',
  rangeStartMonth: '1',
  rangeEndMonth: '1',
  monthsInput: '',
  monthPercentagesInput: '',
})

export const createDefaultLeaseupCostForm = () => ({
  leaseupCategory: leaseupCostCategories[0]?.id || 'other',
  costName: '',
  amountUsd: '',
  paymentMode: 'single',
  paymentMonth: '1',
  rangeStartMonth: '1',
  rangeEndMonth: '1',
  monthsInput: '',
  monthPercentagesInput: '',
})

export const createDefaultHardCostForm = () => {
  const initialCategory = hardCostCategories[0]?.id || 'structure'
  return {
    hardCategory: initialCategory,
    measurementUnit: getDefaultMeasurementForCategory(initialCategory),
    costName: '',
    amountUsd: '',
    pricePerUnit: '',
    unitsCount: '',
    paymentMode: 'single',
    paymentMonth: '1',
    rangeStartMonth: '1',
    rangeEndMonth: '1',
    monthsInput: '',
    monthPercentagesInput: '',
  }
}

export const requiresMeasurementDetails = (unit) => unit && unit !== 'none'

export const recomputeHardCostAmount = (form) => {
  const next = { ...form }
  if (!requiresMeasurementDetails(next.measurementUnit)) {
    return next
  }
  const price = next.pricePerUnit !== '' ? Number(next.pricePerUnit) : null
  const units = next.unitsCount !== '' ? Number(next.unitsCount) : null
  next.amountUsd =
    price !== null && units !== null && Number.isFinite(price * units) ? String(price * units) : ''
  return next
}

export const parseCommaSeparatedNumbers = (value) => {
  if (!value) return []
  return value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => Number(segment))
    .filter((num) => !Number.isNaN(num))
}

export const parseMonthListToOffsets = (value, convertMonthInputToOffset) => {
  if (!value) return []
  return value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => convertMonthInputToOffset(segment))
}

export const buildScheduledCostPayload = (form, categoryField, convertMonthInputToOffset) => {
  const payload = {
    costName: form.costName.trim(),
    amountUsd: form.amountUsd === '' ? null : Number(form.amountUsd),
    paymentMode: form.paymentMode,
    [categoryField]: form[categoryField],
  }

  if (payload.paymentMode === 'single') {
    payload.paymentMonth = convertMonthInputToOffset(form.paymentMonth)
  } else if (payload.paymentMode === 'range') {
    payload.rangeStartMonth = convertMonthInputToOffset(form.rangeStartMonth)
    payload.rangeEndMonth = convertMonthInputToOffset(form.rangeEndMonth)
  } else if (payload.paymentMode === 'multi') {
    payload.monthList = parseMonthListToOffsets(form.monthsInput, convertMonthInputToOffset)
    if (form.monthPercentagesInput && form.monthPercentagesInput.trim()) {
      payload.monthPercentages = parseCommaSeparatedNumbers(form.monthPercentagesInput)
    }
  }

  return payload
}

export const buildCostFormFromRow = (
  row,
  categoryField,
  fallbackCategory,
  formatOffsetForInput,
  options = {},
) => {
  const form = {
    [categoryField]: row.costGroup || fallbackCategory,
    costName: row.costName || '',
    amountUsd: row.amountUsd !== null && row.amountUsd !== undefined ? String(row.amountUsd) : '',
    paymentMode: row.paymentMode || 'single',
    paymentMonth:
      row.paymentMonth === null || row.paymentMonth === undefined
        ? '1'
        : formatOffsetForInput(row.paymentMonth),
    rangeStartMonth:
      row.startMonth === null || row.startMonth === undefined
        ? '1'
        : formatOffsetForInput(row.startMonth),
    rangeEndMonth:
      row.endMonth === null || row.endMonth === undefined ? '1' : formatOffsetForInput(row.endMonth),
    monthsInput:
      row.monthList && row.monthList.length
        ? row.monthList.map((month) => formatOffsetForInput(month)).join(', ')
        : '',
    monthPercentagesInput:
      row.monthPercentages && row.monthPercentages.length ? row.monthPercentages.join(',') : '',
  }

  if (options.includeMeasurement) {
    const defaultMeasurement = options.defaultMeasurement || 'none'
    form.measurementUnit = row.measurementUnit || defaultMeasurement
    form.pricePerUnit =
      row.pricePerUnit !== null && row.pricePerUnit !== undefined ? String(row.pricePerUnit) : ''
    form.unitsCount =
      row.unitsCount !== null && row.unitsCount !== undefined ? String(row.unitsCount) : ''
  }

  return form
}

export const softCategoryLabel = (value) =>
  softCostCategories.find((option) => option.id === value)?.label || 'Other'

export const hardCategoryLabel = (value) =>
  hardCostCategories.find((option) => option.id === value)?.label || 'Other'

export const leaseupCategoryLabel = (value) =>
  leaseupCostCategories.find((option) => option.id === value)?.label || 'Other'

export const formatCostSchedule = (row) => {
  if (!row) return '—'
  if (row.paymentMode === 'range' && row.startMonth !== null && row.endMonth !== null) {
    return `Months ${row.startMonth}–${row.endMonth}`
  }
  if (row.paymentMode === 'multi' && row.monthList?.length) {
    if (row.monthPercentages?.length) {
      return row.monthList
        .map((month, index) => {
          const percentage = row.monthPercentages[index]
          if (percentage === undefined) return `Month ${month}`
          return `Month ${month} (${percentage}%)`
        })
        .join(', ')
    }
    return row.monthList.map((month) => `Month ${month}`).join(', ')
  }
  if (row.paymentMonth !== null && row.paymentMonth !== undefined) {
    return `Month ${row.paymentMonth}`
  }
  return '—'
}

const measurementUnitLabel = (value) =>
  measurementUnitOptions.find((option) => option.id === value)?.label || value

export const formatMeasurementSummary = (row) => {
  if (!row || !requiresMeasurementDetails(row.measurementUnit)) return '—'
  const meta = measurementUnitMeta[row.measurementUnit]
  const units = row.unitsCount !== null && row.unitsCount !== undefined ? Number(row.unitsCount) : null
  const price =
    row.pricePerUnit !== null && row.pricePerUnit !== undefined ? Number(row.pricePerUnit) : null
  const pluralLabel = meta?.plural || measurementUnitLabel(row.measurementUnit)
  const shortSuffix = meta?.short ? `/${meta.short}` : ''
  if (units !== null && price !== null && Number.isFinite(units) && Number.isFinite(price)) {
    return `${units.toLocaleString()} ${pluralLabel} × $${price.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}${shortSuffix}`
  }
  return pluralLabel
}

