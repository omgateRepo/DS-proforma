import { describe, expect, it } from 'vitest'
import {
  buildCostFormFromRow,
  buildScheduledCostPayload,
  getDefaultMeasurementForCategory,
} from '../costHelpers'

const convertMonthInputToOffset = (value: string | number) => Number(value) - 1
const formatOffsetForInput = (offset: number) => String(offset + 1)

describe('costHelpers', () => {
  it('builds payload for single payment mode', () => {
    const form = {
      costName: 'Architect Fees',
      amountUsd: '15000',
      paymentMode: 'single',
      paymentMonth: '3',
      softCategory: 'architect',
    }

    const payload = buildScheduledCostPayload(form, 'softCategory', convertMonthInputToOffset)

    expect(payload).toEqual({
      costName: 'Architect Fees',
      amountUsd: 15000,
      paymentMode: 'single',
      softCategory: 'architect',
      paymentMonth: 2,
    })
  })

  it('builds payload for range mode', () => {
    const form = {
      costName: 'Permits',
      amountUsd: '25000',
      paymentMode: 'range',
      rangeStartMonth: '2',
      rangeEndMonth: '5',
      softCategory: 'permits',
    }

    const payload = buildScheduledCostPayload(form, 'softCategory', convertMonthInputToOffset)

    expect(payload).toEqual({
      costName: 'Permits',
      amountUsd: 25000,
      paymentMode: 'range',
      softCategory: 'permits',
      rangeStartMonth: 1,
      rangeEndMonth: 4,
    })
  })

  it('builds payload for multi mode with percentages', () => {
    const form = {
      costName: 'Consulting',
      amountUsd: '30000',
      paymentMode: 'multi',
      monthsInput: '1, 4, 6',
      monthPercentagesInput: '50,25,25',
      softCategory: 'consulting',
    }

    const payload = buildScheduledCostPayload(form, 'softCategory', convertMonthInputToOffset)

    expect(payload).toEqual({
      costName: 'Consulting',
      amountUsd: 30000,
      paymentMode: 'multi',
      softCategory: 'consulting',
      monthList: [0, 3, 5],
      monthPercentages: [50, 25, 25],
    })
  })

  it('rebuilds form from row including measurement details', () => {
    const row = {
      costGroup: 'structure',
      costName: 'Structure Steel',
      amountUsd: 125000,
      paymentMode: 'single',
      paymentMonth: 5,
      measurementUnit: 'sqft',
      pricePerUnit: 250,
      unitsCount: 500,
    }

    const form = buildCostFormFromRow(
      row,
      'hardCategory',
      'structure',
      formatOffsetForInput,
      { includeMeasurement: true, defaultMeasurement: getDefaultMeasurementForCategory('structure') },
    )

    expect(form).toMatchObject({
      hardCategory: 'structure',
      costName: 'Structure Steel',
      amountUsd: '125000',
      paymentMode: 'single',
      paymentMonth: '6',
      measurementUnit: 'sqft',
      pricePerUnit: '250',
      unitsCount: '500',
    })
  })
})

