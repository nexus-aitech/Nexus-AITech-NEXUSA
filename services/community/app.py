# services/community/app.py
"""FastAPI app for NEXUSA Community Service.

Endpoints:
- POST /community/post: ایجاد پست پس از عبور از ماژول ممیزی محتوا (moderation)
- GET  /community/post/{post_id}: بازیابی پست با شناسه
"""

from fastapi import FastAPI, HTTPException
from packages.schemas.community import Post, ModerationVerdict
from .moderation import moderate

app = FastAPI(title="NEXUSA Community Service", version="1.0.0")
POSTS: dict[str, Post] = {}

@app.post("/community/post", response_model=Post)
def create_post(p: Post) -> Post:
    """Create a post after moderation; raises 400 if moderation fails."""
    v: ModerationVerdict = moderate(p.body)
    if not v.ok:
        raise HTTPException(400, f"Rejected: {', '.join(v.reasons)}")
    POSTS[p.id] = p
    return p

@app.get("/community/post/{post_id}", response_model=Post)
def read_post(post_id: str) -> Post:
    """Return the post with `post_id`; raises 404 if not found."""
    p = POSTS.get(post_id)
    if not p:
        raise HTTPException(404, "not found")
    return p
