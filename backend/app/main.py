"""TrustGrid API entry point. Routers are registered here; agents fill them in phase 1."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import ask, auth, check, clients, conflicts, dossiers, events, people, search, solutions
from app.db import init_db
from app.security import web
from app.security.logging import configure_logging


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    init_db()
    # Load the embedding model before serving, so the first live check is fast (a few seconds at startup).
    _warm_embeddings()
    yield


def _warm_embeddings() -> None:
    try:
        from app import embeddings

        embeddings.embed(["warm-up"])
    except Exception:  # warm-up is best effort; the first real call loads the model anyway  # nosec B110
        pass


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


for module in (auth, clients, events, dossiers, search, people, conflicts, ask, solutions, check):
    app.include_router(module.router)
