"""Proves that a non-receiver survives reconstruction and contributes occlusion and colored bounce."""
import json
import struct
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent / 'blender'))
from bake import install_targets, reconstruct_resolved_city
from bake_directional import install_directional_targets, set_direction, NORMALS
import bpy
import numpy as np

destination = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
destination.mkdir(parents=True, exist_ok=True)
identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def source_fixture():
    manifest = {name: [] for name in ['objects', 'meshInstances', 'geometries', 'materials', 'alphaInputs',
        'textures', 'participantMappings', 'receiverMappings', 'casterMappings']}
    manifest['hashes'] = {'resolvedSource': 'fixture'}
    buffers = {}
    quads = [('floor', [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [1, 1, 1]),
             ('wall', [(-.8, -1, 0), (-.8, 1, 0), (-.8, 1, 1.4), (-.8, -1, 1.4)], [.8, .025, .01])]
    for name, vertices, color in quads:
        positions = [component for index in [0, 1, 2, 0, 2, 3]
                     for component in (vertices[index][0], vertices[index][2], -vertices[index][1])]
        buffers[name] = struct.pack('<18f', *positions)
        manifest['geometries'].append({'id': name, 'attributes': {'position': {'bufferId': name,
            'componentType': 'f32', 'itemSize': 3, 'count': 6, 'byteStride': 12, 'byteOffset': 0, 'normalized': False}}})
        manifest['objects'].append({'id': name, 'materialSlots': [{'index': 0, 'id': name}]})
        manifest['meshInstances'].append({'id': name, 'objectId': name, 'geometryId': name,
            'rootId': name, 'chunkId': 'lab', 'category': 'fixture', 'matrixBlenderWorld': identity})
        manifest['materials'].append({'id': name, 'alphaInputId': name, 'colorLinearSrgb': color,
            'alpha': {'mode': 'opaque', 'opacity': 1}, 'roughness': 1, 'metalness': 0, 'side': 2,
            'channelSupport': {'indirect_irradiance': {'supported': True}}})
        manifest['alphaInputs'].append({'id': name})
        mapping = {'id': 'participant/' + name, 'meshInstanceId': name, 'objectId': name,
            'materialId': name, 'geometryId': name, 'start': 0, 'count': 6, 'materialIndex': 0,
            'channelRelevance': {'indirect_irradiance': True}}
        manifest['participantMappings'].append(mapping)
        if name == 'floor':
            manifest['receiverMappings'].append({**mapping, 'id': 'receiver/floor'})
    return SimpleNamespace(manifest=manifest, get_buffer_view=lambda key: memoryview(buffers[key]))


report = []
for install in [install_targets, install_directional_targets]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 128
    scene.cycles.seed = 548
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 0
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.bake.use_pass_color = False
    scene.render.bake.use_clear = True
    scene.render.bake.margin = 4
    scene.world = bpy.data.worlds.new('sky')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (1, 1, 1, 1)
    package = source_fixture()
    reconstruction = reconstruct_resolved_city(package, destination, 'indirect_irradiance')
    assert reconstruction['instanceObjectCount'] == 2
    wall = next(o for o in bpy.data.objects if o.get('bus_sim_stable_id') == 'wall')
    source_mesh, source_material = wall.data, wall.material_slots[0].material
    image = bpy.data.images.new('irradiance', 64, 64, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    chart = {'id': 'floor', 'instanceId': 'floor', 'page': 0, 'x': 0, 'y': 0, 'min': [-1, -1],
        'right': [1, 0, 0], 'up': [0, 0, -1], 'normal': [0, 1, 0],
        'triangles': [{'offset': 0, 'uv': [[-1, -1], [1, -1], [1, 1]]},
                      {'offset': 3, 'uv': [[-1, -1], [1, 1], [-1, 1]]}]}
    atlas = {'charts': [chart], 'profile': {'pageSize': 64, 'padding': 4, 'texelSizeMeters': 2 / 55}}
    controls = install(package, atlas, [image])
    if install == install_directional_targets:
        set_direction(controls, NORMALS[0])
    assert not wall.select_get() and not wall.hide_render
    assert wall.data is source_mesh and wall.material_slots[0].material is source_material
    assert [o.get('bus_sim_stable_id') for o in bpy.context.selected_objects] == ['floor']
    measured = {}
    for mode, indirect, visible in [('bounce_present', True, True), ('bounce_absent', True, False),
                                    ('sky_present', False, True), ('sky_absent', False, False)]:
        wall.hide_render = not visible
        scene.render.bake.use_pass_indirect = indirect
        scene.render.bake.use_pass_direct = not indirect
        bpy.ops.object.bake(type='DIFFUSE', uv_layer='AI548_Bake' if install == install_directional_targets else 'AI533_Bake')
        data = np.array(image.pixels[:]).reshape(64, 64, 4)[16:48, 12:40, :3]
        measured[mode] = data.mean(axis=(0, 1)).tolist()
    bounce = measured['bounce_present']
    assert bounce[0] > .02 and bounce[0] > 2 * bounce[1], measured
    assert max(measured['bounce_absent']) < .001, measured
    assert np.mean(measured['sky_present']) < .9 * np.mean(measured['sky_absent']), measured
    report.append({'installer': install.__name__, 'reconstruction': reconstruction, 'measurements': measured})

(destination / 'transport-participants.json').write_text(json.dumps(report, indent=2))
print('TRANSPORT_PARTICIPANTS_PASS ' + json.dumps(report), flush=True)
