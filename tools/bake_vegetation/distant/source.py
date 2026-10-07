# Reads reviewed export surfaces and traces connected woody cross-sections for coarse trunk fitting.
import hashlib
from pathlib import Path
import bpy
import numpy as np
from common import array


def load_model(options, species, variant, level=0):
    file = Path(options['source']) / f'lod{level}' / species / variant / f'{variant}_lod{level}_review.glb'
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(file))
    objects = list(set(bpy.data.objects) - before)
    bpy.context.view_layer.update()
    parts = []
    for obj in objects:
        if obj.type != 'MESH':
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        faces = array(mesh.loop_triangles, 'vertices', 3, np.int32)
        loops = array(mesh.loop_triangles, 'loops', 3, np.int32)
        matrix = np.array(obj.matrix_world)
        points = array(mesh.vertices, 'co', 3) @ matrix[:3, :3].T + matrix[:3, 3]
        normals = array(mesh.corner_normals, 'vector', 3)[loops] @ np.linalg.inv(matrix[:3, :3])
        normals /= np.maximum(np.linalg.norm(normals, axis=2, keepdims=True), 1e-8)
        material = mesh.materials[0]
        parts.append({'points': points[faces], 'uv': array(mesh.uv_layers.active.data, 'uv', 2)[loops],
                      'normals': normals, 'material': material, 'leaf': 'spray cards' in material.name,
                      'outer': 'outer' in mesh.name, 'name': mesh.name})
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    return parts, {'id': f'{species}/{variant}', 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'level': level}


def subset(part, mask):
    return {**part, **{key: part[key][mask] for key in ['points', 'uv', 'normals']}}


def transformed(parts, position, yaw, scale):
    c, s = np.cos(yaw), np.sin(yaw)
    matrix = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    return [{**part, 'points': part['points'] @ matrix.T * scale + position,
             'normals': part['normals'] @ matrix.T} for part in parts]


def section(triangles, height, previous):
    selected = triangles[(triangles[:, :, 2].min(axis=1) <= height) & (triangles[:, :, 2].max(axis=1) > height)]
    nodes, edges, lookup = [], [], {}
    for face in selected:
        crossings = []
        for a, b in [(0, 1), (1, 2), (2, 0)]:
            p, q = face[a], face[b]
            if (p[2] <= height < q[2]) or (q[2] <= height < p[2]):
                point = p[:2] + (q[:2] - p[:2]) * ((height - p[2]) / (q[2] - p[2]))
                key = tuple(np.round(point, 5))
                if key not in lookup:
                    lookup[key] = len(nodes); nodes.append(point)
                crossings.append(lookup[key])
        if len(crossings) == 2:
            edges.append(crossings)
    if not nodes:
        raise RuntimeError(f'No woody cross-section at {height}')
    adjacency = {i: set() for i in range(len(nodes))}
    for a, b in edges:
        adjacency[a].add(b); adjacency[b].add(a)
    unseen, groups = set(adjacency), []
    while unseen:
        pending, group = [unseen.pop()], []
        while pending:
            item = pending.pop(); group.append(item)
            for neighbor in adjacency[item] & unseen:
                unseen.remove(neighbor); pending.append(neighbor)
        if len(group) >= 3:
            groups.append(np.array(nodes)[group])
    if not groups:
        raise RuntimeError('No connected trunk contour')
    contour = min(groups, key=lambda pts: np.linalg.norm(np.median(pts, axis=0) - previous))
    center = np.median(contour, axis=0)
    radius = float(np.quantile(np.linalg.norm(contour - center, axis=1), .78))
    return center, max(radius, .025)


def trunk_mesh(parts, profile, height):
    part = next(p for p in parts if not p['leaf'])
    top = height * profile['trunkTipHeightFraction']
    levels = [max(.025, float(part['points'][:, :, 2].min()) + .01), min(.8, top*.12), top*.48, top]
    previous = np.array([0., 0.]); samples = []
    for h in np.unique(np.r_[np.linspace(levels[0], top, 45), levels]):
        previous, radius = section(part['points'], h, previous)
        if any(abs(h-z) < 1e-6 for z in levels):
            samples.append((h, previous.copy(), radius))
    vertices = []
    sides=profile['trunkSides']
    for h, center, radius in samples:
        for a in np.arange(sides)*np.pi*2/sides:
            vertices.append([center[0]+radius*np.cos(a), center[1]+radius*np.sin(a), h-levels[0]])
    vertices = np.array(vertices)
    faces = []
    for ring in range(3):
        for side in range(sides):
            a, b = ring*sides+side, ring*sides+(side+1)%sides
            faces.extend([(a,b,b+sides), (a,b+sides,a+sides)])
    uvs = []
    for face_index, face in enumerate(faces):
        side=(face_index//2)%sides
        for index in face:
            u=(index%sides)/sides
            if side==sides-1 and index%sides==0:u=1
            uvs.append([.03+.94*u,.03+.94*vertices[index,2]/(top-levels[0])])
    return vertices, faces, np.array(uvs), part['material'], top
