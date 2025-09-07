# Module implemented per architecture; see README for usage.
"""
orchestration/service_mesh_hooks.py

Resilience & mesh-adjacent utilities:
- Health checks (HTTP/TCP)
- Retries with exponential backoff + jitter
- Circuit breaker (half-open after cooldown)
- mTLS placeholders (cert/key/ca handling knobs)

These primitives are framework-agnostic; wire them into FastAPI, gRPC,
or your service mesh sidecars (Istio/Linkerd) as needed.
"""

from __future__ import annotations

import random
import socket
import ssl
import time
from dataclasses import dataclass, field
from typing import Callable, Optional, TypeVar, ParamSpec

import urllib.request

P = ParamSpec("P")
R = TypeVar("R")


def http_healthcheck(url: str, timeout: float = 2.0) -> bool:
    """Perform a simple HTTP GET and return True on 2xx, otherwise False.

    Args:
        url: Target URL to probe.
        timeout: Request timeout in seconds.

    Returns:
        True if status code is 2xx; False on non-2xx or any exception.
    """
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


def tcp_healthcheck(host: str, port: int, timeout: float = 1.0) -> bool:
    """Open a TCP connection to host:port.

    Args:
        host: Remote hostname or IP.
        port: Remote TCP port.
        timeout: Socket timeout in seconds.

    Returns:
        True if connection succeeds; False on any error.
    """
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


@dataclass
class RetryConfig:
    """Configuration for the retry decorator with exponential backoff.

    Attributes:
        attempts: Maximum number of attempts (including the first try).
        base_delay: Initial delay between retries (seconds).
        max_delay: Upper bound for delay (seconds).
        jitter: Proportional jitter (0..1) added/subtracted to delay.
    """
    attempts: int = 3
    base_delay: float = 0.05  # seconds
    max_delay: float = 1.0
    jitter: float = 0.25  # 0..1 proportion added/subtracted


def retry(config: RetryConfig) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Retry a function on exception with exponential backoff + jitter.

    Args:
        config: RetryConfig parameters.

    Returns:
        A decorator that wraps the function with retry logic.
    """
    def deco(fn: Callable[P, R]) -> Callable[P, R]:
        """Decorator applying retry policy to `fn`."""
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            """Invoke `fn` with retries according to `config`."""
            delay = config.base_delay
            last_exc: Optional[Exception] = None
            for _ in range(1, config.attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except Exception as e:
                    last_exc = e
                    # full jitter around delay
                    j = delay * config.jitter
                    sleep = max(0.0, delay + random.uniform(-j, j))
                    time.sleep(sleep)
                    delay = min(config.max_delay, delay * 2.0)
            # If all attempts failed, re-raise the last exception
            if last_exc is not None:
                raise last_exc
            # Fallback (should not happen)
            raise RuntimeError("Retry wrapper failed without captured exception")
        return wrapper
    return deco


@dataclass
class CircuitBreaker:
    """Simple circuit breaker with CLOSED/OPEN/HALF_OPEN states.

    Attributes:
        failure_threshold: Failures to trigger OPEN state.
        recovery_timeout: Seconds before allowing a HALF_OPEN probe.
    """
    failure_threshold: int = 5
    recovery_timeout: float = 5.0  # seconds
    _failures: int = field(default=0, init=False)
    _state: str = field(default="CLOSED", init=False)  # CLOSED | OPEN | HALF_OPEN
    _opened_at: float = field(default=0.0, init=False)

    def allow(self) -> bool:
        """Return True if calls are allowed in the current state.

        In OPEN state, only allow after `recovery_timeout` to transition to HALF_OPEN.
        """
        if self._state == "OPEN":
            if (time.time() - self._opened_at) >= self.recovery_timeout:
                self._state = "HALF_OPEN"
                return True
            return False
        return True

    def record_success(self) -> None:
        """Record a successful call and move to CLOSED state."""
        self._failures = 0
        self._state = "CLOSED"

    def record_failure(self) -> None:
        """Record a failed call and potentially OPEN the circuit."""
        self._failures += 1
        if self._failures >= self.failure_threshold:
            self._state = "OPEN"
            self._opened_at = time.time()

    def wrap(self, fn: Callable[P, R]) -> Callable[P, R]:
        """Wrap a callable with circuit-breaker checks."""
        def wrapped(*args: P.args, **kwargs: P.kwargs) -> R:
            """Execute `fn` if allowed; record success/failure accordingly."""
            if not self.allow():
                raise RuntimeError("CircuitBreaker OPEN")
            try:
                res = fn(*args, **kwargs)
            except Exception:
                self.record_failure()
                raise
            else:
                self.record_success()
                return res
        return wrapped


def create_ssl_context(
    ca_cert: Optional[str] = None,
    client_cert: Optional[str] = None,
    client_key: Optional[str] = None,
    check_hostname: bool = True,
) -> ssl.SSLContext:
    """
    mTLS placeholder. Provide CA, client cert/key paths to enforce mutual TLS.

    Args:
        ca_cert: Path to CA certificate bundle (PEM). If None, verification is disabled.
        client_cert: Path to client certificate (PEM).
        client_key: Path to client private key (PEM).
        check_hostname: Whether to verify server hostname against certificate.

    Returns:
        Configured SSLContext suitable for mTLS-aware clients.
    """
    ctx = ssl.create_default_context(
        purpose=ssl.Purpose.SERVER_AUTH, cafile=ca_cert if ca_cert else None
    )
    if client_cert and client_key:
        ctx.load_cert_chain(certfile=client_cert, keyfile=client_key)
    ctx.check_hostname = check_hostname
    ctx.verify_mode = ssl.CERT_REQUIRED if ca_cert else ssl.CERT_NONE
    return ctx
