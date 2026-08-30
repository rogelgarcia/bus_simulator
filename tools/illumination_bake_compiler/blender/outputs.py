"""Lossless EXR and canonical decoded float32 output handling."""

from __future__ import annotations

import math
import os
import struct
from pathlib import Path
from typing import Any

from canonical import atomic_write_bytes, sha256_bytes
from errors import fail


def capture_image_output(image: Any, scene: Any, output_root: Path, job_id: str, channel_descriptor: dict[str, Any], output_contract: dict[str, Any]) -> dict[str, Any]:
    width, height = int(image.size[0]), int(image.size[1])
    if width <= 0 or height <= 0:
        fail("image_dimensions_invalid", "A bake output has no positive pixel dimensions.", jobId=job_id)
    expected_components = width * height * 4
    values = [0.0] * expected_components
    image.pixels.foreach_get(values)
    canonical = _canonical_f32le(values, job_id)
    canonical_relative = Path(output_contract["canonicalDirectory"]) / f"{job_id}.rgba.f32le"
    raw_relative = Path(output_contract["rawDirectory"]) / f"{job_id}.raw.exr"
    canonical_path = output_root / canonical_relative
    raw_path = output_root / raw_relative
    atomic_write_bytes(canonical_path, canonical)
    _save_exr_atomic(image, scene, raw_path)
    raw_bytes = raw_path.read_bytes()
    alpha_values = values[3::4]
    return {
        "canonicalDecoded": {
            "byteLength": len(canonical),
            "encoding": "little_endian_ieee754_float32_rgba_tightly_packed",
            "path": canonical_relative.as_posix(),
            "sha256": sha256_bytes(canonical),
        },
        "channelDescriptor": channel_descriptor,
        "dimensions": {"channels": 4, "height": height, "width": width},
        "jobId": job_id,
        "pixelStatistics": {
            "alphaNonzeroCount": sum(1 for value in alpha_values if value != 0.0),
            "alphaZeroCount": sum(1 for value in alpha_values if value == 0.0),
            "componentMaximumF32": _float32_hex(max(values)),
            "componentMinimumF32": _float32_hex(min(values)),
        },
        "rawContainer": {
            "byteLength": len(raw_bytes),
            "codec": "openexr_zip_lossless",
            "path": raw_relative.as_posix(),
            "precision": "float32_per_channel",
            "sha256": sha256_bytes(raw_bytes),
        },
        "rowOrder": "blender_image_buffer_lower_left_origin_rows",
    }


def read_canonical_f32le(path: Path) -> tuple[float, ...]:
    data = path.read_bytes()
    if len(data) % 4:
        fail("canonical_pixel_length_invalid", "A canonical pixel stream is not a multiple of float32.", byteLength=len(data))
    return struct.unpack("<" + "f" * (len(data) // 4), data)


def _canonical_f32le(values: list[float], job_id: str) -> bytes:
    output = bytearray(len(values) * 4)
    for index, value in enumerate(values):
        number = float(value)
        if not math.isfinite(number):
            fail("output_pixel_non_finite", "A bake output contains a non-finite component.", jobId=job_id, componentIndex=index)
        if number == 0.0:
            number = 0.0
        struct.pack_into("<f", output, index * 4, number)
    return bytes(output)


def _save_exr_atomic(image: Any, scene: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.stem + ".partial.exr")
    if temporary.exists():
        temporary.unlink()
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.exr_codec = "ZIP"
    try:
        image.save_render(str(temporary), scene=scene)
        if not temporary.exists() or temporary.stat().st_size <= 0:
            fail("exr_output_missing", "Blender did not create the declared OpenEXR output.", fileName=path.name)
        os.replace(temporary, path)
    except Exception:
        if temporary.exists():
            temporary.unlink()
        raise


def _float32_hex(value: float) -> str:
    return struct.pack("<f", float(value)).hex()
