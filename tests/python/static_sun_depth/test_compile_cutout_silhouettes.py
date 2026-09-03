"""Pure-Python tests for the bake-only cutout silhouette compiler."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import struct
import sys
import unittest


REPO_ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = (
    REPO_ROOT
    / "tools"
    / "static_sun_depth"
    / "blender"
    / "compile_cutout_silhouettes.py"
)
SPEC = importlib.util.spec_from_file_location("compile_cutout_silhouettes", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load compile_cutout_silhouettes.py")
silhouette = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = silhouette
SPEC.loader.exec_module(silhouette)


def identity_lattice(width: int = 2, height: int = 2):
    return silhouette.OrthographicLightLattice(
        origin_world=(0.0, 0.0, 0.0),
        right_axis_world=(1.0, 0.0, 0.0),
        up_axis_world=(0.0, 1.0, 0.0),
        depth_axis_world=(0.0, 0.0, 1.0),
        bounds_min_light=(0.0, 0.0),
        texel_size=(1.0, 1.0),
        width=width,
        height=height,
    )


def solid_texture(alpha: int = 255):
    return silhouette.AlphaTextureMip0(width=1, height=1, pixels=bytes([alpha]))


def triangle_at_depth(depth_offset: float = 0.0, *, reverse: bool = False, side: str = "double"):
    vertices = [
        (0.0, 0.0, depth_offset),
        (2.0, 0.0, depth_offset + 2.0),
        (0.0, 2.0, depth_offset + 4.0),
    ]
    uvs = [(0.5, 0.5)] * 3
    if reverse:
        vertices[1], vertices[2] = vertices[2], vertices[1]
        uvs[1], uvs[2] = uvs[2], uvs[1]
    return silhouette.CutoutTriangle(vertices=vertices, uvs=uvs, side=side)


class CutoutSilhouetteCompilerTests(unittest.TestCase):
    def test_full_lattice_candidates_are_bounded_tiled_and_binary_stable(self):
        chunks = []
        stats = silhouette.emit_cutout_candidate_chunks(
            [triangle_at_depth()],
            solid_texture(),
            identity_lattice(),
            (1, 1),
            lambda tile, chunk, data, count: chunks.append(
                (tile, chunk, data, count)
            ),
            maximum_chunk_records=2,
        )

        self.assertEqual(stats["candidateCount"], 3)
        self.assertEqual(stats["chunkCount"], 3)
        self.assertEqual(
            [(tile, chunk, count) for tile, chunk, _, count in chunks],
            [(0, 0, 1), (1, 0, 1), (2, 0, 1)],
        )
        records = [
            struct.unpack("<IIfIffffff", data)
            for _, _, data, _ in chunks
        ]
        self.assertEqual(
            [(record[0], record[1], record[3]) for record in records],
            [(0, 0, 0), (1, 0, 0), (0, 1, 0)],
        )
        self.assertAlmostEqual(records[0][2], 1.5)
        self.assertEqual(records[0][4:6], (0.5, 0.5))
        self.assertEqual(
            silhouette.CUTOUT_CANDIDATE_RECORD_BYTE_LENGTH,
            len(chunks[0][2]),
        )
        self.assertEqual(
            silhouette.cutout_candidate_version_identity()["sha256"],
            silhouette.CUTOUT_CANDIDATE_VERSION_SHA256,
        )

    def test_generated_alpha_mips_use_canonical_unorm8_box_reduction(self):
        texture = silhouette.AlphaTextureMip0(
            width=4,
            height=4,
            pixels=bytes([
                0, 0, 64, 64,
                0, 0, 64, 64,
                128, 128, 255, 255,
                128, 128, 255, 255,
            ]),
        )

        levels = silhouette.generate_alpha_mip_chain(texture)

        self.assertEqual([(level.width, level.height) for level in levels], [
            (4, 4),
            (2, 2),
            (1, 1),
        ])
        self.assertEqual(levels[1].pixels, bytes([0, 64, 128, 255]))
        self.assertEqual(levels[2].pixels, bytes([112]))
        self.assertEqual(
            levels,
            silhouette.generate_alpha_mip_chain(texture),
        )

    def test_trilinear_sampling_blends_explicit_adjacent_alpha_mips(self):
        texture = silhouette.AlphaTextureMip0(
            width=2,
            height=2,
            pixels=bytes([0, 255, 255, 255]),
        )
        levels = silhouette.generate_alpha_mip_chain(texture)

        self.assertEqual(levels[1].pixels, bytes([191]))
        self.assertAlmostEqual(
            silhouette.sample_trilinear_alpha(
                texture, levels, (0.25, 0.25), 0.5
            ),
            191 / 510,
        )
        self.assertEqual(
            silhouette.sample_trilinear_alpha(
                texture, levels, (0.25, 0.25), 100.0
            ),
            191 / 255,
        )

    def test_transformed_gradients_and_bounded_anisotropic_kernel_are_explicit(self):
        gradient_texture = silhouette.AlphaTextureMip0(
            width=1,
            height=1,
            pixels=bytes([255]),
            matrix=(2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 1.0),
            flip_y=True,
        )
        gradients = silhouette.texture_uv_gradients(
            ((0.0, 0.0), (2.0, 0.0), (0.0, 4.0)),
            ((0.0, 0.0), (1.0, 0.0), (0.0, 1.0)),
            gradient_texture,
        )
        self.assertEqual(gradients, ((1.0, 0.0), (0.0, -0.75)))

        stripe_pixels = bytes([255, 255, 255, 255, 0, 0, 0, 0])
        anisotropic = silhouette.AlphaTextureMip0(
            width=8,
            height=1,
            pixels=stripe_pixels,
            anisotropy=8,
        )
        isotropic = silhouette.AlphaTextureMip0(
            width=8,
            height=1,
            pixels=stripe_pixels,
            anisotropy=1,
        )
        anisotropic_coverage = silhouette.sample_deterministic_anisotropic_alpha(
            anisotropic,
            silhouette.generate_alpha_mip_chain(anisotropic),
            (0.5, 0.5),
            ((1.0, 0.0), (0.0, 0.0)),
        )
        isotropic_coverage = silhouette.sample_deterministic_anisotropic_alpha(
            isotropic,
            silhouette.generate_alpha_mip_chain(isotropic),
            (0.5, 0.5),
            ((1.0, 0.0), (0.0, 0.0)),
        )
        self.assertAlmostEqual(anisotropic_coverage, 0.5)
        self.assertEqual(isotropic_coverage, 128 / 255)
        self.assertNotEqual(anisotropic_coverage, isotropic_coverage)
        footprint = silhouette.deterministic_anisotropic_footprint(
            anisotropic,
            ((1.0, 0.0), (0.0, 0.0)),
        )
        self.assertEqual(footprint["tapCount"], 8)
        self.assertEqual(footprint["lod"], 0.0)
        self.assertEqual(
            anisotropic_coverage,
            silhouette.sample_diagnostic_anisotropic_alpha(
                anisotropic,
                silhouette.generate_alpha_mip_chain(anisotropic),
                (0.5, 0.5),
                ((1.0, 0.0), (0.0, 0.0)),
                tap_count=8,
            ),
        )
        self.assertAlmostEqual(
            anisotropic_coverage,
            silhouette.sample_diagnostic_anisotropic_alpha(
                anisotropic,
                silhouette.generate_alpha_mip_chain(anisotropic),
                (0.5, 0.5),
                ((1.0, 0.0), (0.0, 0.0)),
                tap_count=8,
                footprint_mode="svd",
            ),
        )

    def test_127_discards_128_keeps_and_threshold_equality_survives(self):
        texture = silhouette.AlphaTextureMip0(
            width=2,
            height=1,
            pixels=bytes([127, 128]),
        )
        below = silhouette.sample_bilinear_alpha_mip0(texture, (0.25, 0.5))
        above = silhouette.sample_bilinear_alpha_mip0(texture, (0.75, 0.5))
        exact_threshold = silhouette.sample_bilinear_alpha_mip0(
            texture, (0.5, 0.5)
        )

        self.assertFalse(silhouette.alpha_test_keeps(below, 0.5))
        self.assertTrue(silhouette.alpha_test_keeps(above, 0.5))
        self.assertEqual(exact_threshold, 0.5)
        self.assertTrue(silhouette.alpha_test_keeps(exact_threshold, 0.5))
        self.assertTrue(silhouette.alpha_test_keeps(0.5, 0.5))

        discarded = silhouette.CutoutTriangle(
            vertices=((0, 0, 0), (2, 0, 0), (0, 2, 0)),
            uvs=((0.25, 0.5),) * 3,
        )
        kept = silhouette.CutoutTriangle(
            vertices=((0, 0, 0), (2, 0, 0), (0, 2, 0)),
            uvs=((0.75, 0.5),) * 3,
        )
        self.assertEqual(
            silhouette.compile_cutout_silhouettes(
                [discarded], texture, identity_lattice(), 0.5
            )["stats"]["keptPixelCount"],
            0,
        )
        self.assertEqual(
            silhouette.compile_cutout_silhouettes(
                [kept], texture, identity_lattice(), 0.5
            )["stats"]["keptPixelCount"],
            3,
        )

    def test_column_major_uv_transform_flip_and_asymmetric_wrap_modes(self):
        matrix = (
            2.0,
            7.0,
            0.0,
            3.0,
            11.0,
            0.0,
            5.0,
            13.0,
            1.0,
        )
        self.assertEqual(
            silhouette.apply_texture_uv_transform((0.25, 0.5), matrix),
            (7.0, 20.25),
        )

        pixels = bytes([
            10,
            20,
            30,
            40,
            110,
            120,
            130,
            140,
        ])
        clamp = silhouette.AlphaTextureMip0(
            width=4,
            height=2,
            pixels=pixels,
            wrap_s=silhouette.THREE_CLAMP_TO_EDGE_WRAPPING,
        )
        repeat = silhouette.AlphaTextureMip0(
            width=4,
            height=2,
            pixels=pixels,
            wrap_s=silhouette.THREE_REPEAT_WRAPPING,
        )
        mirrored = silhouette.AlphaTextureMip0(
            width=4,
            height=2,
            pixels=pixels,
            wrap_s=silhouette.THREE_MIRRORED_REPEAT_WRAPPING,
        )
        flipped = silhouette.AlphaTextureMip0(
            width=4,
            height=2,
            pixels=pixels,
            flip_y=True,
        )

        self.assertAlmostEqual(
            silhouette.sample_bilinear_alpha_mip0(clamp, (-10.0, 0.25)),
            10 / 255,
        )
        self.assertAlmostEqual(
            silhouette.sample_bilinear_alpha_mip0(repeat, (1.125, 0.25)),
            10 / 255,
        )
        self.assertAlmostEqual(
            silhouette.sample_bilinear_alpha_mip0(repeat, (-0.125, 0.25)),
            40 / 255,
        )
        self.assertAlmostEqual(
            silhouette.sample_bilinear_alpha_mip0(mirrored, (1.125, 0.25)),
            40 / 255,
        )
        self.assertAlmostEqual(
            silhouette.sample_bilinear_alpha_mip0(mirrored, (-0.125, 0.25)),
            10 / 255,
        )
        self.assertAlmostEqual(
            silhouette.sample_bilinear_alpha_mip0(flipped, (0.125, 0.25)),
            110 / 255,
        )

    def test_top_left_boundary_pixels_have_exact_single_triangle_ownership(self):
        lower_left = ((0.0, 0.0), (2.0, 0.0), (0.0, 2.0))
        upper_right = ((2.0, 0.0), (2.0, 2.0), (0.0, 2.0))
        ownership = {}
        for row in range(2):
            for column in range(2):
                ownership[(column, row)] = sum((
                    silhouette.pixel_center_covered_top_left(
                        lower_left, column, row
                    ),
                    silhouette.pixel_center_covered_top_left(
                        upper_right, column, row
                    ),
                ))
        self.assertEqual(ownership, {
            (0, 0): 1,
            (1, 0): 1,
            (0, 1): 1,
            (1, 1): 1,
        })
        self.assertTrue(
            silhouette.pixel_center_covered_top_left(lower_left, 1, 0)
        )
        self.assertFalse(
            silhouette.pixel_center_covered_top_left(upper_right, 1, 0)
        )

    def test_sparse_sample_restriction_preserves_exact_global_pixel_footprints(self):
        triangle = silhouette.CutoutTriangle(
            vertices=((0, 0, 0), (4, 0, 0), (0, 4, 0)),
            uvs=((0.5, 0.5),) * 3,
        )
        complete = silhouette.compile_cutout_silhouettes(
            [triangle], solid_texture(), identity_lattice(4, 4), 0.5
        )
        sparse = silhouette.compile_cutout_silhouettes(
            [triangle],
            solid_texture(),
            identity_lattice(4, 4),
            0.5,
            sample_pixels=((0, 0), (2, 0), (0, 2), (3, 3)),
        )

        self.assertGreater(complete["stats"]["keptPixelCount"], 3)
        self.assertEqual(sparse["stats"]["keptPixelCount"], 3)
        self.assertEqual(sparse["stats"]["restrictedSamplePixelCount"], 4)
        self.assertEqual(sparse["sampleRestriction"], {
            "pixelCount": 4,
            "policy": "authenticated-explicit-lattice-pixels-only-v1",
        })
        self.assertEqual(
            {(run["xStart"], run["row"]) for run in sparse["runs"]},
            {(0, 0), (2, 0), (0, 2)},
        )

    def test_world_projection_uses_orthographic_axes_bounds_and_texel_pitch(self):
        lattice = silhouette.OrthographicLightLattice(
            origin_world=(10.0, 20.0, 30.0),
            right_axis_world=(0.0, 1.0, 0.0),
            up_axis_world=(-1.0, 0.0, 0.0),
            depth_axis_world=(0.0, 0.0, 1.0),
            bounds_min_light=(2.0, -4.0),
            texel_size=(0.5, 2.0),
            width=10,
            height=10,
        )
        self.assertEqual(
            silhouette.project_world_to_lattice((6.0, 23.0, 35.0), lattice),
            (2.0, 4.0, 5.0),
        )

    def test_row_runs_merge_only_adjacent_pixels_on_the_same_row(self):
        runs = silhouette.group_row_runs([
            (2, 1),
            (0, 1),
            (1, 1),
            (4, 1),
            (4, 1),
            (3, 2),
            (4, 2),
        ])
        self.assertEqual(runs, [
            silhouette.PixelRun(row=1, x_start=0, x_end_exclusive=3),
            silhouette.PixelRun(row=1, x_start=4, x_end_exclusive=5),
            silhouette.PixelRun(row=2, x_start=3, x_end_exclusive=5),
        ])

    def test_double_side_accepts_both_windings_and_single_side_culls(self):
        forward = triangle_at_depth(side=silhouette.SIDE_DOUBLE)
        reverse = triangle_at_depth(reverse=True, side=silhouette.SIDE_DOUBLE)
        forward_result = silhouette.compile_cutout_silhouettes(
            [forward], solid_texture(), identity_lattice(), 0.5
        )
        reverse_result = silhouette.compile_cutout_silhouettes(
            [reverse], solid_texture(), identity_lattice(), 0.5
        )
        self.assertEqual(forward_result["runs"], reverse_result["runs"])
        self.assertEqual(forward_result["stats"]["keptPixelCount"], 3)
        self.assertEqual(reverse_result["stats"]["keptPixelCount"], 3)

        front_culled = silhouette.compile_cutout_silhouettes(
            [triangle_at_depth(reverse=True, side=silhouette.SIDE_FRONT)],
            solid_texture(),
            identity_lattice(),
            0.5,
        )
        back_kept = silhouette.compile_cutout_silhouettes(
            [triangle_at_depth(reverse=True, side=silhouette.SIDE_BACK)],
            solid_texture(),
            identity_lattice(),
            0.5,
        )
        self.assertEqual(front_culled["stats"]["culledTriangleCount"], 1)
        self.assertEqual(front_culled["triangles"], [])
        self.assertEqual(back_kept["stats"]["keptPixelCount"], 3)

    def test_run_corners_preserve_each_overlapping_source_depth_plane(self):
        result = silhouette.compile_cutout_silhouettes(
            [triangle_at_depth(0.0), triangle_at_depth(10.0)],
            solid_texture(),
            identity_lattice(),
            0.5,
        )
        self.assertEqual(result["stats"]["keptPixelCount"], 6)
        self.assertEqual(result["stats"]["uniqueKeptPixelCount"], 3)
        self.assertEqual(result["stats"]["overlappingKeptPixelCount"], 3)
        self.assertEqual(result["stats"]["runCount"], 4)
        self.assertEqual(len(result["vertices"]), 16)

        for vertex in result["vertices"][:8]:
            self.assertAlmostEqual(vertex[2], vertex[0] + 2.0 * vertex[1])
        for vertex in result["vertices"][8:]:
            self.assertAlmostEqual(
                vertex[2], 10.0 + vertex[0] + 2.0 * vertex[1]
            )
        self.assertEqual(
            result,
            silhouette.compile_cutout_silhouettes(
                [triangle_at_depth(0.0), triangle_at_depth(10.0)],
                solid_texture(),
                identity_lattice(),
                0.5,
            ),
        )
        self.assertEqual(
            result["versionIdentity"]["sha256"],
            silhouette.CUTOUT_SILHOUETTE_VERSION_SHA256,
        )
        self.assertEqual(result["version"], "ai531-cutout-silhouette-proxy-v2")
        self.assertEqual(result["stats"]["mipLevelCount"], 1)
        self.assertEqual(result["stats"]["maximumAnisotropy"], 8)


if __name__ == "__main__":
    unittest.main()
