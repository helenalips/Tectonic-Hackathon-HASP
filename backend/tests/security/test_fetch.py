"""A10 SSRF: the only outbound fetcher accepts official SD Worx HTTPS pages and nothing else."""
import ast
from pathlib import Path

import httpx
import pytest

from app.security.fetch import FetchRejected, fetch_sdworx_text, is_allowed_url

BACKEND = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    "url",
    [
        "https://sdwοrx.com/",                 # Greek omicron
        "https://xn--sdwrx-6ve.com/",           # punycode look-alike
        "https://www.sdworx.com.evil.example/",
        "https://sdworx.com@evil.example/",
        "https://evil.example\\@sdworx.com/",
        "https://evil.example#@sdworx.com/",
        "https://93.184.216.34/",
        "https://[::1]/",
        "https://127.0.0.1/",
        "https://0x7f000001/",
        "https://sdworx.com:444/",
        "http://sdworx.com/",
        "ftp://sdworx.com/",
        "gopher://sdworx.com/",
        "https://sdworx.com /",
        "https://sdworx.com\n.evil.example/",
        "https://" + "a" * 3000 + ".sdworx.com/",
        "//sdworx.com/",
        "",
    ],
)
def test_rejected_urls(url):
    assert is_allowed_url(url) is False


@pytest.mark.parametrize("url", ["https://www.sdworx.com/en-en/about-sd-worx", "https://www.sdworx.com./", "https://SDWORX.com/"])
def test_allowed_urls(url):
    assert is_allowed_url(url) is True


def _transport(routes: dict[str, httpx.Response]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        return routes.get(str(request.url), httpx.Response(404))

    return httpx.MockTransport(handler)


HTML = {"content-type": "text/html; charset=utf-8"}


def test_fetch_returns_plain_text():
    t = _transport({"https://www.sdworx.com/a": httpx.Response(200, headers=HTML,
                                                                 text="<h1>Makes work work</h1><script>x()</script>")})
    assert fetch_sdworx_text("https://www.sdworx.com/a", transport=t) == "Makes work workx()"


def test_redirect_off_domain_rejected():
    t = _transport({"https://www.sdworx.com/a": httpx.Response(302, headers={"location": "https://evil.example/"})})
    with pytest.raises(FetchRejected):
        fetch_sdworx_text("https://www.sdworx.com/a", transport=t)


def test_redirect_downgrade_to_http_rejected():
    t = _transport({"https://www.sdworx.com/a": httpx.Response(301, headers={"location": "http://www.sdworx.com/a"})})
    with pytest.raises(FetchRejected):
        fetch_sdworx_text("https://www.sdworx.com/a", transport=t)


def test_redirect_on_domain_followed():
    t = _transport({
        "https://www.sdworx.com/a": httpx.Response(301, headers={"location": "/b"}),
        "https://www.sdworx.com/b": httpx.Response(200, headers=HTML, text="ok"),
    })
    assert fetch_sdworx_text("https://www.sdworx.com/a", transport=t) == "ok"


def test_redirect_loop_stops():
    t = _transport({"https://www.sdworx.com/a": httpx.Response(302, headers={"location": "/a"})})
    with pytest.raises(FetchRejected, match="redirects"):
        fetch_sdworx_text("https://www.sdworx.com/a", transport=t)


def test_oversized_body_rejected(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "fetch_max_bytes", 1000)
    t = _transport({"https://www.sdworx.com/a": httpx.Response(200, headers=HTML, text="x" * 5000)})
    with pytest.raises(FetchRejected, match="large"):
        fetch_sdworx_text("https://www.sdworx.com/a", transport=t)


def test_binary_content_rejected():
    t = _transport({"https://www.sdworx.com/a.exe": httpx.Response(
        200, headers={"content-type": "application/octet-stream"}, content=b"MZ")})
    with pytest.raises(FetchRejected):
        fetch_sdworx_text("https://www.sdworx.com/a.exe", transport=t)


def test_non_sdworx_url_never_reaches_the_network():
    def handler(request):
        raise AssertionError("network was called")

    with pytest.raises(FetchRejected):
        fetch_sdworx_text("https://example.com/", transport=httpx.MockTransport(handler))


NETWORK_MODULES = {"httpx", "requests", "urllib.request", "urllib3", "aiohttp", "socket", "http.client"}
ALLOWED_NETWORK_FILES = {"app/security/fetch.py"}


def test_no_other_module_opens_network_connections():
    """The fetcher is the single egress point (the Anthropic SDK in app/llm.py aside)."""
    offenders = []
    for py in list((BACKEND / "app").rglob("*.py")) + list((BACKEND / "scripts").rglob("*.py")):
        rel = py.relative_to(BACKEND).as_posix()
        if rel in ALLOWED_NETWORK_FILES:
            continue
        tree = ast.parse(py.read_text())
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            offenders += [f"{rel}: {n}" for n in names if n in NETWORK_MODULES or n.split(".")[0] in {"requests", "aiohttp"}]
    assert not offenders, offenders
