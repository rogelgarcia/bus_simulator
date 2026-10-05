# Builds fused woody volumes, organic roots and genuine species-specific bark relief.
import ast
import math
import random

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

from bark_fields import bark_color, sample_bark
from shrub_wood import shape_stems


def frame(direction, reference=None):
    direction = direction.normalized()
    if reference is None:
        reference = Vector((0, 0, 1)) if abs(direction.z) < .9 else Vector((1, 0, 0))
    side = direction.cross(reference).normalized()
    return side, direction.cross(side).normalized()


def smooth_path(path):
    points = [Vector(point) for point in path['points']]
    radii = path['radii']
    result, widths = [], []
    for i in range(len(points) - 1):
        a, b, c, d = points[max(0, i - 1)], points[i], points[i + 1], points[min(len(points) - 1, i + 2)]
        steps = max(2, int((c - b).length / .09))
        for j in range(steps):
            t = j / steps
            result.append((2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t
                           + (-a + 3 * b - 3 * c + d) * t * t * t) * .5)
            widths.append(radii[i] * (1 - t) + radii[i + 1] * t)
    result.append(points[-1])
    widths.append(radii[-1])
    return result, widths


def add_volume(vertices, faces, path, index, seed, basal):
    points, widths = smooth_path(path)
    rings = []
    sides = 48 if widths[0] > .09 else 20
    direction = (points[-1] - points[0]).normalized()
    reference = Vector((0, 0, 1)) if abs(direction.z) < .9 else Vector((1, 0, 0))
    flare = root_flare(path.get('root_seed', seed)) if basal else []
    for i, (point, radius) in enumerate(zip(points, widths)):
        direction = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
        side, across = frame(direction, reference)
        ring = []
        for spoke in range(sides):
            angle = math.tau * spoke / sides
            growth = 1 + .025 * math.sin(angle * 3 + point.z * .8 + seed) + .018 * math.sin(angle * 5 - point.z * .6)
            if path.get('basal'):
                growth += .13 * math.cos(2 * angle + path['oval_phase'] + point.z * 2.1)
            if basal:
                outward = side * math.cos(angle) + across * math.sin(angle)
                azimuth = math.atan2(outward.y, outward.x)
                lobes = sum(strength * math.exp(-(math.atan2(math.sin(azimuth - direction), math.cos(azimuth - direction)) / width) ** 2)
                            for direction, strength, width in flare)
                if path.get('basal'):
                    growth += (.20 + lobes * 1.35) * max(0, 1 - math.sqrt(max(0, point.z) / .18)) ** 1.4
                else:
                    growth += (.10 + lobes) * max(0, 1 - max(0, point.z) / (widths[0] * 3)) ** 3
            ring.append(len(vertices))
            vertices.append(tuple(point + (side * math.cos(angle) + across * math.sin(angle)) * radius * growth))
        rings.append(ring)
    for lower, upper in zip(rings[:-1], rings[1:]):
        for spoke in range(sides):
            faces.append((lower[spoke], lower[(spoke + 1) % sides], upper[(spoke + 1) % sides], upper[spoke]))
    faces.append(tuple(reversed(rings[0])))
    faces.append(tuple(rings[-1]))


def root_flare(seed):
    rng = random.Random(seed + 913)
    return [(index * math.tau / 5 + rng.uniform(-.38, .38), rng.uniform(.45, 1.18), rng.uniform(.28, .48))
            for index in range(5)]


def branch_charts(paths):
    segments = []
    for branch, path in enumerate(paths):
        distance = 0
        points = [Vector(point) for point in path['points']]
        overall = (points[-1] - points[0]).normalized()
        reference = Vector((0, 0, 1)) if abs(overall.z) < .9 else Vector((1, 0, 0))
        for index in range(len(points) - 1):
            start, end = points[index], points[index + 1]
            delta = end - start
            length = delta.length
            side, across = frame(delta, reference)
            repeats = max(1, round(math.tau * path['radii'][0] / 1.65))
            segments.append((tuple(start), tuple(delta), length, path['radii'][index], path['radii'][index + 1],
                             distance, path['phase'], tuple(side), tuple(across), branch, repeats))
            distance += length
    return segments


def project_charts(coordinates, paths):
    grouped = [[] for path in paths]
    for segment in branch_charts(paths):
        grouped[segment[-2]].append(segment)
    count = len(coordinates)
    uv = np.empty((count, 2), dtype=np.float32)
    radius = np.empty(count, dtype=np.float32)
    branch = np.empty(count, dtype=np.int32)
    adjacent_uv = np.empty((count, 2), dtype=np.float32)
    blend = np.empty(count, dtype=np.float32)
    for offset in range(0, count, 24000):
        points = coordinates[offset:offset + 24000]
        best = np.full(len(points), np.inf)
        second = best.copy()
        local_uv = np.zeros((len(points), 2), dtype=np.float32)
        next_uv = local_uv.copy()
        local_radius = np.zeros(len(points), dtype=np.float32)
        for path_id, segments in enumerate(grouped):
            nearest_axis = np.full(len(points), np.inf)
            branch_uv = np.empty((len(points), 2), dtype=np.float32)
            branch_radius = np.empty(len(points), dtype=np.float32)
            valid_shaft = np.ones(len(points), dtype=bool)
            for segment_id, (start, delta, length, ra, rb, distance, phase, side, across, branch_id, repeats) in enumerate(segments):
                start, delta = np.array(start), np.array(delta)
                unbounded = (points - start) @ delta / (length * length)
                fraction = np.clip(unbounded, 0, 1)
                radial = points - start - fraction[:, None] * delta
                axis_distance = np.sum(radial * radial, axis=1)
                local = axis_distance < nearest_axis
                nearest_axis[local] = axis_distance[local]
                angle = np.arctan2(radial[local] @ np.array(across), radial[local] @ np.array(side))
                branch_uv[local, 0] = phase + angle / math.tau * repeats
                branch_uv[local, 1] = ((distance + fraction[local] * length) / paths[path_id].get('texture_v_metres', 2.2)
                                       + paths[path_id].get('texture_v_offset', 0))
                branch_radius[local] = ra + (rb - ra) * fraction[local]
                valid_shaft[local] = (unbounded[local] >= 0) if segment_id == 0 and paths[path_id]['parent'] >= 0 else True
            score = np.abs(np.sqrt(nearest_axis) - branch_radius)
            if paths[path_id].get('basal'):
                axis = np.array(paths[path_id]['points'])
                center_x = np.interp(points[:, 2], axis[:, 2], axis[:, 0])
                center_y = np.interp(points[:, 2], axis[:, 2], axis[:, 1])
                branch_uv[:, 0] = paths[path_id]['phase'] + np.arctan2(points[:, 1] - center_y, points[:, 0] - center_x) / math.tau
                branch_uv[:, 1] = points[:, 2] / paths[path_id]['texture_v_metres'] + paths[path_id]['texture_v_offset']
            score[~valid_shaft] = np.inf
            select = score < best
            alternate = (score < second) & ~select
            second[alternate] = score[alternate]
            next_uv[alternate] = branch_uv[alternate]
            second[select] = best[select]
            next_uv[select] = local_uv[select]
            if not np.any(select):
                continue
            best[select] = score[select]
            local_uv[select] = branch_uv[select]
            local_radius[select] = branch_radius[select]
            branch[offset:offset + len(points)][select] = branch_id
        width = np.clip(local_radius * .5, .035, .16)
        progress = np.clip((second - best) / width, 0, 1)
        target = slice(offset, offset + len(points))
        uv[target], adjacent_uv[target], radius[target] = local_uv, next_uv, local_radius
        blend[target] = .5 * (1 - progress * progress * (3 - 2 * progress))
    return uv, radius, branch, adjacent_uv, blend


def topology(mesh, prune=False, kind='tree'):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    boundary = sum(edge.is_boundary for edge in bm.edges)
    nonmanifold = sum(not edge.is_manifold for edge in bm.edges)
    remaining = set(bm.verts)
    components = []
    while remaining:
        stack = [remaining.pop()]
        component = stack.copy()
        while stack:
            vertex = stack.pop()
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other in remaining:
                    remaining.remove(other)
                    stack.append(other)
                    component.append(other)
        components.append(component)
    removed, removed_volume, removed_extent = [], 0, 0
    if prune:
        components.sort(key=len, reverse=True)
        kept = []
        for index, component in enumerate(components):
            ground = any(abs(vertex.co.z) < .00001 for vertex in component)
            if index == 0 or (kind == 'shrub' and ground):
                kept.append(component)
                continue
            extent = max(max(vertex.co[axis] for vertex in component) - min(vertex.co[axis] for vertex in component) for axis in range(3))
            if len(component) > 256 or extent > .065:
                raise RuntimeError(f'Substantive disconnected woody component: {len(component)} vertices, {extent:.4f}m extent')
            removed.extend(component)
            removed_extent = max(removed_extent, extent)
            component_faces = {face for vertex in component for face in vertex.link_faces}
            component_volume = 0
            reference = component[0].co.copy()
            for face in component_faces:
                origin = face.verts[0].co - reference
                for j in range(1, len(face.verts) - 1):
                    component_volume += origin.dot((face.verts[j].co - reference).cross(face.verts[j + 1].co - reference)) / 6
            removed_volume += abs(component_volume)
        if len(removed) > len(bm.verts) * .02:
            raise RuntimeError('Voxel debris exceeds 2% of authored woody vertices')
        if removed:
            bmesh.ops.delete(bm, geom=removed, context='VERTS')
            bm.to_mesh(mesh)
        removed_count = len(components) - len(kept)
        components = kept
    else:
        removed_count = 0
    bm.free()
    return len(components), boundary, nonmanifold, {'removedFragmentCount': removed_count,
        'removedFragmentVertices': len(removed), 'removedFragmentMaxExtentMetres': removed_extent,
        'removedFragmentVolumeCubicMetres': removed_volume}


def displaced_coordinates(mesh, coordinates, normals, depth):
    mesh.calc_loop_triangles()
    triangles = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int32)
    mesh.loop_triangles.foreach_get('vertices', triangles)
    triangles = triangles.reshape((-1, 3))
    damped = set()
    for attempt in range(12):
        result = np.asarray(coordinates + normals * depth[:, None], dtype=coordinates.dtype)
        invalid = []
        for offset in range(0, len(triangles), 64000):
            indices = triangles[offset:offset + 64000]
            before, after = coordinates[indices].astype(np.float64), result[indices].astype(np.float64)
            a = np.cross(before[:, 1] - before[:, 0], before[:, 2] - before[:, 0])
            b = np.cross(after[:, 1] - after[:, 0], after[:, 2] - after[:, 0])
            invalid.extend(indices[np.sum(a * b, axis=1) < -1e-20].ravel())
        if not invalid:
            return result, len(damped)
        selected = np.unique(invalid)
        damped.update(selected.tolist())
        depth[selected] *= .35
    raise RuntimeError(f'Geometric bark relief reverses face orientations at {len(selected)} vertices; sample {coordinates[selected[:3]].tolist()}')


def detail_wood(obj, variant, recipe, scanned_surface=None, junction_builder=None, junction_surface=None):
    settings = recipe['woodyDetail']
    paths = ast.literal_eval(obj['wood_paths'])
    shrub_detail = shape_stems(paths, variant) if recipe['kind'] == 'shrub' else {}
    seated_origins, largest_seating = 0, 0
    # Bury narrow branch starts inside parent wood, avoiding the old projecting tube cap lips.
    for index, path in enumerate(paths):
        start = Vector(path['points'][0])
        path['parent'] = -1
        parent_radius = 0
        nearest_parent = None
        for parent_index, parent in enumerate(paths[:index]):
            for segment in range(len(parent['points']) - 1):
                a, b = Vector(parent['points'][segment]), Vector(parent['points'][segment + 1])
                t = max(0, min(1, (start - a).dot(b - a) / (b - a).length_squared))
                r = parent['radii'][segment] * (1 - t) + parent['radii'][segment + 1] * t
                center = a.lerp(b, t)
                distance = (start - center).length
                if nearest_parent is None or distance - r < nearest_parent[0]:
                    nearest_parent = (distance - r, center, r, distance, parent_index)
                if distance < r * .9:
                    parent_radius = max(parent_radius, r)
        if not parent_radius and nearest_parent and start.z > .05 and settings.get('seatDetachedOrigins', False):
            if nearest_parent[3] > .5:
                raise RuntimeError('Detached branch origin exceeds the bounded parent-seating distance')
            start, parent_radius = nearest_parent[1], nearest_parent[2]
            path['points'][0] = tuple(start)
            seated_origins += 1
            largest_seating = max(largest_seating, nearest_parent[3])
        if nearest_parent and start.z > .05:
            path['parent'] = nearest_parent[4]
        if parent_radius:
            scale = min(1, parent_radius * .80 / path['radii'][0])
            path['radii'] = [radius * scale for radius in path['radii']]
            direction = (Vector(path['points'][1]) - start).normalized()
            path['points'][0] = tuple(start - direction * min(parent_radius * .4, .08))
    minimum_tip_radius = settings['voxelSizeMetres'] * 1.25
    for path in paths:
        path['radii'] = [max(radius, minimum_tip_radius) for radius in path['radii']]
    vertices, faces = [], []
    for index, path in enumerate(paths):
        add_volume(vertices, faces, path, index, variant['seed'], path.get('basal', index == 0 and recipe['kind'] == 'tree'))
    junction_info = junction_builder(vertices, faces, paths, variant, recipe) if junction_builder else {}
    original = obj.data
    mesh = bpy.data.meshes.new('Fused_woody_source')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(original.materials[0])
    obj.data = mesh
    bpy.data.meshes.remove(original)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    modifier = obj.modifiers.new('Continuous branch unions', 'REMESH')
    modifier.mode = 'VOXEL'
    modifier.voxel_size = settings['voxelSizeMetres']
    modifier.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier = obj.modifiers.new('Organic collar smoothing', 'SMOOTH')
    modifier.factor = .65
    modifier.iterations = 5
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                          plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True, dist=.000001)
    ground_edges = [edge for edge in bm.edges if edge.is_boundary and all(abs(vertex.co.z) < .00001 for vertex in edge.verts)]
    if ground_edges:
        bmesh.ops.holes_fill(bm, edges=ground_edges, sides=0)
    for vertex in bm.verts:
        if abs(vertex.co.z) < .00001:
            vertex.co.z = 0
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    _, _, _, crumbs = topology(mesh, prune=True, kind=recipe['kind'])
    mesh.update()
    count = len(mesh.vertices)
    print(f"[Woody detail] {variant['id']}: fused {len(paths)} volumes, {count} vertices", flush=True)
    coordinates = np.empty(count * 3, dtype=np.float32)
    mesh.vertices.foreach_get('co', coordinates)
    coordinates = coordinates.reshape((-1, 3))
    normals = np.empty(count * 3, dtype=np.float32)
    mesh.vertices.foreach_get('normal', normals)
    normals = normals.reshape((-1, 3))
    if scanned_surface:
        # Review-only surface revision: reconstruct the clean fused skeleton before scan relief.
        field, surface_info = scanned_surface(coordinates, normals)
        depth = settings['reliefMetres'] * (field - .5)
        if junction_surface:
            depth += junction_surface(coordinates, junction_info)
        depth *= np.clip(coordinates[:, 2] / (settings['voxelSizeMetres'] * 3), 0, 1)
        coordinates, damped = displaced_coordinates(mesh, coordinates, normals, depth)
        mesh.vertices.foreach_set('co', coordinates.ravel())
        mesh.polygons.foreach_set('use_smooth', np.ones(len(mesh.polygons), bool))
        mesh.update()
        components, boundary, nonmanifold, _ = topology(mesh)
        triangles = sum(len(poly.vertices) - 2 for poly in mesh.polygons)
        if boundary or nonmanifold or (recipe['kind'] == 'tree' and components != 1) or triangles > settings['safetyTriangleLimit']:
            raise RuntimeError('Scanned woody surface failed the topology contract')
        return {'method': 'Clean fused skeleton with photographic displacement; no synthetic bark or ring scars',
                'barkTriangles': triangles, 'connectedComponents': components, 'boundaryEdges': boundary,
                'nonManifoldEdges': nonmanifold, 'locallyDampedReliefVertices': damped,
                'sourceVolumeCount': len(paths), 'measuredReliefMetres': float(np.ptp(depth)), **surface_info, **crumbs, **junction_info}
    uv, radius, branch, adjacent_uv, blend = project_charts(coordinates, paths)
    kind = recipe['texture']['bark']
    primary = sample_bark(kind, uv[:, 0], uv[:, 1])
    secondary = sample_bark(kind, adjacent_uv[:, 0], adjacent_uv[:, 1])
    # Mix sampled surface values, never angular coordinates from unrelated branch axes.
    field = primary['height'] * (1 - blend) + secondary['height'] * blend
    color = bark_color(kind, primary) * (1 - blend[:, None]) + bark_color(kind, secondary) * blend[:, None]
    photo = recipe['texture'].get('photographicBark')
    if photo:
        from photographic_bark import surface
        first_height, first_color = surface(photo, uv)
        next_height, next_color = surface(photo, adjacent_uv)
        field = first_height * (1 - blend) + next_height * blend
        color = first_color * (1 - blend[:, None]) + next_color * blend[:, None]
        soil = np.exp(-np.maximum(coordinates[:, 2], 0) / .055)
        color *= (1 - soil[:, None] * np.array([.18, .24, .28]))
    colors = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
    rgba = np.ones((count, 4), dtype=np.float32)
    rgba[:, :3] = np.clip(color / (((224 / 255 + .055) / 1.055) ** 2.4), 0, 1)
    colors.data.foreach_set('color', rgba.ravel())
    del primary, secondary, color, rgba, adjacent_uv
    depth = settings['reliefMetres'] * (field - .35) * np.clip(radius / .12, .08, 1)
    edges = np.empty(len(mesh.edges) * 2, dtype=np.int32)
    mesh.edges.foreach_get('vertices', edges)
    edges = edges.reshape((-1, 2))
    collar = np.ones(count, dtype=np.float32)
    collar[edges[branch[edges[:, 0]] != branch[edges[:, 1]]].ravel()] = 0
    degree = np.ones(count, dtype=np.float32)
    np.add.at(degree, edges.ravel(), 1)
    for step in range(6):
        smooth = collar.copy()
        np.add.at(smooth, edges[:, 0], collar[edges[:, 1]])
        np.add.at(smooth, edges[:, 1], collar[edges[:, 0]])
        collar = smooth / degree
    depth *= collar
    if recipe['kind'] == 'tree':
        rng = random.Random(variant['seed'] + 731)
        for scar in range(settings['scarCount']):
            angle, z = rng.uniform(-math.pi, math.pi), rng.uniform(.95, variant['height'] * .40)
            trunk_angle = np.arctan2(coordinates[:, 1], coordinates[:, 0])
            da = np.arctan2(np.sin(trunk_angle - angle), np.cos(trunk_angle - angle))
            r = np.sqrt((da / .25) ** 2 + ((coordinates[:, 2] - z) / .18) ** 2)
            scar_depth = (.022 * np.exp(-((r - .8) / .23) ** 2) - .010 * np.exp(-(r / .48) ** 2))
            depth += scar_depth * (branch == 0)
    depth *= np.clip(coordinates[:, 2] / (settings['voxelSizeMetres'] * 3), 0, 1)
    coordinates, damped = displaced_coordinates(mesh, coordinates, normals, depth)
    mesh.vertices.foreach_set('co', coordinates.ravel())
    mesh.update()
    uv_layer = mesh.uv_layers.new(name='UVMap')
    loops = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get('vertex_index', loops)
    loop_uv = uv[loops].copy()
    # Each remeshed face keeps a continuous local chart across periodic texture seams.
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        indices = slice(polygon.loop_start, polygon.loop_start + polygon.loop_total)
        values = loop_uv[indices]
        values[:, 0] -= np.round(values[:, 0] - values[0, 0])
        values[:, 1] -= np.round(values[:, 1] - values[0, 1])
    uv_layer.data.foreach_set('uv', loop_uv.ravel())
    components, boundary, nonmanifold, _ = topology(mesh)
    if recipe['kind'] == 'tree' and components != 1:
        raise RuntimeError(f'Tree wood must be one continuous component, got {components}')
    spatial = KDTree(len(mesh.vertices))
    for index, vertex in enumerate(mesh.vertices):
        spatial.insert(vertex.co, index)
    spatial.balance()
    checked = 0
    for path_index, path in enumerate(paths):
        points, radii = smooth_path(path)
        for point, radius in zip(points, radii):
            if radius >= .02 and point.z > .05:
                _, _, distance = spatial.find(point)
                if distance > radius * 1.8 + settings['voxelSizeMetres'] * 3:
                    buried = False
                    for parent_index, parent in enumerate(paths):
                        if parent_index == path_index:
                            continue
                        for segment in range(len(parent['points']) - 1):
                            a, b = Vector(parent['points'][segment]), Vector(parent['points'][segment + 1])
                            t = max(0, min(1, (point - a).dot(b - a) / (b - a).length_squared))
                            parent_radius = parent['radii'][segment] * (1 - t) + parent['radii'][segment + 1] * t
                            if (point - a.lerp(b, t)).length < parent_radius * .95:
                                buried = True
                                break
                        if buried:
                            break
                    if not buried:
                        raise RuntimeError('Remeshing lost an exposed substantive woody branch segment')
                checked += 1
    triangles = sum(len(polygon.vertices) - 2 for polygon in mesh.polygons)
    if boundary or nonmanifold or triangles > settings['safetyTriangleLimit']:
        raise RuntimeError(f"Woody topology failed: {triangles} triangles, {boundary} boundary, {nonmanifold} nonmanifold")
    return {'method': 'Fused voxel wood with smooth branch collars and shared-field geometric bark relief',
            'voxelSizeMetres': settings['voxelSizeMetres'], 'barkTriangles': triangles,
            'connectedComponents': components, 'boundaryEdges': boundary, 'nonManifoldEdges': nonmanifold,
            'measuredReliefMetres': float(np.max(depth) - np.min(depth)), 'scarCount': settings['scarCount'],
            'rootCount': 5 if recipe['kind'] == 'tree' else variant['stemCount'] * 5, 'safetyTriangleLimit': settings['safetyTriangleLimit'],
            'checkedStructuralSamples': checked, 'sourceVolumeCount': len(paths),
            'minimumResolvedTwigRadiusMetres': minimum_tip_radius,
            'seatedBranchOrigins': seated_origins, 'largestOriginSeatingMetres': largest_seating,
            'rootConstruction': 'Continuous asymmetric basal flare' if recipe['kind'] == 'tree' else 'Continuous asymmetric root crowns on curved varied stems',
            'surfaceColor': 'CC0 photographic macro color with blended junctions and photographic residual maps' if photo else 'Linear vertex color with blended branch fields and tiled micrograin',
            'blendedJunctionVertices': int(np.count_nonzero(blend > .001)),
            'flippedReliefFaces': 0, 'locallyDampedReliefVertices': damped, **crumbs, **shrub_detail}
