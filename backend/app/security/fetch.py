"""Allowlisted HTTP fetcher. The ONLY way the app may reach the internet (the Anthropic SDK aside).

Rules: HTTPS only, port 443; host must be an official SD Worx domain (sdworx.com or a subdomain),
ASCII only (no IDN look-alikes), never an IP literal, no credentials in the URL; our parser and
httpx's parser must agree on the host; redirects are followed manually and each hop is re-checked;
text content types only; timeout and max size enforced (after decompression); no proxy or .netrc
from the environment; the body is returned as sanitized plain text.
"""
import ipaddress
import re
from urllib.parse import urljoin, urlsplit

import httpx

from app.config import get_settings
from app.security.sanitize import to_plain_text

MAX_REDIRECTS = 3
MAX_URL_LENGTH = 2048
_ALLOWED_TYPES = ("text/html", "text/plain", "application/json", "application/xhtml+xml")
_URL_CHARS_RE = re.compile(r"^[\x21-\x7e]+$")  # printable ASCII, no spaces or control characters
_HOST_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")


class FetchRejected(ValueError):
    pass


def _host_of(url: str) -> str | None:
    """Return the checked hostname, or None when the URL breaks any rule."""
    if len(url) > MAX_URL_LENGTH or not _URL_CHARS_RE.match(url) or "\\" in url:
        return None
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return None
    if parts.scheme != "https" or parts.username or parts.password or "@" in parts.netloc:
        return None
    if port not in (None, 443):
        return None
    host = (parts.hostname or "").lower().rstrip(".")
    if not host or host.startswith("xn--") or ".xn--" in host or not _HOST_RE.match(host):
        return None
    try:
        ipaddress.ip_address(host)
        return None  # IP literals are never allowed
    except ValueError:
        pass
    try:
        if (httpx.URL(url).host or "").lower().rstrip(".") != host:
            return None  # parser differential: refuse rather than guess
    except httpx.InvalidURL:
        return None
    return host


def is_allowed_url(url: str) -> bool:
    host = _host_of(url)
    if host is None:
        return False
    return any(host == d or host.endswith("." + d) for d in get_settings().fetch_allowed_domains)


def fetch_sdworx_text(url: str, *, transport: httpx.BaseTransport | None = None) -> str:
    """Fetch an official SD Worx page as plain text. `transport` is a test hook (httpx.MockTransport)."""
    s = get_settings()
    current = url
    with httpx.Client(
        timeout=s.fetch_timeout_seconds, follow_redirects=False, trust_env=False, transport=transport
    ) as client:
        for _ in range(MAX_REDIRECTS + 1):
            if not is_allowed_url(current):
                raise FetchRejected("URL not allowed: only https://sdworx.com and its subdomains")
            with client.stream("GET", current, headers={"User-Agent": "TrustGrid-hackathon/0.1"}) as resp:
                if resp.is_redirect:
                    current = urljoin(current, resp.headers.get("location", ""))
                    continue
                resp.raise_for_status()
                ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
                if ctype not in _ALLOWED_TYPES:
                    raise FetchRejected("Content type not allowed")
                declared = resp.headers.get("content-length")
                if declared and declared.isdigit() and int(declared) > s.fetch_max_bytes:
                    raise FetchRejected("Response too large")
                body = bytearray()
                for chunk in resp.iter_bytes():
                    body.extend(chunk)
                    if len(body) > s.fetch_max_bytes:
                        raise FetchRejected("Response too large")
                return to_plain_text(body.decode(resp.encoding or "utf-8", errors="replace"), max_len=200_000)
    raise FetchRejected("Too many redirects")
