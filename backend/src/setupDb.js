import pool from './db.js'

async function ensureUuidExtension() {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
  } catch (err) {
    console.warn('Could not ensure uuid-ossp extension (continuing):', err.message)
  }
}

async function renameStatusColumnIfNeeded() {
  try {
    await pool.query('ALTER TABLE projects RENAME COLUMN status TO stage')
  } catch (err) {
    if (err.code !== '42703') throw err // 42703 = undefined_column
  }
}

async function ensureProjectsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'new',
      address_line1 TEXT,
      address_line2 TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      property_type TEXT,
      purchase_price_usd NUMERIC,
      closing_date DATE,
      latitude NUMERIC,
      longitude NUMERIC,
      target_units INTEGER,
      target_sqft INTEGER,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `)

  const additionalColumns = [
    "ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'new'",
    'ADD COLUMN IF NOT EXISTS address_line1 TEXT',
    'ADD COLUMN IF NOT EXISTS address_line2 TEXT',
    'ADD COLUMN IF NOT EXISTS city TEXT',
    'ADD COLUMN IF NOT EXISTS state TEXT',
    'ADD COLUMN IF NOT EXISTS zip TEXT',
    'ADD COLUMN IF NOT EXISTS property_type TEXT',
    'ADD COLUMN IF NOT EXISTS purchase_price_usd NUMERIC',
    'ADD COLUMN IF NOT EXISTS closing_date DATE',
    'ADD COLUMN IF NOT EXISTS latitude NUMERIC',
    'ADD COLUMN IF NOT EXISTS longitude NUMERIC',
    'ADD COLUMN IF NOT EXISTS target_units INTEGER',
    'ADD COLUMN IF NOT EXISTS target_sqft INTEGER',
    'ADD COLUMN IF NOT EXISTS description TEXT',
    'ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
  ]

  for (const clause of additionalColumns) {
    await pool.query(`ALTER TABLE projects ${clause}`)
  }
}

async function ensureStageHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_stage_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      from_stage TEXT,
      to_stage TEXT NOT NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

async function ensureApartmentTypesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apartment_types (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type_label TEXT NOT NULL,
      unit_sqft INTEGER,
      unit_count INTEGER NOT NULL DEFAULT 0,
      rent_budget NUMERIC,
      vacancy_pct NUMERIC NOT NULL DEFAULT 5,
      rent_actual NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

async function ensureCostItemsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cost_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      cost_name TEXT NOT NULL,
      amount_usd NUMERIC,
      payment_month INTEGER,
      start_month INTEGER,
      end_month INTEGER,
      carrying_type TEXT,
      principal_amount_usd NUMERIC,
      interest_rate_pct NUMERIC,
      term_years NUMERIC,
      interval TEXT,
      start_date DATE,
      measurement_unit TEXT,
      price_per_unit NUMERIC,
      units_count NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE cost_items
    ADD COLUMN IF NOT EXISTS cost_group TEXT;
  `)

  await pool.query(`
    ALTER TABLE cost_items
    ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'single';
  `)

  await pool.query(`
    ALTER TABLE cost_items
    ADD COLUMN IF NOT EXISTS month_list JSONB;
  `)

  await pool.query(`
    ALTER TABLE cost_items
    ADD COLUMN IF NOT EXISTS month_percentages JSONB;
  `)

  await pool.query(`
    ALTER TABLE cost_items
    ADD COLUMN IF NOT EXISTS measurement_unit TEXT;
  `)

  await pool.query(`
    ALTER TABLE cost_items
    ADD COLUMN IF NOT EXISTS price_per_unit NUMERIC;
  `)

  await pool.query(`
    ALTER TABLE cost_items
    ADD COLUMN IF NOT EXISTS units_count NUMERIC;
  `)
}

async function ensureCashflowEntriesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cashflow_entries (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      month_index INTEGER NOT NULL,
      budget_inflows NUMERIC,
      budget_outflows NUMERIC,
      actual_inflows NUMERIC,
      actual_outflows NUMERIC,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

export async function ensureSchema() {
  await ensureUuidExtension()
  await renameStatusColumnIfNeeded()
  await ensureProjectsTable()
  await ensureStageHistoryTable()
  await ensureApartmentTypesTable()
  await ensureCostItemsTable()
  await ensureCashflowEntriesTable()
}
