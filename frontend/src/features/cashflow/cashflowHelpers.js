const clampCashflowMonth = (value, maxMonths) => {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.min(maxMonths - 1, Math.trunc(parsed)))
}

const hasMagnitude = (values) => values.some((value) => Math.abs(value) > 0.0001)

export const buildRecurringLineValues = (netAmount, startMonth, months = 60) => {
  const startIndex = clampCashflowMonth(startMonth, months)
  const values = Array(months).fill(0)
  for (let idx = startIndex; idx < months; idx += 1) {
    values[idx] = netAmount
  }
  return values
}

export const buildRampedRevenueValues = (netAmount, rowStartMonth = 0, leasingStart, stabilized, months = 60) => {
  if (!netAmount) return buildRecurringLineValues(0, rowStartMonth, months)
  if (
    leasingStart === null ||
    leasingStart === undefined ||
    stabilized === null ||
    stabilized === undefined ||
    stabilized <= leasingStart
  ) {
    return buildRecurringLineValues(netAmount, rowStartMonth, months)
  }
  const values = Array(months).fill(0)
  const rampStart = clampCashflowMonth(Math.max(rowStartMonth ?? 0, leasingStart), months)
  const rampEnd = clampCashflowMonth(Math.max(stabilized, rampStart), months)
  if (rampEnd <= rampStart) {
    return buildRecurringLineValues(netAmount, rampStart, months)
  }
  const duration = rampEnd - rampStart
  for (let idx = rampStart; idx < months; idx += 1) {
    if (idx <= rampEnd) {
      const progress = duration === 0 ? 1 : (idx - rampStart) / duration
      values[idx] = netAmount * Math.max(0, Math.min(1, progress))
    } else {
      values[idx] = netAmount
    }
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

const INTERVAL_STEPS = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

const buildIntervalExpenseValues = (row, months) => {
  const values = Array(months).fill(0)
  const amount = Number(row.amountUsd) || 0
  if (!amount) return values

  const startMonth = clampCashflowMonth(row.startMonth ?? 0, months)
  const endMonth =
    row.endMonth === null || row.endMonth === undefined
      ? months - 1
      : clampCashflowMonth(row.endMonth, months)

  if (endMonth < startMonth) return values

  const step = INTERVAL_STEPS[row.intervalUnit] || 1
  if (step <= 0) return values

  for (let month = startMonth; month < months && month <= endMonth; month += step) {
    values[month] -= amount
  }
  return values
}

const buildLoanValues = (row, months) => {
  const amount = Number(row.loanAmountUsd || row.amountUsd) || 0
  const term = Number(row.loanTermMonths) || 0
  const ratePct = Number(row.interestRatePct) || 0
  const rate = ratePct / 100 / 12
  const fundingMonth = clampCashflowMonth(row.fundingMonth ?? 0, months)
  const repaymentStart = clampCashflowMonth(row.repaymentStartMonth ?? fundingMonth, months)
  const values = {
    funding: Array(months).fill(0),
    interest: Array(months).fill(0),
    principal: Array(months).fill(0),
  }

  if (!amount || term <= 0) return values
  if (fundingMonth < months) {
    values.funding[fundingMonth] += amount
  }

  if (row.loanMode === 'interest_only') {
    const interestPayment = rate ? amount * rate : 0
    for (let i = 0; i < term; i += 1) {
      const monthIndex = repaymentStart + i
      if (monthIndex >= months) break
      if (interestPayment) values.interest[monthIndex] -= interestPayment
    }
    const payoffMonth = repaymentStart + Math.max(term - 1, 0)
    if (payoffMonth < months) {
      values.principal[payoffMonth] -= amount
    }
    return values
  }

  const payment =
    rate === 0
      ? amount / term
      : (amount * rate * (1 + rate) ** term) / ((1 + rate) ** term - 1 || 1)

  let remaining = amount
  for (let i = 0; i < term; i += 1) {
    const monthIndex = repaymentStart + i
    if (monthIndex >= months) break
    const interestPortion = rate ? remaining * rate : 0
    let principalPortion = payment - interestPortion
    if (principalPortion > remaining || i === term - 1) {
      principalPortion = remaining
    }
    remaining -= principalPortion
    if (interestPortion) values.interest[monthIndex] -= interestPortion
    if (principalPortion) values.principal[monthIndex] -= principalPortion
    if (remaining <= 0) break
  }

  return values
}

export const buildCarryingSeries = (rows = [], months = 60) => {
  const baseValues = Array(months).fill(0)
  const lineItems = []

  rows.forEach((row, index) => {
    if (row.carryingType === 'loan') {
      const loanValues = buildLoanValues(row, months)
      const lineDefinitions = [
        { id: `${row.id || `loan-${index}`}-funding`, label: `${row.costName || 'Loan'} • Funding`, values: loanValues.funding },
        { id: `${row.id || `loan-${index}`}-interest`, label: `${row.costName || 'Loan'} • Interest`, values: loanValues.interest },
        { id: `${row.id || `loan-${index}`}-principal`, label: `${row.costName || 'Loan'} • Principal`, values: loanValues.principal },
      ]
      lineDefinitions.forEach((item) => {
        if (!hasMagnitude(item.values)) return
        item.values.forEach((value, idx) => {
          baseValues[idx] += value
        })
        lineItems.push(item)
      })
      return
    }

    const recurringValues = buildIntervalExpenseValues(row, months)
    if (!hasMagnitude(recurringValues)) return
    recurringValues.forEach((value, idx) => {
      baseValues[idx] += value
    })
    lineItems.push({
      id: row.id || `carrying-${index}`,
      label: row.costName || 'Carrying Cost',
      values: recurringValues,
    })
  })

  return {
    label: 'Carrying Costs',
    type: 'expense',
    baseValues,
    lineItems,
  }
}

