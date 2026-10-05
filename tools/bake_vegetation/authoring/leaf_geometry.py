# Builds opaque botanical leaf shells and connected petioles from retained canopy anchors.
import ast
import math
import random
from collections import Counter

import bpy
import numpy as np
from mathutils import Vector


PROFILES = {
    'plane': [.03, .29, .63, .79, .43, .59, .84, 1, .46, .35, .38, .19, .09, 0],
    'oak': [.03, .25, .46, .24, .72, .40, .96, .48, 1, .52, .88, .40, .61, .26, 0],
    'linden': [.03, .60, .86, .94, 1, .96, .91, .81, .69, .55, .40, .28, .16, 0],
    'viburnum': [.03, .42, .66, .81, .94, 1, .98, .91, .80, .64, .47, .30, .15, 0],
    'elm': [.02, .54, .80, .96, 1, .95, .84, .68, .48, .29, .13, 0]
}
LENGTH_RATIO = {'plane': 1.02, 'oak': 1.85, 'linden': 1.10, 'viburnum': 1.35, 'elm': 1.85}
PETIOLE = {'plane': .29, 'oak': .13, 'linden': .24, 'viburnum': .14, 'elm': .07}


def tube_template(length=1, radius=.006, sides=5):
    points = [(radius * math.cos(i * math.tau / sides), y, radius * math.sin(i * math.tau / sides))
              for y in [0, length] for i in range(sides)]
    faces = []
    for i in range(sides):
        j = (i + 1) % sides
        faces.extend([(i, sides + i, sides + j), (i, sides + j, j)])
    for i in range(1, sides - 1):
        faces.extend([(0, i, i + 1), (sides, sides + i + 1, sides + i)])
    return (np.array(points, np.float32), np.array(faces, np.int32),
            np.full((len(points), 2), .5, np.float32), np.zeros((len(points), 3), np.float32))


def blade_template(kind, form):
    rng = random.Random(582 + form * 41)
    profile = PROFILES[kind]
    points, rows, faces = [], [], []
    curl, twist = rng.uniform(-.12, .10), rng.uniform(-.075, .075)
    for row, width in enumerate(profile):
        t = row / (len(profile) - 1)
        ridge = .026 * math.sin(math.pi * t) - .055 * t * t + curl * t ** 3
        ring = []
        for x in ([0] if row in [0, len(profile) - 1] else [-.5, 0, .5]):
            skew = 1 + .055 * math.sin(t * 5 + form) * (1 if x > 0 else -1)
            px = x * width * skew
            py = t
            if kind == 'linden' and row == 1 and x:
                py -= .09
            if kind == 'elm' and x:
                py += (1 if x > 0 else -1) * .065 * (1 - t) ** 3
                px *= 1 + (1 if x > 0 else -1) * .08 * (1 - t)
            z = ridge + .12 * px * px * math.sin(math.pi * t) + twist * px * t
            ring.append(len(points)); points.append((px, py, z))
        rows.append(ring)
    for a, b in zip(rows[:-1], rows[1:]):
        if len(a) == 1:
            faces.extend([(a[0], b[1], b[0]), (a[0], b[2], b[1])])
        elif len(b) == 1:
            faces.extend([(a[0], a[1], b[0]), (a[1], a[2], b[0])])
        else:
            for i in range(2):
                faces.extend([(a[i], a[i + 1], b[i + 1]), (a[i], b[i + 1], b[i])])
    if kind in ['linden', 'viburnum', 'elm']:
        edges = []
        for row in range(1, len(rows) - 2):
            edges.extend([(rows[row][0], rows[row + 1][0], -1), (rows[row][2], rows[row + 1][2], 1)])
        for a, b, sign in edges:
            point = (np.array(points[a]) + np.array(points[b])) * .5
            point[0] += sign * .022
            tooth = len(points); points.append(tuple(point))
            for index, triangle in enumerate(faces):
                if a in triangle and b in triangle:
                    other = next(vertex for vertex in triangle if vertex not in [a, b])
                    order = [(triangle[i], triangle[(i + 1) % 3]) for i in range(3)]
                    first, second = (a, b) if (a, b) in order else (b, a)
                    faces[index] = (first, tooth, other)
                    faces.append((tooth, second, other))
                    break
            if kind == 'elm':
                small = np.array(points[a]) * .56 + np.array(points[tooth]) * .44
                small[0] += sign * .008
                secondary = len(points); points.append(tuple(small))
                for index, triangle in enumerate(faces):
                    if a in triangle and tooth in triangle:
                        other = next(vertex for vertex in triangle if vertex not in [a, tooth])
                        order = [(triangle[i], triangle[(i + 1) % 3]) for i in range(3)]
                        first, second = (a, tooth) if (a, tooth) in order else (tooth, a)
                        faces[index] = (first, secondary, other)
                        faces.append((secondary, second, other))
                        break
    top = np.array(points, np.float32)
    top[:, 2] += .00125
    bottom = top.copy(); bottom[:, 2] -= .0025
    count = len(top)
    edge_counts = Counter(tuple(sorted((triangle[i], triangle[(i + 1) % 3]))) for triangle in faces for i in range(3))
    boundary = [(triangle[i], triangle[(i + 1) % 3]) for triangle in faces for i in range(3)
                if edge_counts[tuple(sorted((triangle[i], triangle[(i + 1) % 3])))] == 1]
    closed = list(faces) + [tuple(vertex + count for vertex in reversed(triangle)) for triangle in faces]
    for a, b in boundary:
        closed.extend([(b, a, a + count), (b, a + count, b + count)])
    uv = np.column_stack([np.clip(.03 + (top[:, 0] + .5) * .94, .015, .985), .53 + top[:, 1] * .44])
    back_uv = uv.copy(); back_uv[:, 1] -= .5
    positions = np.concatenate([top, bottom])
    uvs = np.concatenate([uv, back_uv]).astype(np.float32)
    px, t = top[:, 0], top[:, 1]
    dx = .24 * px * np.sin(math.pi * t) + twist * t
    dy = (.026 * math.pi * np.cos(math.pi * t) - .110 * t + 3 * curl * t * t
          + .12 * px * px * math.pi * np.cos(math.pi * t) + twist * px)
    surface_normals = np.column_stack([-dx, -dy, np.ones(count)]).astype(np.float32)
    normals = np.concatenate([surface_normals, -surface_normals])
    petiole = PETIOLE[kind]
    stalk, stalk_faces, stalk_uv, stalk_normals = tube_template(length=petiole + .014, radius=.0055)
    stalk[:, 1] -= petiole
    closed = np.concatenate([np.array(closed, np.int32), stalk_faces + len(positions)])
    positions = np.concatenate([positions, stalk]); uvs = np.concatenate([uvs, stalk_uv])
    normals = np.concatenate([normals, stalk_normals])
    counts = Counter(tuple(sorted((int(t[i]), int(t[(i + 1) % 3])))) for t in closed for i in range(3))
    if any(value != 2 for value in counts.values()):
        raise RuntimeError('Leaf template must have closed blade and petiole surfaces')
    area = np.cross(positions[closed[:, 1]] - positions[closed[:, 0]], positions[closed[:, 2]] - positions[closed[:, 0]])
    if np.min(np.linalg.norm(area, axis=1)) < 1e-10:
        raise RuntimeError('Degenerate leaf template triangle')
    return positions, closed, uvs, normals


def bulk_mesh(name, instances, templates, material):
    vertex_count = sum(len(templates[index][0]) for index, _, _, _ in instances)
    face_count = sum(len(templates[index][1]) for index, _, _, _ in instances)
    positions = np.empty((vertex_count, 3), np.float32)
    uvs = np.empty((vertex_count, 2), np.float32)
    colors = np.ones((vertex_count, 4), np.float32)
    normals = np.empty((vertex_count, 3), np.float32)
    faces = np.empty((face_count, 3), np.int32)
    v, f = 0, 0
    for index, matrix, origin, tint in instances:
        points, triangles, uv, template_normals = templates[index]
        size, count = len(points), len(triangles)
        positions[v:v + size] = points @ matrix.T + origin
        colors[v:v + size, :3] = tint
        uvs[v:v + size] = uv
        transformed = template_normals @ np.linalg.inv(matrix)
        normals[v:v + size] = transformed / np.maximum(np.linalg.norm(transformed, axis=1, keepdims=True), 1e-12)
        faces[f:f + count] = triangles + v
        v += size; f += count
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(vertex_count); mesh.vertices.foreach_set('co', positions.ravel())
    mesh.loops.add(face_count * 3); mesh.loops.foreach_set('vertex_index', faces.ravel())
    mesh.polygons.add(face_count)
    mesh.polygons.foreach_set('loop_start', np.arange(face_count, dtype=np.int32) * 3)
    mesh.polygons.foreach_set('loop_total', np.full(face_count, 3, np.int32))
    mesh.polygons.foreach_set('use_smooth', np.ones(face_count, bool))
    uv_layer = mesh.uv_layers.new(name='UVMap'); uv_layer.data.foreach_set('uv', uvs[faces.ravel()].ravel())
    color = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
    color.data.foreach_set('color', colors.ravel())
    mesh.materials.append(material); mesh.update()
    mesh.normals_split_custom_set_from_vertices(normals)
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    return obj, positions


def foliage_instances(clusters, variant, recipe):
    """Shared deterministic leaf transforms for merged exports and instanced renders."""
    kind = recipe['texture']['leaf']
    templates = [blade_template(kind, form) for form in range(8)]
    templates.append(tube_template(radius=1))
    instances, leaf_count, hero = [], 0, None
    rng = random.Random(variant['seed'] + 582000)
    low, high = recipe['growth']['leafWidthMetres']
    per_cluster = recipe['texture']['leafCount']
    def branch(start, end, radius):
        delta = end - start; direction = delta.normalized()
        side = direction.cross(Vector((0, 0, 1)) if abs(direction.z) < .9 else Vector((1, 0, 0))).normalized()
        normal = side.cross(direction).normalized()
        matrix = np.array([side * radius, delta, normal * radius]).T
        instances.append((8, matrix, np.array(start), np.array([.94, .94, .94])))
    for cluster in clusters:
        center, u, v, normal = [Vector(cluster[name]) for name in ['center', 'u', 'v', 'normal']]
        height = cluster['height']
        center.z = max(center.z, height * .45 + high * LENGTH_RATIO[kind] * .65)
        start = center - v * height * .38
        end = center + v * height * .45
        branch(Vector(cluster['attachment']), start, .0017 if kind != 'viburnum' else .0011)
        branch(start, end, .0015 if kind != 'viburnum' else .0010)
        for leaf in range(per_cluster):
            sign = -1 if leaf % 2 == 0 else 1
            f = (.13 + (leaf // 2) / max(1, (per_cluster - 1) // 2) * .75) if kind == 'viburnum' else .08 + .85 * leaf / (per_cluster - 1)
            attachment = start.lerp(end, f)
            direction = (u * sign * .85 + v * rng.uniform(.25, .65) + normal * rng.uniform(-.22, .22)).normalized()
            facing = Vector((0, 0, 1)) - direction * direction.z
            if facing.length < .01:
                facing = normal - direction * direction.dot(normal)
            facing.normalize()
            side = direction.cross(facing).normalized()
            roll = rng.uniform(-.72, .72)
            face = facing * math.cos(roll) + side * math.sin(roll)
            side = direction.cross(face).normalized()
            width = rng.uniform(low, high)
            length = width * LENGTH_RATIO[kind] * rng.uniform(.91, 1.08)
            origin = attachment + direction * (PETIOLE[kind] * length)
            matrix = np.array([side * width, direction * length, face * length]).T
            tint = rng.uniform(.78, 1.0) * np.array([rng.uniform(.94, 1), 1, rng.uniform(.90, 1)])
            form = rng.randrange(8)
            instances.append((form, matrix, np.array(origin), tint))
            leaf_count += 1
            sample = origin + direction * length * .45
            if hero is None or sample.y < hero[1]:
                hero = [float(sample.x), float(sample.y), float(sample.z), float(length)]
    return instances, templates, leaf_count, hero


def create_solid_foliage(original, variant, recipe):
    clusters = ast.literal_eval(original['leaf_clusters'])
    instances, templates, leaf_count, hero = foliage_instances(clusters, variant, recipe)
    obj, positions = bulk_mesh('foliage', instances, templates, original.data.materials[0])
    if np.min(positions[:, 2]) < -.00001:
        raise RuntimeError('Solid foliage extends below ground')
    bpy.data.objects.remove(original, do_unlink=True)
    minimum, maximum = np.min(positions, axis=0), np.max(positions, axis=0)
    detail = {'representation': 'solid-leaves-v1', 'leafCount': leaf_count, 'clusterCount': len(clusters),
              'leafTriangles': len(obj.data.polygons), 'templateTriangles': len(templates[0][1]),
              'shapeVariants': 8, 'closedBlades': True, 'closedPetioles': True, 'alphaPlates': 0,
              'thicknessLengthRatio': .0025, 'upperLowerSurfaces': True, 'heroLeaf': hero,
              'bounds': {'min': minimum.tolist(), 'max': maximum.tolist()},
              'templateBoundaryEdges': 0, 'templateNonManifoldEdges': 0,
              'sourceClusterCount': len(clusters)}
    return obj, detail


def create_leaf_study(recipe, material):
    kind = recipe['texture']['leaf']
    templates = [blade_template(kind, form) for form in range(8)]
    width = sum(recipe['growth']['leafWidthMetres']) * .5
    length = width * LENGTH_RATIO[kind]
    instances = []
    for form in range(8):
        underside = form >= 4
        side = -1 if underside else 1
        matrix = np.array([[width * side, 0, 0], [0, 0, -length * side], [0, length, 0]], np.float32)
        origin = np.array([(form % 4 - 1.5) * width * 1.65, 0, .055 + (form // 4) * length * 1.5])
        instances.append((form, matrix, origin, np.ones(3)))
    obj, _ = bulk_mesh('foliage', instances, templates, material)
    return obj
