# Fit local leaf patches by direction or compact spatial clusters from the reference sprays.
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Euler

from common import array, foliage_data

PATCHES = 3


def spray_data(options, model, foliage):
    species = model.split('/')[0]
    recipe = json.loads((Path(options['root']) / 'tools/bake_vegetation' / species / 'recipe.json').read_text())
    count = recipe['texture']['leafCount']
    data = foliage_data(foliage)
    stride = count + 2
    if len(data['forms']) % stride:
        raise RuntimeError('Partial reference spray')
    forms = data['forms'].reshape((-1, stride))
    if not np.all(forms[:, :2] == 8) or not np.all(forms[:, 2:] < 8):
        raise RuntimeError('Reference spray ordering changed')
    data['matrices'] = np.array([np.array(Euler(v).to_matrix()) for v in data['rotations']], dtype=np.float32)
    prototypes = []
    for form in range(9):
        obj = bpy.data.objects[f'{model}_form_{form:02}']
        mesh = obj.data
        mesh.calc_loop_triangles()
        points = array(mesh.vertices, 'co', 3)
        faces = array(mesh.loop_triangles, 'vertices', 3, np.int32)
        loops = array(mesh.loop_triangles, 'loops', 3, np.int32)
        uv = array(mesh.uv_layers.active.data, 'uv', 2)[loops].reshape((-1, 2))
        # Samples along the actual shell keep the fit tighter than a transformed 3D box.
        samples = points[np.linspace(0, len(points) - 1, min(128, len(points)), dtype=np.int32)]
        prototypes.append({'points': points, 'faces': faces, 'uv': uv, 'samples': samples,
                           'material': mesh.materials[0]})
    wings = []
    for spray in range(len(forms)):
        start = spray * stride
        stem = data['matrices'][start + 1, :, 1]
        leaf_ids = np.arange(start + 2, start + stride)
        mean = data['matrices'][leaf_ids, :, 2].mean(axis=0)
        axis = np.cross(stem, mean); axis /= np.linalg.norm(axis)
        # Group by leaf-facing direction, not stem position: averaging opposing rolls
        # would make all cards horizontal and erase coverage beside a moving bus.
        ordered = leaf_ids[np.argsort(data['matrices'][leaf_ids, :, 2] @ axis)]
        groups = np.array_split(ordered, PATCHES)
        if options.get('placement') == 'spatial':
            from spatial import spatial_groups
            groups = spatial_groups(leaf_ids, data, prototypes, stem)
        for side, ids in enumerate(groups):
            points = np.concatenate([prototypes[data['forms'][i]]['samples'] @ (data['matrices'][i] * data['scales'][i]).T + data['origins'][i] for i in ids])
            normal = data['matrices'][ids, :, 2].mean(axis=0)
            normal /= np.linalg.norm(normal)
            if options.get('placement') == 'spatial':
                from spatial import fitted_normal
                normal = fitted_normal(points, normal)
            y = stem - normal * np.dot(stem, normal)
            y /= np.linalg.norm(y)
            x = np.cross(y, normal)
            basis = np.column_stack([x, y, normal])
            projected = points @ basis
            minimum, maximum = projected.min(axis=0), projected.max(axis=0)
            center = (minimum + maximum) * .5
            extent = maximum - minimum
            wings.append({'spray': spray, 'side': side, 'ids': ids, 'basis': basis,
                          'center': center @ basis.T, 'size': extent[:2] * 1.045,
                          'depth': float(extent[2]), 'flatness': float(extent[2] / max(extent[:2]))})
    return data, prototypes, wings
