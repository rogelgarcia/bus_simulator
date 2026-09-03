"""Pinned Blender 5.2.1 cutout-only sparse depth evidence for AI 531."""

from __future__ import annotations

import argparse
import hashlib
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
import compile_cutout_silhouettes as silhouette

from bsib import (
    TEXTURE_COVERAGE_DOMAIN,
    open_verified_package,
    validate_resolved_city_contract,
)
from canonical import (
    atomic_write_bytes,
    canonical_json_bytes,
    framed_sha256,
    require_sha256,
    sha256_bytes,
)
from compiler import PINNED_EXECUTABLE_SHA256
from errors import CompilerFailure, fail
from reconstruct import reconstruct_resolved_city
from scene import BakeProfile, assert_blender_runtime, create_clean_scene


SAMPLE_REQUEST_SCHEMAS = {
    "ai531-production-alpha-cutout-bake-sample-request-v1": (
        True,
        "all-cutout-casters-projected-light-texel-coverage-v1",
    ),
    "ai531-production-alpha-cutout-in-coverage-bake-diagnostic-request-v1": (
        False,
        "all-cutout-casters-projected-light-texel-coverage-v1",
    ),
    "ai531-production-alpha-cutout-bake-sample-request-v2": (
        True,
        "per-profile-in-out-cutout-casters-projected-light-texel-coverage-v2",
    ),
}
DEPTH_REFERENCE_ENCODING = "source-shadow-camera-distance-meters-v1"
RECEIPT_SCHEMA = "ai531-production-alpha-cutout-bake-sparse-capture-receipt-v1"
CANDIDATE_RECEIPT_SCHEMA = (
    "ai531-production-alpha-cutout-full-lattice-candidate-receipt-v1"
)
CAPTURE_METHOD = "cutout-only-cycles-z-primary-ray-four-by-four-texel-camera-v2"
MAXIMUM_SAMPLE_COUNT = 10_000
SPARSE_RENDER_SIZE = 4
SPARSE_SOURCE_PIXEL = (1, 1)


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
    silhouette_compiler_sha256 = _verified_script_hash(
        Path(silhouette.__file__).resolve(),
        arguments.silhouette_compiler_sha256,
        "alpha_cutout_sparse_silhouette_compiler_hash_mismatch",
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
    sample_request_bytes = (
        None
        if arguments.emit_full_lattice_candidates
        else production._read_required_file(arguments.sample_request, "sample request")
    )
    _require_file_hash(profile_bytes, arguments.profile_sha256, "profile")
    _require_file_hash(request_bytes, arguments.request_sha256, "request")
    if sample_request_bytes is not None:
        _require_file_hash(
            sample_request_bytes,
            arguments.sample_request_sha256,
            "sample request",
        )
    profile = BakeProfile.from_mapping(production._parse_json(profile_bytes, "profile"))
    request = production._validate_request(
        production._parse_json(request_bytes, "request")
    )
    sample_request = (
        None
        if sample_request_bytes is None
        else _validate_sample_request(
            production._parse_json(sample_request_bytes, "sample request")
        )
    )
    if sample_request is not None and (
        sample_request["lightingProfileId"] != request["lightingProfileId"]
    ):
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
        if sample_request is not None:
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
        if arguments.emit_full_lattice_candidates:
            candidate_capture = _emit_full_lattice_candidate_chunks(
                package,
                collection,
                basis,
                output_root,
            )
            receipt = {
                "capture": candidate_capture,
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
                    "silhouetteCompilerSha256": silhouette_compiler_sha256,
                    "profileSha256": arguments.profile_sha256,
                    "requestSha256": arguments.request_sha256,
                    "toolchainSha256": arguments.toolchain_sha256,
                },
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
                "profile": {
                    "directionThree": request["sunPointDirectionWorld"],
                    "id": request["lightingProfileId"],
                },
                "productionEligible": False,
                "reconstruction": reconstruction,
                "schema": CANDIDATE_RECEIPT_SCHEMA,
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
            return
        coverage_diagnostic = {
            "mode": "authenticated_source_coverage",
            "productionEligible": sample_request["productionEligible"],
        }
        if arguments.force_cutout_opaque_diagnostic:
            if sample_request["productionEligible"]:
                fail(
                    "alpha_cutout_sparse_opaque_diagnostic_forbidden",
                    "Forced-opaque cutout coverage cannot produce release evidence.",
                )
            coverage_diagnostic = _force_cutout_materials_opaque(collection)
        elif arguments.disable_binding_flipy_diagnostic:
            if sample_request["productionEligible"]:
                fail(
                    "alpha_cutout_sparse_no_flipy_diagnostic_forbidden",
                    "Modified flipY semantics cannot produce release evidence.",
                )
            coverage_diagnostic = _disable_cutout_binding_flipy(collection)
        elif arguments.compile_cutout_silhouette_diagnostic:
            if sample_request["productionEligible"]:
                fail(
                    "alpha_cutout_sparse_silhouette_diagnostic_forbidden",
                    "An unproven deterministic silhouette compiler cannot produce release evidence.",
                )
            coverage_diagnostic = _compile_cutout_silhouette_diagnostic(
                package,
                collection,
                basis,
                sample_request,
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
                "silhouetteCompilerSha256": silhouette_compiler_sha256,
                "profileSha256": arguments.profile_sha256,
                "requestSha256": arguments.request_sha256,
                "sampleRequestSha256": arguments.sample_request_sha256,
                "toolchainSha256": arguments.toolchain_sha256,
            },
            "coverageDiagnostic": coverage_diagnostic,
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
    parser.add_argument("--sample-request", type=Path)
    parser.add_argument("--archive-sha256", type=_digest, required=True)
    parser.add_argument("--executable-sha256", type=_digest, required=True)
    parser.add_argument("--toolchain-sha256", type=_digest, required=True)
    parser.add_argument("--profile-sha256", type=_digest, required=True)
    parser.add_argument("--request-sha256", type=_digest, required=True)
    parser.add_argument("--sample-request-sha256", type=_digest)
    parser.add_argument("--producer-script-sha256", type=_digest, required=True)
    parser.add_argument("--silhouette-compiler-sha256", type=_digest, required=True)
    parser.add_argument("--production-renderer-sha256", type=_digest, required=True)
    parser.add_argument("--ai529-script-sha256", type=_digest, required=True)
    parser.add_argument("--package-raw-sha256", type=_digest, required=True)
    parser.add_argument("--force-cutout-opaque-diagnostic", action="store_true")
    parser.add_argument("--disable-binding-flipy-diagnostic", action="store_true")
    parser.add_argument("--compile-cutout-silhouette-diagnostic", action="store_true")
    parser.add_argument("--emit-full-lattice-candidates", action="store_true")
    arguments = parser.parse_args(raw)
    if arguments.emit_full_lattice_candidates:
        if arguments.sample_request is not None or arguments.sample_request_sha256 is not None:
            parser.error("full-lattice candidate mode does not accept sparse sample inputs")
    elif arguments.sample_request is None or arguments.sample_request_sha256 is None:
        parser.error("sparse capture requires --sample-request and its sha256")
    diagnostic_count = sum((
        arguments.force_cutout_opaque_diagnostic,
        arguments.disable_binding_flipy_diagnostic,
        arguments.compile_cutout_silhouette_diagnostic,
        arguments.emit_full_lattice_candidates,
    ))
    if diagnostic_count > 1:
        parser.error("coverage diagnostics are mutually exclusive")
    return arguments


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
    schema = value.get("schema") if isinstance(value, dict) else None
    coverage_keys = {
        "inCoverageCasterIds",
        "outOfCoverageCasterIds",
    } if schema == "ai531-production-alpha-cutout-bake-sample-request-v2" else set()
    _require_exact_keys(
        value,
        {
            "depthReference",
            "lightingProfileId",
            "method",
            "productionEligible",
            "samples",
            "schema",
        } | coverage_keys,
        "sample request",
    )
    if schema not in SAMPLE_REQUEST_SCHEMAS:
        fail(
            "alpha_cutout_sparse_request_schema_unsupported",
            "The sparse sample request schema is unsupported.",
            actual=schema,
        )
    production_eligible, sample_plan_method = SAMPLE_REQUEST_SCHEMAS[schema]
    if value["productionEligible"] is not production_eligible:
        fail(
            "alpha_cutout_sparse_request_eligibility_mismatch",
            "The sample request schema and production eligibility disagree.",
        )
    if not isinstance(value["lightingProfileId"], str) or not value["lightingProfileId"]:
        fail("alpha_cutout_sparse_profile_invalid", "The sample request has no lighting profile ID.")
    if value["method"] != sample_plan_method:
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
    if coverage_keys:
        in_coverage = _canonical_ids(
            value["inCoverageCasterIds"],
            "sample request in-coverage casters",
            allow_empty=False,
        )
        out_of_coverage = _canonical_ids(
            value["outOfCoverageCasterIds"],
            "sample request out-of-coverage casters",
            allow_empty=True,
        )
        if set(in_coverage) & set(out_of_coverage):
            fail(
                "alpha_cutout_sparse_coverage_overlap",
                "The sparse request coverage classes overlap.",
            )
        sampled = sorted({sample["casterId"] for sample in samples})
        if sampled != in_coverage:
            fail(
                "alpha_cutout_sparse_coverage_sample_mismatch",
                "The sparse request must sample every in-coverage caster and no out-of-coverage caster.",
            )
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


def _disable_cutout_binding_flipy(collection: Any) -> dict[str, Any]:
    converted = set()
    converted_texture_count = 0
    for blender_object in sorted(collection.objects, key=lambda item: item.name):
        if blender_object.type != "MESH":
            continue
        for slot in blender_object.material_slots:
            material = slot.material
            if material is None or material.get("bus_sim_coverage_mode") != "cutout":
                continue
            if material.name in converted:
                continue
            coverage_textures = [
                node for node in material.node_tree.nodes
                if node.bl_idname == "ShaderNodeTexImage"
                and node.image is not None
                and node.image.get("bus_sim_channel") == "a"
            ]
            if len(coverage_textures) != 1:
                fail(
                    "alpha_cutout_sparse_no_flipy_texture_invalid",
                    "A cutout material has no unique alpha coverage texture node.",
                    material=material.name,
                    textureCount=len(coverage_textures),
                )
            vector_links = list(coverage_textures[0].inputs["Vector"].links)
            if len(vector_links) != 1 or vector_links[0].from_node.bl_idname != "ShaderNodeCombineXYZ":
                fail(
                    "alpha_cutout_sparse_no_flipy_vector_invalid",
                    "A cutout coverage texture has no canonical transformed UV vector.",
                    material=material.name,
                )
            combine = vector_links[0].from_node
            y_links = list(combine.inputs["Y"].links)
            if len(y_links) != 1:
                fail(
                    "alpha_cutout_sparse_no_flipy_y_invalid",
                    "A cutout coverage texture has no canonical transformed V input.",
                    material=material.name,
                )
            source_socket = y_links[0].from_socket
            material.node_tree.links.remove(y_links[0])
            invert = material.node_tree.nodes.new("ShaderNodeMath")
            invert.operation = "SUBTRACT"
            invert.inputs[0].default_value = 1.0
            material.node_tree.links.new(source_socket, invert.inputs[1])
            material.node_tree.links.new(invert.outputs[0], combine.inputs["Y"])
            material["bus_sim_alpha_preservation"] = (
                "diagnostic_source_coverage_without_binding_flipy_v1"
            )
            material.node_tree.update_tag()
            material.update_tag()
            converted.add(material.name)
            converted_texture_count += 1
    if not converted or converted_texture_count != len(converted):
        fail(
            "alpha_cutout_sparse_no_flipy_diagnostic_vacuous",
            "The no-flipY diagnostic did not convert every cutout material exactly once.",
        )
    return {
        "convertedMaterialCount": len(converted),
        "convertedTextureCount": converted_texture_count,
        "mode": "diagnostic_source_coverage_without_binding_flipy_v1",
        "productionEligible": False,
    }


def _force_cutout_materials_opaque(collection: Any) -> dict[str, Any]:
    converted = set()
    removed_link_count = 0
    for blender_object in sorted(collection.objects, key=lambda item: item.name):
        if blender_object.type != "MESH":
            continue
        for slot in blender_object.material_slots:
            material = slot.material
            if material is None or material.get("bus_sim_coverage_mode") != "cutout":
                continue
            if material.name in converted:
                continue
            principled = [
                node for node in material.node_tree.nodes
                if node.bl_idname == "ShaderNodeBsdfPrincipled"
            ]
            if len(principled) != 1 or principled[0].inputs.get("Alpha") is None:
                fail(
                    "alpha_cutout_sparse_opaque_diagnostic_material_invalid",
                    "A reconstructed cutout material has no unique Principled alpha input.",
                    material=material.name,
                )
            alpha = principled[0].inputs["Alpha"]
            for link in list(alpha.links):
                material.node_tree.links.remove(link)
                removed_link_count += 1
            alpha.default_value = 1.0
            material["bus_sim_alpha_preservation"] = (
                "diagnostic_forced_opaque_cutout_coverage_v1"
            )
            material.node_tree.update_tag()
            material.update_tag()
            converted.add(material.name)
    if not converted or removed_link_count != len(converted):
        fail(
            "alpha_cutout_sparse_opaque_diagnostic_vacuous",
            "Forced-opaque diagnostics require one removed alpha link per cutout variant.",
            convertedMaterialCount=len(converted),
            removedLinkCount=removed_link_count,
        )
    return {
        "convertedMaterialCount": len(converted),
        "mode": "diagnostic_forced_opaque_cutout_coverage_v1",
        "productionEligible": False,
        "removedAlphaLinkCount": removed_link_count,
    }


def _emit_full_lattice_candidate_chunks(
    package: Any,
    collection: Any,
    basis: dict[str, Any],
    output_root: Path,
) -> dict[str, Any]:
    manifest = package.manifest
    materials = {entry["id"]: entry for entry in manifest["materials"]}
    alpha_inputs = {entry["id"]: entry for entry in manifest["alphaInputs"]}
    textures = {entry["id"]: entry for entry in manifest["textures"]}
    selected_mappings = sorted(
        (
            mapping
            for mapping in manifest["casterMappings"]
            if mapping.get("coverageMode") == "cutout"
            and mapping.get("channelRelevance", {}).get(production.CHANNEL_ID) is True
        ),
        key=lambda entry: entry["id"],
    )
    selected_cutout_material_ids = sorted({
        mapping["materialId"] for mapping in selected_mappings
    })
    if len(selected_cutout_material_ids) != 1:
        fail(
            "alpha_cutout_candidate_profile_count_unsupported",
            "The full-lattice candidate producer requires one exact cutout profile.",
            materialIds=selected_cutout_material_ids,
        )
    material_id = selected_cutout_material_ids[0]
    material_record = materials[material_id]
    alpha_record = alpha_inputs[material_record["alphaInputId"]]
    alpha = alpha_record.get("alpha", {})
    alpha_texture_inputs = alpha.get("inputs", [])
    if (
        alpha.get("mode") != "cutout"
        or alpha.get("alphaTest") != 0.5
        or alpha.get("opacity") != 1
        or alpha.get("proceduralCoverage") != []
        or alpha_record.get("vertexColors") is not False
        or len(alpha_texture_inputs) != 1
        or alpha_texture_inputs[0].get("operation") != "multiply"
        or alpha_texture_inputs[0].get("channel") not in ("r", "g", "b", "a")
    ):
        fail(
            "alpha_cutout_candidate_expression_unsupported",
            "The candidate producer requires the exact authenticated scalar cutout expression.",
            materialId=material_id,
        )
    alpha_texture_input = alpha_texture_inputs[0]
    binding = textures[alpha_texture_input["bindingId"]]
    source = textures[binding["sourceId"]]
    channel = alpha_texture_input["channel"]
    coverage = source.get("coverageChannels", {}).get(channel)
    width = source.get("width")
    height = source.get("height")
    if (
        source.get("kind") != "source"
        or source.get("storage") != "raw_typed_pixels"
        or source.get("componentType") != "uint8"
        or not isinstance(width, int)
        or not isinstance(height, int)
        or width <= 0
        or height <= 0
        or not isinstance(coverage, dict)
        or coverage.get("byteLength") != width * height
        or binding.get("kind") != "binding"
        or binding.get("mapping") != 300
        or binding.get("magFilter") != 1006
        or binding.get("minFilter") != 1008
        or binding.get("generateMipmaps") is not True
        or binding.get("anisotropy") != 8
        or binding.get("wrapS") not in (
            silhouette.THREE_REPEAT_WRAPPING,
            silhouette.THREE_CLAMP_TO_EDGE_WRAPPING,
            silhouette.THREE_MIRRORED_REPEAT_WRAPPING,
        )
        or binding.get("wrapT") not in (
            silhouette.THREE_REPEAT_WRAPPING,
            silhouette.THREE_CLAMP_TO_EDGE_WRAPPING,
            silhouette.THREE_MIRRORED_REPEAT_WRAPPING,
        )
    ):
        fail(
            "alpha_cutout_candidate_binding_unsupported",
            "The candidate producer received an unsupported authenticated texture profile.",
            bindingId=binding.get("id"),
            sourceId=source.get("id"),
        )
    coverage_bytes = package.get_buffer_bytes(
        f"{source['id']}:coverage:{channel}"
    )
    coverage_sha256 = framed_sha256(
        f"{TEXTURE_COVERAGE_DOMAIN}/{channel}",
        (coverage_bytes,),
        len(coverage_bytes),
    )
    if (
        len(coverage_bytes) != coverage["byteLength"]
        or coverage_sha256 != coverage["sha256"]
    ):
        fail(
            "alpha_cutout_candidate_coverage_mismatch",
            "The candidate coverage bytes differ from their domain-separated semantic digest.",
            expected=coverage["sha256"],
            actual=coverage_sha256,
        )
    texture = silhouette.AlphaTextureMip0(
        width=width,
        height=height,
        pixels=coverage_bytes,
        matrix=binding["matrix"],
        flip_y=binding["flipY"],
        wrap_s=binding["wrapS"],
        wrap_t=binding["wrapT"],
        generate_mipmaps=True,
        anisotropy=8,
    )
    layout = basis["layout"]
    lattice = silhouette.OrthographicLightLattice(
        origin_world=basis["basis"]["originWorld"],
        right_axis_world=basis["basis"]["rightAxisWorld"],
        up_axis_world=basis["basis"]["upAxisWorld"],
        depth_axis_world=basis["basis"]["depthAxisWorld"],
        bounds_min_light=layout["boundsLightMeters"]["min"],
        texel_size=(layout["texelSizeMeters"], layout["texelSizeMeters"]),
        width=layout["tileCount"][0] * layout["interiorPixels"][0],
        height=layout["tileCount"][1] * layout["interiorPixels"][1],
    )
    triangles = []
    triangle_sources = []
    for blender_object in sorted(collection.objects, key=lambda item: item.name):
        if blender_object.type != "MESH":
            continue
        source_mesh = blender_object.data
        for polygon in source_mesh.polygons:
            material = blender_object.material_slots[polygon.material_index].material
            mode = material.get("bus_sim_coverage_mode") if material else None
            if mode != "cutout":
                continue
            if material.get("bus_sim_stable_material_id") != material_id:
                fail(
                    "alpha_cutout_candidate_material_mismatch",
                    "A cutout polygon names a different authenticated material.",
                    object=blender_object.name,
                    polygonIndex=int(polygon.index),
                )
            if len(polygon.vertices) != 3 or len(polygon.loop_indices) != 3:
                fail(
                    "alpha_cutout_candidate_polygon_nontriangle",
                    "Full-lattice candidate geometry must be triangulated.",
                    object=blender_object.name,
                )
            uv_name = "uv" if binding["channel"] == 0 else f"uv{binding['channel']}"
            uv_layer = source_mesh.uv_layers.get(uv_name)
            if uv_layer is None:
                fail(
                    "alpha_cutout_candidate_uv_missing",
                    "A candidate polygon has no authenticated texture UV layer.",
                    object=blender_object.name,
                    uvLayer=uv_name,
                )
            side = int(material.get("bus_sim_effective_shadow_side"))
            compiler_side = {
                production.THREE_FRONT_SIDE: silhouette.SIDE_BACK,
                production.THREE_BACK_SIDE: silhouette.SIDE_FRONT,
                production.THREE_DOUBLE_SIDE: silhouette.SIDE_DOUBLE,
            }.get(side)
            if compiler_side is None:
                fail(
                    "alpha_cutout_candidate_side_unsupported",
                    "A candidate polygon has an unsupported effective shadow side.",
                    side=side,
                )
            triangles.append(silhouette.CutoutTriangle(
                vertices=tuple(
                    production._blender_to_three(
                        blender_object.matrix_world
                        @ source_mesh.vertices[index].co
                    )
                    for index in polygon.vertices
                ),
                uvs=tuple(
                    tuple(float(value) for value in uv_layer.data[index].uv)
                    for index in polygon.loop_indices
                ),
                side=compiler_side,
            ))
            triangle_sources.append({
                "geometryId": blender_object.get("bus_sim_geometry_id"),
                "instanceId": blender_object.get("bus_sim_stable_id"),
                "objectId": blender_object.get("bus_sim_object_id"),
                "polygonIndex": int(polygon.index),
            })
    if not triangles:
        fail(
            "alpha_cutout_candidate_geometry_missing",
            "The reconstructed source has no authenticated cutout triangles.",
        )
    triangle_authority_bytes = canonical_json_bytes({
        "schema": "ai531-production-alpha-cutout-source-triangle-authority-v1",
        "triangles": triangle_sources,
    })
    triangle_authority = _write_evidence(
        output_root,
        "source_triangles.json",
        triangle_authority_bytes,
    )
    tile_outputs = [
        {
            "candidateCount": 0,
            "chunks": [],
            "coordinates": list(tile["coordinates"]),
            "tileId": tile["id"],
            "tileIndex": index,
        }
        for index, tile in enumerate(basis["tiles"])
    ]
    aggregate = hashlib.sha256()

    def write_chunk(
        tile_index: int,
        chunk_index: int,
        data: bytes,
        record_count: int,
    ) -> None:
        tile = tile_outputs[tile_index]
        if chunk_index != len(tile["chunks"]):
            fail(
                "alpha_cutout_candidate_chunk_order_invalid",
                "Candidate chunks must be emitted in canonical order.",
                tileIndex=tile_index,
                chunkIndex=chunk_index,
            )
        relative = (
            f"chunks/{tile['tileId']}/candidate_{chunk_index:06d}.bin"
        )
        absolute = output_root / relative
        absolute.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_bytes(absolute, data)
        record = {
            "byteLength": len(data),
            "chunkIndex": chunk_index,
            "path": relative,
            "recordCount": record_count,
            "sha256": sha256_bytes(data),
        }
        tile["candidateCount"] += record_count
        tile["chunks"].append(record)
        aggregate.update(data)

    compiler_stats = silhouette.emit_cutout_candidate_chunks(
        triangles,
        texture,
        lattice,
        layout["interiorPixels"],
        write_chunk,
        maximum_chunk_records=65_536,
    )
    if (
        compiler_stats["sourceTriangleCount"] != len(triangle_sources)
        or compiler_stats["candidateCount"]
        != sum(tile["candidateCount"] for tile in tile_outputs)
    ):
        fail(
            "alpha_cutout_candidate_count_mismatch",
            "Candidate compiler counts differ from emitted authenticated outputs.",
        )
    return {
        "aggregateCandidateBytesSha256": aggregate.hexdigest(),
        "alphaTest": float(alpha["alphaTest"]),
        "binding": binding,
        "candidateCount": compiler_stats["candidateCount"],
        "chunkCount": compiler_stats["chunkCount"],
        "compilerStats": compiler_stats,
        "compilerVersionIdentity":
            silhouette.cutout_candidate_version_identity(),
        "cutoutCasterIds": [mapping["id"] for mapping in selected_mappings],
        "materialId": material_id,
        "method": "headless-blender-full-lattice-geometric-candidates-v1",
        "outputs": tile_outputs,
        "recordByteLength": silhouette.CUTOUT_CANDIDATE_RECORD_BYTE_LENGTH,
        "sourceCutoutTriangleCount": len(triangles),
        "sourceId": source["id"],
        "sourceTriangleAuthority": triangle_authority,
        "status": "captured",
        "textureCoverage": {
            "byteLength": coverage["byteLength"],
            "channel": channel,
            "sha256": coverage["sha256"],
        },
    }


def _compile_cutout_silhouette_diagnostic(
    package: Any,
    collection: Any,
    basis: dict[str, Any],
    sample_request: dict[str, Any],
) -> dict[str, Any]:
    import bmesh
    import bpy

    manifest = package.manifest
    materials = {entry["id"]: entry for entry in manifest["materials"]}
    alpha_inputs = {entry["id"]: entry for entry in manifest["alphaInputs"]}
    textures = {entry["id"]: entry for entry in manifest["textures"]}
    selected_cutout_material_ids = sorted({
        mapping["materialId"]
        for mapping in manifest["casterMappings"]
        if mapping.get("coverageMode") == "cutout"
        and mapping.get("channelRelevance", {}).get(production.CHANNEL_ID) is True
    })
    if len(selected_cutout_material_ids) != 1:
        fail(
            "alpha_cutout_sparse_silhouette_profile_count_unsupported",
            "The diagnostic compiler currently requires one exact cutout sampling profile.",
            materialIds=selected_cutout_material_ids,
        )
    material_id = selected_cutout_material_ids[0]
    material_record = materials[material_id]
    alpha_record = alpha_inputs[material_record["alphaInputId"]]
    alpha = alpha_record.get("alpha", {})
    alpha_texture_inputs = alpha.get("inputs", [])
    if (
        alpha.get("mode") != "cutout"
        or alpha.get("opacity") != 1
        or alpha.get("proceduralCoverage") != []
        or alpha_record.get("vertexColors") is not False
        or len(alpha_texture_inputs) != 1
        or alpha_texture_inputs[0].get("operation") != "multiply"
        or alpha_texture_inputs[0].get("channel") not in ("r", "g", "b", "a")
    ):
        fail(
            "alpha_cutout_sparse_silhouette_expression_unsupported",
            "The diagnostic compiler requires one scalar texture channel with unit opacity and no vertex/procedural coverage.",
            materialId=material_id,
        )
    alpha_texture_input = alpha_texture_inputs[0]
    binding = textures[alpha_texture_input["bindingId"]]
    source = textures[binding["sourceId"]]
    channel = alpha_texture_input["channel"]
    coverage = source.get("coverageChannels", {}).get(channel)
    width = source.get("width")
    height = source.get("height")
    if (
        source.get("kind") != "source"
        or source.get("storage") != "raw_typed_pixels"
        or source.get("componentType") != "uint8"
        or not isinstance(width, int)
        or not isinstance(height, int)
        or width <= 0
        or height <= 0
        or not isinstance(coverage, dict)
        or coverage.get("byteLength") != width * height
        or binding.get("kind") != "binding"
        or binding.get("mapping") != 300
        or binding.get("magFilter") != 1006
        or binding.get("minFilter") != 1008
        or binding.get("generateMipmaps") is not True
        or binding.get("anisotropy") != 8
        or binding.get("wrapS") not in (
            silhouette.THREE_REPEAT_WRAPPING,
            silhouette.THREE_CLAMP_TO_EDGE_WRAPPING,
            silhouette.THREE_MIRRORED_REPEAT_WRAPPING,
        )
        or binding.get("wrapT") not in (
            silhouette.THREE_REPEAT_WRAPPING,
            silhouette.THREE_CLAMP_TO_EDGE_WRAPPING,
            silhouette.THREE_MIRRORED_REPEAT_WRAPPING,
        )
    ):
        fail(
            "alpha_cutout_sparse_silhouette_binding_unsupported",
            "The authenticated cutout texture profile is outside the deterministic diagnostic compiler contract.",
            bindingId=binding.get("id"),
            sourceId=source.get("id"),
        )
    coverage_bytes = package.get_buffer_bytes(
        f"{source['id']}:coverage:{channel}"
    )
    if len(coverage_bytes) != coverage["byteLength"]:
        fail(
            "alpha_cutout_sparse_silhouette_coverage_length_mismatch",
            "The authenticated coverage buffer length changed after package validation.",
        )
    texture = silhouette.AlphaTextureMip0(
        width=width,
        height=height,
        pixels=coverage_bytes,
        matrix=binding["matrix"],
        flip_y=binding["flipY"],
        wrap_s=binding["wrapS"],
        wrap_t=binding["wrapT"],
        generate_mipmaps=True,
        anisotropy=8,
    )
    layout = basis["layout"]
    lattice = silhouette.OrthographicLightLattice(
        origin_world=basis["basis"]["originWorld"],
        right_axis_world=basis["basis"]["rightAxisWorld"],
        up_axis_world=basis["basis"]["upAxisWorld"],
        depth_axis_world=basis["basis"]["depthAxisWorld"],
        bounds_min_light=layout["boundsLightMeters"]["min"],
        texel_size=(layout["texelSizeMeters"], layout["texelSizeMeters"]),
        width=layout["tileCount"][0] * layout["interiorPixels"][0],
        height=layout["tileCount"][1] * layout["interiorPixels"][1],
    )
    sample_pixels = sorted({
        tuple(sample["globalTexel"])
        for sample in sample_request["samples"]
    }, key=lambda pixel: (pixel[1], pixel[0]))
    triangles = []
    triangle_sources = []
    removals = []
    proxy_material = None
    for blender_object in sorted(collection.objects, key=lambda item: item.name):
        if blender_object.type != "MESH":
            continue
        source_mesh = blender_object.data
        cutout_indices = []
        for polygon in source_mesh.polygons:
            material = blender_object.material_slots[polygon.material_index].material
            mode = material.get("bus_sim_coverage_mode") if material else None
            if mode != "cutout":
                continue
            if material.get("bus_sim_stable_material_id") != material_id:
                fail(
                    "alpha_cutout_sparse_silhouette_material_mismatch",
                    "A reconstructed cutout polygon names a different authenticated material.",
                    object=blender_object.name,
                    polygonIndex=int(polygon.index),
                )
            if len(polygon.vertices) != 3 or len(polygon.loop_indices) != 3:
                fail(
                    "alpha_cutout_sparse_silhouette_polygon_nontriangle",
                    "The deterministic silhouette compiler requires triangulated cutout geometry.",
                    object=blender_object.name,
                )
            uv_name = "uv" if binding["channel"] == 0 else f"uv{binding['channel']}"
            uv_layer = source_mesh.uv_layers.get(uv_name)
            if uv_layer is None:
                fail(
                    "alpha_cutout_sparse_silhouette_uv_missing",
                    "A reconstructed cutout polygon has no authenticated texture UV layer.",
                    object=blender_object.name,
                    uvLayer=uv_name,
                )
            world_vertices = tuple(
                production._blender_to_three(
                    blender_object.matrix_world @ source_mesh.vertices[index].co
                )
                for index in polygon.vertices
            )
            uvs = tuple(
                tuple(float(value) for value in uv_layer.data[index].uv)
                for index in polygon.loop_indices
            )
            side = int(material.get("bus_sim_effective_shadow_side"))
            compiler_side = {
                production.THREE_FRONT_SIDE: silhouette.SIDE_BACK,
                production.THREE_BACK_SIDE: silhouette.SIDE_FRONT,
                production.THREE_DOUBLE_SIDE: silhouette.SIDE_DOUBLE,
            }.get(side)
            if compiler_side is None:
                fail(
                    "alpha_cutout_sparse_silhouette_side_unsupported",
                    "A reconstructed cutout polygon has no supported effective shadow side.",
                    side=side,
                )
            triangles.append(silhouette.CutoutTriangle(
                vertices=world_vertices,
                uvs=uvs,
                side=compiler_side,
            ))
            triangle_sources.append({
                "geometryId": blender_object.get("bus_sim_geometry_id"),
                "instanceId": blender_object.get("bus_sim_stable_id"),
                "objectId": blender_object.get("bus_sim_object_id"),
                "polygonIndex": int(polygon.index),
            })
            cutout_indices.append(int(polygon.index))
            proxy_material = material
        if cutout_indices:
            removals.append((blender_object, cutout_indices))
    if not triangles or proxy_material is None:
        fail(
            "alpha_cutout_sparse_silhouette_geometry_missing",
            "The reconstructed source has no cutout triangles for deterministic compilation.",
        )
    compiled = silhouette.compile_cutout_silhouettes(
        triangles,
        texture,
        lattice,
        float(alpha["alphaTest"]),
        sample_pixels=sample_pixels,
    )
    restricted_sample_diagnostics = []
    for sample in compiled["restrictedSampleDiagnostics"]:
        restricted_sample_diagnostics.append({
            "candidates": [
                {
                    **candidate,
                    "source": triangle_sources[candidate["sourceTriangleIndex"]],
                }
                for candidate in sample["candidates"]
            ],
            "x": sample["x"],
            "y": sample["y"],
        })
    if not compiled["triangles"]:
        fail(
            "alpha_cutout_sparse_silhouette_proxy_empty",
            "The deterministic sampler retained no authenticated sparse cutout texels.",
        )
    for blender_object, cutout_indices in removals:
        source_mesh = blender_object.data
        compiled_source_mesh = source_mesh.copy()
        compiled_source_mesh.name = source_mesh.name + "_AI531_CUTOUT_REMOVED"
        blender_object.data = compiled_source_mesh
        mesh_edit = bmesh.new()
        try:
            mesh_edit.from_mesh(compiled_source_mesh)
            mesh_edit.faces.ensure_lookup_table()
            bmesh.ops.delete(
                mesh_edit,
                geom=[mesh_edit.faces[index] for index in cutout_indices],
                context="FACES",
            )
            mesh_edit.to_mesh(compiled_source_mesh)
        finally:
            mesh_edit.free()
        compiled_source_mesh.update(calc_edges=True)
    opaque_proxy_material = proxy_material.copy()
    opaque_proxy_material.name = proxy_material.name + "_AI531_COMPILED_SILHOUETTE"
    principled_nodes = [
        node for node in opaque_proxy_material.node_tree.nodes
        if node.bl_idname == "ShaderNodeBsdfPrincipled"
    ]
    if len(principled_nodes) != 1 or "Alpha" not in principled_nodes[0].inputs:
        fail(
            "alpha_cutout_sparse_silhouette_proxy_material_invalid",
            "The converted depth material has no unique Principled alpha socket.",
        )
    alpha_socket = principled_nodes[0].inputs["Alpha"]
    for link in list(opaque_proxy_material.node_tree.links):
        if link.to_socket == alpha_socket:
            opaque_proxy_material.node_tree.links.remove(link)
    alpha_socket.default_value = 1.0
    opaque_proxy_material["bus_sim_coverage_mode"] = "compiled_cutout_proxy"
    opaque_proxy_material["bus_sim_alpha_preservation"] = (
        "deterministic_compiled_silhouette_opaque_proxy_v1"
    )
    proxy_mesh = bpy.data.meshes.new("AI531_Deterministic_Cutout_Silhouette")
    proxy_mesh.from_pydata(
        [production._three_to_blender(vertex) for vertex in compiled["vertices"]],
        [],
        compiled["triangles"],
    )
    proxy_mesh.materials.append(opaque_proxy_material)
    proxy_mesh["bus_sim_cutout_silhouette_version"] = compiled["version"]
    proxy_mesh.update(calc_edges=True)
    proxy_object = bpy.data.objects.new(
        "AI531_Deterministic_Cutout_Silhouette",
        proxy_mesh,
    )
    proxy_object["bus_sim_stable_id"] = "ai531:deterministic-cutout-silhouette"
    collection.objects.link(proxy_object)
    bpy.context.view_layer.update()
    return {
        "bindingId": binding["id"],
        "compilerStats": compiled["stats"],
        "compilerVersionIdentity": compiled["versionIdentity"],
        "coverageSha256": coverage["sha256"],
        "materialId": material_id,
        "mode": "diagnostic_deterministic_compiled_cutout_silhouette_v1",
        "productionEligible": False,
        "proxyTriangleCount": len(compiled["triangles"]),
        "restrictedSampleDiagnostics": restricted_sample_diagnostics,
        "sampleRestriction": compiled["sampleRestriction"],
        "sourceCutoutTriangleCount": len(triangles),
        "sourceId": source["id"],
    }


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
            if mode == "cutout" or mode == "compiled_cutout_proxy":
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
    texel_size = float(basis["layout"]["texelSizeMeters"])
    expected_tile_width = resolution_x * texel_size
    if abs(float(camera.data.ortho_scale) - expected_tile_width) > 1e-9:
        fail(
            "alpha_cutout_sparse_camera_scale_mismatch",
            "The configured production camera width differs from the authenticated texel lattice.",
            expected=expected_tile_width,
            actual=float(camera.data.ortho_scale),
        )
    # Blender clamps render dimensions below four pixels. A four-pixel-wide
    # orthographic view with a four-texel world span therefore retains the exact
    # production pixel footprint. The camera shift below places the requested
    # production texel at SPARSE_SOURCE_PIXEL despite the even raster size.
    scene.render.resolution_x = SPARSE_RENDER_SIZE
    scene.render.resolution_y = SPARSE_RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.use_border = False
    scene.render.use_crop_to_border = False
    camera.data.ortho_scale = texel_size * SPARSE_RENDER_SIZE
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
    bounds = basis["layout"]["boundsLightMeters"]
    for sample in sample_request["samples"]:
        index = sample["index"]
        global_x, global_y = sample["globalTexel"]
        light_x = bounds["min"][0] + (global_x + 0.5) * texel_size
        light_y = bounds["min"][1] + (global_y + 0.5) * texel_size
        source_offset_x = (
            SPARSE_SOURCE_PIXEL[0] + 0.5 - SPARSE_RENDER_SIZE * 0.5
        ) * texel_size
        source_offset_y = (
            SPARSE_SOURCE_PIXEL[1] + 0.5 - SPARSE_RENDER_SIZE * 0.5
        ) * texel_size
        camera.location = (
            origin
            + right * (light_x + source_offset_x)
            + up * (light_y - source_offset_y)
            + depth * camera_origin_depth
        )
        pixels = production._capture_render_strip(
            scene,
            capture_root / f"sample_{index:05d}.exr",
            SPARSE_RENDER_SIZE,
            SPARSE_RENDER_SIZE,
        )
        expected_value_count = SPARSE_RENDER_SIZE * SPARSE_RENDER_SIZE * 4
        if len(pixels) != expected_value_count:
            fail(
                "alpha_cutout_sparse_micro_render_shape_mismatch",
                "A sparse micro-render returned an unexpected RGBA value count.",
                index=index,
                expectedValueCount=expected_value_count,
                valueCount=len(pixels),
            )
        pixel_offset = (SPARSE_SOURCE_PIXEL[1] * SPARSE_RENDER_SIZE
                        + SPARSE_SOURCE_PIXEL[0]) * 4
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


def _canonical_ids(value: Any, label: str, allow_empty: bool) -> list[str]:
    if not isinstance(value, list) or (not allow_empty and not value) or any(
        not isinstance(entry, str) or not entry for entry in value
    ):
        fail(
            "alpha_cutout_sparse_coverage_ids_invalid",
            "A sparse request coverage class is invalid.",
            label=label,
        )
    if value != sorted(set(value)):
        fail(
            "alpha_cutout_sparse_coverage_ids_noncanonical",
            "A sparse request coverage class is not canonical.",
            label=label,
        )
    return value


def _finite_number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        fail("alpha_cutout_sparse_number_invalid", "A sparse request number is not finite.", label=label)
    return float(value)


if __name__ == "__main__":
    main()
