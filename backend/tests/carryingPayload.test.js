import { describe, expect, it } from 'vitest'
import { normalizeCarryingPayload } from '../src/utils/carrying.js'

describe('normalizeCarryingPayload', () => {
  it('normalizes loan payload', () => {
    const result = normalizeCarryingPayload({
      carryingType: 'loan',
      loanMode: 'interest_only',
      loanAmountUsd: '5000000',
      interestRatePct: '6.5',
      loanTermMonths: '24',
      fundingMonth: '1',
      repaymentStartMonth: '2',
      costName: 'Bridge Loan',
    })

    expect(result).toEqual({
      costName: 'Bridge Loan',
      carryingType: 'loan',
      loanMode: 'interest_only',
      loanAmountUsd: 5000000,
      interestRatePct: 6.5,
      loanTermMonths: 24,
      fundingMonth: 1,
      repaymentStartMonth: 2,
      amountUsd: 5000000,
      intervalUnit: null,
      startMonth: null,
      endMonth: null,
    })
  })

  it('returns error when repayment precedes funding', () => {
    const result = normalizeCarryingPayload({
      carryingType: 'loan',
      loanMode: 'interest_only',
      loanAmountUsd: '1000',
      interestRatePct: '5',
      loanTermMonths: '12',
      fundingMonth: '6',
      repaymentStartMonth: '2',
    })

    expect(result).toEqual({ error: 'repaymentStartMonth cannot be before fundingMonth' })
  })

  it('normalizes property tax payload', () => {
    const result = normalizeCarryingPayload({
      carryingType: 'property_tax',
      title: 'County Tax',
      amountUsd: '45000',
      startMonth: '3',
      endMonth: '15',
      intervalUnit: 'quarterly',
    })

    expect(result).toEqual({
      costName: 'County Tax',
      carryingType: 'property_tax',
      amountUsd: 45000,
      startMonth: 3,
      endMonth: 15,
      intervalUnit: 'quarterly',
      loanMode: null,
      loanAmountUsd: null,
      interestRatePct: null,
      loanTermMonths: null,
      fundingMonth: null,
      repaymentStartMonth: null,
    })
  })

  it('rejects invalid interval unit', () => {
    const result = normalizeCarryingPayload({
      carryingType: 'management',
      costName: 'Management',
      amountUsd: '1000',
      startMonth: '1',
      intervalUnit: 'weekly',
    })

    expect(result).toEqual({ error: 'intervalUnit is invalid' })
  })
})

