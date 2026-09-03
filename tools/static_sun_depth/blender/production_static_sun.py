"""Pinned Blender 5.2.1 CPU renderer for production AI 531 sun-depth interiors."""

from __future__ import annotations

import argparse
import array
import json
import math
import struct
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
AI529_DIRECTORY = SCRIPT_DIRECTORY.parent.parent / "illumination_bake_compiler" / "blender"
if str(AI529_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(AI529_DIRECTORY))

from bsib import open_verified_package, validate_resolved_city_contract
from canonical import atomic_write_bytes, canonical_json_bytes, require_sha256, sha256_bytes
from compiler import PINNED_EXECUTABLE_SHA256
from errors import CompilerFailure, fail
from reconstruct import reconstruct_resolved_city
from scene import BakeProfile, assert_blender_runtime, configure_camera_determinism, create_clean_scene


REQUEST_SCHEMA = "ai531-static-sun-production-request-v4"
RECEIPT_SCHEMA = "ai531-static-sun-production-render-receipt-v5"
DIAGNOSTIC_RECEIPT_SCHEMA = "ai531-static-sun-depth-precision-diagnostic-receipt-v1"
NATIVE_CUTOUT_FIELD_RECEIPT_SCHEMA = "ai531-production-alpha-cutout-native-field-receipt-v2"
NATIVE_CUTOUT_FIELD_SESSION_SCHEMA = "ai531-production-alpha-cutout-native-field-session-v2"
NATIVE_CUTOUT_FIELD_METHOD = "three-r183-production-lattice-mixed-foliage-depth24-native-readback-v2"
NATIVE_TEXTURE_GRAD_FIELD_RECEIPT_SCHEMA = "ai531-production-alpha-cutout-native-field-receipt-v3"
NATIVE_TEXTURE_GRAD_FIELD_SESSION_SCHEMA = "ai531-production-alpha-cutout-texture-grad-field-session-v3"
NATIVE_TEXTURE_GRAD_FIELD_METHOD = "headless-blender-full-lattice-candidates-three-r183-native-texture-grad-v3"
NATIVE_IMPLICIT_GRADIENT_FIELD_RECEIPT_SCHEMA = "ai531-production-alpha-cutout-native-field-receipt-v4"
NATIVE_IMPLICIT_GRADIENT_FIELD_SESSION_SCHEMA = "ai531-production-alpha-cutout-implicit-gradient-field-session-v4"
NATIVE_IMPLICIT_GRADIENT_FIELD_METHOD = "headless-blender-full-lattice-candidates-three-r183-native-implicit-gradient-v4"
NATIVE_COMPOSED_FIELD_V5_RECEIPT_SCHEMA = "ai531-production-alpha-cutout-native-field-receipt-v5"
NATIVE_COMPOSED_FIELD_V5_SESSION_SCHEMA = "ai531-production-alpha-cutout-composed-field-session-v5"
NATIVE_COMPOSED_FIELD_V5_METHOD = "authenticated-direct-depth24-texture-grad-minimum-union-v5"
NATIVE_COMPOSED_FIELD_RECEIPT_SCHEMA = "ai531-production-alpha-cutout-native-field-receipt-v6"
NATIVE_COMPOSED_FIELD_SESSION_SCHEMA = "ai531-production-alpha-cutout-composed-field-session-v6"
NATIVE_COMPOSED_FIELD_METHOD = "authenticated-direct-depth24-texture-grad-hole-fill-v6"
NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA = "ai531-production-alpha-cutout-native-field-receipt-v7"
NATIVE_CALIBRATED_FIELD_SESSION_SCHEMA = "ai531-production-alpha-cutout-calibrated-field-session-v7"
NATIVE_CALIBRATED_FIELD_METHOD = "authenticated-direct-preferred-hole-fill-minus-measured-bake-only-v7"
NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA = "ai531-production-alpha-cutout-native-field-receipt-v8"
NATIVE_EXACT_CALIBRATED_FIELD_SESSION_SCHEMA = "ai531-production-alpha-cutout-calibrated-field-session-v8"
NATIVE_EXACT_CALIBRATED_FIELD_METHOD = "authenticated-minimum-union-plus-measured-exact-corrections-v8"
NATIVE_REBASED_FIELD_RECEIPT_SCHEMA = "ai531-production-alpha-cutout-native-field-receipt-v9"
NATIVE_REBASED_FIELD_SESSION_SCHEMA = "ai531-production-alpha-cutout-rebased-field-session-v9"
NATIVE_REBASED_FIELD_METHOD = "authenticated-stable-direct-plus-historical-texture-grad-hole-restoration-v9"
NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA = "ai531-production-alpha-cutout-native-field-receipt-v10"
NATIVE_REBASED_CALIBRATED_FIELD_SESSION_SCHEMA = "ai531-production-alpha-cutout-rebased-calibrated-field-session-v10"
NATIVE_REBASED_CALIBRATED_FIELD_METHOD = "authenticated-stable-direct-historical-hole-restoration-minus-measured-bake-only-v10"
NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA = "ai531-production-alpha-cutout-native-field-receipt-v11"
NATIVE_RESIDUAL_FIELD_SESSION_SCHEMA = "ai531-production-static-shadow-residual-field-session-v11"
NATIVE_RESIDUAL_FIELD_METHOD = "authenticated-static-shadow-residual-live-depth-corrections-v11"
NATIVE_COMPOSED_FIELD_SCHEMAS = {
    NATIVE_COMPOSED_FIELD_V5_RECEIPT_SCHEMA,
    NATIVE_COMPOSED_FIELD_RECEIPT_SCHEMA,
    NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA,
    NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA,
    NATIVE_REBASED_FIELD_RECEIPT_SCHEMA,
    NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA,
    NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA,
}
NATIVE_CANDIDATE_FIELD_SCHEMAS = {
    NATIVE_TEXTURE_GRAD_FIELD_RECEIPT_SCHEMA,
    NATIVE_IMPLICIT_GRADIENT_FIELD_RECEIPT_SCHEMA,
}
NATIVE_FOLIAGE_COVERAGE = "all-visible-material-groups-of-authenticated-cutout-meshes-v1"
CHANNEL_ID = "static_sun_depth"
OUTPUT_ENCODINGS = ("rg8", "rgba8_rgb24a", "rgba_f32le")
DIAGNOSTIC_LIGHTING_PROFILE_ID = "ai527.sun.az135.el08"
MAX_LAYER_COUNT = 256
MAX_PRODUCTION_PAYLOAD_BYTES = 536_870_912
DEPTH_MAX_CODE = 65_534
DEPTH_EMPTY_CODE = 65_535
DIAGNOSTIC_DEPTH_MAX_CODE = 16_777_215
ALPHA_BINARY_EPSILON = 1e-6
# Cycles exposes the Z pass through float32 image storage while the independent
# BVH truth path retains Python precision.  Full certification grids measured
# at most 2.685547 mm of same-polygon drift with zero occupancy mismatches.
# Keep a fixed 5 mm sub-quantization equivalence cap: it is 12% of the 41.5 mm
# texel and remains below the smallest canonical RG8 half-unit (5.534159 mm).
BVH_DEPTH_EPSILON_METERS = 5e-3
SOURCE_SHADOW_CAPABILITY_ID = "three-r183-single-high-effective-16384-v1"
SOURCE_SHADOW_MAP_SIZE_TEXELS = [16384, 16384]
SOURCE_SHADOW_MAP_WORLD_EXTENT_METERS = [680, 680]
SOURCE_SHADOW_FILTER_RADIUS_TEXELS = 1.5
SOURCE_SHADOW_FILTER_WORLD_RADIUS_METERS = 0.062255859375
EXACT_TEXEL_SIZE_METERS = 680 / 16384
PRODUCTION_INTERIOR_PIXELS = [1870, 1821]
PRODUCTION_TILE_SIZE_METERS = [
    PRODUCTION_INTERIOR_PIXELS[0] * EXACT_TEXEL_SIZE_METERS,
    PRODUCTION_INTERIOR_PIXELS[1] * EXACT_TEXEL_SIZE_METERS,
]
PRODUCTION_PHASE_POLICY = "absolute-stable-basis-texel-edge-lattice-v1"
THREE_FRONT_SIDE = 0
THREE_BACK_SIDE = 1
THREE_DOUBLE_SIDE = 2
CASTER_SIDEDNESS = {
    "model": "three-r183-effective-shadow-side-v1",
    "twoSidedCasting": True,
    "preserveMaterialFlagSemantics": "material-userdata-preserveShadowSide-or-isFoliage-v1",
}


def main() -> None:
    arguments = _parse_arguments()
    signature = assert_blender_runtime(arguments.archive_sha256)
    if arguments.executable_sha256 != PINNED_EXECUTABLE_SHA256:
        fail(
            "production_blender_executable_hash_mismatch",
            "The production renderer requires the pinned official Blender executable.",
            expected=PINNED_EXECUTABLE_SHA256,
            actual=arguments.executable_sha256,
        )
    renderer_bytes = Path(__file__).resolve().read_bytes()
    renderer_sha256 = sha256_bytes(renderer_bytes)
    if renderer_sha256 != arguments.renderer_script_sha256:
        fail(
            "production_renderer_script_hash_mismatch",
            "The production renderer changed after orchestration validation.",
            expected=arguments.renderer_script_sha256,
            actual=renderer_sha256,
        )
    ai529_sha256, ai529_inventory = _script_inventory(AI529_DIRECTORY)
    if ai529_sha256 != arguments.ai529_script_sha256:
        fail(
            "production_ai529_script_hash_mismatch",
            "The reused AI 529 Blender module inventory changed after orchestration validation.",
            expected=arguments.ai529_script_sha256,
            actual=ai529_sha256,
        )
    profile_bytes = _read_required_file(arguments.profile, "profile")
    if sha256_bytes(profile_bytes) != arguments.profile_sha256:
        fail(
            "production_profile_hash_mismatch",
            "The deterministic Cycles profile changed after orchestration validation.",
            expected=arguments.profile_sha256,
            actual=sha256_bytes(profile_bytes),
        )
    request_bytes = _read_required_file(arguments.request, "request")
    if sha256_bytes(request_bytes) != arguments.request_sha256:
        fail(
            "production_request_hash_mismatch",
            "The production sun request changed after orchestration validation.",
            expected=arguments.request_sha256,
            actual=sha256_bytes(request_bytes),
        )
    profile = BakeProfile.from_mapping(_parse_json(profile_bytes, "profile"))
    request = _validate_request(_parse_json(request_bytes, "request"))
    alpha_parity_artifact = None
    if (arguments.alpha_parity_artifact is None) != (
        arguments.alpha_parity_artifact_sha256 is None
    ):
        fail(
            "production_alpha_parity_artifact_arguments_incomplete",
            "The production alpha parity artifact path and digest must be supplied together.",
        )
    if arguments.alpha_parity_artifact is not None:
        alpha_parity_bytes = _read_required_file(
            arguments.alpha_parity_artifact,
            "alpha parity artifact",
        )
        actual_alpha_parity_sha256 = sha256_bytes(alpha_parity_bytes)
        if actual_alpha_parity_sha256 != arguments.alpha_parity_artifact_sha256:
            fail(
                "production_alpha_parity_artifact_hash_mismatch",
                "The alpha parity artifact changed after orchestration validation.",
                expected=arguments.alpha_parity_artifact_sha256,
                actual=actual_alpha_parity_sha256,
            )
        alpha_parity_artifact = _parse_json(
            alpha_parity_bytes,
            "alpha parity artifact",
        )
        if canonical_json_bytes(alpha_parity_artifact) != alpha_parity_bytes:
            fail(
                "production_alpha_parity_artifact_noncanonical",
                "The alpha parity artifact must be canonical JSON.",
            )
    if (
        arguments.output_encoding == "rgba8_rgb24a"
        and request["lightingProfileId"] != DIAGNOSTIC_LIGHTING_PROFILE_ID
    ):
        fail(
            "production_depth_diagnostic_profile_forbidden",
            "RGB24+A is restricted to the one authorized depth-precision diagnostic profile.",
            actual=request["lightingProfileId"],
            expected=DIAGNOSTIC_LIGHTING_PROFILE_ID,
        )
    if arguments.output_encoding == "rg8" and arguments.native_cutout_field_receipt is None:
        fail(
            "production_native_cutout_field_required",
            "Production RG8 rendering requires an authenticated complete native Three alpha-cutout field.",
        )
    output_root = arguments.output.resolve()
    _create_empty_output_root(output_root)

    with open_verified_package(arguments.input, arguments.package_raw_sha256) as package:
        inventory = validate_resolved_city_contract(package, arguments.archive_sha256)
        _validate_requested_light(package.manifest, request)
        scene, applied_profile = create_clean_scene(profile)
        reconstruction = reconstruct_resolved_city(package, output_root, CHANNEL_ID)
        collection = _required_collection(reconstruction["collection"])
        basis = _derive_basis_and_bounds(
            collection,
            request,
            package.manifest,
            arguments.output_encoding,
        )
        camera_origin_depth = (
            basis["depth"]["minDepthMeters"]
            - float(profile.data["camera"]["clipStartMeters"])
        )
        native_cutout_field = _load_native_cutout_field(
            arguments,
            package,
            basis,
            request,
            profile,
            camera_origin_depth,
        )
        native_owned_mesh_instance_ids = (
            native_cutout_field["nativeOwnedMeshInstanceIds"]
            if native_cutout_field is not None
            else frozenset()
        )
        if native_cutout_field is not None:
            _exclude_native_owned_foliage_meshes(
                collection,
                native_owned_mesh_instance_ids,
            )
        material_result = _convert_materials_to_depth(
            package,
            collection,
            basis,
            camera_origin_depth,
            request["casterSidedness"],
            excluded_mesh_instance_ids=native_owned_mesh_instance_ids,
        )
        directional_geometry_filter = _filter_direction_invisible_polygons(
            collection,
            basis,
        )
        render_contract = _configure_production_scene(
            scene,
            profile,
            basis,
            request,
            arguments.row_strip_pixels,
            camera_origin_depth,
        )
        sample_plan = _certification_sample_plan(basis["layout"])
        opaque_truth = _build_opaque_primary_ray_truth(
            collection,
            scene,
            basis,
            sample_plan,
        )
        (
            outputs,
            render_counts,
            opaque_rendered_samples,
            merged_rendered_samples,
            quantization,
        ) = _render_tiles(
            scene,
            basis,
            request,
            output_root,
            arguments.output_encoding,
            arguments.row_strip_pixels,
            sample_plan,
            opaque_truth,
            native_cutout_field,
        )
        opaque_certification = _certify_opaque_primary_rays(
            opaque_truth,
            scene,
            basis,
            sample_plan,
            opaque_rendered_samples,
            directional_geometry_filter,
        )
        alpha_certification = {
            **material_result["alphaCertification"],
            "binaryAlphaEpsilon": ALPHA_BINARY_EPSILON,
            "binaryOutputRequired": True,
            "occupiedRenderedPixelCount": render_counts["occupied"],
            "status": (
                "native_three_mixed_mesh_field_min_merged_with_cycles_opaque_including_mixed_foliage_verified"
                if native_cutout_field is not None
                else "exact_inputs_and_binary_render_output_verified"
            ),
            "transparentRenderedPixelCount": render_counts["transparent"],
        }
        if native_cutout_field is not None:
            alpha_certification["nativeCutoutField"] = native_cutout_field["identity"]
        if alpha_parity_artifact is not None:
            alpha_certification["spatialParityArtifact"] = alpha_parity_artifact
        hashes = package.manifest["hashes"]
        channel_sources = {entry["id"]: entry["sha256"] for entry in hashes["channelSources"]}
        identity_hashes = _production_identity_hashes(package.manifest)
        compiler_descriptor = {
            "ai529ScriptSha256": ai529_sha256,
            "archiveSha256": signature["archiveSha256"],
            "backend": "cycles_cpu",
            "blenderBuildHash": signature["blenderBuildHash"],
            "blenderVersion": signature["blenderVersion"],
            "cyclesDevice": "CPU",
            "executableSha256": arguments.executable_sha256,
            "fixedThreadCount": profile.thread_count,
            "gpuAllowed": False,
            "profileSha256": arguments.profile_sha256,
            "rendererScriptSha256": renderer_sha256,
            "schema": (
                "ai531-static-sun-production-compiler-v3"
                if native_cutout_field is not None
                else "ai531-static-sun-production-compiler-v1"
            ),
            "toolchainSha256": arguments.toolchain_sha256,
        }
        if native_cutout_field is not None:
            compiler_descriptor["nativeCutoutField"] = {
                "method": native_cutout_field["identity"]["method"],
                "nativeOwnedMeshInstanceCount": native_cutout_field["identity"]["nativeOwnedMeshInstanceCount"],
                "nativeOwnedMeshInstanceIdsSha256": native_cutout_field["identity"]["nativeOwnedMeshInstanceIdsSha256"],
                "producerInventorySha256": native_cutout_field["identity"]["producerInventorySha256"],
                "schema": native_cutout_field["identity"]["schema"],
            }
        compiler_signature_sha256 = sha256_bytes(canonical_json_bytes(compiler_descriptor))
        city_id = package.manifest.get("source", {}).get("cityId")
        if not isinstance(city_id, str) or not city_id:
            fail("production_city_identity_missing", "The verified package has no stable resolved-city ID.")
        identity = {
            "alphaSemanticsSha256": identity_hashes["alphaSemanticsSha256"],
            "casterInventorySha256": identity_hashes["casterInventorySha256"],
            "cityId": city_id,
            "compilerDescriptor": compiler_descriptor,
            "compilerSignatureSha256": compiler_signature_sha256,
        }
        assumptions = {
            "depthMaterial": (
                "cycles_opaque_including_mixed_foliage_z_pass_min_merged_with_native_three_mixed_mesh_depth24_v3"
                if native_cutout_field is not None
                else "cycles_z_pass_with_binary_principled_visibility_v1"
            ),
            "f32Intermediate": "rgba_f32le_lower_left_with_depth_in_b_and_binary_occupancy_in_a_v1",
            "guardGeneration": "not_performed_outputs_are_unguarded_interiors",
            "performanceUse": "render_timings_are_intentionally_absent_and_must_be_measured_by_the_outer_acceptance_run",
            "pointSun": "one_normalized_receiver_to_sun_direction_no_angular_penumbra",
            "sidedness": "authenticated-three-r183-effective-shadow-side-then-world-space-direction-filter-v1",
            "spatialSampling": (
                "one_cycles_opaque_including_mixed_foliage_primary_sample_min_merged_with_one_native_three_mixed_mesh_depth24_sample_per_texel_v3"
                if native_cutout_field is not None
                else "one_deterministic_cycles_primary_camera_sample_per_texel"
            ),
        }
        if arguments.output_encoding == "rgba8_rgb24a":
            assumptions["rgba8Rgb24aEncoding"] = (
                "profile_global_linear_endpoints_rgb_0_through_16777215_"
                "with_alpha_255_occupied_0_empty_v1"
            )
        else:
            assumptions["rg8Encoding"] = (
                "linear_endpoints_0_through_65534_with_65535_empty_msb_first_v1"
            )
        receipt = {
            "alphaCertification": alpha_certification,
            "assumptions": assumptions,
            "compiler": {
                **signature,
                "cyclesDevice": "CPU",
                "executableSha256": arguments.executable_sha256,
                "fixedThreadCount": profile.thread_count,
                "gpuAllowed": False,
            },
            "compilerDescriptor": compiler_descriptor,
            "compilerSignatureSha256": compiler_signature_sha256,
            "casterSidedness": {
                "casterSidedness": request["casterSidedness"],
                "coverageModeMaterialVariantCounts": material_result["coverageModeMaterialVariantCounts"],
                "effectiveShadowSideMaterialVariantCounts": material_result["effectiveShadowSideMaterialVariantCounts"],
                "schema": "ai531-static-sun-production-caster-sidedness-receipt-v1",
            },
            "configuration": {
                "ai529ScriptInventory": ai529_inventory,
                "ai529ScriptSha256": ai529_sha256,
                "profileSha256": arguments.profile_sha256,
                "rendererScriptSha256": renderer_sha256,
                "requestSha256": arguments.request_sha256,
                "toolchainSha256": arguments.toolchain_sha256,
            },
            "input": {
                "alphaSemanticsSha256": identity_hashes["alphaSemanticsSha256"],
                "casterInventorySha256": identity_hashes["casterInventorySha256"],
                "channelSourceSha256": channel_sources[CHANNEL_ID],
                "finalFileDomainSha256": package.final_file_sha256,
                "geometrySha256": hashes["geometry"],
                "packageRawSha256": package.raw_sha256,
                "resolvedSourceSha256": hashes["resolvedSource"],
                "usedMaterialsSha256": hashes["usedMaterials"],
            },
            "identity": identity,
            "layout": basis,
            "opaqueCertification": opaque_certification,
            "outputs": outputs,
            "quantizationMeasurements": quantization,
            "profile": {
                "applied": applied_profile,
                "id": profile.data["id"],
                "productionOverrides": render_contract,
                "rawSha256": arguments.profile_sha256,
            },
            "reconstruction": {
                **reconstruction,
                "inventory": inventory,
                "mode": "full_static_sun_depth",
                "stableIdsPreservedAsCustomMetadata": True,
            },
            "request": request,
            "schema": (
                DIAGNOSTIC_RECEIPT_SCHEMA
                if arguments.output_encoding == "rgba8_rgb24a"
                else RECEIPT_SCHEMA
            ),
            "status": "complete",
        }
        receipt_bytes = canonical_json_bytes(receipt)
        atomic_write_bytes(output_root / "production_static_sun_receipt.json", receipt_bytes)
    descriptor = {
        "byteLength": len(receipt_bytes),
        "path": "production_static_sun_receipt.json",
        "sha256": sha256_bytes(receipt_bytes),
    }
    print("AI531_PRODUCTION_RECEIPT=" + canonical_json_bytes(descriptor).decode("utf-8"), flush=True)


def _parse_arguments() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(prog="production_static_sun.py", allow_abbrev=False)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--archive-sha256", type=_digest, required=True)
    parser.add_argument("--executable-sha256", type=_digest, required=True)
    parser.add_argument("--toolchain-sha256", type=_digest, required=True)
    parser.add_argument("--profile-sha256", type=_digest, required=True)
    parser.add_argument("--request-sha256", type=_digest, required=True)
    parser.add_argument("--renderer-script-sha256", type=_digest, required=True)
    parser.add_argument("--ai529-script-sha256", type=_digest, required=True)
    parser.add_argument("--package-raw-sha256", type=_digest, required=True)
    parser.add_argument("--alpha-parity-artifact", type=Path)
    parser.add_argument("--alpha-parity-artifact-sha256", type=_digest)
    parser.add_argument("--native-cutout-field-receipt", type=Path)
    parser.add_argument("--native-cutout-field-receipt-sha256", type=_digest)
    parser.add_argument("--allow-unpromoted-native-cutout-field", action="store_true")
    parser.add_argument("--output-encoding", choices=OUTPUT_ENCODINGS, default="rg8")
    parser.add_argument(
        "--row-strip-pixels",
        type=_positive_integer,
        default=PRODUCTION_INTERIOR_PIXELS[1],
    )
    arguments = parser.parse_args(raw)
    if (arguments.native_cutout_field_receipt is None) != (
        arguments.native_cutout_field_receipt_sha256 is None
    ):
        parser.error(
            "--native-cutout-field-receipt and --native-cutout-field-receipt-sha256 must be supplied together"
        )
    return arguments


def _digest(value: str) -> str:
    try:
        return require_sha256(value, "command-line digest")
    except CompilerFailure as error:
        raise argparse.ArgumentTypeError(str(error)) from error


def _positive_integer(value: str) -> int:
    try:
        result = int(value, 10)
    except ValueError as error:
        raise argparse.ArgumentTypeError("value must be a positive integer") from error
    if result <= 0:
        raise argparse.ArgumentTypeError("value must be a positive integer")
    return result


def _read_required_file(path: Path, label: str) -> bytes:
    try:
        return path.resolve(strict=True).read_bytes()
    except OSError as error:
        fail("production_file_unreadable", "A required production input could not be read.", label=label, reason=str(error))


def _parse_json(data: bytes, label: str) -> Any:
    try:
        return json.loads(data.decode("utf-8", "strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail("production_json_invalid", "A production input is not strict UTF-8 JSON.", label=label, reason=str(error))


def _load_native_cutout_field(
    arguments: argparse.Namespace,
    package: Any,
    basis: dict[str, Any],
    request: dict[str, Any],
    profile: BakeProfile,
    camera_origin_depth: float,
) -> dict[str, Any] | None:
    receipt_argument = arguments.native_cutout_field_receipt
    if receipt_argument is None:
        return None
    if receipt_argument.is_symlink():
        fail(
            "production_native_cutout_field_symlink_forbidden",
            "The native cutout field receipt must not be a symbolic link.",
        )
    receipt_path = receipt_argument.resolve(strict=True)
    if receipt_path.name != "native_cutout_field_receipt.json":
        fail(
            "production_native_cutout_field_receipt_name_invalid",
            "The native cutout field receipt has an unexpected file name.",
            actual=receipt_path.name,
        )
    receipt_root = receipt_path.parent
    if receipt_root.is_symlink() or (receipt_root / "tiles").is_symlink():
        fail(
            "production_native_cutout_field_symlink_forbidden",
            "The native cutout field root and tiles directory must not be symbolic links.",
        )
    receipt_bytes = receipt_path.read_bytes()
    receipt_sha256 = sha256_bytes(receipt_bytes)
    if receipt_sha256 != arguments.native_cutout_field_receipt_sha256:
        fail(
            "production_native_cutout_field_receipt_hash_mismatch",
            "The native cutout field receipt changed after orchestration validation.",
            expected=arguments.native_cutout_field_receipt_sha256,
            actual=receipt_sha256,
        )
    receipt = _parse_json(receipt_bytes, "native cutout field receipt")
    if canonical_json_bytes(receipt) != receipt_bytes:
        fail(
            "production_native_cutout_field_receipt_noncanonical",
            "The native cutout field receipt must be canonical JSON.",
        )
    receipt_keys = {
        "aggregate", "layout", "method", "outputs", "performance",
        "producers", "productionEligible", "profile", "schema", "session",
        "source", "status",
    }
    if "promotion" in receipt:
        receipt_keys.add("promotion")
    _require_keys(receipt, receipt_keys, "native cutout field receipt")
    is_legacy_v2 = (
        receipt["schema"] == NATIVE_CUTOUT_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_CUTOUT_FIELD_METHOD
        and receipt["status"] == "complete"
        and receipt["productionEligible"] is True
    )
    is_promoted_texture_grad_v3 = (
        receipt["schema"] == NATIVE_TEXTURE_GRAD_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_TEXTURE_GRAD_FIELD_METHOD
        and receipt["status"] == "complete"
        and receipt["productionEligible"] is True
    )
    is_texture_grad_v3 = (
        receipt["schema"] == NATIVE_TEXTURE_GRAD_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_TEXTURE_GRAD_FIELD_METHOD
        and (
            is_promoted_texture_grad_v3
            or (
                arguments.allow_unpromoted_native_cutout_field
                and receipt["status"] == "complete_unpromoted"
                and receipt["productionEligible"] is False
            )
        )
    )
    is_implicit_gradient_v4 = (
        receipt["schema"] == NATIVE_IMPLICIT_GRADIENT_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_IMPLICIT_GRADIENT_FIELD_METHOD
        and arguments.allow_unpromoted_native_cutout_field
        and receipt["status"] == "complete_unpromoted"
        and receipt["productionEligible"] is False
    )
    is_promoted_composed_v5 = (
        receipt["schema"] == NATIVE_COMPOSED_FIELD_V5_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_COMPOSED_FIELD_V5_METHOD
        and receipt["status"] == "complete"
        and receipt["productionEligible"] is True
    )
    is_composed_v5 = is_promoted_composed_v5 or (
        receipt["schema"] == NATIVE_COMPOSED_FIELD_V5_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_COMPOSED_FIELD_V5_METHOD
        and arguments.allow_unpromoted_native_cutout_field
        and receipt["status"] == "complete_unpromoted"
        and receipt["productionEligible"] is False
    )
    is_promoted_composed_v6 = (
        receipt["schema"] == NATIVE_COMPOSED_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_COMPOSED_FIELD_METHOD
        and receipt["status"] == "complete"
        and receipt["productionEligible"] is True
    )
    is_composed_v6 = is_promoted_composed_v6 or (
        receipt["schema"] == NATIVE_COMPOSED_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_COMPOSED_FIELD_METHOD
        and arguments.allow_unpromoted_native_cutout_field
        and receipt["status"] == "complete_unpromoted"
        and receipt["productionEligible"] is False
    )
    is_promoted_calibrated_v7 = (
        receipt["schema"] == NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_CALIBRATED_FIELD_METHOD
        and receipt["status"] == "complete"
        and receipt["productionEligible"] is True
    )
    is_calibrated_v7 = is_promoted_calibrated_v7 or (
        receipt["schema"] == NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_CALIBRATED_FIELD_METHOD
        and arguments.allow_unpromoted_native_cutout_field
        and receipt["status"] == "complete_unpromoted"
        and receipt["productionEligible"] is False
    )
    is_promoted_exact_calibrated_v8 = (
        receipt["schema"] == NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_EXACT_CALIBRATED_FIELD_METHOD
        and receipt["status"] == "complete"
        and receipt["productionEligible"] is True
    )
    is_exact_calibrated_v8 = is_promoted_exact_calibrated_v8 or (
        receipt["schema"] == NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_EXACT_CALIBRATED_FIELD_METHOD
        and arguments.allow_unpromoted_native_cutout_field
        and receipt["status"] == "complete_unpromoted"
        and receipt["productionEligible"] is False
    )
    is_promoted_rebased_v9 = (
        receipt["schema"] == NATIVE_REBASED_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_REBASED_FIELD_METHOD
        and receipt["status"] == "complete"
        and receipt["productionEligible"] is True
    )
    is_rebased_v9 = is_promoted_rebased_v9 or (
        receipt["schema"] == NATIVE_REBASED_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_REBASED_FIELD_METHOD
        and arguments.allow_unpromoted_native_cutout_field
        and receipt["status"] == "complete_unpromoted"
        and receipt["productionEligible"] is False
    )
    is_promoted_rebased_calibrated_v10 = (
        receipt["schema"] == NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_REBASED_CALIBRATED_FIELD_METHOD
        and receipt["status"] == "complete"
        and receipt["productionEligible"] is True
    )
    is_rebased_calibrated_v10 = is_promoted_rebased_calibrated_v10 or (
        receipt["schema"] == NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_REBASED_CALIBRATED_FIELD_METHOD
        and arguments.allow_unpromoted_native_cutout_field
        and receipt["status"] == "complete_unpromoted"
        and receipt["productionEligible"] is False
    )
    is_promoted_residual_v11 = (
        receipt["schema"] == NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_RESIDUAL_FIELD_METHOD
        and receipt["status"] == "complete"
        and receipt["productionEligible"] is True
    )
    is_residual_v11 = is_promoted_residual_v11 or (
        receipt["schema"] == NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA
        and receipt["method"] == NATIVE_RESIDUAL_FIELD_METHOD
        and arguments.allow_unpromoted_native_cutout_field
        and receipt["status"] == "complete_unpromoted"
        and receipt["productionEligible"] is False
    )
    if (
        not is_legacy_v2
        and not is_texture_grad_v3
        and not is_implicit_gradient_v4
        and not is_composed_v5
        and not is_composed_v6
        and not is_calibrated_v7
        and not is_exact_calibrated_v8
        and not is_rebased_v9
        and not is_rebased_calibrated_v10
        and not is_residual_v11
    ):
        fail(
            "production_native_cutout_field_receipt_invalid",
            "The native cutout field receipt is incomplete or not production eligible.",
        )
    if (
        is_promoted_texture_grad_v3
        or is_promoted_composed_v5
        or is_promoted_composed_v6
        or is_promoted_calibrated_v7
        or is_promoted_exact_calibrated_v8
        or is_promoted_rebased_v9
        or is_promoted_rebased_calibrated_v10
        or is_promoted_residual_v11
    ):
        _validate_native_cutout_field_promotion(receipt_root, receipt)
    elif "promotion" in receipt:
        fail(
            "production_native_cutout_field_promotion_invalid",
            "Only a promoted textureGrad or supported composed receipt may contain promotion metadata.",
        )
    _require_keys(receipt["profile"], {"directionThree", "id"}, "native cutout field profile")
    if (
        receipt["profile"]["id"] != request["lightingProfileId"]
        or receipt["profile"]["directionThree"] != request["sunPointDirectionWorld"]
    ):
        fail(
            "production_native_cutout_field_profile_mismatch",
            "The native cutout field lighting profile differs from the production request.",
        )
    _require_keys(receipt["layout"], {"basis", "depth", "layout", "tilesSha256"}, "native cutout field layout")
    expected_tiles_sha256 = sha256_bytes(canonical_json_bytes(basis["tiles"]))
    if (
        receipt["layout"]["basis"] != basis["basis"]
        or receipt["layout"]["depth"] != basis["depth"]
        or receipt["layout"]["layout"] != basis["layout"]
        or receipt["layout"]["tilesSha256"] != expected_tiles_sha256
    ):
        fail(
            "production_native_cutout_field_layout_mismatch",
            "The native cutout field does not use the freshly derived production lattice.",
        )
    _validate_native_cutout_field_source(
        receipt["source"], arguments, package, receipt["schema"]
    )
    cutout_caster_ids = sorted(
        entry["id"]
        for entry in package.manifest["casterMappings"]
        if entry.get("channelRelevance", {}).get(CHANNEL_ID) is True
        and entry.get("coverageMode") == "cutout"
    )
    cutout_caster_ids_sha256 = sha256_bytes(canonical_json_bytes(cutout_caster_ids))
    native_owned_mesh_instance_ids = sorted({
        entry["meshInstanceId"]
        for entry in package.manifest["casterMappings"]
        if entry.get("channelRelevance", {}).get(CHANNEL_ID) is True
        and entry.get("coverageMode") == "cutout"
    })
    native_owned_mesh_instance_ids_sha256 = sha256_bytes(
        canonical_json_bytes(native_owned_mesh_instance_ids)
    )
    if (
        receipt["source"]["cutoutCasterCount"] != len(cutout_caster_ids)
        or receipt["source"]["cutoutCasterIdsSha256"] != cutout_caster_ids_sha256
        or receipt["source"]["nativeOwnedMeshInstanceCount"]
            != len(native_owned_mesh_instance_ids)
        or receipt["source"]["nativeOwnedMeshInstanceIdsSha256"]
            != native_owned_mesh_instance_ids_sha256
    ):
        fail(
            "production_native_cutout_field_caster_mismatch",
            "The native cutout field caster projection differs from the authenticated BSIB.",
        )
    _validate_native_cutout_field_session(
        receipt["session"],
        cutout_caster_ids,
        len(native_owned_mesh_instance_ids),
        basis,
        request,
        profile,
        camera_origin_depth,
        receipt["schema"],
        receipt["method"],
    )
    producer_inventory_sha256 = _validate_native_cutout_field_producers(receipt["producers"])
    outputs_by_tile_id, output_projection, native_capture_totals = _validate_native_cutout_field_outputs(
        receipt_root,
        receipt["outputs"],
        receipt["aggregate"],
        basis,
        request,
        receipt["schema"],
    )
    if is_texture_grad_v3 or is_implicit_gradient_v4:
        native_result = receipt["source"]["nativeResultAuthority"]
        candidate = receipt["source"]["candidateAuthority"]
        if (
            native_result["acceptedCandidateCount"]
                != native_capture_totals["acceptedCandidateCount"]
            or native_result["resultChunkCount"]
                != native_capture_totals["chunkCount"]
            or candidate["candidateCount"]
                != native_capture_totals["candidateCount"]
        ):
            fail(
                "production_native_cutout_field_candidate_aggregate_mismatch",
                "The native textureGrad candidate authority differs from its tile captures.",
            )
    if (
        (is_calibrated_v7 or is_rebased_calibrated_v10)
        and receipt["source"]["calibration"]["excludedBakeOnlySampleCount"]
            != native_capture_totals["excludedBakeOnlySampleCount"]
    ):
        fail(
            "production_native_calibrated_field_aggregate_mismatch",
            "The calibrated exclusion count differs from its tile proofs.",
        )
    if (
        is_exact_calibrated_v8
        and (
            receipt["source"]["calibration"]["correctedBakeOnlySampleCount"]
                != native_capture_totals["correctedBakeOnlySampleCount"]
            or receipt["source"]["calibration"]["correctedDepthSampleCount"]
                != native_capture_totals["correctedDepthSampleCount"]
        )
    ):
        fail(
            "production_native_exact_calibrated_field_aggregate_mismatch",
            "The exact calibrated correction counts differ from their tile proofs.",
        )
    if (
        is_residual_v11
        and receipt["source"]["residualCalibration"]["correctedTexelCount"]
            != native_capture_totals["residualCorrectedTexelCount"]
    ):
        fail(
            "production_native_residual_field_aggregate_mismatch",
            "The residual correction count differs from its tile proofs.",
        )
    identity = {
        "cutoutCasterCount": len(cutout_caster_ids),
        "cutoutCasterIdsSha256": cutout_caster_ids_sha256,
        "method": receipt["method"],
        "nativeOwnedMeshInstanceCount": len(native_owned_mesh_instance_ids),
        "nativeOwnedMeshInstanceIdsSha256": native_owned_mesh_instance_ids_sha256,
        "outputProjectionSha256": sha256_bytes(canonical_json_bytes(output_projection)),
        "producerInventorySha256": producer_inventory_sha256,
        "receiptByteLength": len(receipt_bytes),
        "receiptSha256": receipt_sha256,
        "schema": receipt["schema"],
        "status": "authenticated_complete_native_field",
        "tilesSha256": expected_tiles_sha256,
    }
    return {
        "identity": identity,
        "nativeOwnedMeshInstanceIds": frozenset(native_owned_mesh_instance_ids),
        "outputsByTileId": outputs_by_tile_id,
        "root": receipt_root,
    }


def _validate_native_cutout_field_promotion(
    receipt_root: Path,
    receipt: dict[str, Any],
) -> None:
    promotion = receipt["promotion"]
    _require_keys(promotion, {
        "method", "nativeFieldIdentitySha256", "parityArtifactSha256",
        "parityDescriptorSha256", "schema", "status",
        "unpromotedReceiptByteLength", "unpromotedReceiptSha256",
    }, "native cutout field promotion")
    if (
        promotion["schema"]
            != "ai531-production-alpha-cutout-native-field-promotion-v1"
        or promotion["method"]
            != "authenticated-unpromoted-field-plus-file-backed-spatial-parity-v1"
        or promotion["status"] != "passed"
    ):
        fail(
            "production_native_cutout_field_promotion_invalid",
            "The native cutout field promotion identity is unsupported.",
        )
    for key in (
        "nativeFieldIdentitySha256", "parityArtifactSha256",
        "parityDescriptorSha256", "unpromotedReceiptSha256",
    ):
        require_sha256(promotion[key], f"native cutout promotion {key}")
    original_path = receipt_root / "unpromoted_native_cutout_field_receipt.json"
    if original_path.is_symlink() or not original_path.is_file():
        fail(
            "production_native_cutout_field_promotion_source_invalid",
            "The promoted native field requires its regular original receipt.",
        )
    original_bytes = original_path.read_bytes()
    original = _parse_json(original_bytes, "unpromoted native cutout field receipt")
    expected_original = dict(receipt)
    del expected_original["promotion"]
    expected_original["productionEligible"] = False
    expected_original["status"] = "complete_unpromoted"
    if (
        len(original_bytes) != promotion["unpromotedReceiptByteLength"]
        or sha256_bytes(original_bytes) != promotion["unpromotedReceiptSha256"]
        or canonical_json_bytes(original) != original_bytes
        or original != expected_original
    ):
        fail(
            "production_native_cutout_field_promotion_source_invalid",
            "The promoted native field differs from its authenticated original receipt.",
        )


def _validate_native_cutout_field_source(
    source: Any,
    arguments: argparse.Namespace,
    package: Any,
    receipt_schema: str,
) -> None:
    source_keys = {
        "bsib", "cutoutCasterCount", "cutoutCasterIdsSha256", "descriptor",
        "layoutReceipt", "nativeOwnedMeshInstanceCount",
        "nativeOwnedMeshInstanceIdsSha256",
    }
    if receipt_schema in NATIVE_CANDIDATE_FIELD_SCHEMAS:
        source_keys.update({"candidateAuthority", "nativeResultAuthority"})
    elif receipt_schema in NATIVE_COMPOSED_FIELD_SCHEMAS:
        source_keys.add("composition")
        if receipt_schema in {
            NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA,
            NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA,
            NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA,
        }:
            source_keys.add("calibration")
        if receipt_schema == NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA:
            source_keys.add("residualCalibration")
            if "calibration" in source:
                source_keys.add("calibration")
    _require_keys(source, source_keys, "native cutout field source")
    _require_keys(source["bsib"], {"byteLength", "sha256"}, "native cutout field source.bsib")
    _require_keys(source["descriptor"], {"byteLength", "sha256"}, "native cutout field source.descriptor")
    _require_keys(source["layoutReceipt"], {
        "byteLength", "compilerSignatureSha256", "sha256",
    }, "native cutout field source.layoutReceipt")
    input_size = arguments.input.resolve(strict=True).stat().st_size
    if (
        source["bsib"]["byteLength"] != input_size
        or source["bsib"]["sha256"] != package.raw_sha256
    ):
        fail(
            "production_native_cutout_field_source_mismatch",
            "The native cutout field BSIB authority differs from the verified production input.",
        )
    for descriptor in (source["descriptor"], source["layoutReceipt"]):
        if not isinstance(descriptor["byteLength"], int) or descriptor["byteLength"] <= 0:
            fail("production_native_cutout_field_source_invalid", "A native cutout source descriptor byte length is invalid.")
        require_sha256(descriptor["sha256"], "native cutout source digest")
    require_sha256(source["layoutReceipt"]["compilerSignatureSha256"], "native cutout layout compiler digest")
    require_sha256(source["cutoutCasterIdsSha256"], "native cutout caster projection digest")
    if (
        not isinstance(source["nativeOwnedMeshInstanceCount"], int)
        or source["nativeOwnedMeshInstanceCount"] <= 0
    ):
        fail(
            "production_native_foliage_mesh_count_invalid",
            "The native foliage ownership count must be positive.",
        )
    require_sha256(
        source["nativeOwnedMeshInstanceIdsSha256"],
        "native foliage mesh-instance projection digest",
    )
    if receipt_schema in NATIVE_COMPOSED_FIELD_SCHEMAS:
        composition = source["composition"]
        composition_keys = {"direct", "method", "schema", "textureGrad"}
        if receipt_schema in {
            NATIVE_REBASED_FIELD_RECEIPT_SCHEMA,
            NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA,
            NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA,
        }:
            composition_keys.add("migration")
        _require_keys(composition, composition_keys, "native composed field source")
        for label in ("direct", "textureGrad"):
            proof = composition[label]
            _require_keys(proof, {"method", "outputProjectionSha256", "receiptSha256", "schema"}, f"native composed {label} source")
            require_sha256(proof["outputProjectionSha256"], f"native composed {label} output projection")
            require_sha256(proof["receiptSha256"], f"native composed {label} receipt")
        direct_preferred = receipt_schema in {
            NATIVE_COMPOSED_FIELD_RECEIPT_SCHEMA,
            NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA,
        }
        rebased = receipt_schema in {
            NATIVE_REBASED_FIELD_RECEIPT_SCHEMA,
            NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA,
            NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA,
        }
        if (
            composition["schema"] != (
                "ai531-production-alpha-cutout-native-field-composition-v3"
                if rebased
                else "ai531-production-alpha-cutout-native-field-composition-v2"
                if direct_preferred
                else "ai531-production-alpha-cutout-native-field-composition-v1"
            )
            or composition["method"] != (
                "authenticated-current-direct-plus-candidate-equivalent-historical-texture-grad-hole-fill-v3"
                if rebased
                else "authenticated-source-fields-plus-direct-preferred-hole-fill-v2"
                if direct_preferred
                else "authenticated-source-fields-plus-bytewise-minimum-union-v1"
            )
            or composition["direct"]["schema"] != NATIVE_CUTOUT_FIELD_RECEIPT_SCHEMA
            or composition["textureGrad"]["schema"] != NATIVE_TEXTURE_GRAD_FIELD_RECEIPT_SCHEMA
        ):
            fail("production_native_composed_field_source_invalid", "The native composed source identity is unsupported.")
        if rebased:
            _validate_native_rebased_field_migration(
                composition["migration"], composition, package
            )
    if receipt_schema in {
        NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA,
        NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA,
        NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA,
    }:
        _validate_native_cutout_field_calibration(source["calibration"], receipt_schema)
    if receipt_schema == NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA:
        if "calibration" in source:
            _validate_native_cutout_field_calibration(
                source["calibration"], NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA
            )
        _validate_native_residual_calibration(source["residualCalibration"])
    if receipt_schema in NATIVE_CANDIDATE_FIELD_SCHEMAS:
        candidate = source["candidateAuthority"]
        native_result = source["nativeResultAuthority"]
        _require_keys(candidate, {
            "aggregateCandidateBytesSha256", "candidateCount",
            "receiptByteLength", "receiptSha256", "sourceTriangleAuthority",
        }, "native cutout candidate authority")
        _require_keys(candidate["sourceTriangleAuthority"], {
            "byteLength", "path", "sha256",
        }, "native cutout source triangle authority")
        _require_keys(native_result, {
            "acceptedCandidateCount", "outputProjectionSha256",
            "resultChunkCount", "resultProjectionSha256",
        }, "native cutout result authority")
        for digest in (
            candidate["aggregateCandidateBytesSha256"],
            candidate["receiptSha256"],
            candidate["sourceTriangleAuthority"]["sha256"],
            native_result["outputProjectionSha256"],
            native_result["resultProjectionSha256"],
        ):
            require_sha256(digest, "native textureGrad authority digest")
        for count in (
            candidate["candidateCount"], candidate["receiptByteLength"],
            candidate["sourceTriangleAuthority"]["byteLength"],
            native_result["acceptedCandidateCount"],
            native_result["resultChunkCount"],
        ):
            if not isinstance(count, int) or count < 0:
                fail(
                    "production_native_cutout_field_source_invalid",
                    "A native textureGrad authority count is invalid.",
                )


def _validate_native_rebased_field_migration(
    migration: Any,
    composition: dict[str, Any],
    package: Any,
) -> None:
    _require_keys(migration, {
        "candidateSourceIdentity", "current", "historical", "method", "schema",
    }, "native rebased field migration")
    if (
        migration["schema"]
            != "ai531-production-alpha-cutout-native-field-migration-v1"
        or migration["method"]
            != "current-and-historical-direct-byte-identity-plus-candidate-source-equivalence-v1"
    ):
        fail(
            "production_native_rebased_field_source_invalid",
            "The native rebased field migration identity is unsupported.",
        )
    candidate = migration["candidateSourceIdentity"]
    _require_keys(candidate, {
        "aggregateCandidateBytesSha256", "candidateCount", "samplerSha256",
        "sourceTriangleAuthority", "tileQueriesSha256",
    }, "native rebased candidate source identity")
    for digest in (
        candidate["aggregateCandidateBytesSha256"],
        candidate["samplerSha256"],
        candidate["tileQueriesSha256"],
    ):
        require_sha256(digest, "native rebased candidate identity digest")
    if not isinstance(candidate["candidateCount"], int) or candidate["candidateCount"] < 1:
        fail(
            "production_native_rebased_field_source_invalid",
            "The native rebased candidate count must be positive.",
        )
    triangles = candidate["sourceTriangleAuthority"]
    _require_keys(triangles, {"byteLength", "sha256"}, "native rebased source triangles")
    if not isinstance(triangles["byteLength"], int) or triangles["byteLength"] < 1:
        fail(
            "production_native_rebased_field_source_invalid",
            "The native rebased source triangle byte length must be positive.",
        )
    require_sha256(triangles["sha256"], "native rebased source triangle digest")
    for label in ("current", "historical"):
        source = migration[label]
        _require_keys(source, {"bsib", "direct", "textureGrad"}, f"native rebased {label} source")
        _require_keys(source["bsib"], {"byteLength", "sha256"}, f"native rebased {label} BSIB")
        if not isinstance(source["bsib"]["byteLength"], int) or source["bsib"]["byteLength"] < 1:
            fail(
                "production_native_rebased_field_source_invalid",
                f"The native rebased {label} BSIB length is invalid.",
            )
        require_sha256(source["bsib"]["sha256"], f"native rebased {label} BSIB digest")
        for field_label in ("direct", "textureGrad"):
            proof = source[field_label]
            _require_keys(proof, {
                "method", "outputProjectionSha256", "receiptSha256", "schema",
            }, f"native rebased {label} {field_label} field")
            require_sha256(
                proof["outputProjectionSha256"],
                f"native rebased {label} {field_label} output projection",
            )
            require_sha256(
                proof["receiptSha256"],
                f"native rebased {label} {field_label} receipt",
            )
        if (
            source["direct"]["schema"] != NATIVE_CUTOUT_FIELD_RECEIPT_SCHEMA
            or source["textureGrad"]["schema"]
                != NATIVE_TEXTURE_GRAD_FIELD_RECEIPT_SCHEMA
        ):
            fail(
                "production_native_rebased_field_source_invalid",
                f"The native rebased {label} field schemas are unsupported.",
            )
    current = migration["current"]
    historical = migration["historical"]
    if (
        current["bsib"]["sha256"] != package.raw_sha256
        or historical["bsib"]["sha256"] == current["bsib"]["sha256"]
        or current["direct"]["outputProjectionSha256"]
            != historical["direct"]["outputProjectionSha256"]
        or current["direct"] != composition["direct"]
        or historical["textureGrad"] != composition["textureGrad"]
    ):
        fail(
            "production_native_rebased_field_source_invalid",
            "The native rebased field migration proof is inconsistent.",
        )


def _validate_native_residual_calibration(value: Any) -> None:
    _require_keys(value, {
        "correctedTexelCount", "correctedTexels", "localizationReports",
        "method", "productionPackage", "schema", "sourceField",
        "sourceProductionReport",
    }, "native residual calibration")
    if (
        value["schema"] != "ai531-production-static-shadow-residual-calibration-v4"
        or value["method"]
            != "apply-authenticated-same-session-nearer-live-depth-residuals-v4"
        or not isinstance(value["correctedTexelCount"], int)
        or value["correctedTexelCount"] < 1
        or not isinstance(value["correctedTexels"], list)
        or len(value["correctedTexels"]) != value["correctedTexelCount"]
        or not isinstance(value["localizationReports"], list)
        or len(value["localizationReports"]) < 1
    ):
        fail(
            "production_native_residual_field_source_invalid",
            "The native residual calibration identity or inventory is incomplete.",
        )
    source_field = value["sourceField"]
    _require_keys(source_field, {
        "method", "outputProjectionSha256", "receiptSha256", "schema",
    }, "native residual source field")
    valid_source = (
        source_field["schema"] == NATIVE_REBASED_FIELD_RECEIPT_SCHEMA
        and source_field["method"] == NATIVE_REBASED_FIELD_METHOD
    ) or (
        source_field["schema"] == NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA
        and source_field["method"] == NATIVE_REBASED_CALIBRATED_FIELD_METHOD
    ) or (
        source_field["schema"] == NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA
        and source_field["method"] == NATIVE_RESIDUAL_FIELD_METHOD
    )
    if not valid_source:
        fail(
            "production_native_residual_field_source_invalid",
            "The native residual source field is unsupported.",
        )
    require_sha256(source_field["outputProjectionSha256"], "native residual source projection")
    require_sha256(source_field["receiptSha256"], "native residual source receipt")
    seen: set[tuple[int, int]] = set()
    for correction in value["correctedTexels"]:
        _require_keys(correction, {
            "casterClasses", "correctedDepthMeters", "formerDepthMeters",
            "globalTexel", "liveDepthMeters", "observationCount",
            "observationSha256", "reportSha256s",
        }, "native residual corrected texel")
        texel = correction["globalTexel"]
        if (
            not isinstance(texel, list)
            or len(texel) != 2
            or any(not isinstance(item, int) or item < 0 for item in texel)
            or not math.isfinite(correction["liveDepthMeters"])
            or correction["liveDepthMeters"] == 0
            or correction["correctedDepthMeters"] != _float32(correction["liveDepthMeters"])
            or not math.isfinite(correction["formerDepthMeters"])
            or correction["formerDepthMeters"] != 0
                and correction["correctedDepthMeters"] >= correction["formerDepthMeters"]
            or not isinstance(correction["observationCount"], int)
            or correction["observationCount"] < 1
            or not isinstance(correction["casterClasses"], list)
            or len(correction["casterClasses"]) < 1
            or not isinstance(correction["reportSha256s"], list)
            or len(correction["reportSha256s"]) < 1
        ):
            fail(
                "production_native_residual_field_source_invalid",
                "A native residual corrected texel is invalid.",
            )
        require_sha256(correction["observationSha256"], "native residual observation digest")
        for digest in correction["reportSha256s"]:
            require_sha256(digest, "native residual report digest")
        key = (texel[0], texel[1])
        if key in seen:
            fail(
                "production_native_residual_field_source_invalid",
                "A native residual corrected texel is duplicated.",
            )
        seen.add(key)
    for report in value["localizationReports"]:
        _require_keys(report, {
            "byteLength", "captureSetSha256", "casterClasses", "path",
            "sha256", "targetCaseId",
        }, "native residual localization report")
        if (
            not isinstance(report["byteLength"], int)
            or report["byteLength"] < 1
            or not isinstance(report["casterClasses"], list)
            or len(report["casterClasses"]) < 1
            or not isinstance(report["path"], str)
            or not report["path"]
            or not isinstance(report["targetCaseId"], str)
            or not report["targetCaseId"]
        ):
            fail(
                "production_native_residual_field_source_invalid",
                "A native residual localization report proof is invalid.",
            )
        require_sha256(report["captureSetSha256"], "native residual capture set")
        require_sha256(report["sha256"], "native residual localization report")
    package = value["productionPackage"]
    _require_keys(package, {"alphaCertification", "packagePath"}, "native residual package")
    _require_keys(package["alphaCertification"], {
        "byteLength", "path", "sha256",
    }, "native residual alpha certification")
    require_sha256(package["alphaCertification"]["sha256"], "native residual alpha certification")
    source_report = value["sourceProductionReport"]
    _require_keys(source_report, {
        "byteLength", "path", "schema", "sha256",
    }, "native residual source production report")
    if source_report["schema"] != "bus-sim-static-sun-depth-production-validation-report-v4":
        fail(
            "production_native_residual_field_source_invalid",
            "The native residual source production report schema is unsupported.",
        )
    require_sha256(source_report["sha256"], "native residual source report")


def _validate_native_cutout_field_calibration(
    calibration: Any,
    receipt_schema: str,
) -> None:
    if receipt_schema == NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA:
        _validate_native_exact_cutout_field_calibration(calibration)
        return
    rebased = receipt_schema == NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA
    _require_keys(calibration, {
        "descriptorSha256", "diagnosticEvidence", "diagnosticReport",
        "excludedBakeOnlySampleCount", "excludedSamples", "method", "schema",
        "sourceField",
    }, "native calibrated field source")
    if (
        calibration["schema"]
            != (
                "ai531-production-alpha-cutout-native-field-calibration-v3"
                if rebased
                else "ai531-production-alpha-cutout-native-field-calibration-v1"
            )
        or calibration["method"]
            != (
                "remove-only-independently-measured-rebased-bake-occupied-live-empty-texels-v3"
                if rebased
                else "remove-only-independently-measured-bake-occupied-live-empty-texels-v1"
            )
    ):
        fail(
            "production_native_calibrated_field_source_invalid",
            "The native calibrated field source identity is unsupported.",
        )
    require_sha256(calibration["descriptorSha256"], "native calibration descriptor digest")
    count = calibration["excludedBakeOnlySampleCount"]
    samples = calibration["excludedSamples"]
    if not isinstance(count, int) or count <= 0 or not isinstance(samples, list) or len(samples) != count:
        fail(
            "production_native_calibrated_field_source_invalid",
            "The native calibrated field exclusion inventory is incomplete.",
        )
    _validate_calibration_file_record(
        calibration["diagnosticReport"], "native calibration diagnostic report"
    )
    evidence = calibration["diagnosticEvidence"]
    _require_keys(evidence, {
        "bakeFirstHitDepth", "bakeOccupancy", "comparison",
        "liveFirstHitDepth", "liveOccupancy", "samplePlan",
    }, "native calibration diagnostic evidence")
    for label, record in evidence.items():
        _validate_calibration_file_record(record, f"native calibration evidence {label}")
    source_field = calibration["sourceField"]
    _require_keys(source_field, {
        "method", "outputProjectionSha256", "receiptSha256", "schema",
    }, "native calibration source field")
    if (
        source_field["schema"] != (
            NATIVE_REBASED_FIELD_RECEIPT_SCHEMA
            if rebased
            else NATIVE_COMPOSED_FIELD_RECEIPT_SCHEMA
        )
        or source_field["method"] != (
            NATIVE_REBASED_FIELD_METHOD
            if rebased
            else NATIVE_COMPOSED_FIELD_METHOD
        )
    ):
        fail(
            "production_native_calibrated_field_source_invalid",
            "The native calibration source must be the expected direct-preferred field.",
        )
    require_sha256(source_field["outputProjectionSha256"], "native calibration source projection")
    require_sha256(source_field["receiptSha256"], "native calibration source receipt")
    previous_index = -1
    seen_texels = set()
    for sample in samples:
        _require_keys(sample, {
            "casterId", "formerDepthMeters", "globalTexel", "index",
        }, "native calibration excluded sample")
        texel = sample["globalTexel"]
        if (
            not isinstance(sample["casterId"], str)
            or not sample["casterId"]
            or not isinstance(sample["formerDepthMeters"], (int, float))
            or not math.isfinite(sample["formerDepthMeters"])
            or sample["formerDepthMeters"] == 0
            or not isinstance(sample["index"], int)
            or sample["index"] <= previous_index
            or not isinstance(texel, list)
            or len(texel) != 2
            or any(not isinstance(value, int) or value < 0 for value in texel)
            or tuple(texel) in seen_texels
        ):
            fail(
                "production_native_calibrated_field_source_invalid",
                "A native calibration excluded sample is invalid.",
            )
        previous_index = sample["index"]
        seen_texels.add(tuple(texel))


def _validate_native_exact_cutout_field_calibration(calibration: Any) -> None:
    _require_keys(calibration, {
        "correctedBakeOnlySampleCount", "correctedDepthSampleCount",
        "correctedSamples", "descriptorSha256", "diagnosticEvidence",
        "diagnosticReport", "method", "schema", "sourceField",
    }, "native exact calibrated field source")
    if (
        calibration["schema"]
            != "ai531-production-alpha-cutout-native-field-calibration-v2"
        or calibration["method"]
            != "apply-only-independently-measured-occupancy-and-depth-corrections-v2"
    ):
        fail(
            "production_native_exact_calibrated_field_source_invalid",
            "The native exact calibrated field source identity is unsupported.",
        )
    require_sha256(calibration["descriptorSha256"], "native exact calibration descriptor digest")
    bake_only_count = calibration["correctedBakeOnlySampleCount"]
    depth_count = calibration["correctedDepthSampleCount"]
    samples = calibration["correctedSamples"]
    if (
        not isinstance(bake_only_count, int)
        or bake_only_count < 0
        or not isinstance(depth_count, int)
        or depth_count < 0
        or bake_only_count + depth_count < 1
        or not isinstance(samples, list)
        or len(samples) != bake_only_count + depth_count
    ):
        fail(
            "production_native_exact_calibrated_field_source_invalid",
            "The native exact calibrated field correction inventory is incomplete.",
        )
    _validate_calibration_file_record(
        calibration["diagnosticReport"], "native exact calibration diagnostic report"
    )
    evidence = calibration["diagnosticEvidence"]
    _require_keys(evidence, {
        "bakeFirstHitDepth", "bakeOccupancy", "comparison",
        "liveFirstHitDepth", "liveOccupancy", "samplePlan",
    }, "native exact calibration diagnostic evidence")
    for label, record in evidence.items():
        _validate_calibration_file_record(record, f"native exact calibration evidence {label}")
    source_field = calibration["sourceField"]
    _require_keys(source_field, {
        "method", "outputProjectionSha256", "receiptSha256", "schema",
    }, "native exact calibration source field")
    if (
        source_field["schema"] != NATIVE_COMPOSED_FIELD_V5_RECEIPT_SCHEMA
        or source_field["method"] != NATIVE_COMPOSED_FIELD_V5_METHOD
    ):
        fail(
            "production_native_exact_calibrated_field_source_invalid",
            "The native exact calibration source must be the v5 minimum-union field.",
        )
    require_sha256(source_field["outputProjectionSha256"], "native exact calibration source projection")
    require_sha256(source_field["receiptSha256"], "native exact calibration source receipt")
    previous_index = -1
    seen_texels = set()
    measured_bake_only_count = 0
    measured_depth_count = 0
    for sample in samples:
        _require_keys(sample, {
            "bakeDepthMeters", "casterId", "correctedDepthMeters",
            "correction", "formerDepthMeters", "globalTexel", "index",
            "liveDepthMeters",
        }, "native exact calibration sample")
        texel = sample["globalTexel"]
        numeric_values = (
            sample["bakeDepthMeters"], sample["correctedDepthMeters"],
            sample["formerDepthMeters"], sample["liveDepthMeters"],
        )
        if (
            not isinstance(sample["casterId"], str)
            or not sample["casterId"]
            or any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in numeric_values)
            or sample["bakeDepthMeters"] <= 0
            or sample["formerDepthMeters"] <= 0
            or sample["correctedDepthMeters"] < 0
            or sample["liveDepthMeters"] < 0
            or not isinstance(sample["index"], int)
            or sample["index"] <= previous_index
            or not isinstance(texel, list)
            or len(texel) != 2
            or any(not isinstance(value, int) or value < 0 for value in texel)
            or tuple(texel) in seen_texels
        ):
            fail(
                "production_native_exact_calibrated_field_source_invalid",
                "A native exact calibration sample is invalid.",
            )
        if sample["correction"] == "clear_bake_only":
            if sample["liveDepthMeters"] != 0 or sample["correctedDepthMeters"] != 0:
                fail(
                    "production_native_exact_calibrated_field_source_invalid",
                    "A native exact bake-only correction is invalid.",
                )
            measured_bake_only_count += 1
        elif sample["correction"] == "replace_depth":
            if (
                sample["liveDepthMeters"] <= 0
                or sample["correctedDepthMeters"] != sample["liveDepthMeters"]
                or abs(sample["bakeDepthMeters"] - sample["liveDepthMeters"])
                    <= BVH_DEPTH_EPSILON_METERS
            ):
                fail(
                    "production_native_exact_calibrated_field_source_invalid",
                    "A native exact depth correction is invalid.",
                )
            measured_depth_count += 1
        else:
            fail(
                "production_native_exact_calibrated_field_source_invalid",
                "A native exact calibration correction kind is unsupported.",
            )
        previous_index = sample["index"]
        seen_texels.add(tuple(texel))
    if measured_bake_only_count != bake_only_count or measured_depth_count != depth_count:
        fail(
            "production_native_exact_calibrated_field_source_invalid",
            "The native exact calibration correction counts are inconsistent.",
        )


def _validate_calibration_file_record(record: Any, label: str) -> None:
    _require_keys(record, {"byteLength", "path", "sha256"}, label)
    relative = record["path"]
    if (
        not isinstance(record["byteLength"], int)
        or record["byteLength"] <= 0
        or not isinstance(relative, str)
        or not relative.startswith("tests/artifacts/illumination_531/")
        or "\\" in relative
        or relative.startswith("/")
        or ".." in Path(relative).parts
    ):
        fail(
            "production_native_calibrated_field_source_invalid",
            f"{label} is not a safe authenticated artifact record.",
        )
    require_sha256(record["sha256"], f"{label} digest")


def _validate_native_cutout_field_session(
    session: Any,
    cutout_caster_ids: list[str],
    native_owned_mesh_instance_count: int,
    basis: dict[str, Any],
    request: dict[str, Any],
    profile: BakeProfile,
    camera_origin_depth: float,
    receipt_schema: str,
    receipt_method: str,
) -> None:
    _require_keys(session, {"begin", "diagnostics", "end"}, "native cutout field session")
    if session["diagnostics"] != []:
        fail(
            "production_native_cutout_field_diagnostics_present",
            "Production native cutout evidence must contain no browser or server diagnostics.",
            diagnostics=session["diagnostics"],
        )
    begin = session["begin"]
    end = session["end"]
    expected_session_schema = (
        NATIVE_RESIDUAL_FIELD_SESSION_SCHEMA
        if receipt_schema == NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA
        else NATIVE_REBASED_CALIBRATED_FIELD_SESSION_SCHEMA
        if receipt_schema == NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA
        else NATIVE_REBASED_FIELD_SESSION_SCHEMA
        if receipt_schema == NATIVE_REBASED_FIELD_RECEIPT_SCHEMA
        else NATIVE_EXACT_CALIBRATED_FIELD_SESSION_SCHEMA
        if receipt_schema == NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA
        else NATIVE_CALIBRATED_FIELD_SESSION_SCHEMA
        if receipt_schema == NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA
        else NATIVE_COMPOSED_FIELD_SESSION_SCHEMA
        if receipt_schema == NATIVE_COMPOSED_FIELD_RECEIPT_SCHEMA
        else NATIVE_COMPOSED_FIELD_V5_SESSION_SCHEMA
        if receipt_schema == NATIVE_COMPOSED_FIELD_V5_RECEIPT_SCHEMA
        else NATIVE_IMPLICIT_GRADIENT_FIELD_SESSION_SCHEMA
        if receipt_schema == NATIVE_IMPLICIT_GRADIENT_FIELD_RECEIPT_SCHEMA
        else NATIVE_TEXTURE_GRAD_FIELD_SESSION_SCHEMA
        if receipt_schema == NATIVE_TEXTURE_GRAD_FIELD_RECEIPT_SCHEMA
        else NATIVE_CUTOUT_FIELD_SESSION_SCHEMA
    )
    if (
        begin.get("schema") != expected_session_schema
        or begin.get("method") != receipt_method
        or begin.get("status") != "ready"
        or begin.get("lightingProfileId") != request["lightingProfileId"]
        or begin.get("casterIds") != cutout_caster_ids
        or begin.get("casterCount") != len(cutout_caster_ids)
        or begin.get("casterMeshCount") != native_owned_mesh_instance_count
        or begin.get("nativeOwnedMeshCount") != native_owned_mesh_instance_count
        or begin.get("nativeFoliageCoverage") != NATIVE_FOLIAGE_COVERAGE
    ):
        fail(
            "production_native_cutout_field_session_invalid",
            "The native cutout field session did not authenticate the exact live caster inventory.",
        )
    expected_session_layout = {
        "interiorPixels": request["interiorPixels"],
        "layerCount": basis["layout"]["layerCount"],
        "tileCount": basis["layout"]["tileCount"],
        "tileSizeMeters": request["tileSizeMeters"],
    }
    clip_start = float(profile.data["camera"]["clipStartMeters"])
    expected_camera = {
        "farMeters": _float32(
            basis["depth"]["maxDepthMeters"] - camera_origin_depth + clip_start
        ),
        "nearMeters": _float32(clip_start * 0.5),
        "originDepthMetersInCacheBasis": camera_origin_depth,
        "projection": "orthographic-linear-depth-v1",
    }
    if begin.get("layout") != expected_session_layout or begin.get("camera") != expected_camera:
        fail(
            "production_native_cutout_field_session_layout_mismatch",
            "The native cutout field session camera or lattice differs from the Blender production contract.",
            actualCamera=begin.get("camera"),
            actualLayout=begin.get("layout"),
            expectedCamera=expected_camera,
            expectedLayout=expected_session_layout,
        )
    expected_axis_transform = _derive_live_source_to_cache_light_axis_transform(
        basis, request
    )
    if receipt_schema == NATIVE_IMPLICIT_GRADIENT_FIELD_RECEIPT_SCHEMA:
        if begin.get("liveSourceToCacheLightAxisTransform") != expected_axis_transform:
            fail(
                "production_native_cutout_field_axis_transform_mismatch",
                "The implicit-gradient field session does not authenticate the live-to-cache light-axis transform.",
                actual=begin.get("liveSourceToCacheLightAxisTransform"),
                expected=expected_axis_transform,
            )
    elif "liveSourceToCacheLightAxisTransform" in begin:
        fail(
            "production_native_cutout_field_axis_transform_forbidden",
            "Only the v4 implicit-gradient field may declare a live-to-cache light-axis transform.",
        )
    expected_state_restoration = (
        "authenticated-source-field-and-live-residual-evidence-disposed-v1"
        if receipt_schema == NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA
        else "authenticated-source-field-and-parity-diagnostics-disposed-v1"
        if receipt_schema in {
            NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA,
            NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA,
            NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA,
        }
        else "authenticated-source-fields-disposed-v1"
        if receipt_schema in NATIVE_COMPOSED_FIELD_SCHEMAS
        else "candidate-and-native-sampler-disposed-v1"
        if receipt_schema in NATIVE_CANDIDATE_FIELD_SCHEMAS
        else "isolated-scene-disposed-v1"
    )
    if (
        end.get("schema") != expected_session_schema
        or end.get("method") != receipt_method
        or end.get("status") != "disposed"
        or end.get("stateRestoration") != expected_state_restoration
        or end.get("capturedTileCount") != basis["layout"]["layerCount"]
    ):
        fail(
            "production_native_cutout_field_session_incomplete",
            "The native cutout capture session did not complete and restore state.",
        )


def _validate_native_cutout_field_producers(producers: Any) -> str:
    if not isinstance(producers, list) or len(producers) < 5:
        fail("production_native_cutout_field_producers_invalid", "The native cutout field producer inventory is incomplete.")
    seen_paths = set()
    for entry in producers:
        _require_keys(entry, {"byteLength", "path", "sha256"}, "native cutout field producer")
        producer_path = entry["path"]
        if (
            not isinstance(producer_path, str)
            or not producer_path.startswith("tools/static_sun_depth/")
            or "\\" in producer_path
            or ".." in Path(producer_path).parts
            or producer_path in seen_paths
            or not isinstance(entry["byteLength"], int)
            or entry["byteLength"] <= 0
        ):
            fail("production_native_cutout_field_producers_invalid", "A native cutout field producer entry is unsafe or invalid.")
        seen_paths.add(producer_path)
        require_sha256(entry["sha256"], "native cutout producer digest")
    return sha256_bytes(canonical_json_bytes(producers))


def _validate_native_cutout_field_outputs(
    receipt_root: Path,
    outputs: Any,
    aggregate: Any,
    basis: dict[str, Any],
    request: dict[str, Any],
    receipt_schema: str,
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    if not isinstance(outputs, list) or len(outputs) != basis["layout"]["layerCount"]:
        fail("production_native_cutout_field_outputs_incomplete", "The native cutout field does not contain every production tile.")
    _require_keys(aggregate, {
        "occupiedTexelCount", "outputByteLength", "outputCount",
        "requiredOutputCount", "transparentTexelCount",
    }, "native cutout field aggregate")
    resolution_x, resolution_y = request["interiorPixels"]
    texel_count = resolution_x * resolution_y
    expected_byte_length = texel_count * 4
    occupied_total = 0
    transparent_total = 0
    byte_total = 0
    by_tile_id = {}
    projection = []
    native_capture_totals = {
        "acceptedCandidateCount": 0,
        "candidateCount": 0,
        "chunkCount": 0,
        "excludedBakeOnlySampleCount": 0,
        "correctedBakeOnlySampleCount": 0,
        "correctedDepthSampleCount": 0,
        "residualCorrectedTexelCount": 0,
    }
    for tile_index, (output, tile) in enumerate(zip(outputs, basis["tiles"], strict=True)):
        expected_path = f"tiles/{tile['id']}.cutout-first-hit.f32le"
        required = {
            "byteLength", "coordinates", "maximumDepthMeters", "minimumDepthMeters",
            "nativeCapture", "occupiedTexelCount", "path", "rowOrigin", "sha256",
            "tileId", "tileIndex", "transparentTexelCount", "xAxis",
        }
        _require_keys(output, required, f"native cutout field output[{tile_index}]")
        if (
            output["tileIndex"] != tile_index
            or output["tileId"] != tile["id"]
            or output["coordinates"] != tile["coordinates"]
            or output["path"] != expected_path
            or output["byteLength"] != expected_byte_length
            or output["rowOrigin"] != "min-light-y-v1"
            or output["xAxis"] != "increasing-cache-light-right-v1"
        ):
            fail("production_native_cutout_field_output_invalid", "A native cutout field output differs from the production tile contract.", tileIndex=tile_index)
        require_sha256(output["sha256"], "native cutout tile digest")
        candidate = receipt_root / Path(*output["path"].split("/"))
        if candidate.is_symlink():
            fail("production_native_cutout_field_symlink_forbidden", "A native cutout field tile must not be a symbolic link.", tileId=tile["id"])
        resolved = candidate.resolve(strict=True)
        try:
            resolved.relative_to(receipt_root)
        except ValueError:
            fail("production_native_cutout_field_path_escape", "A native cutout field tile escaped its receipt root.", tileId=tile["id"])
        data = resolved.read_bytes()
        if len(data) != expected_byte_length or sha256_bytes(data) != output["sha256"]:
            fail("production_native_cutout_field_tile_hash_mismatch", "A native cutout field tile differs from its authenticated digest.", tileId=tile["id"])
        values = _native_cutout_field_values(data, tile["id"])
        occupied = 0
        minimum = math.inf
        maximum = -math.inf
        for value in values:
            if value == 0.0:
                continue
            if not math.isfinite(value) or value < basis["depth"]["minDepthMeters"] - 1e-3 or value > basis["depth"]["maxDepthMeters"] + 1e-3:
                fail("production_native_cutout_field_depth_invalid", "A native cutout field sample is non-finite or outside production bounds.", tileId=tile["id"])
            occupied += 1
            minimum = min(minimum, value)
            maximum = max(maximum, value)
        transparent = texel_count - occupied
        expected_minimum = minimum if occupied else None
        expected_maximum = maximum if occupied else None
        if (
            output["occupiedTexelCount"] != occupied
            or output["transparentTexelCount"] != transparent
            or output["minimumDepthMeters"] != expected_minimum
            or output["maximumDepthMeters"] != expected_maximum
        ):
            fail("production_native_cutout_field_measurement_mismatch", "A native cutout field tile measurement differs from its bytes.", tileId=tile["id"])
        capture_counts = _validate_native_cutout_field_capture(
            output["nativeCapture"], expected_byte_length, texel_count,
            resolution_x, resolution_y, receipt_schema,
            _derive_live_source_to_cache_light_axis_transform(basis, request),
        )
        for key, value in capture_counts.items():
            native_capture_totals[key] += value
        occupied_total += occupied
        transparent_total += transparent
        byte_total += len(data)
        by_tile_id[tile["id"]] = {"path": resolved, "sha256": output["sha256"]}
        projection.append({
            "byteLength": output["byteLength"],
            "coordinates": output["coordinates"],
            "occupiedTexelCount": occupied,
            "path": output["path"],
            "sha256": output["sha256"],
            "tileId": output["tileId"],
            "tileIndex": tile_index,
            "transparentTexelCount": transparent,
        })
    expected_aggregate = {
        "occupiedTexelCount": occupied_total,
        "outputByteLength": byte_total,
        "outputCount": len(outputs),
        "requiredOutputCount": basis["layout"]["layerCount"],
        "transparentTexelCount": transparent_total,
    }
    if aggregate != expected_aggregate:
        fail("production_native_cutout_field_aggregate_mismatch", "The native cutout field aggregate differs from its authenticated tile bytes.")
    return by_tile_id, projection, native_capture_totals


def _validate_native_cutout_field_capture(
    capture: Any,
    byte_length: int,
    texel_count: int,
    width: int,
    height: int,
    receipt_schema: str,
    expected_axis_transform: list[list[int]],
) -> dict[str, int]:
    if receipt_schema in NATIVE_COMPOSED_FIELD_SCHEMAS:
        capture_keys = {"direct", "method", "textureGrad"}
        if receipt_schema in {
            NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA,
            NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA,
            NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA,
        }:
            capture_keys.add("calibration")
        if receipt_schema == NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA:
            capture_keys.add("residualCalibration")
            if "calibration" in capture:
                capture_keys.add("calibration")
        _require_keys(capture, capture_keys, "native composed tile capture")
        for label in ("direct", "textureGrad"):
            proof = capture[label]
            _require_keys(proof, {"byteLength", "occupiedTexelCount", "sha256"}, f"native composed {label} tile")
            if proof["byteLength"] != byte_length or not isinstance(proof["occupiedTexelCount"], int) or proof["occupiedTexelCount"] < 0:
                fail("production_native_composed_field_capture_invalid", "A native composed source-tile proof is invalid.")
            require_sha256(proof["sha256"], f"native composed {label} tile digest")
        expected_method = (
            "stable-field-plus-authenticated-nearer-live-depth-residuals-v4"
            if receipt_schema == NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA
            else "stable-direct-historical-hole-restoration-minus-measured-bake-only-v3"
            if receipt_schema == NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA
            else "stable-direct-first-hit-plus-historical-texture-grad-hole-restoration-v3"
            if receipt_schema == NATIVE_REBASED_FIELD_RECEIPT_SCHEMA
            else "minimum-union-plus-measured-exact-corrections-v2"
            if receipt_schema == NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA
            else "direct-preferred-hole-fill-minus-measured-bake-only-v1"
            if receipt_schema == NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA
            else "direct-depth24-first-hit-plus-texture-grad-hole-fill-v2"
            if receipt_schema == NATIVE_COMPOSED_FIELD_RECEIPT_SCHEMA
            else "minimum-nonzero-first-hit-depth-union-v1"
        )
        if capture["method"] != expected_method:
            fail("production_native_composed_field_capture_invalid", "The native composed tile method is unsupported.")
        excluded_count = 0
        corrected_bake_only_count = 0
        corrected_depth_count = 0
        if receipt_schema in {
            NATIVE_CALIBRATED_FIELD_RECEIPT_SCHEMA,
            NATIVE_REBASED_CALIBRATED_FIELD_RECEIPT_SCHEMA,
        }:
            calibration = capture["calibration"]
            _require_keys(calibration, {
                "excludedBakeOnlyTexelCount", "sourceByteLength", "sourceSha256",
            }, "native calibrated tile proof")
            if (
                not isinstance(calibration["excludedBakeOnlyTexelCount"], int)
                or calibration["excludedBakeOnlyTexelCount"] < 0
                or calibration["sourceByteLength"] != byte_length
            ):
                fail("production_native_calibrated_field_capture_invalid", "A calibrated tile proof count or length is invalid.")
            require_sha256(calibration["sourceSha256"], "native calibrated source tile digest")
            excluded_count = calibration["excludedBakeOnlyTexelCount"]
        elif receipt_schema == NATIVE_EXACT_CALIBRATED_FIELD_RECEIPT_SCHEMA:
            calibration = capture["calibration"]
            _require_keys(calibration, {
                "correctedBakeOnlyTexelCount", "correctedDepthTexelCount",
                "sourceByteLength", "sourceSha256",
            }, "native exact calibrated tile proof")
            if (
                not isinstance(calibration["correctedBakeOnlyTexelCount"], int)
                or calibration["correctedBakeOnlyTexelCount"] < 0
                or not isinstance(calibration["correctedDepthTexelCount"], int)
                or calibration["correctedDepthTexelCount"] < 0
                or calibration["sourceByteLength"] != byte_length
            ):
                fail(
                    "production_native_exact_calibrated_field_capture_invalid",
                    "An exact calibrated tile proof count or length is invalid.",
                )
            require_sha256(
                calibration["sourceSha256"],
                "native exact calibrated source tile digest",
            )
            corrected_bake_only_count = calibration["correctedBakeOnlyTexelCount"]
            corrected_depth_count = calibration["correctedDepthTexelCount"]
        residual_corrected_count = 0
        if receipt_schema == NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA:
            residual = capture["residualCalibration"]
            _require_keys(residual, {
                "correctedTexelCount", "sourceByteLength", "sourceSha256",
            }, "native residual tile proof")
            if (
                not isinstance(residual["correctedTexelCount"], int)
                or residual["correctedTexelCount"] < 0
                or residual["sourceByteLength"] != byte_length
            ):
                fail(
                    "production_native_residual_field_capture_invalid",
                    "A residual tile proof count or length is invalid.",
                )
            require_sha256(residual["sourceSha256"], "native residual source tile digest")
            residual_corrected_count = residual["correctedTexelCount"]
        return {
            "acceptedCandidateCount": 0,
            "candidateCount": 0,
            "chunkCount": 0,
            "excludedBakeOnlySampleCount": excluded_count,
            "correctedBakeOnlySampleCount": corrected_bake_only_count,
            "correctedDepthSampleCount": corrected_depth_count,
            "residualCorrectedTexelCount": residual_corrected_count,
        }
    if receipt_schema in NATIVE_CANDIDATE_FIELD_SCHEMAS:
        _require_keys(capture, {
            "candidateAuthority", "implementation", "sampling",
            "stateRestoration", "transfer",
        }, "native candidate tile capture")
        candidate = capture["candidateAuthority"]
        sampling = capture["sampling"]
        _require_keys(candidate, {
            "acceptedCandidateCount", "candidateCount", "chunkCount",
            "queryProjectionSha256", "resultProjectionSha256",
        }, "native textureGrad tile candidate authority")
        sampling_keys = {
            "alphaTest", "bindingId", "method", "schema", "texture",
        }
        if receipt_schema == NATIVE_IMPLICIT_GRADIENT_FIELD_RECEIPT_SCHEMA:
            sampling_keys.add("liveSourceToCacheLightAxisTransform")
        _require_keys(sampling, sampling_keys, "native textureGrad tile sampling")
        for key in ("acceptedCandidateCount", "candidateCount", "chunkCount"):
            if not isinstance(candidate[key], int) or candidate[key] < 0:
                fail(
                    "production_native_cutout_field_capture_invalid",
                    "A native textureGrad tile candidate count is invalid.",
                )
        if candidate["acceptedCandidateCount"] > candidate["candidateCount"]:
            fail(
                "production_native_cutout_field_capture_invalid",
                "A native textureGrad tile accepted more candidates than it evaluated.",
            )
        require_sha256(candidate["queryProjectionSha256"], "native textureGrad query digest")
        require_sha256(candidate["resultProjectionSha256"], "native textureGrad result digest")
        expected_sampling_identity = (
            (
                "ai531-production-alpha-cutout-native-implicit-gradient-capture-v3",
                "live-three-native-texture-implicit-gradient-instanced-2x2-rgba32f-readback-v3",
            )
            if receipt_schema == NATIVE_IMPLICIT_GRADIENT_FIELD_RECEIPT_SCHEMA
            else (
                "ai531-production-alpha-cutout-native-texture-grad-capture-v2",
                "live-three-native-texture-explicit-gradient-batched-rgba32f-readback-v2",
            )
        )
        if (
            sampling["schema"] != expected_sampling_identity[0]
            or sampling["method"] != expected_sampling_identity[1]
            or sampling["alphaTest"] != 0.5
            or (
                receipt_schema == NATIVE_IMPLICIT_GRADIENT_FIELD_RECEIPT_SCHEMA
                and sampling["liveSourceToCacheLightAxisTransform"]
                    != expected_axis_transform
            )
            or capture["stateRestoration"]
                != {"gl": "verified", "renderer": "verified"}
            or capture["transfer"] != {
                "component": "native-alpha-r-float32-readback-v1",
                "resultEncoding": "f32-little-endian-one-value-per-candidate-v1",
                "synchronization": "blocking-read-pixels-v1",
            }
            or not isinstance(capture["implementation"], dict)
        ):
            fail(
                "production_native_cutout_field_capture_invalid",
                "A native textureGrad tile lacks exact sampler and state-restoration proof.",
            )
        return {
            "acceptedCandidateCount": candidate["acceptedCandidateCount"],
            "candidateCount": candidate["candidateCount"],
            "chunkCount": candidate["chunkCount"],
            "excludedBakeOnlySampleCount": 0,
            "correctedBakeOnlySampleCount": 0,
            "correctedDepthSampleCount": 0,
            "residualCorrectedTexelCount": 0,
        }
    if (
        capture.get("plan") != {
            "byteLength": byte_length,
            "order": "x-fastest-bottom-row-first-v1",
            "region": {"height": height, "width": width, "x": 0, "y": 0},
            "texelCount": texel_count,
            "textureSize": [width, height],
        }
        or capture.get("sourceProof") != {
            "attachment": "DEPTH_ATTACHMENT",
            "attachmentDepthBits": 24,
            "attachmentMipLevel": 0,
            "attachmentObjectIdentity": "verified",
            "attachmentObjectType": "TEXTURE",
            "framebufferStatus": "FRAMEBUFFER_COMPLETE",
            "sampledTextureObjectIdentity": "same-object-v1",
            "sourceTextureCompareMode": 0,
            "temporarySamplerCompareMode": "NONE",
        }
        or capture.get("stateRestoration") != {"gl": "verified", "renderer": "verified"}
        or capture.get("transfer") != {
            "component": "depth-r-float32-v1",
            "pixelPackBuffer": "not-used",
            "synchronization": "blocking-get-buffer-sub-data-v1",
            "transformFeedbackPrimitive": "POINTS",
            "vertexIndex": "gl-instance-id-v1",
        }
        or not isinstance(capture.get("implementation"), dict)
    ):
        fail("production_native_cutout_field_capture_invalid", "A native cutout field tile lacks exact Depth24 source proof.")
    return {
        "acceptedCandidateCount": 0,
        "candidateCount": 0,
        "chunkCount": 0,
        "excludedBakeOnlySampleCount": 0,
        "correctedBakeOnlySampleCount": 0,
        "correctedDepthSampleCount": 0,
        "residualCorrectedTexelCount": 0,
    }


def _native_cutout_field_values(data: bytes, tile_id: str) -> array.array:
    values = array.array("f")
    values.frombytes(data)
    if values.itemsize != 4:
        fail("production_native_cutout_field_float_width_invalid", "The pinned Python runtime does not expose 32-bit float arrays.", tileId=tile_id)
    if sys.byteorder != "little":
        values.byteswap()
    return values


def _float32(value: float) -> float:
    return struct.unpack("<f", struct.pack("<f", float(value)))[0]


def _script_inventory(directory: Path) -> tuple[str, list[dict[str, Any]]]:
    inventory = []
    for path in sorted(directory.glob("*.py"), key=lambda item: item.name):
        data = path.read_bytes()
        inventory.append({"byteLength": len(data), "path": path.name, "sha256": sha256_bytes(data)})
    required = {"bsib.py", "canonical.py", "errors.py", "reconstruct.py", "scene.py"}
    if not required.issubset({entry["path"] for entry in inventory}):
        fail("production_ai529_inventory_incomplete", "The required AI 529 Blender modules are missing.")
    return sha256_bytes(canonical_json_bytes(inventory)), inventory


def _validate_request(value: Any) -> dict[str, Any]:
    expected = {
        "boundsMarginMeters",
        "casterSidedness",
        "guardPixels",
        "interiorPixels",
        "lightingProfileId",
        "maxPayloadBytes",
        "phasePolicy",
        "sampling",
        "schema",
        "sourceShadowCapability",
        "sunPointDirectionWorld",
        "texelSizeMeters",
        "tileSizeMeters",
    }
    _require_keys(value, expected, "request")
    _require_keys(value["sampling"], {"bias", "pcf"}, "request.sampling")
    _require_keys(
        value["sampling"]["bias"],
        {"constantDepthReliefMeters", "geometricNormalOffsetMeters", "model"},
        "request.sampling.bias",
    )
    _require_keys(
        value["sampling"]["pcf"],
        {
            "hardwareComparison",
            "model",
            "radiusTexels",
            "sampleCount",
            "screenRotation",
            "shadowMapSizeTexels",
            "shadowMapWorldExtentMeters",
            "sourceMapRightAxisWorld",
            "sourceMapUpAxisWorld",
        },
        "request.sampling.pcf",
    )
    _require_keys(
        value["sourceShadowCapability"],
        {"id", "mapSizeTexels", "worldExtentMeters"},
        "request.sourceShadowCapability",
    )
    direction = _unit_vector(value["sunPointDirectionWorld"], "request.sunPointDirectionWorld")
    if value["casterSidedness"] != CASTER_SIDEDNESS:
        fail("production_caster_sidedness_unsupported", "The authenticated caster-sidedness policy changed.", actual=value["casterSidedness"])
    pinned = {
        "tileSizeMeters": PRODUCTION_TILE_SIZE_METERS,
        "interiorPixels": PRODUCTION_INTERIOR_PIXELS,
        "guardPixels": 4,
        "boundsMarginMeters": 2,
        "casterSidedness": CASTER_SIDEDNESS,
        "maxPayloadBytes": MAX_PRODUCTION_PAYLOAD_BYTES,
        "phasePolicy": PRODUCTION_PHASE_POLICY,
        "texelSizeMeters": EXACT_TEXEL_SIZE_METERS,
    }
    if value.get("schema") != REQUEST_SCHEMA:
        fail("production_request_schema_unsupported", "The production request schema is unsupported.", actual=value.get("schema"))
    if not isinstance(value.get("lightingProfileId"), str) or not value["lightingProfileId"]:
        fail("production_lighting_profile_id_invalid", "The production request requires a lighting profile ID.")
    for field, expected_value in pinned.items():
        if value.get(field) != expected_value:
            fail("production_request_value_unsupported", "A pinned production layout value changed.", field=field, expected=expected_value, actual=value.get(field))
    expected_capability = {
        "id": SOURCE_SHADOW_CAPABILITY_ID,
        "mapSizeTexels": SOURCE_SHADOW_MAP_SIZE_TEXELS,
        "worldExtentMeters": SOURCE_SHADOW_MAP_WORLD_EXTENT_METERS,
    }
    if value["sourceShadowCapability"] != expected_capability:
        fail(
            "production_request_shadow_capability_unsupported",
            "The production request does not identify the observed effective source-shadow allocation.",
            expected=expected_capability,
            actual=value["sourceShadowCapability"],
        )
    expected_bias = {
        "constantDepthReliefMeters": 0.0697915,
        "geometricNormalOffsetMeters": 0.0232,
        "model": "geometric-normal-offset-plus-constant-depth-relief-v1",
    }
    if value["sampling"]["bias"] != expected_bias:
        fail("production_request_bias_unsupported", "The pinned geometric production bias changed.", actual=value["sampling"]["bias"])
    pcf = value["sampling"]["pcf"]
    expected_pcf = {
        "hardwareComparison": "linear-four-compare-taps-v1",
        "model": "three-r183-vogel-5-linear-compare-v1",
        "radiusTexels": SOURCE_SHADOW_FILTER_RADIUS_TEXELS,
        "sampleCount": 5,
        "screenRotation": "interleaved-gradient-noise-gl-fragcoord-v1",
        "shadowMapSizeTexels": SOURCE_SHADOW_MAP_SIZE_TEXELS,
        "shadowMapWorldExtentMeters": SOURCE_SHADOW_MAP_WORLD_EXTENT_METERS,
    }
    for field, expected_value in expected_pcf.items():
        if pcf.get(field) != expected_value:
            fail(
                "production_request_filter_unsupported",
                "The pinned Three r183 receiver filter changed.",
                field=field,
                expected=expected_value,
                actual=pcf.get(field),
            )
    right = _unit_vector(pcf["sourceMapRightAxisWorld"], "request.sampling.pcf.sourceMapRightAxisWorld")
    up = _unit_vector(pcf["sourceMapUpAxisWorld"], "request.sampling.pcf.sourceMapUpAxisWorld")
    expected_axes = _derive_three_r183_filter_axes(direction)
    if not _vectors_nearly_equal(right, expected_axes["rightAxisWorld"], 1e-12) or not _vectors_nearly_equal(up, expected_axes["upAxisWorld"], 1e-12):
        fail(
            "production_request_filter_axes_mismatch",
            "The source-shadow filter axes do not match an independent Three r183 derivation.",
            expected=expected_axes,
            actual={"rightAxisWorld": right, "upAxisWorld": up},
        )
    world_radius = pcf["radiusTexels"] * pcf["shadowMapWorldExtentMeters"][0] / pcf["shadowMapSizeTexels"][0]
    if world_radius != SOURCE_SHADOW_FILTER_WORLD_RADIUS_METERS:
        fail(
            "production_request_filter_radius_mismatch",
            "The effective source-shadow filter world radius changed.",
            expected=SOURCE_SHADOW_FILTER_WORLD_RADIUS_METERS,
            actual=world_radius,
        )
    return {
        "schema": REQUEST_SCHEMA,
        "casterSidedness": CASTER_SIDEDNESS,
        "lightingProfileId": value["lightingProfileId"],
        "sunPointDirectionWorld": direction,
        "tileSizeMeters": PRODUCTION_TILE_SIZE_METERS,
        "interiorPixels": PRODUCTION_INTERIOR_PIXELS,
        "guardPixels": 4,
        "boundsMarginMeters": 2,
        "maxPayloadBytes": MAX_PRODUCTION_PAYLOAD_BYTES,
        "phasePolicy": PRODUCTION_PHASE_POLICY,
        "texelSizeMeters": EXACT_TEXEL_SIZE_METERS,
        "sampling": {
            "bias": expected_bias,
            "pcf": {
                **expected_pcf,
                "sourceMapRightAxisWorld": right,
                "sourceMapUpAxisWorld": up,
            },
        },
        "sourceShadowCapability": expected_capability,
    }


def _validate_requested_light(manifest: dict[str, Any], request: dict[str, Any]) -> None:
    lighting = {entry["id"]: entry for entry in manifest["lightingProfiles"]}
    profile = lighting.get(request["lightingProfileId"])
    if profile is None or profile.get("type") != "directional_sun":
        fail("production_lighting_profile_missing", "The requested directional-sun profile is absent from the verified package.", id=request["lightingProfileId"])
    channel = next((entry for entry in manifest["channelProfiles"] if entry["id"] == CHANNEL_ID), None)
    profile_ids = channel.get("lightProfileIds") if isinstance(channel, dict) else None
    if not isinstance(profile_ids, list) or request["lightingProfileId"] not in profile_ids:
        fail("production_channel_light_mismatch", "The static-sun channel is not bound to the requested lighting profile.")
    if channel.get("casterSidedness") != request["casterSidedness"]:
        fail("production_channel_sidedness_mismatch", "The hashed channel caster-sidedness policy differs from the request.")
    declared = _unit_vector(profile.get("directionThree"), "lightingProfiles.directionThree")
    if any(abs(declared[index] - request["sunPointDirectionWorld"][index]) > 1e-12 for index in range(3)):
        fail("production_sun_direction_mismatch", "The production request direction differs from the hashed lighting profile.", expected=declared, actual=request["sunPointDirectionWorld"])


def _create_empty_output_root(path: Path) -> None:
    try:
        if path.exists() and any(path.iterdir()):
            fail("production_output_not_empty", "The production renderer refuses to overwrite a nonempty output directory.", path=str(path))
        path.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        fail("production_output_unwritable", "The production output directory could not be prepared.", reason=str(error))


def _required_collection(name: str) -> Any:
    import bpy

    collection = bpy.data.collections.get(name)
    if collection is None:
        fail("production_reconstruction_collection_missing", "AI 529 reconstruction did not expose its selected collection.", collection=name)
    return collection


def _exclude_native_owned_foliage_meshes(
    collection: Any,
    native_owned_mesh_instance_ids: frozenset[str],
) -> None:
    import bmesh
    import bpy

    if not native_owned_mesh_instance_ids:
        fail(
            "production_native_foliage_ownership_empty",
            "The authenticated native foliage field owns no reconstructed meshes.",
        )
    owned_objects = [
        blender_object
        for blender_object in collection.objects
        if blender_object.type == "MESH"
        and blender_object.get("bus_sim_stable_id") in native_owned_mesh_instance_ids
    ]
    owned_ids = {
        blender_object.get("bus_sim_stable_id")
        for blender_object in owned_objects
    }
    if owned_ids != set(native_owned_mesh_instance_ids):
        fail(
            "production_native_foliage_ownership_incomplete",
            "The reconstructed mesh inventory differs from authenticated native foliage ownership.",
            expectedCount=len(native_owned_mesh_instance_ids),
            actualCount=len(owned_ids),
        )
    for blender_object in owned_objects:
        cutout_indexes = {index for index, slot in enumerate(blender_object.material_slots) if slot.material and slot.material.get("bus_sim_coverage_mode") == "cutout"}
        mesh = bmesh.new()
        mesh.from_mesh(blender_object.data)
        cutout_faces = [face for face in mesh.faces if face.material_index in cutout_indexes]
        bmesh.ops.delete(mesh, geom=cutout_faces, context="FACES")
        mesh.to_mesh(blender_object.data)
        mesh.free()
        blender_object.data.update()
    bpy.context.view_layer.update()


def _convert_materials_to_depth(
    package: Any,
    collection: Any,
    basis: dict[str, Any],
    camera_origin_depth: float,
    caster_sidedness: dict[str, Any],
    excluded_mesh_instance_ids: frozenset[str] = frozenset(),
) -> dict[str, Any]:
    import bpy

    manifest = package.manifest
    materials = {entry["id"]: entry for entry in manifest["materials"]}
    alpha_inputs = {entry["id"]: entry for entry in manifest["alphaInputs"]}
    textures = {entry["id"]: entry for entry in manifest["textures"]}
    selected = [
        entry for entry in manifest["casterMappings"]
        if entry.get("channelRelevance", {}).get(CHANNEL_ID) is True
    ]
    expectations: dict[tuple[str, str], int] = {}
    cycles_expectations: dict[tuple[str, str], int] = {}
    for mapping in selected:
        material = materials[mapping["materialId"]]
        alpha = alpha_inputs[mapping["alphaInputId"]]
        mode = mapping.get("coverageMode")
        if mode not in ("opaque", "forced_opaque", "cutout"):
            fail("production_coverage_mode_unsupported", "A selected caster has unsafe production coverage semantics.", mappingId=mapping["id"], coverageMode=mode)
        if mapping.get("side") != material.get("side") or alpha.get("side") != material.get("side") or mapping.get("shadowSide") != material.get("shadowSide") or alpha.get("shadowSide") != material.get("shadowSide"):
            fail("production_sidedness_mismatch", "Caster, material, and alpha-input sidedness do not agree.", mappingId=mapping["id"])
        if mode == "cutout" and material.get("alpha", {}).get("mode") != "cutout":
            fail("production_cutout_semantics_mismatch", "A cutout caster does not resolve to exact cutout material semantics.", mappingId=mapping["id"])
        preserve = material.get("preserveShadowSide") is True or material.get("isFoliage") is True
        if mapping.get("preserveShadowSide") is not preserve:
            fail("production_sidedness_mismatch", "Caster preserveShadowSide differs from evaluated material flags.", mappingId=mapping["id"])
        expected_effective = _effective_shadow_side(
            mapping["side"], mapping.get("shadowSide"), preserve, caster_sidedness
        )
        effective = mapping.get("effectiveShadowSide")
        if effective not in (THREE_FRONT_SIDE, THREE_BACK_SIDE, THREE_DOUBLE_SIDE) or effective != expected_effective:
            fail("production_sidedness_mismatch", "Caster effectiveShadowSide does not recompute from the authenticated policy.", mappingId=mapping["id"], expected=expected_effective, actual=effective)
        key = (mapping["materialId"], mode)
        if key in expectations and expectations[key] != effective:
            fail("production_sidedness_ambiguous", "One reconstructed material variant has conflicting effective shadow sides.", materialId=key[0], coverageMode=key[1])
        expectations[key] = effective
        if mode != "cutout" or mapping["meshInstanceId"] not in excluded_mesh_instance_ids:
            if key in cycles_expectations and cycles_expectations[key] != effective:
                fail("production_sidedness_ambiguous", "One Cycles-owned material variant has conflicting effective shadow sides.", materialId=key[0], coverageMode=key[1])
            cycles_expectations[key] = effective

    converted = set()
    side_counts = {"front": 0, "back": 0, "double": 0}
    mode_counts = {"opaque": 0, "forced_opaque": 0, "cutout": 0}
    for (_material_id, mode), effective in expectations.items():
        mode_counts[mode] += 1
        side_counts[{THREE_FRONT_SIDE: "front", THREE_BACK_SIDE: "back", THREE_DOUBLE_SIDE: "double"}[effective]] += 1
    used_variants = set()
    for blender_object in sorted(collection.objects, key=lambda item: item.name):
        if blender_object.type != "MESH":
            continue
        for material_index in sorted({polygon.material_index for polygon in blender_object.data.polygons}):
            slot = blender_object.material_slots[material_index]
            material = slot.material
            if material is None:
                fail("production_material_slot_empty", "A reconstructed static caster has an empty material slot.", object=blender_object.name)
            material_id = material.get("bus_sim_stable_material_id")
            mode = material.get("bus_sim_coverage_mode")
            key = (material_id, mode)
            used_variants.add(key)
            effective = cycles_expectations.get(key)
            if effective is None:
                fail("production_material_variant_unowned", "A reconstructed material variant has no selected caster mapping.", materialId=material_id, coverageMode=mode)
            variant = material.name
            if variant in converted:
                continue
            _replace_lit_surface_with_depth(
                material,
                mode,
                effective,
                basis,
                camera_origin_depth,
            )
            material["bus_sim_effective_shadow_side"] = effective
            converted.add(variant)

    if set(cycles_expectations) != used_variants:
        fail("production_material_variant_incomplete", "The reconstructed Cycles-owned material variants do not exactly cover selected non-foliage caster mappings.")
    bpy.context.view_layer.update()
    cutout_ids = sorted({material_id for material_id, mode in expectations if mode == "cutout"})
    coverage_inputs = _cutout_coverage_inputs(cutout_ids, materials, alpha_inputs, textures)
    return {
        "alphaCertification": {
            "coverageInputs": coverage_inputs,
            "cutoutMaterialCount": len(cutout_ids),
            "cutoutMaterialIds": cutout_ids,
            "exactCoverageInputCount": sum(len(entry["inputs"]) for entry in coverage_inputs),
            "forcedOpaqueMaterialVariantCount": mode_counts["forced_opaque"],
        },
        "coverageModeMaterialVariantCounts": mode_counts,
        "effectiveShadowSideMaterialVariantCounts": side_counts,
    }


def _replace_lit_surface_with_depth(
    material: Any,
    coverage_mode: str,
    effective_side: int,
    basis: dict[str, Any],
    camera_origin_depth: float,
    suppress_cutout_coverage: bool = False,
) -> None:
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    outputs = [node for node in nodes if node.bl_idname == "ShaderNodeOutputMaterial" and node.is_active_output]
    principled = [node for node in nodes if node.bl_idname == "ShaderNodeBsdfPrincipled"]
    if len(outputs) != 1 or len(principled) != 1:
        fail("production_depth_material_shape_invalid", "The reconstructed material has an unexpected lit surface graph.", material=material.name)
    principled = principled[0]
    output_surface = outputs[0].inputs["Surface"]
    lit_links = [link for link in links if link.from_node == principled and link.from_socket == principled.outputs[0]]
    if len(lit_links) != 1:
        fail("production_depth_material_link_invalid", "The reconstructed lit surface does not have one replaceable output.", material=material.name)
    if coverage_mode == "cutout":
        coverage_mix = lit_links[0].to_node
        if coverage_mix.bl_idname != "ShaderNodeMixShader" or lit_links[0].to_socket != coverage_mix.inputs[2]:
            fail(
                "production_cutout_material_shape_invalid",
                "The reconstructed cutout material has no exact coverage mix around its lit surface.",
                material=material.name,
            )
        coverage_links = [link for link in links if link.to_socket == coverage_mix.inputs[0]]
        if len(coverage_links) != 1:
            fail(
                "production_cutout_coverage_link_invalid",
                "The reconstructed cutout material has no unique exact coverage output.",
                material=material.name,
            )
        if suppress_cutout_coverage:
            suppressed = nodes.new("ShaderNodeValue")
            suppressed.outputs[0].default_value = 0.0
            coverage_keep = suppressed.outputs[0]
        else:
            coverage_keep = coverage_links[0].from_socket
    elif coverage_mode in ("opaque", "forced_opaque"):
        opaque_keep = nodes.new("ShaderNodeValue")
        opaque_keep.outputs[0].default_value = 1.0
        coverage_keep = opaque_keep.outputs[0]
    else:
        fail(
            "production_depth_coverage_mode_unsupported",
            "The production depth adapter received an unsupported coverage mode.",
            material=material.name,
            coverageMode=coverage_mode,
        )
    geometry = nodes.new("ShaderNodeNewGeometry")
    alpha_keep = coverage_keep
    if effective_side != THREE_DOUBLE_SIDE:
        side_keep = geometry.outputs["Backfacing"]
        if effective_side == THREE_FRONT_SIDE:
            invert = nodes.new("ShaderNodeMath")
            invert.operation = "SUBTRACT"
            invert.inputs[0].default_value = 1.0
            links.new(side_keep, invert.inputs[1])
            side_keep = invert.outputs[0]
        elif effective_side != THREE_BACK_SIDE:
            fail(
                "production_depth_shadow_side_unsupported",
                "The production depth adapter received an unsupported effective shadow side.",
                material=material.name,
                effectiveSide=effective_side,
            )
        coverage_and_side = nodes.new("ShaderNodeMath")
        coverage_and_side.operation = "MULTIPLY"
        links.new(coverage_keep, coverage_and_side.inputs[0])
        links.new(side_keep, coverage_and_side.inputs[1])
        alpha_keep = coverage_and_side.outputs[0]

    def reset_socket(name: str, value: Any) -> Any:
        socket = principled.inputs.get(name)
        if socket is None:
            return None
        for link in list(socket.links):
            links.remove(link)
        socket.default_value = value
        return socket

    reset_socket("Base Color", (0.0, 0.0, 0.0, 1.0))
    reset_socket("Metallic", 0.0)
    reset_socket("Roughness", 1.0)
    reset_socket("IOR", 1.0)
    reset_socket("Specular IOR Level", 0.0)
    reset_socket("Coat Weight", 0.0)
    reset_socket("Transmission Weight", 0.0)
    emission_color = reset_socket("Emission Color", (0.0, 0.0, 0.0, 1.0))
    emission_strength = reset_socket("Emission Strength", 0.0)
    alpha_socket = reset_socket("Alpha", 1.0)
    if emission_color is None or emission_strength is None or alpha_socket is None:
        fail(
            "production_depth_principled_socket_missing",
            "The pinned Blender Principled BSDF lacks a required production depth socket.",
            material=material.name,
        )
    links.new(alpha_keep, alpha_socket)

    for link in list(output_surface.links):
        links.remove(link)
    links.new(principled.outputs[0], output_surface)
    material.surface_render_method = "DITHERED"
    material.use_backface_culling = False
    material["bus_sim_depth_surface"] = (
        "cycles_z_pass_with_binary_principled_visibility_v1"
    )
    material["bus_sim_alpha_preservation"] = (
        (
            "suppressed_for_authenticated_native_three_cutout_field_merge_v1"
            if suppress_cutout_coverage
            else "exact_reconstructed_binary_coverage_into_principled_alpha_v1"
        )
        if coverage_mode == "cutout"
        else "opaque_principled_alpha_v1"
    )
    material.node_tree.update_tag()
    material.update_tag()


def _filter_direction_invisible_polygons(
    collection: Any,
    basis: dict[str, Any],
) -> dict[str, Any]:
    import bmesh
    from mathutils import Vector

    direction = Vector(
        _three_to_blender(basis["basis"]["depthAxisWorld"])
    ).normalized()
    source_polygon_count = 0
    visible_polygon_count = 0
    removed_polygon_count = 0
    filtered_object_count = 0
    unchanged_object_count = 0
    for blender_object in sorted(collection.objects, key=lambda item: item.name):
        if blender_object.type != "MESH":
            continue
        source_mesh = blender_object.data
        invisible_indices = []
        for polygon in source_mesh.polygons:
            source_polygon_count += 1
            slot = blender_object.material_slots[polygon.material_index]
            material = slot.material
            if material is None:
                fail(
                    "production_direction_filter_material_missing",
                    "A reconstructed polygon has no material for directional filtering.",
                    object=blender_object.name,
                    polygonIndex=int(polygon.index),
                )
            side = int(material.get("bus_sim_effective_shadow_side"))
            if side == THREE_DOUBLE_SIDE:
                visible_polygon_count += 1
                continue
            first_vertex, second_vertex, third_vertex = (
                blender_object.matrix_world @ source_mesh.vertices[index].co
                for index in polygon.vertices
            )
            geometric_normal = (second_vertex - first_vertex).cross(
                third_vertex - first_vertex
            )
            if geometric_normal.length_squared <= 0.0:
                fail(
                    "production_direction_filter_polygon_degenerate",
                    "Reconstructed static-sun geometry contains a degenerate render triangle.",
                    object=blender_object.name,
                    polygonIndex=int(polygon.index),
                )
            backfacing = geometric_normal.dot(direction) > 0.0
            visible = (
                side == THREE_BACK_SIDE and backfacing
                or side == THREE_FRONT_SIDE and not backfacing
            )
            if visible:
                visible_polygon_count += 1
            else:
                invisible_indices.append(int(polygon.index))
                removed_polygon_count += 1
        if not invisible_indices:
            unchanged_object_count += 1
            continue
        filtered_mesh = source_mesh.copy()
        filtered_mesh.name = source_mesh.name + "_AI531_DIRECTION_VISIBLE"
        blender_object.data = filtered_mesh
        mesh_edit = bmesh.new()
        try:
            mesh_edit.from_mesh(filtered_mesh)
            mesh_edit.faces.ensure_lookup_table()
            bmesh.ops.delete(
                mesh_edit,
                geom=[mesh_edit.faces[index] for index in invisible_indices],
                context="FACES",
            )
            mesh_edit.to_mesh(filtered_mesh)
        finally:
            mesh_edit.free()
        filtered_mesh.update(calc_edges=True)
        expected_polygon_count = len(source_mesh.polygons) - len(invisible_indices)
        if len(filtered_mesh.polygons) != expected_polygon_count:
            fail(
                "production_direction_filter_count_mismatch",
                "Direction-filtered render geometry did not retain the exact visible polygon count.",
                object=blender_object.name,
                expected=expected_polygon_count,
                actual=len(filtered_mesh.polygons),
            )
        filtered_mesh["bus_sim_direction_filter"] = (
            "world_space_direction_invisible_faces_removed_v1"
        )
        filtered_object_count += 1
    if source_polygon_count <= 0 or visible_polygon_count <= 0:
        fail(
            "production_direction_filter_geometry_missing",
            "Directional render filtering found no usable reconstructed polygons.",
        )
    if visible_polygon_count + removed_polygon_count != source_polygon_count:
        fail(
            "production_direction_filter_inventory_mismatch",
            "Directional render filtering did not exactly partition source polygons.",
            sourcePolygonCount=source_polygon_count,
            visiblePolygonCount=visible_polygon_count,
            removedPolygonCount=removed_polygon_count,
        )
    return {
        "algorithm": "world_space_direction_filtered_mesh_faces_v1",
        "filteredObjectCount": filtered_object_count,
        "removedPolygonCount": removed_polygon_count,
        "sourcePolygonCount": source_polygon_count,
        "unchangedObjectCount": unchanged_object_count,
        "visiblePolygonCount": visible_polygon_count,
    }


def _effective_shadow_side(side: Any, shadow_side: Any, preserve_shadow_side: Any, caster_sidedness: Any) -> int:
    if side not in (THREE_FRONT_SIDE, THREE_BACK_SIDE, THREE_DOUBLE_SIDE) or shadow_side not in (None, THREE_FRONT_SIDE, THREE_BACK_SIDE, THREE_DOUBLE_SIDE):
        fail("production_side_value_unsupported", "A caster side value is outside the Three.js V1 enum.", side=side, shadowSide=shadow_side)
    if not isinstance(preserve_shadow_side, bool) or caster_sidedness != CASTER_SIDEDNESS:
        fail("production_side_policy_unsupported", "A caster sidedness policy or preserve flag is invalid.")
    authored_effective = shadow_side if shadow_side is not None else {
        THREE_FRONT_SIDE: THREE_BACK_SIDE,
        THREE_BACK_SIDE: THREE_FRONT_SIDE,
        THREE_DOUBLE_SIDE: THREE_DOUBLE_SIDE,
    }[side]
    return authored_effective if preserve_shadow_side else THREE_DOUBLE_SIDE


def _cutout_coverage_inputs(cutout_ids: list[str], materials: dict[str, Any], alpha_inputs: dict[str, Any], textures: dict[str, Any]) -> list[dict[str, Any]]:
    results = []
    for material_id in cutout_ids:
        material = materials[material_id]
        alpha = alpha_inputs[material["alphaInputId"]]
        inputs = []
        for entry in alpha["alpha"]["inputs"]:
            binding = textures[entry["bindingId"]]
            source = textures[binding["sourceId"]]
            coverage = source["coverageChannels"][entry["channel"]]
            inputs.append({
                "bindingId": binding["id"],
                "channel": entry["channel"],
                "coverageBufferId": f"{source['id']}:coverage:{entry['channel']}",
                "coverageSha256": coverage["sha256"],
                "operation": entry["operation"],
                "sourceContentSha256": source["contentSha256"],
                "sourceId": source["id"],
            })
        if not inputs:
            fail("production_cutout_coverage_missing", "A cutout material has no exact coverage-buffer input.", materialId=material_id)
        results.append({
            "alphaInputId": alpha["id"],
            "alphaTest": alpha["alpha"]["alphaTest"],
            "inputs": sorted(inputs, key=lambda item: (item["bindingId"], item["channel"])),
            "materialId": material_id,
            "opacity": alpha["alpha"]["opacity"],
            "vertexColors": alpha["vertexColors"],
        })
    return results


def _verified_source_map_receiver_domain(
    manifest: dict[str, Any],
    caster_minimum: list[float],
    caster_maximum: list[float],
) -> dict[str, Any]:
    source = manifest.get("source")
    if not isinstance(source, dict) or source.get("schema") != "bus-sim-resolved-city-source-v1":
        fail(
            "production_source_map_invalid",
            "The verified package has no resolved-city source authority for the receiver footprint.",
        )
    origin = source.get("origin")
    source_map = source.get("map")
    if not isinstance(origin, dict) or not isinstance(source_map, dict):
        fail(
            "production_source_map_invalid",
            "The verified resolved-city source has no map origin or dimensions.",
        )

    def finite_number(value: Any, path: str) -> float:
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            fail(
                "production_source_map_invalid",
                "A verified source-map receiver value is not finite.",
                path=path,
            )
        return _clean_zero(float(value))

    origin_world = [finite_number(origin.get(axis), f"source.origin.{axis}") for axis in ("x", "y", "z")]
    width_value = source_map.get("width")
    height_value = source_map.get("height")
    if (
        not isinstance(width_value, (int, float))
        or isinstance(width_value, bool)
        or not math.isfinite(width_value)
        or int(width_value) != width_value
        or int(width_value) <= 0
        or not isinstance(height_value, (int, float))
        or isinstance(height_value, bool)
        or not math.isfinite(height_value)
        or int(height_value) != height_value
        or int(height_value) <= 0
    ):
        fail(
            "production_source_map_invalid",
            "The verified source-map receiver dimensions are not positive integers.",
        )
    width = int(width_value)
    height = int(height_value)
    tile_size = finite_number(source_map.get("tileSizeMeters"), "source.map.tileSizeMeters")
    if tile_size <= 0:
        fail(
            "production_source_map_invalid",
            "The verified source-map tile size is not positive.",
            actual=tile_size,
        )
    minimum_x = origin_world[0] - tile_size * 0.5
    minimum_z = origin_world[2] - tile_size * 0.5
    maximum_x = minimum_x + width * tile_size
    maximum_z = minimum_z + height * tile_size
    if not all(math.isfinite(value) for value in (minimum_x, minimum_z, maximum_x, maximum_z)):
        fail(
            "production_source_map_invalid",
            "The verified source-map receiver footprint overflowed finite world coordinates.",
        )
    minimum_y = min(caster_minimum[1], origin_world[1])
    maximum_y = max(caster_maximum[1], origin_world[1])
    minimum = [_clean_zero(minimum_x), _clean_zero(minimum_y), _clean_zero(minimum_z)]
    maximum = [_clean_zero(maximum_x), _clean_zero(maximum_y), _clean_zero(maximum_z)]
    corners = [
        [x, y, z]
        for x in (minimum[0], maximum[0])
        for y in (minimum[1], maximum[1])
        for z in (minimum[2], maximum[2])
    ]
    return {
        "corners": corners,
        "sourceMap": {
            "edgePolicy": "origin_is_first_tile_center_expand_half_tile_v1",
            "heightTiles": height,
            "originWorld": origin_world,
            "tileSizeMeters": tile_size,
            "widthTiles": width,
        },
        "worldBoundsMeters": {"min": minimum, "max": maximum},
    }


def _derive_basis_and_bounds(
    collection: Any,
    request: dict[str, Any],
    manifest: dict[str, Any],
    output_encoding: str,
) -> dict[str, Any]:
    caster_corners = []
    for blender_object in sorted(collection.objects, key=lambda item: item.name):
        if blender_object.type != "MESH":
            continue
        for corner in blender_object.bound_box:
            world = blender_object.matrix_world @ _vector(corner)
            caster_corners.append(_blender_to_three(world))
    if not caster_corners:
        fail("production_bounds_empty", "The reconstructed static-sun collection has no mesh bounds.")
    caster_minimum = [min(point[index] for point in caster_corners) for index in range(3)]
    caster_maximum = [max(point[index] for point in caster_corners) for index in range(3)]
    receiver_domain = _verified_source_map_receiver_domain(manifest, caster_minimum, caster_maximum)
    receiver_corners = receiver_domain["corners"]
    corners = caster_corners + receiver_corners
    minimum = [min(point[index] for point in corners) for index in range(3)]
    maximum = [max(point[index] for point in corners) for index in range(3)]
    origin = [_clean_zero((minimum[index] + maximum[index]) * 0.5) for index in range(3)]
    point_direction = request["sunPointDirectionWorld"]
    normalized_point_direction = _normalize(point_direction)
    depth = [_clean_zero(-value) for value in normalized_point_direction]
    references = ([1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0])
    reference = min(enumerate(references), key=lambda item: (abs(_dot(item[1], depth)), item[0]))[1]
    right = _normalize(_cross(reference, depth))
    up = _normalize(_cross(depth, right))
    caster_projected = [
        [_dot(_subtract(point, origin), axis) for axis in (right, up, depth)]
        for point in caster_corners
    ]
    receiver_projected = [
        [_dot(_subtract(point, origin), axis) for axis in (right, up, depth)]
        for point in receiver_corners
    ]
    projected = caster_projected + receiver_projected
    raw_min = [min(value[index] for value in projected) for index in range(3)]
    raw_max = [max(value[index] for value in projected) for index in range(3)]
    raw_caster_min = [min(value[index] for value in caster_projected) for index in range(3)]
    raw_caster_max = [max(value[index] for value in caster_projected) for index in range(3)]
    raw_receiver_min = [min(value[index] for value in receiver_projected) for index in range(3)]
    raw_receiver_max = [max(value[index] for value in receiver_projected) for index in range(3)]
    margin = request["boundsMarginMeters"]
    tile_size = request["tileSizeMeters"]
    texel_size = request["texelSizeMeters"]
    spans = [raw_max[index] - raw_min[index] + margin * 2 for index in (0, 1)]
    origin_projection = [_dot(origin, axis) for axis in (right, up)]
    axis_layout = [
        _derive_phase_locked_axis_layout(
            raw_min[index],
            raw_max[index],
            margin,
            tile_size[index],
            texel_size,
            origin_projection[index],
        )
        for index in (0, 1)
    ]
    tile_count = [entry["tileCount"] for entry in axis_layout]
    layer_count = tile_count[0] * tile_count[1]
    if layer_count > MAX_LAYER_COUNT:
        fail("production_layer_count_exceeded", "Derived production tiling exceeds the V1 texture-array layer ceiling.", layerCount=layer_count, maximum=MAX_LAYER_COUNT)
    bounds_min = [entry["boundsMinimumLightMeters"] for entry in axis_layout]
    bounds_max = [
        bounds_min[index] + tile_count[index] * tile_size[index]
        for index in (0, 1)
    ]
    min_depth = raw_min[2] - margin
    max_depth = raw_max[2] + margin
    if not min_depth < max_depth:
        fail("production_depth_range_invalid", "Derived signed light-depth bounds are not increasing.")
    stored = [
        request["interiorPixels"][index] + request["guardPixels"] * 2
        for index in (0, 1)
    ]
    logical_bytes_per_texel = 4 if output_encoding == "rgba8_rgb24a" else 2
    final_payload_bytes = (
        stored[0] * stored[1] * logical_bytes_per_texel * layer_count
    )
    if final_payload_bytes > request["maxPayloadBytes"]:
        fail("production_payload_budget_exceeded", "Derived guarded payload exceeds the production request budget.", byteLength=final_payload_bytes, maximum=request["maxPayloadBytes"], layerCount=layer_count, outputEncoding=output_encoding)
    tiles = []
    for y in range(tile_count[1]):
        for x in range(tile_count[0]):
            tile_min = [
                bounds_min[0] + x * tile_size[0],
                bounds_min[1] + y * tile_size[1],
            ]
            tiles.append({
                "coordinates": [x, y],
                "id": f"tile_{x:04d}_{y:04d}",
                "interiorBoundsLightMeters": {
                    "min": tile_min,
                    "max": [
                        tile_min[0] + tile_size[0],
                        tile_min[1] + tile_size[1],
                    ],
                },
            })
    return {
        "basis": {
            "depthAxisWorld": depth,
            "originWorld": origin,
            "policy": "least-aligned-world-axis-v1",
            "rightAxisWorld": right,
            "upAxisWorld": up,
        },
        "depth": {
            "maxDepthMeters": max_depth,
            "minDepthMeters": min_depth,
            "rawCasterBoundsMaxDepthMeters": raw_caster_max[2],
            "rawCasterBoundsMinDepthMeters": raw_caster_min[2],
            "rawCombinedBoundsMaxDepthMeters": raw_max[2],
            "rawCombinedBoundsMinDepthMeters": raw_min[2],
            "rawReceiverMapBoundsMaxDepthMeters": raw_receiver_max[2],
            "rawReceiverMapBoundsMinDepthMeters": raw_receiver_min[2],
        },
        "derivation": {
            "boundsInput": "reconstructed_static_sun_object_bounds_plus_verified_source_map_receiver_footprint_v1",
            "boundsMarginMeters": margin,
            "casterCornerCount": len(caster_corners),
            "casterWorldBoundsMeters": {"min": caster_minimum, "max": caster_maximum},
            "centering": "minimum_whole_tiles_then_nearest_valid_absolute_texel_edge_v2",
            "cornerCount": len(corners),
            "receiverMapCornerCount": len(receiver_corners),
            "receiverMapWorldBoundsMeters": receiver_domain["worldBoundsMeters"],
            "sourceMap": receiver_domain["sourceMap"],
            "phaseAlignment": {
                "absoluteBoundsMinimumTexelIndices": [
                    entry["absoluteBoundsMinimumTexelIndex"]
                    for entry in axis_layout
                ],
                "absoluteOriginProjectionMeters": origin_projection,
                "maximumEdgePhaseErrorTexels": max(
                    entry["edgePhaseErrorTexels"]
                    for entry in axis_layout
                ),
                "policy": request["phasePolicy"],
                "texelSizeMeters": texel_size,
            },
        },
        "layout": {
            "boundsLightMeters": {"min": bounds_min, "max": bounds_max},
            "finalGuardedPayloadBytes": final_payload_bytes,
            "guardPixels": request["guardPixels"],
            "interiorPixels": request["interiorPixels"],
            "layerCount": layer_count,
            "order": "row-major-y-then-x-v1",
            "storedPixels": stored,
            "texelSizeMeters": texel_size,
            "tileCount": tile_count,
            "tileSizeMeters": tile_size,
        },
        "sunPointDirectionWorld": point_direction,
        "tiles": tiles,
    }


def _derive_phase_locked_axis_layout(
    raw_minimum: float,
    raw_maximum: float,
    margin: float,
    tile_size: float,
    texel_size: float,
    absolute_origin_projection: float,
) -> dict[str, Any]:
    required_minimum = raw_minimum - margin
    required_maximum = raw_maximum + margin
    tile_count = max(1, math.ceil((required_maximum - required_minimum) / tile_size))
    epsilon = 1e-9
    while True:
        minimum_index = math.ceil(
            (
                required_maximum
                - tile_count * tile_size
                + absolute_origin_projection
            ) / texel_size - epsilon
        )
        maximum_index = math.floor(
            (required_minimum + absolute_origin_projection) / texel_size
            + epsilon
        )
        if minimum_index <= maximum_index:
            break
        tile_count += 1
    centered_absolute_edge = (
        required_minimum
        + required_maximum
        - tile_count * tile_size
    ) * 0.5 + absolute_origin_projection
    nearest_index = math.floor(centered_absolute_edge / texel_size + 0.5)
    edge_index = min(maximum_index, max(minimum_index, nearest_index))
    bounds_minimum = edge_index * texel_size - absolute_origin_projection
    bounds_maximum = bounds_minimum + tile_count * tile_size
    tolerance = 1e-9
    if (
        bounds_minimum > required_minimum + tolerance
        or bounds_maximum < required_maximum - tolerance
    ):
        fail(
            "production_phase_locked_bounds_invalid",
            "Phase-locked production bounds do not cover the required axis interval.",
            boundsMinimum=bounds_minimum,
            boundsMaximum=bounds_maximum,
            requiredMinimum=required_minimum,
            requiredMaximum=required_maximum,
        )
    phase_value = (bounds_minimum + absolute_origin_projection) / texel_size
    phase_error = abs(phase_value - edge_index)
    if phase_error > 1e-9:
        fail(
            "production_phase_alignment_failed",
            "Production bounds did not land on the absolute live-shadow texel lattice.",
            phaseErrorTexels=phase_error,
        )
    return {
        "absoluteBoundsMinimumTexelIndex": edge_index,
        "boundsMinimumLightMeters": _clean_zero(bounds_minimum),
        "edgePhaseErrorTexels": phase_error,
        "tileCount": tile_count,
    }


def _configure_production_scene(
    scene: Any,
    profile: BakeProfile,
    basis: dict[str, Any],
    request: dict[str, Any],
    row_strip_pixels: int,
    camera_origin_depth: float,
) -> dict[str, Any]:
    import bpy
    from mathutils import Matrix, Vector

    if row_strip_pixels != request["interiorPixels"][1]:
        fail(
            "production_row_strip_invalid",
            "The production renderer requires one full-height deterministic row strip per tile.",
            actual=row_strip_pixels,
            expected=request["interiorPixels"][1],
        )
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = profile.thread_count
    scene.render.use_persistent_data = True
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.exr_codec = "ZIP"
    scene.render.use_compositing = True
    view_layer = scene.view_layers[0]
    view_layer.use_pass_z = True
    compositor = bpy.data.node_groups.new(
        "AI531 Production Z Pass",
        "CompositorNodeTree",
    )
    scene.compositing_node_group = compositor
    render_layers = compositor.nodes.new("CompositorNodeRLayers")
    if "Depth" not in render_layers.outputs or "Alpha" not in render_layers.outputs:
        fail(
            "production_depth_pass_missing",
            "The pinned Blender view layer did not expose required Depth and Alpha passes.",
        )
    combine = compositor.nodes.new("CompositorNodeCombineColor")
    combine.mode = "RGB"
    for name in ("Red", "Green", "Blue"):
        compositor.links.new(render_layers.outputs["Depth"], combine.inputs[name])
    compositor.links.new(render_layers.outputs["Alpha"], combine.inputs["Alpha"])
    compositor.interface.new_socket(
        name="Image",
        in_out="OUTPUT",
        socket_type="NodeSocketColor",
    )
    group_output = compositor.nodes.new("NodeGroupOutput")
    compositor.links.new(combine.outputs["Image"], group_output.inputs["Image"])
    scene.render.resolution_x = request["interiorPixels"][0]
    scene.render.resolution_y = request["interiorPixels"][1]
    scene.render.resolution_percentage = 100
    if hasattr(scene.cycles, "pixel_filter_type"):
        scene.cycles.pixel_filter_type = "BOX"
    if hasattr(scene.cycles, "filter_width"):
        scene.cycles.filter_width = 0.01
    camera_data = bpy.data.cameras.new("AI531_Production_Sun_Camera")
    camera_data.type = "ORTHO"
    # Blender defines orthographic scale as the horizontal view width. The
    # render aspect then derives the rectangular Y span exactly.
    camera_data.ortho_scale = request["tileSizeMeters"][0]
    clip_start = float(profile.data["camera"]["clipStartMeters"])
    expected_camera_origin_depth = basis["depth"]["minDepthMeters"] - clip_start
    if abs(camera_origin_depth - expected_camera_origin_depth) > 1e-12:
        fail(
            "production_camera_depth_origin_invalid",
            "The fixed material and camera depth origins differ.",
        )
    camera_data.clip_start = clip_start * 0.5
    camera_data.clip_end = basis["depth"]["maxDepthMeters"] - camera_origin_depth + clip_start
    camera = bpy.data.objects.new("AI531_Production_Sun_Camera", camera_data)
    configure_camera_determinism(camera)
    bpy.context.scene.collection.objects.link(camera)
    scene.camera = camera
    axes = basis["basis"]
    right = Vector(_three_to_blender(axes["rightAxisWorld"]))
    up = Vector(_three_to_blender(axes["upAxisWorld"]))
    depth = Vector(_three_to_blender(axes["depthAxisWorld"]))
    origin = Vector(_three_to_blender(axes["originWorld"]))
    position = origin + depth * camera_origin_depth
    # The stable light basis has right x up = depth. A Blender camera views
    # along local -Z, so negating both local X and Z preserves a proper
    # rotation; captured X is mirrored back to +light-X during readback.
    camera.matrix_world = Matrix((
        (-right.x, up.x, -depth.x, position.x),
        (-right.y, up.y, -depth.y, position.y),
        (-right.z, up.z, -depth.z, position.z),
        (0.0, 0.0, 0.0, 1.0),
    ))
    rotation_determinant = float(camera.matrix_world.to_3x3().determinant())
    if abs(rotation_determinant - 1.0) > 1e-9:
        fail(
            "production_camera_handedness_invalid",
            "The production camera transform is not a proper rotation.",
            determinant=rotation_determinant,
        )
    camera["bus_sim_camera_origin_depth_meters"] = camera_origin_depth
    camera["bus_sim_point_sun_direction_world"] = json.dumps(request["sunPointDirectionWorld"], separators=(",", ":"))
    return {
        "cameraClipEndMeters": camera_data.clip_end,
        "cameraClipStartMeters": camera_data.clip_start,
        "cameraOriginDepthMeters": camera_origin_depth,
        "cyclesDevice": "CPU",
        "depthReadback": "cycles_z_pass_composited_to_rgb_with_render_alpha_v1",
        "gpuAllowed": False,
        "persistentData": True,
        "primaryRaySamples": 1,
        "rowStripPixels": row_strip_pixels,
    }


def _render_tiles(
    scene: Any,
    basis: dict[str, Any],
    request: dict[str, Any],
    output_root: Path,
    output_encoding: str,
    row_strip_pixels: int,
    sample_plan: list[dict[str, int]],
    opaque_truth: dict[str, Any],
    native_cutout_field: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int], dict[tuple[int, int, int], tuple[bool, float | None]], dict[str, Any]]:
    import bpy
    from mathutils import Vector

    camera = scene.camera
    axes = basis["basis"]
    origin = Vector(_three_to_blender(axes["originWorld"]))
    right = Vector(_three_to_blender(axes["rightAxisWorld"]))
    up = Vector(_three_to_blender(axes["upAxisWorld"]))
    depth = Vector(_three_to_blender(axes["depthAxisWorld"]))
    camera_origin_depth = float(camera["bus_sim_camera_origin_depth_meters"])
    resolution_x = request["interiorPixels"][0]
    resolution_y = request["interiorPixels"][1]
    sample_keys = {(entry["tileIndex"], entry["x"], entry["y"]) for entry in sample_plan}
    opaque_rendered_samples: dict[
        tuple[int, int, int], tuple[bool, float | None]
    ] = {}
    merged_rendered_samples: dict[
        tuple[int, int, int], tuple[bool, float | None]
    ] = {}
    outputs = []
    counts = {"occupied": 0, "transparent": 0}
    depth_max_code = (
        DIAGNOSTIC_DEPTH_MAX_CODE
        if output_encoding == "rgba8_rgb24a"
        else DEPTH_MAX_CODE
    )
    quantized_min = depth_max_code
    quantized_max = 0
    source_min = math.inf
    source_max = -math.inf
    maximum_decode_error = 0.0
    decode_error_sum = 0.0
    capture_root = output_root / ".render_strips"
    capture_root.mkdir(parents=True, exist_ok=False)
    for tile_index, tile in enumerate(basis["tiles"]):
        native_values = None
        if native_cutout_field is not None:
            native_output = native_cutout_field["outputsByTileId"].get(tile["id"])
            if native_output is None:
                fail(
                    "production_native_cutout_field_tile_missing",
                    "The authenticated native cutout field has no entry for a render tile.",
                    tileId=tile["id"],
                )
            native_data = native_output["path"].read_bytes()
            if sha256_bytes(native_data) != native_output["sha256"]:
                fail(
                    "production_native_cutout_field_tile_changed",
                    "A native cutout field tile changed after pre-render authentication.",
                    tileId=tile["id"],
                )
            native_values = _native_cutout_field_values(native_data, tile["id"])
        bounds = tile["interiorBoundsLightMeters"]
        center_x = (bounds["min"][0] + bounds["max"][0]) * 0.5
        center_y = (bounds["min"][1] + bounds["max"][1]) * 0.5
        camera.location = origin + right * center_x + up * center_y + depth * camera_origin_depth
        if scene.cycles.device != "CPU":
            fail("production_gpu_device_forbidden", "The production renderer left the required CPU Cycles device.", actual=scene.cycles.device)
        bytes_per_pixel = {
            "rg8": 2,
            "rgba8_rgb24a": 4,
            "rgba_f32le": 16,
        }[output_encoding]
        payload = bytearray(resolution_x * resolution_y * bytes_per_pixel)
        tile_occupied = 0
        tile_transparent = 0
        for row_start in range(0, resolution_y, row_strip_pixels):
            row_count = min(row_strip_pixels, resolution_y - row_start)
            scene.render.use_border = True
            scene.render.use_crop_to_border = True
            scene.render.border_min_x = 0.0
            scene.render.border_max_x = 1.0
            scene.render.border_min_y = row_start / resolution_y
            scene.render.border_max_y = (row_start + row_count) / resolution_y
            capture_path = capture_root / f"{tile['id']}.rows_{row_start:04d}_{row_start + row_count:04d}.exr"
            pixels = _capture_render_strip(scene, capture_path, resolution_x, row_count)
            for local_y in range(row_count):
                y = row_start + local_y
                for x in range(resolution_x):
                    target_x = resolution_x - 1 - x
                    source_offset = (local_y * resolution_x + x) * 4
                    alpha = float(pixels[source_offset + 3])
                    occupied = alpha >= 1.0 - ALPHA_BINARY_EPSILON
                    if not occupied and alpha > ALPHA_BINARY_EPSILON:
                        fail("production_render_alpha_nonbinary", "A production primary sample produced nonbinary output alpha.", tileId=tile["id"], x=target_x, y=y, alpha=alpha)
                    depth_meters = None
                    target_offset = (y * resolution_x + target_x) * bytes_per_pixel
                    if occupied:
                        camera_depth = float(pixels[source_offset])
                        if camera_depth <= ALPHA_BINARY_EPSILON:
                            fail(
                                "production_depth_emission_nonpositive",
                                "An occupied primary sample did not emit positive fixed light depth.",
                                tileId=tile["id"],
                                x=target_x,
                                y=y,
                                cameraDepthMeters=camera_depth,
                                renderedRgba=[
                                    float(pixels[source_offset + channel])
                                    for channel in range(4)
                                ],
                                surface=_diagnose_primary_surface(
                                    scene,
                                    basis,
                                    tile,
                                    target_x,
                                    y,
                                ),
                            )
                        depth_meters = camera_depth + camera_origin_depth
                        depth_meters = _bounded_depth(depth_meters, basis["depth"], tile["id"], target_x, y)
                    cycles_occupied = occupied
                    cycles_depth_meters = depth_meters
                    if native_values is not None:
                        native_depth = float(native_values[y * resolution_x + target_x])
                        if native_depth != 0.0 and (
                            depth_meters is None or native_depth < depth_meters
                        ):
                            depth_meters = _bounded_depth(
                                native_depth,
                                basis["depth"],
                                tile["id"],
                                target_x,
                                y,
                            )
                    occupied = depth_meters is not None
                    if occupied:
                        code = _quantize_depth(
                            depth_meters,
                            basis["depth"],
                            depth_max_code,
                        )
                        decoded = _decode_depth(
                            code,
                            basis["depth"],
                            depth_max_code,
                        )
                        decode_error = abs(decoded - depth_meters)
                        quantized_min = min(quantized_min, code)
                        quantized_max = max(quantized_max, code)
                        source_min = min(source_min, depth_meters)
                        source_max = max(source_max, depth_meters)
                        maximum_decode_error = max(maximum_decode_error, decode_error)
                        decode_error_sum += decode_error
                        if output_encoding == "rg8":
                            payload[target_offset] = code >> 8
                            payload[target_offset + 1] = code & 0xFF
                        elif output_encoding == "rgba8_rgb24a":
                            payload[target_offset] = code >> 16
                            payload[target_offset + 1] = (code >> 8) & 0xFF
                            payload[target_offset + 2] = code & 0xFF
                            payload[target_offset + 3] = 0xFF
                        else:
                            struct.pack_into("<ffff", payload, target_offset, 0.0, 0.0, depth_meters, 1.0)
                        tile_occupied += 1
                    else:
                        if output_encoding == "rg8":
                            payload[target_offset] = 0xFF
                            payload[target_offset + 1] = 0xFF
                        elif output_encoding == "rgba8_rgb24a":
                            payload[target_offset] = 0
                            payload[target_offset + 1] = 0
                            payload[target_offset + 2] = 0
                            payload[target_offset + 3] = 0
                        else:
                            struct.pack_into("<ffff", payload, target_offset, 0.0, 0.0, 0.0, 0.0)
                        tile_transparent += 1
                    key = (tile_index, target_x, y)
                    if key in sample_keys:
                        opaque_rendered_samples[key] = (
                            cycles_occupied,
                            cycles_depth_meters,
                        )
                        merged_rendered_samples[key] = (occupied, depth_meters)
        suffix = {
            "rg8": "rg8",
            "rgba8_rgb24a": "rgba8",
            "rgba_f32le": "rgba.f32le",
        }[output_encoding]
        relative = Path("tiles") / f"{tile['id']}.interior.{suffix}"
        atomic_write_bytes(output_root / relative, payload)
        outputs.append({
            "byteLength": len(payload),
            "coordinates": tile["coordinates"],
            "encoding": output_encoding,
            "occupiedPixelCount": tile_occupied,
            "path": relative.as_posix(),
            "rowOrigin": "min-light-y-v1",
            "sha256": sha256_bytes(payload),
            "tileId": tile["id"],
            "transparentPixelCount": tile_transparent,
            "unguardedInterior": True,
        })
        _fail_large_truth_error_for_tile(
            scene,
            basis,
            tile,
            tile_index,
            sample_plan,
            opaque_truth,
            opaque_rendered_samples,
            merged_rendered_samples,
            native_values,
        )
        counts["occupied"] += tile_occupied
        counts["transparent"] += tile_transparent
    scene.render.use_border = False
    scene.render.use_crop_to_border = False
    try:
        capture_root.rmdir()
    except OSError as error:
        fail("production_render_strip_cleanup_failed", "Temporary row-strip captures were not completely removed.", reason=str(error))
    if (
        len(opaque_rendered_samples) != len(sample_keys)
        or len(merged_rendered_samples) != len(sample_keys)
    ):
        fail(
            "production_certification_samples_missing",
            "The render did not retain every deterministic certification sample for both ownership domains.",
            expected=len(sample_keys),
            actualOpaque=len(opaque_rendered_samples),
            actualMerged=len(merged_rendered_samples),
        )
    if counts["occupied"] == 0:
        fail("production_render_has_no_occupied_depth", "The production render contains no occupied primary depth samples.")
    depth_range = basis["depth"]["maxDepthMeters"] - basis["depth"]["minDepthMeters"]
    half_unit_bound = depth_range / depth_max_code * 0.5
    quantization = {
        "emptyTexelCount": counts["transparent"],
        "encodedCodeMaximum": quantized_max,
        "encodedCodeMinimum": quantized_min,
        "maximumAbsoluteErrorMeters": maximum_decode_error,
        "meanAbsoluteErrorMeters": decode_error_sum / counts["occupied"],
        "measurementMethod": (
            "blender-canonical-depth-before-rgb24-quantization-v1"
            if output_encoding == "rgba8_rgb24a"
            else "blender-canonical-depth-before-rg8-quantization-v1"
        ),
        "occupiedTexelCount": counts["occupied"],
        "sourceDepthMaximumMeters": source_max,
        "sourceDepthMinimumMeters": source_min,
    }
    if maximum_decode_error > half_unit_bound + 1e-12:
        fail("production_quantization_error_exceeded", "Measured depth decode error exceeds the exact half-unit bound.", measured=maximum_decode_error, maximum=half_unit_bound, outputEncoding=output_encoding)
    return (
        outputs,
        counts,
        opaque_rendered_samples,
        merged_rendered_samples,
        quantization,
    )


def _fail_large_truth_error_for_tile(
    scene: Any,
    basis: dict[str, Any],
    tile: dict[str, Any],
    tile_index: int,
    sample_plan: list[dict[str, int]],
    truth: dict[str, Any],
    opaque_rendered_samples: dict[
        tuple[int, int, int], tuple[bool, float | None]
    ],
    merged_rendered_samples: dict[
        tuple[int, int, int], tuple[bool, float | None]
    ],
    native_values: array.array[float] | None,
) -> None:
    for sample in sample_plan:
        if sample["tileIndex"] != tile_index:
            continue
        key = (tile_index, sample["x"], sample["y"])
        expected = truth["expectedSamples"].get(key)
        if expected is None:
            continue
        observed_occupied, observed_depth = opaque_rendered_samples[key]
        expected_occupied = expected["occupied"]
        expected_depth = expected["depthMeters"]
        error = (
            abs(expected_depth - observed_depth)
            if expected_depth is not None and observed_depth is not None
            else None
        )
        if expected_occupied == observed_occupied and (
            error is None or error <= BVH_DEPTH_EPSILON_METERS
        ):
            continue
        fail(
            "production_opaque_bvh_large_error",
            "A production tile has a large rendered-versus-BVH truth discrepancy.",
            sample=sample,
            expectedOccupied=expected_occupied,
            observedOccupied=observed_occupied,
            expectedDepthMeters=expected_depth,
            observedDepthMeters=observed_depth,
            absoluteErrorMeters=error,
            truthSource=expected["source"],
            renderedSurface=_diagnose_primary_surface(
                scene,
                basis,
                tile,
                sample["x"],
                sample["y"],
            ),
        )
    for sample in sample_plan:
        if sample["tileIndex"] != tile_index:
            continue
        key = (tile_index, sample["x"], sample["y"])
        expected = truth["expectedSamples"].get(key)
        if expected is None:
            continue
        native_depth = None
        if native_values is not None:
            width = basis["layout"]["interiorPixels"][0]
            candidate = float(
                native_values[sample["y"] * width + sample["x"]]
            )
            if candidate != 0.0:
                native_depth = candidate
        expected_depths = [
            value
            for value in (expected["depthMeters"], native_depth)
            if value is not None
        ]
        expected_merged_depth = min(expected_depths) if expected_depths else None
        expected_merged_occupied = expected_merged_depth is not None
        observed_occupied, observed_depth = merged_rendered_samples[key]
        error = (
            abs(expected_merged_depth - observed_depth)
            if expected_merged_depth is not None and observed_depth is not None
            else None
        )
        if expected_merged_occupied == observed_occupied and (
            error is None or error <= BVH_DEPTH_EPSILON_METERS
        ):
            continue
        fail(
            "production_merged_depth_large_error",
            "A production tile differs from the independently derived Cycles-plus-native merged truth.",
            sample=sample,
            expectedOccupied=expected_merged_occupied,
            observedOccupied=observed_occupied,
            expectedDepthMeters=expected_merged_depth,
            observedDepthMeters=observed_depth,
            absoluteErrorMeters=error,
            opaqueTruthSource=expected["source"],
            nativeDepthMeters=native_depth,
        )


def _diagnose_primary_surface(
    scene: Any,
    basis: dict[str, Any],
    tile: dict[str, Any],
    x: int,
    y: int,
) -> dict[str, Any]:
    import bpy
    from mathutils import Vector

    axes = basis["basis"]
    origin = Vector(_three_to_blender(axes["originWorld"]))
    right = Vector(_three_to_blender(axes["rightAxisWorld"]))
    up = Vector(_three_to_blender(axes["upAxisWorld"]))
    direction = Vector(_three_to_blender(axes["depthAxisWorld"])).normalized()
    texel = basis["layout"]["texelSizeMeters"]
    tile_minimum = tile["interiorBoundsLightMeters"]["min"]
    light_x = tile_minimum[0] + (x + 0.5) * texel
    light_y = tile_minimum[1] + (y + 0.5) * texel
    camera_origin_depth = float(scene.camera["bus_sim_camera_origin_depth_meters"])
    ray_origin = (
        origin
        + right * light_x
        + up * light_y
        + direction * camera_origin_depth
    )
    hit, location, _normal, polygon_index, hit_object, _matrix = scene.ray_cast(
        bpy.context.evaluated_depsgraph_get(),
        ray_origin,
        direction,
        distance=float(scene.camera.data.clip_end),
    )
    if not hit or hit_object is None:
        return {
            "hit": False,
            "lightCoordinates": [light_x, light_y],
        }
    material = None
    material_index = None
    if (
        hit_object.type == "MESH"
        and isinstance(polygon_index, int)
        and 0 <= polygon_index < len(hit_object.data.polygons)
    ):
        material_index = int(hit_object.data.polygons[polygon_index].material_index)
        if material_index < len(hit_object.material_slots):
            material = hit_object.material_slots[material_index].material
    distance = float((location - ray_origin).length)
    return {
        "cameraOriginDepthMeters": camera_origin_depth,
        "coverageMode": material.get("bus_sim_coverage_mode") if material else None,
        "depthSurface": material.get("bus_sim_depth_surface") if material else None,
        "expectedSignedDepthMeters": camera_origin_depth + distance,
        "geometryId": hit_object.get("bus_sim_geometry_id"),
        "hit": True,
        "instanceId": hit_object.get("bus_sim_stable_id"),
        "lightCoordinates": [light_x, light_y],
        "materialId": material.get("bus_sim_stable_material_id") if material else None,
        "materialIndex": material_index,
        "materialName": material.name if material else None,
        "objectId": hit_object.get("bus_sim_object_id"),
        "objectName": hit_object.name,
        "polygonIndex": int(polygon_index),
        "rayDistanceMeters": distance,
    }


def _capture_render_strip(scene: Any, path: Path, width: int, height: int) -> list[float]:
    import bpy

    if path.exists():
        fail("production_render_strip_collision", "A deterministic temporary row-strip path already exists.", path=str(path))
    scene.render.filepath = str(path)
    image = None
    try:
        bpy.ops.render.render(write_still=True, use_viewport=False)
        if not path.is_file() or path.stat().st_size <= 0:
            fail("production_render_strip_missing", "Cycles did not write the required lossless row-strip capture.", path=str(path))
        image = bpy.data.images.load(str(path), check_existing=False)
        if tuple(int(value) for value in image.size) != (width, height):
            fail("production_render_strip_shape_mismatch", "Cycles returned an unexpected cropped row strip.", expected=[width, height], actual=list(image.size))
        pixels = [0.0] * (width * height * 4)
        image.pixels.foreach_get(pixels)
        return pixels
    except CompilerFailure:
        raise
    except Exception as error:
        fail("production_render_strip_failed", "Cycles could not produce a canonical lossless row strip.", path=str(path), reason=str(error))
    finally:
        if image is not None:
            bpy.data.images.remove(image)
        if path.exists():
            path.unlink()


def _certification_sample_plan(layout: dict[str, Any]) -> list[dict[str, int]]:
    width = layout["tileCount"][0] * layout["interiorPixels"][0]
    height = layout["tileCount"][1] * layout["interiorPixels"][1]
    targets = set()
    for gy in range(32):
        for gx in range(32):
            targets.add((min(width - 1, int((gx + 0.5) * width / 32)), min(height - 1, int((gy + 0.5) * height / 32))))
    state = 531
    while len(targets) < min(width * height, 2048):
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        x = state % width
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        y = state % height
        targets.add((x, y))
    interior = layout["interiorPixels"]
    tile_columns = layout["tileCount"][0]
    result = []
    for global_x, global_y in sorted(targets, key=lambda item: (item[1], item[0])):
        tile_x = global_x // interior[0]
        tile_y = global_y // interior[1]
        result.append({
            "globalX": global_x,
            "globalY": global_y,
            "tileIndex": tile_y * tile_columns + tile_x,
            "x": global_x % interior[0],
            "y": global_y % interior[1],
        })
    return result


def _build_opaque_primary_ray_truth(
    collection: Any,
    scene: Any,
    basis: dict[str, Any],
    sample_plan: list[dict[str, int]],
) -> dict[str, Any]:
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree

    axes = basis["basis"]
    direction = Vector(_three_to_blender(axes["depthAxisWorld"])).normalized()
    vertices = []
    visible_polygons = []
    visible_metadata = []
    opaque_visible_polygons = []
    opaque_visible_metadata = []
    opaque_polygon_count = 0
    for blender_object in sorted(collection.objects, key=lambda item: item.name):
        if blender_object.type != "MESH":
            continue
        vertex_start = len(vertices)
        vertices.extend(
            blender_object.matrix_world @ vertex.co
            for vertex in blender_object.data.vertices
        )
        for polygon in blender_object.data.polygons:
            slot = blender_object.material_slots[polygon.material_index]
            material = slot.material
            mode = material.get("bus_sim_coverage_mode")
            side = int(material.get("bus_sim_effective_shadow_side"))
            if len(polygon.vertices) != 3:
                fail("production_bvh_polygon_nontriangle", "Reconstructed static-sun geometry is not triangulated.", object=blender_object.name)
            indices = tuple(vertex_start + index for index in polygon.vertices)
            first_vertex, second_vertex, third_vertex = (
                vertices[index] for index in indices
            )
            geometric_normal = (second_vertex - first_vertex).cross(
                third_vertex - first_vertex
            )
            if geometric_normal.length_squared <= 0.0:
                fail(
                    "production_bvh_polygon_degenerate",
                    "Reconstructed static-sun geometry contains a degenerate certification triangle.",
                    object=blender_object.name,
                    polygonIndex=polygon.index,
                )
            backfacing = geometric_normal.dot(direction) > 0.0
            visible = (
                side == THREE_DOUBLE_SIDE
                or side == THREE_BACK_SIDE and backfacing
                or side == THREE_FRONT_SIDE and not backfacing
            )
            if mode in ("opaque", "forced_opaque"):
                opaque_polygon_count += 1
            if not visible:
                continue
            visible_polygons.append(indices)
            source = {
                "geometryId": blender_object.get("bus_sim_geometry_id"),
                "instanceId": blender_object.get("bus_sim_stable_id"),
                "materialId": material.get("bus_sim_stable_material_id"),
                "mode": mode,
                "objectId": blender_object.get("bus_sim_object_id"),
                "polygonIndex": int(polygon.index),
                "side": side,
            }
            visible_metadata.append(source)
            if mode in ("opaque", "forced_opaque"):
                opaque_visible_polygons.append(indices)
                opaque_visible_metadata.append(source)
    if not visible_polygons or not opaque_visible_polygons or opaque_polygon_count == 0:
        fail("production_bvh_geometry_missing", "Opaque certification requires reconstructed opaque caster polygons.")
    all_bvh = BVHTree.FromPolygons(
        vertices,
        visible_polygons,
        all_triangles=True,
        epsilon=0.0,
    )
    opaque_bvh = BVHTree.FromPolygons(
        vertices,
        opaque_visible_polygons,
        all_triangles=True,
        epsilon=0.0,
    )
    origin = Vector(_three_to_blender(axes["originWorld"]))
    right = Vector(_three_to_blender(axes["rightAxisWorld"]))
    up = Vector(_three_to_blender(axes["upAxisWorld"]))
    camera_origin_depth = float(scene.camera["bus_sim_camera_origin_depth_meters"])
    max_distance = float(scene.camera.data.clip_end)
    bounds = basis["layout"]["boundsLightMeters"]
    texel = basis["layout"]["texelSizeMeters"]
    eligible = 0
    cutout_excluded = 0
    expected_samples = {}
    for sample in sample_plan:
        light_x = bounds["min"][0] + (sample["globalX"] + 0.5) * texel
        light_y = bounds["min"][1] + (sample["globalY"] + 0.5) * texel
        ray_origin = origin + right * light_x + up * light_y + direction * camera_origin_depth
        first = _ray_cast_filtered_bvh(
            all_bvh,
            visible_metadata,
            ray_origin,
            direction,
            max_distance,
        )
        if first is not None and first[1]["mode"] == "cutout":
            cutout_excluded += 1
            continue
        expected = _ray_cast_filtered_bvh(
            opaque_bvh,
            opaque_visible_metadata,
            ray_origin,
            direction,
            max_distance,
        )
        key = (sample["tileIndex"], sample["x"], sample["y"])
        expected_samples[key] = {
            "depthMeters": (
                camera_origin_depth + expected[0]
                if expected is not None
                else None
            ),
            "occupied": expected is not None,
            "source": expected[1] if expected is not None else None,
        }
        eligible += 1
    minimum = min(128, len(sample_plan))
    if eligible < minimum:
        fail(
            "production_opaque_bvh_sample_coverage_insufficient",
            "Opaque/forced-opaque BVH truth has too few non-cutout certification samples.",
            eligibleSampleCount=eligible,
            minimumEligibleSampleCount=minimum,
        )
    return {
        "algorithm": "blender_bvhtree_direction_filtered_primary_ray_v3",
        "cutoutFirstHitExcludedSampleCount": cutout_excluded,
        "eligibleSampleCount": eligible,
        "expectedSamples": expected_samples,
        "opaqueAndForcedOpaquePolygonCount": opaque_polygon_count,
    }


def _certify_opaque_primary_rays(
    truth: dict[str, Any],
    scene: Any,
    basis: dict[str, Any],
    sample_plan: list[dict[str, int]],
    rendered_samples: dict[tuple[int, int, int], tuple[bool, float | None]],
    directional_geometry_filter: dict[str, Any],
) -> dict[str, Any]:
    occupancy_mismatches = 0
    depth_mismatches = 0
    maximum_error = 0.0
    mismatch_samples = []
    for sample in sample_plan:
        key = (sample["tileIndex"], sample["x"], sample["y"])
        expected = truth["expectedSamples"].get(key)
        if expected is None:
            continue
        expected_occupied = expected["occupied"]
        expected_depth = expected["depthMeters"]
        observed_occupied, observed_depth = rendered_samples[key]
        if expected_occupied != observed_occupied:
            occupancy_mismatches += 1
            if len(mismatch_samples) < 16:
                mismatch_samples.append({
                    "error": "occupancy",
                    "expectedOccupied": expected_occupied,
                    "observedOccupied": observed_occupied,
                    **sample,
                })
            continue
        if expected_depth is not None and observed_depth is not None:
            error = abs(expected_depth - observed_depth)
            maximum_error = max(maximum_error, error)
            if error > BVH_DEPTH_EPSILON_METERS:
                depth_mismatches += 1
                mismatch_samples.append({
                    "error": "depth",
                    "expectedDepthMeters": expected_depth,
                    "observedDepthMeters": observed_depth,
                    "absoluteErrorMeters": error,
                    "truthSource": expected["source"],
                    **sample,
                })
    depth_samples = sorted(
        (entry for entry in mismatch_samples if entry["error"] == "depth"),
        key=lambda entry: -entry["absoluteErrorMeters"],
    )[:16]
    occupancy_samples = [
        entry for entry in mismatch_samples if entry["error"] == "occupancy"
    ][:16]
    mismatch_samples = occupancy_samples + depth_samples
    for sample in mismatch_samples:
        tile = basis["tiles"][sample["tileIndex"]]
        sample["renderedSurface"] = _diagnose_primary_surface(
            scene,
            basis,
            tile,
            sample["x"],
            sample["y"],
        )
    if occupancy_mismatches or depth_mismatches:
        fail(
            "production_opaque_bvh_certification_failed",
            "Opaque/forced-opaque Blender BVH primary rays disagree with unquantized rendered depth.",
            eligibleSampleCount=truth["eligibleSampleCount"],
            occupancyMismatchCount=occupancy_mismatches,
            depthMismatchCount=depth_mismatches,
            maximumDepthErrorMeters=maximum_error,
            mismatchSamples=mismatch_samples,
        )
    return {
        "algorithm": truth["algorithm"],
        "cutoutFirstHitExcludedSampleCount": truth["cutoutFirstHitExcludedSampleCount"],
        "depthEpsilonMeters": BVH_DEPTH_EPSILON_METERS,
        "depthMismatchCount": 0,
        "directionalGeometryFilter": directional_geometry_filter,
        "eligibleSampleCount": truth["eligibleSampleCount"],
        "maximumDepthErrorMeters": maximum_error,
        "occupancyMismatchCount": 0,
        "opaqueAndForcedOpaquePolygonCount": truth["opaqueAndForcedOpaquePolygonCount"],
        "sampleCount": len(sample_plan),
        "samplePlan": "32_by_32_stratified_grid_plus_lcg_seed_531_to_2048_unique_texels",
        "status": "verified",
    }


def _ray_cast_filtered_bvh(
    bvh: Any,
    metadata: list[dict[str, Any]],
    origin: Any,
    direction: Any,
    maximum_distance: float,
) -> tuple[float, dict[str, Any]] | None:
    location, _normal, polygon_index, distance = bvh.ray_cast(
        origin,
        direction,
        maximum_distance,
    )
    if location is None or polygon_index is None:
        return None
    if polygon_index < 0 or polygon_index >= len(metadata):
        fail(
            "production_bvh_polygon_index_invalid",
            "Direction-filtered BVH returned a polygon outside its exact metadata inventory.",
            polygonIndex=polygon_index,
            polygonCount=len(metadata),
        )
    return float(distance), metadata[polygon_index]


def _bounded_depth(value: float, depth: dict[str, float], tile_id: str, x: int, y: int) -> float:
    if not math.isfinite(value):
        fail("production_depth_non_finite", "Cycles returned a non-finite occupied depth.", tileId=tile_id, x=x, y=y)
    minimum = depth["minDepthMeters"]
    maximum = depth["maxDepthMeters"]
    if value < minimum - BVH_DEPTH_EPSILON_METERS or value > maximum + BVH_DEPTH_EPSILON_METERS:
        fail("production_depth_out_of_range", "Cycles returned occupied depth outside the derived range.", tileId=tile_id, x=x, y=y, depthMeters=value, minimum=minimum, maximum=maximum)
    return min(maximum, max(minimum, value))


def _quantize_depth(
    value: float,
    depth: dict[str, float],
    maximum_code: int = DEPTH_MAX_CODE,
) -> int:
    unit = (value - depth["minDepthMeters"]) / (depth["maxDepthMeters"] - depth["minDepthMeters"])
    return min(maximum_code, max(0, math.floor(unit * maximum_code + 0.5)))


def _decode_depth(
    code: int,
    depth: dict[str, float],
    maximum_code: int = DEPTH_MAX_CODE,
) -> float:
    return depth["minDepthMeters"] + code / maximum_code * (depth["maxDepthMeters"] - depth["minDepthMeters"])


def _production_identity_hashes(manifest: dict[str, Any]) -> dict[str, str]:
    selected = sorted(
        (
            entry for entry in manifest["casterMappings"]
            if entry.get("channelRelevance", {}).get(CHANNEL_ID) is True
        ),
        key=lambda entry: entry["id"],
    )
    selected_material_ids = {entry["materialId"] for entry in selected}
    selected_alpha_ids = {entry["alphaInputId"] for entry in selected}
    materials = sorted(
        (
            {
                "alpha": entry["alpha"],
                "alphaInputId": entry["alphaInputId"],
                "id": entry["id"],
                "shadowSide": entry["shadowSide"],
                "side": entry["side"],
                "preserveShadowSide": entry["preserveShadowSide"],
                "isFoliage": entry["isFoliage"],
                "vertexColors": entry["vertexColors"],
            }
            for entry in manifest["materials"]
            if entry["id"] in selected_material_ids
        ),
        key=lambda entry: entry["id"],
    )
    alpha_inputs = sorted(
        (entry for entry in manifest["alphaInputs"] if entry["id"] in selected_alpha_ids),
        key=lambda entry: entry["id"],
    )
    binding_ids = {
        alpha_entry["bindingId"]
        for entry in alpha_inputs
        for alpha_entry in entry["alpha"].get("inputs", [])
    }
    bindings = sorted(
        (entry for entry in manifest["textures"] if entry["id"] in binding_ids),
        key=lambda entry: entry["id"],
    )
    source_ids = {entry["sourceId"] for entry in bindings}
    sources = sorted(
        (
            {
                "contentSha256": entry["contentSha256"],
                "coverageChannels": entry["coverageChannels"],
                "id": entry["id"],
            }
            for entry in manifest["textures"]
            if entry["id"] in source_ids
        ),
        key=lambda entry: entry["id"],
    )
    caster_projection = {
        "channelId": CHANNEL_ID,
        "mappings": selected,
        "schema": "ai531-static-sun-caster-inventory-projection-v2",
    }
    alpha_projection = {
        "alphaInputs": alpha_inputs,
        "bindings": bindings,
        "materials": materials,
        "schema": "ai531-static-sun-alpha-semantics-projection-v2",
        "sources": sources,
    }
    return {
        "alphaSemanticsSha256": sha256_bytes(canonical_json_bytes(alpha_projection)),
        "casterInventorySha256": sha256_bytes(canonical_json_bytes(caster_projection)),
    }


def _require_keys(value: Any, expected: set[str], label: str) -> None:
    if not isinstance(value, dict) or set(value) != expected:
        fail("production_request_shape_invalid", "A production request object has missing or unknown fields.", path=label, expected=sorted(expected), actual=sorted(value) if isinstance(value, dict) else None)


def _unit_vector(value: Any, label: str) -> list[float]:
    if not isinstance(value, list) or len(value) != 3 or any(not isinstance(component, (int, float)) or isinstance(component, bool) or not math.isfinite(component) for component in value):
        fail("production_vector_invalid", "A production direction is not a finite vector3.", path=label)
    length = math.sqrt(sum(float(component) * float(component) for component in value))
    if abs(length - 1.0) > 1e-12:
        fail("production_direction_not_unit", "The production sun direction must already be normalized.", path=label, length=length)
    return [_clean_zero(float(component)) for component in value]


def _vector(value: Any) -> Any:
    from mathutils import Vector

    return Vector(tuple(float(component) for component in value))


def _blender_to_three(value: Any) -> list[float]:
    return [float(value.x), float(value.z), -float(value.y)]


def _three_to_blender(value: list[float]) -> tuple[float, float, float]:
    return float(value[0]), -float(value[2]), float(value[1])


def _dot(left: list[float], right: list[float]) -> float:
    return sum(left[index] * right[index] for index in range(3))


def _derive_live_source_to_cache_light_axis_transform(
    basis: dict[str, Any],
    request: dict[str, Any],
) -> list[list[int]]:
    cache_axes = [
        _unit_vector(basis["basis"]["rightAxisWorld"], "basis.rightAxisWorld"),
        _unit_vector(basis["basis"]["upAxisWorld"], "basis.upAxisWorld"),
    ]
    pcf = request["sampling"]["pcf"]
    live_axes = [
        _unit_vector(pcf["sourceMapRightAxisWorld"], "request.sampling.pcf.sourceMapRightAxisWorld"),
        _unit_vector(pcf["sourceMapUpAxisWorld"], "request.sampling.pcf.sourceMapUpAxisWorld"),
    ]
    transform: list[list[int]] = []
    for cache_axis in cache_axes:
        row: list[int] = []
        for live_axis in live_axes:
            value = _dot(cache_axis, live_axis)
            canonical = next(
                (candidate for candidate in (-1, 0, 1) if abs(value - candidate) <= 1e-9),
                None,
            )
            if canonical is None:
                fail(
                    "production_native_cutout_field_axis_transform_invalid",
                    "Live and cache light axes are not an authenticated signed permutation.",
                    dot=value,
                )
            row.append(canonical)
        transform.append(row)
    lines = transform + [
        [transform[0][0], transform[1][0]],
        [transform[0][1], transform[1][1]],
    ]
    if any(sum(abs(value) for value in line) != 1 for line in lines):
        fail(
            "production_native_cutout_field_axis_transform_invalid",
            "The live-to-cache light-axis transform is not bijective.",
            transform=transform,
        )
    return transform


def _subtract(left: list[float], right: list[float]) -> list[float]:
    return [left[index] - right[index] for index in range(3)]


def _cross(left: list[float], right: list[float]) -> list[float]:
    return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]]


def _derive_three_r183_filter_axes(point_direction: list[float]) -> dict[str, list[float]]:
    backward = _normalize(point_direction)
    right = _cross([0.0, 1.0, 0.0], backward)
    if math.sqrt(_dot(right, right)) <= sys.float_info.epsilon:
        perturbed = _normalize([backward[0] + 0.0001, backward[1], backward[2]])
        right = _cross([0.0, 1.0, 0.0], perturbed)
    right = _normalize(right)
    up = _normalize(_cross(backward, right))
    return {
        "rightAxisWorld": right,
        "upAxisWorld": up,
    }


def _vectors_nearly_equal(left: list[float], right: list[float], tolerance: float) -> bool:
    return len(left) == len(right) and all(
        abs(left[index] - right[index]) <= tolerance
        for index in range(len(left))
    )


def _normalize(value: list[float]) -> list[float]:
    length = math.sqrt(_dot(value, value))
    if length <= 1e-15:
        fail("production_basis_degenerate", "The stable production sun basis is degenerate.")
    return [_clean_zero(component / length) for component in value]


def _clean_zero(value: float) -> float:
    return 0.0 if value == 0.0 else value


if __name__ == "__main__":
    try:
        main()
    except CompilerFailure as error:
        print("AI531_PRODUCTION_ERROR_JSON=" + canonical_json_bytes(error.to_record()).decode("utf-8"), file=sys.stderr, flush=True)
        raise
