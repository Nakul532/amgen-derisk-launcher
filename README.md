# Amgen MariTide Launch De-Risk Simulator

A demo tool for stress-testing MariTide commercial launch parameters (price,
dosing, clinical evidence weighting, competitor hostility) against a
simplified boardroom equilibrium model.

## Live URLs

- **Frontend (app):** https://amgen-derisk-frontend.onrender.com
- **Backend (API):** https://amgen-derisk-backend.onrender.com

> Hosted on Render's free tier — the backend spins down after inactivity, so
> the first request after idle time may take ~30-60s to wake up.

## Architecture

- `backend/` — FastAPI service. Ports the launch simulation model to Python
  and exposes it via `POST /api/simulate`. CORS is restricted to the
  frontend's origin via the `ALLOWED_ORIGINS` env var.
- `frontend/` — Vite + React app (the original `AmgenDeriskLauncher`
  component). Calls the backend instead of running the simulation locally.
  Points at the backend via the `VITE_API_URL` build-time env var.

No authentication or database — this is a demo build for stakeholder review.

## Local development

Backend:

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
ALLOWED_ORIGINS=http://localhost:5173 .venv/bin/uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

## Deployment

Both services are deployed on [Render](https://render.com) from this GitHub
repo (`Nakul532/amgen-derisk-launcher`), each created from the API rather
than the GitHub App integration, so **pushing to `main` does not
auto-deploy** — trigger a redeploy manually from the Render dashboard (or
`POST /v1/services/{id}/deploys` via the Render API) after pushing changes.

- Backend: Python web service, root dir `backend`, pinned to Python 3.12
  (`backend/runtime.txt`) since `pydantic-core` has no prebuilt wheel for
  Render's default Python yet.
- Frontend: static site, root dir `frontend`, build command
  `npm install && npm run build`, publish path `dist`.
