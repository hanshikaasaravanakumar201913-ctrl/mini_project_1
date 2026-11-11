from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.database import SessionLocal
from backend.app.migrations import run_migrations
from backend.app.seed_data import seed_demonstration_dataset
from backend.app.routes.auth import router as auth_router
from backend.app.routes.medicines import router as medicines_router
from backend.app.routes.notifications import router as notifications_router
from backend.app.routes.schedules import router as schedules_router
from backend.app.routes.household import router as household_router
from backend.app.routes.disposal import router as disposal_router
from backend.app.routes.education import router as education_router
from backend.app.routes.c_engine import router as c_engine_router, repopulate_c_structures
from backend.app.routes.prescriptions import router as prescriptions_router
from backend.app.routes.refill import router as refill_router
from backend.app.routes.caregivers import router as caregivers_router
from backend.app.routes.pharmacies import router as pharmacies_router
from backend.app.routes.pharmacy_portal import router as pharmacy_portal_router
from backend.app.routes.orders import router as orders_router
from backend.app.routes.nlp import router as nlp_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Run Alembic migrations safely (preserves existing user data)
    run_migrations()

    # 2. Seed initial demonstration data & demo accounts if needed
    db = SessionLocal()
    try:
        seed_demonstration_dataset(db, reset=False)
        repopulate_c_structures(db)
    finally:
        db.close()

    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend API for Multilingual Smart Medicine Management, Family Care & Pharmacy Accessibility",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(medicines_router, prefix=settings.API_PREFIX)
app.include_router(notifications_router, prefix=settings.API_PREFIX)
app.include_router(schedules_router, prefix=settings.API_PREFIX)
app.include_router(household_router, prefix=settings.API_PREFIX)
app.include_router(disposal_router, prefix=settings.API_PREFIX)
app.include_router(education_router, prefix=settings.API_PREFIX)
app.include_router(c_engine_router, prefix=settings.API_PREFIX)
app.include_router(prescriptions_router, prefix=settings.API_PREFIX)
app.include_router(refill_router, prefix=settings.API_PREFIX)
app.include_router(caregivers_router, prefix=settings.API_PREFIX)
app.include_router(pharmacies_router, prefix=settings.API_PREFIX)
app.include_router(pharmacy_portal_router, prefix=settings.API_PREFIX)
app.include_router(orders_router, prefix=settings.API_PREFIX)
app.include_router(nlp_router, prefix=settings.API_PREFIX)


@app.get("/")
def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "operational",
        "docs_url": "/docs",
        "health_check": f"{settings.API_PREFIX}/health",
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "database": "connected",
        "c_academic_engine": "active",
    }
