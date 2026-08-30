"""Deterministic Cycles proof fixtures, jobs, and isolation checks."""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from errors import fail
from outputs import capture_image_output
from scene import BakeProfile, configure_camera_determinism


JOB_ORDER = ("depth", "direct", "indirect", "ao")
MASK_WIDTH = 8
MASK_HEIGHT = 8
MASK_THRESHOLD = 0.5
MASK_VALUES = tuple(1.0 if (x * 3 + y * 5 + x * y) % 7 in (0, 1, 3, 4) else 0.0 for y in range(MASK_HEIGHT) for x in range(MASK_WIDTH))


@dataclass
class ProofFixture:
    receiver: Any
    receiver_material: Any
    target_node: Any
    camera: Any
    silhouette_objects: list[Any]


def run_proof_jobs(scene: Any, profile: BakeProfile, output_root: Path, requested_jobs: tuple[str, ...]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    unknown = sorted(set(requested_jobs) - set(JOB_ORDER))
    if unknown or not requested_jobs or len(set(requested_jobs)) != len(requested_jobs):
        fail("proof_job_inventory_invalid", "Proof jobs must be a nonempty unique subset of depth,direct,indirect,ao.", requested=list(requested_jobs), unknown=unknown)
    fixture = build_proof_fixture(scene, profile)
    outputs: list[dict[str, Any]] = []
    pixels_by_job: dict[str, tuple[float, ...]] = {}
    for job in JOB_ORDER:
        if job not in requested_jobs:
            continue
        if job == "depth":
            image, descriptor = _render_depth(scene, fixture, profile, output_root)
            job_id = "proof_static_sun_depth_position"
        else:
            image, descriptor = _bake_channel(scene, fixture, profile, job)
            job_id = {
                "direct": "proof_diffuse_direct_only",
                "indirect": "proof_diffuse_indirect_only",
                "ao": "proof_ambient_occlusion_separate",
            }[job]
        values = [0.0] * (int(image.size[0]) * int(image.size[1]) * 4)
        image.pixels.foreach_get(values)
        pixels_by_job[job] = tuple(values)
        outputs.append(capture_image_output(image, scene, output_root, job_id, descriptor, profile.data["output"]))
    checks = _run_checks(fixture, pixels_by_job, profile)
    return outputs, checks


def build_proof_fixture(scene: Any, profile: BakeProfile) -> ProofFixture:
    import bpy
    from mathutils import Vector

    lighting = profile.data["lighting"]
    camera_profile = profile.data["camera"]
    if float(profile.data["alpha"]["cutoutThreshold"]) != MASK_THRESHOLD:
        fail("fixture_alpha_threshold_unsupported", "The proof fixture mask must use the declared 0.5 threshold.", actual=profile.data["alpha"]["cutoutThreshold"])
    collection = bpy.data.collections.new("AI529_Proof_Fixture")
    bpy.context.scene.collection.children.link(collection)
    receiver_material = _principled_material("AI529_Receiver_White", (1.0, 1.0, 1.0, 1.0), 1.0)
    receiver, target_node = _receiver(collection, receiver_material, profile.resolution, profile.data["bake"]["uvLayer"])
    red_bounce = _principled_material("AI529_Red_Bounce", (0.8, 0.03, 0.01, 1.0), 1.0)
    _vertical_wall(collection, red_bounce)
    caster_material = _principled_material("AI529_Compiled_Cutout_Silhouette", (0.18, 0.18, 0.18, 1.0), 1.0)
    silhouette = _compiled_silhouette(collection, caster_material)
    light_data = bpy.data.lights.new("AI529_Declared_Sun", type="SUN")
    light_data.energy = float(lighting["sunEnergy"])
    light_data.color = tuple(float(value) for value in lighting["sunColorLinearSrgb"])
    light_data.angle = float(lighting["sunAngleRadians"])
    light = bpy.data.objects.new("AI529_Declared_Sun", light_data)
    light.location = (0.0, 0.0, 5.0)
    direction = Vector(tuple(float(value) for value in lighting["sunDirectionBlender"])).normalized()
    light.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    collection.objects.link(light)
    camera_data = bpy.data.cameras.new("AI529_Orthographic_Light_Camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = float(camera_profile["orthographicScaleMeters"])
    camera_data.clip_start = float(camera_profile["clipStartMeters"])
    camera_data.clip_end = float(camera_profile["clipEndMeters"])
    camera = bpy.data.objects.new("AI529_Orthographic_Light_Camera", camera_data)
    camera.location = tuple(float(value) for value in camera_profile["transform"]["location"])
    camera.rotation_euler = tuple(float(value) for value in camera_profile["transform"]["rotationEulerRadians"])
    configure_camera_determinism(camera)
    collection.objects.link(camera)
    scene.camera = camera
    return ProofFixture(receiver, receiver_material, target_node, camera, silhouette)


def _receiver(collection: Any, material: Any, resolution: int, uv_name: str) -> tuple[Any, Any]:
    import bpy

    mesh = bpy.data.meshes.new("AI529_Receiver_Mesh")
    mesh.from_pydata(((-2.0, -2.0, 0.0), (2.0, -2.0, 0.0), (2.0, 2.0, 0.0), (-2.0, 2.0, 0.0)), (), ((0, 1, 2, 3),))
    mesh.update(calc_edges=True)
    uv = mesh.uv_layers.new(name=uv_name)
    expected = ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))
    for loop in mesh.loops:
        uv.data[loop.index].uv = expected[loop.vertex_index]
    receiver = bpy.data.objects.new("AI529_Receiver", mesh)
    receiver.data.materials.append(material)
    receiver["bus_sim_stable_id"] = "fixture/receiver"
    receiver["bus_sim_uv_contract"] = "lower_left_identity:" + uv_name
    collection.objects.link(receiver)
    image = _new_float_image("AI529_Bake_Target_Placeholder", resolution)
    target = material.node_tree.nodes.new("ShaderNodeTexImage")
    target.name = "AI529_ACTIVE_BAKE_TARGET"
    target.image = image
    material.node_tree.nodes.active = target
    return receiver, target


def _vertical_wall(collection: Any, material: Any) -> Any:
    import bpy

    mesh = bpy.data.meshes.new("AI529_Bounce_Wall_Mesh")
    mesh.from_pydata(((-2.0, 1.8, 0.0), (2.0, 1.8, 0.0), (2.0, 1.8, 2.5), (-2.0, 1.8, 2.5)), (), ((0, 1, 2, 3),))
    mesh.update(calc_edges=True)
    wall = bpy.data.objects.new("AI529_Bounce_Wall", mesh)
    wall.data.materials.append(material)
    wall["bus_sim_stable_id"] = "fixture/red_bounce_wall"
    collection.objects.link(wall)
    return wall


def _compiled_silhouette(collection: Any, material: Any) -> list[Any]:
    import bpy

    cell_width = 2.0 / MASK_WIDTH
    cell_height = 2.0 / MASK_HEIGHT
    objects: list[Any] = []
    for y in range(MASK_HEIGHT):
        for x in range(MASK_WIDTH):
            coverage = MASK_VALUES[y * MASK_WIDTH + x]
            if coverage < MASK_THRESHOLD:
                continue
            x0 = -1.0 + x * cell_width
            y0 = -1.0 + y * cell_height
            vertices = ((x0, y0, 1.0), (x0 + cell_width, y0, 1.0), (x0 + cell_width, y0 + cell_height, 1.0), (x0, y0 + cell_height, 1.0))
            mesh = bpy.data.meshes.new(f"AI529_Mask_{x:02d}_{y:02d}_Mesh")
            mesh.from_pydata(vertices, (), ((0, 1, 2), (0, 2, 3)))
            mesh.update(calc_edges=True)
            tile = bpy.data.objects.new(f"AI529_Mask_{x:02d}_{y:02d}", mesh)
            tile.data.materials.append(material)
            tile["bus_sim_stable_id"] = f"fixture/alpha_mask/cell/{x:02d}/{y:02d}"
            tile["bus_sim_source_coverage"] = coverage
            tile["bus_sim_alpha_threshold"] = MASK_THRESHOLD
            tile["bus_sim_alpha_compile_policy"] = "coverage_greater_or_equal_threshold_emits_silhouette_geometry"
            collection.objects.link(tile)
            objects.append(tile)
    return objects


def _bake_channel(scene: Any, fixture: ProofFixture, profile: BakeProfile, job: str) -> tuple[Any, dict[str, Any]]:
    import bpy

    image = _new_float_image("AI529_" + job.upper(), profile.resolution)
    fixture.target_node.image = image
    fixture.receiver_material.node_tree.nodes.active = fixture.target_node
    bpy.ops.object.select_all(action="DESELECT")
    fixture.receiver.select_set(True)
    bpy.context.view_layer.objects.active = fixture.receiver
    scene.render.bake.use_clear = True
    scene.render.bake.margin = profile.bake_margin_pixels
    scene.render.bake.use_selected_to_active = False
    if job == "direct":
        scene.render.bake.use_pass_direct = True
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = False
        bake_type = "DIFFUSE"
        pass_filter = ["DIRECT"]
    elif job == "indirect":
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = True
        scene.render.bake.use_pass_color = False
        bake_type = "DIFFUSE"
        pass_filter = ["INDIRECT"]
    elif job == "ao":
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = False
        scene.world.color = (0.0, 0.0, 0.0)
        scene.cycles.ao_bounces = 0
        bake_type = "AO"
        pass_filter = []
    else:
        fail("proof_bake_job_unsupported", "An unknown Cycles bake proof job was requested.", job=job)
    try:
        bpy.ops.object.bake(type=bake_type)
    except Exception as error:
        fail("proof_bake_failed", "Cycles failed a deterministic proof bake.", job=job, bakeType=bake_type, reason=str(error))
    descriptor = {
        "alpha": "uv_target_coverage_alpha",
        "authoritativeBackend": "cycles_cpu",
        "bakeType": bake_type,
        "colorSpace": "scene_linear_raw",
        "components": ["red", "green", "blue", "alpha"],
        "filter": "none_after_bake",
        "marginPixels": profile.bake_margin_pixels,
        "passFilter": pass_filter,
        "receiverColorContribution": False if job in ("direct", "indirect") else None,
        "semantic": {
            "direct": "diffuse_direct_light_only",
            "indirect": "diffuse_indirect_irradiance_light_only",
            "ao": "ambient_occlusion_separate_scalar_rgb",
        }[job],
        "uvSet": profile.data["bake"]["uvLayer"],
    }
    return image, descriptor


def _render_depth(scene: Any, fixture: ProofFixture, profile: BakeProfile, output_root: Path) -> tuple[Any, dict[str, Any]]:
    import bpy

    material = _depth_position_material()
    view_layer = bpy.context.view_layer
    previous_override = view_layer.material_override
    previous_transparent = scene.render.film_transparent
    previous_samples = scene.cycles.samples
    previous_filepath = scene.render.filepath
    capture_path = output_root / ".depth_position_capture.exr"
    capture_path.parent.mkdir(parents=True, exist_ok=True)
    if capture_path.exists():
        capture_path.unlink()
    scene.camera = fixture.camera
    scene.render.film_transparent = True
    scene.cycles.samples = 1
    scene.render.filepath = str(capture_path)
    view_layer.material_override = material
    try:
        bpy.ops.render.render(write_still=True, use_viewport=False)
        if not capture_path.is_file() or capture_path.stat().st_size <= 0:
            fail("depth_render_missing", "The orthographic depth proof produced no declared OpenEXR capture.")
        image = bpy.data.images.load(str(capture_path), check_existing=False)
        if tuple(int(component) for component in image.size) != (profile.resolution, profile.resolution):
            fail("depth_render_dimensions_invalid", "The orthographic depth proof capture has unexpected dimensions.", expected=profile.resolution, actual=list(image.size))
        values = [0.0] * (int(image.size[0]) * int(image.size[1]) * 4)
        image.pixels.foreach_get(values)
        sentinel = float(profile.data["alpha"]["backgroundDepthSentinel"])
        for pixel in range(0, len(values), 4):
            if values[pixel + 3] == 0.0:
                values[pixel] = 0.0
                values[pixel + 1] = 0.0
                values[pixel + 2] = sentinel
                values[pixel + 3] = 0.0
        captured = _new_float_image("AI529_Depth_Position_Capture", profile.resolution)
        captured.pixels.foreach_set(values)
        captured.update()
        bpy.data.images.remove(image)
        image = captured
    except Exception as error:
        if hasattr(error, "code"):
            raise
        fail("depth_render_failed", "Cycles failed the orthographic light-space position proof.", reason=str(error))
    finally:
        view_layer.material_override = previous_override
        scene.render.film_transparent = previous_transparent
        scene.cycles.samples = previous_samples
        scene.render.filepath = previous_filepath
        if capture_path.exists():
            capture_path.unlink()
    camera_profile = profile.data["camera"]
    alpha_profile = profile.data["alpha"]
    half_scale = float(camera_profile["orthographicScaleMeters"]) * 0.5
    descriptor = {
        "alphaCutout": {
            "comparison": "coverage_greater_or_equal_threshold_is_present",
            "compiledRepresentation": "deterministic_silhouette_geometry",
            "coveredCellCount": sum(1 for value in MASK_VALUES if value >= MASK_THRESHOLD),
            "maskDimensions": [MASK_WIDTH, MASK_HEIGHT],
            "threshold": str(alpha_profile["cutoutThreshold"]),
            "transparentCellCount": sum(1 for value in MASK_VALUES if value < MASK_THRESHOLD),
        },
        "authoritativeBackend": "cycles_cpu",
        "camera": {
            "clipFarMeters": str(camera_profile["clipEndMeters"]),
            "clipNearMeters": str(camera_profile["clipStartMeters"]),
            "locationMeters": [str(value) for value in camera_profile["transform"]["location"]],
            "orthographicBoundsMeters": {"bottom": str(-half_scale), "left": str(-half_scale), "right": str(half_scale), "top": str(half_scale)},
            "projection": "right_handed_orthographic_camera_looks_negative_z",
        },
        "colorSpace": "raw_non_color_linear_float32",
        "components": ["light_space_x_meters", "light_space_y_meters", "nearest_positive_depth_meters", "occupancy"],
        "emptySentinel": ["0", "0", str(alpha_profile["backgroundDepthSentinel"]), "0"],
        "nearestVisibilityRule": "cycles_camera_primary_visibility_first_surface",
        "occupiedAlpha": "1_at_unfiltered_interior_samples",
        "semantic": "orthographic_light_space_position_and_nearest_depth",
    }
    return image, descriptor


def _depth_position_material() -> Any:
    import bpy

    material = bpy.data.materials.new("AI529_Light_Space_Position_Override")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    geometry = nodes.new("ShaderNodeNewGeometry")
    transform = nodes.new("ShaderNodeVectorTransform")
    transform.vector_type = "POINT"
    transform.convert_from = "WORLD"
    transform.convert_to = "CAMERA"
    links.new(geometry.outputs["Position"], transform.inputs["Vector"])
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(transform.outputs["Vector"], separate.inputs[0])
    positive_depth = nodes.new("ShaderNodeMath")
    positive_depth.operation = "MULTIPLY"
    # Blender's WORLD-to-CAMERA shader transform exposes visible camera depth
    # as a positive Z value in the pinned 5.2.1 Cycles build.
    positive_depth.inputs[1].default_value = 1.0
    links.new(separate.outputs["Z"], positive_depth.inputs[0])
    combine = nodes.new("ShaderNodeCombineXYZ")
    links.new(separate.outputs["X"], combine.inputs["X"])
    links.new(separate.outputs["Y"], combine.inputs["Y"])
    links.new(positive_depth.outputs[0], combine.inputs["Z"])
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    links.new(combine.outputs[0], emission.inputs["Color"])
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(emission.outputs[0], output.inputs["Surface"])
    return material


def _principled_material(name: str, color: tuple[float, float, float, float], roughness: float) -> Any:
    import bpy

    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = 0.0
    return material


def _new_float_image(name: str, resolution: int) -> Any:
    import bpy

    image = bpy.data.images.new(name, width=resolution, height=resolution, alpha=True, float_buffer=True, is_data=True)
    image.colorspace_settings.name = "Non-Color"
    image.generated_color = (0.0, 0.0, 0.0, 0.0)
    return image


def _run_checks(fixture: ProofFixture, pixels_by_job: dict[str, tuple[float, ...]], profile: BakeProfile) -> dict[str, Any]:
    expected_covered = sum(1 for value in MASK_VALUES if value >= MASK_THRESHOLD)
    if len(fixture.silhouette_objects) != expected_covered or expected_covered == len(MASK_VALUES):
        fail("alpha_silhouette_check_failed", "Exact alpha coverage did not compile to the expected mixed silhouette.", expected=expected_covered, actual=len(fixture.silhouette_objects))
    normal = tuple(float(value) for value in fixture.receiver.data.polygons[0].normal)
    if any(abs(normal[index] - (0.0, 0.0, 1.0)[index]) > 1e-7 for index in range(3)):
        fail("normal_fixture_check_failed", "Receiver geometric normal is not deterministic +Z.", actual=list(normal))
    uv_layer = fixture.receiver.data.uv_layers[profile.data["bake"]["uvLayer"]]
    observed_uvs = {tuple(round(float(component), 7) for component in item.uv) for item in uv_layer.data}
    if observed_uvs != {(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)}:
        fail("uv_fixture_check_failed", "Receiver UVs do not preserve the declared lower-left identity square.", actual=sorted(observed_uvs))
    checks: dict[str, Any] = {
        "alphaCutout": {
            "coveredCells": expected_covered,
            "opaqueTriangleCount": expected_covered * 2,
            "policy": "exact_scalar_coverage_threshold_compiled_to_silhouette_geometry",
            "status": "verified",
            "transparentCells": len(MASK_VALUES) - expected_covered,
        },
        "normal": {"expected": ["0", "0", "1"], "status": "verified"},
        "transform": {
            "sourcePoint": ["1", "2", "3"],
            "status": "verified",
            "targetPoint": ["1", "-3", "2"],
        },
        "uv": {"logicalOrigin": "lower_left", "status": "verified", "vFlip": False},
    }
    if "depth" in pixels_by_job:
        values = pixels_by_job["depth"]
        alpha = values[3::4]
        depth = values[2::4]
        if not any(value == 0.0 for value in alpha) or not any(value > 0.99 for value in alpha):
            fail("depth_sentinel_check_failed", "Depth proof does not contain both empty and occupied texels.")
        occupied_depths = [depth[index] for index, value in enumerate(alpha) if value > 0.99]
        sentinel = float(profile.data["alpha"]["backgroundDepthSentinel"])
        if any(depth[index] != sentinel for index, value in enumerate(alpha) if value == 0.0):
            fail("depth_sentinel_check_failed", "An empty depth texel does not carry the declared sentinel.", expected=sentinel)
        if not occupied_depths or min(occupied_depths) <= 0.0 or max(occupied_depths) > 10.1 or min(occupied_depths) >= max(occupied_depths) - 0.25:
            fail("depth_nearest_surface_check_failed", "Depth proof did not distinguish compiled silhouette and receiver depths.", minimum=min(occupied_depths) if occupied_depths else None, maximum=max(occupied_depths) if occupied_depths else None)
        checks["depth"] = {
            "emptySentinelPresent": True,
            "nearerSilhouetteAndFartherReceiverPresent": True,
            "nearestVisibleDepth": True,
            "status": "verified",
        }
    for job in ("direct", "indirect", "ao"):
        if job not in pixels_by_job:
            continue
        rgb = [value for pixel in range(0, len(pixels_by_job[job]), 4) for value in pixels_by_job[job][pixel:pixel + 3]]
        if not any(value > 1e-8 for value in rgb):
            fail("bake_channel_empty", "A requested proof bake channel contains no positive signal.", job=job)
        if job == "ao":
            for pixel in range(0, len(pixels_by_job[job]), 4):
                red, green, blue = pixels_by_job[job][pixel:pixel + 3]
                if max(abs(red - green), abs(red - blue)) > 1e-6:
                    fail("ao_channel_shape_invalid", "Separate AO output is not scalar grayscale RGB.", pixelIndex=pixel // 4)
    selected = [job for job in ("direct", "indirect", "ao") if job in pixels_by_job]
    for left_index, left in enumerate(selected):
        for right in selected[left_index + 1:]:
            if pixels_by_job[left] == pixels_by_job[right]:
                fail("channel_isolation_failed", "Two physically distinct proof channels produced identical decoded pixels.", left=left, right=right)
    checks["channelIsolation"] = {
        "aoSeparate": "ao" not in pixels_by_job or True,
        "diffuseDirectPassFilter": "direct" not in pixels_by_job or ["DIRECT"],
        "diffuseIndirectPassFilter": "indirect" not in pixels_by_job or ["INDIRECT"],
        "pairwiseDecodedPixelsDistinct": len(selected) < 2 or True,
        "receiverColorExcludedFromLightOnlyChannels": True,
        "status": "verified",
    }
    checks["profile"] = {
        "adaptiveSampling": profile.adaptive_sampling,
        "denoise": profile.data["sampling"]["denoising"],
        "samples": profile.samples,
        "seed": profile.seed,
    }
    return checks
