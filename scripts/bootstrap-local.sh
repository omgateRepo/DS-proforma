#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# DS Proforma - Local Development Bootstrap
# =============================================================================
# Run this after a fresh git clone on a new machine.
# Prerequisites: Node/npm, Postgres (local or Docker), psql/createdb on PATH.
#
# Usage:
#   chmod +x scripts/bootstrap-local.sh
#   ./scripts/bootstrap-local.sh
#
# Then in separate terminals:
#   cd backend && npm run dev
#   cd frontend && npm run dev
# =============================================================================

# --- Configurable defaults (override via env vars) ---
DB_NAME="${DB_NAME:-ds_proforma_dev}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-devpass}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-http://localhost:${FRONTEND_PORT}}"
API_BASE="${API_BASE:-http://localhost:${BACKEND_PORT}}"
AUTH_USER="${AUTH_USER:-ds}"
AUTH_PASS="${AUTH_PASS:-ds1}"
MAPBOX_TOKEN="${MAPBOX_TOKEN:-}"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo "========================================"
echo " DS Proforma Local Bootstrap"
echo "========================================"
echo ""

# --- Detect psql/createdb path ---
if command -v createdb &>/dev/null; then
  CREATEDB="createdb"
  PSQL="psql"
elif [ -x /opt/homebrew/opt/libpq/bin/createdb ]; then
  CREATEDB="/opt/homebrew/opt/libpq/bin/createdb"
  PSQL="/opt/homebrew/opt/libpq/bin/psql"
elif [ -x /usr/local/bin/createdb ]; then
  CREATEDB="/usr/local/bin/createdb"
  PSQL="/usr/local/bin/psql"
else
  echo "ERROR: createdb/psql not found. Install Postgres or add to PATH."
  exit 1
fi

# --- Create database if it doesn't exist ---
echo "Creating database '${DB_NAME}' (if not exists)..."
export PGPASSWORD="$DB_PASS"
$CREATEDB -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null || echo "  (database already exists)"

# --- Enable uuid-ossp extension ---
echo "Enabling uuid-ossp extension..."
$PSQL -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" \
  -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' >/dev/null

# --- Write backend/.env ---
echo "Writing backend/.env..."
cat > backend/.env <<EOF
PORT=${BACKEND_PORT}
SKIP_DB=false
DATABASE_URL=${DATABASE_URL}
FRONTEND_ORIGIN=${FRONTEND_ORIGIN}
BASIC_AUTH_USER=${AUTH_USER}
BASIC_AUTH_PASSWORD=${AUTH_PASS}
SKIP_AUTH=false
MAPBOX_TOKEN=${MAPBOX_TOKEN}
EOF

# --- Write frontend/.env ---
echo "Writing frontend/.env..."
cat > frontend/.env <<EOF
VITE_API_BASE_URL=${API_BASE}
EOF

# --- Install dependencies ---
echo "Installing root dependencies..."
npm install

echo "Installing backend dependencies..."
( cd backend && npm install )

echo "Installing frontend dependencies..."
( cd frontend && npm install )

# --- Run Prisma migrations ---
echo "Running Prisma migrations..."
( cd backend && npx prisma migrate deploy )

# --- Generate Prisma client ---
echo "Generating Prisma client..."
( cd backend && npx prisma generate )

echo ""
echo "========================================"
echo " Bootstrap Complete!"
echo "========================================"
echo ""
echo "Start the backend (terminal 1):"
echo "  cd backend && npm run dev"
echo ""
echo "Start the frontend (terminal 2):"
echo "  cd frontend && npm run dev"
echo ""
echo "Login credentials:"
echo "  Username: ${AUTH_USER}"
echo "  Password: ${AUTH_PASS}"
echo ""
if [ -z "$MAPBOX_TOKEN" ]; then
  echo "NOTE: MAPBOX_TOKEN not set. Geocoding/address search won't work."
  echo "      Add it to backend/.env if needed."
fi
echo ""

