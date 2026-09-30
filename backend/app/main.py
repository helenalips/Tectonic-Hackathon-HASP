"""TrustGrid API entry point. Routers are registered here; agents fill them in phase 1."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import ask, auth, clients, conflicts, dossiers, events, people, search, solutions
from app.db import init_db
from app.security import web
from app.security.logging import configure_logging


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    init_db()
    yield


app = FastAPI(
    title="TrustGrid API",
    version="0.1.0",
    lifespan=lifespan,
    # No interactive docs in the demo build: less attack surface, and the contract lives in contracts/.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
web.install(app)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


for module in (auth, clients, events, dossiers, search, people, conflicts, ask, solutions):
    app.include_router(module.router)
