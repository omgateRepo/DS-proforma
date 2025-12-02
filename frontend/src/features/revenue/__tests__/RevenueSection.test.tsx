import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/setup/renderWithProviders'
import { RevenueSection } from '../RevenueSection'

vi.mock('../revenueHelpers.js', () => ({
  calculateNetParking: () => 0,
  calculateNetRevenue: () => 0,
  gpPartners: [
    { id: 'darmon', label: 'Darmon' },
    { id: 'sherman', label: 'Sherman' },
  ],
}))

const baseProject = {
  id: 'proj-1',
  revenue: [],
  retailRevenue: [],
  parkingRevenue: [],
  gpContributions: [],
  apartmentTurnover: {
    turnoverPct: null,
    turnoverCostUsd: null,
  },
}

describe('RevenueSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens Apartment modal and validates required fields', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <RevenueSection
        project={baseProject}
        projectId="proj-1"
        onProjectRefresh={vi.fn()}
        formatOffsetForInput={(offset) => String(offset)}
        getCalendarLabelForOffset={() => ''}
        getCalendarLabelForInput={() => ''}
        convertMonthInputToOffset={(value) => Number(value)}
      />,
    )

    await user.click(screen.getByRole('button', { name: /add/i }))
    await user.click(screen.getByRole('button', { name: /apartment type/i }))

    await user.type(screen.getByLabelText(/type label/i), '1bd/1bth')
    await user.type(screen.getByLabelText(/number of units/i), '10')
    await user.type(screen.getByLabelText(/monthly rent/i), '2500')

    await user.click(screen.getByRole('button', { name: /save apartment type/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to add revenue item/i)
    })
  })
})

