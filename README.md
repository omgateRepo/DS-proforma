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
See `docs/README.md` for authoring flow and `backend/README.md`, `frontend/README.md` for setup details.

## Render Auto Deploy
- Backend: watch `main`, build with `npm install`, start via `npm run start`.
- Frontend: watch `main`, build with `npm install && npm run build`, publish `dist/`.
- Set both services to Auto Deploy so every push to `main` refreshes the dev stack.

## Philadelphia Weather Sample
- Backend exposes `/api/weather`, which proxies Open-Meteo to sample the current temperature in Philadelphia.
- Frontend shows the reading at the top of the page on load, proving the API call path end-to-end.

## Connecting PostgreSQL
1. Provision Postgres (Render managed DB or local Docker).
2. Copy `.env.example` → `.env` inside `backend/` and set:
   - `SKIP_DB=false`
   - `DATABASE_URL=postgres://user:pass@host:port/db`
   - `FRONTEND_ORIGIN=<frontend URL>`
3. Restart/redeploy the backend; it now auto-creates the `projects` table (and enables `uuid-ossp` if allowed) before serving requests.
4. Frontend will list real projects stored in the database.
