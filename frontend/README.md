# DS Proforma Frontend

Vite + React client that consumes the Express API.

## Setup

1. Install deps:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` (defaults to http://localhost:8080).
3. Run dev server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build && npm run preview
   ```

## API Helpers
- `src/api.js` hosts helper functions for calling the backend (`/api/projects`).

Adjust UI according to approved docs; this scaffold just lists projects from the API.
