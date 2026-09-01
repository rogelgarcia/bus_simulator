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
    assert.match(source, /open_verified_package/);
    assert.match(source, /validate_resolved_city_contract/);
    assert.match(source, /reconstruct_resolved_city/);
    assert.match(source, /assert_blender_runtime/);
    assert.match(source, /PINNED_EXECUTABLE_SHA256/);
    assert.match(source, /producer_script_sha256/);
    assert.match(source, /production_renderer_sha256/);
    assert.match(source, /sample_request_sha256/);
    assert.match(source, /production\._validate_request/);
    assert.match(source, /production\._validate_requested_light/);
    assert.match(source, /production\._derive_basis_and_bounds/);
    assert.match(source, /production\._convert_materials_to_depth/);
});

test('cutout sparse Blender producer removes opaque faces and reads exact full production tiles', async () => {
    const source = await readFile(SOURCE_URL, 'utf8');

    assert.match(source, /def _isolate_cutout_polygons/);
    assert.match(source, /mode == "cutout"/);
    assert.match(source, /mode in \("opaque", "forced_opaque"\)/);
    assert.match(source, /bmesh\.ops\.delete/);
    assert.match(source, /context="FACES"/);
    assert.match(source, /production\._filter_direction_invisible_polygons/);
    assert.match(source, /resolution_x, resolution_y = basis\["layout"\]\["interiorPixels"\]/);
    assert.match(source, /tile_x = global_x \/\/ resolution_x/);
    assert.match(source, /tile_y = global_y \/\/ resolution_y/);
    assert.match(source, /samples_by_tile\.setdefault\(tile_index, \[\]\)\.append\(sample\)/);
    assert.match(source, /for tile_index in sorted\(samples_by_tile\)/);
    assert.match(source, /scene\.render\.use_border = False/);
    assert.match(source, /scene\.render\.use_crop_to_border = False/);
    assert.match(source, /source_x = resolution_x - 1 - local_x/);
    assert.match(source, /pixel_offset = \(local_y \* resolution_x \+ source_x\) \* 4/);
    assert.match(source, /alpha = float\(pixels\[pixel_offset \+ 3\]\)/);
    assert.match(source, /camera_depth = float\(pixels\[pixel_offset\]\)/);
    assert.match(source, /production\._capture_render_strip/);
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
