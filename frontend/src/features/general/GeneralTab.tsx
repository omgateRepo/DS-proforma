import { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react'
import type { AddressSuggestion, GeneralFormState } from '../../types'

type SelectedCoords = { lat: number; lon: number } | null

type GeneralTabProps = {
  form: GeneralFormState
  generalStatus: 'idle' | 'saving' | 'error'
  onFieldChange: (field: keyof GeneralFormState, value: string) => void
  onAutoSave: () => void
  addressQuery: string
  onAddressQueryChange: (value: string) => void
  addressSuggestions: AddressSuggestion[]
  addressSearchStatus: 'idle' | 'loading' | 'loaded' | 'error'
  addressSearchError: string
  onAddressInputFocus: () => void
  onAddressSelect: (suggestion: AddressSuggestion) => void
  selectedCoords: SelectedCoords
  apiOrigin: string
  buildingImageUrl?: string | null
  onBuildingImageChange?: (imageUrl: string | null) => void
}

const AUTOSAVE_DELAY = 1000 // 1 second debounce

export function GeneralTab({
  form,
  generalStatus,
  onFieldChange,
  onAutoSave,
  addressQuery,
  onAddressQueryChange,
  addressSuggestions,
  addressSearchStatus,
  addressSearchError,
  onAddressInputFocus,
  onAddressSelect,
  selectedCoords,
  apiOrigin,
  buildingImageUrl,
  onBuildingImageChange,
}: GeneralTabProps) {
  const [isEditingAddress, setIsEditingAddress] = useState(false)
  const [showSavedMessage, setShowSavedMessage] = useState(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevStatusRef = useRef(generalStatus)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Use ref to always call the latest onAutoSave (avoids stale closure)
  const onAutoSaveRef = useRef(onAutoSave)
  onAutoSaveRef.current = onAutoSave

  // Trigger debounced auto-save
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    autoSaveTimerRef.current = setTimeout(() => {
      onAutoSaveRef.current()
    }, AUTOSAVE_DELAY)
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [])

  // Show "saved" message briefly when save completes
  useEffect(() => {
    if (prevStatusRef.current === 'saving' && generalStatus === 'idle') {
      setShowSavedMessage(true)
      const timer = setTimeout(() => setShowSavedMessage(false), 2000)
      return () => clearTimeout(timer)
    }
    prevStatusRef.current = generalStatus
  }, [generalStatus])

  // Wrap field change to trigger auto-save
  const handleFieldChange = (field: keyof GeneralFormState, value: string) => {
    onFieldChange(field, value)
    triggerAutoSave()
  }

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

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      console.log('No file selected')
      return
    }
    if (!onBuildingImageChange) {
      console.log('onBuildingImageChange not provided')
      return
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (max 5MB for base64 storage)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      alert(`Image must be less than 5MB. Your image is ${(file.size / 1024 / 1024).toFixed(1)}MB`)
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result as string
      onBuildingImageChange(base64)
      triggerAutoSave()
    }
    reader.onerror = () => {
      alert('Failed to read image file')
      console.error('FileReader error:', reader.error)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = () => {
    if (onBuildingImageChange) {
      onBuildingImageChange(null)
      triggerAutoSave()
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="general-form">
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

        <div className="preview-row">
          {satelliteUrl && (
            <div className="satellite-preview">
              <p className="preview-label">Satellite</p>
              <img src={satelliteUrl} alt="Satellite preview" role="img" aria-label="satellite preview" />
            </div>
          )}
          <div className="satellite-preview building-image-preview">
            <p className="preview-label">Building Image</p>
            {buildingImageUrl ? (
              <>
                <div className="image-container">
                  <img src={buildingImageUrl} alt="Building" role="img" aria-label="building image" />
                </div>
                <div className="image-actions">
                  <button type="button" className="ghost tiny" onClick={() => fileInputRef.current?.click()}>
                    📷 Change
                  </button>
                  <button type="button" className="ghost tiny danger-text" onClick={handleRemoveImage}>
                    🗑 Remove
                  </button>
                </div>
              </>
            ) : buildingFrontUrl ? (
              <>
                <div className="image-container">
                  <img src={buildingFrontUrl} alt="Street view" role="img" aria-label="street view" />
                </div>
                <div className="image-actions">
                  <button type="button" className="ghost tiny" onClick={() => fileInputRef.current?.click()}>
                    📷 Upload Custom Image
                  </button>
                </div>
              </>
            ) : (
              <div className="upload-placeholder" onClick={() => fileInputRef.current?.click()}>
                <span>📷</span>
                <span>Click to upload building image</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </div>
        </div>
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
              onChange={(e) => handleFieldChange('closingDate', e.target.value)}
            />
          </div>
          <div className="key-date-card">
            <span className="key-date-label">Start Leasing</span>
            <input
              type="date"
              className="key-date-input"
              value={form.startLeasingDate}
              onChange={(e) => handleFieldChange('startLeasingDate', e.target.value)}
            />
          </div>
          <div className="key-date-card">
            <span className="key-date-label">Stabilized</span>
            <input
              type="date"
              className="key-date-input"
              value={form.stabilizedDate}
              onChange={(e) => handleFieldChange('stabilizedDate', e.target.value)}
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
                onChange={(e) => handleFieldChange('purchasePriceUsd', e.target.value)}
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
                onChange={(e) => handleFieldChange('targetUnits', e.target.value)}
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
                onChange={(e) => handleFieldChange('targetSqft', e.target.value)}
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
          <textarea rows={4} value={form.description} onChange={(e) => handleFieldChange('description', e.target.value)} />
        </label>
      </section>

      {/* Auto-save status indicator */}
      <div className="autosave-status">
        {generalStatus === 'saving' && (
          <span className="autosave-saving">💾 Saving...</span>
        )}
        {generalStatus === 'idle' && showSavedMessage && (
          <span className="autosave-saved">✓ Saved</span>
        )}
        {generalStatus === 'error' && (
          <span className="autosave-error">⚠ Save failed</span>
        )}
      </div>
    </div>
  )
}
