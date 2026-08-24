import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.simulation import DOSING_OPTIONS, HOSTILITY_OPTIONS, run_simulation

app = FastAPI(title="Amgen De-Risk Launcher API")

allowed_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SimulationRequest(BaseModel):
    price: float = Field(ge=500, le=3000)
    dosing: str
    evidence_weight: float = Field(ge=0, le=1)
    hostility: str


@app.get("/")
def root():
    return {
        "service": "Amgen De-Risk Launcher API",
        "docs": "/docs",
        "health": "/health",
        "simulate": "POST /api/simulate",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/simulate")
def simulate(req: SimulationRequest):
    if req.dosing not in DOSING_OPTIONS:
        return {"error": f"dosing must be one of {DOSING_OPTIONS}"}
    if req.hostility not in HOSTILITY_OPTIONS:
        return {"error": f"hostility must be one of {HOSTILITY_OPTIONS}"}
    return run_simulation(req.price, req.dosing, req.evidence_weight, req.hostility)
