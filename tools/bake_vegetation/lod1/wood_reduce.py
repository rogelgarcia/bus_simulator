# Simplifies branch surfaces with bounded edge collapses, preserving forks and exposed stems.
import heapq

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def simplify(source, target, pinned):
    mesh = source.data
    mesh.calc_loop_triangles()
    points = np.array([v.co[:] for v in mesh.vertices], dtype=np.float64)
    original = points.copy()
    lineage = [{i} for i in range(len(points))]
    faces = np.array([p.vertices[:] for p in mesh.loop_triangles], dtype=np.int32)
    alive = np.ones(len(faces), dtype=bool)
    active = np.ones(len(points), dtype=bool)
    version = np.zeros(len(points), dtype=np.int32)
    incident = [set() for _ in points]
    for index, face in enumerate(faces):
        for vertex in face: incident[vertex].add(index)
    tree = BVHTree.FromPolygons([Vector(p) for p in points], faces.tolist(), all_triangles=True)
    normals = np.cross(points[faces[:, 1]]-points[faces[:, 0]], points[faces[:, 2]]-points[faces[:, 0]])
    lengths = np.linalg.norm(normals, axis=1)
    normals /= np.maximum(lengths[:, None], 1e-20)
    plane = np.column_stack((normals, -np.sum(normals*points[faces[:, 0]], axis=1)))
    quadrics = np.zeros((len(points), 4, 4))
    for index, face in enumerate(faces):
        quadric = np.outer(plane[index], plane[index]) * max(lengths[index], 1e-5)
        for vertex in face: quadrics[vertex] += quadric
    heap = []

    def neighbors(vertex):
        return {int(v) for f in incident[vertex] for v in faces[f] if v != vertex}

    def candidate(a, b):
        if a in pinned and b in pinned: return None
        quadric = quadrics[a]+quadrics[b]
        # Constrain the minimizer to its source edge; unbounded QEM creates branch fins.
        delta = np.append(points[b]-points[a], 0.)
        start = np.append(points[a], 1.)
        denominator = delta @ quadric @ delta
        t = float(np.clip(-(delta @ quadric @ start)/denominator, 0, 1)) if denominator > 1e-20 else .5
        if a in pinned: t = 0.
        if b in pinned: t = 1.
        position = points[a]*(1-t)+points[b]*t
        homogeneous = np.append(position, 1.)
        cost = max(0., float(homogeneous @ quadric @ homogeneous))
        # Stable tie breaking also favors short edges in nearly planar areas.
        cost += float(np.sum((points[b]-points[a])**2))*1e-9
        return cost, position

    def push(a, b):
        if a > b: a, b = b, a
        if not active[a] or not active[b]: return
        result = candidate(a, b)
        if result is not None: heapq.heappush(heap, (result[0], a, b, int(version[a]), int(version[b])))

    for a in range(len(points)):
        for b in neighbors(a):
            if a < b: push(a, b)
    count = len(faces)
    rejected = 0
    while heap and count > target:
        _, a, b, va, vb = heapq.heappop(heap)
        if not active[a] or not active[b] or va != version[a] or vb != version[b]: continue
        shared = incident[a] & incident[b]
        if len(shared) != 2: continue
        opposite = {int(v) for f in shared for v in faces[f] if v != a and v != b}
        if neighbors(a) & neighbors(b) != opposite: continue
        result = candidate(a, b)
        if result is None: continue
        affected = incident[a] | incident[b]
        surviving = sorted(affected-shared)
        ids = faces[surviving]
        alternatives = [result[1]]
        if a not in pinned and b not in pinned:
            alternatives.extend([points[a], points[b], (points[a]+points[b])*.5])
        valid = False
        for position in alternatives:
            coords = points[ids].copy()
            coords[(ids == a) | (ids == b)] = position
            cross = np.cross(coords[:, 1]-coords[:, 0], coords[:, 2]-coords[:, 0])
            magnitudes = np.linalg.norm(cross, axis=1)
            unit = cross/np.maximum(magnitudes[:, None], 1e-20)
            # Reject folds, inverted surfaces and faces stretched across empty crotches.
            valid = np.all(magnitudes > 1e-10) and np.all(np.sum(unit*normals[surviving], axis=1) > .01)
            if valid:
                samples = np.concatenate((coords.mean(axis=1), (coords[:, 0]+coords[:, 1])*.5,
                                          (coords[:, 1]+coords[:, 2])*.5, (coords[:, 2]+coords[:, 0])*.5))
                valid = all(tree.find_nearest(Vector(p))[3] <= .085 for p in samples)
            if valid:
                local = BVHTree.FromPolygons([Vector(p) for p in coords.reshape((-1, 3))],
                                            np.arange(len(coords)*3).reshape((-1, 3)).tolist(), all_triangles=True)
                valid = all(local.find_nearest(Vector(original[i]))[3] <= .12 for i in lineage[a] | lineage[b])
            if valid: break
        if not valid:
            rejected += 1
            continue
        # Keep the protected endpoint's index so the original lower-trunk vertices survive exactly.
        if b in pinned: a, b = b, a
        touched = {int(v) for f in affected for v in faces[f]}
        for f in affected:
            for v in faces[f]: incident[v].discard(f)
        alive[list(shared)] = False
        count -= len(shared)
        points[a] = position
        quadrics[a] += quadrics[b]
        lineage[a].update(lineage[b]); lineage[b].clear()
        active[b] = False
        for f in surviving:
            faces[f][faces[f] == b] = a
            for v in faces[f]: incident[v].add(f)
        for v in touched: version[v] += 1
        for v in touched:
            if active[v]:
                for other in neighbors(v): push(v, other)
    kept = np.flatnonzero(active)
    remap = np.full(len(points), -1, dtype=np.int32); remap[kept] = np.arange(len(kept))
    result = bpy.data.meshes.new('Bounded LOD1 branch collapse')
    result.from_pydata(points[kept].tolist(), [], remap[faces[alive]].tolist())
    result.update()
    print(f'[LOD1] Bounded collapse: {len(faces)} -> {count}; {rejected} shape-changing proposals rejected', flush=True)
    return result
