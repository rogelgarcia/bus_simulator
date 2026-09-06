"""AI 533 Cycles diffuse atlas extension of the verified AI 529 reconstruction."""

import json
import math
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools/illumination_bake_compiler/blender"))
from bsib import open_verified_package, validate_resolved_city_contract
from scene import assert_blender_runtime
from reconstruct import reconstruct_resolved_city
import bpy
import numpy as np
from mathutils import Vector


def lighting(package, stage):
    profiles = {p["id"]: p for p in package.manifest["lightingProfiles"]}
    sun_profile = profiles["sun.default"]
    sun_data = bpy.data.lights.new("AI533_Sun", "SUN")
    sun_data.energy = sun_profile["intensity"]
    sun_data.color = sun_profile["colorLinearSrgb"]
    sun_data.angle = math.radians(sun_profile["angularDiameterDegrees"])
    sun = bpy.data.objects.new("AI533_Sun", sun_data)
    bpy.context.scene.collection.objects.link(sun)
    direction = sun_profile["directionThree"]
    sun.rotation_euler = Vector((-direction[0], direction[2], -direction[1])).to_track_quat('-Z', 'Y').to_euler()
    world = bpy.data.worlds.new("AI533_Profile_World")
    world.use_nodes = True
    bpy.context.scene.world = world
    nodes, links = world.node_tree.nodes, world.node_tree.links
    background = nodes.get("Background")
    texcoord = nodes.new("ShaderNodeTexCoord")
    # World Normal points toward the camera; lighting needs the outward ray.
    # Three (x,y,z) is reconstructed as Blender (x,-z,y). Blender's native
    # equirectangular lookup already accounts for that convention: do not
    # convert the direction back to Three axes inside the world shader.
    outward = nodes.new('ShaderNodeVectorMath'); outward.operation = 'SCALE'
    outward.inputs['Scale'].default_value = -1
    links.new(texcoord.outputs['Normal'], outward.inputs[0])
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(outward.outputs[0], separate.inputs[0])
    remap = nodes.new("ShaderNodeMath"); remap.operation = 'MULTIPLY_ADD'
    remap.inputs[1].default_value = 0.5; remap.inputs[2].default_value = 0.5
    links.new(separate.outputs['Z'], remap.inputs[0])
    hemi = profiles['hemisphere.current']
    mix = nodes.new('ShaderNodeMixRGB')
    links.new(remap.outputs[0], mix.inputs[0])
    mix.inputs[1].default_value = (*[v * hemi['intensity'] / math.pi for v in hemi['groundColorLinearSrgb']], 1)
    mix.inputs[2].default_value = (*[v * hemi['intensity'] / math.pi for v in hemi['skyColorLinearSrgb']], 1)
    environment = profiles['environment.default']
    color = mix.outputs[0]
    if environment['enabled']:
        ref = environment['sourceReference']
        file = stage / 'environment.hdr'
        file.write_bytes(package.get_buffer_bytes(ref['bufferId']))
        texture = nodes.new('ShaderNodeTexEnvironment'); texture.image = bpy.data.images.load(str(file))
        links.new(outward.outputs[0], texture.inputs['Vector'])
        add = nodes.new('ShaderNodeMixRGB'); add.blend_type = 'ADD'; add.inputs[0].default_value = environment['intensity']
        links.new(color, add.inputs[1]); links.new(texture.outputs[0], add.inputs[2]); color = add.outputs[0]
    links.new(color, background.inputs['Color'])
    background.inputs['Strength'].default_value = 1
    return sun, background


def install_targets(package, atlas, images, mapping_ranges=None):
    instance_records = {i['id']: i for i in package.manifest['meshInstances']}
    geometry_records = {g['id']: g for g in package.manifest['geometries']}
    by_instance = {}
    for chart in atlas['charts']:
        by_instance.setdefault(chart['instanceId'], []).append(chart)
    selected = []
    materials = {}
    dummy = bpy.data.images.new('AI533_Unmapped', 1, 1, alpha=True, float_buffer=True)
    for obj in sorted(list(bpy.data.objects), key=lambda v: v.name):
        stable_id = obj.get('bus_sim_stable_id')
        if stable_id not in by_instance:
            continue
        obj.data = obj.data.copy()
        geometry = geometry_records[instance_records[stable_id]['geometryId']]
        ranges = mapping_ranges[stable_id] if mapping_ranges is not None else sorted({(m['start'], m['count'], m['materialIndex'])
                         for inventory in ['participantMappings', 'receiverMappings', 'casterMappings']
                         for m in package.manifest[inventory]
                         if m['meshInstanceId'] == stable_id and m['channelRelevance'].get('indirect_irradiance')})
        offsets = sorted({offset for start, count, _ in ranges for offset in range(start, start + count, 3)})
        if len(offsets) != len(obj.data.polygons):
            raise RuntimeError('Reconstructed triangle ordering does not match the resolved source: ' + stable_id)
        polygons = dict(zip(offsets, obj.data.polygons))
        original_slots = [slot.material for slot in obj.material_slots]
        # Clearing Blender's slot list resets every polygon index to zero.
        source_materials = [original_slots[polygon.material_index] for polygon in obj.data.polygons]
        obj.data.materials.clear()
        local_slots = {}
        uv = obj.data.uv_layers.new(name='AI533_Bake')
        for value in uv.data: value.uv = (-2, -2)
        targets = {offset: (chart, triangle) for chart in by_instance[stable_id] for triangle in chart['triangles'] for offset in [triangle['offset']]}
        for offset, polygon in polygons.items():
            target = targets.get(offset)
            page = target[0]['page'] if target else -1
            source_material = source_materials[polygon.index]
            key = (source_material.name, page)
            if key not in materials:
                mat = source_material.copy()
                node = mat.node_tree.nodes.new('ShaderNodeTexImage')
                node.image = images[page] if page >= 0 else dummy
                mat.node_tree.nodes.active = node
                materials[key] = mat
            if key not in local_slots:
                local_slots[key] = len(obj.data.materials); obj.data.materials.append(materials[key])
            polygon.material_index = local_slots[key]
            if target:
                chart, triangle = target
                for loop, point in zip(polygon.loop_indices, triangle['uv']):
                    uv.data[loop].uv = tuple(((point[c] - chart['min'][c]) * chart.get('texelsPerMeter', [1 / atlas['profile']['texelSizeMeters']] * 2)[c]
                        + atlas['profile']['padding'] + chart.get('pixelOffset',[.5,.5])[c] + (chart['y'] if c else chart['x'])) / atlas['profile']['pageSize'] for c in range(2))
        obj.data.uv_layers.active = uv
        selected.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in selected: obj.select_set(True)
    bpy.context.view_layer.objects.active = selected[0]
    return selected


def pixels(images):
    result = []
    for image in images:
        data = np.empty(len(image.pixels), dtype=np.float32); image.pixels.foreach_get(data)
        if not np.all(np.isfinite(data)): raise RuntimeError('Non-finite Cycles irradiance output')
        result.append(data.reshape(image.size[1], image.size[0], 4))
    return result


def main():
    stage = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
    job = json.loads((stage / 'job.json').read_text())
    atlas = json.loads((stage / 'atlas.json').read_text())
    profile = atlas['profile']
    signature = assert_blender_runtime(job['archiveSha256'])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'; scene.render.threads = profile['threads']
    scene.cycles.samples = profile['samples']; scene.cycles.seed = 533
    scene.cycles.use_adaptive_sampling = False; scene.cycles.use_denoising = False
    scene.cycles.use_animated_seed = False
    scene.cycles.diffuse_bounces = profile['diffuseBounces']; scene.cycles.max_bounces = 8
    scene.cycles.glossy_bounces = 0; scene.cycles.transmission_bounces = 4
    scene.cycles.transparent_max_bounces = 16
    scene.view_settings.view_transform = 'Raw'; scene.view_settings.exposure = 0
    scene.render.bake.use_pass_color = False; scene.render.bake.use_clear = True
    scene.render.bake.margin = profile['padding']; scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_selected_to_active = False
    started = time.monotonic()
    with open_verified_package(stage / 'source.bsib', job['packageSha256']) as package:
        validate_resolved_city_contract(package, job['archiveSha256'])
        reconstruction = reconstruct_resolved_city(package, stage, 'indirect_irradiance')
        sun, background = lighting(package, stage)
        images = [bpy.data.images.new('AI533_Page_' + str(i), profile['pageSize'], profile['pageSize'], alpha=True, float_buffer=True)
                  for i in range(atlas['pageCount'])]
        for image in images: image.colorspace_settings.name = 'Non-Color'
        install_targets(package, atlas, images)
        passes = {}
        for name, direct, indirect, sun_visible, world_strength in [
            ('direct_receiver', True, False, True, 0),
            ('bounce', False, True, True, 1),
            ('sky', True, False, False, 1)]:
            scene.render.bake.use_pass_direct = direct; scene.render.bake.use_pass_indirect = indirect
            sun.hide_render = not sun_visible; background.inputs['Strength'].default_value = world_strength
            before = time.monotonic(); print('AI533_BAKE ' + name, flush=True)
            (stage / 'progress.json').write_text(json.dumps({'pass': name, 'elapsed': before - started}))
            bpy.ops.object.bake(type='DIFFUSE', uv_layer='AI533_Bake')
            passes[name] = {'pixels': pixels(images), 'seconds': time.monotonic() - before}
        outputs = []
        for channel in ['direct_receiver', 'indirect_irradiance']:
            channel_pixels = passes[channel]['pixels'] if channel == 'direct_receiver' else [a + b for a, b in zip(passes['bounce']['pixels'], passes['sky']['pixels'])]
            for page, data in enumerate(channel_pixels):
                data[:, :, :3] *= math.pi
                data[:, :, 3] = 1
                for mip in range(profile['mipLevels']):
                    file = f'{channel}.{page}.mip{mip}.f32'
                    data.astype('<f4').tofile(stage / file)
                    outputs.append({'channel': channel, 'page': page, 'mip': mip, 'file': file,
                                    'width': data.shape[1], 'height': data.shape[0]})
                    if mip + 1 < profile['mipLevels']:
                        data = data.reshape(data.shape[0] // 2, 2, data.shape[1] // 2, 2, 4).mean(axis=(1, 3))
        receipt = {'schema': 'bus-sim-receiver-bake-receipt-v1', 'signature': signature,
                   'reconstruction': reconstruction, 'seconds': time.monotonic() - started,
                   'passes': {k: v['seconds'] for k, v in passes.items()}, 'outputs': outputs}
        (stage / 'receipt.json').write_text(json.dumps(receipt, sort_keys=True))


if __name__ == '__main__':
    main()
