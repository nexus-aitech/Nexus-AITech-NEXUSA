"""FastAPI app for the NEXUSA Lab service.

Exposes endpoints to launch a lab environment and query its status.
"""

from fastapi import FastAPI, HTTPException
from packages.schemas.lab import LabLaunch, LabStatus
from .k8s_operator import launch, status as lab_status

app = FastAPI(title="NEXUSA Lab Service", version="1.0.0")


@app.post("/lab/launch", response_model=LabStatus)
def launch_lab(payload: LabLaunch) -> LabStatus:
    """Launch a lab environment based on the provided spec.

    Args:
        payload: Launch specification.

    Returns:
        The created lab's status DTO.
    """
    return launch(payload)


@app.get("/lab/{lab_id}", response_model=LabStatus)
def get_status(lab_id: str) -> LabStatus:
    """Get the current status of a lab by its identifier.

    Args:
        lab_id: The unique lab identifier.

    Returns:
        The lab status DTO.

    Raises:
        HTTPException: 404 if the lab is not found.
    """
    s = lab_status(lab_id)
    if not s:
        raise HTTPException(404, "not found")
    return s
