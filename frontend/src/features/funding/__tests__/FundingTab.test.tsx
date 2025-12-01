import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/setup/renderWithProviders'
import { FundingTab } from '../FundingTab'

const baseProject = {
  id: 'proj-1',
  gpContributions: [],
  carryingCosts: [],
}

const noop = async () => {}
const formatOffsetForInput = (offset?: number | null) => String((offset ?? 0) + 1)
const getCalendarLabelForOffset = (offset: number | null) => `Cal ${offset ?? 0}`
const getCalendarLabelForInput = () => 'Month 1 • Jan'
const convertMonthInputToOffset = (value: string | number | null | undefined) => Number(value) - 1 || 0

describe('FundingTab', () => {
  it('renders empty states for contributions and loans', () => {
    renderWithProviders(
      <FundingTab
        project={baseProject}
        projectId="proj-1"
        onProjectRefresh={noop}
        formatOffsetForInput={formatOffsetForInput}
        getCalendarLabelForOffset={getCalendarLabelForOffset}
        getCalendarLabelForInput={getCalendarLabelForInput}
        convertMonthInputToOffset={convertMonthInputToOffset}
      />,
    )

    expect(screen.getByText(/No GP contributions yet/i)).toBeInTheDocument()
    expect(screen.getByText(/No loans yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\+ Add Contribution/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /\+ Add Loan/i })).toBeEnabled()
  })
})

