"""Canonical JSON, hashing, and atomic output primitives for AI 529."""

from __future__ import annotations

import hashlib
import json
import os
import re
import struct
from pathlib import Path
from typing import Any, Iterable

from errors import fail


SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
HASH_PROTOCOL = b"bus-simulator/illumination/bake-source/sha256-framing/v1"


def canonical_string_key(value: str) -> tuple[int, ...]:
    encoded = value.encode("utf-16-be", "surrogatepass")
    return tuple(int.from_bytes(encoded[index:index + 2], "big") for index in range(0, len(encoded), 2))


def canonical_json_bytes(value: Any) -> bytes:
    try:
        text = json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        fail("canonical_json_invalid", "Value cannot be represented as canonical JSON.", reason=str(error))
    return text.encode("utf-8")


def require_sha256(value: str, label: str) -> str:
    if not isinstance(value, str) or SHA256_PATTERN.fullmatch(value) is None:
        fail("sha256_invalid", f"{label} must be a lowercase SHA-256 digest.", label=label, actual=value)
    return value


def sha256_bytes(data: bytes | bytearray | memoryview) -> str:
    digest = hashlib.sha256()
    digest.update(data)
    return digest.hexdigest()


def framed_sha256(domain: str, parts: Iterable[bytes | bytearray | memoryview], byte_length: int) -> str:
    domain_bytes = domain.encode("utf-8")
    if not domain_bytes or len(domain_bytes) > 0xFFFFFFFF or byte_length < 0 or byte_length > 0xFFFFFFFF:
        fail("framed_hash_length_invalid", "Domain-separated hash length exceeds the V1 uint32 contract.", domain=domain, byteLength=byte_length)
    digest = hashlib.sha256()
    digest.update(HASH_PROTOCOL)
    digest.update(struct.pack("<II", len(domain_bytes), byte_length))
    digest.update(domain_bytes)
    consumed = 0
    for part in parts:
        digest.update(part)
        consumed += len(part)
    if consumed != byte_length:
        fail("framed_hash_length_mismatch", "Domain-separated hash input length did not match its declared frame.", domain=domain, expected=byte_length, actual=consumed)
    return digest.hexdigest()


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".partial")
    if temporary.exists():
        temporary.unlink()
    try:
        with temporary.open("xb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except Exception:
        if temporary.exists():
            temporary.unlink()
        raise


def atomic_write_json(path: Path, value: Any) -> bytes:
    data = canonical_json_bytes(value)
    atomic_write_bytes(path, data)
    return data
