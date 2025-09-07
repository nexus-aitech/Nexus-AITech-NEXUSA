"""RBAC utilities for FastAPI dependencies.

Provides a `require_roles(*roles)` factory that returns a dependency ensuring
the authenticated user (from `get_current_user`) possesses all required roles.
"""

from typing import Callable
from fastapi import Depends, HTTPException, status
from .auth import get_current_user, User


def require_roles(*required: str) -> Callable[[User], User]:
    """Create a dependency that enforces presence of given roles.

    Args:
        required: One or more role names the user must have.

    Returns:
        A FastAPI dependency callable that:
          - receives the current `User` (via `Depends(get_current_user)`)
          - raises 403 if the user's roles do not include all `required`
          - otherwise returns the `User`
    """
    def wrapper(user: User = Depends(get_current_user)) -> User:
        """Validate the current user's roles against the required set."""
        if not set(required).issubset(set(user.roles)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role",
            )
        return user

    return wrapper
