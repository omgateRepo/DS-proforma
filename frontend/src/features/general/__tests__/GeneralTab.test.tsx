import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/setup/renderWithProviders'
import { GeneralTab } from '../GeneralTab'
import type { GeneralFormState } from '../../../types'

const baseForm: GeneralFormState = {
  name: 'Test Project',
  addressLine1: '123 Main St',
  addressLine2: '',
  city: 'Boston',
  state: 'MA',
  zip: '02118',
  purchasePriceUsd: '5000000',
  closingDate: '2025-02-01',
  startLeasingDate: '2025-06-01',
  stabilizedDate: '2025-12-01',
  latitude: '42.35',
  longitude: '-71.05',
  targetUnits: '40',
  targetSqft: '52000',
  description: 'Notes',
}

const defaultProps = {
  form: baseForm,
  generalStatus: 'idle' as const,
  onSubmit: vi.fn(),
  onFieldChange: vi.fn(),
  addressQuery: baseForm.addressLine1,
  onAddressQueryChange: vi.fn(),
  addressSuggestions: [],
  addressSearchStatus: 'idle' as const,
  addressSearchError: '',
  onAddressInputFocus: vi.fn(),
  onAddressSelect: vi.fn(),
  selectedCoords: { lat: 42.35, lon: -71.05 },
  apiOrigin: 'http://localhost:8080',
}

describe('GeneralTab', () => {
  it('submits the form with current values', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn((event) => event.preventDefault())
    const handleFieldChange = vi.fn()
    renderWithProviders(<GeneralTab {...defaultProps} onSubmit={handleSubmit} onFieldChange={handleFieldChange} />)

    const nameInput = screen.getByLabelText(/project name/i)
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } })

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
    })
    const lastCall = handleFieldChange.mock.calls.at(-1)
    expect(lastCall).toEqual(['name', 'Updated Name'])
  })

  it('shows satellite preview when coords exist', () => {
    renderWithProviders(<GeneralTab {...defaultProps} />)
    const img = screen.getByLabelText(/satellite preview/i)
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute(
      'src',
      expect.stringContaining('/api/geocode/satellite?lat=42.35&lon=-71.05'),
    )
  })
})

