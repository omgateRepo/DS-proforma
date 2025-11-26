import pool from './db.js'

const createProjectsTableSQL = `
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

export async function ensureProjectsTable() {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
  } catch (err) {
    console.warn('Could not ensure uuid-ossp extension (continuing):', err.message)
  }

  await pool.query(createProjectsTableSQL)
}

