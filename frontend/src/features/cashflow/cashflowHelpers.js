const clampCashflowMonth = (value, maxMonths) => {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.min(maxMonths - 1, Math.trunc(parsed)))
}

export const buildRecurringLineValues = (netAmount, startMonth, months = 60) => {
  const startIndex = clampCashflowMonth(startMonth, months)
  const values = Array(months).fill(0)
  for (let idx = startIndex; idx < months; idx += 1) {
    values[idx] = netAmount
  }
  return values
}

export const buildContributionValues = (amount, monthIndex, months = 60) => {
  const values = Array(months).fill(0)
  const index = clampCashflowMonth(monthIndex, months)
  values[index] = amount || 0
  return values
}

export const formatCurrencyCell = (value) => {
  if (!value) return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.005) return '—'
  return `${amount < 0 ? '-' : ''}$${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

export const buildCostAllocations = (row, months = 60) => {
  const allocations = Array(months).fill(0)
  const amount = Number(row?.amountUsd) || 0
  if (!amount) return allocations

  const addShare = (month, share) => {
    const idx = clampCashflowMonth(month, months)
    if (!Number.isFinite(share)) return
    allocations[idx] += share
  }

  const paymentMode = row.paymentMode || 'single'

  if (paymentMode === 'range') {
    let start = clampCashflowMonth(row.startMonth ?? row.paymentMonth ?? 0, months)
    let end = clampCashflowMonth(row.endMonth ?? row.startMonth ?? start, months)
    if (end < start) [start, end] = [end, start]
    const span = end - start + 1
    const share = span > 0 ? amount / span : amount
    for (let month = start; month <= end; month += 1) {
      addShare(month, share)
    }
    return allocations
  }

  if (paymentMode === 'multi') {
    let monthsList = Array.isArray(row.monthList) ? row.monthList : []
    if (!monthsList.length && row.paymentMonth !== undefined) monthsList = [row.paymentMonth]
    const normalizedMonths = monthsList.map((entry) => clampCashflowMonth(entry, months)).filter((entry) => entry !== null)
    if (!normalizedMonths.length) {
      addShare(0, amount)
      return allocations
    }
    let pctArray = Array.isArray(row.monthPercentages) ? row.monthPercentages.map(Number) : []
    const hasValidPercents =
      pctArray.length === normalizedMonths.length && pctArray.every((value) => Number.isFinite(value))
    if (hasValidPercents) {
      normalizedMonths.forEach((month, index) => addShare(month, (amount * pctArray[index]) / 100))
    } else {
      const evenShare = amount / normalizedMonths.length
      normalizedMonths.forEach((month) => addShare(month, evenShare))
    }
    return allocations
  }

  addShare(row.paymentMonth ?? 0, amount)
  return allocations
}

export const buildExpenseSeries = (rows = [], headerLabel, months = 60) => {
  const totals = Array(months).fill(0)
  const lineItems = rows.map((row, index) => {
    const allocations = buildCostAllocations(row, months)
    allocations.forEach((value, idx) => {
      totals[idx] += value
    })
    return {
      id: row.id || `${headerLabel}-${index}`,
      label: row.costName || `${headerLabel} ${index + 1}`,
      values: allocations.map((value) => value * -1),
    }
  })
  return {
    label: headerLabel,
    type: 'expense',
    baseValues: totals.map((value) => value * -1),
    lineItems,
  }
}

export const buildCashflowRows = ({
  months,
  revenueSeries,
  softCostSeries,
  hardCostSeries,
  carryingCostSeries,
}) => {
  const buildRow = (id, series) => ({
    id,
    label: series.label,
    type: series.type,
    values: series.baseValues,
    subRows: series.lineItems,
  })

  const totalRowValues = months.map((_, index) => {
    return (
      (revenueSeries.baseValues[index] || 0) +
      (softCostSeries.baseValues[index] || 0) +
      (hardCostSeries.baseValues[index] || 0) +
      (carryingCostSeries.baseValues[index] || 0)
    )
  })

  const rows = [
    buildRow('revenues', revenueSeries),
    buildRow('soft', softCostSeries),
    buildRow('hard', hardCostSeries),
    buildRow('carrying', carryingCostSeries),
  ]

  rows.push({
    id: 'total',
    label: 'Total',
    type: 'total',
    values: totalRowValues,
    subRows: [],
  })

  const balanceValues = []
  let runningBalance = 0
  totalRowValues.forEach((value, idx) => {
    runningBalance += value || 0
    balanceValues[idx] = runningBalance
  })

  rows.push({
    id: 'balance',
    label: 'Balance',
    type: 'total',
    values: balanceValues,
    subRows: [],
  })

  return rows
}

