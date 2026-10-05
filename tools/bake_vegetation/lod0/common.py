# Shared reference loading and deterministic scene setup for review-only LOD0 bakes.
import json
from pathlib import Path

import bpy
import numpy as np


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=True) + '\n', encoding='utf8')


def load_reference(options, names):
    source = str(Path(options['source']) / 'mature_tree_arboretum.blend')
    with bpy.data.libraries.load(source, link=False) as (available, loaded):
        missing = set(names) - set(available.objects)
        if missing:
            raise RuntimeError(f'Missing reference objects: {missing}')
        loaded.objects = names
    for obj in loaded.objects:
        if not obj.users_collection:
            bpy.context.scene.collection.objects.link(obj)
    return loaded.objects


def array(data, field, columns=1, dtype=np.float32):
    result = np.empty(len(data) * columns, dtype=dtype)
    data.foreach_get(field, result)
    return result.reshape((-1, columns)) if columns > 1 else result


def triangles(mesh):
    return sum(len(poly.vertices) - 2 for poly in mesh.polygons)


def activate(obj, others=()):
    bpy.ops.object.select_all(action='DESELECT')
    for other in others:
        other.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def configure(options):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = options['samples']
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.cycles.use_denoising = False
    if options['device'] == 'OPTIX':
        preferences = bpy.context.preferences.addons['cycles'].preferences
        preferences.compute_device_type = 'OPTIX'
        preferences.refresh_devices()
        for device in preferences.devices:
            device.use = device.type == 'OPTIX'
        if not any(device.use for device in preferences.devices):
            raise RuntimeError('Requested OPTIX device unavailable')
        scene.cycles.device = 'GPU'
    else:
        scene.cycles.device = 'CPU'
    return scene


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def foliage_data(obj):
    mesh = obj.data
    return {'origins': array(mesh.vertices, 'co', 3),
            'forms': array(mesh.attributes['leaf_form'].data, 'value', dtype=np.int32),
            'rotations': array(mesh.attributes['leaf_rotation'].data, 'vector', 3),
            'scales': array(mesh.attributes['leaf_scale'].data, 'vector', 3)}


def inspect(options):
    records = []
    for model in options['models']:
        clear_scene()
        wood, foliage = load_reference(options, [model + ' / original wood', model + ' / solid leaves'])
        data = foliage_data(foliage)
        species, variant = model.split('/')
        recipe = json.loads((Path(options['root']) / 'tools/bake_vegetation' / species / 'recipe.json').read_text())
        stride = recipe['texture']['leafCount'] + 2
        forms = data['forms'].reshape((-1, stride))
        if not (np.all(forms[:, :2] == 8) and np.all(forms[:, 2:] < 8)):
            raise RuntimeError('Source no longer preserves contiguous leaf spray groups')
        counts = np.bincount(data['forms'], minlength=9)
        prototype_counts = [triangles(bpy.data.objects[f'{model}_form_{i:02}'].data) for i in range(9)]
        record = {'id': model, 'woodTriangles': triangles(wood.data), 'sprays': len(forms), 'leavesPerSpray': stride - 2,
                  'leafFormTriangles': prototype_counts, 'formCounts': counts.tolist(),
                  'foliageTriangles': int(np.dot(counts, prototype_counts)), 'position': list(wood.location),
                  'bounds': [list(v) for v in wood.bound_box], 'materials': [m.name for m in wood.data.materials]}
        records.append(record)
        print('[LOD0] Reference ' + model + ': ' + str(record['woodTriangles']) + ' wood / ' + str(record['foliageTriangles']) + ' foliage triangles', flush=True)
    path = Path(options['output']) / 'inspection.json'
    existing = json.loads(path.read_text()) if path.exists() else []
    replaced = {record['id'] for record in records}
    write_json(path, [row for row in existing if row['id'] not in replaced] + records)
