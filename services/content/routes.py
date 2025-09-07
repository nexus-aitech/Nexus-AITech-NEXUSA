# services/content/routes.py
from fastapi import APIRouter

router = APIRouter()

@router.get("/ping", tags=["content"])
def ping():
    return {"ok": True}
