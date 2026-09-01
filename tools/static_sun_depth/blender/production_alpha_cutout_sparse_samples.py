"""Pinned Blender 5.2.1 cutout-only sparse depth evidence for AI 531."""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

import production_static_sun as production

from bsib import open_verified_package, validate_resolved_city_contract
from canonical import atomic_write_bytes, canonical_json_bytes, require_sha256, sha256_bytes
from compiler import PINNED_EXECUTABLE_SHA256
from errors import CompilerFailure, fail
from reconstruct import reconstruct_resolved_city
from scene import BakeProfile, assert_blender_runtime, create_clean_scene


SAMPLE_REQUEST_SCHEMAS = {
    "ai531-production-alpha-cutout-bake-sample-request-v1": True,
    "ai531-production-alpha-cutout-in-coverage-bake-diagnostic-request-v1": False,
}
SAMPLE_PLAN_METHOD = "all-cutout-casters-projected-light-texel-coverage-v1"
DEPTH_REFERENCE_ENCODING = "source-shadow-camera-distance-meters-v1"
RECEIPT_SCHEMA = "ai531-production-alpha-cutout-bake-sparse-capture-receipt-v1"
CAPTURE_METHOD = "cutout-only-cycles-z-primary-ray-production-tile-readback-v1"
MAXIMUM_SAMPLE_COUNT = 10_000


def main() -> None:
    arguments = _parse_arguments()
    signature = assert_blender_runtime(arguments.archive_sha256)
    if arguments.executable_sha256 != PINNED_EXECUTABLE_SHA256:
        fail(
            "alpha_cutout_sparse_executable_hash_mismatch",
            "The sparse cutout producer requires the pinned official Blender executable.",
            expected=PINNED_EXECUTABLE_SHA256,
            actual=arguments.executable_sha256,
        )
    producer_sha256 = _verified_script_hash(
        Path(__file__).resolve(),
        arguments.producer_script_sha256,
        "alpha_cutout_sparse_producer_script_hash_mismatch",
    )
    production_renderer_sha256 = _verified_script_hash(
        Path(production.__file__).resolve(),
        arguments.production_renderer_sha256,
        "alpha_cutout_sparse_production_renderer_hash_mismatch",
    )
    ai529_sha256, ai529_inventory = production._script_inventory(
        production.AI529_DIRECTORY
    )
    if ai529_sha256 != arguments.ai529_script_sha256:
        fail(
            "alpha_cutout_sparse_ai529_script_hash_mismatch",
            "The reused AI 529 Blender module inventory changed after validation.",
            expected=arguments.ai529_script_sha256,
            actual=ai529_sha256,
        )
    profile_bytes = production._read_required_file(arguments.profile, "profile")
    request_bytes = production._read_required_file(arguments.request, "request")
    sample_request_bytes = production._read_required_file(
        arguments.sample_request,
        "sample request",
    )
    _require_file_hash(profile_bytes, arguments.profile_sha256, "profile")
    _require_file_hash(request_bytes, arguments.request_sha256, "request")
    _require_file_hash(
        sample_request_bytes,
        arguments.sample_request_sha256,
        "sample request",
    )
    profile = BakeProfile.from_mapping(production._parse_json(profile_bytes, "profile"))
    request = production._validate_request(
        production._parse_json(request_bytes, "request")
    )
    sample_request = _validate_sample_request(
        production._parse_json(sample_request_bytes, "sample request")
    )
    if sample_request["lightingProfileId"] != request["lightingProfileId"]:
        fail(
            "alpha_cutout_sparse_profile_mismatch",
            "The sparse sample request and production request name different lighting profiles.",
            sampleRequest=sample_request["lightingProfileId"],
            productionRequest=request["lightingProfileId"],
        )

    output_root = arguments.output.resolve()
    production._create_empty_output_root(output_root)
    with open_verified_package(arguments.input, arguments.package_raw_sha256) as package:
        inventory = validate_resolved_city_contract(package, arguments.archive_sha256)
        production._validate_requested_light(package.manifest, request)
        scene, applied_profile = create_clean_scene(profile)
        reconstruction_root = output_root / ".source_cache"
        reconstruction = reconstruct_resolved_city(
            package,
            reconstruction_root,
            production.CHANNEL_ID,
        )
        collection = production._required_collection(reconstruction["collection"])
        basis = production._derive_basis_and_bounds(
            collection,
            request,
            package.manifest,
            "rg8",
        )
        _validate_sample_request_against_basis(sample_request, basis)
        camera_origin_depth = (
            basis["depth"]["minDepthMeters"]
            - float(profile.data["camera"]["clipStartMeters"])
        )
        material_result = production._convert_materials_to_depth(
            package,
            collection,
            basis,
            camera_origin_depth,
            request["casterSidedness"],
        )
        cutout_isolation = _isolate_cutout_polygons(collection)
        direction_filter = production._filter_direction_invisible_polygons(
            collection,
            basis,
        )
        render_contract = production._configure_production_scene(
            scene,
            profile,
            basis,
            request,
            request["interiorPixels"][1],
            camera_origin_depth,
        )
        occupancy, first_hit_depth = _capture_sparse_samples(
            scene,
            basis,
            sample_request,
            output_root,
        )
        occupancy_bytes = bytes(occupancy)
        first_hit_depth_bytes = struct.pack(
            f"<{len(first_hit_depth)}f",
            *first_hit_depth,
        )
        occupancy_record = _write_evidence(
            output_root,
            "bake_occupancy.u8",
            occupancy_bytes,
        )
        depth_record = _write_evidence(
            output_root,
            "bake_first_hit_depth.f32le",
            first_hit_depth_bytes,
        )
        receipt = {
            "capture": {
                "depthEncoding": DEPTH_REFERENCE_ENCODING,
                "emptyDepthMeters": 0,
                "firstHitDepth": depth_record,
                "method": CAPTURE_METHOD,
                "occupancy": occupancy_record,
                "occupiedSampleCount": sum(occupancy),
                "sampleCount": len(occupancy),
            },
            "compiler": {
                **signature,
                "cyclesDevice": "CPU",
                "executableSha256": arguments.executable_sha256,
                "fixedThreadCount": profile.thread_count,
                "gpuAllowed": False,
            },
            "configuration": {
                "ai529ScriptInventory": ai529_inventory,
                "ai529ScriptSha256": ai529_sha256,
                "appliedProfile": applied_profile,
                "producerScriptSha256": producer_sha256,
                "productionRendererSha256": production_renderer_sha256,
                "profileSha256": arguments.profile_sha256,
                "requestSha256": arguments.request_sha256,
                "sampleRequestSha256": arguments.sample_request_sha256,
                "toolchainSha256": arguments.toolchain_sha256,
            },
            "cutoutIsolation": cutout_isolation,
            "depthReference": sample_request["depthReference"],
            "directionFilter": direction_filter,
            "input": {
                "archiveSha256": arguments.archive_sha256,
                "packageRawSha256": package.raw_sha256,
            },
            "inventory": inventory,
            "layout": basis,
            "materialResult": material_result,
            "performance": {
                "eligibleForPromotion": False,
                "reason": "timings_omitted_machine_contention_declared",
            },
            "productionEligible": sample_request["productionEligible"],
            "reconstruction": reconstruction,
            "renderContract": render_contract,
            "sampleRequest": sample_request,
            "schema": RECEIPT_SCHEMA,
            "status": "complete",
        }
        receipt_bytes = canonical_json_bytes(receipt)
        atomic_write_bytes(output_root / "capture_receipt.json", receipt_bytes)
    descriptor = {
        "byteLength": len(receipt_bytes),
        "path": "capture_receipt.json",
        "sha256": sha256_bytes(receipt_bytes),
    }
    print(
        "AI531_ALPHA_CUTOUT_BAKE_SPARSE_RECEIPT="
        + canonical_json_bytes(descriptor).decode("utf-8"),
        flush=True,
    )


def _parse_arguments() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(
        prog="production_alpha_cutout_sparse_samples.py",
        allow_abbrev=False,
    )
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--sample-request", type=Path, required=True)
    parser.add_argument("--archive-sha256", type=_digest, required=True)
    parser.add_argument("--executable-sha256", type=_digest, required=True)
    parser.add_argument("--toolchain-sha256", type=_digest, required=True)
    parser.add_argument("--profile-sha256", type=_digest, required=True)
    parser.add_argument("--request-sha256", type=_digest, required=True)
    parser.add_argument("--sample-request-sha256", type=_digest, required=True)
    parser.add_argument("--producer-script-sha256", type=_digest, required=True)
    parser.add_argument("--production-renderer-sha256", type=_digest, required=True)
    parser.add_argument("--ai529-script-sha256", type=_digest, required=True)
    parser.add_argument("--package-raw-sha256", type=_digest, required=True)
    return parser.parse_args(raw)


def _digest(value: str) -> str:
    try:
        return require_sha256(value, "command-line digest")
    except CompilerFailure as error:
        raise argparse.ArgumentTypeError(str(error)) from error


def _verified_script_hash(path: Path, expected: str, code: str) -> str:
    actual = sha256_bytes(path.read_bytes())
    if actual != expected:
        fail(
            code,
            "A sparse cutout producer script changed after orchestration validation.",
            path=path.name,
            expected=expected,
            actual=actual,
        )
    return actual


def _require_file_hash(data: bytes, expected: str, label: str) -> None:
    actual = sha256_bytes(data)
    if actual != expected:
        fail(
            "alpha_cutout_sparse_input_hash_mismatch",
            "A sparse cutout input changed after orchestration validation.",
            label=label,
            expected=expected,
            actual=actual,
        )


def _validate_sample_request(value: Any) -> dict[str, Any]:
    _require_exact_keys(
        value,
        {
            "depthReference",
            "lightingProfileId",
            "method",
            "productionEligible",
            "samples",
            "schema",
        },
        "sample request",
    )
    schema = value["schema"]
    if schema not in SAMPLE_REQUEST_SCHEMAS:
        fail(
            "alpha_cutout_sparse_request_schema_unsupported",
            "The sparse sample request schema is unsupported.",
            actual=schema,
        )
    if value["productionEligible"] is not SAMPLE_REQUEST_SCHEMAS[schema]:
        fail(
            "alpha_cutout_sparse_request_eligibility_mismatch",
            "The sample request schema and production eligibility disagree.",
        )
    if not isinstance(value["lightingProfileId"], str) or not value["lightingProfileId"]:
        fail("alpha_cutout_sparse_profile_invalid", "The sample request has no lighting profile ID.")
    if value["method"] != SAMPLE_PLAN_METHOD:
        fail("alpha_cutout_sparse_method_unsupported", "The sample-plan method is unsupported.")
    depth = value["depthReference"]
    _require_exact_keys(
        depth,
        {
            "cacheDepthAxisWorld",
            "encoding",
            "sourceCameraFarMeters",
            "sourceCameraNearMeters",
            "sourceCameraOriginDepthMetersInCacheBasis",
        },
        "sample request depth reference",
    )
    axis = _finite_vector(depth["cacheDepthAxisWorld"], 3, "cache depth axis")
    if abs(math.sqrt(sum(component * component for component in axis)) - 1.0) > 1e-9:
        fail("alpha_cutout_sparse_depth_axis_invalid", "The cache depth axis is not unit length.")
    if depth["encoding"] != DEPTH_REFERENCE_ENCODING:
        fail("alpha_cutout_sparse_depth_encoding_unsupported", "The depth reference is unsupported.")
    near = _finite_number(depth["sourceCameraNearMeters"], "source camera near")
    far = _finite_number(depth["sourceCameraFarMeters"], "source camera far")
    _finite_number(
        depth["sourceCameraOriginDepthMetersInCacheBasis"],
        "source camera origin depth",
    )
    if near < 0 or far <= near:
        fail("alpha_cutout_sparse_camera_range_invalid", "The source camera range is invalid.")
    samples = value["samples"]
    if not isinstance(samples, list) or not 0 < len(samples) <= MAXIMUM_SAMPLE_COUNT:
        fail("alpha_cutout_sparse_sample_count_invalid", "The sparse sample count is invalid.")
    for index, sample in enumerate(samples):
        _require_exact_keys(sample, {"casterId", "globalTexel", "index"}, f"samples[{index}]")
        if sample["index"] != index:
            fail("alpha_cutout_sparse_sample_order_invalid", "Sparse sample indices are not explicit canonical order.", index=index)
        if not isinstance(sample["casterId"], str) or not sample["casterId"]:
            fail("alpha_cutout_sparse_caster_id_invalid", "A sparse sample has no caster ID.", index=index)
        texel = sample["globalTexel"]
        if not isinstance(texel, list) or len(texel) != 2 or any(
            not isinstance(component, int) or isinstance(component, bool) or component < 0
            for component in texel
        ):
            fail("alpha_cutout_sparse_texel_invalid", "A sparse global texel is invalid.", index=index)
    return value


def _validate_sample_request_against_basis(
    sample_request: dict[str, Any],
    basis: dict[str, Any],
) -> None:
    expected_axis = basis["basis"]["depthAxisWorld"]
    actual_axis = sample_request["depthReference"]["cacheDepthAxisWorld"]
    maximum_axis_error = max(
        abs(actual_axis[index] - expected_axis[index]) for index in range(3)
    )
    if maximum_axis_error > 1e-9:
        fail(
            "alpha_cutout_sparse_depth_axis_mismatch",
            "The live depth reference and reconstructed cache depth axes differ.",
            maximumError=maximum_axis_error,
        )
    layout = basis["layout"]
    size = [
        layout["tileCount"][axis] * layout["interiorPixels"][axis]
        for axis in range(2)
    ]
    for sample in sample_request["samples"]:
        if any(sample["globalTexel"][axis] >= size[axis] for axis in range(2)):
            fail(
                "alpha_cutout_sparse_texel_out_of_bounds",
                "A sparse global texel falls outside the authenticated cache layout.",
                index=sample["index"],
                globalTexel=sample["globalTexel"],
                cacheSizeTexels=size,
            )


def _isolate_cutout_polygons(collection: Any) -> dict[str, Any]:
    import bmesh

    cutout_polygon_count = 0
    removed_polygon_count = 0
    source_polygon_count = 0
    modified_object_count = 0
    for blender_object in sorted(collection.objects, key=lambda item: item.name):
        if blender_object.type != "MESH":
            continue
        source_mesh = blender_object.data
        removed_indices = []
        for polygon in source_mesh.polygons:
            source_polygon_count += 1
            material = blender_object.material_slots[polygon.material_index].material
            mode = material.get("bus_sim_coverage_mode") if material else None
            if mode == "cutout":
                cutout_polygon_count += 1
            elif mode in ("opaque", "forced_opaque"):
                removed_indices.append(int(polygon.index))
                removed_polygon_count += 1
            else:
                fail(
                    "alpha_cutout_sparse_coverage_mode_unsupported",
                    "A reconstructed polygon has unsupported coverage semantics.",
                    object=blender_object.name,
                    polygonIndex=int(polygon.index),
                    coverageMode=mode,
                )
        if not removed_indices:
            continue
        isolated_mesh = source_mesh.copy()
        isolated_mesh.name = source_mesh.name + "_AI531_CUTOUT_ONLY"
        blender_object.data = isolated_mesh
        mesh_edit = bmesh.new()
        try:
            mesh_edit.from_mesh(isolated_mesh)
            mesh_edit.faces.ensure_lookup_table()
            bmesh.ops.delete(
                mesh_edit,
                geom=[mesh_edit.faces[index] for index in removed_indices],
                context="FACES",
            )
            mesh_edit.to_mesh(isolated_mesh)
        finally:
            mesh_edit.free()
        isolated_mesh.update(calc_edges=True)
        expected = len(source_mesh.polygons) - len(removed_indices)
        if len(isolated_mesh.polygons) != expected:
            fail(
                "alpha_cutout_sparse_isolation_count_mismatch",
                "Cutout polygon isolation did not retain the exact expected count.",
                object=blender_object.name,
                expected=expected,
                actual=len(isolated_mesh.polygons),
            )
        isolated_mesh["bus_sim_coverage_isolation"] = "cutout_faces_only_v1"
        modified_object_count += 1
    if source_polygon_count <= 0 or cutout_polygon_count <= 0 or removed_polygon_count <= 0:
        fail(
            "alpha_cutout_sparse_isolation_vacuous",
            "Cutout-only isolation requires both cutout and removed opaque geometry.",
        )
    if cutout_polygon_count + removed_polygon_count != source_polygon_count:
        fail(
            "alpha_cutout_sparse_isolation_inventory_mismatch",
            "Cutout-only isolation did not exactly partition reconstructed polygons.",
        )
    return {
        "algorithm": "reconstructed_mesh_non_cutout_faces_removed_v1",
        "cutoutPolygonCount": cutout_polygon_count,
        "modifiedObjectCount": modified_object_count,
        "removedPolygonCount": removed_polygon_count,
        "sourcePolygonCount": source_polygon_count,
    }


def _capture_sparse_samples(
    scene: Any,
    basis: dict[str, Any],
    sample_request: dict[str, Any],
    output_root: Path,
) -> tuple[bytearray, list[float]]:
    from mathutils import Vector

    camera = scene.camera
    resolution_x, resolution_y = basis["layout"]["interiorPixels"]
    scene.render.resolution_x = resolution_x
    scene.render.resolution_y = resolution_y
    scene.render.resolution_percentage = 100
    scene.render.use_border = False
    scene.render.use_crop_to_border = False
    axes = basis["basis"]
    origin = Vector(production._three_to_blender(axes["originWorld"]))
    right = Vector(production._three_to_blender(axes["rightAxisWorld"]))
    up = Vector(production._three_to_blender(axes["upAxisWorld"]))
    depth = Vector(production._three_to_blender(axes["depthAxisWorld"]))
    camera_origin_depth = float(camera["bus_sim_camera_origin_depth_meters"])
    source_depth = sample_request["depthReference"]
    source_camera_origin_depth = float(
        source_depth["sourceCameraOriginDepthMetersInCacheBasis"]
    )
    source_near = float(source_depth["sourceCameraNearMeters"])
    source_far = float(source_depth["sourceCameraFarMeters"])
    capture_root = output_root / ".sample_renders"
    capture_root.mkdir(parents=True, exist_ok=False)
    occupancy = bytearray(len(sample_request["samples"]))
    first_hit_depth = [0.0] * len(sample_request["samples"])
    samples_by_tile: dict[int, list[dict[str, Any]]] = {}
    for sample in sample_request["samples"]:
        global_x, global_y = sample["globalTexel"]
        tile_x = global_x // resolution_x
        tile_y = global_y // resolution_y
        tile_index = tile_y * basis["layout"]["tileCount"][0] + tile_x
        samples_by_tile.setdefault(tile_index, []).append(sample)
    for tile_index in sorted(samples_by_tile):
        tile = basis["tiles"][tile_index]
        tile_bounds = tile["interiorBoundsLightMeters"]
        light_x = (tile_bounds["min"][0] + tile_bounds["max"][0]) * 0.5
        light_y = (tile_bounds["min"][1] + tile_bounds["max"][1]) * 0.5
        camera.location = (
            origin
            + right * light_x
            + up * light_y
            + depth * camera_origin_depth
        )
        pixels = production._capture_render_strip(
            scene,
            capture_root / f"{tile['id']}.exr",
            resolution_x,
            resolution_y,
        )
        for sample in samples_by_tile[tile_index]:
            index = sample["index"]
            global_x, global_y = sample["globalTexel"]
            local_x = global_x % resolution_x
            local_y = global_y % resolution_y
            # The production camera captures -light-X and its tile encoder
            # mirrors source X back to +light-X during canonical readback.
            source_x = resolution_x - 1 - local_x
            pixel_offset = (local_y * resolution_x + source_x) * 4
            alpha = float(pixels[pixel_offset + 3])
            occupied = alpha >= 1.0 - production.ALPHA_BINARY_EPSILON
            if not occupied and alpha > production.ALPHA_BINARY_EPSILON:
                fail(
                    "alpha_cutout_sparse_render_alpha_nonbinary",
                    "A sparse cutout sample produced nonbinary output alpha.",
                    index=index,
                    alpha=alpha,
                )
            if not occupied:
                continue
            camera_depth = float(pixels[pixel_offset])
            if camera_depth <= production.ALPHA_BINARY_EPSILON:
                fail(
                    "alpha_cutout_sparse_depth_nonpositive",
                    "An occupied sparse cutout sample has nonpositive camera depth.",
                    index=index,
                    cameraDepthMeters=camera_depth,
                )
            canonical_depth = camera_origin_depth + camera_depth
            source_camera_distance = canonical_depth - source_camera_origin_depth
            if source_camera_distance < source_near - 1e-4 or source_camera_distance > source_far + 1e-4:
                fail(
                    "alpha_cutout_sparse_source_depth_out_of_range",
                    "An occupied sparse cutout sample falls outside the live source camera range.",
                    index=index,
                    sourceCameraDistanceMeters=source_camera_distance,
                    nearMeters=source_near,
                    farMeters=source_far,
                )
            occupancy[index] = 1
            first_hit_depth[index] = source_camera_distance
    return occupancy, first_hit_depth


def _write_evidence(output_root: Path, name: str, data: bytes) -> dict[str, Any]:
    atomic_write_bytes(output_root / name, data)
    return {"byteLength": len(data), "path": name, "sha256": sha256_bytes(data)}


def _require_exact_keys(value: Any, expected: set[str], label: str) -> None:
    if not isinstance(value, dict) or set(value) != expected:
        fail(
            "alpha_cutout_sparse_keys_invalid",
            "A sparse cutout request object has unexpected keys.",
            label=label,
            expected=sorted(expected),
            actual=sorted(value) if isinstance(value, dict) else type(value).__name__,
        )


def _finite_vector(value: Any, length: int, label: str) -> list[float]:
    if not isinstance(value, list) or len(value) != length:
        fail("alpha_cutout_sparse_vector_invalid", "A sparse request vector has invalid shape.", label=label)
    return [_finite_number(component, f"{label}[{index}]") for index, component in enumerate(value)]


def _finite_number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        fail("alpha_cutout_sparse_number_invalid", "A sparse request number is not finite.", label=label)
    return float(value)


if __name__ == "__main__":
    main()
