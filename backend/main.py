import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import classification, allocation, metrics, export, twist, live, auth, intelligence, simulate

app = FastAPI(
    title="Battery Intelligence Platform API",
    description=(
        "AI-Powered Battery Decision Support System for Siemens Energy PS2P1 - IMECE 2026 Brain Bolt. "
        "Layered pipeline: Engineering Rule Validation -> Battery Intelligence Engine (Suitability, Future Health, "
        "RUL, Risk Features) -> Maintenance Recommendation -> Graph Optimization -> Final Allocation."
    ),
    version="3.0.0"
)

# Enable CORS for React frontend / Firebase Hosting
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(classification.router)
app.include_router(allocation.router)
app.include_router(metrics.router)
app.include_router(export.router)
app.include_router(twist.router)
app.include_router(live.router)
app.include_router(auth.router)
app.include_router(intelligence.router)
app.include_router(simulate.router)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Battery Intelligence Platform API",
        "version": "3.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
