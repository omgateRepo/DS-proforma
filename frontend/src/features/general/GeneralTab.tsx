import { useState, type FormEventHandler } from 'react'
import type { AddressSuggestion, GeneralFormState } from '../../types'

type SelectedCoords = { lat: number; lon: number } | null

type GeneralTabProps = {
  form: GeneralFormState
  generalStatus: 'idle' | 'saving' | 'error'
  onSubmit: FormEventHandler<HTMLFormElement>
  onFieldChange: (field: keyof GeneralFormState, value: string) => void
  addressQuery: string
  onAddressQueryChange: (value: string) => void
  addressSuggestions: AddressSuggestion[]
  addressSearchStatus: 'idle' | 'loading' | 'loaded' | 'error'
  addressSearchError: string
  onAddressInputFocus: () => void
  onAddressSelect: (suggestion: AddressSuggestion) => void
  selectedCoords: SelectedCoords
  apiOrigin: string
}

export function GeneralTab({
  form,
  generalStatus,
  onSubmit,
  onFieldChange,
  addressQuery,
  onAddressQueryChange,
  addressSuggestions,
  addressSearchStatus,
  addressSearchError,
  onAddressInputFocus,
  onAddressSelect,
  selectedCoords,
  apiOrigin,
}: GeneralTabProps) {
  const [isEditingAddress, setIsEditingAddress] = useState(false)

  const buildPreviewUrl = (endpoint: 'satellite' | 'front', extraParams?: Record<string, string>) => {
    if (!selectedCoords) return null
    const lat = String(selectedCoords.lat)
    const lon = String(selectedCoords.lon)
    const params = new URLSearchParams({
      lat,
      lon,
      zoom: '18',
      ...(extraParams || {}),
    })
    const prefix = apiOrigin?.replace(/\/$/, '') || ''
    return `${prefix}/api/geocode/${endpoint}?${params.toString()}`
  }

  const satelliteUrl = buildPreviewUrl('satellite')
  const buildingFrontUrl = buildPreviewUrl('front', { pitch: '60', bearing: '0' })

  const hasAddress = form.addressLine1 || form.city || form.state
  const showAddressSearch = !hasAddress || isEditingAddress

  const handleAddressSelect = (suggestion: AddressSuggestion) => {
    onAddressSelect(suggestion)
    setIsEditingAddress(false)
  }

  return (
    <form className="general-form" onSubmit={onSubmit}>
      {/* Section 1: Address */}
      <section className="general-section">
        <h3 className="section-title">📍 Address</h3>
        
        {showAddressSearch ? (
          <div className="address-search-wrapper">
            <label className="address-autocomplete address-autocomplete-full">
              <input
                type="text"
                value={addressQuery}
                placeholder="Search for address..."
                onFocus={onAddressInputFocus}
                onChange={(e) => onAddressQueryChange(e.target.value)}
                className="address-search-input"
                autoFocus={isEditingAddress}
              />
              {addressSearchStatus === 'loading' && <span className="muted tiny">Searching…</span>}
              {addressSuggestions.length > 0 && (
                <ul className="address-suggestions">
                  {addressSuggestions.map((suggestion) => (
                    <li key={suggestion.id} onMouseDown={() => handleAddressSelect(suggestion)}>
                      <strong>{suggestion.addressLine1}</strong>
                      <span>{suggestion.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              {addressSearchStatus === 'error' && addressSearchError && <span className="error tiny">{addressSearchError}</span>}
            </label>
            {hasAddress && isEditingAddress && (
              <button
                type="button"
                className="ghost address-cancel-btn"
                onClick={() => setIsEditingAddress(false)}
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div className="address-display">
            <div className="address-display-content">
              <div className="address-display-main">
                {form.addressLine1 && <span className="address-line">{form.addressLine1}</span>}
                {form.addressLine2 && <span className="address-line address-line2">{form.addressLine2}</span>}
                <span className="address-city-state">
                  {[form.city, form.state, form.zip].filter(Boolean).join(', ')}
                </span>
              </div>
              <button
                type="button"
                className="address-edit-btn"
                onClick={() => setIsEditingAddress(true)}
              >
                ✏️ Edit
              </button>
            </div>
            {(form.latitude || form.longitude) && (
              <div className="address-coords">
                <span className="coords-label">Coordinates:</span>
                <span className="coords-value">{form.latitude}, {form.longitude}</span>
              </div>
            )}
          </div>
        )}

        {satelliteUrl && buildingFrontUrl && (
          <div className="preview-row">
            <div className="satellite-preview">
              <p className="preview-label">Satellite</p>
              <img src={satelliteUrl} alt="Satellite preview" role="img" aria-label="satellite preview" />
            </div>
            <div className="satellite-preview">
              <p className="preview-label">Building front</p>
              <img src={buildingFrontUrl} alt="Building front preview" role="img" aria-label="building front preview" />
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Key Dates */}
      <section className="general-section key-dates-section">
        <h3 className="section-title">📅 Key Dates</h3>
        <div className="key-dates-grid">
          <div className="key-date-card">
            <span className="key-date-label">Closing Date</span>
            <input
              type="date"
              className="key-date-input"
              value={form.closingDate}
              onChange={(e) => onFieldChange('closingDate', e.target.value)}
            />
          </div>
          <div className="key-date-card">
            <span className="key-date-label">Start Leasing</span>
            <input
              type="date"
              className="key-date-input"
              value={form.startLeasingDate}
              onChange={(e) => onFieldChange('startLeasingDate', e.target.value)}
            />
          </div>
          <div className="key-date-card">
            <span className="key-date-label">Stabilized</span>
            <input
              type="date"
              className="key-date-input"
              value={form.stabilizedDate}
              onChange={(e) => onFieldChange('stabilizedDate', e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Section 3: Construction Fundamentals */}
      <section className="general-section fundamentals-section">
        <h3 className="section-title">🏗️ Construction Fundamentals</h3>
        <div className="fundamentals-grid">
          <div className="fundamental-card">
            <span className="fundamental-label">Purchase Price</span>
            <div className="fundamental-input-wrapper">
              <span className="fundamental-prefix">$</span>
              <input
                type="number"
                className="fundamental-input"
                value={form.purchasePriceUsd}
                onChange={(e) => onFieldChange('purchasePriceUsd', e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="fundamental-card">
            <span className="fundamental-label">Target Units</span>
            <div className="fundamental-input-wrapper">
              <input
                type="number"
                className="fundamental-input"
                value={form.targetUnits}
                onChange={(e) => onFieldChange('targetUnits', e.target.value)}
                placeholder="0"
              />
              <span className="fundamental-suffix">units</span>
            </div>
          </div>
          <div className="fundamental-card">
            <span className="fundamental-label">Target SqFt</span>
            <div className="fundamental-input-wrapper">
              <input
                type="number"
                className="fundamental-input"
                value={form.targetSqft}
                onChange={(e) => onFieldChange('targetSqft', e.target.value)}
                placeholder="0"
              />
              <span className="fundamental-suffix">sqft</span>
            </div>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="general-section">
        <h3 className="section-title">📝 Notes</h3>
        <label>
          Description / Notes
          <textarea rows={4} value={form.description} onChange={(e) => onFieldChange('description', e.target.value)} />
        </label>
      </section>

      <div className="actions">
        <button type="submit" disabled={generalStatus === 'saving'}>
          {generalStatus === 'saving' ? 'Saving…' : 'Save General Info'}
        </button>
      </div>
    </form>
  )
}
