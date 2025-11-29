export const toNumber = (value) => (value === null || value === undefined ? null : Number(value))

export const toInt = (value) => (value === null || value === undefined ? null : Number(value))

export const parseJsonField = (value) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export const coerceInt = (value) => {
  if (value === null || value === undefined || value === '') return null
  const asNumber = Number(value)
  return Number.isNaN(asNumber) ? null : Math.trunc(asNumber)
}

export const coerceNumberStrict = (value) => {
  if (value === null || value === undefined || value === '') return null
  const asNumber = Number(value)
  return Number.isNaN(asNumber) ? null : asNumber
}

export const coerceNumberArray = (value) => {
  if (!value) return []
  const raw = Array.isArray(value) ? value : String(value).split(',')
  return raw
    .map((entry) => entry?.toString().trim())
    .filter(Boolean)
    .map((entry) => Number(entry))
    .filter((num) => !Number.isNaN(num))
}

