"""Depth-lattice captures support high sun without v4-only gradient-axis constraints."""
import math
import copy
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/static_sun_depth/blender'))
import production_static_sun as p


class NativeHighSun(unittest.TestCase):
    def test_native_region_proof_rejects_shifted_texel_or_enabled_comparison_sampler(self):
        request = {'interiorPixels': [1870, 1821], 'sourceShadowCapability': {'mapSizeTexels': [16384, 16384]}}
        plan = p._native_full_map_capture_plan(request, [4, 4])
        self.assertEqual(plan['region'], {'x': 7034, 'y': 7284, 'width': 1870, 'height': 1821})
        proof = {
            'plan': plan,
            'sourceProof': {'attachment': 'DEPTH_ATTACHMENT', 'attachmentDepthBits': 24,
                'attachmentMipLevel': 0, 'attachmentObjectIdentity': 'verified', 'attachmentObjectType': 'TEXTURE',
                'framebufferStatus': 'FRAMEBUFFER_COMPLETE', 'sampledTextureObjectIdentity': 'same-object-v1',
                'sourceTextureCompareMode': 34894, 'temporarySamplerCompareMode': 'NONE'},
            'stateRestoration': {'gl': 'verified', 'renderer': 'verified'},
            'transfer': {'component': 'depth-r-float32-v1', 'pixelPackBuffer': 'not-used',
                'synchronization': 'blocking-get-buffer-sub-data-v1', 'transformFeedbackPrimitive': 'POINTS',
                'vertexIndex': 'gl-instance-id-v1'}, 'implementation': {},
        }
        def check(value, expected=plan):
            return p._validate_native_cutout_field_capture(value, 13621080, 3405270, 1870, 1821,
                p.NATIVE_CUTOUT_FIELD_RECEIPT_SCHEMA, None, expected)
        check(proof)
        bad = copy.deepcopy(proof); bad['plan']['region']['x'] += 1
        with self.assertRaises(p.CompilerFailure): check(bad)
        bad = copy.deepcopy(proof); bad['sourceProof']['temporarySamplerCompareMode'] = 'COMPARE_REF_TO_TEXTURE'
        with self.assertRaises(p.CompilerFailure): check(bad)
        with self.assertRaises(p.CompilerFailure): check(proof, None)

    def test_high_sun_cache_has_native_texel_axes_and_right_handed_depth(self):
        for elevation in [8, 35, 55, 65, 80]:
            el = math.radians(elevation)
            direction = [math.cos(el)/math.sqrt(2), math.sin(el), math.cos(el)/math.sqrt(2)]
            right, up, depth, policy = p._production_sun_axes(direction)
            native = p._derive_three_r183_filter_axes(direction)
            self.assertAlmostEqual(abs(p._dot(right, native['rightAxisWorld'])), 1)
            self.assertAlmostEqual(abs(p._dot(up, native['upAxisWorld'])), 1)
            self.assertAlmostEqual(p._dot(p._cross(right, up), depth), 1)
            self.assertEqual(policy, 'least-aligned-world-axis-v1' if elevation < 40 else 'three-r183-source-lattice-v2')

    def setUp(self):
        a = math.sqrt(.5)
        self.basis = {'basis': {'rightAxisWorld': [a, a, 0], 'upAxisWorld': [-a, a, 0]},
                      'layout': {'layerCount': 1, 'tileCount': [1, 1]}, 'depth': {'maxDepthMeters': 10}}
        self.request = {'lightingProfileId': 'ai527.sun.az045.el55', 'interiorPixels': [4, 4],
                        'tileSizeMeters': [1, 1], 'sampling': {'pcf': {
                            'sourceMapRightAxisWorld': [1, 0, 0], 'sourceMapUpAxisWorld': [0, 1, 0]}}}
        self.profile = SimpleNamespace(data={'camera': {'clipStartMeters': .125}})
        common = {'schema': p.NATIVE_CUTOUT_FIELD_SESSION_SCHEMA, 'method': p.NATIVE_CUTOUT_FIELD_METHOD}
        self.session = {'begin': {**common, 'status': 'ready', 'lightingProfileId': self.request['lightingProfileId'],
            'casterIds': ['tree'], 'casterCount': 1, 'casterMeshCount': 1, 'nativeOwnedMeshCount': 1,
            'nativeFoliageCoverage': p.NATIVE_FOLIAGE_COVERAGE,
            'layout': {'interiorPixels': [4, 4], 'layerCount': 1, 'tileCount': [1, 1], 'tileSizeMeters': [1, 1]},
            'camera': {'farMeters': 10.125, 'nearMeters': .0625, 'originDepthMetersInCacheBasis': 0,
                       'projection': 'orthographic-linear-depth-v1'}}, 'diagnostics': [],
            'end': {**common, 'status': 'disposed', 'stateRestoration': 'isolated-scene-disposed-v1', 'capturedTileCount': 1}}

    def validate(self, schema=p.NATIVE_CUTOUT_FIELD_RECEIPT_SCHEMA, method=p.NATIVE_CUTOUT_FIELD_METHOD):
        p._validate_native_cutout_field_session(self.session, ['tree'], 1, self.basis, self.request, self.profile, 0, schema, method)

    def test_native_depth_does_not_require_gradient_permutation(self):
        self.validate()

    def test_actual_layout_mismatch_still_rejected(self):
        self.session['begin']['camera']['nearMeters'] = .5
        with self.assertRaises(p.CompilerFailure):
            self.validate()

    def test_implicit_gradient_retains_strict_permutation(self):
        for entry in ['begin', 'end']:
            self.session[entry]['schema'] = p.NATIVE_IMPLICIT_GRADIENT_FIELD_SESSION_SCHEMA
            self.session[entry]['method'] = p.NATIVE_IMPLICIT_GRADIENT_FIELD_METHOD
        with self.assertRaises(p.CompilerFailure):
            self.validate(p.NATIVE_IMPLICIT_GRADIENT_FIELD_RECEIPT_SCHEMA, p.NATIVE_IMPLICIT_GRADIENT_FIELD_METHOD)


if __name__ == '__main__':
    unittest.main()
