import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  API_BASE,
  createGpContribution,
  createHardCost,
  createParkingRevenue,
  createProject,
  createRevenueItem,
  createSoftCost,
  deleteGpContribution,
  deleteHardCost,
  deleteParkingRevenue,
  deleteProject,
  deleteRevenueItem,
  deleteSoftCost,
  fetchPhiladelphiaWeather,
  fetchProjectDetail,
  fetchProjects,
  searchAddresses,
  stageLabels,
  updateGpContribution,
  updateHardCost,
  updateParkingRevenue,
  updateProjectGeneral,
  updateProjectStage,
  updateRevenueItem,
  updateSoftCost,
} from './api.js'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'hard', label: 'Hard Costs' },
  { id: 'soft', label: 'Soft Costs' },
  { id: 'carrying', label: 'Carrying Costs' },
  { id: 'cashflow', label: 'Cashflow' },
]

const CASHFLOW_MONTHS = 60

const defaultGeneralForm = {
  name: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
  propertyType: '',
  purchasePriceUsd: '',
  closingDate: '',
  latitude: '',
  longitude: '',
  targetUnits: '',
  targetSqft: '',
  description: '',
}

const createDefaultRevenueForm = () => ({
  typeLabel: '',
  unitSqft: '',
  unitCount: '',
  rentBudget: '',
  vacancyPct: '5',
  startMonth: '0',
})

const softCostCategories = [
  { id: 'architect', label: 'Architect / Design' },
  { id: 'legal', label: 'Legal' },
  { id: 'permits', label: 'Permits' },
  { id: 'consulting', label: 'Consulting' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'other', label: 'Other' },
]

const defaultSoftCostForm = {
  softCategory: 'architect',
  costName: '',
  amountUsd: '',
  paymentMode: 'single',
  paymentMonth: '',
  rangeStartMonth: '',
  rangeEndMonth: '',
  monthsInput: '',
  monthPercentagesInput: '',
}

const measurementUnitOptions = [
  { id: 'none', label: 'None (lump sum)' },
  { id: 'sqft', label: 'Per Square Feet' },
  { id: 'linear_feet', label: 'Per Linear Feet' },
  { id: 'apartment', label: 'Per Apartment' },
  { id: 'building', label: 'Per Building' },
]

const measurementUnitMeta = {
  sqft: { label: 'Square Feet', short: 'sqft', plural: 'square feet' },
  linear_feet: { label: 'Linear Feet', short: 'lf', plural: 'linear feet' },
  apartment: { label: 'Apartment', short: 'apt', plural: 'apartments' },
  building: { label: 'Building', short: 'bldg', plural: 'buildings' },
}

const clampCashflowMonth = (value) => {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.min(CASHFLOW_MONTHS - 1, Math.trunc(parsed)))
}

const buildRecurringLineValues = (netAmount, startMonth) => {
  const startIndex = clampCashflowMonth(startMonth)
  const values = Array(CASHFLOW_MONTHS).fill(0)
  for (let idx = startIndex; idx < CASHFLOW_MONTHS; idx += 1) {
    values[idx] = netAmount
  }
  return values
}

const buildContributionValues = (amount, monthIndex) => {
  const values = Array(CASHFLOW_MONTHS).fill(0)
  const index = clampCashflowMonth(monthIndex)
  values[index] = amount || 0
  return values
}

const hardCostCategories = [
  { id: 'structure', label: 'Structure' },
  { id: 'framing', label: 'Framing' },
  { id: 'roof', label: 'Roof' },
  { id: 'windows', label: 'Windows' },
  { id: 'fasade', label: 'Fasade' },
  { id: 'rough_plumbing', label: 'Rough Plumbing' },
  { id: 'rough_electric', label: 'Rough Electric' },
  { id: 'rough_havac', label: 'Rough HAVAC' },
  { id: 'fire_supresion', label: 'Fire Supresion' },
  { id: 'insulation', label: 'Insulation' },
  { id: 'drywall', label: 'Drywall' },
  { id: 'tiles', label: 'Tiles' },
  { id: 'paint', label: 'Paint' },
  { id: 'flooring', label: 'Flooring' },
  { id: 'molding_doors', label: 'Molding (+ doors)' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'finished_plumbing', label: 'Finished Plumbing' },
  { id: 'finished_electric', label: 'Finished Electric' },
  { id: 'appliances', label: 'Appliances' },
  { id: 'gym', label: 'Gym' },
  { id: 'study_lounge', label: 'Study Lounge' },
  { id: 'roof_top', label: 'Roof Top' },
]

const hardCostDefaultMeasurement = {
  structure: 'sqft',
  framing: 'sqft',
  roof: 'sqft',
  windows: 'sqft',
  fasade: 'sqft',
  rough_plumbing: 'apartment',
  rough_electric: 'apartment',
  rough_havac: 'apartment',
  fire_supresion: 'sqft',
  insulation: 'sqft',
  drywall: 'linear_feet',
  tiles: 'linear_feet',
  paint: 'linear_feet',
  flooring: 'apartment',
  molding_doors: 'sqft',
  kitchen: 'apartment',
  finished_plumbing: 'apartment',
  finished_electric: 'apartment',
  appliances: 'apartment',
  gym: 'building',
  study_lounge: 'building',
  roof_top: 'building',
}

const getDefaultMeasurementForCategory = (categoryId) => hardCostDefaultMeasurement[categoryId] || 'none'

const createDefaultHardCostForm = () => {
  const initialCategory = hardCostCategories[0].id
  return {
    hardCategory: initialCategory,
    measurementUnit: getDefaultMeasurementForCategory(initialCategory),
    costName: '',
    amountUsd: '',
    pricePerUnit: '',
    unitsCount: '',
    paymentMode: 'single',
    paymentMonth: '',
    rangeStartMonth: '',
    rangeEndMonth: '',
    monthsInput: '',
    monthPercentagesInput: '',
  }
}

const createDefaultParkingForm = () => ({
  typeLabel: '',
  spaceCount: '',
  monthlyRentUsd: '',
  vacancyPct: '5',
  startMonth: '0',
})

const gpPartners = [
  { id: 'darmon', label: 'Darmon' },
  { id: 'sherman', label: 'Sherman' },
]

const createDefaultGpForm = () => ({
  partner: gpPartners[0].id,
  amountUsd: '',
  contributionMonth: '0',
})

function App() {
  const [projects, setProjects] = useState([])
  const [projectsStatus, setProjectsStatus] = useState('loading')
  const [projectsError, setProjectsError] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)
  const [detailStatus, setDetailStatus] = useState('idle')
  const [detailError, setDetailError] = useState('')
  const [activeTab, setActiveTab] = useState('general')
  const [generalForm, setGeneralForm] = useState(defaultGeneralForm)
  const [generalStatus, setGeneralStatus] = useState('idle')
  const [newProjectName, setNewProjectName] = useState('')
  const [createStatus, setCreateStatus] = useState('idle')
  const [createError, setCreateError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [weather, setWeather] = useState(null)
  const [weatherStatus, setWeatherStatus] = useState('loading')
  const [weatherError, setWeatherError] = useState('')
  const [revenueForm, setRevenueForm] = useState(() => createDefaultRevenueForm())
  const [revenueModalType, setRevenueModalType] = useState('apartment')
  const [revenueStatus, setRevenueStatus] = useState('idle')
  const [stageUpdatingFor, setStageUpdatingFor] = useState(null)
  const [addressQuery, setAddressQuery] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState([])
  const [addressSearchStatus, setAddressSearchStatus] = useState('idle')
  const [addressSearchError, setAddressSearchError] = useState('')
  const [addressInputTouched, setAddressInputTouched] = useState(false)
  const [selectedCoords, setSelectedCoords] = useState(null)
  const [projectCoords, setProjectCoords] = useState({})
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState(null)
  const [deleteStatus, setDeleteStatus] = useState('idle')
  const [pendingRevenueDeleteId, setPendingRevenueDeleteId] = useState(null)
  const [isRevenueModalOpen, setIsRevenueModalOpen] = useState(false)
  const [revenueModalError, setRevenueModalError] = useState('')
  const [editingRevenueId, setEditingRevenueId] = useState(null)
  const [editingParkingId, setEditingParkingId] = useState(null)
  const [editingGpId, setEditingGpId] = useState(null)
  const [softCostForm, setSoftCostForm] = useState(defaultSoftCostForm)
  const [parkingForm, setParkingForm] = useState(() => createDefaultParkingForm())
  const [gpContributionForm, setGpContributionForm] = useState(() => createDefaultGpForm())
  const [hardCostForm, setHardCostForm] = useState(() => createDefaultHardCostForm())
  const [expandedCashflowRows, setExpandedCashflowRows] = useState(() => new Set())
  const [softCostStatus, setSoftCostStatus] = useState('idle')
  const [hardCostStatus, setHardCostStatus] = useState('idle')
  const [softCostModalError, setSoftCostModalError] = useState('')
  const [hardCostModalError, setHardCostModalError] = useState('')
  const [isSoftCostModalOpen, setIsSoftCostModalOpen] = useState(false)
  const [isHardCostModalOpen, setIsHardCostModalOpen] = useState(false)
  const [editingSoftCostId, setEditingSoftCostId] = useState(null)
  const [editingHardCostId, setEditingHardCostId] = useState(null)
  const [pendingSoftCostDeleteId, setPendingSoftCostDeleteId] = useState(null)
  const [pendingHardCostDeleteId, setPendingHardCostDeleteId] = useState(null)
  const [softCostDeleteStatus, setSoftCostDeleteStatus] = useState('idle')
  const [hardCostDeleteStatus, setHardCostDeleteStatus] = useState('idle')
  const [softCostDeleteError, setSoftCostDeleteError] = useState('')
  const [pendingParkingDeleteId, setPendingParkingDeleteId] = useState(null)
  const [parkingDeleteStatus, setParkingDeleteStatus] = useState('idle')
  const [parkingDeleteError, setParkingDeleteError] = useState('')
  const [pendingGpDeleteId, setPendingGpDeleteId] = useState(null)
  const [gpDeleteStatus, setGpDeleteStatus] = useState('idle')
  const [gpDeleteError, setGpDeleteError] = useState('')
  const [hardCostDeleteError, setHardCostDeleteError] = useState('')
  const [revenueMenuOpen, setRevenueMenuOpen] = useState(false)
  const revenueMenuRef = useRef(null)

  const stageOptions = stageLabels()
  const apiOrigin = (API_BASE || '').replace(/\/$/, '')
  const isEditingApartment = Boolean(editingRevenueId)
  const isEditingParkingRevenue = Boolean(editingParkingId)
  const isEditingGpContribution = Boolean(editingGpId)
  const isEditingSoftCost = Boolean(editingSoftCostId)
  const isEditingHardCost = Boolean(editingHardCostId)

  const formatDateForInput = (value) => {
    if (!value) return ''
    return value.split('T')[0]
  }

const formatNumberForInput = (value) => (value === null || value === undefined ? '' : String(value))

const parseFloatOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

  const formatCurrencyCell = (value) => {
    if (!value) return '—'
    const amount = Number(value)
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.005) return '—'
    return `${amount < 0 ? '-' : ''}$${Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`
  }

  const requiresMeasurementDetails = (unit) => unit && unit !== 'none'

  const recomputeHardCostAmount = (form) => {
    const next = { ...form }
    if (!requiresMeasurementDetails(next.measurementUnit)) {
      return next
    }
    const price = next.pricePerUnit !== '' ? Number(next.pricePerUnit) : null
    const units = next.unitsCount !== '' ? Number(next.unitsCount) : null
    next.amountUsd =
      price !== null && units !== null && Number.isFinite(price * units) ? String(price * units) : ''
    return next
  }

  const measurementUnitLabel = (value) => measurementUnitOptions.find((option) => option.id === value)?.label || value

  const parseCommaSeparatedNumbers = (value) => {
    if (!value) return []
    return value
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => Number(segment))
      .filter((num) => !Number.isNaN(num))
  }

  const toggleCashflowRow = (rowId) => {
    setExpandedCashflowRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  const buildScheduledCostPayload = (form, categoryField) => {
    const payload = {
      costName: form.costName.trim(),
      amountUsd: form.amountUsd === '' ? null : Number(form.amountUsd),
      paymentMode: form.paymentMode,
      [categoryField]: form[categoryField],
    }

    if (payload.paymentMode === 'single') {
      payload.paymentMonth = form.paymentMonth === '' ? null : Number(form.paymentMonth)
    } else if (payload.paymentMode === 'range') {
      payload.rangeStartMonth = form.rangeStartMonth === '' ? null : Number(form.rangeStartMonth)
      payload.rangeEndMonth = form.rangeEndMonth === '' ? null : Number(form.rangeEndMonth)
    } else if (payload.paymentMode === 'multi') {
      payload.monthList = parseCommaSeparatedNumbers(form.monthsInput)
      if (form.monthPercentagesInput && form.monthPercentagesInput.trim()) {
        payload.monthPercentages = parseCommaSeparatedNumbers(form.monthPercentagesInput)
      }
    }

    return payload
  }

  const apartmentRevenueRows = selectedProject?.revenue || []
  const parkingRevenueRows = selectedProject?.parkingRevenue || []
  const gpContributionRows = selectedProject?.gpContributions || []

  const RevenueTables = () => (
    <div className="revenue-sections">
      <section className="revenue-section">
        <div className="section-header">
          <h4>Apartments</h4>
          <p className="muted tiny">Start month controls when revenue begins</p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>SqFt</th>
                <th>Units</th>
                <th>Rent (USD)</th>
                <th>Vacancy %</th>
                <th>Start Month</th>
                <th>Net Monthly</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apartmentRevenueRows.map((row) => {
                const netMonthly = calculateNetRevenue(row)
                return (
                  <tr key={row.id}>
                    <td>{row.typeLabel}</td>
                    <td>{row.unitSqft || '—'}</td>
                    <td>{row.unitCount || '—'}</td>
                    <td>{row.rentBudget ? `$${row.rentBudget.toLocaleString()}` : '—'}</td>
                    <td>{row.vacancyPct ?? 5}%</td>
                    <td>{row.startMonth ?? 0}</td>
                    <td>
                      {netMonthly
                        ? `$${netMonthly.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}`
                        : '—'}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => startEditRevenue(row)}
                          disabled={revenueStatus === 'saving'}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="icon-delete"
                          onClick={() => handleDeleteRevenue(row.id)}
                          disabled={revenueStatus === 'saving'}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {apartmentRevenueRows.length === 0 && (
                <tr>
                  <td colSpan={8}>No apartment revenue yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="revenue-section">
        <div className="section-header">
          <h4>Parking</h4>
          <p className="muted tiny">Tracks garages, covered, uncovered, etc.</p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Spaces</th>
                <th>Rent (USD)</th>
                <th>Vacancy %</th>
                <th>Start Month</th>
                <th>Net Monthly</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parkingRevenueRows.map((row) => {
                const netMonthly = calculateNetParking(row)
                return (
                  <tr key={row.id}>
                    <td>{row.typeLabel}</td>
                    <td>{row.spaceCount || '—'}</td>
                    <td>{row.monthlyRentUsd ? `$${row.monthlyRentUsd.toLocaleString()}` : '—'}</td>
                    <td>{row.vacancyPct ?? 5}%</td>
                    <td>{row.startMonth ?? 0}</td>
                    <td>
                      {netMonthly
                        ? `$${netMonthly.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}`
                        : '—'}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => startEditParking(row)}
                          disabled={revenueStatus === 'saving'}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="icon-delete"
                          onClick={() => handleDeleteParking(row.id)}
                          disabled={revenueStatus === 'saving'}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {parkingRevenueRows.length === 0 && (
                <tr>
                  <td colSpan={7}>No parking revenue yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="revenue-section">
        <div className="section-header">
          <h4>GP Contributions</h4>
          <p className="muted tiny">One-time capital infusions</p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Partner</th>
                <th>Amount (USD)</th>
                <th>Month</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {gpContributionRows.map((row) => (
                <tr key={row.id}>
                  <td>{gpPartners.find((p) => p.id === row.partner)?.label || row.partner}</td>
                  <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                  <td>{row.contributionMonth ?? 0}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => startEditGpContribution(row)}
                        disabled={revenueStatus === 'saving'}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="icon-delete"
                        onClick={() => handleDeleteGpContribution(row.id)}
                        disabled={revenueStatus === 'saving'}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {gpContributionRows.length === 0 && (
                <tr>
                  <td colSpan={4}>No GP contributions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="revenue-summary">
        <span>Recurring monthly revenue (Apartments + Parking)</span>
        <strong>
          $
          {totalMonthlyRevenue.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
        </strong>
      </div>
    </div>
  )


  const softCategoryLabel = (value) => softCostCategories.find((option) => option.id === value)?.label || 'Other'
  const hardCategoryLabel = (value) => hardCostCategories.find((option) => option.id === value)?.label || 'Other'

  const buildCostFormFromRow = (row, categoryField, fallbackCategory, options = {}) => {
    const form = {
      [categoryField]: row.costGroup || fallbackCategory,
      costName: row.costName || '',
      amountUsd: row.amountUsd !== null && row.amountUsd !== undefined ? String(row.amountUsd) : '',
      paymentMode: row.paymentMode || 'single',
      paymentMonth: row.paymentMonth === null || row.paymentMonth === undefined ? '' : String(row.paymentMonth),
      rangeStartMonth: row.startMonth === null || row.startMonth === undefined ? '' : String(row.startMonth),
      rangeEndMonth: row.endMonth === null || row.endMonth === undefined ? '' : String(row.endMonth),
      monthsInput: row.monthList && row.monthList.length ? row.monthList.join(',') : '',
      monthPercentagesInput:
        row.monthPercentages && row.monthPercentages.length ? row.monthPercentages.join(',') : '',
    }

    if (options.includeMeasurement) {
      const defaultMeasurement = options.defaultMeasurement || 'none'
      form.measurementUnit = row.measurementUnit || defaultMeasurement
      form.pricePerUnit =
        row.pricePerUnit !== null && row.pricePerUnit !== undefined ? String(row.pricePerUnit) : ''
      form.unitsCount =
        row.unitsCount !== null && row.unitsCount !== undefined ? String(row.unitsCount) : ''
    }

    return form
  }

  const formatCostSchedule = (row) => {
    if (!row) return '—'
    if (row.paymentMode === 'range' && row.startMonth !== null && row.endMonth !== null) {
      return `Months ${row.startMonth}–${row.endMonth}`
    }
    if (row.paymentMode === 'multi' && row.monthList?.length) {
      if (row.monthPercentages?.length) {
        return row.monthList
          .map((month, index) => {
            const percentage = row.monthPercentages[index]
            if (percentage === undefined) return `Month ${month}`
            return `Month ${month} (${percentage}%)`
          })
          .join(', ')
      }
      return row.monthList.map((month) => `Month ${month}`).join(', ')
    }
    if (row.paymentMonth !== null && row.paymentMonth !== undefined) {
      return `Month ${row.paymentMonth}`
    }
    return '—'
  }

  const formatMeasurementSummary = (row) => {
    if (!row || !requiresMeasurementDetails(row.measurementUnit)) return '—'
    const meta = measurementUnitMeta[row.measurementUnit]
    const units =
      row.unitsCount !== null && row.unitsCount !== undefined ? Number(row.unitsCount) : null
    const price =
      row.pricePerUnit !== null && row.pricePerUnit !== undefined ? Number(row.pricePerUnit) : null
    const pluralLabel = meta?.plural || measurementUnitLabel(row.measurementUnit)
    const shortSuffix = meta?.short ? `/${meta.short}` : ''
    if (units !== null && price !== null && Number.isFinite(units) && Number.isFinite(price)) {
      return `${units.toLocaleString()} ${pluralLabel} × $${price.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}${shortSuffix}`
    }
    return pluralLabel
  }

  const clampCashflowMonth = (value) => {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    if (Number.isNaN(parsed)) return null
    return Math.min(CASHFLOW_MONTHS - 1, Math.max(0, Math.trunc(parsed)))
  }

  const buildAllocationsForCost = (row) => {
    const allocations = Array(CASHFLOW_MONTHS).fill(0)
    const amount = Number(row?.amountUsd) || 0
    if (!amount) return allocations

    const addShare = (month, share) => {
      const idx = clampCashflowMonth(month)
      if (idx === null || !Number.isFinite(share)) return
      allocations[idx] += share
    }

    const paymentMode = row.paymentMode || 'single'

    if (paymentMode === 'range') {
      let start = clampCashflowMonth(row.startMonth ?? row.paymentMonth ?? 0)
      let end = clampCashflowMonth(row.endMonth ?? row.startMonth ?? start)
      if (start === null) start = 0
      if (end === null) end = start
      if (end < start) {
        const swap = start
        start = end
        end = swap
      }
      const span = end - start + 1
      const share = span > 0 ? amount / span : amount
      for (let month = start; month <= end; month += 1) {
        addShare(month, share)
      }
      return allocations
    }

    if (paymentMode === 'multi') {
      let months = Array.isArray(row.monthList) ? row.monthList : []
      if (!months.length && (row.paymentMonth ?? '') !== '') {
        months = [row.paymentMonth]
      }
      const normalizedMonths = months
        .map((entry) => clampCashflowMonth(entry))
        .filter((entry) => entry !== null)
      if (!normalizedMonths.length) {
        addShare(0, amount)
        return allocations
      }
      let pctArray = Array.isArray(row.monthPercentages) ? row.monthPercentages : []
      pctArray = pctArray.map((value) => Number(value))
      const hasValidPercents =
        pctArray.length === normalizedMonths.length && pctArray.every((value) => Number.isFinite(value))
      if (hasValidPercents) {
        normalizedMonths.forEach((month, index) => {
          addShare(month, (amount * pctArray[index]) / 100)
        })
      } else {
        const evenShare = amount / normalizedMonths.length
        normalizedMonths.forEach((month) => addShare(month, evenShare))
      }
      return allocations
    }

    const month = clampCashflowMonth(row.paymentMonth ?? 0) ?? 0
    addShare(month, amount)
    return allocations
  }

  const buildExpenseSeries = (rows = [], headerLabel) => {
    const totals = Array(CASHFLOW_MONTHS).fill(0)
    const lineItems = rows.map((row, index) => {
      const allocations = buildAllocationsForCost(row)
      allocations.forEach((value, idx) => {
        totals[idx] += value
      })
      return {
        id: row.id || `${headerLabel}-${index}`,
        label: row.costName || `${headerLabel} ${index + 1}`,
        values: allocations.map((value) => value * -1),
      }
    })
    return {
      label: headerLabel,
      type: 'expense',
      baseValues: totals.map((value) => value * -1),
      lineItems,
    }
  }

  const calculateNetRevenue = (row) => {
    const rent = row.rentBudget || 0
    const units = row.unitCount || 0
    const vacancy = row.vacancyPct === undefined || row.vacancyPct === null ? 5 : row.vacancyPct
    return rent * units * (1 - vacancy / 100)
  }

const calculateNetParking = (row) => {
  const rent = row.monthlyRentUsd || 0
  const spaces = row.spaceCount || 0
  const vacancy = row.vacancyPct === undefined || row.vacancyPct === null ? 5 : row.vacancyPct
  return rent * spaces * (1 - vacancy / 100)
}

  const totalMonthlyRevenue = useMemo(() => {
    const apartments = apartmentRevenueRows.reduce((sum, row) => sum + calculateNetRevenue(row), 0)
    const parking = parkingRevenueRows.reduce((sum, row) => sum + calculateNetParking(row), 0)
    return apartments + parking
  }, [apartmentRevenueRows, parkingRevenueRows])

  const totalSoftCosts = useMemo(() => {
    if (!selectedProject?.softCosts) return 0
    return selectedProject.softCosts.reduce((sum, row) => sum + (row.amountUsd || 0), 0)
  }, [selectedProject])

  const totalHardCosts = useMemo(() => {
    if (!selectedProject?.hardCosts) return 0
    return selectedProject.hardCosts.reduce((sum, row) => sum + (row.amountUsd || 0), 0)
  }, [selectedProject])

  const cashflowMonths = useMemo(() => {
    let baseDate = selectedProject?.general?.closingDate ? new Date(selectedProject.general.closingDate) : new Date()
    if (Number.isNaN(baseDate.getTime())) {
      baseDate = new Date()
    }
    return Array.from({ length: CASHFLOW_MONTHS }, (_, index) => {
      const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + index, 1)
      return {
        index,
        label: `M${index}`,
        calendarLabel: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
      }
    })
  }, [selectedProject])

  const revenueSeries = useMemo(() => {
    const apartmentLineItems = apartmentRevenueRows.map((row, index) => {
      const net = calculateNetRevenue(row)
      return {
        id: row.id || `apt-${index}`,
        label: `Apartment • ${row.typeLabel || 'Unit type'}`,
        values: buildRecurringLineValues(net, row.startMonth ?? 0),
      }
    })

    const parkingLineItems = parkingRevenueRows.map((row, index) => {
      const net = calculateNetParking(row)
      return {
        id: row.id || `park-${index}`,
        label: `Parking • ${row.typeLabel || 'Parking'}`,
        values: buildRecurringLineValues(net, row.startMonth ?? 0),
      }
    })

    const gpLineItems = gpContributionRows.map((row, index) => {
      const partnerLabel = gpPartners.find((p) => p.id === row.partner)?.label || row.partner || 'GP'
      return {
        id: row.id || `gp-${index}`,
        label: `GP • ${partnerLabel}`,
        values: buildContributionValues(row.amountUsd || 0, row.contributionMonth ?? 0),
      }
    })

    const lineItems = [...apartmentLineItems, ...parkingLineItems, ...gpLineItems]
    const baseValues = Array(CASHFLOW_MONTHS).fill(0)
    lineItems.forEach((item) => {
      item.values.forEach((value, idx) => {
        baseValues[idx] += value
      })
    })

    return { label: 'Revenues', type: 'revenue', baseValues, lineItems }
  }, [apartmentRevenueRows, parkingRevenueRows, gpContributionRows])

  const softCostSeries = useMemo(
    () => buildExpenseSeries(selectedProject?.softCosts || [], 'Soft Costs'),
    [selectedProject],
  )

  const hardCostSeries = useMemo(
    () => buildExpenseSeries(selectedProject?.hardCosts || [], 'Hard Costs'),
    [selectedProject],
  )

  const carryingCostSeries = useMemo(
    () => ({ label: 'Carrying Costs', type: 'expense', baseValues: Array(CASHFLOW_MONTHS).fill(0), lineItems: [] }),
    [],
  )

  const cashflowRows = useMemo(() => {
    const buildRow = (id, series) => ({
      id,
      label: series.label,
      type: series.type,
      values: series.baseValues,
      subRows: series.lineItems,
    })
    const totalRowValues = cashflowMonths.map((_, index) => {
      return (
        (revenueSeries.baseValues[index] || 0) +
        (softCostSeries.baseValues[index] || 0) +
        (hardCostSeries.baseValues[index] || 0) +
        (carryingCostSeries.baseValues[index] || 0)
      )
    })
    return [
      buildRow('revenues', revenueSeries),
      buildRow('soft', softCostSeries),
      buildRow('hard', hardCostSeries),
      buildRow('carrying', carryingCostSeries),
      {
        id: 'total',
        label: 'Total',
        type: 'total',
        values: totalRowValues,
        subRows: [],
      },
    ]
  }, [cashflowMonths, revenueSeries, softCostSeries, hardCostSeries, carryingCostSeries])

  const closingMonthLabel = useMemo(() => {
    if (!selectedProject?.general?.closingDate) return null
    const parsed = new Date(selectedProject.general.closingDate)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toLocaleString('default', { month: 'long', year: 'numeric' })
  }, [selectedProject])

  const projectsByStage = useMemo(() => {
    return stageOptions.reduce((acc, stage) => {
      acc[stage.id] = projects.filter((project) => project.stage === stage.id)
      return acc
    }, {})
  }, [projects, stageOptions])
  const isKanbanView = !selectedProjectId

  const loadProjects = async () => {
    setProjectsStatus('loading')
    setProjectsError('')
    try {
      const rows = await fetchProjects()
        setProjects(rows)
      if (selectedProjectId && !rows.some((row) => row.id === selectedProjectId)) {
        setSelectedProjectId(null)
        setSelectedProject(null)
      }
      setProjectsStatus('loaded')
    } catch (err) {
      setProjectsError(err.message)
      setProjectsStatus('error')
    }
  }

  const loadProjectDetail = async (projectId) => {
    if (!projectId) return
    setDetailStatus('loading')
    setDetailError('')
    try {
      const detail = await fetchProjectDetail(projectId)
      detail.parkingRevenue = detail.parkingRevenue || []
      detail.gpContributions = detail.gpContributions || []
      setSelectedProject(detail)
      setGeneralForm({
        ...defaultGeneralForm,
        name: detail.name,
        ...detail.general,
        purchasePriceUsd: detail.general.purchasePriceUsd || '',
        closingDate: formatDateForInput(detail.general.closingDate),
        latitude: formatNumberForInput(detail.general.latitude),
        longitude: formatNumberForInput(detail.general.longitude),
        targetUnits: detail.general.targetUnits || '',
        targetSqft: detail.general.targetSqft || '',
      })
      setAddressQuery(detail.general.addressLine1 || '')
      setAddressInputTouched(false)
      setAddressSuggestions([])
      const coordsFromDetail =
        detail.general.latitude !== null && detail.general.longitude !== null
          ? { lat: detail.general.latitude, lon: detail.general.longitude }
          : null
      const savedCoords = coordsFromDetail || projectCoords[projectId] || null
      setSelectedCoords(savedCoords || null)
      if (coordsFromDetail) {
        setProjectCoords((prev) => ({ ...prev, [projectId]: coordsFromDetail }))
      }
      setDetailStatus('loaded')
    } catch (err) {
      setDetailError(err.message)
      setDetailStatus('error')
    }
  }

  useEffect(() => {
    loadProjects()
    fetchPhiladelphiaWeather()
      .then((reading) => {
        setWeather(reading)
        setWeatherStatus('loaded')
      })
      .catch((err) => {
        setWeatherError(err.message)
        setWeatherStatus('error')
      })
  }, [])

  useEffect(() => {
    setExpandedCashflowRows(new Set())
  }, [selectedProjectId])

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetail(selectedProjectId)
    }
  }, [selectedProjectId])

  useEffect(() => {
    if (!revenueMenuOpen) return
    const handleClick = (event) => {
      if (!revenueMenuRef.current) return
      if (revenueMenuRef.current.contains(event.target)) return
      setRevenueMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [revenueMenuOpen])

  useEffect(() => {
    if (!addressInputTouched) return
    if (!addressQuery || addressQuery.length < 3) {
      setAddressSuggestions([])
      return
    }
    setAddressSearchStatus('loading')
    setAddressSearchError('')
    const timeout = setTimeout(async () => {
      try {
        const results = await searchAddresses(addressQuery)
        setAddressSuggestions(results)
        setAddressSearchStatus('loaded')
      } catch (err) {
        setAddressSearchStatus('error')
        setAddressSearchError(err.message)
        setAddressSuggestions([])
      }
    }, 400)
    return () => clearTimeout(timeout)
  }, [addressQuery, addressInputTouched])

  async function handleCreateProject(event) {
    event.preventDefault()
    setCreateError('')
    if (!newProjectName.trim()) {
      setCreateError('Project name is required')
      return
    }

    try {
      setCreateStatus('saving')
      const created = await createProject(newProjectName.trim())
      setProjects((prev) => [created, ...prev])
      setNewProjectName('')
      await loadProjects()
      setIsCreateModalOpen(false)
      setCreateStatus('idle')
    } catch (err) {
      setCreateError(err.message)
      setCreateStatus('error')
    }
  }

  function openCreateModal() {
    setCreateError('')
    setNewProjectName('')
    setIsCreateModalOpen(true)
  }

  function resetRevenueForms() {
    setRevenueForm(createDefaultRevenueForm())
    setParkingForm(createDefaultParkingForm())
    setGpContributionForm(createDefaultGpForm())
    setRevenueModalType('apartment')
    setEditingRevenueId(null)
    setEditingParkingId(null)
    setEditingGpId(null)
    setRevenueMenuOpen(false)
  }

  function openRevenueModal(type) {
    setRevenueModalError('')
    resetRevenueForms()
    setRevenueModalType(type)
    setRevenueMenuOpen(false)
    setIsRevenueModalOpen(true)
  }

  function closeRevenueModal() {
    if (revenueStatus === 'saving') return
    setIsRevenueModalOpen(false)
    setRevenueModalError('')
    resetRevenueForms()
  }

  function startEditRevenue(row) {
    setRevenueModalError('')
    if (row.spaceCount !== undefined) {
      setParkingForm({
        typeLabel: row.typeLabel || '',
        spaceCount: row.spaceCount !== null && row.spaceCount !== undefined ? String(row.spaceCount) : '',
        monthlyRentUsd:
          row.monthlyRentUsd !== null && row.monthlyRentUsd !== undefined ? String(row.monthlyRentUsd) : '',
        vacancyPct: row.vacancyPct !== null && row.vacancyPct !== undefined ? String(row.vacancyPct) : '5',
        startMonth: row.startMonth !== null && row.startMonth !== undefined ? String(row.startMonth) : '0',
      })
      setRevenueModalType('parking')
      setEditingParkingId(row.id)
      setEditingRevenueId(null)
      setEditingGpId(null)
    } else if (row.partner) {
      setGpContributionForm({
        partner: row.partner,
        amountUsd: row.amountUsd !== null && row.amountUsd !== undefined ? String(row.amountUsd) : '',
        contributionMonth:
          row.contributionMonth !== null && row.contributionMonth !== undefined
            ? String(row.contributionMonth)
            : '0',
      })
      setRevenueModalType('gp')
      setEditingGpId(row.id)
      setEditingRevenueId(null)
      setEditingParkingId(null)
    } else {
      setRevenueForm({
        typeLabel: row.typeLabel || '',
        unitSqft: row.unitSqft !== null && row.unitSqft !== undefined ? String(row.unitSqft) : '',
        unitCount: row.unitCount !== null && row.unitCount !== undefined ? String(row.unitCount) : '',
        rentBudget: row.rentBudget !== null && row.rentBudget !== undefined ? String(row.rentBudget) : '',
        vacancyPct: row.vacancyPct !== null && row.vacancyPct !== undefined ? String(row.vacancyPct) : '5',
        startMonth: row.startMonth !== null && row.startMonth !== undefined ? String(row.startMonth) : '0',
      })
      setRevenueModalType('apartment')
      setEditingRevenueId(row.id)
      setEditingParkingId(null)
      setEditingGpId(null)
    }
    setIsRevenueModalOpen(true)
  }

  function startEditParking(row) {
    setRevenueModalError('')
    setParkingForm({
      typeLabel: row.typeLabel || '',
      spaceCount: row.spaceCount !== null && row.spaceCount !== undefined ? String(row.spaceCount) : '',
      monthlyRentUsd:
        row.monthlyRentUsd !== null && row.monthlyRentUsd !== undefined ? String(row.monthlyRentUsd) : '',
      vacancyPct: row.vacancyPct !== null && row.vacancyPct !== undefined ? String(row.vacancyPct) : '5',
      startMonth: row.startMonth !== null && row.startMonth !== undefined ? String(row.startMonth) : '0',
    })
    setRevenueModalType('parking')
    setEditingParkingId(row.id)
    setEditingRevenueId(null)
    setEditingGpId(null)
    setRevenueMenuOpen(false)
    setIsRevenueModalOpen(true)
  }

  function startEditGpContribution(row) {
    setRevenueModalError('')
    setGpContributionForm({
      partner: row.partner || gpPartners[0].id,
      amountUsd: row.amountUsd !== null && row.amountUsd !== undefined ? String(row.amountUsd) : '',
      contributionMonth:
        row.contributionMonth !== null && row.contributionMonth !== undefined ? String(row.contributionMonth) : '0',
    })
    setRevenueModalType('gp')
    setEditingGpId(row.id)
    setEditingRevenueId(null)
    setEditingParkingId(null)
    setRevenueMenuOpen(false)
    setIsRevenueModalOpen(true)
  }

  function openSoftCostModal() {
    setSoftCostModalError('')
    setSoftCostForm(defaultSoftCostForm)
    setEditingSoftCostId(null)
    setSoftCostStatus('idle')
    setIsSoftCostModalOpen(true)
  }

  function closeSoftCostModal() {
    if (softCostStatus === 'saving') return
    setIsSoftCostModalOpen(false)
    setSoftCostModalError('')
    setEditingSoftCostId(null)
    setSoftCostStatus('idle')
  }

  function startEditSoftCost(row) {
    setSoftCostModalError('')
    setSoftCostForm(buildCostFormFromRow(row, 'softCategory', softCostCategories[0].id))
    setEditingSoftCostId(row.id)
    setIsSoftCostModalOpen(true)
  }

  function openHardCostModal() {
    setHardCostModalError('')
    setHardCostForm(createDefaultHardCostForm())
    setEditingHardCostId(null)
    setHardCostStatus('idle')
    setIsHardCostModalOpen(true)
  }

  function closeHardCostModal() {
    if (hardCostStatus === 'saving') return
    setIsHardCostModalOpen(false)
    setHardCostModalError('')
    setEditingHardCostId(null)
    setHardCostStatus('idle')
    setHardCostForm(createDefaultHardCostForm())
  }

  function startEditHardCost(row) {
    setHardCostModalError('')
    const form = buildCostFormFromRow(row, 'hardCategory', hardCostCategories[0].id, {
      includeMeasurement: true,
      defaultMeasurement: getDefaultMeasurementForCategory(row.costGroup || hardCostCategories[0].id),
    })
    setHardCostForm(recomputeHardCostAmount(form))
    setEditingHardCostId(row.id)
    setIsHardCostModalOpen(true)
  }

  function handleHardCategoryChange(value) {
    setHardCostForm((prev) => {
      const measurementUnit = getDefaultMeasurementForCategory(value)
      const next = {
        ...prev,
        hardCategory: value,
        measurementUnit,
      }
      if (measurementUnit === 'none') {
        next.pricePerUnit = ''
        next.unitsCount = ''
        next.amountUsd = ''
      } else {
        next.pricePerUnit = ''
        next.unitsCount = ''
      }
      return recomputeHardCostAmount(next)
    })
  }

  function handleHardMeasurementChange(value) {
    setHardCostForm((prev) => {
      const next = {
        ...prev,
        measurementUnit: value,
      }
      if (value === 'none') {
        next.pricePerUnit = ''
        next.unitsCount = ''
        next.amountUsd = ''
      } else if (value !== prev.measurementUnit) {
        next.pricePerUnit = ''
        next.unitsCount = ''
      }
      return recomputeHardCostAmount(next)
    })
  }

  function closeCreateModal() {
    if (createStatus === 'saving') return
    setIsCreateModalOpen(false)
  }

  function requestDeleteProject(id) {
    setDeleteError('')
    setPendingDeleteProjectId(id)
  }

  async function confirmDeleteProject() {
    if (!pendingDeleteProjectId) return
    setDeleteStatus('saving')
    try {
      await deleteProject(pendingDeleteProjectId)
      if (pendingDeleteProjectId === selectedProjectId) {
        handleBackToKanban()
      }
      setProjectCoords((prev) => {
        if (!prev[pendingDeleteProjectId]) return prev
        const next = { ...prev }
        delete next[pendingDeleteProjectId]
        return next
      })
      await loadProjects()
      setPendingDeleteProjectId(null)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleteStatus('idle')
    }
  }

  function handleBackToKanban() {
    setSelectedProjectId(null)
    setSelectedProject(null)
  }

  function cancelDeleteProject() {
    if (deleteStatus === 'saving') return
    setPendingDeleteProjectId(null)
    setDeleteError('')
  }

  async function handleStageChange(projectId, stage) {
    setStageUpdatingFor(projectId)
    try {
      await updateProjectStage(projectId, stage)
      await loadProjects()
      if (projectId === selectedProjectId) {
        setSelectedProject((prev) => (prev ? { ...prev, stage } : prev))
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setStageUpdatingFor(null)
    }
  }

  async function handleGeneralSave(event) {
    event.preventDefault()
    if (!selectedProjectId) return
    setGeneralStatus('saving')
    try {
      const payload = {
        ...generalForm,
        purchasePriceUsd: generalForm.purchasePriceUsd ? Number(generalForm.purchasePriceUsd) : null,
        closingDate: generalForm.closingDate || null,
        latitude: parseFloatOrNull(generalForm.latitude),
        longitude: parseFloatOrNull(generalForm.longitude),
        targetUnits: generalForm.targetUnits ? Number(generalForm.targetUnits) : null,
        targetSqft: generalForm.targetSqft ? Number(generalForm.targetSqft) : null,
      }
      const updated = await updateProjectGeneral(selectedProjectId, payload)
      setSelectedProject((prev) => (prev ? { ...prev, name: updated.name, general: updated.general } : prev))
      setAddressQuery(updated.general.addressLine1 || '')
      setGeneralForm((prev) => ({
        ...prev,
        closingDate: formatDateForInput(updated.general.closingDate),
        latitude: formatNumberForInput(updated.general.latitude),
        longitude: formatNumberForInput(updated.general.longitude),
      }))
      if (updated.general.latitude !== null && updated.general.longitude !== null) {
        const coords = { lat: updated.general.latitude, lon: updated.general.longitude }
        setSelectedCoords(coords)
        setProjectCoords((prev) => ({ ...prev, [selectedProjectId]: coords }))
      } else {
        setProjectCoords((prev) => {
          if (!prev[selectedProjectId]) return prev
          const next = { ...prev }
          delete next[selectedProjectId]
          return next
        })
        setSelectedCoords(null)
      }
      setGeneralStatus('idle')
      await loadProjects()
    } catch (err) {
      setGeneralStatus('error')
      alert(err.message)
    }
  }

  async function handleAddRevenue(event) {
    event.preventDefault()
    if (!selectedProjectId) return
    setRevenueStatus('saving')
    setRevenueModalError('')

    const buildApartmentPayload = () => ({
      typeLabel: revenueForm.typeLabel,
      unitSqft: revenueForm.unitSqft ? Number(revenueForm.unitSqft) : null,
      unitCount: revenueForm.unitCount ? Number(revenueForm.unitCount) : null,
      rentBudget: revenueForm.rentBudget ? Number(revenueForm.rentBudget) : null,
      vacancyPct: revenueForm.vacancyPct ? Number(revenueForm.vacancyPct) : 5,
      startMonth: revenueForm.startMonth ? Number(revenueForm.startMonth) : 0,
    })

    const buildParkingPayload = () => ({
      typeLabel: parkingForm.typeLabel,
      spaceCount: parkingForm.spaceCount ? Number(parkingForm.spaceCount) : null,
      monthlyRentUsd: parkingForm.monthlyRentUsd ? Number(parkingForm.monthlyRentUsd) : null,
      vacancyPct: parkingForm.vacancyPct ? Number(parkingForm.vacancyPct) : 5,
      startMonth: parkingForm.startMonth ? Number(parkingForm.startMonth) : 0,
    })

    const buildGpPayload = () => ({
      partner: gpContributionForm.partner,
      amountUsd: gpContributionForm.amountUsd ? Number(gpContributionForm.amountUsd) : null,
      contributionMonth: gpContributionForm.contributionMonth ? Number(gpContributionForm.contributionMonth) : 0,
    })

    try {
      if (revenueModalType === 'apartment') {
        const payload = buildApartmentPayload()
        if (!payload.typeLabel.trim()) {
          setRevenueStatus('idle')
          setRevenueModalError('Apartment type name is required.')
          return
        }
        if (!payload.unitCount) {
          setRevenueStatus('idle')
          setRevenueModalError('Number of units is required.')
          return
        }
        if (payload.rentBudget === null) {
          setRevenueStatus('idle')
          setRevenueModalError('Monthly rent is required.')
          return
        }
        if (editingRevenueId) {
          await updateRevenueItem(selectedProjectId, editingRevenueId, payload)
        } else {
          await createRevenueItem(selectedProjectId, payload)
        }
      } else if (revenueModalType === 'parking') {
        const payload = buildParkingPayload()
        if (!payload.typeLabel.trim()) {
          setRevenueStatus('idle')
          setRevenueModalError('Parking type name is required.')
          return
        }
        if (!payload.spaceCount) {
          setRevenueStatus('idle')
          setRevenueModalError('Number of spaces is required.')
          return
        }
        if (payload.monthlyRentUsd === null) {
          setRevenueStatus('idle')
          setRevenueModalError('Monthly rent per space is required.')
          return
        }
        if (editingParkingId) {
          await updateParkingRevenue(selectedProjectId, editingParkingId, payload)
        } else {
          await createParkingRevenue(selectedProjectId, payload)
        }
      } else {
        const payload = buildGpPayload()
        if (payload.amountUsd === null) {
          setRevenueStatus('idle')
          setRevenueModalError('Contribution amount is required.')
          return
        }
        if (editingGpId) {
          await updateGpContribution(selectedProjectId, editingGpId, payload)
        } else {
          await createGpContribution(selectedProjectId, payload)
        }
      }
      resetRevenueForms()
      setRevenueStatus('idle')
      setIsRevenueModalOpen(false)
      setEditingRevenueId(null)
      await loadProjectDetail(selectedProjectId)
    } catch (err) {
      setRevenueStatus('error')
      setRevenueModalError(err.message)
    }
  }

  async function handleSoftCostSubmit(event) {
    event.preventDefault()
    if (!selectedProjectId) return
    setSoftCostStatus('saving')
    setSoftCostModalError('')
    const payload = buildScheduledCostPayload(softCostForm, 'softCategory')

    try {
      if (editingSoftCostId) {
        await updateSoftCost(selectedProjectId, editingSoftCostId, payload)
      } else {
        await createSoftCost(selectedProjectId, payload)
      }
      setSoftCostStatus('idle')
      setSoftCostForm(defaultSoftCostForm)
      setEditingSoftCostId(null)
      setIsSoftCostModalOpen(false)
      await loadProjectDetail(selectedProjectId)
    } catch (err) {
      setSoftCostStatus('error')
      setSoftCostModalError(err.message)
    }
  }

  async function handleHardCostSubmit(event) {
    event.preventDefault()
    if (!selectedProjectId) return
    setHardCostStatus('saving')
    setHardCostModalError('')
    const needsUnits = requiresMeasurementDetails(hardCostForm.measurementUnit)
    if (needsUnits) {
      if (!hardCostForm.pricePerUnit || !hardCostForm.unitsCount) {
        setHardCostStatus('idle')
        setHardCostModalError('Price per unit and number of units are required.')
        return
      }
    } else if (!hardCostForm.amountUsd) {
      setHardCostStatus('idle')
      setHardCostModalError('Amount is required.')
      return
    }

    const payload = buildScheduledCostPayload(hardCostForm, 'hardCategory')
    payload.measurementUnit = hardCostForm.measurementUnit
    if (needsUnits) {
      payload.pricePerUnit = Number(hardCostForm.pricePerUnit)
      payload.unitsCount = Number(hardCostForm.unitsCount)
      payload.amountUsd = Number(hardCostForm.amountUsd || 0)
    } else {
      payload.pricePerUnit = null
      payload.unitsCount = null
      payload.amountUsd = payload.amountUsd === null ? null : Number(payload.amountUsd)
    }

    try {
      if (editingHardCostId) {
        await updateHardCost(selectedProjectId, editingHardCostId, payload)
      } else {
        await createHardCost(selectedProjectId, payload)
      }
      setHardCostStatus('idle')
      setHardCostForm(createDefaultHardCostForm())
      setEditingHardCostId(null)
      setIsHardCostModalOpen(false)
      await loadProjectDetail(selectedProjectId)
    } catch (err) {
      setHardCostStatus('error')
      setHardCostModalError(err.message)
    }
  }

  async function handleDeleteRevenue(revenueId) {
    if (!selectedProjectId) return
    setPendingRevenueDeleteId(revenueId)
  }

  async function confirmDeleteRevenue() {
    if (!selectedProjectId || !pendingRevenueDeleteId) return
    setRevenueStatus('saving')
    try {
      await deleteRevenueItem(selectedProjectId, pendingRevenueDeleteId)
      setPendingRevenueDeleteId(null)
      setRevenueStatus('idle')
      await loadProjectDetail(selectedProjectId)
    } catch (err) {
      setRevenueStatus('error')
      alert(err.message)
    }
  }

  function cancelDeleteRevenue() {
    if (revenueStatus === 'saving') return
    setPendingRevenueDeleteId(null)
    if (revenueStatus === 'error') {
      setRevenueStatus('idle')
    }
  }

  function handleDeleteParking(parkingId) {
    if (!selectedProjectId) return
    setParkingDeleteError('')
    setPendingParkingDeleteId(parkingId)
  }

  async function confirmDeleteParking() {
    if (!selectedProjectId || !pendingParkingDeleteId) return
    setParkingDeleteStatus('saving')
    try {
      await deleteParkingRevenue(selectedProjectId, pendingParkingDeleteId)
      setPendingParkingDeleteId(null)
      setParkingDeleteStatus('idle')
      await loadProjectDetail(selectedProjectId)
    } catch (err) {
      setParkingDeleteStatus('error')
      setParkingDeleteError(err.message)
    }
  }

  function cancelDeleteParking() {
    if (parkingDeleteStatus === 'saving') return
    setPendingParkingDeleteId(null)
    setParkingDeleteError('')
    setParkingDeleteStatus('idle')
  }

  function handleDeleteGpContribution(id) {
    if (!selectedProjectId) return
    setGpDeleteError('')
    setPendingGpDeleteId(id)
  }

  async function confirmDeleteGpContribution() {
    if (!selectedProjectId || !pendingGpDeleteId) return
    setGpDeleteStatus('saving')
    try {
      await deleteGpContribution(selectedProjectId, pendingGpDeleteId)
      setPendingGpDeleteId(null)
      setGpDeleteStatus('idle')
      await loadProjectDetail(selectedProjectId)
    } catch (err) {
      setGpDeleteStatus('error')
      setGpDeleteError(err.message)
    }
  }

  function cancelDeleteGpContribution() {
    if (gpDeleteStatus === 'saving') return
    setPendingGpDeleteId(null)
    setGpDeleteError('')
    setGpDeleteStatus('idle')
  }

  function handleDeleteSoftCost(costId) {
    if (!selectedProjectId) return
    setSoftCostDeleteError('')
    setPendingSoftCostDeleteId(costId)
  }

  async function confirmDeleteSoftCost() {
    if (!selectedProjectId || !pendingSoftCostDeleteId) return
    setSoftCostDeleteStatus('saving')
    setSoftCostDeleteError('')
    try {
      await deleteSoftCost(selectedProjectId, pendingSoftCostDeleteId)
      setSoftCostDeleteStatus('idle')
      setPendingSoftCostDeleteId(null)
      await loadProjectDetail(selectedProjectId)
    } catch (err) {
      setSoftCostDeleteStatus('error')
      setSoftCostDeleteError(err.message)
    }
  }

  function cancelDeleteSoftCost() {
    if (softCostDeleteStatus === 'saving') return
    setPendingSoftCostDeleteId(null)
    setSoftCostDeleteError('')
    setSoftCostDeleteStatus('idle')
  }

  function handleDeleteHardCost(costId) {
    if (!selectedProjectId) return
    setHardCostDeleteError('')
    setPendingHardCostDeleteId(costId)
  }

  async function confirmDeleteHardCost() {
    if (!selectedProjectId || !pendingHardCostDeleteId) return
    setHardCostDeleteStatus('saving')
    setHardCostDeleteError('')
    try {
      await deleteHardCost(selectedProjectId, pendingHardCostDeleteId)
      setHardCostDeleteStatus('idle')
      setPendingHardCostDeleteId(null)
      await loadProjectDetail(selectedProjectId)
    } catch (err) {
      setHardCostDeleteStatus('error')
      setHardCostDeleteError(err.message)
    }
  }

  function cancelDeleteHardCost() {
    if (hardCostDeleteStatus === 'saving') return
    setPendingHardCostDeleteId(null)
    setHardCostDeleteError('')
    setHardCostDeleteStatus('idle')
  }

  function handleAddressSelect(suggestion) {
    setGeneralForm((prev) => ({
      ...prev,
      addressLine1: suggestion.addressLine1 || '',
      city: suggestion.city || '',
      state: suggestion.state || '',
      zip: suggestion.zip || '',
      latitude: suggestion.latitude ? String(suggestion.latitude) : '',
      longitude: suggestion.longitude ? String(suggestion.longitude) : '',
    }))
    setAddressQuery(suggestion.label || suggestion.addressLine1 || '')
    setAddressSuggestions([])
    setAddressInputTouched(false)
    if (suggestion.latitude && suggestion.longitude) {
      const coords = { lat: suggestion.latitude, lon: suggestion.longitude }
      setSelectedCoords(coords)
      if (selectedProjectId) {
        setProjectCoords((prev) => ({ ...prev, [selectedProjectId]: coords }))
      }
    }
  }

  return (
    <div className="app-shell">
      {isKanbanView && (
        <header className="app-header">
          <div>
            <p className="eyebrow">Real Estate Control Center</p>
        <h1>DS Proforma</h1>
          </div>
          <div className="header-actions">
            <div className="weather-card">
              <h3>Philadelphia Weather</h3>
              {weatherStatus === 'loading' && <p>Sampling temperature…</p>}
              {weatherStatus === 'error' && <p className="error">{weatherError}</p>}
              {weatherStatus === 'loaded' && weather && (
                <>
                  <p className="weather-temp">{weather.temperature_c}°C</p>
                  <p className="muted">Sampled at {new Date(weather.sampled_at).toLocaleTimeString('en-US')}</p>
                </>
              )}
            </div>
            <button className="primary" type="button" onClick={openCreateModal}>
              + Add Project
            </button>
          </div>
      </header>
      )}

      {isKanbanView ? (
        <>
          <section className="kanban-section">
            <div className="kanban">
              {stageOptions.map((stage) => (
                <div className="kanban-column" key={stage.id}>
                  <div className="column-header">
                    <h3>{stage.label}</h3>
                    <span className="pill">{projectsByStage[stage.id]?.length ?? 0}</span>
                  </div>
                  <div className="column-body">
                    {projectsByStage[stage.id] && projectsByStage[stage.id].length > 0 ? (
                      projectsByStage[stage.id].map((project) => (
                        <article key={project.id} className="project-card">
                          <div onClick={() => setSelectedProjectId(project.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelectedProjectId(project.id)}>
                            <h4>{project.name}</h4>
                            <p className="muted">
                              {project.city || 'City'}, {project.state || 'State'}
                            </p>
                            <p className="muted">
                              Units: {project.targetUnits ?? '—'} • Budget:{' '}
                              {project.purchasePriceUsd ? `$${(project.purchasePriceUsd / 1_000_000).toFixed(2)}M` : '—'}
                            </p>
                          </div>
                          <select
                            value={project.stage}
                            onChange={(e) => {
                              handleStageChange(project.id, e.target.value)
                            }}
                            disabled={stageUpdatingFor === project.id}
                          >
                            {stageOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </article>
                      ))
                    ) : (
                      <p className="muted empty">No deals</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="detail-section detail-full">
          <div className="detail-nav">
            <button type="button" className="ghost" onClick={handleBackToKanban}>
              ← Back to pipeline
            </button>
          </div>
          {detailStatus === 'loading' && <p>Loading project…</p>}
          {detailStatus === 'error' && <p className="error">{detailError}</p>}
          {selectedProject && detailStatus === 'loaded' && (
            <>
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Project</p>
                  <h2>{selectedProject.name}</h2>
                </div>
              </div>

              <div className="tabs">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    className={tab.id === activeTab ? 'active' : ''}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'general' && (
                <form className="general-form" onSubmit={handleGeneralSave}>
                  <div className="form-grid">
                    <label>
                      Project Name
                      <input
                        type="text"
                        value={generalForm.name}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, name: e.target.value }))}
                        required
                      />
                    </label>
                    <label className="address-autocomplete">
                      Address Line 1
                      <input
                        type="text"
                        value={addressQuery}
                        placeholder="Start typing address"
                        onFocus={() => setAddressInputTouched(true)}
                        onChange={(e) => {
                          setAddressQuery(e.target.value)
                          setGeneralForm((prev) => ({ ...prev, addressLine1: e.target.value }))
                        }}
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
                      {addressSearchStatus === 'error' && addressSearchError && (
                        <span className="error tiny">{addressSearchError}</span>
                      )}
                    </label>
                    <label>
                      Address Line 2
                      <input
                        type="text"
                        value={generalForm.addressLine2}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, addressLine2: e.target.value }))}
                      />
                    </label>
                    <label>
                      City
                      <input
                        type="text"
                        value={generalForm.city}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, city: e.target.value }))}
                      />
                    </label>
                    <label>
                      State
                      <input
                        type="text"
                        value={generalForm.state}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, state: e.target.value }))}
                      />
                    </label>
                    <label>
                      ZIP
                      <input
                        type="text"
                        value={generalForm.zip}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, zip: e.target.value }))}
                      />
                    </label>
                    <label>
                      Purchase Price (USD)
                      <input
                        type="number"
                        value={generalForm.purchasePriceUsd}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, purchasePriceUsd: e.target.value }))}
                      />
                    </label>
                    <label>
                      Closing Date
                      <input
                        type="date"
                        value={generalForm.closingDate}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, closingDate: e.target.value }))}
                      />
                    </label>
                    <label>
                      Latitude
                      <input
                        type="number"
                        step="any"
                        value={generalForm.latitude}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, latitude: e.target.value }))}
                      />
                    </label>
                    <label>
                      Longitude
                      <input
                        type="number"
                        step="any"
                        value={generalForm.longitude}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, longitude: e.target.value }))}
                      />
                    </label>
                    <label>
                      Target Units
                      <input
                        type="number"
                        value={generalForm.targetUnits}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, targetUnits: e.target.value }))}
                      />
                    </label>
                    <label>
                      Target SqFt
                      <input
                        type="number"
                        value={generalForm.targetSqft}
                        onChange={(e) => setGeneralForm((prev) => ({ ...prev, targetSqft: e.target.value }))}
                      />
                    </label>
                  </div>
                  {selectedCoords && (
                    <div className="satellite-preview small">
                      <img
                        src={`${apiOrigin || ''}/api/geocode/satellite?lat=${selectedCoords.lat}&lon=${selectedCoords.lon}&zoom=18`}
                        alt="Satellite preview"
                      />
                    </div>
                  )}
                  <label>
                    Description / Notes
                    <textarea
                      rows={4}
                      value={generalForm.description}
                      onChange={(e) => setGeneralForm((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </label>
                  <div className="actions">
                    <button type="submit" disabled={generalStatus === 'saving'}>
                      {generalStatus === 'saving' ? 'Saving…' : 'Save General Info'}
                    </button>
                  </div>
                </form>
              )}

              {activeTab === 'revenue' && (
                <div className="revenue-tab">
                  <div className="revenue-header">
                    <h3>Revenue</h3>
                    <div className="add-menu" ref={revenueMenuRef}>
                      <button type="button" className="primary" onClick={() => setRevenueMenuOpen((prev) => !prev)}>
                        + Add
                      </button>
                      {revenueMenuOpen && (
                        <div className="add-menu-dropdown">
                          <button type="button" onClick={() => openRevenueModal('apartment')}>
                            Apartment Type
                          </button>
                          <button type="button" onClick={() => openRevenueModal('parking')}>
                            Parking Type
                          </button>
                          <button type="button" onClick={() => openRevenueModal('gp')}>
                            GP Contribution
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <RevenueTables />
                </div>
              )}

              {activeTab === 'hard' && (
                <div className="soft-tab">
                  <div className="soft-header">
                    <div>
                      <h3>Hard Costs</h3>
                      <p className="muted tiny">Construction scope: site work, structure, envelope, interiors.</p>
                    </div>
                    <button type="button" className="primary" onClick={openHardCostModal}>
                      + Add Hard Cost
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Cost Name</th>
                          <th>Units</th>
                          <th>Amount (USD)</th>
                          <th>Schedule</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProject.hardCosts?.map((row) => (
                          <tr key={row.id}>
                            <td>{hardCategoryLabel(row.costGroup)}</td>
                            <td>{row.costName}</td>
                            <td>{formatMeasurementSummary(row)}</td>
                            <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                            <td>{formatCostSchedule(row)}</td>
                            <td>
                              <div className="row-actions">
                                <button
                                  type="button"
                                  className="icon-button"
                                  onClick={() => startEditHardCost(row)}
                                  disabled={hardCostStatus === 'saving' || hardCostDeleteStatus === 'saving'}
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  className="icon-delete"
                                  onClick={() => handleDeleteHardCost(row.id)}
                                  disabled={hardCostStatus === 'saving' || hardCostDeleteStatus === 'saving'}
                                >
                                  🗑
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {selectedProject.hardCosts?.length === 0 && (
                          <tr>
                            <td colSpan={5}>No hard costs yet.</td>
                          </tr>
                        )}
                      </tbody>
                      {selectedProject.hardCosts?.length ? (
                        <tfoot>
                          <tr>
                            <td colSpan={4} className="revenue-total-label">
                              Total hard costs
                            </td>
                            <td colSpan={2} className="revenue-total-value">
                              ${totalHardCosts.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        </tfoot>
                      ) : null}
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'soft' && (
                <div className="soft-tab">
                  <div className="soft-header">
                    <div>
                      <h3>Soft Costs</h3>
                      <p className="muted tiny">Architects, legal, permits, consultants, marketing.</p>
                    </div>
                    <button type="button" className="primary" onClick={openSoftCostModal}>
                      + Add Soft Cost
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Cost Name</th>
                          <th>Amount (USD)</th>
                          <th>Schedule</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProject.softCosts?.map((row) => (
                          <tr key={row.id}>
                            <td>{softCategoryLabel(row.costGroup)}</td>
                            <td>{row.costName}</td>
                            <td>{row.amountUsd ? `$${row.amountUsd.toLocaleString()}` : '—'}</td>
                            <td>{formatCostSchedule(row)}</td>
                            <td>
                              <div className="row-actions">
                                <button
                                  type="button"
                                  className="icon-button"
                                  onClick={() => startEditSoftCost(row)}
                                  disabled={softCostStatus === 'saving' || softCostDeleteStatus === 'saving'}
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  className="icon-delete"
                                  onClick={() => handleDeleteSoftCost(row.id)}
                                  disabled={softCostStatus === 'saving' || softCostDeleteStatus === 'saving'}
                                >
                                  🗑
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {selectedProject.softCosts?.length === 0 && (
                          <tr>
                            <td colSpan={5}>No soft costs yet.</td>
                          </tr>
                        )}
                      </tbody>
                      {selectedProject.softCosts?.length ? (
                        <tfoot>
                          <tr>
                            <td colSpan={3} className="revenue-total-label">
                              Total soft costs
                            </td>
                            <td colSpan={2} className="revenue-total-value">
                              ${totalSoftCosts.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        </tfoot>
                      ) : null}
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'cashflow' && (
                <div className="cashflow-tab">
                  <div className="cashflow-header">
                    <div>
                      <h3>Cashflow (60 months)</h3>
                      <p className="muted tiny">
                        Starting {closingMonthLabel || 'from the current month'} · revenues + hard/soft costs shown
                        (carrying coming next)
                      </p>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table className="cashflow-grid">
                      <thead>
                        <tr>
                          <th>Category</th>
                          {cashflowMonths.map((month) => (
                            <th key={month.index} title={month.calendarLabel}>
                              {month.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cashflowRows.map((row) => {
                          const isExpandable = row.subRows && row.subRows.length > 0
                          const expanded = isExpandable && expandedCashflowRows.has(row.id)
                          return (
                            <Fragment key={row.id}>
                              <tr className={`cashflow-row ${row.type}`}>
                                <td>
                                  {isExpandable ? (
                                    <button
                                      type="button"
                                      className="cashflow-toggle"
                                      onClick={() => toggleCashflowRow(row.id)}
                                    >
                                      <span>{expanded ? '▾' : '▸'}</span>
                                      {row.label}
                                    </button>
                                  ) : (
                                    row.label
                                  )}
                                </td>
                                {cashflowMonths.map((month) => (
                                  <td key={`${row.id}-${month.index}`}>{formatCurrencyCell(row.values[month.index])}</td>
                                ))}
                              </tr>
                              {expanded &&
                                row.subRows.map((subRow) => (
                                  <tr key={`${row.id}-${subRow.id}`} className="cashflow-row sub cashflow-sub-row">
                                    <td>{subRow.label}</td>
                                    {cashflowMonths.map((month) => (
                                      <td key={`${row.id}-${subRow.id}-${month.index}`}>
                                        {formatCurrencyCell(subRow.values[month.index])}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'carrying' && (
                <div className="placeholder">
                  <p>
                    Carrying costs will be implemented next.
                  </p>
                </div>
              )}

              {activeTab !== 'cashflow' && (
                <div className="floating-delete">
                  <button className="icon-delete" type="button" onClick={() => requestDeleteProject(selectedProject.id)}>
                    🗑
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {isCreateModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Add Project</h3>
            <form onSubmit={handleCreateProject} className="modal-form">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                required
                disabled={createStatus === 'saving'}
              />
              {createError && <p className="error">{createError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeCreateModal} disabled={createStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={createStatus === 'saving'}>
                  {createStatus === 'saving' ? 'Creating…' : 'Create'}
                </button>
    </div>
            </form>
          </div>
        </div>
      )}

      {isRevenueModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>
              {revenueModalType === 'apartment'
                ? isEditingApartment
                  ? 'Edit Apartment Type'
                  : 'Add Apartment Type'
                : revenueModalType === 'parking'
                  ? isEditingParkingRevenue
                    ? 'Edit Parking Type'
                    : 'Add Parking Type'
                  : isEditingGpContribution
                    ? 'Edit GP Contribution'
                    : 'Add GP Contribution'}
            </h3>
            <form className="modal-form" onSubmit={handleAddRevenue}>
              {revenueModalType === 'apartment' && (
                <>
                  <label>
                    Type label
                    <input
                      type="text"
                      value={revenueForm.typeLabel}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, typeLabel: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                      required
                    />
                  </label>
                  <label>
                    Unit SqFt
                    <input
                      type="number"
                      value={revenueForm.unitSqft}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, unitSqft: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Number of units
                    <input
                      type="number"
                      value={revenueForm.unitCount}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, unitCount: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Monthly rent (USD)
                    <input
                      type="number"
                      value={revenueForm.rentBudget}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, rentBudget: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Vacancy %
                    <input
                      type="number"
                      value={revenueForm.vacancyPct}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, vacancyPct: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Start month
                    <input
                      type="number"
                      value={revenueForm.startMonth}
                      onChange={(e) => setRevenueForm((prev) => ({ ...prev, startMonth: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                </>
              )}

              {revenueModalType === 'parking' && (
                <>
                  <label>
                    Type label
                    <input
                      type="text"
                      value={parkingForm.typeLabel}
                      onChange={(e) => setParkingForm((prev) => ({ ...prev, typeLabel: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                      required
                    />
                  </label>
                  <label>
                    Number of spaces
                    <input
                      type="number"
                      value={parkingForm.spaceCount}
                      onChange={(e) => setParkingForm((prev) => ({ ...prev, spaceCount: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Monthly rent per space (USD)
                    <input
                      type="number"
                      value={parkingForm.monthlyRentUsd}
                      onChange={(e) => setParkingForm((prev) => ({ ...prev, monthlyRentUsd: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Vacancy %
                    <input
                      type="number"
                      value={parkingForm.vacancyPct}
                      onChange={(e) => setParkingForm((prev) => ({ ...prev, vacancyPct: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Start month
                    <input
                      type="number"
                      value={parkingForm.startMonth}
                      onChange={(e) => setParkingForm((prev) => ({ ...prev, startMonth: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                </>
              )}

              {revenueModalType === 'gp' && (
                <>
                  <label>
                    Partner
                    <select
                      value={gpContributionForm.partner}
                      onChange={(e) => setGpContributionForm((prev) => ({ ...prev, partner: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    >
                      {gpPartners.map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Contribution amount (USD)
                    <input
                      type="number"
                      value={gpContributionForm.amountUsd}
                      onChange={(e) => setGpContributionForm((prev) => ({ ...prev, amountUsd: e.target.value }))}
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Contribution month
                    <input
                      type="number"
                      value={gpContributionForm.contributionMonth}
                      onChange={(e) =>
                        setGpContributionForm((prev) => ({ ...prev, contributionMonth: e.target.value }))
                      }
                      disabled={revenueStatus === 'saving'}
                    />
                  </label>
                </>
              )}

              {revenueModalError && <p className="error">{revenueModalError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeRevenueModal} disabled={revenueStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={revenueStatus === 'saving'}>
                  {revenueStatus === 'saving'
                    ? (revenueModalType === 'apartment'
                        ? isEditingApartment
                        : revenueModalType === 'parking'
                          ? isEditingParkingRevenue
                          : isEditingGpContribution)
                      ? 'Saving…'
                      : 'Adding…'
                    : revenueModalType === 'apartment'
                      ? isEditingApartment
                        ? 'Save Changes'
                        : 'Save Apartment Type'
                      : revenueModalType === 'parking'
                        ? isEditingParkingRevenue
                          ? 'Save Changes'
                          : 'Save Parking Type'
                        : isEditingGpContribution
                          ? 'Save Changes'
                          : 'Save GP Contribution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSoftCostModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>{isEditingSoftCost ? 'Edit Soft Cost' : 'Add Soft Cost'}</h3>
            <form className="modal-form" onSubmit={handleSoftCostSubmit}>
              <label>
                Category
                <select
                  value={softCostForm.softCategory}
                  onChange={(e) => setSoftCostForm((prev) => ({ ...prev, softCategory: e.target.value }))}
                  disabled={softCostStatus === 'saving'}
                >
                  {softCostCategories.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cost name
                <input
                  type="text"
                  value={softCostForm.costName}
                  onChange={(e) => setSoftCostForm((prev) => ({ ...prev, costName: e.target.value }))}
                  required
                  disabled={softCostStatus === 'saving'}
                />
              </label>
              <label>
                Amount (USD)
                <input
                  type="number"
                  value={softCostForm.amountUsd}
                  onChange={(e) => setSoftCostForm((prev) => ({ ...prev, amountUsd: e.target.value }))}
                  required
                  disabled={softCostStatus === 'saving'}
                />
              </label>
              <label>
                Payment mode
                <select
                  value={softCostForm.paymentMode}
                  onChange={(e) => setSoftCostForm((prev) => ({ ...prev, paymentMode: e.target.value }))}
                  disabled={softCostStatus === 'saving'}
                >
                  <option value="single">Single month</option>
                  <option value="range">Range</option>
                  <option value="multi">Multiple months</option>
                </select>
              </label>

              {softCostForm.paymentMode === 'single' && (
                <label>
                  Payment month (offset)
                  <input
                    type="number"
                    value={softCostForm.paymentMonth}
                    onChange={(e) => setSoftCostForm((prev) => ({ ...prev, paymentMonth: e.target.value }))}
                    placeholder="e.g., 0"
                    disabled={softCostStatus === 'saving'}
                  />
                </label>
              )}

              {softCostForm.paymentMode === 'range' && (
                <div className="dual-fields">
                  <label>
                    Start month
                    <input
                      type="number"
                      value={softCostForm.rangeStartMonth}
                      onChange={(e) => setSoftCostForm((prev) => ({ ...prev, rangeStartMonth: e.target.value }))}
                      placeholder="e.g., 0"
                      disabled={softCostStatus === 'saving'}
                    />
                  </label>
                  <label>
                    End month
                    <input
                      type="number"
                      value={softCostForm.rangeEndMonth}
                      onChange={(e) => setSoftCostForm((prev) => ({ ...prev, rangeEndMonth: e.target.value }))}
                      placeholder="e.g., 5"
                      disabled={softCostStatus === 'saving'}
                    />
                  </label>
                  <p className="helper-text">Amount will be spread evenly across the range.</p>
                </div>
              )}

              {softCostForm.paymentMode === 'multi' && (
                <>
                  <label>
                    Months (comma separated)
                    <input
                      type="text"
                      value={softCostForm.monthsInput}
                      onChange={(e) => setSoftCostForm((prev) => ({ ...prev, monthsInput: e.target.value }))}
                      placeholder="e.g., 0,1,2"
                      disabled={softCostStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Percent per month (comma separated, optional)
                    <input
                      type="text"
                      value={softCostForm.monthPercentagesInput}
                      onChange={(e) =>
                        setSoftCostForm((prev) => ({ ...prev, monthPercentagesInput: e.target.value }))
                      }
                      placeholder="e.g., 40,30,30"
                      disabled={softCostStatus === 'saving'}
                    />
                  </label>
                  <p className="helper-text">
                    If omitted, the amount will be split evenly. Percentages must total 100%.
                  </p>
                </>
              )}

              {softCostModalError && <p className="error">{softCostModalError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeSoftCostModal} disabled={softCostStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={softCostStatus === 'saving'}>
                  {softCostStatus === 'saving'
                    ? isEditingSoftCost
                      ? 'Saving…'
                      : 'Adding…'
                    : isEditingSoftCost
                      ? 'Save Changes'
                      : 'Save Soft Cost'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isHardCostModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>{isEditingHardCost ? 'Edit Hard Cost' : 'Add Hard Cost'}</h3>
            <form className="modal-form" onSubmit={handleHardCostSubmit}>
              <label>
                Category
                <select
                  value={hardCostForm.hardCategory}
                  onChange={(e) => handleHardCategoryChange(e.target.value)}
                  disabled={hardCostStatus === 'saving'}
                >
                  {hardCostCategories.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Measurement unit
                <select
                  value={hardCostForm.measurementUnit}
                  onChange={(e) => handleHardMeasurementChange(e.target.value)}
                  disabled={hardCostStatus === 'saving'}
                >
                  {measurementUnitOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cost name
                <input
                  type="text"
                  value={hardCostForm.costName}
                  onChange={(e) => setHardCostForm((prev) => ({ ...prev, costName: e.target.value }))}
                  required
                  disabled={hardCostStatus === 'saving'}
                />
              </label>
              {requiresMeasurementDetails(hardCostForm.measurementUnit) ? (
                <>
                  <label>
                    Price per unit (USD)
                    <input
                      type="number"
                      value={hardCostForm.pricePerUnit}
                      onChange={(e) =>
                        setHardCostForm((prev) =>
                          recomputeHardCostAmount({ ...prev, pricePerUnit: e.target.value }),
                        )
                      }
                      disabled={hardCostStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Number of units
                    <input
                      type="number"
                      value={hardCostForm.unitsCount}
                      onChange={(e) =>
                        setHardCostForm((prev) =>
                          recomputeHardCostAmount({ ...prev, unitsCount: e.target.value }),
                        )
                      }
                      disabled={hardCostStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Total amount (USD)
                    <input type="number" value={hardCostForm.amountUsd} readOnly disabled />
                  </label>
                </>
              ) : (
                <label>
                  Amount (USD)
                  <input
                    type="number"
                    value={hardCostForm.amountUsd}
                    onChange={(e) => setHardCostForm((prev) => ({ ...prev, amountUsd: e.target.value }))}
                    required
                    disabled={hardCostStatus === 'saving'}
                  />
                </label>
              )}
              <label>
                Payment mode
                <select
                  value={hardCostForm.paymentMode}
                  onChange={(e) => setHardCostForm((prev) => ({ ...prev, paymentMode: e.target.value }))}
                  disabled={hardCostStatus === 'saving'}
                >
                  <option value="single">Single month</option>
                  <option value="range">Range</option>
                  <option value="multi">Multiple months</option>
                </select>
              </label>

              {hardCostForm.paymentMode === 'single' && (
                <label>
                  Payment month (offset)
                  <input
                    type="number"
                    value={hardCostForm.paymentMonth}
                    onChange={(e) => setHardCostForm((prev) => ({ ...prev, paymentMonth: e.target.value }))}
                    placeholder="e.g., 0"
                    disabled={hardCostStatus === 'saving'}
                  />
                </label>
              )}

              {hardCostForm.paymentMode === 'range' && (
                <div className="dual-fields">
                  <label>
                    Start month
                    <input
                      type="number"
                      value={hardCostForm.rangeStartMonth}
                      onChange={(e) =>
                        setHardCostForm((prev) => ({ ...prev, rangeStartMonth: e.target.value }))
                      }
                      placeholder="e.g., 0"
                      disabled={hardCostStatus === 'saving'}
                    />
                  </label>
                  <label>
                    End month
                    <input
                      type="number"
                      value={hardCostForm.rangeEndMonth}
                      onChange={(e) =>
                        setHardCostForm((prev) => ({ ...prev, rangeEndMonth: e.target.value }))
                      }
                      placeholder="e.g., 5"
                      disabled={hardCostStatus === 'saving'}
                    />
                  </label>
                  <p className="helper-text">Amount will be spread evenly across the range.</p>
                </div>
              )}

              {hardCostForm.paymentMode === 'multi' && (
                <>
                  <label>
                    Months (comma separated)
                    <input
                      type="text"
                      value={hardCostForm.monthsInput}
                      onChange={(e) => setHardCostForm((prev) => ({ ...prev, monthsInput: e.target.value }))}
                      placeholder="e.g., 0,1,2"
                      disabled={hardCostStatus === 'saving'}
                    />
                  </label>
                  <label>
                    Percent per month (comma separated, optional)
                    <input
                      type="text"
                      value={hardCostForm.monthPercentagesInput}
                      onChange={(e) =>
                        setHardCostForm((prev) => ({ ...prev, monthPercentagesInput: e.target.value }))
                      }
                      placeholder="e.g., 40,30,30"
                      disabled={hardCostStatus === 'saving'}
                    />
                  </label>
                  <p className="helper-text">
                    If omitted, the amount will be split evenly. Percentages must total 100%.
                  </p>
                </>
              )}

              {hardCostModalError && <p className="error">{hardCostModalError}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeHardCostModal} disabled={hardCostStatus === 'saving'}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={hardCostStatus === 'saving'}>
                  {hardCostStatus === 'saving'
                    ? isEditingHardCost
                      ? 'Saving…'
                      : 'Adding…'
                    : isEditingHardCost
                      ? 'Save Changes'
                      : 'Save Hard Cost'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDeleteProjectId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete project?</h3>
            <p>This will permanently remove the project and all related data.</p>
            {deleteError && <p className="error">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteProject} disabled={deleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDeleteProject} disabled={deleteStatus === 'saving'}>
                {deleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRevenueDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete revenue row?</h3>
            <p>Are you sure you want to remove this unit type?</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteRevenue} disabled={revenueStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDeleteRevenue} disabled={revenueStatus === 'saving'}>
                {revenueStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingParkingDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete parking row?</h3>
            <p>Are you sure you want to remove this parking type?</p>
            {parkingDeleteError && <p className="error">{parkingDeleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteParking} disabled={parkingDeleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDeleteParking} disabled={parkingDeleteStatus === 'saving'}>
                {parkingDeleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingGpDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete GP contribution?</h3>
            <p>This will remove the one-time contribution entry.</p>
            {gpDeleteError && <p className="error">{gpDeleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteGpContribution} disabled={gpDeleteStatus === 'saving'}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDeleteGpContribution} disabled={gpDeleteStatus === 'saving'}>
                {gpDeleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingSoftCostDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete soft cost?</h3>
            <p>This action cannot be undone.</p>
            {softCostDeleteError && <p className="error">{softCostDeleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteSoftCost} disabled={softCostDeleteStatus === 'saving'}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={confirmDeleteSoftCost}
                disabled={softCostDeleteStatus === 'saving'}
              >
                {softCostDeleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingHardCostDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Delete hard cost?</h3>
            <p>This action cannot be undone.</p>
            {hardCostDeleteError && <p className="error">{hardCostDeleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={cancelDeleteHardCost} disabled={hardCostDeleteStatus === 'saving'}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={confirmDeleteHardCost}
                disabled={hardCostDeleteStatus === 'saving'}
              >
                {hardCostDeleteStatus === 'saving' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
