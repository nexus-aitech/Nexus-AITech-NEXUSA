"""Repository layer for Content service.

Provides async database initialization and CRUD helpers for Lesson entities.
"""

import json
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select
from .models import Base, Module, Lesson
from packages.common.config import get_settings

s = get_settings()
engine = create_async_engine(s.POSTGRES_DSN, echo=False)
Session = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    """Create database schema if it doesn't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def add_lesson(
    session: AsyncSession,
    module_id: int,
    title: str,
    body_md: str,
    skills: list[str],
    version: str = "v1",
    lang: str = "fa",
) -> Lesson:
    """Insert a new lesson row and return the created Lesson.

    Args:
        session: Active AsyncSession.
        module_id: Parent module id.
        title: Lesson title.
        body_md: Markdown content.
        skills: List of skill tags.
        version: Content version string.
        lang: ISO language code.

    Returns:
        The freshly persisted Lesson instance.
    """
    lesson = Lesson(
        module_id=module_id,
        title=title,
        body_md=body_md,
        skills=json.dumps(skills),
        version=version,
        lang=lang,
    )
    session.add(lesson)
    await session.commit()
    await session.refresh(lesson)
    return lesson


async def get_lesson(session: AsyncSession, lesson_id: int) -> Lesson | None:
    """Fetch a single lesson by id.

    Returns:
        The Lesson if found; otherwise None.
    """
    res = await session.execute(select(Lesson).where(Lesson.id == lesson_id))
    return res.scalar_one_or_none()


async def list_lessons(session: AsyncSession, module_id: int | None = None) -> list[Lesson]:
    """List lessons, optionally filtered by module.

    Args:
        session: Active AsyncSession.
        module_id: If provided, restrict results to this module.

    Returns:
        A list of Lesson rows.
    """
    q = select(Lesson) if module_id is None else select(Lesson).where(Lesson.module_id == module_id)
    res = await session.execute(q)
    return list(res.scalars())
