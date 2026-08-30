"""Stable failures emitted by the Blender illumination compiler."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CompilerFailure(Exception):
    code: str
    message: str
    context: dict[str, Any]

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"

    def to_record(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "context": self.context,
            "message": self.message,
        }


def fail(code: str, message: str, **context: Any) -> None:
    raise CompilerFailure(code, message, context)
