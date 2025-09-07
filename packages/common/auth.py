"""Auth helpers for FastAPI endpoints.

Provides:
- `User` Pydantic model for JWT subject
- `verify_jwt` to decode/validate RS256 JWTs
- `get_current_user` FastAPI dependency using HTTP Bearer auth
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from pydantic import BaseModel
from .config import get_settings

security = HTTPBearer(auto_error=False)


class User(BaseModel):
    """Authenticated user extracted from a validated JWT."""
    sub: str
    email: str | None = None
    roles: list[str] = []


def verify_jwt(token: str) -> User:
    """Decode and validate a JWT and return a `User`.

    Validates signature (RS256), audience, and expiration using settings.
    Raises HTTP 401 on any validation failure.

    Args:
        token: Bearer token string (JWT).

    Returns:
        User: Parsed user info from token claims.
    """
    s = get_settings()
    try:
        payload = jwt.decode(
            token,
            s.JWT_PUBLIC_KEY,
            algorithms=["RS256"],
            audience=s.OIDC_AUDIENCE,
            options={"verify_exp": True},
        )
        return User(
            sub=payload.get("sub"),
            email=payload.get("email"),
            roles=payload.get("roles", []),
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """FastAPI dependency to extract the current user from Authorization header.

    Args:
        creds: Parsed HTTP Bearer credentials injected by FastAPI.

    Returns:
        User: The authenticated user.

    Raises:
        HTTPException: 401 if credentials are missing or token is invalid.
    """
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing credentials",
        )
    return verify_jwt(creds.credentials)
