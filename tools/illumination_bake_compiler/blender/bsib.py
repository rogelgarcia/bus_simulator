"""Verified low-level reader and semantic boundary for resolved-city BSIB files."""

from __future__ import annotations

import hashlib
import json
import math
import mmap
import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from canonical import canonical_json_bytes, canonical_string_key, framed_sha256, require_sha256, sha256_bytes
from errors import fail


MAGIC = b"ILBSRC01"
VERSION = 1
HEADER_PREFIX_LENGTH = 32
HEADER_LENGTH = 64
PACKAGE_SCHEMA = "bus-simulator/illumination/bake-source-package/v1"
TABLE_SCHEMA = "bus-simulator/illumination/bake-source-buffer-table/v1"
PACKAGE_INTEGRITY_DOMAIN = "bus-simulator/illumination/bake-source/package-integrity/v1"
BUFFER_INTEGRITY_DOMAIN = "bus-simulator/illumination/bake-source/buffer-integrity/v1"
FINAL_FILE_DOMAIN = "bus-simulator/illumination/bake-source/final-file/v1"
GEOMETRY_CONTENT_DOMAIN = "bus-simulator/illumination/bake-source/evaluated-geometry-buffer/v1"
TEXTURE_CONTENT_DOMAIN = "bus-simulator/illumination/bake-source/texture-content/v1"
TEXTURE_COVERAGE_DOMAIN = "bus-simulator/illumination/bake-source/texture-coverage-channel/v1"
PROFILE_ASSET_DOMAIN = "bus-simulator/illumination/bake-source/profile-asset/v1"
FORMAT = "bus-sim-illumination-bake-input-v1"
HASH_SET_SCHEMA = "bus-simulator/illumination/bake-source-hash-set/v1"
PINNED_ARCHIVE = "blender-5.2.1-windows-x64.zip"
PINNED_ARCHIVE_SHA256 = "0e631dad7d0cad6d5d18abdd2e2550f6c0213215334eda00ddbd3d22b96ecb2c"
PINNED_COMPILER_REFERENCE = "blender-5.2.1-lts-cycles-cpu-contract-v1"
REQUIRED_CHANNELS = frozenset(("direct_receiver", "indirect_irradiance", "static_ao_bent_normal", "static_sun_depth"))
REQUIRED_MANIFEST_KEYS = (
    "alphaInputs", "buffers", "casterMappings", "categories", "channelProfiles", "chunks",
    "colorContract", "compilerReferences", "containerVersion", "coordinateContract", "extractorContract",
    "format", "geometries", "hashes", "lightingProfiles", "materials", "meshInstances", "objects",
    "participantMappings", "readiness", "receiverMappings", "roots", "schemaVersion", "source", "textures",
)
COMPONENTS = {
    "i8": ("b", 1, True),
    "u8": ("B", 1, False),
    "i16": ("h", 2, True),
    "u16": ("H", 2, False),
    "i32": ("i", 4, True),
    "u32": ("I", 4, False),
    "f32": ("f", 4, None),
    "f64": ("d", 8, None),
}
ARRAY_COMPONENT_TYPES = {
    "Int8Array": "i8", "Uint8Array": "u8", "Uint8ClampedArray": "u8",
    "Int16Array": "i16", "Uint16Array": "u16", "Int32Array": "i32",
    "Uint32Array": "u32", "Float32Array": "f32", "Float64Array": "f64",
}
SHA_PATTERN = re.compile(r"^[0-9a-f]{64}$")
NUMBER_PATTERN = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?")


@dataclass(frozen=True)
class BlobDescriptor:
    sha256: str
    byte_length: int
    offset: int


@dataclass(frozen=True)
class BufferDescriptor:
    id: str
    blob_index: int
    sha256: str
    byte_length: int
    storage_offset: int


class BsibPackage:
    def __init__(self, path: Path, stream: Any, mapped: mmap.mmap, manifest: dict[str, Any], buffers: tuple[BufferDescriptor, ...], blobs: tuple[BlobDescriptor, ...], payload_offset: int, raw_sha256: str, final_file_sha256: str) -> None:
        self.path = path
        self._stream = stream
        self._mapped = mapped
        self.manifest = manifest
        self.buffers = buffers
        self.blobs = blobs
        self.payload_offset = payload_offset
        self.raw_sha256 = raw_sha256
        self.final_file_sha256 = final_file_sha256
        self._buffer_by_id = {entry.id: entry for entry in buffers}

    def __enter__(self) -> "BsibPackage":
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> None:
        self.close()

    def close(self) -> None:
        self._mapped.close()
        self._stream.close()

    def has_buffer(self, stable_id: str) -> bool:
        _require_stable_id(stable_id, "buffer id")
        return stable_id in self._buffer_by_id

    def get_buffer_view(self, stable_id: str) -> memoryview:
        _require_stable_id(stable_id, "buffer id")
        descriptor = self._buffer_by_id.get(stable_id)
        if descriptor is None:
            fail("bsib_buffer_missing", "The package has no requested logical buffer.", id=stable_id)
        start = self.payload_offset + descriptor.storage_offset
        return memoryview(self._mapped)[start:start + descriptor.byte_length]

    def get_buffer_bytes(self, stable_id: str) -> bytes:
        return bytes(self.get_buffer_view(stable_id))


def open_verified_package(path: Path, expected_raw_sha256: str) -> BsibPackage:
    expected_raw_sha256 = require_sha256(expected_raw_sha256, "input package raw hash")
    try:
        resolved = path.resolve(strict=True)
        stream = resolved.open("rb")
    except OSError as error:
        fail("bsib_open_failed", "The declared BSIB input could not be opened.", reason=str(error))
    try:
        size = resolved.stat().st_size
        if size < HEADER_LENGTH:
            fail("bsib_truncated_header", "The BSIB file is shorter than its fixed header.", byteLength=size)
        mapped = mmap.mmap(stream.fileno(), 0, access=mmap.ACCESS_READ)
        try:
            preamble = mapped[:HEADER_PREFIX_LENGTH]
            if preamble[:8] != MAGIC:
                fail("bsib_magic_mismatch", "The BSIB magic does not match ILBSRC01.")
            version, flags, manifest_length, table_length, payload_length, buffer_count, unique_count = struct.unpack_from("<HHIIIII", preamble, 8)
            if version != VERSION:
                fail("bsib_version_unsupported", "The BSIB container version is unsupported.", expected=VERSION, actual=version)
            if flags != 0:
                fail("bsib_flags_unsupported", "The BSIB V1 header has nonzero flags.", actual=flags)
            expected_length = HEADER_LENGTH + manifest_length + table_length + payload_length
            if expected_length != size:
                fail("bsib_length_mismatch", "The BSIB declared sections do not exactly cover the file.", expected=expected_length, actual=size)
            stored_integrity = mapped[HEADER_PREFIX_LENGTH:HEADER_LENGTH].hex()
            integrity = framed_sha256(PACKAGE_INTEGRITY_DOMAIN, (memoryview(mapped)[:HEADER_PREFIX_LENGTH], memoryview(mapped)[HEADER_LENGTH:]), HEADER_PREFIX_LENGTH + size - HEADER_LENGTH)
            if integrity != stored_integrity:
                fail("bsib_integrity_mismatch", "The BSIB package-integrity digest does not match.", expected=stored_integrity, actual=integrity)
            manifest_offset = HEADER_LENGTH
            table_offset = manifest_offset + manifest_length
            payload_offset = table_offset + table_length
            manifest = _load_canonical_object(mapped[manifest_offset:table_offset], "manifest", False)
            table = _load_canonical_object(mapped[table_offset:payload_offset], "buffer table", True)
            blobs, buffers = _validate_table(table, buffer_count, unique_count, payload_length)
            for index, blob in enumerate(blobs):
                start = payload_offset + blob.offset
                actual = framed_sha256(BUFFER_INTEGRITY_DOMAIN, (memoryview(mapped)[start:start + blob.byte_length],), blob.byte_length)
                if actual != blob.sha256:
                    fail("bsib_blob_integrity_mismatch", "A BSIB payload blob failed its integrity digest.", blobIndex=index, expected=blob.sha256, actual=actual)
            public_buffers = tuple(BufferDescriptor(entry["id"], entry["blobIndex"], blobs[entry["blobIndex"]].sha256, blobs[entry["blobIndex"]].byte_length, blobs[entry["blobIndex"]].offset) for entry in table["buffers"])
            raw_digest = hashlib.sha256(memoryview(mapped)).hexdigest()
            final_digest = framed_sha256(FINAL_FILE_DOMAIN, (memoryview(mapped),), size)
            if raw_digest != expected_raw_sha256:
                fail("bsib_input_hash_mismatch", "The BSIB raw file digest does not match the required input hash.", expected=expected_raw_sha256, actual=raw_digest)
            return BsibPackage(resolved, stream, mapped, manifest, public_buffers, blobs, payload_offset, raw_digest, final_digest)
        except Exception:
            mapped.close()
            raise
    except Exception:
        stream.close()
        raise


def validate_resolved_city_contract(package: BsibPackage, expected_archive_sha256: str = PINNED_ARCHIVE_SHA256) -> dict[str, Any]:
    manifest = package.manifest
    if tuple(sorted(manifest, key=canonical_string_key)) != REQUIRED_MANIFEST_KEYS:
        fail("manifest_shape_invalid", "The resolved-city manifest top-level shape is not exact V1.", actual=sorted(manifest))
    if manifest.get("format") != FORMAT or manifest.get("schemaVersion") != 1 or manifest.get("containerVersion") != {"major": 1, "minor": 0}:
        fail("manifest_version_unsupported", "The resolved-city semantic or container version is unsupported.")
    coordinate = manifest.get("coordinateContract")
    expected_basis = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]
    if not isinstance(coordinate, dict) or coordinate.get("source") != "three_right_handed_y_up_column_major" or coordinate.get("target") != "blender_right_handed_z_up_column_major" or coordinate.get("units") != "meters" or coordinate.get("logicalUvOrigin") != "lower_left" or coordinate.get("threeToBlenderBasisColumnMajor") != expected_basis:
        fail("manifest_coordinate_contract_unsupported", "The resolved-city coordinate or UV contract is unsupported.")
    if not isinstance(manifest.get("colorContract"), str) or not manifest["colorContract"].strip():
        fail("manifest_color_contract_invalid", "The resolved-city color contract is missing.")
    extractor = manifest.get("extractorContract")
    if not isinstance(extractor, dict) or extractor.get("sourceHashSetSchema") != HASH_SET_SCHEMA:
        fail("manifest_extractor_contract_unsupported", "The resolved-city extractor hash-set contract is unsupported.")
    readiness = manifest.get("readiness")
    if not isinstance(readiness, dict) or readiness.get("schema") != "resolved-city-bake-readiness-v1" or readiness.get("freshSourceEqualityVerified") is not True or readiness.get("lightingProfileSourcesReady") is not True:
        fail("manifest_readiness_invalid", "The package was not exported from a verified ready resolved city.")
    source = manifest.get("source")
    if not isinstance(source, dict) or not isinstance(source.get("exportProfileId"), str) or not isinstance(source.get("unsupportedCases"), list) or not isinstance(source.get("semanticConflicts"), list) or "sourceSelection" not in source:
        fail("manifest_source_invalid", "The resolved-source projection is incomplete.")
    inventories: dict[str, dict[str, dict[str, Any]]] = {}
    for name in ("categories", "chunks", "roots", "objects", "geometries", "meshInstances", "materials", "textures", "alphaInputs", "participantMappings", "receiverMappings", "casterMappings", "lightingProfiles", "channelProfiles", "compilerReferences", "buffers"):
        inventories[name] = _stable_inventory(manifest.get(name), name)
    _validate_hashes(manifest.get("hashes"), inventories)
    _validate_compiler_reference(manifest["compilerReferences"], expected_archive_sha256)
    descriptor_by_id = _validate_semantic_buffers(package, manifest["buffers"])
    _validate_geometries(package, manifest["geometries"], descriptor_by_id)
    _validate_relationships(manifest, inventories)
    _validate_material_texture_alpha(manifest, inventories, descriptor_by_id)
    return {
        "bufferCount": len(package.buffers),
        "casterMappingCount": len(manifest["casterMappings"]),
        "channelIds": sorted(inventories["channelProfiles"]),
        "geometryCount": len(manifest["geometries"]),
        "instanceCount": len(manifest["meshInstances"]),
        "materialCount": len(manifest["materials"]),
        "objectCount": len(manifest["objects"]),
        "receiverMappingCount": len(manifest["receiverMappings"]),
        "semanticBufferDigestsVerified": True,
        "textureCount": len(manifest["textures"]),
    }


def accessor_values(package: BsibPackage, accessor: dict[str, Any], decoded: bool = True) -> Iterator[tuple[float | int, ...]]:
    component_type = accessor["componentType"]
    format_code, byte_width, signed = COMPONENTS[component_type]
    data = package.get_buffer_view(accessor["bufferId"])
    item_size = accessor["itemSize"]
    stride = accessor["byteStride"]
    base = accessor["byteOffset"]
    unpacker = struct.Struct("<" + format_code)
    for index in range(accessor["count"]):
        values: list[float | int] = []
        for component in range(item_size):
            value = unpacker.unpack_from(data, base + index * stride + component * byte_width)[0]
            if decoded and accessor["normalized"] and signed is not None:
                bits = byte_width * 8
                value = max(value / float((1 << (bits - 1)) - 1), -1.0) if signed else value / float((1 << bits) - 1)
            values.append(value)
        yield tuple(values)


def _validate_table(table: dict[str, Any], buffer_count: int, unique_count: int, payload_length: int) -> tuple[tuple[BlobDescriptor, ...], list[dict[str, Any]]]:
    if tuple(sorted(table)) != ("blobs", "buffers", "schema") or table.get("schema") != TABLE_SCHEMA:
        fail("bsib_table_shape_invalid", "The BSIB internal buffer table has an unsupported shape or schema.")
    if not isinstance(table.get("buffers"), list) or len(table["buffers"]) != buffer_count or not isinstance(table.get("blobs"), list) or len(table["blobs"]) != unique_count:
        fail("bsib_table_count_mismatch", "The BSIB table counts do not match its header.")
    blobs: list[BlobDescriptor] = []
    next_offset = 0
    previous_hash: str | None = None
    for index, raw in enumerate(table["blobs"]):
        if not isinstance(raw, dict) or tuple(sorted(raw)) != ("byteLength", "offset", "sha256"):
            fail("bsib_blob_shape_invalid", "A BSIB blob descriptor has an invalid shape.", blobIndex=index)
        sha = require_sha256(raw.get("sha256"), f"blob[{index}].sha256")
        length = raw.get("byteLength")
        offset = raw.get("offset")
        if not _is_uint32(length) or not _is_uint32(offset) or offset != next_offset or previous_hash is not None and previous_hash >= sha:
            fail("bsib_blob_layout_invalid", "BSIB blobs are not hash-sorted and exactly contiguous.", blobIndex=index)
        next_offset += length
        if next_offset > payload_length:
            fail("bsib_blob_out_of_bounds", "A BSIB blob exceeds the payload.", blobIndex=index)
        blobs.append(BlobDescriptor(sha, length, offset))
        previous_hash = sha
    if next_offset != payload_length:
        fail("bsib_payload_gap", "BSIB blobs do not exactly cover the payload.", expected=payload_length, actual=next_offset)
    previous_id: str | None = None
    seen: set[str] = set()
    referenced: set[int] = set()
    for index, raw in enumerate(table["buffers"]):
        if not isinstance(raw, dict) or tuple(sorted(raw)) != ("blobIndex", "id"):
            fail("bsib_buffer_shape_invalid", "A BSIB logical-buffer descriptor has an invalid shape.", bufferIndex=index)
        stable_id = _require_stable_id(raw.get("id"), f"buffer[{index}].id")
        blob_index = raw.get("blobIndex")
        if not isinstance(blob_index, int) or isinstance(blob_index, bool) or blob_index < 0 or blob_index >= len(blobs):
            fail("bsib_buffer_blob_invalid", "A logical buffer references an invalid blob.", bufferIndex=index)
        if stable_id in seen or previous_id is not None and canonical_string_key(previous_id) >= canonical_string_key(stable_id):
            fail("bsib_buffers_unsorted", "BSIB logical buffers are not strictly stable-ID sorted.", bufferIndex=index)
        seen.add(stable_id)
        referenced.add(blob_index)
        previous_id = stable_id
    if len(referenced) != len(blobs):
        fail("bsib_unreferenced_blob", "The BSIB table contains an unreferenced blob.")
    return tuple(blobs), table["buffers"]


def _load_canonical_object(data: bytes, label: str, exact_round_trip: bool) -> dict[str, Any]:
    try:
        text = data.decode("utf-8", "strict")
    except UnicodeDecodeError as error:
        fail("bsib_json_utf8_invalid", f"The BSIB {label} is not strict UTF-8.", reason=str(error))

    def ordered_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        previous: str | None = None
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result or previous is not None and canonical_string_key(previous) >= canonical_string_key(key):
                fail("bsib_json_not_canonical", f"The BSIB {label} has duplicate or unsorted object keys.", key=key)
            result[key] = value
            previous = key
        return result

    try:
        value = json.loads(text, object_pairs_hook=ordered_object, parse_constant=lambda token: fail("bsib_json_non_finite", f"The BSIB {label} contains a non-finite number.", token=token))
    except CompilerFailureProxy:
        raise
    except Exception as error:
        if hasattr(error, "code"):
            raise
        fail("bsib_json_invalid", f"The BSIB {label} is not valid JSON.", reason=str(error))
    if not isinstance(value, dict):
        fail("bsib_json_object_required", f"The BSIB {label} must be a JSON object.")
    _validate_compact_json(text, label)
    if exact_round_trip and canonical_json_bytes(value) != data:
        fail("bsib_json_not_canonical", f"The BSIB {label} does not match canonical serialization.")
    return value


class CompilerFailureProxy(Exception):
    pass


def _validate_compact_json(text: str, label: str) -> None:
    index = 0
    length = len(text)
    while index < length:
        character = text[index]
        if character.isspace():
            fail("bsib_json_not_canonical", f"The BSIB {label} contains whitespace outside a string.", characterOffset=index)
        if character == '"':
            end = index + 1
            escaped = False
            while end < length:
                current = text[end]
                if escaped:
                    escaped = False
                elif current == "\\":
                    escaped = True
                elif current == '"':
                    break
                end += 1
            if end >= length:
                fail("bsib_json_invalid", f"The BSIB {label} contains an unterminated string.")
            token = text[index:end + 1]
            try:
                decoded = json.loads(token)
            except json.JSONDecodeError as error:
                fail("bsib_json_invalid", f"The BSIB {label} contains an invalid string.", reason=str(error))
            if json.dumps(decoded, ensure_ascii=False, separators=(",", ":")) != token:
                fail("bsib_json_not_canonical", f"The BSIB {label} contains a noncanonical string escape.", characterOffset=index)
            index = end + 1
            continue
        if character == "-" or character.isdigit():
            match = NUMBER_PATTERN.match(text, index)
            if match is None:
                fail("bsib_json_invalid", f"The BSIB {label} contains an invalid number.", characterOffset=index)
            token = match.group(0)
            if token in ("-0", "-0.0"):
                fail("bsib_json_not_canonical", f"The BSIB {label} contains negative zero.", characterOffset=index)
            index = match.end()
            continue
        index += 1


def _stable_inventory(value: Any, name: str) -> dict[str, dict[str, Any]]:
    if not isinstance(value, list):
        fail("manifest_inventory_missing", "A required manifest inventory is not an array.", inventory=name)
    result: dict[str, dict[str, Any]] = {}
    previous: str | None = None
    for index, record in enumerate(value):
        if not isinstance(record, dict):
            fail("manifest_record_invalid", "A manifest inventory record is not an object.", inventory=name, index=index)
        stable_id = _require_stable_id(record.get("id"), f"{name}[{index}].id")
        if stable_id in result or previous is not None and canonical_string_key(previous) >= canonical_string_key(stable_id):
            fail("manifest_inventory_unsorted", "A manifest inventory is not strictly stable-ID sorted.", inventory=name, id=stable_id)
        result[stable_id] = record
        previous = stable_id
    return result


def _validate_hashes(hashes: Any, inventories: dict[str, dict[str, dict[str, Any]]]) -> None:
    expected = ("channelSources", "channels", "compiler", "geometry", "profiles", "resolvedSource", "schema", "usedMaterials")
    if not isinstance(hashes, dict) or tuple(sorted(hashes)) != expected or hashes.get("schema") != HASH_SET_SCHEMA:
        fail("freshness_hash_shape_invalid", "The resolved-city freshness hash set has an unsupported shape.")
    for field in ("compiler", "geometry", "resolvedSource", "usedMaterials"):
        require_sha256(hashes.get(field), f"hashes.{field}")
    for field, inventory_name in (("profiles", "lightingProfiles"), ("channels", "channelProfiles"), ("channelSources", "channelProfiles")):
        entries = _stable_inventory(hashes.get(field), f"hashes.{field}")
        if set(entries) != set(inventories[inventory_name]):
            fail("freshness_hash_inventory_mismatch", "A named freshness-hash inventory does not match its semantic inventory.", inventory=field)
        for stable_id, record in entries.items():
            if tuple(sorted(record)) != ("id", "sha256"):
                fail("freshness_hash_shape_invalid", "A named freshness digest has an invalid shape.", inventory=field, id=stable_id)
            require_sha256(record.get("sha256"), f"hashes.{field}.{stable_id}")
    if set(inventories["channelProfiles"]) != REQUIRED_CHANNELS:
        fail("channel_profile_inventory_unsupported", "The AI 529 input must declare the four V1 illumination channels.", actual=sorted(inventories["channelProfiles"]))


def _validate_compiler_reference(references: list[dict[str, Any]], expected_archive_sha256: str) -> None:
    expected_archive_sha256 = require_sha256(expected_archive_sha256, "Blender archive hash")
    if expected_archive_sha256 != PINNED_ARCHIVE_SHA256 or len(references) != 1:
        fail("compiler_reference_unsupported", "The package does not target the pinned Blender 5.2.1 compiler archive.")
    reference = references[0]
    if reference.get("id") != PINNED_COMPILER_REFERENCE or reference.get("archive") != PINNED_ARCHIVE or reference.get("archiveSha256") != expected_archive_sha256 or reference.get("backend") != "cycles_cpu" or reference.get("implementationOwner") != "AI_529" or reference.get("schema") != "bus-sim-illumination-compiler-reference-v1" or reference.get("implementationStatus") not in ("pending", "implemented"):
        fail("compiler_reference_unsupported", "The package compiler reference does not match the pinned AI 529 contract.", id=reference.get("id"))
    refs = reference.get("configurationRefs")
    expected_refs = {
        "prompts/AI_529_TOOLS_blender_cycles_headless_bake_compiler.md",
        "specs/graphics/illumination_bake_input.md",
        "specs/graphics/illumination_framework.md",
    }
    if not isinstance(refs, list) or len(refs) != len(set(refs)) or set(refs) != expected_refs:
        fail("compiler_configuration_refs_invalid", "Compiler configuration references are missing, duplicated, or unsupported.")


def _validate_semantic_buffers(package: BsibPackage, descriptors: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    stored = {entry.id: entry for entry in package.buffers}
    semantic = {entry["id"]: entry for entry in descriptors}
    if set(stored) != set(semantic):
        fail("semantic_buffer_inventory_mismatch", "Semantic and stored logical-buffer inventories differ.")
    for stable_id, descriptor in semantic.items():
        entry = stored[stable_id]
        if descriptor.get("byteLength") != entry.byte_length or not isinstance(descriptor.get("byteLength"), int) or descriptor["byteLength"] <= 0:
            fail("semantic_buffer_length_mismatch", "A semantic buffer length does not match stored bytes.", id=stable_id)
        expected = require_sha256(descriptor.get("contentSha256"), f"buffers.{stable_id}.contentSha256")
        kind = descriptor.get("kind")
        if kind == "geometry":
            domain = GEOMETRY_CONTENT_DOMAIN
            if descriptor.get("encoding") != "typed_array_little_endian" or stable_id != f"buffer/{expected}":
                fail("geometry_buffer_descriptor_invalid", "A geometry buffer descriptor is unsupported.", id=stable_id)
        elif kind == "texture_source":
            domain = TEXTURE_CONTENT_DOMAIN
            if descriptor.get("encoding") not in ("raw_source", "typed_array_little_endian"):
                fail("texture_buffer_descriptor_invalid", "A texture source buffer encoding is unsupported.", id=stable_id)
        elif kind == "texture_coverage_channel":
            channel = descriptor.get("coverageChannel")
            if channel not in ("r", "g", "b", "a") or descriptor.get("encoding") != "exact_channel_typed_bytes":
                fail("coverage_buffer_descriptor_invalid", "A coverage buffer descriptor is unsupported.", id=stable_id)
            domain = f"{TEXTURE_COVERAGE_DOMAIN}/{channel}"
        elif kind == "lighting_profile_source":
            domain = PROFILE_ASSET_DOMAIN
            if descriptor.get("encoding") != "raw_source" or stable_id != f"profile-asset/{expected}":
                fail("profile_buffer_descriptor_invalid", "A lighting-profile source descriptor is unsupported.", id=stable_id)
        else:
            fail("semantic_buffer_kind_unsupported", "A semantic buffer kind is unsupported.", id=stable_id, kind=kind)
        view = package.get_buffer_view(stable_id)
        actual = framed_sha256(domain, (view,), len(view))
        view.release()
        if actual != expected:
            fail("semantic_buffer_digest_mismatch", "A semantic buffer content digest does not match stored bytes.", id=stable_id, expected=expected, actual=actual)
    return semantic


def _validate_geometries(package: BsibPackage, geometries: list[dict[str, Any]], descriptors: dict[str, dict[str, Any]]) -> None:
    for geometry in geometries:
        if geometry.get("topology") != "triangles" or geometry.get("winding") != "counter_clockwise":
            fail("geometry_topology_unsupported", "Only counter-clockwise triangle geometry is supported.", id=geometry.get("id"))
        attributes = geometry.get("attributes")
        if not isinstance(attributes, dict) or "position" not in attributes:
            fail("geometry_position_missing", "A geometry has no position accessor.", id=geometry.get("id"))
        validated: dict[str, dict[str, Any]] = {}
        for name, accessor in attributes.items():
            validated[name] = _validate_accessor(package, accessor, descriptors, f"{geometry['id']}.{name}")
        position = validated["position"]
        if position["itemSize"] != 3 or geometry.get("vertexCount") != position["count"]:
            fail("geometry_position_shape_invalid", "A geometry position accessor or vertex count is invalid.", id=geometry.get("id"))
        if "normal" in validated and validated["normal"]["itemSize"] != 3:
            fail("geometry_normal_shape_invalid", "A geometry normal accessor is not a three-component direction.", id=geometry.get("id"))
        index = geometry.get("index")
        reference_count = position["count"]
        if index is not None:
            index = _validate_accessor(package, index, descriptors, f"{geometry['id']}.index")
            if index["componentType"] not in ("u8", "u16", "u32") or index["itemSize"] != 1 or index["normalized"]:
                fail("geometry_index_shape_invalid", "A geometry index accessor is unsupported.", id=geometry.get("id"))
            reference_count = index["count"]
            for values in accessor_values(package, index, False):
                if values[0] >= position["count"]:
                    fail("geometry_index_out_of_range", "A geometry index exceeds its position count.", id=geometry.get("id"), index=values[0])
        if geometry.get("referenceCount") != reference_count:
            fail("geometry_reference_count_mismatch", "A geometry reference count does not reconstruct.", id=geometry.get("id"))
        draw = geometry.get("drawRange")
        if not isinstance(draw, dict) or not _is_nonnegative_int(draw.get("start")) or not _is_nonnegative_int(draw.get("count")) or draw["start"] + draw["count"] > reference_count or draw["start"] % 3 or draw["count"] % 3:
            fail("geometry_draw_range_invalid", "A geometry draw range is invalid.", id=geometry.get("id"))
        groups = geometry.get("groups")
        if not isinstance(groups, list):
            fail("geometry_groups_invalid", "A geometry group inventory is missing.", id=geometry.get("id"))
        for group in groups:
            if not isinstance(group, dict) or not _is_nonnegative_int(group.get("start")) or not _is_nonnegative_int(group.get("count")) or not _is_nonnegative_int(group.get("materialIndex")) or group["start"] + group["count"] > reference_count or group["start"] % 3 or group["count"] % 3:
                fail("geometry_group_invalid", "A geometry material group is invalid.", id=geometry.get("id"))


def _validate_accessor(package: BsibPackage, accessor: Any, descriptors: dict[str, dict[str, Any]], path: str) -> dict[str, Any]:
    if not isinstance(accessor, dict):
        fail("accessor_missing", "A required geometry accessor is missing.", path=path)
    component = accessor.get("componentType")
    info = COMPONENTS.get(component)
    if info is None or ARRAY_COMPONENT_TYPES.get(accessor.get("arrayType")) != component:
        fail("accessor_component_unsupported", "An accessor component or array type is unsupported.", path=path, componentType=component)
    if not isinstance(accessor.get("normalized"), bool) or not isinstance(accessor.get("interleaved"), bool):
        fail("accessor_flags_invalid", "An accessor is missing explicit normalization/interleaving flags.", path=path)
    for field in ("byteOffset", "byteStride", "itemSize", "count"):
        if not _is_nonnegative_int(accessor.get(field)):
            fail("accessor_shape_invalid", "An accessor numeric field is invalid.", path=path, field=field)
    width = info[1]
    if accessor["itemSize"] < 1 or accessor["byteStride"] < accessor["itemSize"] * width or accessor["byteOffset"] % width or accessor["byteStride"] % width or accessor["byteOffset"] + accessor["itemSize"] * width > accessor["byteStride"]:
        fail("accessor_stride_invalid", "An accessor stride or offset is invalid.", path=path)
    if not accessor["interleaved"] and (accessor["byteOffset"] != 0 or accessor["byteStride"] != accessor["itemSize"] * width):
        fail("accessor_stride_invalid", "A noninterleaved accessor is not tightly packed.", path=path)
    buffer_id = accessor.get("bufferId")
    descriptor = descriptors.get(buffer_id)
    if descriptor is None or descriptor.get("kind") != "geometry" or not package.has_buffer(buffer_id):
        fail("accessor_buffer_invalid", "An accessor does not reference a declared geometry buffer.", path=path, bufferId=buffer_id)
    required = accessor["byteOffset"] if accessor["count"] == 0 else accessor["byteOffset"] + (accessor["count"] - 1) * accessor["byteStride"] + accessor["itemSize"] * width
    if required > descriptor["byteLength"] or descriptor["byteLength"] != accessor["count"] * accessor["byteStride"]:
        fail("accessor_range_invalid", "An accessor does not exactly fit its active backing buffer.", path=path, required=required, actual=descriptor["byteLength"])
    for values in accessor_values(package, accessor):
        if any(isinstance(value, float) and not math.isfinite(value) for value in values):
            fail("accessor_non_finite", "An accessor contains a non-finite component.", path=path)
    return accessor


def _validate_relationships(manifest: dict[str, Any], inventories: dict[str, dict[str, dict[str, Any]]]) -> None:
    geometries = inventories["geometries"]
    materials = inventories["materials"]
    roots = inventories["roots"]
    objects = inventories["objects"]
    instances = inventories["meshInstances"]
    chunks = inventories["chunks"]
    for record in manifest["objects"]:
        for field, inventory in (("rootId", roots), ("geometryId", geometries)):
            _require_reference(inventory, record.get(field), f"objects.{record['id']}.{field}")
        if record.get("sourceKind") not in ("Mesh", "InstancedMesh") or record.get("materialGroupingMode") not in ("geometry_groups", "single_material_draw_range"):
            fail("object_semantics_unsupported", "A resolved-city object source or grouping mode is unsupported.", id=record["id"])
        material_ids = record.get("materialIds")
        instance_ids = record.get("instanceIds")
        if not isinstance(material_ids, list) or not isinstance(instance_ids, list):
            fail("object_inventory_invalid", "An object has no material or instance inventory.", id=record["id"])
        for stable_id in material_ids:
            _require_reference(materials, stable_id, f"objects.{record['id']}.materialIds")
        for stable_id in instance_ids:
            _require_reference(instances, stable_id, f"objects.{record['id']}.instanceIds")
    for record in manifest["meshInstances"]:
        for field, inventory in (("objectId", objects), ("rootId", roots), ("geometryId", geometries), ("chunkId", chunks)):
            _require_reference(inventory, record.get(field), f"meshInstances.{record['id']}.{field}")
        three = record.get("matrixThreeWorld")
        blender = record.get("matrixBlenderWorld")
        if not _finite_vector(three, 16) or not _finite_vector(blender, 16):
            fail("instance_transform_invalid", "An instance world transform is not a finite 4x4 matrix.", id=record["id"])
        converted = _convert_three_matrix_to_blender(three)
        if any(abs(converted[index] - blender[index]) > 1e-9 for index in range(16)):
            fail("instance_basis_conversion_mismatch", "An instance Blender matrix does not reconstruct from its Three matrix.", id=record["id"])
        determinant = _determinant3(three)
        if determinant <= 0.0 or abs(determinant - record.get("determinant", float("nan"))) > 1e-9:
            fail("instance_determinant_invalid", "An instance transform is singular, mirrored, or inconsistent.", id=record["id"])
    mapping_specs = (
        ("participantMappings", ("indirect_irradiance", "static_ao_bent_normal")),
        ("receiverMappings", ("direct_receiver", "indirect_irradiance", "static_ao_bent_normal")),
        ("casterMappings", ("direct_receiver", "indirect_irradiance", "static_ao_bent_normal", "static_sun_depth")),
    )
    alpha_inputs = inventories["alphaInputs"]
    for inventory_name, allowed_channels in mapping_specs:
        for mapping in manifest[inventory_name]:
            for field, inventory in (("meshInstanceId", instances), ("objectId", objects), ("geometryId", geometries), ("materialId", materials), ("alphaInputId", alpha_inputs), ("chunkId", chunks)):
                _require_reference(inventory, mapping.get(field), f"{inventory_name}.{mapping['id']}.{field}")
            relevance = mapping.get("channelRelevance")
            if not isinstance(relevance, dict) or any(key not in allowed_channels or not isinstance(value, bool) for key, value in relevance.items()):
                fail("mapping_channel_relevance_invalid", "A mapping declares invalid channel relevance.", id=mapping["id"])
            if not _is_nonnegative_int(mapping.get("start")) or not _is_nonnegative_int(mapping.get("count")) or mapping["start"] % 3 or mapping["count"] % 3:
                fail("mapping_range_invalid", "A mapping range does not address complete triangles.", id=mapping["id"])
            if inventory_name == "casterMappings" and mapping.get("coverageMode") not in ("opaque", "cutout", "forced_opaque"):
                fail("caster_coverage_mode_unsupported", "A selected caster mapping has unsupported coverage semantics.", id=mapping["id"], coverageMode=mapping.get("coverageMode"))


def _validate_material_texture_alpha(manifest: dict[str, Any], inventories: dict[str, dict[str, dict[str, Any]]], descriptors: dict[str, dict[str, Any]]) -> None:
    textures = inventories["textures"]
    sources = {stable_id: record for stable_id, record in textures.items() if record.get("kind") == "source"}
    bindings = {stable_id: record for stable_id, record in textures.items() if record.get("kind") == "binding"}
    if len(sources) + len(bindings) != len(textures):
        fail("texture_kind_unsupported", "A texture record is neither a source nor a binding.")
    for stable_id, source in sources.items():
        if source.get("storage") not in ("encoded_source", "raw_rgba8", "raw_typed_pixels") or source.get("rowOrigin") != "native_source_with_flipY_declared_by_binding" or not _is_positive_int(source.get("width")) or not _is_positive_int(source.get("height")):
            fail("texture_source_semantics_unsupported", "A texture source declares unsupported storage, dimensions, or row semantics.", id=stable_id)
        buffer_id = f"{stable_id}:bytes"
        descriptor = descriptors.get(buffer_id)
        if descriptor is None or descriptor.get("kind") != "texture_source" or descriptor.get("textureSourceId") != stable_id or descriptor.get("byteLength") != source.get("byteLength") or descriptor.get("contentSha256") != source.get("contentSha256"):
            fail("texture_source_buffer_mismatch", "A texture source byte buffer does not match its semantic record.", id=stable_id)
        coverage = source.get("coverageChannels", {})
        if not isinstance(coverage, dict):
            fail("texture_coverage_invalid", "A texture source coverage inventory is invalid.", id=stable_id)
        for channel, record in coverage.items():
            descriptor = descriptors.get(f"{stable_id}:coverage:{channel}")
            if channel not in ("r", "g", "b", "a") or not isinstance(record, dict) or record.get("pixelCount") != source["width"] * source["height"]:
                fail("texture_coverage_buffer_mismatch", "An exact alpha coverage buffer is missing or inconsistent.", id=stable_id, channel=channel)
            if descriptor is not None and (descriptor.get("kind") != "texture_coverage_channel" or descriptor.get("textureSourceId") != stable_id or descriptor.get("coverageChannel") != channel or descriptor.get("byteLength") != record.get("byteLength") or descriptor.get("contentSha256") != record.get("sha256")):
                fail("texture_coverage_buffer_mismatch", "A stored exact alpha coverage buffer is inconsistent.", id=stable_id, channel=channel)
    for stable_id, binding in bindings.items():
        _require_reference(sources, binding.get("sourceId"), f"textures.{stable_id}.sourceId")
        if not _finite_vector(binding.get("matrix"), 9) or not _finite_vector(binding.get("offset"), 2) or not _finite_vector(binding.get("repeat"), 2) or not _finite_vector(binding.get("center"), 2) or not isinstance(binding.get("flipY"), bool):
            fail("texture_binding_semantics_unsupported", "A texture binding has unsupported transform or orientation semantics.", id=stable_id)
    alpha_by_material: dict[str, str] = {}
    for stable_id, alpha in inventories["alphaInputs"].items():
        material_id = alpha.get("materialId")
        _require_reference(inventories["materials"], material_id, f"alphaInputs.{stable_id}.materialId")
        if material_id in alpha_by_material:
            fail("alpha_material_ambiguous", "A material owns more than one alpha-input record.", materialId=material_id)
        alpha_by_material[material_id] = stable_id
        for binding_id in alpha.get("textureBindingIds", []):
            _require_reference(bindings, binding_id, f"alphaInputs.{stable_id}.textureBindingIds")
    allowed_modes = ("opaque", "cutout", "forced_opaque", "blended", "cutout_blended", "procedural_coverage")
    allowed_models = ("MeshBasicMaterial", "MeshLambertMaterial", "MeshPhongMaterial", "MeshPhysicalMaterial", "MeshStandardMaterial")
    for stable_id, material in inventories["materials"].items():
        if material.get("model") not in allowed_models or material.get("alpha", {}).get("mode") not in allowed_modes:
            fail("material_semantics_unsupported", "A material model or alpha mode has no deterministic Blender adapter.", id=stable_id, model=material.get("model"), alphaMode=material.get("alpha", {}).get("mode"))
        alpha_id = material.get("alphaInputId")
        _require_reference(inventories["alphaInputs"], alpha_id, f"materials.{stable_id}.alphaInputId")
        if alpha_by_material.get(stable_id) != alpha_id:
            fail("material_alpha_reference_mismatch", "A material does not resolve to its unique alpha input.", id=stable_id)
        alpha = material.get("alpha", {})
        if alpha.get("mode") == "procedural_coverage":
            adapters = alpha.get("proceduralCoverage")
            known = {"asphalt-edge-wear-v1": 1.0, "sidewalk-edge-dirt-strip-v1": 0.45}
            if not isinstance(adapters, list) or not adapters:
                fail("procedural_coverage_adapter_missing", "A procedural-coverage material has no declared adapter.", id=stable_id)
            for adapter in adapters:
                adapter_id = adapter.get("adapterId") if isinstance(adapter, dict) else None
                if adapter_id not in known or not isinstance(adapter.get("semantics"), dict):
                    fail("procedural_coverage_adapter_unsupported", "A procedural-coverage material uses an unknown adapter.", id=stable_id, adapterId=adapter_id)
                if float(alpha.get("opacity", -1.0)) != known[adapter_id] or float(alpha.get("alphaTest", -1.0)) != 0.0 or alpha.get("inputs") != []:
                    fail("procedural_coverage_semantics_invalid", "A known procedural coverage adapter has unsupported opacity, threshold, or texture inputs.", id=stable_id, adapterId=adapter_id)
        support = material.get("channelSupport")
        if not isinstance(support, dict) or any(channel not in REQUIRED_CHANNELS or not isinstance(record, dict) or not isinstance(record.get("supported"), bool) for channel, record in support.items()):
            fail("material_channel_support_invalid", "A material has invalid channel-support semantics.", id=stable_id)
        for binding_id in material.get("textureBindings", {}).values():
            _require_reference(bindings, binding_id, f"materials.{stable_id}.textureBindings")
        if alpha.get("mode") != "opaque":
            for alpha_input in alpha.get("inputs", []):
                binding = bindings.get(alpha_input.get("bindingId"))
                source = sources.get(binding.get("sourceId")) if binding else None
                channel = alpha_input.get("channel")
                coverage = source.get("coverageChannels", {}).get(channel) if source else None
                buffer_id = f"{source['id']}:coverage:{channel}" if source else None
                descriptor = descriptors.get(buffer_id) if buffer_id else None
                if alpha_input.get("operation") != "multiply" or channel not in ("r", "g", "b", "a") or not coverage or not descriptor or descriptor.get("kind") != "texture_coverage_channel" or descriptor.get("textureSourceId") != source["id"] or descriptor.get("coverageChannel") != channel or descriptor.get("byteLength") != coverage.get("byteLength") or descriptor.get("contentSha256") != coverage.get("sha256"):
                    fail("material_coverage_buffer_missing", "A non-opaque material input lacks exact declared coverage bytes.", materialId=stable_id, bindingId=alpha_input.get("bindingId"), channel=channel)


def _convert_three_matrix_to_blender(values: list[float]) -> list[float]:
    basis = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0]
    inverse = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0]
    return _matrix_multiply(_matrix_multiply(basis, values), inverse)


def _matrix_multiply(left: list[float], right: list[float]) -> list[float]:
    result = [0.0] * 16
    for column in range(4):
        for row in range(4):
            result[column * 4 + row] = sum(left[k * 4 + row] * right[column * 4 + k] for k in range(4))
    return result


def _determinant3(matrix: list[float]) -> float:
    a00, a01, a02 = matrix[0], matrix[4], matrix[8]
    a10, a11, a12 = matrix[1], matrix[5], matrix[9]
    a20, a21, a22 = matrix[2], matrix[6], matrix[10]
    return a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20)


def _require_reference(inventory: dict[str, Any], stable_id: Any, path: str) -> None:
    if stable_id not in inventory:
        fail("manifest_reference_missing", "A manifest foreign key does not resolve.", path=path, id=stable_id)


def _require_stable_id(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or value.strip() != value or any(ord(character) <= 0x1F or ord(character) == 0x7F for character in value):
        fail("stable_id_invalid", "A stable ID is empty, padded, or contains a control character.", label=label, actual=value)
    return value


def _is_uint32(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 0xFFFFFFFF


def _is_nonnegative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _finite_vector(value: Any, length: int) -> bool:
    return isinstance(value, list) and len(value) == length and all(isinstance(component, (int, float)) and not isinstance(component, bool) and math.isfinite(component) for component in value)
