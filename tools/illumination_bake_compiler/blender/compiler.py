"""Headless Blender 5.2.1 entry point for deterministic AI 529 proof compilation."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from bsib import open_verified_package, validate_resolved_city_contract
from canonical import canonical_json_bytes, require_sha256, sha256_bytes
from errors import CompilerFailure, fail
from fixtures import JOB_ORDER, run_proof_jobs
from receipts import write_compile_receipt, write_intermediate_manifests
from reconstruct import reconstruct_resolved_city
from scene import BakeProfile, assert_blender_runtime, create_clean_scene


PINNED_EXECUTABLE_SHA256 = "8f7a131ad8bc148edc218b334f07d92a57f5a357fa66d913b290537fd8353c06"


def main() -> None:
    arguments = _parse_arguments()
    signature = assert_blender_runtime(arguments.archive_sha256)
    if arguments.executable_sha256 != PINNED_EXECUTABLE_SHA256:
        fail("blender_executable_hash_mismatch", "The declared executable digest is not the pinned official Blender executable.", expected=PINNED_EXECUTABLE_SHA256, actual=arguments.executable_sha256)
    profile_bytes = _read_required_file(arguments.profile, "profile")
    if sha256_bytes(profile_bytes) != arguments.profile_sha256:
        fail("compiler_profile_hash_mismatch", "The compiler profile changed after orchestration validation.", expected=arguments.profile_sha256, actual=sha256_bytes(profile_bytes))
    try:
        profile_json = json.loads(profile_bytes.decode("utf-8", "strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail("compiler_profile_json_invalid", "The compiler profile is not strict UTF-8 JSON.", reason=str(error))
    profile = BakeProfile.from_mapping(profile_json)
    actual_script_sha256, script_inventory = _compiler_script_digest(Path(__file__).resolve().parent)
    if actual_script_sha256 != arguments.compiler_script_sha256:
        fail("compiler_script_hash_mismatch", "The Blender compiler scripts changed after orchestration validation.", expected=arguments.compiler_script_sha256, actual=actual_script_sha256)
    configuration = {
        "compilerScriptSha256": actual_script_sha256,
        "profileSha256": arguments.profile_sha256,
        "toolchainSha256": arguments.toolchain_sha256,
    }
    if arguments.mode == "probe":
        probe = {
            "compiler": {**signature, "executableSha256": arguments.executable_sha256},
            "configuration": configuration,
            "mode": "probe",
            "profileId": profile.data["id"],
            "schema": "bus-sim-illumination-blender-probe-v1",
            "scriptInventory": script_inventory,
            "status": "verified",
        }
        print("AI529_PROBE_JSON=" + canonical_json_bytes(probe).decode("utf-8"), flush=True)
        return
    output_root = arguments.output.resolve()
    if (output_root / "compile_receipt.json").exists():
        fail("compile_output_already_complete", "The staging directory already contains a compile receipt and cannot be overwritten.", fileName="compile_receipt.json")
    try:
        output_root.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        fail("compile_output_unwritable", "The staging output directory could not be created.", reason=str(error))
    with open_verified_package(arguments.input, arguments.package_raw_sha256) as package:
        validation = validate_resolved_city_contract(package, arguments.archive_sha256)
        scene, applied_profile = create_clean_scene(profile)
        outputs, checks = run_proof_jobs(scene, profile, output_root, arguments.jobs)
        reconstruction: dict[str, Any] = {
            "inventory": validation,
            "mode": "validate",
            "stableIdOrdering": "canonical_ascending",
            "stableIdsPreservedAsCustomMetadata": True,
        }
        if arguments.reconstruction_mode == "full":
            reconstructed = reconstruct_resolved_city(package, output_root, "all")
            reconstruction = {
                **reconstructed,
                "inventory": validation,
                "mode": "full",
                "stableIdsPreservedAsCustomMetadata": True,
            }
        hashes = package.manifest["hashes"]
        channel_sources = {entry["id"]: entry["sha256"] for entry in hashes["channelSources"]}
        common = {
            "compiler": {
                **signature,
                "executableSha256": arguments.executable_sha256,
                "fixedThreadCount": profile.thread_count,
            },
            "configuration": configuration,
            "input": {
                "channelSourceSha256": channel_sources,
                "finalFileDomainSha256": package.final_file_sha256,
                "geometrySha256": hashes["geometry"],
                "packageRawSha256": package.raw_sha256,
                "resolvedSourceSha256": hashes["resolvedSource"],
                "usedMaterialsSha256": hashes["usedMaterials"],
            },
            "profile": {
                "applied": applied_profile,
                "id": profile.data["id"],
                "rawSha256": arguments.profile_sha256,
            },
        }
        intermediate_manifests = write_intermediate_manifests(output_root, common, outputs)
        receipt = write_compile_receipt(output_root, common, outputs, intermediate_manifests, checks, reconstruction)
    print("AI529_COMPILE_RECEIPT=" + canonical_json_bytes(receipt).decode("utf-8"), flush=True)


def _parse_arguments() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(prog="compiler.py", allow_abbrev=False)
    parser.add_argument("--mode", choices=("compile", "probe"), default="compile")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--archive-sha256", type=_digest, required=True)
    parser.add_argument("--executable-sha256", type=_digest, required=True)
    parser.add_argument("--toolchain-sha256", type=_digest, required=True)
    parser.add_argument("--profile-sha256", type=_digest, required=True)
    parser.add_argument("--compiler-script-sha256", type=_digest, required=True)
    parser.add_argument("--package-raw-sha256", type=_digest, required=True)
    parser.add_argument("--reconstruction-mode", choices=("validate", "full"), required=True)
    parser.add_argument("--jobs", type=_jobs, required=True)
    return parser.parse_args(raw)


def _digest(value: str) -> str:
    try:
        return require_sha256(value, "command-line digest")
    except CompilerFailure as error:
        raise argparse.ArgumentTypeError(str(error)) from error


def _jobs(value: str) -> tuple[str, ...]:
    jobs = tuple(part.strip() for part in value.split(",") if part.strip())
    if not jobs or len(set(jobs)) != len(jobs) or any(job not in JOB_ORDER for job in jobs):
        raise argparse.ArgumentTypeError("jobs must be a unique comma-separated subset of depth,direct,indirect,ao")
    return jobs


def _read_required_file(path: Path, label: str) -> bytes:
    try:
        return path.resolve(strict=True).read_bytes()
    except OSError as error:
        fail("compiler_file_unreadable", "A required compiler input file could not be read.", label=label, reason=str(error))


def _compiler_script_digest(directory: Path) -> tuple[str, list[dict[str, Any]]]:
    inventory: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.py"), key=lambda item: item.name):
        data = path.read_bytes()
        inventory.append({
            "byteLength": len(data),
            "path": path.name,
            "sha256": sha256_bytes(data),
        })
    if not inventory or "compiler.py" not in {entry["path"] for entry in inventory}:
        fail("compiler_script_inventory_invalid", "The compiler script inventory is incomplete.")
    return sha256_bytes(canonical_json_bytes(inventory)), inventory


if __name__ == "__main__":
    try:
        main()
    except CompilerFailure as error:
        print("AI529_ERROR_JSON=" + canonical_json_bytes(error.to_record()).decode("utf-8"), file=sys.stderr, flush=True)
        raise
