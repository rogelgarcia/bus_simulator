"""Complete diffuse receivers; direct sun visibility remains in the shared high-resolution cache."""
import gc
import json
import math
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bake import lighting, pixels, install_targets, open_verified_package, validate_resolved_city_contract, reconstruct_resolved_city, assert_blender_runtime
from transport import resolve_transport, EnhancedTransportMaterialAdapter, POLICY
from directional_coverage import apply_directional_coverage
from batch_surface import batch_surface_targets
import bpy
import numpy as np


def configure_surface_device(scene, profile):
    device = profile.get('device','CPU')
    if device == 'CPU':
        scene.cycles.device = 'CPU'
        return ['CPU']
    if device != 'OPTIX': raise ValueError('Unsupported surface bake device')
    preferences = bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type = 'OPTIX'; preferences.get_devices()
    available = [d for d in preferences.devices if d.type == 'OPTIX']
    if not available: raise ValueError('Requested OptiX device is unavailable')
    for candidate in preferences.devices: candidate.use = candidate.type == 'OPTIX'
    scene.cycles.device = 'GPU'
    return [d.name for d in available]


def install_surface_targets(package, atlas, images):
    ranges = {}
    for inventory in ['participantMappings', 'receiverMappings', 'casterMappings']:
        for mapping in package.manifest[inventory]:
            if mapping['channelRelevance'].get('indirect_irradiance'):
                ranges.setdefault(mapping['meshInstanceId'],set()).add((mapping['start'],mapping['count'],mapping['materialIndex']))
    selected = install_targets(package, atlas, images, {key:sorted(value) for key,value in ranges.items()})
    materials = {slot.material for obj in selected for slot in obj.material_slots}
    for material in materials:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        target = nodes.active
        if target is None or target.type != 'TEX_IMAGE' or target.image not in images:
            continue
        output = next(node for node in nodes if node.type == 'OUTPUT_MATERIAL')
        original = output.inputs['Surface'].links[0].from_socket
        path = nodes.new('ShaderNodeLightPath')
        primary = nodes.new('ShaderNodeMath'); primary.operation = 'LESS_THAN'
        links.new(path.outputs['Ray Depth'], primary.inputs[0]); primary.inputs[1].default_value = .5
        diffuse = nodes.new('ShaderNodeBsdfDiffuse')
        diffuse.inputs['Color'].default_value = (1, 1, 1, 1); diffuse.inputs['Roughness'].default_value = 0
        geometry = nodes.new('ShaderNodeNewGeometry')
        links.new(geometry.outputs['True Normal'], diffuse.inputs['Normal'])
        mix = nodes.new('ShaderNodeMixShader')
        links.new(primary.outputs[0], mix.inputs[0]); links.new(original, mix.inputs[1]); links.new(diffuse.outputs[0], mix.inputs[2])
        links.new(mix.outputs[0], output.inputs['Surface'])
        nodes.active = target
        material.cycles.use_bump_map_correction = False
    return selected


def write_durable(file, writer):
    temporary = file.with_suffix(file.suffix + '.partial')
    with temporary.open('wb') as output:
        writer(output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, file)


def save_surface_pass(stage, name, images):
    for page, image in enumerate(images):
        data = pixels([image])[0]
        write_durable(stage / f'{name}.{page}.npy', lambda output: np.save(output, data))
        del data


def assemble_surface_outputs(stage, profile, page_count):
    outputs = []
    for page in range(page_count):
        data = np.load(stage / f'bounce.{page}.npy') + np.load(stage / f'sky.{page}.npy')
        data[:, :, :3] *= math.pi; data[:, :, 3] = 1
        for mip in range(profile['mipLevels']):
            file = f'indirect_irradiance.{page}.mip{mip}.f32'
            write_durable(stage / file, lambda output: data.astype('<f4').tofile(output))
            outputs.append({'channel': 'indirect_irradiance', 'page': page, 'mip': mip, 'file': file, 'width': data.shape[1], 'height': data.shape[0]})
            if mip+1 < profile['mipLevels']: data = data.reshape(data.shape[0]//2, 2, data.shape[1]//2, 2, 4).mean(axis=(1,3))
    # Authenticated channel metadata selects shared visibility; there is no second sun atlas to sample.
    write_durable(stage / 'direct_receiver.0.mip0.f32', lambda output: np.zeros((1,1,4), dtype='<f4').tofile(output))
    outputs.append({'channel': 'direct_receiver', 'page': 0, 'mip': 0, 'file': 'direct_receiver.0.mip0.f32', 'width': 1, 'height': 1})
    return outputs


def main():
    stage = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
    job = json.loads((stage / 'job.json').read_text())
    atlas = json.loads((stage / 'atlas.json').read_text()); profile = atlas['profile']
    if atlas.get('chartFile') != 'charts.ndjson': raise ValueError('Unsupported chart inventory')
    with (stage / 'charts.ndjson').open() as source: atlas['charts'] = [json.loads(line) for line in source]
    if profile.get('transportPolicy') != POLICY or profile.get('directRepresentation') != 'hybrid-sun-visibility-v1':
        raise ValueError('Unsupported complete surface transport profile')
    signature = assert_blender_runtime(job['archiveSha256'])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    devices = configure_surface_device(scene, profile)
    scene.render.threads_mode = 'FIXED'; scene.render.threads = profile['threads']
    scene.cycles.samples = profile['samples']; scene.cycles.seed = 553
    scene.cycles.use_adaptive_sampling = False; scene.cycles.use_denoising = False
    scene.cycles.use_animated_seed = False
    scene.cycles.diffuse_bounces = profile['diffuseBounces']; scene.cycles.max_bounces = 8
    scene.cycles.glossy_bounces = 0; scene.cycles.transmission_bounces = 4; scene.cycles.transparent_max_bounces = 16
    scene.view_settings.view_transform = 'Raw'; scene.view_settings.exposure = 0
    scene.render.bake.use_pass_color = False; scene.render.bake.use_clear = True
    scene.render.bake.margin = profile['padding']; scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_selected_to_active = False
    started = time.monotonic()
    with open_verified_package(stage / 'source.bsib', job['packageSha256']) as package:
        validate_resolved_city_contract(package, job['archiveSha256'])
        promoted = resolve_transport(package)
        reconstruction = reconstruct_resolved_city(package, stage, 'indirect_irradiance', EnhancedTransportMaterialAdapter)
        reconstruction['alphaTransportMaterials'] = promoted
        reconstruction['proceduralCoverageMaterials'] = apply_directional_coverage(bpy.data.materials)
        sun, background = lighting(package, stage, profile.get('environmentSunRadiusDegrees'))
        images = [bpy.data.images.new('AI553_Page_' + str(i), profile['pageSize'], profile['pageSize'], alpha=True, float_buffer=True)
                  for i in range(atlas['pageCount'])]
        for image in images: image.colorspace_settings.name = 'Non-Color'
        selected = install_surface_targets(package, atlas, images)
        reconstruction['receiverBatch'] = batch_surface_targets(selected)
        # UVs now live in the joined mesh. Discard the offline chart inventory
        # and orphaned pre-join meshes before Cycles allocates its render data.
        del atlas['charts']
        gc.collect()
        for mesh in list(bpy.data.meshes):
            if mesh.users == 0: bpy.data.meshes.remove(mesh)
        times = {}
        for name, direct, indirect, sun_visible in [('bounce', False, True, True), ('sky', True, False, False)]:
            scene.render.bake.use_pass_direct = direct; scene.render.bake.use_pass_indirect = indirect
            sun.hide_render = not sun_visible
            before = time.monotonic()
            write_durable(stage / 'progress.json', lambda output: output.write(json.dumps({'pass': name, 'elapsed': before-started}).encode()))
            print('AI553_BAKE ' + name, flush=True)
            bpy.ops.object.bake(type='DIFFUSE', uv_layer='AI533_Bake')
            save_surface_pass(stage, name, images)
            times[name] = time.monotonic()-before
    bpy.ops.wm.read_factory_settings(use_empty=True)
    del images, selected, package
    gc.collect()
    outputs = assemble_surface_outputs(stage, profile, atlas['pageCount'])
    receipt = {'schema': 'bus-sim-receiver-bake-receipt-v1', 'signature': signature, 'reconstruction': reconstruction,
               'seconds': time.monotonic()-started, 'passes': times, 'outputs': outputs, 'devices': devices, 'backend': profile['device']}
    write_durable(stage / 'receipt.json', lambda output: output.write(json.dumps(receipt, sort_keys=True).encode()))


if __name__ == '__main__': main()
