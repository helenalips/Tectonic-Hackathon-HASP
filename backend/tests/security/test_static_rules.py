"""Code rules from contracts/interfaces.md, checked on the source tree so every agent's code is covered."""
import ast
import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
SOURCES = sorted(p for p in list((BACKEND / "app").rglob("*.py")) + list((BACKEND / "scripts").rglob("*.py")))


def _rel(p: Path) -> str:
    return p.relative_to(BACKEND).as_posix()


@pytest.mark.parametrize("path", SOURCES, ids=_rel)
def test_no_dangerous_calls(path):
    tree = ast.parse(path.read_text())
    bad = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            fn = node.func
            name = fn.id if isinstance(fn, ast.Name) else fn.attr if isinstance(fn, ast.Attribute) else ""
            if name in {"eval", "exec", "compile", "__import__"} and isinstance(fn, ast.Name):
                bad.append(f"{name}() line {node.lineno}")
            if name in {"system", "popen"} or (isinstance(fn, ast.Attribute) and name in {"loads", "load"}
                                               and isinstance(fn.value, ast.Name) and fn.value.id in {"pickle", "marshal"}):
                bad.append(f"{name}() line {node.lineno}")
            if name == "load" and isinstance(fn, ast.Attribute) and isinstance(fn.value, ast.Name) and fn.value.id == "yaml":
                bad.append(f"yaml.load line {node.lineno}")
            # Raw SQL built from strings: execute(f"...") / text(f"...") / .format / % / +
            if name in {"execute", "text", "exec_driver_sql"} and node.args:
                arg = node.args[0]
                if isinstance(arg, ast.JoinedStr) or (isinstance(arg, ast.BinOp)) or (
                    isinstance(arg, ast.Call) and isinstance(arg.func, ast.Attribute) and arg.func.attr == "format"):
                    bad.append(f"string-built SQL line {node.lineno}")
    assert not bad, bad


@pytest.mark.parametrize("path", SOURCES, ids=_rel)
def test_no_html_responses_or_markup_rendering(path):
    src = path.read_text()
    assert not re.search(r"\b(HTMLResponse|Jinja2Templates|Markup\()", src)


def test_frontend_never_renders_raw_html():
    frontend = BACKEND.parent / "frontend" / "src"
    if not frontend.exists():
        pytest.skip("frontend not present")
    hits = [f"{p.relative_to(frontend)}" for p in frontend.rglob("*.[jt]s*")
            if re.search(r"dangerouslySetInnerHTML|\.innerHTML\s*=|v-html|document\.write", p.read_text(errors="ignore"))]
    assert not hits, hits


def test_frontend_never_stores_the_session_in_web_storage():
    frontend = BACKEND.parent / "frontend" / "src"
    if not frontend.exists():
        pytest.skip("frontend not present")
    hits = [f"{p.relative_to(frontend)}" for p in frontend.rglob("*.[jt]s*")
            if re.search(r"(localStorage|sessionStorage)\.setItem\([^)]*(token|session|jwt)", p.read_text(errors="ignore"), re.I)]
    assert not hits, hits


def test_no_hardcoded_secrets_in_source():
    pattern = re.compile(r"(sk-ant-[A-Za-z0-9_-]{10,}|(jwt_secret|demo_password|api_key)\s*=\s*[\"'][^\"']{6,}[\"'])", re.I)
    hits = [_rel(p) for p in SOURCES if pattern.search(p.read_text())]
    assert not hits, hits
