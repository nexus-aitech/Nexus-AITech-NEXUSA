"""Lightweight Kubernetes operator shim for the Lab service.

Provides in-memory implementations to launch a lab and query its status.
Replace with real Kubernetes integration when wiring to the cluster.
"""

from packages.schemas.lab import LabLaunch, LabStatus
import uuid

# Placeholder in-memory registry
LABS: dict[str, LabStatus] = {}


def launch(lab: LabLaunch) -> LabStatus:
    """Launch a new lab environment.

    Args:
        lab: Launch specification (image, resources, user, etc.).

    Returns:
        LabStatus: The created lab's status including its generated lab_id and URL.
    """
    lab_id = str(uuid.uuid4())
    status = LabStatus(lab_id=lab_id, status="running", url=f"https://labs.example.com/{lab_id}")
    LABS[lab_id] = status
    return status


def status(lab_id: str) -> LabStatus | None:
    """Get the current status for a lab.

    Args:
        lab_id: The unique lab identifier to look up.

    Returns:
        LabStatus if found; otherwise None.
    """
    return LABS.get(lab_id)
