"""Connected surface islands with explicit planar fallback for singular UV projections."""
import json
import math
import sys
import time
from pathlib import Path
from collections import defaultdict
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bake import open_verified_package
from reconstruct import _build_mesh


def subtract(a, b):
    return tuple(x - y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def planar(points):
    edge = subtract(points[1], points[0])
    length = math.sqrt(dot(edge, edge))
    normal = cross(edge, subtract(points[2], points[0]))
    magnitude = math.sqrt(dot(normal, normal))
    if magnitude == 0:
        return None, 0
    right = tuple(x / length for x in edge)
    up = cross(tuple(x / magnitude for x in normal), right)
    return [[dot(subtract(p, points[0]), right), dot(subtract(p, points[0]), up)] for p in points], magnitude / 2


def unwrap_mapping(package, geometry, mapping, instance, angle, cache):
    matrix = instance['matrixBlenderWorld']
    key = (geometry['id'], mapping['start'], mapping['count'], tuple(matrix[i] for i in [0,1,2,4,5,6,8,9,10]))
    if key in cache:
        return cache[key]
    source, _ = _build_mesh(package, {**geometry, 'attributes': {'position': geometry['attributes']['position']}},
                            ((mapping['start'], mapping['count'], 0),))
    vertices, lookup, faces, original = [], {}, [], []
    for polygon in source.polygons:
        points, face = [], []
        for index in polygon.vertices:
            v = source.vertices[index].co
            point = tuple(sum(matrix[c*4+r]*v[c] for c in range(3)) for r in range(3))
            points.append(point)
            if point not in lookup:
                lookup[point] = len(vertices); vertices.append(point)
            face.append(lookup[point])
        faces.append(face); original.append(planar(points))
    bpy.data.meshes.remove(source)
    mesh = bpy.data.meshes.new('receiver'); mesh.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new('receiver', mesh); bpy.context.scene.collection.objects.link(obj)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=0,
                            area_weight=0, correct_aspect=False, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    if len(mesh.polygons) != mapping['count'] // 3:
        raise ValueError('Unwrap changed triangle inventory: ' + mapping['id'])
    uv = mesh.uv_layers.active.data
    parent = list(range(len(mesh.polygons)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i

    edges, triangles, fallback, degenerate = {}, {}, [], []
    for polygon in mesh.polygons:
        offset = mapping['start'] + polygon.index * 3
        projected, area = original[polygon.index]
        if area == 0:
            degenerate.append(offset); continue
        points = [tuple(uv[loop].uv) for loop in polygon.loop_indices]
        uv_area = abs((points[1][0]-points[0][0])*(points[2][1]-points[0][1]) - (points[1][1]-points[0][1])*(points[2][0]-points[0][0])) / 2
        if uv_area == 0:
            fallback.append([{'offset': offset, 'uv': projected, 'area': area, 'uvArea': area}]); continue
        triangles[polygon.index] = {'offset': offset, 'uv': points, 'area': area, 'uvArea': uv_area}
        keys = [(vertex, *point) for vertex, point in zip(polygon.vertices, points)]
        for corner in range(3):
            edge = tuple(sorted([keys[corner], keys[(corner+1)%3]]))
            if edge in edges: parent[root(polygon.index)] = root(edges[edge])
            else: edges[edge] = polygon.index
    islands = defaultdict(list)
    for index, triangle in triangles.items(): islands[root(index)].append(triangle)
    result = []
    for island in list(islands.values()) + fallback:
        area = sum(t['area'] for t in island)
        scale = math.sqrt(area / sum(t['uvArea'] for t in island))
        scaled = [{'offset': t['offset'], 'area': t['area'], 'uv': [[u*scale,v*scale] for u,v in t['uv']]} for t in island]
        result.append({'triangles': scaled, 'area': area,
            'min': [min(p[c] for t in scaled for p in t['uv']) for c in range(2)],
            'max': [max(p[c] for t in scaled for p in t['uv']) for c in range(2)]})
    bpy.data.objects.remove(obj, do_unlink=True); bpy.data.meshes.remove(mesh)
    cache[key] = (result, degenerate, len(fallback))
    return cache[key]


def main():
    stage = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
    job = json.loads((stage / 'unwrap-job.json').read_text())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    started = time.monotonic(); cache, charts, degenerates = {}, [], []
    fallbacks = 0
    with open_verified_package(stage / 'source.bsib', job['packageSha256']) as package:
        manifest = package.manifest
        geometries = {g['id']: g for g in manifest['geometries']}
        instances = {i['id']: i for i in manifest['meshInstances']}
        mappings = {m['id']: m for m in manifest['receiverMappings']}
        for index, mapping_id in enumerate(job['receivers']):
            mapping = mappings[mapping_id]
            result, degenerate, fallback = unwrap_mapping(package, geometries[mapping['geometryId']], mapping,
                                                         instances[mapping['meshInstanceId']], job['angleDegrees'], cache)
            fallbacks += fallback
            if degenerate: degenerates.append({'mappingId': mapping_id, 'offsets': degenerate})
            for island, chart in enumerate(result):
                charts.append({**chart, 'id': mapping_id + '/island/' + str(island), 'mappingId': mapping_id})
            if index % 500 == 0:
                print(json.dumps({'phase': 'unwrap', 'mapping': index, 'total': len(job['receivers']), 'charts': len(charts)}), flush=True)
        result = {'schema': 'blender-smart-project-v1', 'sourceHash': manifest['hashes']['resolvedSource'],
                  'angleDegrees': job['angleDegrees'], 'charts': charts, 'degenerates': degenerates,
                  'fallbackTriangles': fallbacks, 'seconds': time.monotonic()-started}
        with (stage / 'receiver-layout.json').open('w') as output: json.dump(result, output, separators=(',', ':'))
        print(json.dumps({'phase': 'unwrap_complete', 'charts': len(charts), 'fallbackTriangles': fallbacks, 'seconds': result['seconds']}), flush=True)


if __name__ == '__main__': main()
