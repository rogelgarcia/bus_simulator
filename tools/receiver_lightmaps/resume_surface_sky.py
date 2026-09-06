"""Rebake a lost sky pass while preserving bounce samples with verified raster coverage."""
import gc
import json
import os
import sys
import time
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from recover_surface_outputs import digest, recover, verify_recovery_inputs
from bake_surface import (configure_surface_device, resolve_transport, reconstruct_resolved_city,
    EnhancedTransportMaterialAdapter, apply_directional_coverage, lighting, install_surface_targets,
    batch_surface_targets, open_verified_package)

stage = Path(sys.argv[sys.argv.index('--') + 1])
reference = Path(sys.argv[sys.argv.index('--') + 2]).resolve()
stage, job, atlas, signature = verify_recovery_inputs(stage)
reference_job = json.loads((reference / 'job.json').read_text())
for key in ['packageSha256', 'chartsSha256', 'layoutSha256']:
    if reference_job[key] != job[key]:
        raise ValueError('Reference raster differs from the interrupted bake')
profile = atlas['profile']
bounce_files = []
for page in range(atlas['pageCount']):
    file = stage / f'bounce.{page}.npy'
    data = np.load(file, mmap_mode='r', allow_pickle=False)
    previous = np.load(reference / file.name, mmap_mode='r', allow_pickle=False)
    if data.shape != (profile['pageSize'], profile['pageSize'], 4) or data.dtype != np.dtype('<f4'):
        raise ValueError('Truncated bounce page')
    if not np.isfinite(data).all() or data.min() < 0 or not np.array_equal(data[:, :, 3], previous[:, :, 3]):
        raise ValueError('Bounce raster failed recovery coverage: ' + file.name)
    bounce_files.append({'file': file.name, 'sha256': digest(file)})
    del data, previous
print('BOUNCE_RECOVERY_VERIFIED ' + str(len(bounce_files)), flush=True)
with (stage / 'charts.ndjson').open() as source:
    atlas['charts'] = [json.loads(line) for line in source]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
devices = configure_surface_device(scene, profile)
scene.render.threads_mode = 'FIXED'
scene.render.threads = profile['threads']
scene.cycles.samples = profile['samples']
scene.cycles.seed = 553
scene.cycles.use_adaptive_sampling = False
scene.cycles.use_denoising = False
scene.cycles.use_animated_seed = False
scene.cycles.diffuse_bounces = profile['diffuseBounces']
scene.cycles.max_bounces = 8
scene.cycles.glossy_bounces = 0
scene.cycles.transmission_bounces = 4
scene.cycles.transparent_max_bounces = 16
scene.view_settings.view_transform = 'Raw'
scene.view_settings.exposure = 0
scene.render.bake.use_pass_color = False
scene.render.bake.use_clear = True
scene.render.bake.margin = profile['padding']
scene.render.bake.margin_type = 'EXTEND'
scene.render.bake.use_selected_to_active = False
started = time.monotonic()
with open_verified_package(stage / 'source.bsib', job['packageSha256']) as package:
    promoted = resolve_transport(package)
    reconstruction = reconstruct_resolved_city(package, stage, 'indirect_irradiance', EnhancedTransportMaterialAdapter)
    reconstruction['alphaTransportMaterials'] = promoted
    reconstruction['proceduralCoverageMaterials'] = apply_directional_coverage(bpy.data.materials)
    sun, _ = lighting(package, stage, profile.get('environmentSunRadiusDegrees'))
    images = [bpy.data.images.new('AI553_Page_' + str(page), profile['pageSize'], profile['pageSize'], alpha=True, float_buffer=True)
              for page in range(atlas['pageCount'])]
    for image in images:
        image.colorspace_settings.name = 'Non-Color'
    selected = install_surface_targets(package, atlas, images)
    reconstruction['receiverBatch'] = batch_surface_targets(selected)
    # UVs have been copied into the joined mesh; the 1.7-million-chart Python
    # inventory and unused pre-join mesh datablocks are no longer needed.
    del atlas['charts']
    gc.collect()
    unused_meshes = [mesh for mesh in bpy.data.meshes if mesh.users == 0]
    reconstruction['releasedUnusedMeshes'] = len(unused_meshes)
    for mesh in unused_meshes:
        bpy.data.meshes.remove(mesh)
    del unused_meshes
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = False
    sun.hide_render = True
    before = time.monotonic()
    print('RESUME_SKY_BAKE ' + json.dumps({'preparationSeconds': before - started}), flush=True)
    bpy.ops.object.bake(type='DIFFUSE', uv_layer='AI533_Bake')
    for page, image in enumerate(images):
        data = np.empty(profile['pageSize'] * profile['pageSize'] * 4, dtype=np.float32)
        image.pixels.foreach_get(data)
        temporary = stage / f'sky.{page}.recovering.npy'
        with temporary.open('wb') as output:
            np.save(output, data.reshape(profile['pageSize'], profile['pageSize'], 4))
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, stage / f'sky.{page}.npy')
        del data
        print('DURABLE_SKY_PAGE ' + str(page), flush=True)
    report = {'seconds': time.monotonic() - started, 'passSeconds': time.monotonic() - before,
              'reconstruction': reconstruction, 'devices': devices, 'preservedBounce': bounce_files,
              'scriptSha256': digest(Path(__file__)), 'referenceJobSha256': digest(reference / 'job.json')}
    with (stage / 'resumed-sky.json').open('w') as output:
        output.write(json.dumps(report))
        output.flush()
        os.fsync(output.fileno())
# Release the reconstructed scene and GPU targets before assembling large CPU pages.
bpy.ops.wm.read_factory_settings(use_empty=True)
del images, atlas, selected, package
gc.collect()
recover(stage)
