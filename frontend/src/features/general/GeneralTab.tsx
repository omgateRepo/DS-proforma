import type { FormEventHandler } from 'react'
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
  return (
    <form className="general-form" onSubmit={onSubmit}>
      <div className="form-grid">
        <label>
          Project Name
          <input type="text" value={form.name} onChange={(e) => onFieldChange('name', e.target.value)} required />
        </label>
        <label className="address-autocomplete">
          Address Line 1
          <input
            type="text"
            value={addressQuery}
            placeholder="Start typing address"
            onFocus={onAddressInputFocus}
            onChange={(e) => onAddressQueryChange(e.target.value)}
          />
          {addressSearchStatus === 'loading' && <span className="muted tiny">Searching…</span>}
          {addressSuggestions.length > 0 && (
            <ul className="address-suggestions">
              {addressSuggestions.map((suggestion) => (
                <li key={suggestion.id} onMouseDown={() => onAddressSelect(suggestion)}>
                  <strong>{suggestion.addressLine1}</strong>
                  <span>{suggestion.label}</span>
                </li>
              ))}
            </ul>
          )}
          {addressSearchStatus === 'error' && addressSearchError && <span className="error tiny">{addressSearchError}</span>}
        </label>
        <label>
          Address Line 2
          <input type="text" value={form.addressLine2} onChange={(e) => onFieldChange('addressLine2', e.target.value)} />
        </label>
        <label>
          City
          <input type="text" value={form.city} onChange={(e) => onFieldChange('city', e.target.value)} />
        </label>
        <label>
          State
          <input type="text" value={form.state} onChange={(e) => onFieldChange('state', e.target.value)} />
        </label>
        <label>
          ZIP
          <input type="text" value={form.zip} onChange={(e) => onFieldChange('zip', e.target.value)} />
        </label>
        <label>
          Purchase Price (USD)
          <input
            type="number"
            value={form.purchasePriceUsd}
            onChange={(e) => onFieldChange('purchasePriceUsd', e.target.value)}
          />
        </label>
        <label>
          Closing Date
          <input type="date" value={form.closingDate} onChange={(e) => onFieldChange('closingDate', e.target.value)} />
        </label>
        <label>
          Latitude
          <input type="number" step="any" value={form.latitude} onChange={(e) => onFieldChange('latitude', e.target.value)} />
        </label>
        <label>
          Longitude
          <input
            type="number"
            step="any"
            value={form.longitude}
            onChange={(e) => onFieldChange('longitude', e.target.value)}
          />
        </label>
        <label>
          Target Units
          <input type="number" value={form.targetUnits} onChange={(e) => onFieldChange('targetUnits', e.target.value)} />
        </label>
        <label>
          Target SqFt
          <input type="number" value={form.targetSqft} onChange={(e) => onFieldChange('targetSqft', e.target.value)} />
        </label>
      </div>
      {selectedCoords && (
        <div className="satellite-preview small">
          <img
            src={`${apiOrigin || ''}/api/geocode/satellite?lat=${selectedCoords.lat}&lon=${selectedCoords.lon}&zoom=18`}
            alt="Satellite preview"
            role="img"
            aria-label="satellite preview"
          />
        </div>
      )}
      <label>
        Description / Notes
        <textarea rows={4} value={form.description} onChange={(e) => onFieldChange('description', e.target.value)} />
      </label>
      <div className="actions">
        <button type="submit" disabled={generalStatus === 'saving'}>
          {generalStatus === 'saving' ? 'Saving…' : 'Save General Info'}
        </button>
      </div>
    </form>
  )
}

