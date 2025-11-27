export const gpPartners = [
  { id: 'darmon', label: 'Darmon' },
  { id: 'sherman', label: 'Sherman' },
]

export const calculateNetRevenue = (row = {}) => {
  const rent = row.rentBudget || 0
  const units = row.unitCount || 0
  const vacancy = row.vacancyPct === undefined || row.vacancyPct === null ? 5 : row.vacancyPct
  return rent * units * (1 - vacancy / 100)
}

export const calculateNetParking = (row = {}) => {
  const rent = row.monthlyRentUsd || 0
  const spaces = row.spaceCount || 0
  const vacancy = row.vacancyPct === undefined || row.vacancyPct === null ? 5 : row.vacancyPct
  return rent * spaces * (1 - vacancy / 100)
}

