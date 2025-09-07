"""SQLAlchemy models for the Content service.

Defines two tables:
- Module: A course/module container with metadata.
- Lesson: Individual lessons that belong to a module.
"""

from sqlalchemy.orm import declarative_base, relationship, Mapped, mapped_column
from sqlalchemy import Integer, String, Text, ForeignKey

Base = declarative_base()


class Module(Base):
    """Course/module entity that groups multiple lessons under a single title.

    Attributes:
        id: Primary key.
        title: Human-readable module title.
        description: Optional long description in plain text/Markdown.
        version: Schema/content version string (e.g., "v1").
        lang: ISO language code (e.g., "fa").
        lessons: Relationship to associated Lesson rows.
    """

    __tablename__ = "modules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[str] = mapped_column(String(16), default="v1")
    lang: Mapped[str] = mapped_column(String(8), default="fa")
    lessons = relationship("Lesson", back_populates="module")


class Lesson(Base):
    """Lesson entity that belongs to a Module.

    Attributes:
        id: Primary key.
        module_id: Foreign key referencing Module.id.
        title: Lesson title.
        body_md: Lesson content in Markdown.
        skills: JSON-encoded list of skill tags (stored as text).
        version: Schema/content version string.
        lang: ISO language code.
        module: Backreference to the parent Module.
    """

    __tablename__ = "lessons"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id"))
    title: Mapped[str] = mapped_column(String(200))
    body_md: Mapped[str] = mapped_column(Text)
    skills: Mapped[str] = mapped_column(Text, default="[]")  # JSON encoded list
    version: Mapped[str] = mapped_column(String(16), default="v1")
    lang: Mapped[str] = mapped_column(String(8), default="fa")
    module = relationship("Module", back_populates="lessons")
