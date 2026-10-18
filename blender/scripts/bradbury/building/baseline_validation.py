"""Structural contract for the imported Bradbury baseline, independent of .blend bytes."""
import hashlib
from array import array
from pathlib import Path

import bpy
from mathutils import Vector


def _values(items, attribute, width, typecode='f'):
    values = array(typecode, [0]) * (len(items) * width)
    items.foreach_get(attribute, values)
    return hashlib.sha256(values.tobytes()).hexdigest()


def _value(value):
    if isinstance(value, bpy.types.ID):
        return value.name
    if hasattr(value, '__len__') and not isinstance(value, str):
        return list(value)
    return value


def _image(image):
    if image.packed_file:
        return {'packed_sha256': hashlib.sha256(image.packed_file.data).hexdigest()}
    return {'file': Path(bpy.path.abspath(image.filepath)).resolve().as_posix()}


def _nodes(tree):
    return {
        'nodes': {n.name: {
            'type': n.bl_idname,
            'inputs': {str(i): _value(s.default_value) for i, s in enumerate(n.inputs)
                       if hasattr(s, 'default_value')},
            'image': _image(n.image) if n.type == 'TEX_IMAGE' and n.image else None,
            'properties': {key: _value(getattr(n, key)) for key in
                           ('operation', 'blend_type', 'data_type', 'vector_type', 'interpolation',
                            'extension', 'projection', 'uv_map') if hasattr(n, key)},
        } for n in tree.nodes},
        'links': sorted([l.from_node.name, list(l.from_node.outputs).index(l.from_socket),
                         l.to_node.name, list(l.to_node.inputs).index(l.to_socket)] for l in tree.links)
    }


def snapshot(asset_root):
    """Include all objects, topology, UVs, assignments, shader graphs and image identities."""
    objects = {}
    for obj in bpy.data.objects:
        row = {'type': obj.type, 'parent': obj.parent.name if obj.parent else None,
               'matrix': [list(v) for v in obj.matrix_world],
               'collections': sorted(c.name for c in obj.users_collection),
               'hide_render': obj.hide_render}
        if obj.type == 'MESH':
            mesh = obj.data
            row.update(vertices=len(mesh.vertices), polygons=len(mesh.polygons),
                       bounds=[list(obj.matrix_world @ Vector(v)) for v in obj.bound_box],
                       positions=_values(mesh.vertices, 'co', 3),
                       loops=_values(mesh.loops, 'vertex_index', 1, 'i'),
                       polygon_sizes=_values(mesh.polygons, 'loop_total', 1, 'i'),
                       polygon_materials=_values(mesh.polygons, 'material_index', 1, 'i'),
                       smooth=_values(mesh.polygons, 'use_smooth', 1, 'b'),
                       uv={uv.name: _values(uv.data, 'uv', 2) for uv in mesh.uv_layers},
                       materials=[m.name if m else None for m in mesh.materials])
        elif obj.type in ('CAMERA', 'LIGHT'):
            keys = ('type', 'lens', 'sensor_width', 'sensor_height', 'sensor_fit', 'clip_start',
                    'clip_end', 'shift_x', 'shift_y') if obj.type == 'CAMERA' else ('type', 'energy', 'color', 'angle', 'use_shadow')
            row['data'] = {key: _value(getattr(obj.data, key)) for key in keys}
        objects[obj.name] = row
    result = {
        'objects': objects,
        'collections': sorted(c.name for c in bpy.data.collections),
        'materials': {m.name: {'nodes': _nodes(m.node_tree), 'diffuse_color': list(m.diffuse_color),
                               'use_backface_culling': m.use_backface_culling,
                               'surface_render_method': m.surface_render_method}
                      for m in bpy.data.materials if m.node_tree},
        'images': {i.name: {**_image(i), 'size': list(i.size), 'colorspace': i.colorspace_settings.name,
                             'alpha_mode': i.alpha_mode} for i in bpy.data.images if i.users and i.type not in ('RENDER_RESULT', 'COMPOSITING')},
        'world': _nodes(bpy.context.scene.world.node_tree),
        'camera': bpy.context.scene.camera.name,
    }
    # Store a portable asset identity, not the machine's absolute checkout path.
    def portable(value):
        if isinstance(value, dict):
            return {k: portable(v) for k, v in value.items()}
        if isinstance(value, list):
            return [portable(v) for v in value]
        if isinstance(value, str) and value.startswith(Path(asset_root).resolve().as_posix() + '/'):
            return 'assets/' + value[len(Path(asset_root).resolve().as_posix()) + 1:]
        return value
    return portable(result)


def differences(expected, actual, path='', tolerance=1e-5):
    """Float tolerance allows Blender matrix decomposition; hashes stay exact."""
    if isinstance(expected, dict) and isinstance(actual, dict):
        if expected.keys() != actual.keys():
            yield f'{path}: keys differ (missing={sorted(expected.keys()-actual.keys())[:10]}, extra={sorted(actual.keys()-expected.keys())[:10]})'
        for key in expected.keys() & actual.keys():
            yield from differences(expected[key], actual[key], f'{path}/{key}', tolerance)
    elif isinstance(expected, list) and isinstance(actual, list):
        if len(expected) != len(actual):
            yield f'{path}: length {len(expected)} != {len(actual)}'
        else:
            for i, (a, b) in enumerate(zip(expected, actual)):
                yield from differences(a, b, f'{path}/{i}', tolerance)
    elif isinstance(expected, (float, int)) and isinstance(actual, (float, int)):
        if abs(expected-actual) > tolerance:
            yield f'{path}: {expected} != {actual}'
    elif expected != actual:
        yield f'{path}: {expected!r} != {actual!r}'
