"""Checks that bake targets preserve per-face colors and object-linked material overrides."""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent / 'blender'))
import bpy
from bake import install_targets
from bake_directional import install_directional_targets

for install in [install_targets, install_directional_targets]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh = bpy.data.meshes.new('two_faces')
    mesh.from_pydata([(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0)], [], [(0, 1, 2), (1, 3, 2)])
    for name, color in [('red', (1, 0, 0, 1)), ('green', (0, 1, 0, 1)), ('blue', (0, 0, 1, 1))]:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = color
        if name != 'blue':
            mesh.materials.append(material)
    mesh.polygons[1].material_index = 1
    obj = bpy.data.objects.new('receiver', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['bus_sim_stable_id'] = 'receiver'
    obj.material_slots[1].link = 'OBJECT'
    obj.material_slots[1].material = bpy.data.materials['blue']
    untouched = bpy.data.objects.new('shared_source', mesh)
    bpy.context.scene.collection.objects.link(untouched)
    mappings = [{'meshInstanceId': 'receiver', 'start': n * 3, 'count': 3, 'materialIndex': n,
                 'channelRelevance': {'indirect_irradiance': True}} for n in range(2)]
    package = SimpleNamespace(manifest={'meshInstances': [{'id': 'receiver', 'geometryId': 'mesh'}],
        'geometries': [{'id': 'mesh'}], 'participantMappings': mappings, 'receiverMappings': [], 'casterMappings': []})
    chart = {'id': 'chart', 'instanceId': 'receiver', 'page': 0, 'x': 0, 'y': 0, 'min': [0, 0],
             'triangles': [{'offset': 0, 'uv': [[0, 0], [1, 0], [0, 1]]}, {'offset': 3, 'uv': [[1, 0], [1, 1], [0, 1]]}]}
    atlas = {'charts': [chart], 'profile': {'texelSizeMeters': .1, 'padding': 2, 'pageSize': 32}}
    image = bpy.data.images.new('target', 32, 32, float_buffer=True)
    install(package, atlas, [image])
    colors = [tuple(obj.material_slots[polygon.material_index].material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value)
              for polygon in obj.data.polygons]
    assert colors == [(1, 0, 0, 1), (0, 0, 1, 1)], (install.__name__, colors)
    assert untouched.data is mesh and [polygon.material_index for polygon in mesh.polygons] == [0, 1]
    assert [slot.material.name for slot in untouched.material_slots] == ['red', 'green']
    print('TARGET_MATERIALS_PASS ' + install.__name__, flush=True)
