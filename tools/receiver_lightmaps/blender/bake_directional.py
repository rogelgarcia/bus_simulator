"""AI 548 four-direction diffuse transport, preserving the geometric-normal sample."""

import json
import hashlib
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bake import lighting, pixels, open_verified_package, validate_resolved_city_contract, reconstruct_resolved_city, assert_blender_runtime
import bpy
import numpy as np
from mathutils import Vector
from directional_coverage import apply_directional_coverage
from denoise import ChartDenoiser

NORMALS = [(0, 0, 1), (math.sqrt(2 / 3), 0, 1 / math.sqrt(3)),
           (-1 / math.sqrt(6), 1 / math.sqrt(2), 1 / math.sqrt(3)),
           (-1 / math.sqrt(6), -1 / math.sqrt(2), 1 / math.sqrt(3))]


def install_directional_targets(package, atlas, images):
    charts_by_instance = {}
    for chart in atlas['charts']:
        charts_by_instance.setdefault(chart['instanceId'], []).append(chart)
    controls = []
    dummy = bpy.data.images.new('AI548_Unmapped', 1, 1, float_buffer=True)
    selected = []
    for obj in sorted(list(bpy.data.objects), key=lambda value: value.name):
        instance = obj.get('bus_sim_stable_id')
        if instance not in charts_by_instance:
            continue
        obj.data = obj.data.copy()
        ranges = sorted({(m['start'], m['count'], m['materialIndex'])
                         for inventory in ['participantMappings', 'receiverMappings', 'casterMappings']
                         for m in package.manifest[inventory]
                         if m['meshInstanceId'] == instance and m['channelRelevance'].get('indirect_irradiance')})
        offsets = sorted({offset for start, count, _ in ranges for offset in range(start, start + count, 3)})
        if len(offsets) != len(obj.data.polygons):
            raise RuntimeError('Directional receiver triangle ordering mismatch: ' + instance)
        targets = {t['offset']: (chart, t) for chart in charts_by_instance[instance] for t in chart['triangles']}
        old_slots = [slot.material for slot in obj.material_slots]
        # Preserve per-face transport before Blender resets indices during clear().
        source_materials = [old_slots[polygon.material_index] for polygon in obj.data.polygons]
        obj.data.materials.clear()
        uv = obj.data.uv_layers.new(name='AI548_Bake')
        for value in uv.data:
            value.uv = (-2, -2)
        materials = {}
        for offset, polygon in zip(offsets, obj.data.polygons):
            target = targets.get(offset)
            source = source_materials[polygon.index]
            key = (source.name, target[0]['id'] if target else '')
            if key not in materials:
                material = source.copy()
                material.cycles.use_bump_map_correction = False
                nodes, links = material.node_tree.nodes, material.node_tree.links
                image = nodes.new('ShaderNodeTexImage')
                image.image = images[target[0]['page']] if target else dummy
                nodes.active = image
                if target:
                    output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
                    original = output.inputs['Surface'].links[0].from_socket
                    direction = nodes.new('ShaderNodeCombineXYZ')
                    path = nodes.new('ShaderNodeLightPath')
                    primary = nodes.new('ShaderNodeMath'); primary.operation = 'LESS_THAN'
                    links.new(path.outputs['Ray Depth'], primary.inputs[0]); primary.inputs[1].default_value = .5
                    diffuse = nodes.new('ShaderNodeBsdfDiffuse')
                    diffuse.inputs['Color'].default_value = (1, 1, 1, 1); diffuse.inputs['Roughness'].default_value = 0
                    links.new(direction.outputs[0], diffuse.inputs['Normal'])
                    mix = nodes.new('ShaderNodeMixShader')
                    links.new(primary.outputs[0], mix.inputs[0]); links.new(original, mix.inputs[1]); links.new(diffuse.outputs[0], mix.inputs[2])
                    links.new(mix.outputs[0], output.inputs['Surface'])
                    controls.append((direction, target[0]))
                materials[key] = len(obj.data.materials)
                obj.data.materials.append(material)
            polygon.material_index = materials[key]
            if target:
                chart, triangle = target
                for loop, point in zip(polygon.loop_indices, triangle['uv']):
                    uv.data[loop].uv = tuple(((point[c] - chart['min'][c]) / atlas['profile']['texelSizeMeters']
                        + atlas['profile']['padding'] + .5 + (chart['y'] if c else chart['x'])) / atlas['profile']['pageSize'] for c in range(2))
        obj.data.uv_layers.active = uv
        selected.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = selected[0]
    return controls


def set_direction(controls, normal):
    for node, chart in controls:
        world = [chart['right'][c] * normal[0] + chart['up'][c] * normal[1] + chart['normal'][c] * normal[2] for c in range(3)]
        for c, value in enumerate((world[0], -world[2], world[1])):
            node.inputs[c].default_value = value


def coefficients(samples):
    a, b, c, d = samples
    cz = (a - (b + c + d) / 3) / (1 - 1 / math.sqrt(3))
    return np.stack((a - cz, (2 * b - c - d) / math.sqrt(6), (c - d) / math.sqrt(2), cz), axis=-1)


def flat_first_coefficients(samples):
    fitted = coefficients(samples)
    return np.stack((np.concatenate((samples[0], fitted[..., 0, 3:4]), axis=-1),
        np.concatenate((fitted[..., 1], fitted[..., 1, 3:4]), axis=-1),
        np.concatenate((fitted[..., 2], fitted[..., 2, 3:4]), axis=-1)), axis=-2)


def write_levels(stage, channel, page, data, profile, outputs):
    for mip in range(profile['mipLevels']):
        file = f'{channel}.{page}.mip{mip}.f32'
        data.astype('<f4').tofile(stage / file)
        outputs.append({'channel': channel, 'page': page, 'mip': mip, 'file': file, 'width': data.shape[1], 'height': data.shape[0]})
        if mip + 1 < profile['mipLevels']:
            data = data.reshape(data.shape[0] // 2, 2, data.shape[1] // 2, 2, 4).mean(axis=(1, 3))


def assemble_directions(stage, atlas):
    parts = [json.loads((stage / f'direction.{i}.json').read_text()) for i in range(4)]
    job_hash = hashlib.sha256((stage / 'job.json').read_bytes()).hexdigest()
    if any(part['jobSha256'] != job_hash for part in parts):
        raise RuntimeError('Directional checkpoint belongs to another compiler job')
    outputs = list(parts[0]['outputs'])
    denoise_started = time.monotonic()
    denoiser = ChartDenoiser(stage, atlas['profile']['threads']) if atlas['profile'].get('denoise') == 'isolated-chart-oidn-v1' else None
    for page in range(atlas['pageCount']):
        samples = [np.load(stage / f'sample.{d}.bounce.{page}.npy') + np.load(stage / f'sample.{d}.sky.{page}.npy') for d in range(4)]
        if denoiser:
            print('AI548_DENOISE page ' + str(page), flush=True)
            charts = [chart for chart in atlas['charts'] if chart['page'] == page]
            samples = [denoiser.apply(sample, charts) for sample in samples]
        fitted = flat_first_coefficients(samples) if atlas['profile'].get('coefficientLayout') == 'flat-first-rgb-v1' else coefficients(samples)
        for color in range(3):
            write_levels(stage, 'indirect_irradiance', page * 3 + color, fitted[:, :, color, :], atlas['profile'], outputs)
    receipt = {'schema': 'bus-sim-receiver-bake-receipt-v1', 'signature': parts[0]['signature'],
        'reconstruction': parts[0]['reconstruction'], 'directional': atlas['profile']['directional'],
        'seconds': sum(part['seconds'] for part in parts),
        'passes': {key: value for part in parts for key, value in part['passes'].items()},
        'execution': 'isolated_direction_processes', 'outputs': outputs}
    if denoiser:
        receipt['denoise'] = {'method': atlas['profile']['denoise'], 'seconds': time.monotonic() - denoise_started,
                             'scope': 'independent_chart_rectangles_including_padding', 'directions': 4}
        receipt['seconds'] += receipt['denoise']['seconds']
    (stage / 'receipt.json').write_text(json.dumps(receipt, sort_keys=True))


def main():
    arguments = sys.argv[sys.argv.index('--') + 1:]
    stage = Path(arguments[0]).resolve()
    job = json.loads((stage / 'job.json').read_text())
    atlas = json.loads((stage / 'atlas.json').read_text())
    profile = atlas['profile']
    if len(arguments) > 1 and arguments[1] == 'assemble':
        assemble_directions(stage, atlas)
        return
    selected_direction = int(arguments[1]) if len(arguments) > 1 else None
    if selected_direction is not None and selected_direction not in range(4):
        raise ValueError('Invalid bake direction')
    signature = assert_blender_runtime(job['archiveSha256'])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'; scene.render.threads = profile['threads']
    scene.cycles.samples = profile['samples']; scene.cycles.seed = 548
    scene.cycles.use_adaptive_sampling = False; scene.cycles.use_denoising = False; scene.cycles.use_animated_seed = False
    scene.cycles.diffuse_bounces = profile['diffuseBounces']; scene.cycles.max_bounces = 8
    scene.cycles.glossy_bounces = 0; scene.cycles.transmission_bounces = 4; scene.cycles.transparent_max_bounces = 16
    scene.view_settings.view_transform = 'Raw'; scene.view_settings.exposure = 0
    scene.render.bake.use_pass_color = False; scene.render.bake.use_clear = True
    scene.render.bake.margin = profile['padding']; scene.render.bake.margin_type = 'EXTEND'
    started = time.monotonic(); outputs = []; times = {}
    with open_verified_package(stage / 'source.bsib', job['packageSha256']) as package:
        validate_resolved_city_contract(package, job['archiveSha256'])
        reconstruction = reconstruct_resolved_city(package, stage, 'indirect_irradiance')
        reconstruction['proceduralCoverageMaterials'] = apply_directional_coverage(list(bpy.data.materials))
        sun, background = lighting(package, stage)
        images = [bpy.data.images.new('AI548_Page_' + str(i), profile['pageSize'], profile['pageSize'], alpha=True, float_buffer=True) for i in range(atlas['pageCount'])]
        for image in images:
            image.colorspace_settings.name = 'Non-Color'
        controls = install_directional_targets(package, atlas, images)
        for direction, normal in enumerate(NORMALS):
            if selected_direction is not None and selected_direction != direction:
                continue
            set_direction(controls, normal)
            for name, direct, indirect, sun_visible, strength in ([('direct_receiver', True, False, True, 0)] if direction == 0 else []) + [
                ('bounce', False, True, True, 1), ('sky', True, False, False, 1)]:
                scene.render.bake.use_pass_direct = direct; scene.render.bake.use_pass_indirect = indirect
                sun.hide_render = not sun_visible; background.inputs['Strength'].default_value = strength
                before = time.monotonic(); label = f'{direction}.{name}'
                print('AI548_BAKE ' + label, flush=True)
                (stage / 'progress.json').write_text(json.dumps({'pass': label, 'elapsed': before - started}))
                bpy.ops.object.bake(type='DIFFUSE', uv_layer='AI548_Bake')
                times[label] = time.monotonic() - before
                for page, data in enumerate(pixels(images)):
                    data[:, :, :3] *= math.pi; data[:, :, 3] = 1
                    if name == 'direct_receiver':
                        write_levels(stage, name, page, data, profile, outputs)
                    else:
                        np.save(stage / f'sample.{direction}.{name}.{page}.npy', data[:, :, :3])
        if selected_direction is not None:
            names = [f'sample.{selected_direction}.{channel}.{page}.npy' for channel in ['bounce', 'sky'] for page in range(atlas['pageCount'])]
            names += [item['file'] for item in outputs]
            files = [{'name': name, 'bytes': (stage / name).stat().st_size,
                'sha256': hashlib.sha256((stage / name).read_bytes()).hexdigest()} for name in names]
            checkpoint = {'jobSha256': hashlib.sha256((stage / 'job.json').read_bytes()).hexdigest(),
                'direction': selected_direction, 'signature': signature, 'reconstruction': reconstruction,
                'seconds': time.monotonic() - started, 'passes': times, 'outputs': outputs, 'files': files}
            (stage / f'direction.{selected_direction}.json').write_text(json.dumps(checkpoint, sort_keys=True))
            return
        for page in range(atlas['pageCount']):
            samples = [np.load(stage / f'sample.{d}.bounce.{page}.npy') + np.load(stage / f'sample.{d}.sky.{page}.npy') for d in range(4)]
            fitted = flat_first_coefficients(samples) if profile.get('coefficientLayout') == 'flat-first-rgb-v1' else coefficients(samples)
            for color in range(3):
                write_levels(stage, 'indirect_irradiance', page * 3 + color, fitted[:, :, color, :], profile, outputs)
        receipt = {'schema': 'bus-sim-receiver-bake-receipt-v1', 'signature': signature, 'reconstruction': reconstruction,
                   'directional': profile['directional'], 'seconds': time.monotonic() - started, 'passes': times, 'outputs': outputs}
        (stage / 'receipt.json').write_text(json.dumps(receipt, sort_keys=True))


if __name__ == '__main__':
    main()
