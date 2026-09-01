"""Deterministic bake-only cutout silhouette compilation without Blender APIs.

The compiler intentionally targets a fixed orthographic light texel lattice and
bilinear mip-0 alpha. It does not claim parity with implementation-dependent GL
mipmap generation or anisotropic filtering.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from typing import Iterable, Sequence


THREE_REPEAT_WRAPPING = 1000
THREE_CLAMP_TO_EDGE_WRAPPING = 1001
THREE_MIRRORED_REPEAT_WRAPPING = 1002

SIDE_FRONT = "front"
SIDE_BACK = "back"
SIDE_DOUBLE = "double"

CUTOUT_SILHOUETTE_VERSION = "ai531-cutout-silhouette-proxy-v1"
_VERSION_IDENTITY_BASE = {
    "alphaSampling": "three-map-transform-flipy-wrap-bilinear-mip0-alpha-v1",
    "filterScope": "bilinear-mip0-only-no-generated-mip-or-anisotropic-kernel-v1",
    "pixelCoverage": "webgl-bottom-left-pixel-center-top-left-f64-v1",
    "proxyGeometry": "horizontal-row-runs-mapped-to-source-triangle-plane-v1",
    "schema": CUTOUT_SILHOUETTE_VERSION,
    "textureRows": "row-major-bottom-left-v1",
}
CUTOUT_SILHOUETTE_VERSION_SHA256 = hashlib.sha256(
    json.dumps(
        _VERSION_IDENTITY_BASE,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
).hexdigest()

_WRAP_MODES = {
    THREE_REPEAT_WRAPPING,
    THREE_CLAMP_TO_EDGE_WRAPPING,
    THREE_MIRRORED_REPEAT_WRAPPING,
}
_SIDES = {SIDE_FRONT, SIDE_BACK, SIDE_DOUBLE}
_AXIS_TOLERANCE = 1e-9

Vec2 = tuple[float, float]
Vec3 = tuple[float, float, float]


@dataclass(frozen=True)
class AlphaTextureMip0:
    """One unsigned-byte alpha mip in native bottom-left row order."""

    width: int
    height: int
    pixels: Sequence[int] | bytes | bytearray | memoryview
    matrix: Sequence[float] = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)
    flip_y: bool = False
    wrap_s: int = THREE_CLAMP_TO_EDGE_WRAPPING
    wrap_t: int = THREE_CLAMP_TO_EDGE_WRAPPING

    def __post_init__(self) -> None:
        _require_positive_integer(self.width, "texture width")
        _require_positive_integer(self.height, "texture height")
        if any(isinstance(value, bool) or not isinstance(value, int) for value in self.pixels):
            raise TypeError("Alpha mip samples must be integer bytes")
        pixels = tuple(self.pixels)
        if len(pixels) != self.width * self.height:
            raise ValueError("Alpha mip byte count must equal width times height")
        if any(value < 0 or value > 255 for value in pixels):
            raise ValueError("Alpha mip samples must be unsigned bytes")
        matrix = _finite_tuple(self.matrix, 9, "texture UV matrix")
        if not isinstance(self.flip_y, bool):
            raise TypeError("texture flip_y must be boolean")
        if self.wrap_s not in _WRAP_MODES or self.wrap_t not in _WRAP_MODES:
            raise ValueError("texture wrap mode is unsupported")
        object.__setattr__(self, "pixels", pixels)
        object.__setattr__(self, "matrix", matrix)


@dataclass(frozen=True)
class OrthographicLightLattice:
    """World-to-light axes and a finite bottom-left-origin texel lattice."""

    origin_world: Sequence[float]
    right_axis_world: Sequence[float]
    up_axis_world: Sequence[float]
    depth_axis_world: Sequence[float]
    bounds_min_light: Sequence[float]
    texel_size: Sequence[float]
    width: int
    height: int

    def __post_init__(self) -> None:
        origin = _finite_tuple(self.origin_world, 3, "light origin")
        right = _finite_tuple(self.right_axis_world, 3, "light right axis")
        up = _finite_tuple(self.up_axis_world, 3, "light up axis")
        depth = _finite_tuple(self.depth_axis_world, 3, "light depth axis")
        bounds = _finite_tuple(self.bounds_min_light, 2, "light bounds minimum")
        texel = _finite_tuple(self.texel_size, 2, "light texel size")
        _require_positive_integer(self.width, "lattice width")
        _require_positive_integer(self.height, "lattice height")
        if texel[0] <= 0.0 or texel[1] <= 0.0:
            raise ValueError("light texel sizes must be positive")
        for label, axis in (("right", right), ("up", up), ("depth", depth)):
            if abs(_dot3(axis, axis) - 1.0) > _AXIS_TOLERANCE:
                raise ValueError(f"light {label} axis must be unit length")
        if (
            abs(_dot3(right, up)) > _AXIS_TOLERANCE
            or abs(_dot3(right, depth)) > _AXIS_TOLERANCE
            or abs(_dot3(up, depth)) > _AXIS_TOLERANCE
        ):
            raise ValueError("light lattice axes must be mutually orthogonal")
        object.__setattr__(self, "origin_world", origin)
        object.__setattr__(self, "right_axis_world", right)
        object.__setattr__(self, "up_axis_world", up)
        object.__setattr__(self, "depth_axis_world", depth)
        object.__setattr__(self, "bounds_min_light", bounds)
        object.__setattr__(self, "texel_size", texel)


@dataclass(frozen=True)
class CutoutTriangle:
    vertices: Sequence[Sequence[float]]
    uvs: Sequence[Sequence[float]]
    side: str = SIDE_DOUBLE

    def __post_init__(self) -> None:
        if len(self.vertices) != 3 or len(self.uvs) != 3:
            raise ValueError("Cutout triangles require exactly three vertices and UVs")
        vertices = tuple(
            _finite_tuple(value, 3, f"triangle vertex {index}")
            for index, value in enumerate(self.vertices)
        )
        uvs = tuple(
            _finite_tuple(value, 2, f"triangle UV {index}")
            for index, value in enumerate(self.uvs)
        )
        if self.side not in _SIDES:
            raise ValueError("triangle side must be front, back, or double")
        object.__setattr__(self, "vertices", vertices)
        object.__setattr__(self, "uvs", uvs)


@dataclass(frozen=True, order=True)
class PixelRun:
    row: int
    x_start: int
    x_end_exclusive: int

    def __post_init__(self) -> None:
        if not all(isinstance(value, int) for value in (
            self.row,
            self.x_start,
            self.x_end_exclusive,
        )):
            raise TypeError("pixel run coordinates must be integers")
        if self.x_end_exclusive <= self.x_start:
            raise ValueError("pixel run must contain at least one pixel")


def cutout_silhouette_version_identity() -> dict[str, str]:
    """Return a fresh, canonical identity record for compiled proxies."""

    return {
        **_VERSION_IDENTITY_BASE,
        "sha256": CUTOUT_SILHOUETTE_VERSION_SHA256,
    }


def apply_texture_uv_transform(uv: Sequence[float], matrix: Sequence[float]) -> Vec2:
    """Apply Three's column-major mat3 map transform without a homogeneous divide."""

    source = _finite_tuple(uv, 2, "texture UV")
    transform = _finite_tuple(matrix, 9, "texture UV matrix")
    return (
        _zero_normalized(transform[0] * source[0] + transform[3] * source[1] + transform[6]),
        _zero_normalized(transform[1] * source[0] + transform[4] * source[1] + transform[7]),
    )


def wrap_texel_index(index: int, size: int, mode: int) -> int:
    """Resolve one integer bilinear tap using Three/WebGL wrap semantics."""

    if not isinstance(index, int):
        raise TypeError("texel index must be an integer")
    _require_positive_integer(size, "texture axis size")
    if mode == THREE_CLAMP_TO_EDGE_WRAPPING:
        return min(max(index, 0), size - 1)
    if mode == THREE_REPEAT_WRAPPING:
        return index % size
    if mode == THREE_MIRRORED_REPEAT_WRAPPING:
        mirrored = index % (size * 2)
        return mirrored if mirrored < size else size * 2 - mirrored - 1
    raise ValueError("texture wrap mode is unsupported")


def sample_bilinear_alpha_mip0(texture: AlphaTextureMip0, uv: Sequence[float]) -> float:
    """Sample normalized alpha with GL_LINEAR mip-0 texel-center math."""

    transformed_u, transformed_v = apply_texture_uv_transform(uv, texture.matrix)
    if texture.flip_y:
        transformed_v = 1.0 - transformed_v
    texel_x = transformed_u * texture.width - 0.5
    texel_y = transformed_v * texture.height - 0.5
    x0 = math.floor(texel_x)
    y0 = math.floor(texel_y)
    fraction_x = texel_x - x0
    fraction_y = texel_y - y0
    x1 = x0 + 1
    y1 = y0 + 1

    def fetch(x: int, y: int) -> float:
        resolved_x = wrap_texel_index(x, texture.width, texture.wrap_s)
        resolved_y = wrap_texel_index(y, texture.height, texture.wrap_t)
        return texture.pixels[resolved_y * texture.width + resolved_x] / 255.0

    lower = _mix(fetch(x0, y0), fetch(x1, y0), fraction_x)
    upper = _mix(fetch(x0, y1), fetch(x1, y1), fraction_x)
    return _mix(lower, upper, fraction_y)


def alpha_test_keeps(coverage: float, alpha_test: float) -> bool:
    """Match Three's shadow discard rule: discard only when coverage < threshold."""

    coverage_value = _finite_float(coverage, "alpha coverage")
    threshold = _finite_float(alpha_test, "alpha test")
    if coverage_value < 0.0 or coverage_value > 1.0:
        raise ValueError("alpha coverage must be in the inclusive unit interval")
    if threshold < 0.0 or threshold > 1.0:
        raise ValueError("alpha test must be in the inclusive unit interval")
    return coverage_value >= threshold


def project_world_to_lattice(
    world: Sequence[float], lattice: OrthographicLightLattice
) -> tuple[float, float, float]:
    """Project a world point to texel-edge coordinates plus world-depth meters."""

    point = _finite_tuple(world, 3, "world position")
    relative = _sub3(point, lattice.origin_world)
    light_x = _dot3(relative, lattice.right_axis_world)
    light_y = _dot3(relative, lattice.up_axis_world)
    light_depth = _dot3(relative, lattice.depth_axis_world)
    return (
        (light_x - lattice.bounds_min_light[0]) / lattice.texel_size[0],
        (light_y - lattice.bounds_min_light[1]) / lattice.texel_size[1],
        light_depth,
    )


def pixel_center_covered_top_left(
    projected_vertices: Sequence[Sequence[float]], pixel_x: int, pixel_y: int
) -> bool:
    """Evaluate single-sample WebGL triangle ownership at one pixel center."""

    vertices = tuple(
        _finite_tuple(vertex, 2, f"projected vertex {index}")
        for index, vertex in enumerate(projected_vertices)
    )
    if len(vertices) != 3:
        raise ValueError("projected triangle requires exactly three vertices")
    if not isinstance(pixel_x, int) or not isinstance(pixel_y, int):
        raise TypeError("pixel coordinates must be integers")
    area = _edge(vertices[0], vertices[1], vertices[2])
    if area == 0.0:
        return False
    if area < 0.0:
        vertices = (vertices[0], vertices[2], vertices[1])
    point = (pixel_x + 0.5, pixel_y + 0.5)
    for start, end in (
        (vertices[0], vertices[1]),
        (vertices[1], vertices[2]),
        (vertices[2], vertices[0]),
    ):
        value = _edge(start, end, point)
        if value < 0.0 or (value == 0.0 and not _is_top_left_edge(start, end)):
            return False
    return True


def group_row_runs(pixels: Iterable[tuple[int, int]]) -> list[PixelRun]:
    """Group unique (x, y) pixels into canonical horizontal half-open runs."""

    canonical_pixels: set[tuple[int, int]] = set()
    for pixel in pixels:
        if not isinstance(pixel, Sequence) or len(pixel) != 2:
            raise TypeError("row-run pixels must contain x and y")
        x, y = pixel
        if (
            isinstance(x, bool)
            or isinstance(y, bool)
            or not isinstance(x, int)
            or not isinstance(y, int)
        ):
            raise TypeError("row-run pixel coordinates must be integers")
        canonical_pixels.add((x, y))
    canonical = sorted(canonical_pixels, key=lambda item: (item[1], item[0]))
    runs: list[PixelRun] = []
    for x, row in canonical:
        if runs and runs[-1].row == row and runs[-1].x_end_exclusive == x:
            prior = runs[-1]
            runs[-1] = PixelRun(row, prior.x_start, x + 1)
        else:
            runs.append(PixelRun(row, x, x + 1))
    return runs


def map_lattice_point_to_triangle_plane(
    lattice_point: Sequence[float],
    projected_vertices: Sequence[Sequence[float]],
    world_vertices: Sequence[Sequence[float]],
) -> Vec3:
    """Map any lattice-edge point onto the affine plane of a source triangle."""

    point = _finite_tuple(lattice_point, 2, "lattice point")
    projected = tuple(
        _finite_tuple(vertex, 2, f"projected vertex {index}")
        for index, vertex in enumerate(projected_vertices)
    )
    world = tuple(
        _finite_tuple(vertex, 3, f"world vertex {index}")
        for index, vertex in enumerate(world_vertices)
    )
    if len(projected) != 3 or len(world) != 3:
        raise ValueError("triangle plane mapping requires three projected and world vertices")
    weights = _barycentric_weights(point, projected)
    return tuple(
        _zero_normalized(sum(weights[index] * world[index][axis] for index in range(3)))
        for axis in range(3)
    )  # type: ignore[return-value]


def compile_cutout_silhouettes(
    triangles: Iterable[CutoutTriangle],
    texture: AlphaTextureMip0,
    lattice: OrthographicLightLattice,
    alpha_test: float,
) -> dict[str, object]:
    """Compile accepted texel centers into deterministic plane-preserving quads."""

    threshold = _finite_float(alpha_test, "alpha test")
    if threshold < 0.0 or threshold > 1.0:
        raise ValueError("alpha test must be in the inclusive unit interval")
    source_triangles = tuple(triangles)
    if any(not isinstance(triangle, CutoutTriangle) for triangle in source_triangles):
        raise TypeError("triangles must contain CutoutTriangle instances")

    vertices: list[list[float]] = []
    proxy_triangles: list[list[int]] = []
    proxy_triangle_sources: list[int] = []
    run_records: list[dict[str, int]] = []
    kept_owners: dict[tuple[int, int], int] = {}
    stats = {
        "candidatePixelCount": 0,
        "coveredPixelCount": 0,
        "culledTriangleCount": 0,
        "degenerateTriangleCount": 0,
        "discardedAlphaPixelCount": 0,
        "keptPixelCount": 0,
        "overlappingKeptPixelCount": 0,
        "proxyTriangleCount": 0,
        "proxyVertexCount": 0,
        "rasterizedTriangleCount": 0,
        "runCount": 0,
        "sourceTriangleCount": len(source_triangles),
        "uniqueKeptPixelCount": 0,
        "versionIdentitySha256": CUTOUT_SILHOUETTE_VERSION_SHA256,
    }

    for source_index, triangle in enumerate(source_triangles):
        projected3 = tuple(project_world_to_lattice(vertex, lattice) for vertex in triangle.vertices)
        projected2 = tuple((vertex[0], vertex[1]) for vertex in projected3)
        area = _edge(projected2[0], projected2[1], projected2[2])
        if area == 0.0:
            stats["degenerateTriangleCount"] += 1
            continue
        front_facing = area > 0.0
        if (
            (triangle.side == SIDE_FRONT and not front_facing)
            or (triangle.side == SIDE_BACK and front_facing)
        ):
            stats["culledTriangleCount"] += 1
            continue
        stats["rasterizedTriangleCount"] += 1

        minimum_x = max(0, math.ceil(min(point[0] for point in projected2) - 0.5))
        maximum_x = min(
            lattice.width - 1,
            math.floor(max(point[0] for point in projected2) - 0.5),
        )
        minimum_y = max(0, math.ceil(min(point[1] for point in projected2) - 0.5))
        maximum_y = min(
            lattice.height - 1,
            math.floor(max(point[1] for point in projected2) - 0.5),
        )
        kept_pixels: list[tuple[int, int]] = []
        if minimum_x <= maximum_x and minimum_y <= maximum_y:
            for row in range(minimum_y, maximum_y + 1):
                for column in range(minimum_x, maximum_x + 1):
                    stats["candidatePixelCount"] += 1
                    if not pixel_center_covered_top_left(projected2, column, row):
                        continue
                    stats["coveredPixelCount"] += 1
                    weights = _barycentric_weights(
                        (column + 0.5, row + 0.5),
                        projected2,
                    )
                    uv = (
                        sum(weights[index] * triangle.uvs[index][0] for index in range(3)),
                        sum(weights[index] * triangle.uvs[index][1] for index in range(3)),
                    )
                    coverage = sample_bilinear_alpha_mip0(texture, uv)
                    if not alpha_test_keeps(coverage, threshold):
                        stats["discardedAlphaPixelCount"] += 1
                        continue
                    kept_pixels.append((column, row))
                    stats["keptPixelCount"] += 1
                    owner_count = kept_owners.get((column, row), 0)
                    if owner_count > 0:
                        stats["overlappingKeptPixelCount"] += 1
                    kept_owners[(column, row)] = owner_count + 1

        for run in group_row_runs(kept_pixels):
            run_records.append({
                "row": run.row,
                "sourceTriangleIndex": source_index,
                "xEndExclusive": run.x_end_exclusive,
                "xStart": run.x_start,
            })
            corners = (
                (float(run.x_start), float(run.row)),
                (float(run.x_end_exclusive), float(run.row)),
                (float(run.x_end_exclusive), float(run.row + 1)),
                (float(run.x_start), float(run.row + 1)),
            )
            base_index = len(vertices)
            vertices.extend([
                list(map_lattice_point_to_triangle_plane(corner, projected2, triangle.vertices))
                for corner in corners
            ])
            if front_facing:
                local_triangles = ((0, 1, 2), (0, 2, 3))
            else:
                local_triangles = ((0, 2, 1), (0, 3, 2))
            for local in local_triangles:
                proxy_triangles.append([base_index + value for value in local])
                proxy_triangle_sources.append(source_index)

    stats["proxyTriangleCount"] = len(proxy_triangles)
    stats["proxyVertexCount"] = len(vertices)
    stats["runCount"] = len(run_records)
    stats["uniqueKeptPixelCount"] = len(kept_owners)
    return {
        "proxyTriangleSourceIndices": proxy_triangle_sources,
        "runs": run_records,
        "stats": stats,
        "triangles": proxy_triangles,
        "version": CUTOUT_SILHOUETTE_VERSION,
        "versionIdentity": cutout_silhouette_version_identity(),
        "vertices": vertices,
    }


def _barycentric_weights(point: Vec2, vertices: Sequence[Vec2]) -> tuple[float, float, float]:
    area = _edge(vertices[0], vertices[1], vertices[2])
    if area == 0.0:
        raise ValueError("projected triangle is degenerate")
    return (
        _edge(vertices[1], vertices[2], point) / area,
        _edge(vertices[2], vertices[0], point) / area,
        _edge(vertices[0], vertices[1], point) / area,
    )


def _edge(start: Vec2, end: Vec2, point: Vec2) -> float:
    return (
        (end[0] - start[0]) * (point[1] - start[1])
        - (end[1] - start[1]) * (point[0] - start[0])
    )


def _is_top_left_edge(start: Vec2, end: Vec2) -> bool:
    delta_x = end[0] - start[0]
    delta_y = end[1] - start[1]
    return delta_y > 0.0 or (delta_y == 0.0 and delta_x < 0.0)


def _mix(left: float, right: float, amount: float) -> float:
    return left + (right - left) * amount


def _dot3(left: Sequence[float], right: Sequence[float]) -> float:
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]


def _sub3(left: Sequence[float], right: Sequence[float]) -> Vec3:
    return (
        left[0] - right[0],
        left[1] - right[1],
        left[2] - right[2],
    )


def _finite_tuple(value: Sequence[float], length: int, label: str) -> tuple[float, ...]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        raise TypeError(f"{label} must be a sequence")
    if len(value) != length:
        raise ValueError(f"{label} must contain exactly {length} values")
    return tuple(_finite_float(entry, f"{label}[{index}]") for index, entry in enumerate(value))


def _finite_float(value: float, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f"{label} must be numeric")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{label} must be finite")
    return result


def _require_positive_integer(value: int, label: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{label} must be a positive integer")


def _zero_normalized(value: float) -> float:
    return 0.0 if value == 0.0 else value


__all__ = [
    "AlphaTextureMip0",
    "CUTOUT_SILHOUETTE_VERSION",
    "CUTOUT_SILHOUETTE_VERSION_SHA256",
    "CutoutTriangle",
    "OrthographicLightLattice",
    "PixelRun",
    "SIDE_BACK",
    "SIDE_DOUBLE",
    "SIDE_FRONT",
    "THREE_CLAMP_TO_EDGE_WRAPPING",
    "THREE_MIRRORED_REPEAT_WRAPPING",
    "THREE_REPEAT_WRAPPING",
    "alpha_test_keeps",
    "apply_texture_uv_transform",
    "compile_cutout_silhouettes",
    "cutout_silhouette_version_identity",
    "group_row_runs",
    "map_lattice_point_to_triangle_plane",
    "pixel_center_covered_top_left",
    "project_world_to_lattice",
    "sample_bilinear_alpha_mip0",
    "wrap_texel_index",
]
