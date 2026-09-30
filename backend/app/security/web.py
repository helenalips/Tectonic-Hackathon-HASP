"""HTTP hardening: security headers, CORS, CSRF origin check, body limits, rate limiting, generic errors."""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.security.auth import decode_token

log = logging.getLogger("trustgrid")

# Largest legitimate body: EventCreate with 20 000 chars of 4-byte UTF-8 plus JSON overhead.
MAX_BODY_BYTES = 128 * 1024
_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def rate_limit_key(request: Request) -> str:
    """Per user when a valid session cookie is present, else per client IP.

    Keying on the user stops one account from spreading requests across IPs, and stops users
    behind one NAT from exhausting each other's budget. The cookie is verified, so it can't be forged.
    """
    token = request.cookies.get(get_settings().cookie_name)
    if token and len(token) <= 4096:
        payload = decode_token(token)
        if payload is not None:
            return f"user:{payload['sub']}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=rate_limit_key)

_SECURITY_HEADERS = {
    # API returns JSON only; nothing should ever render or frame it.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Cache-Control": "no-store",
}


def _json(status_code: int, detail: str) -> JSONResponse:
    return JSONResponse({"detail": detail}, status_code=status_code)


class _BodyTooLarge(Exception):
    pass


class BodySizeLimitMiddleware:
    """Pure ASGI: rejects bodies over the limit, by Content-Length up front and by counting chunked bodies."""

    def __init__(self, app, max_bytes: int = MAX_BODY_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        declared = headers.get(b"content-length")
        if declared is not None:
            try:
                too_big = int(declared) > self.max_bytes
            except ValueError:
                too_big = True
            if too_big:
                await _json(413, "Request is too large.")(scope, receive, send)
                return

        received = 0
        started = False

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _BodyTooLarge
            return message

        async def tracking_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _BodyTooLarge:
            if not started:
                await _json(413, "Request is too large.")(scope, receive, send)


def trusted_origins(configured: list[str]) -> set[str]:
    """Configured origins plus their loopback aliases: the Vite dev server binds 127.0.0.1 while the
    config names localhost, and the browser sends whichever the user typed."""
    out = set(configured)
    for origin in configured:
        for a, b in (("//localhost", "//127.0.0.1"), ("//127.0.0.1", "//localhost")):
            if a in origin:
                out.add(origin.replace(a, b))
    return out


def _origin_allowed(request: Request, allowed: set[str]) -> bool:
    """CSRF defence in depth on top of SameSite=Strict (which treats other localhost ports as same-site)."""
    if request.headers.get("sec-fetch-site") == "cross-site":
        return False
    origin = request.headers.get("origin")
    if origin is None:
        return True  # non-browser client (curl, tests); browsers always send Origin on unsafe methods
    if origin in allowed:
        return True
    host = request.headers.get("host")
    return host is not None and origin in (f"http://{host}", f"https://{host}")


def install(app: FastAPI) -> None:
    s = get_settings()
    origins = trusted_origins(s.cors_origins)

    app.state.limiter = limiter

    app.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(origins),
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        max_age=600,
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        if request.method in _UNSAFE_METHODS:
            if not _origin_allowed(request, origins):
                response = _json(403, "Cross-site request blocked.")
            elif _has_body(request) and not _is_json(request):
                response = _json(415, "Send JSON (Content-Type: application/json).")
            else:
                response = await call_next(request)
        else:
            response = await call_next(request)
        for k, v in _SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        if s.cookie_secure:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    # Outermost: runs before routing, body parsing and the header middleware.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=MAX_BODY_BYTES)

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limited(request: Request, exc: RateLimitExceeded):
        return _json(429, "Too many requests. Please wait a moment.")

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        return JSONResponse({"detail": str(exc.detail)}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        # Field names only (capped); never echo the submitted values back.
        fields = sorted({".".join(str(p) for p in e["loc"][1:])[:40] for e in exc.errors()})[:8]
        return _json(422, f"Invalid input: {', '.join(fields) or 'body'}")

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.error("Unhandled error on %s %s: %s", request.method, request.url.path, type(exc).__name__)
        return _json(500, "Something went wrong. Please try again.")


def _has_body(request: Request) -> bool:
    length = request.headers.get("content-length")
    return bool(request.headers.get("transfer-encoding")) or (length is not None and length != "0")


def _is_json(request: Request) -> bool:
    media = request.headers.get("content-type", "").split(";")[0].strip().lower()
    return media == "application/json"

