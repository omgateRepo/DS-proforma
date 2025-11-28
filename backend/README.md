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
- `MAPBOX_TOKEN` – required for address autocomplete + satellite preview (Mapbox access token)

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
1. Create a **PostgreSQL** instance (Free tier works for testing).
2. Copy the internal connection string (format: `postgres://USER:PASSWORD@HOST:PORT/DB`).
3. In the backend service settings set:
   - `SKIP_DB=false`
   - `DATABASE_URL=<the connection string>`
   - `FRONTEND_ORIGIN=<your frontend Render URL>`
4. On every deploy run `npm run prisma:migrate:deploy` (see below) so Render’s DB stays in sync with your Prisma migrations.

## Prisma Migrations
The backend now uses Prisma for schema management.

Common commands:
```bash
# Pull the DB schema into prisma/schema.prisma
npx prisma db pull

# Generate the client after changing the schema
npx prisma generate

# Create & apply a new migration (local dev)
npx prisma migrate dev --name add_new_column

# Apply existing migrations in prod (Render)
npx prisma migrate deploy
```

Workflow:
1. Edit `prisma/schema.prisma`.
2. Run `npx prisma migrate dev --name <change>`; commit both the migration SQL + schema.
3. Deploy; in Render, set a build or postdeploy command to run `npx prisma migrate deploy`.
4. The app now boots without `ensureSchema`; Prisma migrations are the source of truth.

## Shared Schemas
- The workspace `@ds-proforma/types` exposes the canonical Zod schemas for API payloads (project create/update, revenue items, GP contributions, etc.).
- Reuse those schemas when validating `req.body` to keep contracts aligned with the frontend; avoid hand-written validators unless a field is backend-only.
- As we introduce TypeScript on the client, we can `z.infer` those schemas to derive DTOs automatically instead of duplicating interface definitions.
