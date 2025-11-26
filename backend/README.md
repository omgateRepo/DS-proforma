# DS Proforma Backend

Express API for the project management app. Uses PostgreSQL as the primary data store.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill values.
3. Start the dev server:
   ```bash
   npm run dev
   ```

## Environment Variables
See `.env.example`. Required at minimum:
- `PORT` – default 8080
- `DATABASE_URL` – Postgres connection string (unused when `SKIP_DB=true`)
- `FRONTEND_ORIGIN` – e.g., http://localhost:5173
- `SKIP_DB` – set to `true` for a “Hello World” stub mode (no database required)

## Database

### Rapid “Hello World” (no DB)
- Copy `.env.example` to `.env` and leave `SKIP_DB=true`.
- Run `npm run dev`; `/api/projects` will return stub data.
- Useful for verifying frontend/backend wiring before provisioning Postgres.

### Local
- Install PostgreSQL locally or use Docker:
  ```bash
  docker run --name ds-proforma-db -e POSTGRES_PASSWORD=devpass -p 5432:5432 -d postgres:16
  ```
- Create a database and update `DATABASE_URL` accordingly.

### Render
1. In Render, create a **PostgreSQL** instance (Free tier works for testing).
2. Copy the internal connection string (format: `postgres://USER:PASSWORD@HOST:PORT/DB`).
3. In the backend service settings set:
   - `SKIP_DB=false`
   - `DATABASE_URL=<the connection string>`
   - `FRONTEND_ORIGIN=<your frontend Render URL>`
4. Redeploy. On boot the app will automatically ensure the `projects` table exists (see below).
5. The frontend will now receive live data from the database.

## Migrations / Schema
The server now runs a lightweight bootstrap on startup (when `SKIP_DB=false`) that:
1. Enables the `uuid-ossp` extension (if the role has permission).
2. Creates the `projects` table if it doesn’t exist:
   ```sql
   CREATE TABLE IF NOT EXISTS projects (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     name TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'planned',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```
If you prefer to manage schema yourself, simply disable the bootstrap by running your own migrations before starting the server.
