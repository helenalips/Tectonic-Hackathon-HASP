"""Text embeddings for dedup and the vertical check.

Two backends (settings.embeddings_backend / EMBEDDINGS_BACKEND env):
- "minilm": sentence-transformers all-MiniLM-L6-v2, loaded lazily once per process.
- "hash":   deterministic hashed bag of words + character trigrams. No download, used in tests.

Rows returned by embed() are L2-normalized, so cosine == dot product.
An in-memory cache keyed by (backend, sha256(text)) avoids re-embedding the same text.
"""
from __future__ import annotations

import hashlib
import re
import threading
import unicodedata

import numpy as np

from app.config import get_settings

_HASH_DIM = 2048
_MAX_CACHE = 20000

_model = None
_model_lock = threading.Lock()
_cache: dict[tuple[str, str], np.ndarray] = {}

_STOPWORDS = frozenset(
    """a an the and or but if of to in on at for from by with about as is are was were be been being
    do does did can could would should will shall may might must we you i he she it they them our your
    their this that these those there here what which who whom how when where why please hi hello
    dear thanks thank regards kind best any some all it's its im i'm us me my get got possible""".split()
)
_WORD_RE = re.compile(r"[a-z0-9]+")


def _backend() -> str:
    return get_settings().embeddings_backend


def _text_key(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _bucket(feature: str) -> int:
    digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big") % _HASH_DIM


def _stem(word: str) -> str:
    # Tiny suffix stripper so "reports"/"report" and "calculated"/"calculation" overlap.
    for suffix in ("ations", "ation", "ings", "ing", "ies", "ed", "es", "s"):
        if len(word) > len(suffix) + 3 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def _hash_vector(text: str) -> np.ndarray:
    norm = unicodedata.normalize("NFKC", text).lower()
    words = [_stem(w) for w in _WORD_RE.findall(norm) if w not in _STOPWORDS]
    vec = np.zeros(_HASH_DIM, dtype=np.float32)
    for w in words:
        vec[_bucket("w:" + w)] += 1.0
        padded = f"#{w}#"
        for i in range(len(padded) - 2):
            vec[_bucket("t:" + padded[i : i + 3])] += 0.25
    for a, b in zip(words, words[1:]):
        vec[_bucket(f"b:{a}_{b}")] += 0.5
    n = float(np.linalg.norm(vec))
    return vec / n if n > 0 else vec


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer  # heavy import, only when needed

                _model = SentenceTransformer(get_settings().embedding_model, device="cpu")  # MPS deadlocks across threads
    return _model


def embed(texts: list[str]) -> np.ndarray:
    """Embed texts; returns an array of shape (len(texts), dim) with L2-normalized rows."""
    backend = _backend()
    keys = [(backend, _text_key(t)) for t in texts]
    missing = [i for i, k in enumerate(keys) if k not in _cache]
    if missing:
        if backend == "hash":
            vectors = [_hash_vector(texts[i]) for i in missing]
        else:
            raw = _get_model().encode([texts[i] for i in missing], normalize_embeddings=True, show_progress_bar=False)
            vectors = [np.asarray(v, dtype=np.float32) for v in raw]
        if len(_cache) + len(missing) > _MAX_CACHE:
            _cache.clear()
        for i, v in zip(missing, vectors):
            _cache[keys[i]] = v
    if not texts:
        return np.zeros((0, _HASH_DIM if backend == "hash" else 384), dtype=np.float32)
    return np.vstack([_cache[k] for k in keys])


def embed_one(text: str) -> np.ndarray:
    return embed([text])[0]


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    if na == 0 or nb == 0:
        return 0.0
    return float(np.clip(np.dot(a, b) / (na * nb), -1.0, 1.0))


def similarity(a: str, b: str) -> float:
    va, vb = embed([a, b])
    return cosine(va, vb)
