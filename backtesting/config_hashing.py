"""NEXUSA — config_hashing.py

High-integrity, deterministic hashing for configuration, code, and runtime
context. Designed to satisfy the architecture's requirements for
"Deterministic Compute (semantic versioning + hashing of inputs/outputs)"
and "Backtesting: store config hashing + artifacts".

Key capabilities
----------------
- Stable canonicalization for arbitrary Python configs (dict/list/tuple/set/Decimal,
  numpy/pandas if available, pathlib, datetime, UUID, etc.)
- Path-aware ignore & redact rules with glob patterns (e.g., "**.ts_event",
  "credentials.api_key")
- Optional salted redaction (to include secret structure without revealing values)
- Streaming BLAKE2b hashing (default) w/ configurable digest size and namespace
- Short, URL-safe fingerprint ids
- Environment fingerprints (Python, OS, installed packages) and optional Git state
- Optional codebase fingerprint for reproducibility (walks a directory)
- CLI usage for local + CI/CD pipelines

No third-party deps required; integrates optional extras if present.

Copyright (c) 2025
"""
from __future__ import annotations

import argparse
import base64
import dataclasses
import datetime as _dt
import hashlib
import importlib
import importlib.metadata as _md
import inspect
import io
import ipaddress
import json
import math
import os
import pathlib as _pl
import re
import sys
import textwrap
import types
import typing as T
import uuid as _uuid

try:  # Optional but common
    import yaml  # type: ignore
except Exception:  # pragma: no cover
    yaml = None  # type: ignore

# Optional scientific stack support (serializes deterministically if present)
try:  # pragma: no cover - optional
    import numpy as _np  # type: ignore
except Exception:  # pragma: no cover
    _np = None  # type: ignore

try:  # pragma: no cover - optional
    import pandas as _pd  # type: ignore
except Exception:  # pragma: no cover
    _pd = None  # type: ignore

SCHEMA_VERSION = "cfg-hash.v1"
DEFAULT_ALGO = "blake2b"
DEFAULT_DIGEST_SIZE = 32  # 256-bit

# ---------- Utility: path-glob matching over dotted paths ----------
_GLOB_SPECIALS = re.compile(r"([.\\+?{}()\[\]^$])")

def _glob_to_regex(glob: str) -> re.Pattern:
    """Translate glob for dotted paths to a compiled regex.
    Supports "*" for one segment, "**" for any depth, and dot to separate keys.
    """
    if not glob:
        return re.compile(r"^$")
    # Escape regex special chars except * and ** and dot
    parts = []
    for segment in glob.split('.'):
        if segment == '**':
            parts.append(r"(?:.+)?")
        else:
            seg = re.escape(segment).replace(r"\*", r"[^.]+")
            parts.append(seg)
    pattern = r"^" + r"\.".join(parts) + r"$"
    return re.compile(pattern)

class _PathRules:
    """Rules for matching and handling dotted-path keys in configs.

    Supports:
      - ignore: skip paths entirely from hashing
      - redact: hide/salt values but keep structural info
    """

    def __init__(self, ignores: T.Iterable[str] = (), redacts: T.Iterable[str] = ()) -> None:
        """Initialize rules with glob patterns.

        Args:
            ignores: dotted glob patterns to ignore
            redacts: dotted glob patterns to redact
        """
        self.ignore_globs = list(ignores)
        self.redact_globs = list(redacts)
        self._ignore_re = [_glob_to_regex(g) for g in self.ignore_globs]
        self._redact_re = [_glob_to_regex(g) for g in self.redact_globs]

    def ignore(self, path: str) -> bool:
        """Return True if the path should be ignored entirely."""
        return any(r.match(path) for r in self._ignore_re)

    def redact(self, path: str) -> bool:
        """Return True if the path should be redacted."""
        return any(r.match(path) for r in self._redact_re)

# ---------- Canonicalization ----------

class CanonicalEncoder(json.JSONEncoder):
    """Deterministic JSON Encoder for complex types.

    - Sorts object keys (handled by json.dumps)
    - Ensures stable float formatting, supports NaN/Inf as strings
    - Converts unsupported types to structured canonical forms
    """
    def default(self, o: T.Any):  # type: ignore[override]
        # Dataclasses
        if dataclasses.is_dataclass(o):
            return dataclasses.asdict(o)
        # Numpy
        if _np is not None:
            if isinstance(o, _np.ndarray):
                return [self.default(x) for x in o.tolist()]
            if isinstance(o, (_np.integer,)):
                return int(o)
            if isinstance(o, (_np.floating,)):
                return _format_float(float(o))
        # Pandas
        if _pd is not None:
            if isinstance(o, _pd.Timestamp):
                return o.isoformat()
            if isinstance(o, _pd.Timedelta):
                return o.isoformat()
            if isinstance(o, (_pd.Series, _pd.Index)):
                return [self.default(x) for x in o.tolist()]
            if isinstance(o, _pd.DataFrame):
                # Serialize as list of dicts with sorted columns for determinism
                cols = list(map(str, o.columns))
                cols.sort()
                return [{c: self.default(o.at[i, c]) for c in cols} for i in o.index]
        # pathlib
        if isinstance(o, _pl.Path):
            return str(o)
        # datetime/date/time
        if isinstance(o, (_dt.datetime, _dt.date, _dt.time)):
            # Always ISO 8601 (UTC if aware)
            if isinstance(o, _dt.datetime) and o.tzinfo is not None:
                return o.astimezone(_dt.timezone.utc).isoformat()
            return o.isoformat()
        # UUID/IP
        if isinstance(o, (_uuid.UUID, ipaddress.IPv4Address, ipaddress.IPv6Address)):
            return str(o)
        # bytes
        if isinstance(o, (bytes, bytearray, memoryview)):
            return {"__bytes__": base64.urlsafe_b64encode(bytes(o)).decode('ascii').rstrip('=')}
        # set/tuple
        if isinstance(o, (set, frozenset, tuple)):
            return [self.default(x) for x in sorted(list(o), key=_stable_key)]
        # functions / modules / classes — use qualified name
        if isinstance(o, (types.FunctionType, types.BuiltinFunctionType, types.MethodType)):
            return {"__callable__": f"{o.__module__}:{getattr(o, '__qualname__', getattr(o, '__name__', 'unknown'))}"}
        if inspect.isclass(o):
            return {"__class__": f"{o.__module__}:{o.__qualname__}"}
        if isinstance(o, types.ModuleType):
            return {"__module__": o.__name__}
        return super().default(o)

def _stable_key(x: T.Any) -> T.Any:
    """Return a stable sort key for arbitrary objects used in canonicalization."""
    try:
        return (str(type(x)), x)
    except Exception:
        return str(x)

def _format_float(val: float) -> T.Union[float, str]:
    """Format float to stable minimal string or special marker (NaN/Inf)."""
    if math.isnan(val):
        return "NaN"
    if math.isinf(val):
        return "Infinity" if val > 0 else "-Infinity"
    s = format(val, ".17g")
    if s == "-0":
        s = "0"
    return s

def _sanitize(obj: T.Any, *, path: str, rules: _PathRules, redact_mode: str, redactor: T.Callable[[bytes], str]) -> T.Any:
    """Return a JSON-serializable structure with ignore/redact rules applied.

    redact_mode: 'drop' | 'salted'
    redactor: takes value-bytes and returns a stable tag string
    """
    if rules.ignore(path):
        return None  # Caller will drop

    # Primitive types first
    if obj is None:
        return None
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, (int,)):
        return int(obj)
    if isinstance(obj, float):
        return _format_float(float(obj))
    if isinstance(obj, str):
        return obj

    # Numpy scalars
    if _np is not None and isinstance(obj, (_np.integer, _np.floating)):
        return _format_float(float(obj)) if isinstance(obj, _np.floating) else int(obj)

    # dict-like
    if isinstance(obj, dict):
        out: dict = {}
        for k in sorted(map(str, obj.keys())):
            child_path = f"{path}.{k}" if path else k
            if rules.ignore(child_path):
                continue
            v = obj[k]
            if rules.redact(child_path):
                if redact_mode == 'drop':
                    # Replace with marker independent of content
                    out[k] = "<REDACTED>"
                else:
                    # salted: include a stable salted digest of the value so structure affects hash
                    canon = stable_canonical_bytes(v)
                    out[k] = f"<REDACTED:{redactor(canon)}>"
            else:
                san = _sanitize(v, path=child_path, rules=rules, redact_mode=redact_mode, redactor=redactor)
                if san is not None:
                    out[k] = san
        return out

    # list/tuple/set/iterables
    if isinstance(obj, (list, tuple, set, frozenset)):
        items = list(obj) if not isinstance(obj, (set, frozenset)) else sorted(list(obj), key=_stable_key)
        res = []
        for i, v in enumerate(items):
            child_path = f"{path}.[{i}]" if path else f"[{i}]"
            san = _sanitize(v, path=child_path, rules=rules, redact_mode=redact_mode, redactor=redactor)
            if san is not None:
                res.append(san)
        return res

    # Fallback: let the encoder handle it
    return obj


def stable_canonical_bytes(obj: T.Any) -> bytes:
    """Serialize `obj` to deterministic JSON bytes with CanonicalEncoder.
    No redaction/ignores applied.
    """
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        cls=CanonicalEncoder,
        default=str,
    ).encode("utf-8")

# ---------- Hashing ----------

@dataclasses.dataclass(frozen=True)
class HashResult:
    """Immutable container for a hashing result and its metadata."""

    algorithm: str
    digest_size: int
    hexdigest: str
    short_id: str
    schema: str = SCHEMA_VERSION
    details: T.Dict[str, T.Any] = dataclasses.field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert HashResult to a serializable dictionary."""
        return dataclasses.asdict(self)

def _short_id(digest_bytes: bytes, length: int = 16) -> str:
    """URL-safe, lowercase id from digest bytes (default 16 chars)."""
    s = base64.urlsafe_b64encode(digest_bytes).decode("ascii").rstrip("=").lower()
    return s[:length]

def _new_hasher(algorithm: str = DEFAULT_ALGO, *, digest_size: int = DEFAULT_DIGEST_SIZE, namespace: str = "") -> "hashlib._Hash":
    """Return a new hash object for given algorithm, size, and optional namespace."""
    algorithm = algorithm.lower()
    if algorithm == "blake2b":
        person = namespace.encode("utf-8")[:16] if namespace else None
        return hashlib.blake2b(digest_size=digest_size, person=person)
    if algorithm == "sha256":
        return hashlib.sha256()
    if algorithm == "sha3_256":
        return hashlib.sha3_256()
    raise ValueError(f"Unsupported algorithm: {algorithm}")


def _hmac_redactor(salt: bytes, algorithm: str = DEFAULT_ALGO) -> T.Callable[[bytes], str]:
    """Return a redactor function that produces stable salted digests for secrets."""
    def redactor(payload: bytes) -> str:
        if algorithm == "blake2b":
            h = hashlib.blake2b(key=salt, digest_size=16)
        elif algorithm == "sha256":
            h = hashlib.sha256()
            if salt:
                h.update(hashlib.pbkdf2_hmac('sha256', payload, salt, 1))
        else:
            h = hashlib.sha3_256()
            if salt:
                h.update(hashlib.pbkdf2_hmac('sha256', payload, salt, 1))
        h.update(payload)
        return _short_id(h.digest(), 12)
    return redactor

def hash_config(
    config: T.Any,
    *,
    ignore: T.Iterable[str] = (),
    redact: T.Iterable[str] = (),
    redact_mode: str = "drop",  # 'drop' | 'salted'
    salt: T.Optional[bytes] = None,
    algorithm: str = DEFAULT_ALGO,
    digest_size: int = DEFAULT_DIGEST_SIZE,
    namespace: str = "",
    with_env: bool = False,
    with_git: bool = False,
    code_dir: T.Optional[str] = None,
) -> HashResult:
    """Hash a configuration object with deterministic canonicalization.

    - `ignore` / `redact` accept dotted-path globs (e.g., 'metadata.*', '**.ts')
    - `redact_mode='drop'` replaces redacted values with a constant marker
      (does *not* allow secret content to influence the hash). Use this when
      secrets should never affect reproducibility.
    - `redact_mode='salted'` replaces redacted values with a salted digest
      (value-dependent but not reversible); requires `salt`.
    - `with_env` adds environment fingerprint (python, platform, packages)
    - `with_git` adds Git fingerprint if repo present
    - `code_dir` includes codebase fingerprint of that directory (file names + content)
    """
    rules = _PathRules(ignores=ignore, redacts=redact)
    redactor = _hmac_redactor(salt or b"", algorithm)

    sanitized = _sanitize(config, path="", rules=rules, redact_mode=redact_mode, redactor=redactor)

    # Drop None keys produced by ignores
    if isinstance(sanitized, dict):
        sanitized = {k: v for k, v in sanitized.items() if v is not None}

    canon = stable_canonical_bytes({
        "schema": SCHEMA_VERSION,
        "config": sanitized,
    })

    h = _new_hasher(algorithm, digest_size=digest_size, namespace=namespace)
    h.update(canon)

    details: dict = {
        "schema": SCHEMA_VERSION,
        "algorithm": algorithm,
        "digest_size": digest_size,
        "namespace": namespace,
        "ignore": list(ignore),
        "redact": list(redact),
        "redact_mode": redact_mode,
        "canon_sha256": hashlib.sha256(canon).hexdigest(),
        "canon_len": len(canon),
    }

    if with_env:
        env_fp = environment_fingerprint()
        env_bytes = stable_canonical_bytes(env_fp)
        h.update(env_bytes)
        details["env"] = env_fp
        details["env_sha256"] = hashlib.sha256(env_bytes).hexdigest()

    if with_git:
        git_fp = git_fingerprint()
        if git_fp:
            git_bytes = stable_canonical_bytes(git_fp)
            h.update(git_bytes)
            details["git"] = git_fp
            details["git_sha256"] = hashlib.sha256(git_bytes).hexdigest()

    if code_dir:
        code_fp = codebase_fingerprint(code_dir)
        code_bytes = stable_canonical_bytes(code_fp)
        h.update(code_bytes)
        details["code"] = code_fp
        details["code_sha256"] = hashlib.sha256(code_bytes).hexdigest()

    digest = h.digest()
    return HashResult(
        algorithm=algorithm,
        digest_size=digest_size,
        hexdigest=digest.hex(),
        short_id=_short_id(digest),
        details=details,
    )


# ---------- Fingerprints ----------

def environment_fingerprint() -> dict:
    """Collect information about Python, OS, timezone, and installed packages."""
    py_impl = sys.implementation.name
    platform = {
        "python": {
            "version": sys.version.split()[0],
            "implementation": py_impl,
            "executable": sys.executable,
        },
        "os": {"platform": sys.platform},
        "tz": str(_dt.datetime.now().astimezone().tzinfo),
        "packages": sorted([f"{d.metadata['Name']}=={d.version}" for d in _md.distributions() if d.metadata and 'Name' in d.metadata]),
    }
    return platform


def _run_git(cmd: T.List[str]) -> T.Optional[str]:  # pragma: no cover
    """Run a Git command and return its output or None on error."""
    import subprocess
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL)
        return out.decode('utf-8', 'replace')
    except Exception:
        return None


def git_fingerprint() -> T.Optional[dict]:  # pragma: no cover
    """Return a dictionary with Git commit and dirty status if available."""
    head = _run_git(["git", "rev-parse", "HEAD"]) or ""
    if not head:
        return None
    status = _run_git(["git", "status", "--porcelain=v1", "-uno"]) or ""
    diff = _run_git(["git", "diff", "--no-color"]) or ""
    return {
        "head": head.strip(),
        "dirty": bool(status.strip() or diff.strip()),
        "status": status,
        "diff_sha256": hashlib.sha256(diff.encode('utf-8')).hexdigest(),
    }

def codebase_fingerprint(root: str, *, include_patterns: T.Iterable[str] = ("**/*.py",), exclude_patterns: T.Iterable[str] = ("**/.git/**", "**/__pycache__/**", "**/*.pyc")) -> dict:
    """Walk a directory and hash file paths + contents deterministically."""
    root_path = _pl.Path(root)
    files: T.List[_pl.Path] = []
    for pat in include_patterns:
        files.extend(root_path.rglob(pat.replace("**/", "**/")))
    # Deduplicate and filter excludes
    files = sorted(set(files))
    ex_res = [_glob_to_regex(p.replace("/", ".").replace("**.", "**")) for p in exclude_patterns]
    def excluded(p: _pl.Path) -> bool:
        dotted = ".".join(p.relative_to(root_path).parts)
        return any(r.match(dotted) for r in ex_res)
    digest = hashlib.blake2b(digest_size=16)
    listing = []
    for f in files:
        if not f.is_file() or excluded(f):
            continue
        rel = str(f.relative_to(root_path))
        data = f.read_bytes()
        digest.update(rel.encode('utf-8') + b"\0" + data)
        listing.append({"path": rel, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    return {"root": str(root_path), "b2b16": digest.hexdigest(), "files": listing}

# ---------- CLI ----------

def _load_file(path: str) -> T.Any:
    """Load JSON or YAML config file from given path."""
    p = _pl.Path(path)
    data = p.read_text(encoding='utf-8')
    try:
        return json.loads(data)
    except Exception:
        if yaml is not None:
            return yaml.safe_load(data)
        raise


def _parse_args(argv: T.Optional[T.List[str]] = None) -> argparse.Namespace:
    """Parse CLI arguments for config hashing."""
    ap = argparse.ArgumentParser(
        prog="config_hashing",
        description="Deterministic hashing for configs with ignore/redact rules and env/git/code fingerprints.",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    # ... arguments unchanged ...
    return ap.parse_args(argv)


def _coerce_salt(s: T.Optional[str]) -> bytes:
    """Convert salt string/env to raw bytes (hex, base64, or utf-8)."""
    if not s:
        env = os.getenv("CONFIG_HASH_SALT")
        s = env
    if not s:
        return b""
    s = s.strip()
    try:
        return bytes.fromhex(s)
    except Exception:
        try:
            return base64.b64decode(s, validate=True)
        except Exception:
            return s.encode('utf-8')


def _merge_dicts(dicts: T.List[dict]) -> dict:
    """Merge list of dicts recursively (later wins)."""
    out: dict = {}
    for d in dicts:
        out = _deep_merge(out, d)
    return out


def _deep_merge(a: T.Mapping, b: T.Mapping) -> dict:
    """Recursively merge dict b into dict a and return new dict."""
    out = dict(a)
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def main(argv: T.Optional[T.List[str]] = None) -> int:
    """CLI entry point for config_hashing; parse args, hash config, emit JSON."""
    ns = _parse_args(argv)
    cfgs: T.List[dict] = []
    for p in ns.inputs:
        obj = _load_file(p)
        if not isinstance(obj, dict):
            raise SystemExit(f"Input file {p!r} must contain a JSON/YAML object at root")
        cfgs.append(obj)
    merged = _merge_dicts(cfgs) if cfgs else {}
    salt = _coerce_salt(ns.salt)
    res = hash_config(
        merged,
        ignore=ns.ignore,
        redact=ns.redact,
        redact_mode=ns.redact_mode,
        salt=salt,
        algorithm=ns.algo,
        digest_size=ns.digest_size,
        namespace=ns.namespace,
        with_env=ns.with_env,
        with_git=ns.with_git,
        code_dir=ns.code_dir,
    )
    out = json.dumps(res.to_dict(), indent=2, ensure_ascii=False)
    if ns.output:
        _pl.Path(ns.output).write_text(out, encoding='utf-8')
    else:
        import logging
        logging.info(out)  # replaced print() with logging
    return 0

if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
