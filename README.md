# Amgen MariTide Launch De-Risk Simulator

A demo tool for stress-testing MariTide commercial launch parameters (price,
dosing, clinical evidence weighting, competitor hostility) against a
boardroom equilibrium model, using a real Monte Carlo simulation (adjustable
iteration count, up to 10,000 runs) rather than a single deterministic
estimate.

## Live URLs

- **Frontend (app):** https://amgen-derisk-frontend.onrender.com
- **Backend (API):** https://amgen-derisk-backend.onrender.com

> Hosted on Render's free tier — the backend spins down after inactivity, so
> the first request after idle time may take ~30-60s to wake up.

## Architecture

- `backend/` — FastAPI service (`app/simulation.py`). Each `/api/simulate`
  call resamples price sensitivity, competitor pricing, hostility, and
  evidence weighting with real randomness across N iterations (N is
  caller-supplied, 200-10,000), then aggregates the results: p10/median/p90
  bands for the 12-month trajectory and robustness score, and empirical
  trigger frequencies for each risk (sampled from smooth probability curves
  near thresholds, not hard cutoffs). CORS is restricted to the frontend's
  origin via the `ALLOWED_ORIGINS` env var.
- `frontend/` — Vite + React app (the original `AmgenDeriskLauncher`
  component). Calls the backend instead of running the simulation locally,
  with an iteration-count slider and a band chart (p10-p90 shaded range plus
  median line) instead of a single trajectory line. Points at the backend
  via the `VITE_API_URL` build-time env var.
- `backend/app/game_theory.py` — a real Bertrand-Nash competitor model.
  Novo Nordisk and Eli Lilly are modeled as rational profit-maximizing
  agents (logit demand, ternary-search best response) that re-price against
  Amgen's chosen configuration via iterative best-response until prices
  stabilize. Reports both their equilibrium reaction prices and a separate
  full 3-way equilibrium benchmark (what Amgen's own price would be if it
  also best-responded). Competitor quality/cost inputs are illustrative demo
  assumptions, not sourced from either company's real data — see the
  disclaimer in the app's Panel 4.

No authentication or database — this is a demo build for stakeholder review.

## Security

- **Transport:** real HTTPS/TLS on both services, auto-provisioned by
  Render — not a placeholder claim.
- **At rest:** nothing to encrypt — there is no database, so no boardroom or
  pricing data is persisted anywhere. If this moves past demo stage and
  starts storing real data, at-rest encryption and access control become a
  real requirement at that point, not before.

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
