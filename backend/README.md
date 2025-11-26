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
2. Once provisioned, copy the internal/external connection string.
3. Update backend service env vars:
   - `DATABASE_URL`
   - `FRONTEND_ORIGIN` (set to your frontend URL)
4. Deploy backend service (Node). Render handles `npm install` and `npm run start`.

## Migrations / Schema
Use your preferred tool (e.g., Prisma, Knex, SQL files). For now, manual SQL example:
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
Remember to enable the `pgcrypto` extension for `gen_random_uuid()` (or use `uuid-ossp`).
