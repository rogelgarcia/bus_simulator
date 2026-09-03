// Verifies the production AI 531 Blender renderer's fail-closed source contract.

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const SOURCE_URL = new URL(
    '../../../../tools/static_sun_depth/blender/production_static_sun.py',
    import.meta.url
);
const BSIB_URL = new URL(
    '../../../../tools/illumination_bake_compiler/blender/bsib.py',
    import.meta.url
);

test('AI529 Python boundary requires V2 material sidedness semantics', async () => {
    const source = await readFile(BSIB_URL, 'utf8');
    assert.match(source, /evaluated-three-material-semantics-v2/);
    assert.match(source, /bus-sim-evaluated-material-semantics-v2/);
    assert.match(source, /preserveShadowSide/);
    assert.match(source, /effectiveShadowSide/);
    assert.match(source, /caster_sidedness_mismatch/);
});

test('production Blender renderer reuses the pinned AI529 verification and reconstruction boundary', async () => {
    const source = await readFile(SOURCE_URL, 'utf8');

    assert.match(source, /from bsib import open_verified_package, validate_resolved_city_contract/);
    assert.match(source, /from reconstruct import reconstruct_resolved_city/);
    assert.match(source, /from scene import BakeProfile, assert_blender_runtime, configure_camera_determinism, create_clean_scene/);
    assert.match(source, /PINNED_EXECUTABLE_SHA256/);
    assert.match(source, /renderer_script_sha256/);
    assert.match(source, /ai529_script_sha256/);
    assert.match(source, /profile_sha256/);
    assert.match(source, /request_sha256/);
    assert.match(source, /package_raw_sha256/);
    assert.match(source, /reconstruct_resolved_city\(package, output_root, CHANNEL_ID\)/);
    assert.match(source, /CHANNEL_ID = \"static_sun_depth\"/);
    assert.match(source, /production_channel_sidedness_mismatch/);
    assert.match(source, /channel\.get\(\"lightProfileIds\"\)/);
    assert.match(source, /request\[\"lightingProfileId\"\] not in profile_ids/);
});

test('production request derives a phase-locked caster-plus-map receiver domain and enforces the guarded payload ceiling', async () => {
    const source = await readFile(SOURCE_URL, 'utf8');

    assert.match(source, /REQUEST_SCHEMA = \"ai531-static-sun-production-request-v4\"/);
    assert.match(source, /EXACT_TEXEL_SIZE_METERS = 680 \/ 16384/);
    assert.match(source, /PRODUCTION_INTERIOR_PIXELS = \[1870, 1821\]/);
    assert.match(source, /PRODUCTION_PHASE_POLICY = \"absolute-stable-basis-texel-edge-lattice-v1\"/);
    assert.match(source, /\"guardPixels\": 4/);
    assert.match(source, /\"boundsMarginMeters\": 2/);
    assert.match(source, /MAX_PRODUCTION_PAYLOAD_BYTES = 536_870_912/);
    assert.match(source, /SOURCE_SHADOW_CAPABILITY_ID = \"three-r183-single-high-effective-16384-v1\"/);
    assert.match(source, /SOURCE_SHADOW_MAP_SIZE_TEXELS = \[16384, 16384\]/);
    assert.match(source, /SOURCE_SHADOW_MAP_WORLD_EXTENT_METERS = \[680, 680\]/);
    assert.match(source, /SOURCE_SHADOW_FILTER_RADIUS_TEXELS = 1\.5/);
    assert.match(source, /SOURCE_SHADOW_FILTER_WORLD_RADIUS_METERS = 0\.062255859375/);
    assert.match(source, /\"constantDepthReliefMeters\": 0\.0697915/);
    assert.match(source, /\"geometricNormalOffsetMeters\": 0\.0232/);
    assert.match(source, /\"model\": \"geometric-normal-offset-plus-constant-depth-relief-v1\"/);
    assert.match(source, /\"model\": \"three-r183-vogel-5-linear-compare-v1\"/);
    assert.match(source, /\"hardwareComparison\": \"linear-four-compare-taps-v1\"/);
    assert.match(source, /\"screenRotation\": \"interleaved-gradient-noise-gl-fragcoord-v1\"/);
    assert.match(source, /\"sampleCount\": 5/);
    assert.match(source, /_derive_three_r183_filter_axes\(direction\)/);
    assert.match(source, /production_request_filter_axes_mismatch/);
    assert.match(source, /set\(value\) != expected/);
    assert.match(source, /for corner in blender_object\.bound_box/);
    assert.match(source, /_derive_basis_and_bounds\([\s\S]*collection,[\s\S]*request,[\s\S]*package\.manifest,[\s\S]*arguments\.output_encoding,[\s\S]*\)/);
    assert.match(source, /source\.get\("schema"\) != "bus-sim-resolved-city-source-v1"/);
    assert.match(source, /origin_world\[0\] - tile_size \* 0\.5/);
    assert.match(source, /minimum_x \+ width \* tile_size/);
    assert.match(source, /minimum_z \+ height \* tile_size/);
    assert.match(source, /caster_corners \+ receiver_corners/);
    assert.match(source, /def _derive_phase_locked_axis_layout/);
    assert.match(source, /absoluteBoundsMinimumTexelIndex/);
    assert.match(source, /production_phase_alignment_failed/);
    assert.match(source, /boundsInput\": \"reconstructed_static_sun_object_bounds_plus_verified_source_map_receiver_footprint_v1\"/);
    assert.match(source, /centering\": \"minimum_whole_tiles_then_nearest_valid_absolute_texel_edge_v2\"/);
    assert.match(source, /"casterWorldBoundsMeters"/);
    assert.match(source, /"receiverMapWorldBoundsMeters"/);
    assert.match(source, /"rawCombinedBoundsMinDepthMeters"/);
    assert.match(source, /production_payload_budget_exceeded/);
    assert.match(source, /production_layer_count_exceeded/);
});

test('renderer is deterministic CPU-only Cycles and renders cropped lower-left row strips', async () => {
    const source = await readFile(SOURCE_URL, 'utf8');

    assert.match(source, /scene\.render\.engine = \"CYCLES\"/);
    assert.match(source, /scene\.cycles\.device = \"CPU\"/);
    assert.match(source, /scene\.cycles\.samples = 1/);
    assert.match(source, /default=PRODUCTION_INTERIOR_PIXELS\[1\]/);
    assert.match(source, /row_strip_pixels != request\["interiorPixels"\]\[1\]/);
    assert.match(source, /scene\.render\.use_persistent_data = True/);
    assert.match(source, /"persistentData": True/);
    assert.match(source, /scene\.render\.threads_mode = \"FIXED\"/);
    assert.match(source, /scene\.render\.threads = profile\.thread_count/);
    assert.match(source, /\"gpuAllowed\": False/);
    assert.match(source, /production_gpu_device_forbidden/);
    assert.match(
        source,
        /camera_data\.ortho_scale = request\["tileSizeMeters"\]\[0\]/
    );
    assert.match(source, /for row_start in range\(0, resolution_y, row_strip_pixels\)/);
    assert.match(source, /scene\.render\.border_min_y = row_start \/ resolution_y/);
    assert.match(source, /scene\.render\.border_max_y = \(row_start \+ row_count\) \/ resolution_y/);
    assert.match(source, /scene\.render\.use_crop_to_border = True/);
    assert.match(source, /bpy\.ops\.render\.render\(write_still=True, use_viewport=False\)/);
    assert.match(source, /bpy\.data\.images\.load\(str\(path\), check_existing=False\)/);
    assert.match(source, /scene\.render\.image_settings\.file_format = \"OPEN_EXR\"/);
    assert.match(source, /\(-right\.x, up\.x, -depth\.x, position\.x\)/);
    assert.match(source, /camera\.matrix_world\.to_3x3\(\)\.determinant\(\)/);
    assert.match(source, /production_camera_handedness_invalid/);
    assert.match(source, /target_x = resolution_x - 1 - x/);
    assert.match(source, /target_offset = \(y \* resolution_x \+ target_x\) \* bytes_per_pixel/);
    assert.match(source, /key = \(tile_index, target_x, y\)/);
    assert.match(source, /\"rowOrigin\": \"min-light-y-v1\"/);
});

test('depth override preserves exact cutout coverage through Principled alpha and implements Three shadow-sidedness', async () => {
    const source = await readFile(SOURCE_URL, 'utf8');

    assert.doesNotMatch(source, /convert_to = \"CAMERA\"/);
    assert.match(source, /view_layer\.use_pass_z = True/);
    assert.match(source, /compositor\.nodes\.new\(\"CompositorNodeRLayers\"\)/);
    assert.match(source, /render_layers\.outputs\[\"Depth\"\]/);
    assert.match(source, /render_layers\.outputs\[\"Alpha\"\]/);
    assert.match(source, /compositor\.nodes\.new\(\"CompositorNodeCombineColor\"\)/);
    assert.match(source, /compositor\.interface\.new_socket/);
    assert.match(source, /cycles_z_pass_with_binary_principled_visibility_v1/);
    assert.match(source, /coverage_mix\.bl_idname != \"ShaderNodeMixShader\"/);
    assert.match(source, /coverage_keep = coverage_links\[0\]\.from_socket/);
    assert.match(source, /coverage_and_side\.operation = \"MULTIPLY\"/);
    assert.match(source, /links\.new\(alpha_keep, alpha_socket\)/);
    assert.match(source, /links\.new\(principled\.outputs\[0\], output_surface\)/);
    assert.match(source, /material\.surface_render_method = \"DITHERED\"/);
    assert.match(source, /exact_reconstructed_binary_coverage_into_principled_alpha_v1/);
    assert.match(source, /mapping\.get\(\"side\"\) != material\.get\(\"side\"\)/);
    assert.match(source, /mapping\.get\(\"shadowSide\"\) != material\.get\(\"shadowSide\"\)/);
    assert.match(source, /THREE_FRONT_SIDE: THREE_BACK_SIDE/);
    assert.match(source, /preserveShadowSide/);
    assert.match(source, /effectiveShadowSide/);
    assert.match(source, /effective != expected_effective/);
    assert.match(source, /material\.use_backface_culling = False/);
    assert.match(source, /geometry\.outputs\[\"Backfacing\"\]/);
    assert.match(source, /production_render_alpha_nonbinary/);
});

test('receipt exposes canonical production identities, RG8 measurements, and separate opaque/alpha certification', async () => {
    const source = await readFile(SOURCE_URL, 'utf8');

    assert.match(source, /RECEIPT_SCHEMA = \"ai531-static-sun-production-render-receipt-v5\"/);
    assert.match(source, /\"ai531-static-sun-production-compiler-v3\"/);
    assert.match(source, /compiler_signature_sha256 = sha256_bytes\(canonical_json_bytes\(compiler_descriptor\)\)/);
    assert.match(source, /\"casterInventorySha256\": identity_hashes\[\"casterInventorySha256\"\]/);
    assert.match(source, /\"alphaSemanticsSha256\": identity_hashes\[\"alphaSemanticsSha256\"\]/);
    assert.match(source, /\"cityId\": city_id/);
    assert.match(source, /\"opaqueCertification\": opaque_certification/);
    assert.match(source, /\"alphaCertification\": alpha_certification/);
    assert.match(source, /--alpha-parity-artifact/);
    assert.match(source, /--alpha-parity-artifact-sha256/);
    assert.match(source, /production_alpha_parity_artifact_hash_mismatch/);
    assert.match(source, /canonical_json_bytes\(alpha_parity_artifact\) != alpha_parity_bytes/);
    assert.match(source, /alpha_certification\[\"spatialParityArtifact\"\] = alpha_parity_artifact/);
    assert.match(source, /--native-cutout-field-receipt/);
    assert.match(source, /production_native_cutout_field_receipt_hash_mismatch/);
    assert.match(source, /_validate_native_cutout_field_promotion\(receipt_root, receipt\)/);
    assert.match(source, /unpromoted_native_cutout_field_receipt\.json/);
    assert.match(
        source,
        /source_field\["schema"\] == NATIVE_RESIDUAL_FIELD_RECEIPT_SCHEMA/
    );
    assert.match(
        source,
        /source_field\["method"\] == NATIVE_RESIDUAL_FIELD_METHOD/
    );
    assert.match(source, /authenticated-unpromoted-field-plus-file-backed-spatial-parity-v1/);
    assert.match(source, /native_three_mixed_mesh_field_min_merged_with_cycles_opaque_including_mixed_foliage_verified/);
    assert.match(source, /def _exclude_native_owned_foliage_meshes/);
    assert.match(source, /material\.get\("bus_sim_coverage_mode"\) == "cutout"/);
    assert.match(source, /bmesh\.ops\.delete\(mesh, geom=cutout_faces, context="FACES"\)/);
    assert.doesNotMatch(source, /bpy\.data\.objects\.remove\(blender_object, do_unlink=True\)/);
    assert.match(source, /excluded_mesh_instance_ids/);
    assert.match(source, /mode != "cutout" or mapping\["meshInstanceId"\] not in excluded_mesh_instance_ids/);
    assert.match(source, /native_depth < depth_meters/);
    assert.match(source, /BVHTree\.FromPolygons/);
    assert.match(source, /visible_polygons\.append\(indices\)/);
    assert.match(source, /opaque_visible_polygons\.append\(indices\)/);
    assert.match(source, /def _ray_cast_filtered_bvh/);
    assert.match(source, /blender_bvhtree_direction_filtered_primary_ray_v3/);
    assert.match(source, /BVH_DEPTH_EPSILON_METERS = 5e-3/);
    assert.match(source, /def _filter_direction_invisible_polygons/);
    assert.match(source, /world_space_direction_filtered_mesh_faces_v1/);
    assert.match(source, /context="FACES"/);
    assert.match(source, /opaque_truth = _build_opaque_primary_ray_truth/);
    assert.match(source, /def _fail_large_truth_error_for_tile/);
    assert.match(source, /production_opaque_bvh_large_error/);
    assert.match(source, /production_merged_depth_large_error/);
    assert.match(source, /opaque_rendered_samples/);
    assert.match(source, /merged_rendered_samples/);
    assert.match(source, /nativeDepthMeters=native_depth/);
    assert.match(source, /truthSource=expected\[\"source\"\]/);
    assert.match(source, /\"occupancyMismatchCount\": 0/);
    assert.match(source, /\"depthMismatchCount\": 0/);
    assert.match(source, /\"coverageSha256\": coverage\[\"sha256\"\]/);
    assert.match(source, /\"sourceContentSha256\": source\[\"contentSha256\"\]/);
    assert.match(source, /else \"blender-canonical-depth-before-rg8-quantization-v1\"/);
    assert.match(source, /\"maximumAbsoluteErrorMeters\"/);
    assert.match(source, /\"meanAbsoluteErrorMeters\"/);
    assert.match(source, /atomic_write_bytes\(output_root \/ \"production_static_sun_receipt\.json\", receipt_bytes\)/);
    assert.match(source, /AI531_PRODUCTION_RECEIPT=/);
});
