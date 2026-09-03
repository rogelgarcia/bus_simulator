// Verifies the headless AI 531 cutout-only sparse Blender producer contract.

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const SOURCE_URL = new URL(
    '../../../../tools/static_sun_depth/blender/production_alpha_cutout_sparse_samples.py',
    import.meta.url
);

test('cutout sparse Blender producer reuses the authenticated production reconstruction', async () => {
    const source = await readFile(SOURCE_URL, 'utf8');

    assert.match(source, /import production_static_sun as production/);
    assert.match(source, /import compile_cutout_silhouettes as silhouette/);
    assert.match(source, /open_verified_package/);
    assert.match(source, /validate_resolved_city_contract/);
    assert.match(source, /reconstruct_resolved_city/);
    assert.match(source, /assert_blender_runtime/);
    assert.match(source, /PINNED_EXECUTABLE_SHA256/);
    assert.match(source, /producer_script_sha256/);
    assert.match(source, /silhouette_compiler_sha256/);
    assert.match(source, /production_renderer_sha256/);
    assert.match(source, /sample_request_sha256/);
    assert.match(source, /production\._validate_request/);
    assert.match(source, /production\._validate_requested_light/);
    assert.match(source, /production\._derive_basis_and_bounds/);
    assert.match(source, /production\._convert_materials_to_depth/);
});

test('cutout sparse Blender producer removes opaque faces and renders exact micro-cameras', async () => {
    const source = await readFile(SOURCE_URL, 'utf8');

    assert.match(source, /def _isolate_cutout_polygons/);
    assert.match(source, /mode == "cutout"/);
    assert.match(source, /mode in \("opaque", "forced_opaque"\)/);
    assert.match(source, /bmesh\.ops\.delete/);
    assert.match(source, /context="FACES"/);
    assert.match(source, /production\._filter_direction_invisible_polygons/);
    assert.match(source, /--force-cutout-opaque-diagnostic/);
    assert.match(source, /--disable-binding-flipy-diagnostic/);
    assert.match(source, /--compile-cutout-silhouette-diagnostic/);
    assert.match(source, /def _force_cutout_materials_opaque/);
    assert.match(source, /def _disable_cutout_binding_flipy/);
    assert.match(source, /if sample_request\["productionEligible"\]/);
    assert.match(source, /diagnostic_forced_opaque_cutout_coverage_v1/);
    assert.match(source, /def _compile_cutout_silhouette_diagnostic/);
    assert.match(source, /silhouette\.AlphaTextureMip0/);
    assert.match(source, /silhouette\.OrthographicLightLattice/);
    assert.match(source, /silhouette\.compile_cutout_silhouettes/);
    assert.match(source, /sample_pixels=sample_pixels/);
    assert.match(source, /compiled_cutout_proxy/);
    assert.match(source, /An unproven deterministic silhouette compiler cannot produce release evidence/);
    assert.match(source, /SPARSE_RENDER_SIZE = 4/);
    assert.match(source, /SPARSE_SOURCE_PIXEL = \(1, 1\)/);
    assert.match(source, /resolution_x, resolution_y = basis\["layout"\]\["interiorPixels"\]/);
    assert.match(source, /texel_size = float\(basis\["layout"\]\["texelSizeMeters"\]\)/);
    assert.match(source, /scene\.render\.resolution_x = SPARSE_RENDER_SIZE/);
    assert.match(source, /scene\.render\.resolution_y = SPARSE_RENDER_SIZE/);
    assert.match(source, /scene\.render\.use_border = False/);
    assert.match(source, /scene\.render\.use_crop_to_border = False/);
    assert.match(source, /camera\.data\.ortho_scale = texel_size \* SPARSE_RENDER_SIZE/);
    assert.match(source, /for sample in sample_request\["samples"\]/);
    assert.match(source, /light_x = bounds\["min"\]\[0\] \+ \(global_x \+ 0\.5\) \* texel_size/);
    assert.match(source, /light_y = bounds\["min"\]\[1\] \+ \(global_y \+ 0\.5\) \* texel_size/);
    assert.match(source, /pixel_offset = \(SPARSE_SOURCE_PIXEL\[1\] \* SPARSE_RENDER_SIZE/);
    assert.match(source, /alpha = float\(pixels\[pixel_offset \+ 3\]\)/);
    assert.match(source, /camera_depth = float\(pixels\[pixel_offset\]\)/);
    assert.match(source, /production\._capture_render_strip/);
    assert.doesNotMatch(source, /samples_by_tile/);
});

test('cutout sparse Blender producer emits source-camera-distance evidence and never performance-promotes it', async () => {
    const source = await readFile(SOURCE_URL, 'utf8');

    assert.match(source, /source_camera_distance = canonical_depth - source_camera_origin_depth/);
    assert.match(source, /source-shadow-camera-distance-meters-v1/);
    assert.match(source, /bake_occupancy\.u8/);
    assert.match(source, /bake_first_hit_depth\.f32le/);
    assert.match(source, /struct\.pack/);
    assert.match(source, /"eligibleForPromotion": False/);
    assert.match(source, /timings_omitted_machine_contention_declared/);
    assert.match(source, /AI531_ALPHA_CUTOUT_BAKE_SPARSE_RECEIPT=/);
});
