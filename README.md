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
