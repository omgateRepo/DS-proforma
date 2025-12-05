# DS Proforma

Docs-driven starter for a project management app with:
- React (Vite) frontend
- Node/Express backend
- PostgreSQL database
- Render deployment targets
- GitHub workflow scaffolding

## Structure
- `docs/` – specifications first
- `backend/` – Express API (PostgreSQL)
- `frontend/` – React client (Vite)
- `.github/workflows/` – CI placeholders
- `render.yaml` – Render blueprint (backend web service + frontend static site + PostgreSQL service instructions)

## Getting Started

### Quick Start (Fresh Machine)
After cloning, run the bootstrap script:
```bash
chmod +x scripts/bootstrap-local.sh
./scripts/bootstrap-local.sh
```
Then start the servers:
```bash
cd backend && npm run dev   # terminal 1
cd frontend && npm run dev  # terminal 2
```
Login with `ds / ds1` (or customize in the script).

### Manual Setup
See `docs/README.md` for authoring flow and `backend/README.md`, `frontend/README.md` for setup details.

## Render Auto Deploy
- Backend: watch `main`, build with `npm install`, start via `npm run start`.
- Frontend: watch `main`, build with `npm install && npm run build`, publish `dist/`.
- Set both services to Auto Deploy so every push to `main` refreshes the dev stack.

## Philadelphia Weather Sample
- Backend exposes `/api/weather`, which proxies Open-Meteo to sample the current temperature in Philadelphia.
- Frontend shows the reading at the top of the page on load, proving the API call path end-to-end.

## Connecting PostgreSQL & Prisma
1. Provision Postgres (Render managed DB or local Docker).
2. Copy `.env.example` → `.env` inside `backend/` and set:
   - `SKIP_DB=false`
   - `DATABASE_URL=postgres://user:pass@host:port/db`
   - `FRONTEND_ORIGIN=<frontend URL>`
3. Run migrations locally with `npx prisma migrate dev` (or `npx prisma migrate deploy` in CI/prod).
4. Redeploy; Prisma keeps the schema in sync, and the frontend will list live projects.
