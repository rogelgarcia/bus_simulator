"""Canonical self-describing intermediate manifests and compile receipts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from canonical import atomic_write_json, sha256_bytes


INTERMEDIATE_SCHEMA = "bus-sim-illumination-blender-intermediate-manifest-v1"
RECEIPT_SCHEMA = "bus-sim-illumination-blender-compile-receipt-v1"


def write_intermediate_manifests(output_root: Path, common: dict[str, Any], outputs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for output in sorted(outputs, key=lambda item: item["jobId"]):
        relative = Path("channels") / output["jobId"] / f"{output['jobId']}.manifest.json"
        manifest = {
            **common,
            "output": output,
            "schema": INTERMEDIATE_SCHEMA,
        }
        data = atomic_write_json(output_root / relative, manifest)
        records.append({
            "byteLength": len(data),
            "jobId": output["jobId"],
            "path": relative.as_posix(),
            "sha256": sha256_bytes(data),
        })
    return records


def write_compile_receipt(output_root: Path, common: dict[str, Any], outputs: list[dict[str, Any]], intermediate_manifests: list[dict[str, Any]], checks: dict[str, Any], reconstruction: dict[str, Any] | None) -> dict[str, Any]:
    receipt = {
        **common,
        "checks": checks,
        "intermediateManifests": intermediate_manifests,
        "outputs": sorted(outputs, key=lambda item: item["jobId"]),
        "reconstruction": reconstruction,
        "schema": RECEIPT_SCHEMA,
        "status": "complete",
    }
    path = output_root / "compile_receipt.json"
    data = atomic_write_json(path, receipt)
    return {
        "byteLength": len(data),
        "path": "compile_receipt.json",
        "sha256": sha256_bytes(data),
    }
