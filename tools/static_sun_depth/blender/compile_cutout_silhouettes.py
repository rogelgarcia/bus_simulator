"""Deterministic bake-only cutout silhouette compilation without Blender APIs.

The compiler targets a fixed orthographic light texel lattice.  It builds an
explicit alpha mip chain, performs trilinear minification, and applies a bounded
major-axis anisotropic kernel.  The kernel is deliberately versioned: native GL
anisotropic filtering is implementation-dependent, so runtime equivalence must
still be established by retained spatial parity evidence.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
import struct
from typing import Callable, Iterable, Sequence


THREE_REPEAT_WRAPPING = 1000
THREE_CLAMP_TO_EDGE_WRAPPING = 1001
THREE_MIRRORED_REPEAT_WRAPPING = 1002

SIDE_FRONT = "front"
SIDE_BACK = "back"
SIDE_DOUBLE = "double"

CUTOUT_SILHOUETTE_VERSION = "ai531-cutout-silhouette-proxy-v2"
_VERSION_IDENTITY_BASE = {
    "alphaSampling": "three-map-transform-flipy-wrap-trilinear-generated-alpha-mips-v2",
    "filterScope": "rgba8-alpha-box-mips-major-axis-eight-tap-anisotropic-kernel-v1",
    "mipGeneration": "power-of-two-two-by-two-unorm8-round-half-up-v1",
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

CUTOUT_CANDIDATE_VERSION = "ai531-cutout-full-lattice-candidates-v1"
CUTOUT_CANDIDATE_RECORD = struct.Struct("<IIfIffffff")
CUTOUT_CANDIDATE_RECORD_BYTE_LENGTH = CUTOUT_CANDIDATE_RECORD.size
_CANDIDATE_VERSION_IDENTITY_BASE = {
    "chunking": "row-major-tile-then-source-triangle-bounded-record-chunks-v1",
    "pixelCoverage": "webgl-bottom-left-pixel-center-top-left-f64-v1",
    "recordEncoding": "u32-x-u32-y-f32-depth-u32-source-f32-uv-dx-dy-le-v1",
    "schema": CUTOUT_CANDIDATE_VERSION,
    "sourceTriangle": "authenticated-source-table-index-v1",
}
CUTOUT_CANDIDATE_VERSION_SHA256 = hashlib.sha256(
    json.dumps(
        _CANDIDATE_VERSION_IDENTITY_BASE,
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
    generate_mipmaps: bool = True
    anisotropy: int = 8

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
        if not isinstance(self.generate_mipmaps, bool):
            raise TypeError("texture generate_mipmaps must be boolean")
        if (isinstance(self.anisotropy, bool)
                or not isinstance(self.anisotropy, int)
                or self.anisotropy < 1
                or self.anisotropy > 16):
            raise ValueError("texture anisotropy must be an integer from 1 through 16")
        object.__setattr__(self, "pixels", bytes(pixels))
        object.__setattr__(self, "matrix", matrix)


@dataclass(frozen=True)
class AlphaMipLevel:
    """One generated unsigned-byte alpha mip in bottom-left row order."""

    width: int
    height: int
    pixels: Sequence[int] | bytes | bytearray | memoryview

    def __post_init__(self) -> None:
        _require_positive_integer(self.width, "alpha mip width")
        _require_positive_integer(self.height, "alpha mip height")
        if any(isinstance(value, bool) or not isinstance(value, int) for value in self.pixels):
            raise TypeError("Alpha mip samples must be integer bytes")
        pixels = tuple(self.pixels)
        if len(pixels) != self.width * self.height:
            raise ValueError("Alpha mip byte count must equal width times height")
        if any(value < 0 or value > 255 for value in pixels):
            raise ValueError("Alpha mip samples must be unsigned bytes")
        object.__setattr__(self, "pixels", bytes(pixels))


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


def cutout_candidate_version_identity() -> dict[str, object]:
    """Return the canonical identity for bounded full-lattice candidate chunks."""

    return {
        **_CANDIDATE_VERSION_IDENTITY_BASE,
        "recordByteLength": CUTOUT_CANDIDATE_RECORD_BYTE_LENGTH,
        "sha256": CUTOUT_CANDIDATE_VERSION_SHA256,
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

    transformed = _transformed_texture_uv(texture, uv)
    mip = AlphaMipLevel(texture.width, texture.height, texture.pixels)
    return _sample_bilinear_alpha_level(texture, mip, transformed)


def generate_alpha_mip_chain(texture: AlphaTextureMip0) -> tuple[AlphaMipLevel, ...]:
    """Generate a canonical UNORM8 alpha mip chain from authenticated mip 0."""

    levels = [AlphaMipLevel(texture.width, texture.height, texture.pixels)]
    if not texture.generate_mipmaps:
        return tuple(levels)
    if not _is_power_of_two(texture.width) or not _is_power_of_two(texture.height):
        raise ValueError("deterministic generated alpha mips require power-of-two dimensions")
    while levels[-1].width > 1 or levels[-1].height > 1:
        source = levels[-1]
        width = max(1, source.width // 2)
        height = max(1, source.height // 2)
        pixels: list[int] = []
        for row in range(height):
            source_rows = (row * 2,) if source.height == 1 else (row * 2, row * 2 + 1)
            for column in range(width):
                source_columns = ((column * 2,) if source.width == 1
                                  else (column * 2, column * 2 + 1))
                taps = [
                    source.pixels[source_row * source.width + source_column]
                    for source_row in source_rows
                    for source_column in source_columns
                ]
                pixels.append(math.floor(sum(taps) / len(taps) + 0.5))
        levels.append(AlphaMipLevel(width, height, pixels))
    return tuple(levels)


def sample_trilinear_alpha(
    texture: AlphaTextureMip0,
    mip_chain: Sequence[AlphaMipLevel],
    uv: Sequence[float],
    lod: float,
) -> float:
    """Sample explicit alpha mips using clamped LINEAR_MIPMAP_LINEAR semantics."""

    return _sample_trilinear_alpha_transformed(
        texture,
        _validated_mip_chain(texture, mip_chain),
        _transformed_texture_uv(texture, uv),
        lod,
    )


def texture_uv_gradients(
    projected_vertices: Sequence[Sequence[float]],
    uvs: Sequence[Sequence[float]],
    texture: AlphaTextureMip0,
) -> tuple[Vec2, Vec2]:
    """Return post-map-transform normalized UV derivatives per light texel."""

    projected = tuple(
        _finite_tuple(vertex, 2, f"projected vertex {index}")
        for index, vertex in enumerate(projected_vertices)
    )
    source_uvs = tuple(
        _finite_tuple(uv, 2, f"triangle UV {index}")
        for index, uv in enumerate(uvs)
    )
    if len(projected) != 3 or len(source_uvs) != 3:
        raise ValueError("texture gradients require exactly three projected vertices and UVs")
    du_dx, du_dy = _affine_scalar_gradients(projected, tuple(uv[0] for uv in source_uvs))
    dv_dx, dv_dy = _affine_scalar_gradients(projected, tuple(uv[1] for uv in source_uvs))
    matrix = texture.matrix
    transformed_u_dx = matrix[0] * du_dx + matrix[3] * dv_dx
    transformed_u_dy = matrix[0] * du_dy + matrix[3] * dv_dy
    transformed_v_dx = matrix[1] * du_dx + matrix[4] * dv_dx
    transformed_v_dy = matrix[1] * du_dy + matrix[4] * dv_dy
    if texture.flip_y:
        transformed_v_dx = -transformed_v_dx
        transformed_v_dy = -transformed_v_dy
    return (
        (_zero_normalized(transformed_u_dx), _zero_normalized(transformed_v_dx)),
        (_zero_normalized(transformed_u_dy), _zero_normalized(transformed_v_dy)),
    )


def sample_deterministic_anisotropic_alpha(
    texture: AlphaTextureMip0,
    mip_chain: Sequence[AlphaMipLevel],
    uv: Sequence[float],
    uv_gradients: Sequence[Sequence[float]],
) -> float:
    """Sample a versioned bounded major-axis anisotropic alpha footprint."""

    levels = _validated_mip_chain(texture, mip_chain)
    footprint = deterministic_anisotropic_footprint(texture, uv_gradients)
    return sample_diagnostic_anisotropic_alpha(
        texture,
        levels,
        uv,
        uv_gradients,
        tap_count=footprint["tapCount"],
        lod_bias=0.0,
        major_span_scale=1.0,
    )


def deterministic_anisotropic_footprint(
    texture: AlphaTextureMip0,
    uv_gradients: Sequence[Sequence[float]],
) -> dict[str, float | int]:
    """Describe the fixed V2 anisotropic footprint without sampling it."""

    gradients = _validated_uv_gradients(uv_gradients)
    texel_gradients = (
        (gradients[0][0] * texture.width, gradients[0][1] * texture.height),
        (gradients[1][0] * texture.width, gradients[1][1] * texture.height),
    )
    lengths = tuple(math.hypot(*gradient) for gradient in texel_gradients)
    major_index = 0 if lengths[0] >= lengths[1] else 1
    minor_index = 1 - major_index
    major_length = lengths[major_index]
    minor_length = lengths[minor_index]
    ratio = major_length / max(minor_length, 1e-12)
    tap_count = min(texture.anisotropy, max(1, math.ceil(ratio)))
    footprint = max(minor_length, major_length / tap_count)
    lod = max(0.0, math.log2(max(footprint, 1.0)))
    return {
        "lod": lod,
        "majorGradientIndex": major_index,
        "majorLengthTexels": major_length,
        "minorLengthTexels": minor_length,
        "tapCount": tap_count,
    }


def sample_diagnostic_anisotropic_alpha(
    texture: AlphaTextureMip0,
    mip_chain: Sequence[AlphaMipLevel],
    uv: Sequence[float],
    uv_gradients: Sequence[Sequence[float]],
    *,
    tap_count: int,
    lod_bias: float = 0.0,
    major_span_scale: float = 1.0,
    footprint_mode: str = "axis",
) -> float:
    """Evaluate an explicit diagnostic kernel; never a certification identity."""

    levels = _validated_mip_chain(texture, mip_chain)
    gradients = _validated_uv_gradients(uv_gradients)
    if (isinstance(tap_count, bool) or not isinstance(tap_count, int)
            or tap_count < 1 or tap_count > 16):
        raise ValueError("diagnostic anisotropic tap_count must be from 1 through 16")
    bias = _finite_float(lod_bias, "diagnostic anisotropic LOD bias")
    span_scale = _finite_float(
        major_span_scale, "diagnostic anisotropic major span scale"
    )
    if span_scale <= 0.0 or span_scale > 2.0:
        raise ValueError("diagnostic anisotropic major span scale must be in (0, 2]")
    if footprint_mode not in ("axis", "svd"):
        raise ValueError("diagnostic anisotropic footprint_mode must be axis or svd")
    center = _transformed_texture_uv(texture, uv)
    texel_gradients = (
        (gradients[0][0] * texture.width, gradients[0][1] * texture.height),
        (gradients[1][0] * texture.width, gradients[1][1] * texture.height),
    )
    if footprint_mode == "axis":
        lengths = tuple(math.hypot(*gradient) for gradient in texel_gradients)
        major_index = 0 if lengths[0] >= lengths[1] else 1
        minor_index = 1 - major_index
        major_length = lengths[major_index]
        minor_length = lengths[minor_index]
        major_uv = gradients[major_index]
    else:
        xx = texel_gradients[0][0] ** 2 + texel_gradients[1][0] ** 2
        xy = (
            texel_gradients[0][0] * texel_gradients[0][1]
            + texel_gradients[1][0] * texel_gradients[1][1]
        )
        yy = texel_gradients[0][1] ** 2 + texel_gradients[1][1] ** 2
        discriminant = math.sqrt(max(0.0, (xx - yy) ** 2 + 4.0 * xy ** 2))
        major_eigenvalue = max(0.0, (xx + yy + discriminant) * 0.5)
        minor_eigenvalue = max(0.0, (xx + yy - discriminant) * 0.5)
        major_length = math.sqrt(major_eigenvalue)
        minor_length = math.sqrt(minor_eigenvalue)
        if abs(xy) > 1e-30:
            eigenvector = (xy, major_eigenvalue - xx)
        elif xx >= yy:
            eigenvector = (1.0, 0.0)
        else:
            eigenvector = (0.0, 1.0)
        eigenvector_length = math.hypot(*eigenvector)
        eigenvector = (
            eigenvector[0] / eigenvector_length,
            eigenvector[1] / eigenvector_length,
        )
        major_uv = (
            eigenvector[0] * major_length / texture.width,
            eigenvector[1] * major_length / texture.height,
        )
    footprint = max(minor_length, major_length / tap_count)
    lod = max(0.0, math.log2(max(footprint, 1.0)) + bias)
    samples = []
    for tap in range(tap_count):
        offset = ((tap + 0.5) / tap_count - 0.5) * span_scale
        sample_uv = (
            center[0] + major_uv[0] * offset,
            center[1] + major_uv[1] * offset,
        )
        samples.append(_sample_trilinear_alpha_transformed(
            texture, levels, sample_uv, lod
        ))
    return sum(samples) / len(samples)


def _validated_uv_gradients(
    uv_gradients: Sequence[Sequence[float]],
) -> tuple[Vec2, Vec2]:
    gradients = tuple(
        _finite_tuple(gradient, 2, f"texture UV gradient {index}")
        for index, gradient in enumerate(uv_gradients)
    )
    if len(gradients) != 2:
        raise ValueError("texture UV gradients must contain dUV/dx and dUV/dy")
    return gradients  # type: ignore[return-value]


def _sample_bilinear_alpha_level(
    texture: AlphaTextureMip0,
    mip: AlphaMipLevel,
    transformed_uv: Sequence[float],
) -> float:
    transformed_u, transformed_v = _finite_tuple(
        transformed_uv, 2, "transformed texture UV"
    )
    texel_x = transformed_u * mip.width - 0.5
    texel_y = transformed_v * mip.height - 0.5
    x0 = math.floor(texel_x)
    y0 = math.floor(texel_y)
    fraction_x = texel_x - x0
    fraction_y = texel_y - y0
    x1 = x0 + 1
    y1 = y0 + 1

    def fetch(x: int, y: int) -> float:
        resolved_x = wrap_texel_index(x, mip.width, texture.wrap_s)
        resolved_y = wrap_texel_index(y, mip.height, texture.wrap_t)
        return mip.pixels[resolved_y * mip.width + resolved_x] / 255.0

    lower = _mix(fetch(x0, y0), fetch(x1, y0), fraction_x)
    upper = _mix(fetch(x0, y1), fetch(x1, y1), fraction_x)
    return _mix(lower, upper, fraction_y)


def _sample_trilinear_alpha_transformed(
    texture: AlphaTextureMip0,
    mip_chain: Sequence[AlphaMipLevel],
    transformed_uv: Sequence[float],
    lod: float,
) -> float:
    lod_value = _finite_float(lod, "texture LOD")
    clamped = min(max(lod_value, 0.0), len(mip_chain) - 1)
    lower_index = math.floor(clamped)
    upper_index = min(lower_index + 1, len(mip_chain) - 1)
    fraction = clamped - lower_index
    lower = _sample_bilinear_alpha_level(
        texture, mip_chain[lower_index], transformed_uv
    )
    upper = _sample_bilinear_alpha_level(
        texture, mip_chain[upper_index], transformed_uv
    )
    return _mix(lower, upper, fraction)


def _transformed_texture_uv(texture: AlphaTextureMip0, uv: Sequence[float]) -> Vec2:
    transformed_u, transformed_v = apply_texture_uv_transform(uv, texture.matrix)
    if texture.flip_y:
        transformed_v = 1.0 - transformed_v
    return transformed_u, transformed_v


def _validated_mip_chain(
    texture: AlphaTextureMip0,
    mip_chain: Sequence[AlphaMipLevel],
) -> tuple[AlphaMipLevel, ...]:
    levels = tuple(mip_chain)
    if not levels or any(not isinstance(level, AlphaMipLevel) for level in levels):
        raise TypeError("alpha mip chain must contain AlphaMipLevel instances")
    expected_width = texture.width
    expected_height = texture.height
    for index, level in enumerate(levels):
        if level.width != expected_width or level.height != expected_height:
            raise ValueError(f"alpha mip level {index} dimensions are noncanonical")
        expected_width = max(1, expected_width // 2)
        expected_height = max(1, expected_height // 2)
    if texture.generate_mipmaps and (levels[-1].width != 1 or levels[-1].height != 1):
        raise ValueError("generated alpha mip chain must terminate at 1x1")
    if not texture.generate_mipmaps and len(levels) != 1:
        raise ValueError("texture with mip generation disabled must contain only mip 0")
    return levels


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


def emit_cutout_candidate_chunks(
    triangles: Iterable[CutoutTriangle],
    texture: AlphaTextureMip0,
    lattice: OrthographicLightLattice,
    tile_size: Sequence[int],
    write_chunk: Callable[[int, int, bytes, int], None],
    *,
    maximum_chunk_records: int = 262_144,
) -> dict[str, object]:
    """Emit every geometrically covered texel candidate in bounded tile chunks.

    Candidate coverage is purely geometric. The build browser applies the
    authenticated texture transform and makes the exact native textureGrad
    alpha decision. Records are grouped by production tile so consumers can
    resolve nearest accepted depth with one bounded tile buffer.
    """

    if not callable(write_chunk):
        raise TypeError("candidate chunk writer must be callable")
    if (
        not isinstance(tile_size, Sequence)
        or len(tile_size) != 2
        or any(
            isinstance(value, bool) or not isinstance(value, int) or value <= 0
            for value in tile_size
        )
    ):
        raise TypeError("candidate tile size must contain two positive integers")
    if (
        isinstance(maximum_chunk_records, bool)
        or not isinstance(maximum_chunk_records, int)
        or maximum_chunk_records <= 0
        or maximum_chunk_records > 262_144
    ):
        raise ValueError("candidate chunk bound must be 1 through 262144 records")
    tile_width, tile_height = tile_size
    if lattice.width % tile_width != 0 or lattice.height % tile_height != 0:
        raise ValueError("candidate tile size must exactly divide the lattice")
    source_triangles = tuple(triangles)
    if any(not isinstance(triangle, CutoutTriangle) for triangle in source_triangles):
        raise TypeError("triangles must contain CutoutTriangle instances")
    if len(source_triangles) > 0xFFFFFFFF:
        raise ValueError("candidate source triangle count exceeds u32")

    projected_records = []
    stats: dict[str, object] = {
        "boundingPixelCount": 0,
        "candidateCount": 0,
        "chunkCount": 0,
        "culledTriangleCount": 0,
        "degenerateTriangleCount": 0,
        "rasterizedTriangleCount": 0,
        "sourceTriangleCount": len(source_triangles),
        "tileCount": (lattice.width // tile_width) * (lattice.height // tile_height),
        "versionIdentitySha256": CUTOUT_CANDIDATE_VERSION_SHA256,
    }
    for source_index, triangle in enumerate(source_triangles):
        projected3 = tuple(
            project_world_to_lattice(vertex, lattice)
            for vertex in triangle.vertices
        )
        projected2 = tuple((vertex[0], vertex[1]) for vertex in projected3)
        area = _edge(projected2[0], projected2[1], projected2[2])
        if area == 0.0:
            stats["degenerateTriangleCount"] += 1  # type: ignore[operator]
            continue
        front_facing = area > 0.0
        if (
            (triangle.side == SIDE_FRONT and not front_facing)
            or (triangle.side == SIDE_BACK and front_facing)
        ):
            stats["culledTriangleCount"] += 1  # type: ignore[operator]
            continue
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
        if minimum_x > maximum_x or minimum_y > maximum_y:
            continue
        gradients = texture_uv_gradients(projected2, triangle.uvs, texture)
        projected_records.append((
            source_index,
            triangle,
            projected2,
            projected3,
            gradients,
            minimum_x,
            maximum_x,
            minimum_y,
            maximum_y,
        ))
        stats["rasterizedTriangleCount"] += 1  # type: ignore[operator]

    tile_count_x = lattice.width // tile_width
    tile_count_y = lattice.height // tile_height
    tile_stats = []
    for tile_y in range(tile_count_y):
        for tile_x in range(tile_count_x):
            tile_index = tile_y * tile_count_x + tile_x
            tile_minimum_x = tile_x * tile_width
            tile_maximum_x = tile_minimum_x + tile_width - 1
            tile_minimum_y = tile_y * tile_height
            tile_maximum_y = tile_minimum_y + tile_height - 1
            chunk = bytearray()
            chunk_index = 0
            chunk_record_count = 0
            tile_candidate_count = 0
            tile_bounding_count = 0
            for (
                source_index,
                triangle,
                projected2,
                projected3,
                gradients,
                triangle_minimum_x,
                triangle_maximum_x,
                triangle_minimum_y,
                triangle_maximum_y,
            ) in projected_records:
                minimum_x = max(tile_minimum_x, triangle_minimum_x)
                maximum_x = min(tile_maximum_x, triangle_maximum_x)
                minimum_y = max(tile_minimum_y, triangle_minimum_y)
                maximum_y = min(tile_maximum_y, triangle_maximum_y)
                if minimum_x > maximum_x or minimum_y > maximum_y:
                    continue
                for row in range(minimum_y, maximum_y + 1):
                    for column in range(minimum_x, maximum_x + 1):
                        tile_bounding_count += 1
                        if not pixel_center_covered_top_left(
                            projected2,
                            column,
                            row,
                        ):
                            continue
                        weights = _barycentric_weights(
                            (column + 0.5, row + 0.5),
                            projected2,
                        )
                        uv = (
                            sum(
                                weights[index] * triangle.uvs[index][0]
                                for index in range(3)
                            ),
                            sum(
                                weights[index] * triangle.uvs[index][1]
                                for index in range(3)
                            ),
                        )
                        light_depth = sum(
                            weights[index] * projected3[index][2]
                            for index in range(3)
                        )
                        chunk.extend(CUTOUT_CANDIDATE_RECORD.pack(
                            column,
                            row,
                            light_depth,
                            source_index,
                            uv[0],
                            uv[1],
                            gradients[0][0],
                            gradients[0][1],
                            gradients[1][0],
                            gradients[1][1],
                        ))
                        chunk_record_count += 1
                        tile_candidate_count += 1
                        if chunk_record_count == maximum_chunk_records:
                            write_chunk(
                                tile_index,
                                chunk_index,
                                bytes(chunk),
                                chunk_record_count,
                            )
                            chunk.clear()
                            chunk_index += 1
                            chunk_record_count = 0
            if chunk_record_count:
                write_chunk(
                    tile_index,
                    chunk_index,
                    bytes(chunk),
                    chunk_record_count,
                )
                chunk_index += 1
            stats["boundingPixelCount"] += tile_bounding_count  # type: ignore[operator]
            stats["candidateCount"] += tile_candidate_count  # type: ignore[operator]
            stats["chunkCount"] += chunk_index  # type: ignore[operator]
            tile_stats.append({
                "candidateCount": tile_candidate_count,
                "chunkCount": chunk_index,
                "coordinates": [tile_x, tile_y],
                "tileIndex": tile_index,
            })
    return {
        **stats,
        "tileStats": tile_stats,
    }


def compile_cutout_silhouettes(
    triangles: Iterable[CutoutTriangle],
    texture: AlphaTextureMip0,
    lattice: OrthographicLightLattice,
    alpha_test: float,
    *,
    sample_pixels: Iterable[tuple[int, int]] | None = None,
) -> dict[str, object]:
    """Compile accepted texel centers into deterministic plane-preserving quads.

    ``sample_pixels`` restricts diagnostic compilation to authenticated sparse
    lattice coordinates without changing their footprint, UV, LOD, or depth.
    Production compilation leaves it unset and evaluates the complete lattice.
    """

    threshold = _finite_float(alpha_test, "alpha test")
    if threshold < 0.0 or threshold > 1.0:
        raise ValueError("alpha test must be in the inclusive unit interval")
    source_triangles = tuple(triangles)
    if any(not isinstance(triangle, CutoutTriangle) for triangle in source_triangles):
        raise TypeError("triangles must contain CutoutTriangle instances")

    mip_chain = generate_alpha_mip_chain(texture)
    restricted_pixels = _canonical_sample_pixels(sample_pixels, lattice)
    restricted_diagnostics = (
        None
        if restricted_pixels is None
        else {pixel: [] for pixel in restricted_pixels}
    )
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
        "mipLevelCount": len(mip_chain),
        "maximumAnisotropy": texture.anisotropy,
        "overlappingKeptPixelCount": 0,
        "proxyTriangleCount": 0,
        "proxyVertexCount": 0,
        "rasterizedTriangleCount": 0,
        "runCount": 0,
        "sourceTriangleCount": len(source_triangles),
        "uniqueKeptPixelCount": 0,
        "restrictedSamplePixelCount": (
            0 if restricted_pixels is None else len(restricted_pixels)
        ),
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
        gradients = texture_uv_gradients(projected2, triangle.uvs, texture)

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
            candidates = (
                (
                    (column, row)
                    for row in range(minimum_y, maximum_y + 1)
                    for column in range(minimum_x, maximum_x + 1)
                )
                if restricted_pixels is None
                else (
                    (column, row)
                    for column, row in restricted_pixels
                    if minimum_x <= column <= maximum_x
                    and minimum_y <= row <= maximum_y
                )
            )
            for column, row in candidates:
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
                coverage = sample_deterministic_anisotropic_alpha(
                    texture, mip_chain, uv, gradients
                )
                if restricted_diagnostics is not None:
                    light_depth = sum(
                        weights[index] * projected3[index][2]
                        for index in range(3)
                    )
                    restricted_diagnostics[(column, row)].append({
                        "coverage": coverage,
                        "lightDepthMeters": light_depth,
                        "samplingFootprint": deterministic_anisotropic_footprint(
                            texture, gradients
                        ),
                        "sourceTriangleIndex": source_index,
                        "uv": list(uv),
                        "uvGradients": [list(gradient) for gradient in gradients],
                    })
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
        "restrictedSampleDiagnostics": (
            None
            if restricted_diagnostics is None
            else [
                {
                    "candidates": sorted(
                        restricted_diagnostics[pixel],
                        key=lambda entry: (
                            entry["lightDepthMeters"],
                            entry["sourceTriangleIndex"],
                        ),
                    ),
                    "x": pixel[0],
                    "y": pixel[1],
                }
                for pixel in restricted_pixels
            ]
        ),
        "runs": run_records,
        "sampleRestriction": (
            None
            if restricted_pixels is None
            else {
                "pixelCount": len(restricted_pixels),
                "policy": "authenticated-explicit-lattice-pixels-only-v1",
            }
        ),
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


def _affine_scalar_gradients(
    vertices: Sequence[Vec2], values: Sequence[float]
) -> tuple[float, float]:
    if len(vertices) != 3 or len(values) != 3:
        raise ValueError("affine gradients require exactly three vertices and values")
    x0, y0 = vertices[0]
    x1, y1 = vertices[1]
    x2, y2 = vertices[2]
    value0, value1, value2 = values
    denominator = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if denominator == 0.0:
        raise ValueError("affine gradients require a nondegenerate triangle")
    return (
        ((value1 - value0) * (y2 - y0) - (value2 - value0) * (y1 - y0))
        / denominator,
        ((x1 - x0) * (value2 - value0) - (x2 - x0) * (value1 - value0))
        / denominator,
    )


def _canonical_sample_pixels(
    sample_pixels: Iterable[tuple[int, int]] | None,
    lattice: OrthographicLightLattice,
) -> tuple[tuple[int, int], ...] | None:
    if sample_pixels is None:
        return None
    canonical = []
    for index, pixel in enumerate(sample_pixels):
        if not isinstance(pixel, Sequence) or len(pixel) != 2:
            raise TypeError(f"sample pixel {index} must contain x and y")
        x, y = pixel
        if (isinstance(x, bool) or isinstance(y, bool)
                or not isinstance(x, int) or not isinstance(y, int)):
            raise TypeError(f"sample pixel {index} coordinates must be integers")
        if x < 0 or x >= lattice.width or y < 0 or y >= lattice.height:
            raise ValueError(f"sample pixel {index} is outside the light lattice")
        canonical.append((x, y))
    if len(set(canonical)) != len(canonical):
        raise ValueError("sample pixels must be unique")
    return tuple(sorted(canonical, key=lambda pixel: (pixel[1], pixel[0])))


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


def _is_power_of_two(value: int) -> bool:
    return value > 0 and (value & (value - 1)) == 0


__all__ = [
    "AlphaTextureMip0",
    "AlphaMipLevel",
    "CUTOUT_CANDIDATE_RECORD",
    "CUTOUT_CANDIDATE_RECORD_BYTE_LENGTH",
    "CUTOUT_CANDIDATE_VERSION",
    "CUTOUT_CANDIDATE_VERSION_SHA256",
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
    "cutout_candidate_version_identity",
    "cutout_silhouette_version_identity",
    "deterministic_anisotropic_footprint",
    "emit_cutout_candidate_chunks",
    "generate_alpha_mip_chain",
    "group_row_runs",
    "map_lattice_point_to_triangle_plane",
    "pixel_center_covered_top_left",
    "project_world_to_lattice",
    "sample_bilinear_alpha_mip0",
    "sample_deterministic_anisotropic_alpha",
    "sample_diagnostic_anisotropic_alpha",
    "sample_trilinear_alpha",
    "texture_uv_gradients",
    "wrap_texel_index",
]
