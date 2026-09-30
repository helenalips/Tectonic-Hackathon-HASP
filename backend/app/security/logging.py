"""Structured JSON logging with PII and secret masking. Secrets are never passed to the logger.

Masking happens when the log record is created (record factory), so every handler sees masked text,
not only ours. Our JSON formatter never writes tracebacks: exception messages can carry document content.
"""
import json
import logging
import re

_PATTERNS = [
    (re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*"), "[jwt]"),
    (re.compile(r"\bsk-ant-[A-Za-z0-9_-]{10,}"), "[secret]"),
    (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}"), "Bearer [secret]"),
    (
        re.compile(r"(?i)\b(password|passwd|pwd|secret|api[_-]?key|token|jwt_secret|demo_password)(\"?\s*[=:]\s*\"?)[^\s\",;&]+"),
        r"\1\2[redacted]",
    ),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[email]"),
    (re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b"), "[iban]"),
    # Belgian national register number (YY.MM.DD-XXX.XX) and generic 11-digit national ids
    (re.compile(r"\b\d{2}\.?\d{2}\.?\d{2}-?\d{3}\.?\d{2}\b"), "[national_id]"),
    # International phone numbers (+32 470 12 34 56) and Belgian mobiles (0470 12 34 56)
    (re.compile(r"\+\d{1,3}(?:[\s./-]?\d){7,12}\b"), "[phone]"),
    (re.compile(r"\b04\d{2}(?:[\s./]?\d{2}){3}\b"), "[phone]"),
]


def mask_pii(text: str) -> str:
    for pattern, repl in _PATTERNS:
        text = pattern.sub(repl, text)
    return text


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "msg": mask_pii(record.getMessage()),
        }
        return json.dumps(entry)


_base_factory = logging.getLogRecordFactory()


def _masking_factory(*args, **kwargs) -> logging.LogRecord:
    record = _base_factory(*args, **kwargs)
    try:
        record.msg = mask_pii(record.getMessage())
        record.args = None
    except Exception:  # a broken format string must never crash the request
        record.msg, record.args = "[unformattable log message]", None
    return record


def configure_logging() -> None:
    logging.setLogRecordFactory(_masking_factory)
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    # uvicorn access logs include query strings; route them through the masking formatter too
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers = [handler]
        lg.propagate = False
    # Third-party HTTP clients log full URLs and headers at DEBUG; keep them quiet.
    for name in ("httpx", "httpcore", "anthropic"):
        logging.getLogger(name).setLevel(logging.WARNING)
