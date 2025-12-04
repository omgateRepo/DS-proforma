import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { act, render, screen, waitFor } from '@testing-library/react'

type ApiModule = typeof import('../api.js')

type UnauthorizedRef = { current: null | (() => void) }
type MockApi = {
  mockFetchProjects: ReturnType<typeof vi.fn>
  mockFetchCurrentUser: ReturnType<typeof vi.fn>
  mockFetchWeather: ReturnType<typeof vi.fn>
  mockSetAuthCredentials: ReturnType<typeof vi.fn>
  mockGetAuthCredentials: ReturnType<typeof vi.fn>
  mockClearAuthCredentials: ReturnType<typeof vi.fn>
  mockFetchUsers: ReturnType<typeof vi.fn>
  unauthorizedRef: UnauthorizedRef
}

const mockApi = vi.hoisted<MockApi>(() => ({
  mockFetchProjects: vi.fn(),
  mockFetchCurrentUser: vi.fn(),
  mockFetchWeather: vi.fn(),
  mockSetAuthCredentials: vi.fn(),
  mockGetAuthCredentials: vi.fn(),
  mockClearAuthCredentials: vi.fn(),
  mockFetchUsers: vi.fn(),
  unauthorizedRef: { current: null },
}))

const {
  mockFetchProjects,
  mockFetchCurrentUser,
  mockFetchWeather,
  mockSetAuthCredentials,
  mockGetAuthCredentials,
  mockClearAuthCredentials,
  mockFetchUsers,
  unauthorizedRef,
} = mockApi

vi.mock('../api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as ApiModule
  return {
    ...actual,
    fetchProjects: mockApi.mockFetchProjects,
    fetchCurrentUser: mockApi.mockFetchCurrentUser,
    fetchWeather: mockApi.mockFetchWeather,
    fetchUsers: mockApi.mockFetchUsers,
    getAuthCredentials: mockApi.mockGetAuthCredentials,
    setAuthCredentials: mockApi.mockSetAuthCredentials,
    clearAuthCredentials: mockApi.mockClearAuthCredentials,
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
    mockFetchProjects.mockReset()
    mockFetchCurrentUser.mockReset()
    mockFetchWeather.mockReset()
    mockFetchUsers.mockReset()
    mockFetchProjects.mockResolvedValue([])
    mockFetchCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'ds@example.com',
      displayName: 'Admin User',
      isSuperAdmin: true,
    })
    mockFetchWeather.mockResolvedValue({
      city: 'Philadelphia',
      label: 'Philadelphia',
      temperature_c: 20,
      windspeed_kmh: 5,
      sampled_at: '2025-01-01T00:00:00Z',
      source: 'open-meteo',
      latitude: 0,
      longitude: 0,
    })
    mockFetchUsers.mockResolvedValue([])
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

