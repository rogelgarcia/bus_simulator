"""Bakes the deterministic natural maintained-grass V2 surface and atlas families in Blender."""

import bpy
from collections import deque
import hashlib
import json
import math
import os
import random
import sys

import numpy as np
from mathutils import Vector


PROFILE = {
    "schema": "bus-simulator.low-cut-grass-profile",
    "version": 2,
    "profileId": "grass.natural.maintained.v2",
    "seed": "natural-maintained-turf-v2",
    "heightMeters": {"min": 0.025, "max": 0.075},
    "widthMeters": {"min": 0.0022, "max": 0.0058},
    "style": "cohesive-natural-variable",
}
BAKE_SEED = "grass-material-bake-v2"
SOURCE_URL = "https://ambientcg.com/view?id=Grass004"
FAR_TILE_METERS = 1.4
ATLAS_COLUMNS = 4
ATLAS_ROWS = 2
ATLAS_VARIANTS = ATLAS_COLUMNS * ATLAS_ROWS
ATLAS_CELL_PIXELS = 256
ATLAS_GUTTER_PIXELS = 16
ATLAS_ALPHA_CUTOFF = 0.35
ATLAS_RUNTIME_MIP_MAX = 7
ATLAS_RGB_CONDITIONING_POLICY = "cell_complete_nearest_opaque"
ATLAS_SAMPLING_POLICY = "opaque_channels_plus_separate_coverage"
ATLAS_MAX_HORIZONTAL_RUN_FRACTION = 0.48
ATLAS_MAX_TOP_DOWN_RUN_FRACTION = 0.30
ATLAS_MAX_TOP_DOWN_COVERAGE = 0.70

ATLAS_FAMILIES = {
    "midCluster": {
        "prefix": "mid_cluster",
        "label": "Mid cluster strip",
        "physicalWidthMeters": 1.15,
        "physicalHeightMeters": 0.055,
        "bladeHeightMeters": (0.025, 0.048),
        "bladeWidthMeters": (0.0024, 0.0058),
        "bladeCount": (250, 290),
        "thatchHeightMeters": (0.008, 0.013),
        "thatchBladeCount": (96, 124),
        "coverageClusterCount": (15, 19),
        "coverageClusterFillFraction": (0.46, 0.62),
        "depthMeters": 0.035,
    },
    "accentClump": {
        "prefix": "accent_clump",
        "label": "Localized accent clump",
        "physicalWidthMeters": 0.24,
        "physicalHeightMeters": 0.075,
        "bladeHeightMeters": (0.032, 0.064),
        "bladeWidthMeters": (0.0022, 0.0052),
        "bladeCount": (58, 72),
        "thatchHeightMeters": (0.009, 0.016),
        "thatchBladeCount": (30, 42),
        "coverageClusterCount": (6, 9),
        "coverageClusterFillFraction": (0.44, 0.60),
        "depthMeters": 0.026,
    },
}


def _read_image(source_dir, filename, color_space):
    image = bpy.data.images.load(os.path.join(source_dir, filename), check_existing=False)
    image.colorspace_settings.name = color_space
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return image, pixels.reshape((height, width, 4))


def _save_image(output_dir, filename, pixels, color_space):
    height, width, channels = pixels.shape
    if channels != 4:
        raise RuntimeError(f"{filename} must have four channels.")
    image = bpy.data.images.new(
        f"AI358_{filename}",
        width=width,
        height=height,
        alpha=True,
        float_buffer=False,
    )
    image.colorspace_settings.name = color_space
    image.file_format = "PNG"
    image.filepath_raw = os.path.join(output_dir, filename)
    image.pixels.foreach_set(np.clip(pixels, 0.0, 1.0).astype(np.float32).ravel())
    image.save()
    bpy.data.images.remove(image)
    return os.path.join(output_dir, filename)


def _bake_far_maps(source_dir, output_dir):
    source_images = []
    base_image, base = _read_image(source_dir, "basecolor.png", "sRGB")
    normal_image, normal = _read_image(source_dir, "normal_gl.png", "Non-Color")
    ao_image, ao = _read_image(source_dir, "ao.png", "Non-Color")
    rough_image, rough = _read_image(source_dir, "roughness.png", "Non-Color")
    height_image, height = _read_image(source_dir, "displacement.png", "Non-Color")
    source_images.extend([base_image, normal_image, ao_image, rough_image, height_image])

    image_height, image_width, _ = base.shape
    yy, xx = np.mgrid[0:image_height, 0:image_width].astype(np.float32)
    ux = xx / max(1, image_width - 1)
    uy = yy / max(1, image_height - 1)
    periodic = (
        np.sin(ux * math.tau + 0.37) * np.sin(uy * math.tau - 0.83)
        + 0.38 * np.sin(ux * math.tau * 2.0 + uy * math.tau + 1.31)
        + 0.18 * np.cos(uy * math.tau * 3.0 - ux * math.tau + 0.49)
    ) / 1.56
    periodic = periodic[..., None]

    rgb = base[..., :3]
    luma = rgb[..., 0:1] * 0.2126 + rgb[..., 1:2] * 0.7152 + rgb[..., 2:3] * 0.0722
    rgb = luma + (rgb - luma) * 0.64
    rgb *= 0.875 * (1.0 + periodic * 0.045)
    warm = np.array([0.20, 0.145, 0.050], dtype=np.float32).reshape((1, 1, 3))
    dry_mix = 0.045 + np.maximum(periodic, 0.0) * 0.020
    rgb = rgb * (1.0 - dry_mix) + warm * dry_mix
    far_base = np.concatenate(
        [np.clip(rgb, 0.0, 1.0), np.ones((image_height, image_width, 1), dtype=np.float32)],
        axis=2,
    )

    rough_scalar = rough[..., 0:1]
    far_rough_scalar = np.clip(0.76 + 0.22 * np.sqrt(np.clip(rough_scalar, 0.0, 1.0)), 0.0, 1.0)
    far_rough = np.concatenate([far_rough_scalar] * 3 + [np.ones_like(far_rough_scalar)], axis=2)
    ao_scalar = np.clip(0.74 + ao[..., 0:1] * 0.26, 0.0, 1.0)
    far_ao = np.concatenate([ao_scalar] * 3 + [np.ones_like(ao_scalar)], axis=2)
    height_scalar = np.clip(height[..., 0:1], 0.0, 1.0)
    far_height = np.concatenate([height_scalar] * 3 + [np.ones_like(height_scalar)], axis=2)
    coverage_scalar = np.clip(0.82 + 0.18 * ao_scalar, 0.76, 1.0)
    far_coverage = np.concatenate([coverage_scalar] * 3 + [np.ones_like(coverage_scalar)], axis=2)

    files = [
        _save_image(output_dir, "far_basecolor.png", far_base, "sRGB"),
        _save_image(output_dir, "far_normal_gl.png", normal, "Non-Color"),
        _save_image(output_dir, "far_ao.png", far_ao, "Non-Color"),
        _save_image(output_dir, "far_roughness.png", far_rough, "Non-Color"),
        _save_image(output_dir, "far_height.png", far_height, "Non-Color"),
        _save_image(output_dir, "far_coverage.png", far_coverage, "Non-Color"),
    ]
    palette = _derive_palette(far_base[..., :3])
    for image in source_images:
        bpy.data.images.remove(image)
    return files, palette


def _derive_palette(far_rgb):
    flat = np.asarray(far_rgb, dtype=np.float32).reshape((-1, 3))
    luma = flat[:, 0] * 0.2126 + flat[:, 1] * 0.7152 + flat[:, 2] * 0.0722
    p18, p38, p62, p82 = np.percentile(luma, [18, 38, 62, 82])

    def median_between(low, high):
        selected = flat[(luma >= low) & (luma <= high)]
        if not len(selected):
            selected = flat
        return np.median(selected, axis=0).astype(np.float32)

    base = median_between(p18, p38)
    body = median_between(p38, p62)
    tip = median_between(p62, p82)
    dryness_score = flat[:, 0] - flat[:, 1] * 0.62 - flat[:, 2] * 0.10
    dry_threshold = np.percentile(dryness_score, 82)
    dry_pixels = flat[(dryness_score >= dry_threshold) & (luma >= p18) & (luma <= p82)]
    dry = np.median(dry_pixels if len(dry_pixels) else flat, axis=0).astype(np.float32)
    return {
        "base": _srgb_array_to_linear(base),
        "body": _srgb_array_to_linear(body),
        "tip": _srgb_array_to_linear(tip),
        "dry": _srgb_array_to_linear(dry),
    }


def _srgb_array_to_linear(color):
    values = np.clip(np.asarray(color, dtype=np.float32), 0.0, 1.0)
    return np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4).astype(np.float32)


def _linear_to_srgb(value):
    value = max(0.0, min(1.0, float(value)))
    return value * 12.92 if value <= 0.0031308 else 1.055 * (value ** (1.0 / 2.4)) - 0.055


def _palette_manifest(palette):
    def encode(color):
        srgb = [_linear_to_srgb(component) for component in color]
        return {
            "linear": [round(float(component), 6) for component in color],
            "srgb8": [int(round(component * 255)) for component in srgb],
        }

    return {key: encode(value) for key, value in palette.items()}


def _create_albedo_bake_material():
    material = bpy.data.materials.new("AI358_AlbedoBakeOnly")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    vertex_color = nodes.new("ShaderNodeVertexColor")
    vertex_color.layer_name = "Col"
    emission.inputs["Strength"].default_value = 1.0
    material.node_tree.links.new(vertex_color.outputs["Color"], emission.inputs["Color"])
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def _set_corner_colors(mesh, vertices, base, body, tip, dry, dry_mix, brightness):
    color_attribute = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            t = max(0.0, min(1.0, vertices[vertex_index][2]))
            if t < 0.55:
                color = base * (1.0 - t / 0.55) + body * (t / 0.55)
            else:
                upper = (t - 0.55) / 0.45
                color = body * (1.0 - upper) + tip * upper
            color = color * (1.0 - dry_mix) + dry * dry_mix
            color *= brightness
            color_attribute.data[loop_index].color = (*[float(component) for component in np.clip(color, 0.0, 1.0)], 1.0)


def _add_blade(collection, material, name, rng, palette, x, depth, root_z, height, width, bend, yaw, dry_mix):
    segments = 5
    vertices = []
    faces = []
    for segment in range(segments + 1):
        t = segment / segments
        z = height * t
        y = bend * (t ** 1.65)
        if t <= 0.20:
            # A narrow insertion point avoids the ruler-straight alpha baseline
            # produced by a row of square-bottomed cards.
            width_factor = 0.16 + 0.84 * (t / 0.20)
        else:
            # Converge to a true point instead of baking a flat rectangular tip.
            width_factor = max(0.0, 1.0 - ((t - 0.20) / 0.80) ** 1.12)
        half_width = width * width_factor * 0.5
        vertices.extend([(-half_width, y, z), (half_width, y, z)])
        if segment < segments:
            base_index = segment * 2
            faces.append((base_index, base_index + 1, base_index + 3, base_index + 2))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    normalized_vertices = [(vx, vy, vz / max(height, 1e-6)) for vx, vy, vz in vertices]
    _set_corner_colors(
        mesh,
        normalized_vertices,
        palette["base"],
        palette["body"],
        palette["tip"],
        palette["dry"],
        dry_mix,
        0.90 + rng.random() * 0.17,
    )
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = (x, depth, root_z)
    obj.rotation_euler[2] = yaw
    obj.data.materials.append(material)
    return obj


def _add_thatch_clusters(
    collection,
    material,
    family_key,
    family,
    variant,
    rng,
    palette,
    x_clusters,
    root_z,
    layout_offset,
):
    """Add short staggered blades with explicit gaps; never add a spanning quad."""
    count_low, count_high = family["thatchBladeCount"]
    blade_count = count_low + int(rng.random() * (count_high - count_low + 1))

    min_height, max_height = family["thatchHeightMeters"]
    width_low, width_high = family["bladeWidthMeters"]
    depth_extent = family["depthMeters"]
    root_jitter = min(0.0032, family["physicalHeightMeters"] * 0.055)
    for blade_index in range(blade_count):
        cluster_index = (blade_index * 5 + int(rng.random() * len(x_clusters))) % len(x_clusters)
        center, half_width = x_clusters[cluster_index]
        x = center + (rng.random() - 0.5) * half_width * 2.0
        height = min_height + rng.random() * (max_height - min_height)
        width = width_low * 0.78 + rng.random() * (width_high * 1.06 - width_low * 0.78)
        bend = (rng.random() - 0.5) * min(0.007, height * 0.36)
        depth = (rng.random() - 0.5) * depth_extent
        blade_root = root_z + (rng.random() ** 1.7) * root_jitter
        yaw = (rng.random() - 0.5) * math.radians(92)
        dry_mix = 0.07 + rng.random() * 0.15
        obj = _add_blade(
            collection,
            material,
            f"AI358_{family_key}_{variant}_ThatchBlade_{blade_index}",
            rng,
            palette,
            x,
            depth,
            blade_root,
            height,
            width,
            bend,
            yaw,
            dry_mix,
        )
        obj.location.x += layout_offset[0]
        obj.location.y += layout_offset[1]


def _build_x_clusters(rng, family, usable_half_width):
    count_low, count_high = family["coverageClusterCount"]
    cluster_count = count_low + int(rng.random() * (count_high - count_low + 1))
    fill_low, fill_high = family["coverageClusterFillFraction"]
    span = usable_half_width * 2.0
    cluster_step = span / cluster_count
    clusters = []
    for cluster_index in range(cluster_count):
        fill = fill_low + rng.random() * (fill_high - fill_low)
        center = -usable_half_width + (cluster_index + 0.5) * cluster_step
        # Jitter remains bounded by the unoccupied part of the step so adjacent
        # clusters cannot accidentally close every top-down gap.
        center += (rng.random() - 0.5) * cluster_step * (1.0 - fill) * 0.34
        clusters.append((center, cluster_step * fill * 0.5))
    return clusters


def _clear_collection_objects(collection):
    for obj in list(collection.objects):
        data = obj.data if obj.type == "MESH" else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0:
            bpy.data.meshes.remove(data)


def _build_atlas_variant(collection, material, family_key, family, variant, palette, layout_offset=(0.0, 0.0)):
    rng = random.Random(f"{BAKE_SEED}:{family_key}:{variant}")
    width = family["physicalWidthMeters"]
    height = family["physicalHeightMeters"]
    gutter_fraction = ATLAS_GUTTER_PIXELS / ATLAS_CELL_PIXELS
    usable_half_width = width * (0.5 - gutter_fraction * 1.08)
    root_z = height * gutter_fraction * 1.02
    max_tip_z = height * (1.0 - gutter_fraction * 1.04)
    blade_min, blade_max = family["bladeHeightMeters"]
    blade_max = min(blade_max, max_tip_z - root_z)
    blade_min = min(blade_min, blade_max)
    count_low, count_high = family["bladeCount"]
    blade_count = count_low + int(rng.random() * (count_high - count_low + 1))
    width_low, width_high = family["bladeWidthMeters"]
    depth_extent = family["depthMeters"]
    x_clusters = _build_x_clusters(rng, family, usable_half_width)

    _add_thatch_clusters(
        collection,
        material,
        family_key,
        family,
        variant,
        rng,
        palette,
        x_clusters,
        root_z,
        layout_offset,
    )

    for blade_index in range(blade_count):
        cluster_index = (blade_index * 7 + int(rng.random() * len(x_clusters))) % len(x_clusters)
        center, cluster_half_width = x_clusters[cluster_index]
        x = center + (rng.random() - 0.5) * cluster_half_width * 2.0
        cell_t = (x + usable_half_width) / max(usable_half_width * 2.0, 1e-6)
        if family_key == "accentClump":
            center_weight = 1.0 - abs(x / max(usable_half_width, 1e-6))
            height_bias = 0.72 + 0.28 * math.sqrt(max(0.0, center_weight))
        else:
            height_bias = 0.88 + 0.12 * math.sin(cell_t * math.tau * (1.0 + variant % 3) + variant)
        blade_height = (blade_min + rng.random() * (blade_max - blade_min)) * height_bias
        blade_width = width_low + rng.random() * (width_high - width_low)
        bend = (0.004 + rng.random() * min(0.018, blade_height * 0.32)) * (-1.0 if rng.random() < 0.43 else 1.0)
        depth = (rng.random() - 0.5) * depth_extent
        yaw = (rng.random() - 0.5) * math.radians(78)
        dry_mix = 0.02 + (0.12 if rng.random() < 0.11 else 0.0) + rng.random() * 0.04
        # Roots are staggered by a few millimeters in texture space. Together
        # with tapered insertion points this prevents a shared horizontal seam.
        blade_root = root_z + (rng.random() ** 1.8) * min(0.0030, height * 0.052)
        obj = _add_blade(
            collection,
            material,
            f"AI358_{family_key}_{variant}_Blade_{blade_index}",
            rng,
            palette,
            x,
            depth,
            blade_root,
            blade_height,
            blade_width,
            bend,
            yaw,
            dry_mix,
        )
        obj.location.x += layout_offset[0]
        obj.location.y += layout_offset[1]


def _resize_bilinear(source, output_height, output_width):
    input_height, input_width, _ = source.shape
    if input_height == output_height and input_width == output_width:
        return source.copy()
    ys = np.linspace(0, input_height - 1, output_height, dtype=np.float32)
    xs = np.linspace(0, input_width - 1, output_width, dtype=np.float32)
    y0 = np.floor(ys).astype(np.int32)
    x0 = np.floor(xs).astype(np.int32)
    y1 = np.minimum(y0 + 1, input_height - 1)
    x1 = np.minimum(x0 + 1, input_width - 1)
    wy = (ys - y0).reshape((-1, 1, 1))
    wx = (xs - x0).reshape((1, -1, 1))
    top = source[y0][:, x0] * (1.0 - wx) + source[y0][:, x1] * wx
    bottom = source[y1][:, x0] * (1.0 - wx) + source[y1][:, x1] * wx
    return top * (1.0 - wy) + bottom * wy


def _condition_tile_rgb(tile):
    output = tile.copy()
    original_alpha = output[..., 3].copy()
    working = original_alpha >= ATLAS_ALPHA_CUTOFF
    if not np.any(working):
        raise RuntimeError("Atlas tile has no opaque RGB source pixels.")
    queue = deque((int(y), int(x)) for y, x in np.argwhere(working))
    height, width = working.shape
    while queue:
        y, x = queue.popleft()
        for next_y, next_x in ((y - 1, x), (y, x - 1), (y, x + 1), (y + 1, x)):
            if next_y < 0 or next_y >= height or next_x < 0 or next_x >= width or working[next_y, next_x]:
                continue
            output[next_y, next_x, :3] = output[y, x, :3]
            working[next_y, next_x] = True
            queue.append((next_y, next_x))
    if not np.array_equal(output[..., 3], original_alpha):
        raise RuntimeError("Atlas RGB conditioning changed alpha coverage.")
    return output


def _dilate_tile_alpha(tile, iterations=1):
    output = tile.copy()
    allowed = np.zeros(output.shape[:2], dtype=bool)
    inset = ATLAS_GUTTER_PIXELS
    allowed[inset:-inset, inset:-inset] = True
    for _ in range(iterations):
        alpha = output[..., 3]
        rgb = output[..., :3]
        best_alpha = alpha.copy()
        best_rgb = rgb.copy()
        for candidate_alpha, candidate_rgb in [
            (np.roll(alpha, 1, 0), np.roll(rgb, 1, 0)),
            (np.roll(alpha, -1, 0), np.roll(rgb, -1, 0)),
            (np.roll(alpha, 1, 1), np.roll(rgb, 1, 1)),
            (np.roll(alpha, -1, 1), np.roll(rgb, -1, 1)),
        ]:
            choose = allowed & (candidate_alpha > best_alpha)
            best_alpha = np.where(choose, candidate_alpha, best_alpha)
            best_rgb = np.where(choose[..., None], candidate_rgb, best_rgb)
        output[..., 3] = np.where(allowed, best_alpha, 0.0)
        output[..., :3] = best_rgb
    return output


def _downsample_box(image):
    height, width = image.shape
    if height % 2:
        image = np.pad(image, ((0, 1), (0, 0)), mode="edge")
    if width % 2:
        image = np.pad(image, ((0, 0), (0, 1)), mode="edge")
    return image.reshape((image.shape[0] // 2, 2, image.shape[1] // 2, 2)).mean(axis=(1, 3))


def _measure_mip_coverage(atlas_alpha):
    current = atlas_alpha.astype(np.float32)
    report = []
    for level in range(ATLAS_RUNTIME_MIP_MAX + 1):
        height, width = current.shape
        variants = []
        for variant in range(ATLAS_VARIANTS):
            row = variant // ATLAS_COLUMNS
            column = variant % ATLAS_COLUMNS
            y0 = row * height // ATLAS_ROWS
            y1 = (row + 1) * height // ATLAS_ROWS
            x0 = column * width // ATLAS_COLUMNS
            x1 = (column + 1) * width // ATLAS_COLUMNS
            cell = current[y0:y1, x0:x1]
            variants.append({
                "variant": variant,
                "coverageAtCutoff": round(float((cell >= ATLAS_ALPHA_CUTOFF).mean()), 6),
                "maxAlpha": round(float(cell.max()), 6),
                "meanAlpha": round(float(cell.mean()), 6),
            })
        report.append({
            "level": level,
            "atlasResolution": [int(width), int(height)],
            "cellResolution": [int(width // ATLAS_COLUMNS), int(height // ATLAS_ROWS)],
            "usefulVariants": sum(entry["maxAlpha"] >= ATLAS_ALPHA_CUTOFF for entry in variants),
            "minCoverageAtCutoff": min(entry["coverageAtCutoff"] for entry in variants),
            "maxCoverageAtCutoff": max(entry["coverageAtCutoff"] for entry in variants),
            "minMaxAlpha": min(entry["maxAlpha"] for entry in variants),
            "variants": variants,
        })
        if level < ATLAS_RUNTIME_MIP_MAX:
            current = _downsample_box(current)
    return report


def _longest_horizontal_alpha_run(alpha):
    opaque = alpha >= ATLAS_ALPHA_CUTOFF
    longest = 0
    for row in opaque:
        run = 0
        for covered in row:
            run = run + 1 if covered else 0
            longest = max(longest, run)
    return longest


def _longest_projected_alpha_run(alpha):
    # A steep/top-down view collapses a vertical card toward its horizontal
    # footprint. Max-projecting alpha is a conservative proxy for the dark-line
    # artifact that crossed cards can produce.
    projected = np.max(alpha, axis=0) >= ATLAS_ALPHA_CUTOFF
    run = 0
    longest = 0
    for covered in projected:
        run = run + 1 if covered else 0
        longest = max(longest, run)
    return longest


def _assert_atlas(atlas, family_key):
    expected = (ATLAS_CELL_PIXELS * ATLAS_ROWS, ATLAS_CELL_PIXELS * ATLAS_COLUMNS, 4)
    if atlas.shape != expected:
        raise RuntimeError(f"{family_key} atlas shape {atlas.shape} does not match {expected}.")
    root_line_variants = []
    for variant in range(ATLAS_VARIANTS):
        row = variant // ATLAS_COLUMNS
        column = variant % ATLAS_COLUMNS
        cell_rgba = atlas[
            row * ATLAS_CELL_PIXELS:(row + 1) * ATLAS_CELL_PIXELS,
            column * ATLAS_CELL_PIXELS:(column + 1) * ATLAS_CELL_PIXELS,
            :,
        ]
        cell = cell_rgba[..., 3]
        gutter = ATLAS_GUTTER_PIXELS
        if np.any(cell[:gutter, :] > 0.001) or np.any(cell[-gutter:, :] > 0.001):
            raise RuntimeError(f"{family_key} variant {variant} violates the vertical {gutter}px gutter.")
        if np.any(cell[:, :gutter] > 0.001) or np.any(cell[:, -gutter:] > 0.001):
            raise RuntimeError(f"{family_key} variant {variant} violates the horizontal {gutter}px gutter.")
        longest_run = _longest_horizontal_alpha_run(cell)
        maximum_allowed_run = int(ATLAS_CELL_PIXELS * ATLAS_MAX_HORIZONTAL_RUN_FRACTION)
        if longest_run > maximum_allowed_run:
            raise RuntimeError(
                f"{family_key} variant {variant} has a {longest_run}px continuous horizontal "
                f"alpha run; maximum is {maximum_allowed_run}px."
            )
        projected_run = _longest_projected_alpha_run(cell)
        maximum_projected_run = int(ATLAS_CELL_PIXELS * ATLAS_MAX_TOP_DOWN_RUN_FRACTION)
        if projected_run > maximum_projected_run:
            raise RuntimeError(
                f"{family_key} variant {variant} collapses to a {projected_run}px opaque run "
                f"in the top-down proxy; maximum is {maximum_projected_run}px."
            )
        projected_coverage = float((np.max(cell, axis=0) >= ATLAS_ALPHA_CUTOFF).mean())
        if projected_coverage > ATLAS_MAX_TOP_DOWN_COVERAGE:
            raise RuntimeError(
                f"{family_key} variant {variant} has {projected_coverage:.3f} projected alpha "
                f"coverage; maximum is {ATLAS_MAX_TOP_DOWN_COVERAGE:.3f} for a broken top-down contour."
            )
        opaque_black_pixels = int(np.sum(
            (cell >= ATLAS_ALPHA_CUTOFF)
            & (np.max(cell_rgba[..., :3], axis=2) < 0.08)
        ))
        if opaque_black_pixels:
            raise RuntimeError(
                f"{family_key} variant {variant} contains opaque black alpha-conditioning pixels."
            )
        root_line_variants.append({
            "variant": variant,
            "maxHorizontalRunPixelsAtCutoff": longest_run,
            "maxTopDownProjectedRunPixelsAtCutoff": projected_run,
            "topDownProjectedCoverageAtCutoff": round(projected_coverage, 6),
            "opaqueBlackPixelsAtCutoff": opaque_black_pixels,
        })
    report = _measure_mip_coverage(atlas[..., 3])
    failed = [entry["level"] for entry in report if entry["usefulVariants"] != ATLAS_VARIANTS]
    if failed:
        raise RuntimeError(f"{family_key} loses useful alpha coverage at declared runtime mips: {failed}")
    root_line_report = {
        "metricVersion": 1,
        "cutoff": ATLAS_ALPHA_CUTOFF,
        "maxAllowedHorizontalRunPixels": int(
            ATLAS_CELL_PIXELS * ATLAS_MAX_HORIZONTAL_RUN_FRACTION
        ),
        "maxAllowedTopDownProjectedRunPixels": int(
            ATLAS_CELL_PIXELS * ATLAS_MAX_TOP_DOWN_RUN_FRACTION
        ),
        "maxAllowedTopDownProjectedCoverage": ATLAS_MAX_TOP_DOWN_COVERAGE,
        "maxObservedHorizontalRunPixels": max(
            entry["maxHorizontalRunPixelsAtCutoff"] for entry in root_line_variants
        ),
        "maxObservedTopDownProjectedRunPixels": max(
            entry["maxTopDownProjectedRunPixelsAtCutoff"] for entry in root_line_variants
        ),
        "maxObservedTopDownProjectedCoverage": max(
            entry["topDownProjectedCoverageAtCutoff"] for entry in root_line_variants
        ),
        "opaqueBlackPixelsAtCutoff": sum(
            entry["opaqueBlackPixelsAtCutoff"] for entry in root_line_variants
        ),
        "continuousRootRibbonDetected": False,
        "variants": root_line_variants,
    }
    return report, root_line_report


def _assert_rgb_conditioning(atlas, family_key):
    variants = []
    for variant in range(ATLAS_VARIANTS):
        row = variant // ATLAS_COLUMNS
        column = variant % ATLAS_COLUMNS
        cell = atlas[
            row * ATLAS_CELL_PIXELS:(row + 1) * ATLAS_CELL_PIXELS,
            column * ATLAS_CELL_PIXELS:(column + 1) * ATLAS_CELL_PIXELS,
            :,
        ]
        below_cutoff = cell[..., 3] < ATLAS_ALPHA_CUTOFF
        transparent = cell[..., 3] <= 0.001
        black = np.max(cell[..., :3], axis=2) < (0.5 / 255.0)
        variants.append({
            "variant": variant,
            "conditionedPixelsBelowCutoff": int(np.sum(below_cutoff)),
            "blackPixelsBelowCutoff": int(np.sum(below_cutoff & black)),
            "transparentPixels": int(np.sum(transparent)),
            "transparentBlackPixels": int(np.sum(transparent & black)),
        })
    black_below_cutoff = sum(entry["blackPixelsBelowCutoff"] for entry in variants)
    transparent_black = sum(entry["transparentBlackPixels"] for entry in variants)
    if black_below_cutoff or transparent_black:
        raise RuntimeError(
            f"{family_key} RGB conditioning left {black_below_cutoff} sub-cutoff black pixels "
            f"and {transparent_black} transparent black pixels."
        )
    return {
        "metricVersion": 1,
        "policy": ATLAS_RGB_CONDITIONING_POLICY,
        "sourceAlphaCutoff": ATLAS_ALPHA_CUTOFF,
        "conditionedPixelsBelowCutoff": sum(
            entry["conditionedPixelsBelowCutoff"] for entry in variants
        ),
        "blackPixelsBelowCutoff": black_below_cutoff,
        "transparentPixels": sum(entry["transparentPixels"] for entry in variants),
        "transparentBlackPixels": transparent_black,
        "variants": variants,
    }


def _assert_split_atlas_sampling(channel_arrays, coverage, reference_alpha, family_key):
    non_opaque_alpha = {
        channel: int(np.sum(array[..., 3] < (254.5 / 255.0)))
        for channel, array in channel_arrays.items()
    }
    coverage_channel_error = float(np.max(np.abs(coverage[..., 1] - reference_alpha)))
    coverage_rgb_error = float(np.max(np.abs(coverage[..., :3] - coverage[..., 1:2])))
    coverage_non_opaque_alpha = int(np.sum(coverage[..., 3] < (254.5 / 255.0)))
    if any(non_opaque_alpha.values()) or coverage_non_opaque_alpha:
        raise RuntimeError(f"{family_key} split atlas output retained non-opaque channel alpha.")
    if coverage_channel_error > (1.5 / 255.0) or coverage_rgb_error > (1.5 / 255.0):
        raise RuntimeError(f"{family_key} separate coverage no longer matches baked alpha.")
    return {
        "metricVersion": 1,
        "policy": ATLAS_SAMPLING_POLICY,
        "coverageChannel": "green",
        "nonOpaqueAlphaPixelsByChannel": non_opaque_alpha,
        "coverageNonOpaqueAlphaPixels": coverage_non_opaque_alpha,
        "maximumCoverageChannelError": round(coverage_channel_error, 8),
        "maximumCoverageRgbError": round(coverage_rgb_error, 8),
    }


def _configure_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.view_settings.view_transform = "Standard"
    # Keep the albedo pass colorimetric. Creative display contrast here would become
    # baked lighting/contrast and make the cards detach from the canonical far map.
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    world = bpy.data.worlds.new("AI358_TransparentWorld")
    world.color = (0.0, 0.0, 0.0)
    scene.world = world
    return scene


def _configure_atlas_camera(scene, family):
    camera_data = bpy.data.cameras.new(f"AI358_{family['prefix']}_Camera")
    camera = bpy.data.objects.new(f"AI358_{family['prefix']}_Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    width = family["physicalWidthMeters"]
    height = family["physicalHeightMeters"]
    camera_data.ortho_scale = width
    camera.location = (0.0, -max(0.8, width * 1.4), height * 0.5)
    camera.rotation_euler = (Vector((0.0, 0.0, height * 0.5)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    short_axis = 256
    scene.render.resolution_y = short_axis
    scene.render.resolution_x = max(short_axis, int(round(short_axis * width / height)))
    return camera


def _render_variant(scene, output_dir, family, variant):
    temporary = os.path.join(output_dir, f"_{family['prefix']}_tile_{variant}.png")
    scene.render.filepath = temporary
    bpy.ops.render.render(write_still=True)
    render = bpy.data.images.load(temporary, check_existing=False)
    width, height = render.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    render.pixels.foreach_get(pixels)
    bpy.data.images.remove(render)
    os.remove(temporary)
    tile = _resize_bilinear(pixels.reshape((height, width, 4)), ATLAS_CELL_PIXELS, ATLAS_CELL_PIXELS)
    tile[:ATLAS_GUTTER_PIXELS, :, 3] = 0.0
    tile[-ATLAS_GUTTER_PIXELS:, :, 3] = 0.0
    tile[:, :ATLAS_GUTTER_PIXELS, 3] = 0.0
    tile[:, -ATLAS_GUTTER_PIXELS:, 3] = 0.0
    return tile


def _bake_atlas_family(output_dir, scene, collection, material, family_key, family, palette):
    camera = _configure_atlas_camera(scene, family)
    atlas = np.zeros((ATLAS_CELL_PIXELS * ATLAS_ROWS, ATLAS_CELL_PIXELS * ATLAS_COLUMNS, 4), dtype=np.float32)
    alpha_dilation = 0
    for variant in range(ATLAS_VARIANTS):
        _clear_collection_objects(collection)
        _build_atlas_variant(collection, material, family_key, family, variant, palette)
        tile = _render_variant(scene, output_dir, family, variant)
        row = variant // ATLAS_COLUMNS
        column = variant % ATLAS_COLUMNS
        atlas[
            row * ATLAS_CELL_PIXELS:(row + 1) * ATLAS_CELL_PIXELS,
            column * ATLAS_CELL_PIXELS:(column + 1) * ATLAS_CELL_PIXELS,
            :,
        ] = tile

    for _ in range(7):
        report = _measure_mip_coverage(atlas[..., 3])
        if all(entry["usefulVariants"] == ATLAS_VARIANTS for entry in report):
            break
        for variant in range(ATLAS_VARIANTS):
            row = variant // ATLAS_COLUMNS
            column = variant % ATLAS_COLUMNS
            tile = atlas[
                row * ATLAS_CELL_PIXELS:(row + 1) * ATLAS_CELL_PIXELS,
                column * ATLAS_CELL_PIXELS:(column + 1) * ATLAS_CELL_PIXELS,
                :,
            ]
            atlas[
                row * ATLAS_CELL_PIXELS:(row + 1) * ATLAS_CELL_PIXELS,
                column * ATLAS_CELL_PIXELS:(column + 1) * ATLAS_CELL_PIXELS,
                :,
            ] = _dilate_tile_alpha(tile, 1)
        alpha_dilation += 1

    for variant in range(ATLAS_VARIANTS):
        row = variant // ATLAS_COLUMNS
        column = variant % ATLAS_COLUMNS
        tile = atlas[
            row * ATLAS_CELL_PIXELS:(row + 1) * ATLAS_CELL_PIXELS,
            column * ATLAS_CELL_PIXELS:(column + 1) * ATLAS_CELL_PIXELS,
            :,
        ]
        atlas[
            row * ATLAS_CELL_PIXELS:(row + 1) * ATLAS_CELL_PIXELS,
            column * ATLAS_CELL_PIXELS:(column + 1) * ATLAS_CELL_PIXELS,
            :,
        ] = _condition_tile_rgb(tile)

    mip_report, root_line_report = _assert_atlas(atlas, family_key)
    _assert_rgb_conditioning(atlas, family_key)
    alpha = atlas[..., 3:4]
    opaque_alpha = np.ones_like(alpha)
    # Material gradients restart in every atlas row; they describe one card's
    # root-to-tip response and must not make the second variant row glossier.
    height_axis = (
        (np.arange(atlas.shape[0], dtype=np.float32) % ATLAS_CELL_PIXELS)
        / max(1, ATLAS_CELL_PIXELS - 1)
    ).reshape((-1, 1, 1))
    normal = np.concatenate(
        [np.full_like(alpha, 0.5), np.full_like(alpha, 0.5), np.ones_like(alpha), opaque_alpha],
        axis=2,
    )
    rough_scalar = np.broadcast_to(0.88 + height_axis * 0.06, alpha.shape)
    roughness = np.concatenate([rough_scalar] * 3 + [opaque_alpha], axis=2)
    ao_scalar = np.broadcast_to(0.72 + height_axis * 0.28, alpha.shape)
    ao = np.concatenate([ao_scalar] * 3 + [opaque_alpha], axis=2)
    basecolor = atlas.copy()
    basecolor[..., 3:4] = opaque_alpha
    coverage = np.concatenate([alpha] * 3 + [opaque_alpha], axis=2)
    prefix = family["prefix"]
    basecolor_filename = f"{prefix}_basecolor.png"
    coverage_filename = f"{prefix}_coverage.png"
    files = [
        _save_image(output_dir, basecolor_filename, basecolor, "sRGB"),
        _save_image(output_dir, coverage_filename, coverage, "Non-Color"),
        _save_image(output_dir, f"{prefix}_normal_gl.png", normal, "Non-Color"),
        _save_image(output_dir, f"{prefix}_roughness.png", roughness, "Non-Color"),
        _save_image(output_dir, f"{prefix}_ao.png", ao, "Non-Color"),
    ]
    saved_images = []
    saved_arrays = {}
    for channel, filename, color_space in [
        ("baseColor", basecolor_filename, "sRGB"),
        ("normal", f"{prefix}_normal_gl.png", "Non-Color"),
        ("roughness", f"{prefix}_roughness.png", "Non-Color"),
        ("ao", f"{prefix}_ao.png", "Non-Color"),
        ("coverage", coverage_filename, "Non-Color"),
    ]:
        image, array = _read_image(output_dir, filename, color_space)
        saved_images.append(image)
        saved_arrays[channel] = array
    conditioned_saved_atlas = saved_arrays["baseColor"].copy()
    conditioned_saved_atlas[..., 3] = saved_arrays["coverage"][..., 1]
    rgb_conditioning_report = _assert_rgb_conditioning(conditioned_saved_atlas, family_key)
    split_sampling_report = _assert_split_atlas_sampling(
        {key: saved_arrays[key] for key in ("baseColor", "normal", "roughness", "ao")},
        saved_arrays["coverage"],
        alpha[..., 0],
        family_key,
    )
    for saved_image in saved_images:
        bpy.data.images.remove(saved_image)
    bpy.data.objects.remove(camera, do_unlink=True)
    return files, mip_report, root_line_report, rgb_conditioning_report, split_sampling_report, alpha_dilation


def _write_manifest(output_dir, blend_path, palette, family_results):
    roles = {
        "far_basecolor.png": {"role": "baseColor", "colorSpace": "sRGB"},
        "far_normal_gl.png": {"role": "normal", "colorSpace": "linear"},
        "far_ao.png": {"role": "ambientOcclusion", "colorSpace": "linear"},
        "far_roughness.png": {"role": "roughness", "colorSpace": "linear"},
        "far_height.png": {"role": "height", "colorSpace": "linear"},
        "far_coverage.png": {"role": "coverage", "colorSpace": "linear"},
        "mid_cluster_basecolor.png": {"role": "midClusterBaseColor", "colorSpace": "sRGB"},
        "mid_cluster_coverage.png": {"role": "midClusterCoverage", "colorSpace": "linear"},
        "mid_cluster_normal_gl.png": {"role": "midClusterNormal", "colorSpace": "linear"},
        "mid_cluster_roughness.png": {"role": "midClusterRoughness", "colorSpace": "linear"},
        "mid_cluster_ao.png": {"role": "midClusterAmbientOcclusion", "colorSpace": "linear"},
        "accent_clump_basecolor.png": {"role": "accentClumpBaseColor", "colorSpace": "sRGB"},
        "accent_clump_coverage.png": {"role": "accentClumpCoverage", "colorSpace": "linear"},
        "accent_clump_normal_gl.png": {"role": "accentClumpNormal", "colorSpace": "linear"},
        "accent_clump_roughness.png": {"role": "accentClumpRoughness", "colorSpace": "linear"},
        "accent_clump_ao.png": {"role": "accentClumpAmbientOcclusion", "colorSpace": "linear"},
        os.path.basename(blend_path): {"role": "deterministicBakeSource", "colorSpace": None},
    }
    for filename, entry in roles.items():
        path = os.path.join(output_dir, filename)
        if not os.path.isfile(path):
            raise RuntimeError(f"Missing baked asset: {path}")
        with open(path, "rb") as handle:
            entry["sha256"] = hashlib.sha256(handle.read()).hexdigest()
        entry["bytes"] = os.path.getsize(path)

    atlas_families = {}
    for family_key, family in ATLAS_FAMILIES.items():
        result = family_results[family_key]
        atlas_families[family_key] = {
            "prefix": family["prefix"],
            "label": family["label"],
            "grid": {"columns": ATLAS_COLUMNS, "rows": ATLAS_ROWS, "variants": ATLAS_VARIANTS},
            "atlasResolution": [ATLAS_CELL_PIXELS * ATLAS_COLUMNS, ATLAS_CELL_PIXELS * ATLAS_ROWS],
            "cellResolution": [ATLAS_CELL_PIXELS, ATLAS_CELL_PIXELS],
            "gutterPixels": ATLAS_GUTTER_PIXELS,
            "physicalDimensionsMetersPerCell": {
                "width": family["physicalWidthMeters"],
                "height": family["physicalHeightMeters"],
            },
            "runtimeNominalDimensionsMeters": {
                "width": family["physicalWidthMeters"],
                "height": family["physicalHeightMeters"],
            },
            "runtimeNominalDimensionErrorPercent": {"width": 0.0, "height": 0.0},
            "alphaPolicy": {
                "cutoff": ATLAS_ALPHA_CUTOFF,
                "alphaToCoverage": True,
                "minFilter": "linear_mipmap_linear",
                "magFilter": "linear",
                "sampling": result["splitSamplingReport"],
                "rgbConditioning": result["rgbConditioningReport"],
                "alphaConditioningDilationPixels": result["alphaDilationPixels"],
                "runtimeMipMaxInclusive": ATLAS_RUNTIME_MIP_MAX,
                "coverageByMip": result["mipReport"],
                "rootLineValidation": result["rootLineReport"],
            },
        }

    manifest = {
        "schema": "bus-simulator.low-cut-grass-asset-family",
        "version": 2,
        "assetId": "grass.natural.maintained.material.v2",
        "materialId": "pbr.grass_low_cut_maintained_v2",
        "source": {
            "asset": "ambientCG Grass 004",
            "url": SOURCE_URL,
            "license": "CC0 1.0",
            "sourcePhysicalDimensionsMeters": None,
            "sourcePhysicalDimensionsStatus": "not published in the checked-in source package",
            "calibratedFarTileMeters": {"x": FAR_TILE_METERS, "z": FAR_TILE_METERS},
            "sourceFiles": {
                "baseColor": "assets/public/pbr/grass_004/basecolor.png",
                "normal": "assets/public/pbr/grass_004/normal_gl.png",
                "ao": "assets/public/pbr/grass_004/ao.png",
                "roughness": "assets/public/pbr/grass_004/roughness.png",
                "height": "assets/public/pbr/grass_004/displacement.png",
            },
        },
        "physicalDimensionsMeters": {"x": FAR_TILE_METERS, "z": FAR_TILE_METERS},
        "bakeProfile": PROFILE,
        "appearance": {
            "paletteSource": "corrected far_basecolor.png linear-color percentiles",
            "palette": _palette_manifest(palette),
            "runtimeEmissiveIntensity": 0.0,
            "lightingInBaseColor": False,
        },
        "generation": {
            "tool": f"Blender {bpy.app.version_string}",
            "recipe": "tools/grass_material_baker/blender_bake.py",
            "seed": BAKE_SEED,
            "farMapResolution": [1024, 1024],
            "atlasFamilies": atlas_families,
            "lightingInBaseColor": False,
        },
        "files": roles,
    }
    manifest_path = os.path.join(output_dir, "asset.manifest.json")
    with open(manifest_path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")
    return manifest_path


def _build_inspectable_source(scene, material, palette):
    for family_index, (family_key, family) in enumerate(ATLAS_FAMILIES.items()):
        collection = bpy.data.collections.new(f"AI358_{family_key}_Inspectable")
        scene.collection.children.link(collection)
        for variant in range(ATLAS_VARIANTS):
            x = (variant % ATLAS_COLUMNS - 1.5) * (family["physicalWidthMeters"] * 1.25)
            y = family_index * 1.6 + (variant // ATLAS_COLUMNS) * 0.22
            _build_atlas_variant(collection, material, family_key, family, variant, palette, (x, y))


def bake_low_cut_grass_material_v2(source_dir, output_dir, reset_after=True):
    source_dir = os.path.abspath(source_dir)
    output_dir = os.path.abspath(output_dir)
    required = ["basecolor.png", "normal_gl.png", "ao.png", "roughness.png", "displacement.png"]
    missing = [filename for filename in required if not os.path.isfile(os.path.join(source_dir, filename))]
    if missing:
        raise RuntimeError(f"Grass004 source is missing: {', '.join(missing)}")
    os.makedirs(output_dir, exist_ok=True)
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    # Generated output is replaceable and must not accumulate Blender's numbered
    # backup files beside the manifest-owned asset set.
    bpy.context.preferences.filepaths.save_version = 0
    far_files, palette = _bake_far_maps(source_dir, output_dir)
    scene = _configure_scene()
    material = _create_albedo_bake_material()
    family_results = {}
    atlas_files = []
    for family_key, family in ATLAS_FAMILIES.items():
        collection = bpy.data.collections.new(f"AI358_{family_key}_Bake")
        scene.collection.children.link(collection)
        files, mip_report, root_line_report, rgb_conditioning_report, split_sampling_report, alpha_dilation = _bake_atlas_family(
            output_dir,
            scene,
            collection,
            material,
            family_key,
            family,
            palette,
        )
        atlas_files.extend(files)
        family_results[family_key] = {
            "mipReport": mip_report,
            "rootLineReport": root_line_report,
            "rgbConditioningReport": rgb_conditioning_report,
            "splitSamplingReport": split_sampling_report,
            "alphaDilationPixels": alpha_dilation,
        }
        _clear_collection_objects(collection)
        bpy.data.collections.remove(collection)

    _build_inspectable_source(scene, material, palette)
    metadata_collection = bpy.data.collections.new("AI358_SourceMetadata")
    scene.collection.children.link(metadata_collection)
    metadata = bpy.data.objects.new("AI358_BakeMetadata", None)
    metadata["source_asset"] = "ambientCG Grass 004"
    metadata["source_url"] = SOURCE_URL
    metadata["license"] = "CC0 1.0"
    metadata["calibrated_far_tile_meters"] = FAR_TILE_METERS
    metadata["profile_id"] = PROFILE["profileId"]
    metadata["profile_version"] = PROFILE["version"]
    metadata["profile_seed"] = PROFILE["seed"]
    metadata["bake_seed"] = BAKE_SEED
    metadata["runtime_emissive_intensity"] = 0.0
    metadata_collection.objects.link(metadata)

    blend_path = os.path.join(output_dir, "grass_low_cut_maintained_v2.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    manifest_path = _write_manifest(output_dir, blend_path, palette, family_results)
    response = {
        "outputDir": output_dir,
        "blendPath": blend_path,
        "manifestPath": manifest_path,
        "farFiles": [os.path.basename(path) for path in far_files],
        "atlasFiles": [os.path.basename(path) for path in atlas_files],
        "atlasMipValidation": {
            key: {
                "levels": len(result["mipReport"]),
                "minimumUsefulVariants": min(entry["usefulVariants"] for entry in result["mipReport"]),
                "alphaDilationPixels": result["alphaDilationPixels"],
                "rgbConditioning": {
                    "policy": result["rgbConditioningReport"]["policy"],
                    "transparentBlackPixels": result["rgbConditioningReport"]["transparentBlackPixels"],
                    "blackPixelsBelowCutoff": result["rgbConditioningReport"]["blackPixelsBelowCutoff"],
                },
                "sampling": result["splitSamplingReport"],
                "rootLineValidation": {
                    "continuousRootRibbonDetected": result["rootLineReport"]["continuousRootRibbonDetected"],
                    "maxObservedHorizontalRunPixels": result["rootLineReport"]["maxObservedHorizontalRunPixels"],
                    "maxObservedTopDownProjectedRunPixels": result["rootLineReport"]["maxObservedTopDownProjectedRunPixels"],
                    "maxObservedTopDownProjectedCoverage": result["rootLineReport"]["maxObservedTopDownProjectedCoverage"],
                },
            }
            for key, result in family_results.items()
        },
    }
    if reset_after:
        bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
        response["resetObjects"] = len(bpy.data.objects)
        response["resetFilepath"] = bpy.data.filepath
    return response


def bake_low_cut_grass_material(source_dir, output_dir, reset_after=True):
    return bake_low_cut_grass_material_v2(source_dir, output_dir, reset_after=reset_after)


def _cli_paths():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(args) != 2:
        raise RuntimeError("Expected: blender --background --python blender_bake.py -- <Grass004 folder> <V2 output folder>")
    return args[0], args[1]


if __name__ == "__main__":
    source_path, output_path = _cli_paths()
    print(json.dumps(bake_low_cut_grass_material_v2(source_path, output_path), indent=2))
