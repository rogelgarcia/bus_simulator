"""Canonical JSON, hashing, and atomic output primitives for AI 529."""

from __future__ import annotations

import hashlib
import json
import math
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
        text = _canonical_json_text(value)
    except (TypeError, ValueError) as error:
        fail("canonical_json_invalid", "Value cannot be represented as canonical JSON.", reason=str(error))
    return text.encode("utf-8")


def _canonical_json_text(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return _ecmascript_number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, allow_nan=False)
    if isinstance(value, list):
        return "[" + ",".join(_canonical_json_text(entry) for entry in value) + "]"
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise TypeError("Canonical JSON object keys must be strings.")
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False, allow_nan=False)
            + ":"
            + _canonical_json_text(value[key])
            for key in sorted(value, key=canonical_string_key)
        ) + "}"
    raise TypeError(f"Unsupported canonical JSON type: {type(value).__name__}")


def _ecmascript_number(value: float) -> str:
    if not math.isfinite(value):
        raise ValueError("Canonical JSON numbers must be finite.")
    if value == 0.0:
        return "0"
    negative = value < 0.0
    text = repr(-value if negative else value).lower()
    if "e" in text:
        mantissa, exponent_text = text.split("e", 1)
        exponent = int(exponent_text)
    else:
        mantissa = text
        exponent = 0
    if "." in mantissa:
        integer, fraction = mantissa.split(".", 1)
    else:
        integer, fraction = mantissa, ""
    digits = integer + fraction
    point = len(integer) + exponent
    while len(digits) > 1 and digits[0] == "0":
        digits = digits[1:]
        point -= 1
    while len(digits) > 1 and digits[-1] == "0":
        digits = digits[:-1]
    scientific_exponent = point - 1
    if -6 <= scientific_exponent < 21:
        if point <= 0:
            encoded = "0." + "0" * (-point) + digits
        elif point >= len(digits):
            encoded = digits + "0" * (point - len(digits))
        else:
            encoded = digits[:point] + "." + digits[point:]
    else:
        encoded = digits[0]
        if len(digits) > 1:
            encoded += "." + digits[1:]
        encoded += "e"
        if scientific_exponent >= 0:
            encoded += "+"
        encoded += str(scientific_exponent)
    return "-" + encoded if negative else encoded


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
