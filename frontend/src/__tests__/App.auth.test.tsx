import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { act, render, screen, waitFor } from '@testing-library/react'

const {
  mockFetchProjects,
  mockFetchPhiladelphiaWeather,
  mockSetAuthCredentials,
  mockGetAuthCredentials,
  mockClearAuthCredentials,
  unauthorizedRef,
} = vi.hoisted(() => ({
  mockFetchProjects: vi.fn(),
  mockFetchPhiladelphiaWeather: vi.fn(),
  mockSetAuthCredentials: vi.fn(),
  mockGetAuthCredentials: vi.fn(),
  mockClearAuthCredentials: vi.fn(),
  unauthorizedRef: { current: null as null | (() => void) },
}))

vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchProjects: mockFetchProjects,
    fetchPhiladelphiaWeather: mockFetchPhiladelphiaWeather,
    getAuthCredentials: mockGetAuthCredentials,
    setAuthCredentials: mockSetAuthCredentials,
    clearAuthCredentials: mockClearAuthCredentials,
    onUnauthorized: vi.fn((handler) => {
      unauthorizedRef.current = handler
      return () => {
        if (unauthorizedRef.current === handler) unauthorizedRef.current = null
      }
    }),
  }
})

import App from '../App'

describe('App auth overlay', () => {
  beforeEach(() => {
    mockFetchProjects.mockResolvedValue([])
    mockFetchPhiladelphiaWeather.mockResolvedValue({
      city: 'Philadelphia',
      temperature_c: 20,
      windspeed_kmh: 5,
      sampled_at: '2025-01-01T00:00:00Z',
    })
    mockSetAuthCredentials.mockReset()
    mockGetAuthCredentials.mockReset()
    mockClearAuthCredentials.mockReset()
    unauthorizedRef.current = null
  })

  it('shows sign-in overlay when no credentials are stored', () => {
    mockGetAuthCredentials.mockReturnValue(null)
    render(<App />)

    expect(screen.getByText(/sign in to continue/i)).toBeInTheDocument()
    expect(mockFetchProjects).not.toHaveBeenCalled()
  })

  it('stores credentials and loads projects on successful sign-in', async () => {
    mockGetAuthCredentials.mockReturnValue(null)
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/username/i), 'ds')
    await user.type(screen.getByLabelText(/password/i), 'ds1')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockSetAuthCredentials).toHaveBeenCalledWith({ username: 'ds', password: 'ds1' })
      expect(mockFetchProjects).toHaveBeenCalled()
    })
    expect(screen.queryByText(/sign in to continue/i)).not.toBeInTheDocument()
  })

  it('reopens overlay when unauthorized handler fires', async () => {
    mockGetAuthCredentials.mockReturnValue({ username: 'ds', password: 'ds1' })
    render(<App />)

    await waitFor(() => {
      expect(mockFetchProjects).toHaveBeenCalled()
    })
    expect(screen.queryByText(/sign in to continue/i)).not.toBeInTheDocument()

    await act(async () => {
      unauthorizedRef.current?.()
    })

    await waitFor(() => {
      expect(mockClearAuthCredentials).toHaveBeenCalled()
      expect(screen.getByText(/sign in to continue/i)).toBeInTheDocument()
    })
  })
})

