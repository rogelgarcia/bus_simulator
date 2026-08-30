"""Stable-ID-sorted resolved-city reconstruction from a verified BSIB package."""

from __future__ import annotations

import json
import math
import struct
from collections import defaultdict
from pathlib import Path
from typing import Any

from bsib import BsibPackage, accessor_values
from canonical import atomic_write_bytes
from errors import fail


CHANNEL_MAPPING_ROLES = {
    "all": ("participantMappings", "receiverMappings", "casterMappings"),
    "direct_receiver": ("receiverMappings", "casterMappings"),
    "indirect_irradiance": ("participantMappings", "receiverMappings", "casterMappings"),
    "static_ao_bent_normal": ("participantMappings", "receiverMappings"),
    "static_sun_depth": ("casterMappings",),
}
THREE_REPEAT = 1000
THREE_CLAMP = 1001
THREE_MIRRORED_REPEAT = 1002
NEAREST_FILTERS = frozenset((1003, 1004, 1005))


def reconstruct_resolved_city(package: BsibPackage, output_root: Path, channel_id: str) -> dict[str, Any]:
    import bpy
    from mathutils import Matrix

    if channel_id not in CHANNEL_MAPPING_ROLES:
        fail("source_channel_unsupported", "Resolved-city reconstruction requested an unknown channel.", channelId=channel_id)
    manifest = package.manifest
    object_by_id = {record["id"]: record for record in manifest["objects"]}
    instance_by_id = {record["id"]: record for record in manifest["meshInstances"]}
    geometry_by_id = {record["id"]: record for record in manifest["geometries"]}
    material_by_id = {record["id"]: record for record in manifest["materials"]}
    alpha_by_id = {record["id"]: record for record in manifest["alphaInputs"]}
    texture_by_id = {record["id"]: record for record in manifest["textures"]}
    mappings_by_instance: dict[str, list[dict[str, Any]]] = defaultdict(list)
    selected_mapping_ids: set[str] = set()
    for inventory_name in CHANNEL_MAPPING_ROLES[channel_id]:
        for mapping in manifest[inventory_name]:
            relevant_channels = sorted(key for key, relevant in mapping.get("channelRelevance", {}).items() if relevant and (channel_id == "all" or key == channel_id))
            if not relevant_channels:
                continue
            material = material_by_id[mapping["materialId"]]
            if inventory_name != "casterMappings":
                for relevant_channel in relevant_channels:
                    support = material.get("channelSupport", {}).get(relevant_channel)
                    if not isinstance(support, dict) or support.get("supported") is not True:
                        fail("selected_material_semantics_unsupported", "A selected receiver or participant references material semantics excluded by its channel contract.", channelId=relevant_channel, mappingId=mapping["id"], materialId=material["id"], reasons=support.get("reasons") if isinstance(support, dict) else None)
            mappings_by_instance[mapping["meshInstanceId"]].append({**mapping, "mappingInventory": inventory_name})
            selected_mapping_ids.add(mapping["id"])
    if not mappings_by_instance:
        fail("source_channel_empty", "The selected source channel contains no reconstructable mappings.", channelId=channel_id)
    collection = bpy.data.collections.new(_diagnostic_name("AI529_Source", channel_id))
    collection["bus_sim_channel_id"] = channel_id
    collection["bus_sim_source_hash"] = manifest["hashes"]["resolvedSource"]
    bpy.context.scene.collection.children.link(collection)
    adapter = _MaterialAdapter(package, output_root, material_by_id, alpha_by_id, texture_by_id)
    mesh_cache: dict[tuple[str, tuple[tuple[int, int, int], ...]], Any] = {}
    object_count = 0
    normal_check_count = 0
    uv_check_count = 0
    for instance_id in sorted(mappings_by_instance):
        instance = instance_by_id.get(instance_id)
        if instance is None:
            fail("source_instance_missing", "A selected mapping references a missing mesh instance.", id=instance_id)
        source_object = object_by_id[instance["objectId"]]
        geometry = geometry_by_id[instance["geometryId"]]
        mappings = _deduplicate_mappings(mappings_by_instance[instance_id])
        ranges = tuple(sorted({(mapping["start"], mapping["count"], mapping["materialIndex"]) for mapping in mappings}))
        mesh_key = (geometry["id"], ranges)
        mesh = mesh_cache.get(mesh_key)
        if mesh is None:
            mesh, checks = _build_mesh(package, geometry, ranges)
            mesh_cache[mesh_key] = mesh
            normal_check_count += checks["normalChecks"]
            uv_check_count += checks["uvChecks"]
        blender_object = bpy.data.objects.new(_diagnostic_name("SRC", instance_id), mesh)
        blender_object["bus_sim_stable_id"] = instance_id
        blender_object["bus_sim_object_id"] = instance["objectId"]
        blender_object["bus_sim_geometry_id"] = instance["geometryId"]
        blender_object["bus_sim_root_id"] = instance["rootId"]
        blender_object["bus_sim_chunk_id"] = instance["chunkId"]
        blender_object["bus_sim_category"] = instance["category"]
        blender_object["bus_sim_selected_mapping_ids"] = json.dumps(sorted(mapping["id"] for mapping in mappings), separators=(",", ":"))
        blender_object.matrix_world = _matrix_from_column_major(Matrix, instance["matrixBlenderWorld"])
        collection.objects.link(blender_object)
        slot_modes = _coverage_modes_by_slot(mappings, material_by_id)
        selected_material_indices = {mapping["materialIndex"] for mapping in mappings}
        required_slots = max((mapping["materialIndex"] for mapping in mappings), default=0) + 1
        for material_index in range(required_slots):
            material_id = _material_id_for_slot(source_object, material_index)
            if material_id is None:
                if material_index in selected_material_indices:
                    fail("source_material_slot_missing", "A selected geometry range has no owning material slot.", objectId=source_object["id"], materialIndex=material_index)
                if len(mesh.materials) <= material_index:
                    # Preserve a declared sparse source material array without
                    # inventing a material or renumbering later source slots.
                    mesh.materials.append(None)
                continue
            mode = slot_modes.get(material_index, "opaque")
            material = adapter.material(material_id, mode, geometry)
            if len(mesh.materials) <= material_index:
                mesh.materials.append(material)
            blender_object.material_slots[material_index].link = "OBJECT"
            blender_object.material_slots[material_index].material = material
        object_count += 1
    return {
        "channelId": channel_id,
        "collection": collection.name,
        "completeSelectedChannel": True,
        "geometryDatablockCount": len(mesh_cache),
        "instanceObjectCount": object_count,
        "normalConversionChecks": normal_check_count,
        "selectedMappingCount": len(selected_mapping_ids),
        "stableIdOrdering": "canonical_ascending",
        "textureSourceCount": len(adapter.image_cache),
        "uvIdentityChecks": uv_check_count,
    }


def _build_mesh(package: BsibPackage, geometry: dict[str, Any], ranges: tuple[tuple[int, int, int], ...]) -> tuple[Any, dict[str, int]]:
    import bpy

    positions_three = list(accessor_values(package, geometry["attributes"]["position"]))
    positions = [(float(value[0]), -float(value[2]), float(value[1])) for value in positions_three]
    if geometry.get("index") is None:
        indices = list(range(len(positions)))
    else:
        indices = [int(value[0]) for value in accessor_values(package, geometry["index"], False)]
    faces: list[tuple[int, int, int]] = []
    face_material_indices: list[int] = []
    seen_offsets: set[int] = set()
    for start, count, material_index in ranges:
        for offset in range(start, start + count, 3):
            if offset in seen_offsets:
                continue
            seen_offsets.add(offset)
            triangle = tuple(indices[offset + component] for component in range(3))
            if len(set(triangle)) != 3 or any(index < 0 or index >= len(positions) for index in triangle):
                fail("source_triangle_invalid", "A selected source triangle is degenerate or out of range.", geometryId=geometry["id"], referenceOffset=offset)
            faces.append(triangle)
            face_material_indices.append(material_index)
    if not faces:
        fail("source_geometry_empty", "A selected source geometry contains no active triangles.", geometryId=geometry["id"])
    mesh = bpy.data.meshes.new(_diagnostic_name("GEO", geometry["id"] + ":" + repr(ranges)))
    mesh.from_pydata(positions, [], faces)
    mesh.update(calc_edges=True)
    mesh["bus_sim_stable_geometry_id"] = geometry["id"]
    mesh["bus_sim_coordinate_conversion"] = "local_three_xyz_to_blender_x_negz_y"
    mesh["bus_sim_uv_origin"] = "lower_left_no_flip"
    for polygon, material_index in zip(mesh.polygons, face_material_indices):
        polygon.material_index = material_index
    normal_checks = 0
    normal_accessor = geometry["attributes"].get("normal")
    if normal_accessor is not None:
        normals_three = list(accessor_values(package, normal_accessor))
        used_vertex_indices = {vertex_index for face in faces for vertex_index in face}
        normals = []
        unused_zero_normals = 0
        for vertex_index, value in enumerate(normals_three):
            converted = (float(value[0]), -float(value[2]), float(value[1]))
            length_squared = sum(component * component for component in converted)
            if length_squared <= 1e-30 and vertex_index not in used_vertex_indices:
                # Blender accepts a zero custom normal as its explicit fallback.
                # Preserve it only for source vertices outside every selected face.
                normals.append((0.0, 0.0, 0.0))
                unused_zero_normals += 1
            else:
                normals.append(_normalized(converted, geometry["id"]))
        if len(normals) != len(positions):
            fail("source_normal_count_mismatch", "Source normal and position counts differ.", geometryId=geometry["id"])
        try:
            mesh.normals_split_custom_set_from_vertices(normals)
        except Exception as error:
            fail("source_custom_normals_failed", "Blender rejected deterministic source custom normals.", geometryId=geometry["id"], reason=str(error))
        mesh["bus_sim_unused_zero_normal_count"] = unused_zero_normals
        normal_checks = min(3, len(normals))
    uv_checks = 0
    for semantic_name in sorted(name for name in geometry["attributes"] if name == "uv" or name.startswith("uv") and name[2:].isdigit()):
        accessor = geometry["attributes"][semantic_name]
        if accessor["itemSize"] != 2:
            fail("source_uv_shape_invalid", "A selected source UV accessor is not two-component.", geometryId=geometry["id"], attribute=semantic_name)
        uv_values = list(accessor_values(package, accessor))
        if len(uv_values) != len(positions):
            fail("source_uv_count_mismatch", "Source UV and position counts differ.", geometryId=geometry["id"], attribute=semantic_name)
        layer = mesh.uv_layers.new(name=semantic_name)
        for loop in mesh.loops:
            source = uv_values[loop.vertex_index]
            layer.data[loop.index].uv = (float(source[0]), float(source[1]))
        uv_checks += min(3, len(uv_values))
    _copy_custom_attributes(package, geometry, mesh)
    return mesh, {"normalChecks": normal_checks, "uvChecks": uv_checks}


def _copy_custom_attributes(package: BsibPackage, geometry: dict[str, Any], mesh: Any) -> None:
    reserved = {"position", "normal", "tangent", "color", "uv"}
    for semantic_name in sorted(geometry["attributes"]):
        if semantic_name in reserved or semantic_name.startswith("uv"):
            continue
        accessor = geometry["attributes"][semantic_name]
        values = list(accessor_values(package, accessor))
        item_size = accessor["itemSize"]
        if len(values) != len(mesh.vertices):
            fail("source_custom_attribute_count_mismatch", "A custom source attribute is not vertex-domain compatible.", geometryId=geometry["id"], attribute=semantic_name)
        if item_size == 1:
            attribute = mesh.attributes.new(name=semantic_name, type="FLOAT", domain="POINT")
            for index, value in enumerate(values):
                attribute.data[index].value = float(value[0])
        elif item_size == 3:
            attribute = mesh.attributes.new(name=semantic_name, type="FLOAT_VECTOR", domain="POINT")
            for index, value in enumerate(values):
                attribute.data[index].vector = tuple(float(component) for component in value)
        elif item_size == 4:
            attribute = mesh.attributes.new(name=semantic_name, type="FLOAT_COLOR", domain="POINT")
            for index, value in enumerate(values):
                attribute.data[index].color = tuple(float(component) for component in value)
        else:
            mesh[f"bus_sim_attribute_descriptor:{semantic_name}"] = json.dumps(accessor, sort_keys=True, separators=(",", ":"))


class _MaterialAdapter:
    def __init__(self, package: BsibPackage, output_root: Path, materials: dict[str, dict[str, Any]], alpha_inputs: dict[str, dict[str, Any]], textures: dict[str, dict[str, Any]]) -> None:
        self.package = package
        self.output_root = output_root
        self.materials = materials
        self.alpha_inputs = alpha_inputs
        self.sources = {stable_id: record for stable_id, record in textures.items() if record["kind"] == "source"}
        self.bindings = {stable_id: record for stable_id, record in textures.items() if record["kind"] == "binding"}
        self.material_cache: dict[tuple[str, str], Any] = {}
        self.image_cache: dict[tuple[str, str], Any] = {}

    def material(self, material_id: str, coverage_mode: str, geometry: dict[str, Any]) -> Any:
        import bpy

        key = (material_id, coverage_mode)
        cached = self.material_cache.get(key)
        if cached is not None:
            return cached
        record = self.materials[material_id]
        if record.get("transmission", 0) != 0 and coverage_mode != "forced_opaque":
            fail("source_transmission_unsupported", "Selected source transport cannot approximate transmission.", materialId=material_id)
        material = bpy.data.materials.new(_diagnostic_name("MAT", material_id + ":" + coverage_mode))
        material.use_nodes = True
        material["bus_sim_stable_material_id"] = material_id
        material["bus_sim_coverage_mode"] = coverage_mode
        material["bus_sim_alpha_input_id"] = record["alphaInputId"]
        material["bus_sim_semantics"] = json.dumps(record, sort_keys=True, separators=(",", ":"))
        material.diffuse_color = (*tuple(float(value) for value in record.get("colorLinearSrgb", (1.0, 1.0, 1.0))), float(record.get("alpha", {}).get("opacity", 1.0)))
        material.use_backface_culling = record.get("side") != 2
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        principled = nodes.new("ShaderNodeBsdfPrincipled")
        _set_socket(principled, ("Base Color",), (*tuple(float(value) for value in record.get("colorLinearSrgb", (1.0, 1.0, 1.0))), 1.0))
        _set_socket(principled, ("Roughness",), float(record.get("roughness", 1.0)))
        _set_socket(principled, ("Metallic",), float(record.get("metalness", 0.0)))
        _set_socket(principled, ("IOR",), float(record.get("ior", 1.5)))
        _set_socket(principled, ("Emission Color", "Emission"), (*tuple(float(value) for value in record.get("emissiveLinearSrgb", (0.0, 0.0, 0.0))), 1.0))
        _set_socket(principled, ("Emission Strength",), float(record.get("emissiveIntensity", 1.0)))
        base_map_id = record.get("textureBindings", {}).get("map")
        if base_map_id:
            color_node = self._texture_node(material, base_map_id, "color", geometry)
            links.new(color_node.outputs["Color"], principled.inputs["Base Color"])
        alpha = self.alpha_inputs[record["alphaInputId"]]
        if coverage_mode == "cutout" or coverage_mode not in ("opaque", "forced_opaque") and alpha.get("alpha", {}).get("mode") == "cutout":
            keep = self._coverage_keep_node(material, alpha, geometry)
            transparent = nodes.new("ShaderNodeBsdfTransparent")
            mix = nodes.new("ShaderNodeMixShader")
            links.new(keep, mix.inputs[0])
            links.new(transparent.outputs[0], mix.inputs[1])
            links.new(principled.outputs[0], mix.inputs[2])
            links.new(mix.outputs[0], output.inputs["Surface"])
            material.surface_render_method = "DITHERED"
        elif coverage_mode in ("opaque", "forced_opaque"):
            links.new(principled.outputs[0], output.inputs["Surface"])
            material.surface_render_method = "DITHERED"
        else:
            fail("source_alpha_mode_unsupported", "Selected source material has no deterministic coverage adapter.", materialId=material_id, coverageMode=coverage_mode)
        self.material_cache[key] = material
        return material

    def _coverage_keep_node(self, material: Any, alpha_record: dict[str, Any], geometry: dict[str, Any]) -> Any:
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        alpha = alpha_record["alpha"]
        coverage_output: Any = None
        opacity = nodes.new("ShaderNodeValue")
        opacity.outputs[0].default_value = float(alpha["opacity"])
        coverage_output = opacity.outputs[0]
        if alpha_record.get("vertexColors"):
            if "color" not in geometry["attributes"] or geometry["attributes"]["color"]["itemSize"] != 4:
                fail("source_vertex_alpha_missing", "A cutout material requires a four-component vertex-color accessor.", materialId=alpha_record["materialId"], geometryId=geometry["id"])
            vertex = nodes.new("ShaderNodeVertexColor")
            vertex.layer_name = "color"
            coverage_output = _multiply(nodes, links, coverage_output, vertex.outputs["Alpha"])
        for entry in alpha.get("inputs", []):
            if entry.get("operation") != "multiply" or entry.get("channel") not in ("r", "g", "b", "a"):
                fail("source_alpha_expression_unsupported", "A cutout alpha expression contains an unsupported operation or channel.", materialId=alpha_record["materialId"])
            texture = self._texture_node(material, entry["bindingId"], "coverage:" + entry["channel"], geometry)
            coverage_output = _multiply(nodes, links, coverage_output, texture.outputs["Color"])
        less = nodes.new("ShaderNodeMath")
        less.operation = "LESS_THAN"
        links.new(coverage_output, less.inputs[0])
        less.inputs[1].default_value = float(alpha["alphaTest"])
        keep = nodes.new("ShaderNodeMath")
        keep.operation = "SUBTRACT"
        keep.inputs[0].default_value = 1.0
        links.new(less.outputs[0], keep.inputs[1])
        return keep.outputs[0]

    def _texture_node(self, material: Any, binding_id: str, role: str, geometry: dict[str, Any]) -> Any:
        binding = self.bindings[binding_id]
        source = self.sources[binding["sourceId"]]
        channel = role.split(":", 1)[1] if role.startswith("coverage:") else "source"
        image = self._image(source, channel)
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        texture.interpolation = "Closest" if binding.get("magFilter") in NEAREST_FILTERS or binding.get("minFilter") in NEAREST_FILTERS else "Linear"
        texture.extension = "EXTEND"
        uv_name = "uv" if binding.get("channel", 0) == 0 else f"uv{binding['channel']}"
        if uv_name not in geometry["attributes"]:
            fail("source_texture_uv_missing", "A texture binding references an unavailable UV set.", bindingId=binding_id, uvSet=uv_name, geometryId=geometry["id"])
        uv = nodes.new("ShaderNodeUVMap")
        uv.uv_map = uv_name
        transformed = _texture_transform(nodes, links, uv.outputs[0], binding, raw_native_rows=channel != "source" or source["storage"] != "encoded_source")
        links.new(transformed, texture.inputs["Vector"])
        return texture

    def _image(self, source: dict[str, Any], channel: str) -> Any:
        import bpy

        key = (source["id"], channel)
        cached = self.image_cache.get(key)
        if cached is not None:
            return cached
        if channel != "source":
            buffer_id = f"{source['id']}:coverage:{channel}"
            data = self.package.get_buffer_bytes(buffer_id)
            image = _raw_image(bpy, source, data, 1, _diagnostic_name("COV", buffer_id))
        elif source["storage"] == "encoded_source":
            data = self.package.get_buffer_bytes(f"{source['id']}:bytes")
            suffix = _mime_suffix(source.get("mimeType"))
            temporary = self.output_root / ".source_cache" / (_diagnostic_name("IMG", source["id"]) + suffix)
            atomic_write_bytes(temporary, data)
            try:
                image = bpy.data.images.load(str(temporary), check_existing=False)
                image.pack()
            except Exception as error:
                fail("source_texture_decode_failed", "Blender could not decode an embedded source texture.", textureSourceId=source["id"], reason=str(error))
            finally:
                if temporary.exists():
                    temporary.unlink()
        else:
            data = self.package.get_buffer_bytes(f"{source['id']}:bytes")
            width = source["width"]
            height = source["height"]
            component_width = _component_width(source.get("componentType"))
            components = len(data) // (width * height * component_width)
            if components < 1 or components > 4 or width * height * components * component_width != len(data):
                fail("source_texture_shape_invalid", "Raw texture bytes do not match declared dimensions and component type.", textureSourceId=source["id"])
            image = _raw_image(bpy, source, data, components, _diagnostic_name("IMG", source["id"]))
        image.name = _diagnostic_name("IMG", source["id"] + ":" + channel)
        image.colorspace_settings.name = "Non-Color" if channel != "source" else ("sRGB" if any(binding.get("colorSpace") == "srgb" for binding in self.bindings.values() if binding["sourceId"] == source["id"]) else "Non-Color")
        image["bus_sim_texture_source_id"] = source["id"]
        image["bus_sim_channel"] = channel
        self.image_cache[key] = image
        return image


def _raw_image(bpy: Any, source: dict[str, Any], data: bytes, components: int, name: str) -> Any:
    width = source["width"]
    height = source["height"]
    image = bpy.data.images.new(name, width=width, height=height, alpha=True, float_buffer=True, is_data=True)
    component_type = source.get("componentType")
    values = _decode_texture_components(data, component_type)
    rgba = [0.0] * (width * height * 4)
    for pixel in range(width * height):
        source_values = values[pixel * components:(pixel + 1) * components]
        if components == 1:
            color = (source_values[0], source_values[0], source_values[0], 1.0)
        elif components == 2:
            color = (source_values[0], source_values[1], 0.0, 1.0)
        elif components == 3:
            color = (source_values[0], source_values[1], source_values[2], 1.0)
        else:
            color = tuple(source_values)
        rgba[pixel * 4:(pixel + 1) * 4] = color
    image.pixels.foreach_set(rgba)
    image.update()
    return image


def _decode_texture_components(data: bytes, component_type: str) -> list[float]:
    formats = {
        "uint8": ("B", 1, 255.0), "u8": ("B", 1, 255.0),
        "int8": ("b", 1, 127.0), "i8": ("b", 1, 127.0),
        "uint16": ("H", 2, 65535.0), "u16": ("H", 2, 65535.0),
        "int16": ("h", 2, 32767.0), "i16": ("h", 2, 32767.0),
        "float32": ("f", 4, None), "f32": ("f", 4, None),
    }
    descriptor = formats.get(component_type)
    if descriptor is None or len(data) % descriptor[1]:
        fail("source_texture_component_unsupported", "A raw texture component representation is unsupported.", componentType=component_type)
    format_code, width, divisor = descriptor
    unpacker = struct.Struct("<" + format_code)
    result: list[float] = []
    for offset in range(0, len(data), width):
        value = float(unpacker.unpack_from(data, offset)[0])
        if divisor is not None:
            value = max(value / divisor, -1.0) if format_code.islower() else value / divisor
        if not math.isfinite(value):
            fail("source_texture_non_finite", "A raw texture contains a non-finite value.", componentOffset=offset)
        result.append(value)
    return result


def _texture_transform(nodes: Any, links: Any, uv_output: Any, binding: dict[str, Any], raw_native_rows: bool) -> Any:
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv_output, separate.inputs[0])
    matrix = binding["matrix"]
    u = _linear2(nodes, links, separate.outputs["X"], separate.outputs["Y"], matrix[0], matrix[3], matrix[6])
    v = _linear2(nodes, links, separate.outputs["X"], separate.outputs["Y"], matrix[1], matrix[4], matrix[7])
    if raw_native_rows and binding.get("flipY"):
        invert = nodes.new("ShaderNodeMath")
        invert.operation = "SUBTRACT"
        invert.inputs[0].default_value = 1.0
        links.new(v, invert.inputs[1])
        v = invert.outputs[0]
    u = _wrap(nodes, links, u, binding.get("wrapS"))
    v = _wrap(nodes, links, v, binding.get("wrapT"))
    combine = nodes.new("ShaderNodeCombineXYZ")
    links.new(u, combine.inputs["X"])
    links.new(v, combine.inputs["Y"])
    combine.inputs["Z"].default_value = 0.0
    return combine.outputs[0]


def _linear2(nodes: Any, links: Any, left: Any, right: Any, left_scale: float, right_scale: float, offset: float) -> Any:
    left_node = nodes.new("ShaderNodeMath")
    left_node.operation = "MULTIPLY"
    links.new(left, left_node.inputs[0])
    left_node.inputs[1].default_value = float(left_scale)
    right_node = nodes.new("ShaderNodeMath")
    right_node.operation = "MULTIPLY"
    links.new(right, right_node.inputs[0])
    right_node.inputs[1].default_value = float(right_scale)
    add = nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    links.new(left_node.outputs[0], add.inputs[0])
    links.new(right_node.outputs[0], add.inputs[1])
    if offset == 0:
        return add.outputs[0]
    add_offset = nodes.new("ShaderNodeMath")
    add_offset.operation = "ADD"
    links.new(add.outputs[0], add_offset.inputs[0])
    add_offset.inputs[1].default_value = float(offset)
    return add_offset.outputs[0]


def _wrap(nodes: Any, links: Any, value: Any, mode: int) -> Any:
    if mode == THREE_CLAMP:
        lower = nodes.new("ShaderNodeMath")
        lower.operation = "MAXIMUM"
        links.new(value, lower.inputs[0])
        lower.inputs[1].default_value = 0.0
        upper = nodes.new("ShaderNodeMath")
        upper.operation = "MINIMUM"
        links.new(lower.outputs[0], upper.inputs[0])
        upper.inputs[1].default_value = 1.0
        return upper.outputs[0]
    node = nodes.new("ShaderNodeMath")
    if mode == THREE_REPEAT:
        node.operation = "FRACT"
        links.new(value, node.inputs[0])
    elif mode == THREE_MIRRORED_REPEAT:
        node.operation = "PINGPONG"
        links.new(value, node.inputs[0])
        node.inputs[1].default_value = 1.0
    else:
        fail("source_texture_wrap_unsupported", "A texture binding uses an unsupported wrap enum.", wrap=mode)
    return node.outputs[0]


def _multiply(nodes: Any, links: Any, left: Any, right: Any) -> Any:
    node = nodes.new("ShaderNodeMath")
    node.operation = "MULTIPLY"
    links.new(left, node.inputs[0])
    links.new(right, node.inputs[1])
    return node.outputs[0]


def _set_socket(node: Any, names: tuple[str, ...], value: Any) -> None:
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return
    fail("material_socket_missing", "The pinned Blender Principled BSDF lacks a required socket.", names=list(names))


def _deduplicate_mappings(mappings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_range: dict[tuple[int, int, int, str], dict[str, Any]] = {}
    priority = {"opaque": 0, "forced_opaque": 1, "cutout": 2}
    for mapping in sorted(mappings, key=lambda record: record["id"]):
        key = (mapping["start"], mapping["count"], mapping["materialIndex"], mapping["materialId"])
        existing = by_range.get(key)
        if existing is None or priority.get(mapping.get("coverageMode", "opaque"), 0) > priority.get(existing.get("coverageMode", "opaque"), 0):
            by_range[key] = mapping
    return sorted(by_range.values(), key=lambda record: (record["start"], record["count"], record["materialIndex"], record["id"]))


def _coverage_modes_by_slot(mappings: list[dict[str, Any]], materials: dict[str, dict[str, Any]]) -> dict[int, str]:
    priority = {"opaque": 0, "forced_opaque": 1, "cutout": 2}
    result: dict[int, str] = {}
    for mapping in mappings:
        mode = mapping.get("coverageMode")
        if mode is None:
            alpha_mode = materials[mapping["materialId"]]["alpha"]["mode"]
            mode = "cutout" if alpha_mode == "cutout" else "opaque"
        if mode not in priority:
            fail("selected_coverage_mode_unsupported", "A selected mapping coverage mode cannot be reconstructed.", mappingId=mapping["id"], coverageMode=mode)
        index = mapping["materialIndex"]
        if priority[mode] > priority.get(result.get(index, "opaque"), 0):
            result[index] = mode
        elif index not in result:
            result[index] = mode
    return result


def _material_id_for_slot(source_object: dict[str, Any], material_index: int) -> str | None:
    for slot in source_object["materialSlots"]:
        if slot["index"] == material_index:
            return slot["id"]
    return None


def _matrix_from_column_major(Matrix: Any, values: list[float]) -> Any:
    return Matrix(tuple(tuple(float(values[column * 4 + row]) for column in range(4)) for row in range(4)))


def _normalized(value: tuple[float, float, float], geometry_id: str) -> tuple[float, float, float]:
    length = math.sqrt(sum(component * component for component in value))
    if length <= 1e-15:
        fail("source_zero_normal", "A source normal has zero length.", geometryId=geometry_id)
    return tuple(component / length for component in value)


def _diagnostic_name(prefix: str, stable_id: str) -> str:
    import hashlib

    digest = hashlib.sha256(stable_id.encode("utf-8")).hexdigest()[:12]
    tail = "".join(character if character.isalnum() or character in "._-" else "_" for character in stable_id)[-36:]
    return f"{prefix}_{tail}_{digest}"[:63]


def _mime_suffix(mime_type: str | None) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/vnd.radiance": ".hdr",
        "image/x-hdr": ".hdr",
    }.get(mime_type, ".bin")


def _component_width(component_type: str) -> int:
    widths = {"uint8": 1, "u8": 1, "int8": 1, "i8": 1, "uint16": 2, "u16": 2, "int16": 2, "i16": 2, "float32": 4, "f32": 4}
    width = widths.get(component_type)
    if width is None:
        fail("source_texture_component_unsupported", "A raw texture component type is unsupported.", componentType=component_type)
    return width
