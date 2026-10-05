# Reduce the final deformed wood, then bake its actual photographic material and relief.
import time
import json
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from common import activate, array, clear_scene, configure, load_reference, triangles, write_json

BUDGETS = {'london_plane': 6000, 'silver_linden': 5000, 'northern_red_oak': 7000,
           'american_elm': 9000, 'arrowwood_viburnum': 4000}


def save_image(image, path):
    scene = bpy.data.scenes.new('Linear data or sRGB image encoding')
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if 'leaf_color' in str(path) else 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'Standard' if image.colorspace_settings.name == 'sRGB' else 'Raw'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    image.save_render(str(path), scene=scene)
    bpy.data.scenes.remove(scene)
    # Reload the encoded file: exports must use the reviewed 8-bit image, not a hidden float master.
    image.filepath_raw = str(path)
    image.source = 'FILE'
    image.reload()


def pbr_material(name, images, cutout=False):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = cutout
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Specular IOR Level'].default_value = .3 if cutout else .28
    color = nodes.new('ShaderNodeTexImage'); color.image = images['color']
    links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    normal = nodes.new('ShaderNodeTexImage'); normal.image = images['normal']
    normal_map = nodes.new('ShaderNodeNormalMap')
    links.new(normal.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs[0], bsdf.inputs['Normal'])
    orm = nodes.new('ShaderNodeTexImage'); orm.image = images['orm']
    separate = nodes.new('ShaderNodeSeparateColor')
    links.new(orm.outputs['Color'], separate.inputs[0])
    links.new(separate.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(separate.outputs['Blue'], bsdf.inputs['Metallic'])
    if cutout:
        # Keep the direct alpha link recognizable to glTF; the comparison renderer applies MASK.
        links.new(color.outputs['Alpha'], bsdf.inputs['Alpha'])
        material['alphaCutoff'] = .5
        material['leafTransmissionReference'] = .17
        material['leafTransmissionExport'] = 'KHR_materials_diffuse_transmission; requires a supporting renderer for the full leaf response'
    return material


def geometry_error(high, low, outlier_limit=None):
    points = array(high.data.vertices, 'co', 3)
    ids = np.linspace(0, len(points) - 1, min(18000, len(points)), dtype=np.int64)
    tree = BVHTree.FromPolygons([v.co for v in low.data.vertices], [p.vertices[:] for p in low.data.polygons], all_triangles=True)
    distances = np.array([tree.find_nearest(Vector(point))[3] for point in points[ids]])
    bm = bmesh.new(); bm.from_mesh(low.data)
    boundary = sum(not e.is_manifold for e in bm.edges)
    bm.free()
    result = {'sampleCount': len(ids), 'p50Metres': float(np.quantile(distances, .5)),
            'p95Metres': float(np.quantile(distances, .95)), 'p99Metres': float(np.quantile(distances, .99)),
            'maxMetres': float(distances.max()), 'nonManifoldEdges': boundary}
    if outlier_limit is not None: result['outliers'] = points[ids[distances > outlier_limit]].tolist()
    return result


def unwrap_regions(low, cut, attempt=0):
    angle = 1.151917
    margin = [.003, .0015, .001][attempt]
    vertices = [tuple(v.co) for v in low.data.vertices]
    if low.data.uv_layers.active: low.data.uv_layers.remove(low.data.uv_layers.active)
    low.data.uv_layers.new(name='Baked wood UV')
    target_uv = low.data.uv_layers.active.data
    occupancy = 0.0
    for near, width, offset in [(True, .76, .0), (False, .22, .78)]:
        selected = [poly for poly in low.data.polygons if (poly.center.z < cut) == near]
        region_start = occupancy
        mesh = bpy.data.meshes.new('Isolated UV region')
        mesh.from_pydata(vertices, [], [tuple(poly.vertices) for poly in selected])
        part = bpy.data.objects.new('Isolated UV region', mesh)
        bpy.context.scene.collection.objects.link(part)
        activate(part)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=angle, island_margin=.002, area_weight=0, correct_aspect=True, scale_to_bounds=True)
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='FRACTION', margin=margin, shape_method='CONCAVE')
        bpy.ops.object.mode_set(mode='OBJECT')
        source_uv = mesh.uv_layers.active.data
        for source, target in zip(mesh.polygons, selected):
            coords = []
            for a, b in zip(source.loop_indices, target.loop_indices):
                uv = source_uv[a].uv.copy(); uv.x = uv.x * width + offset
                target_uv[b].uv = uv; coords.append(uv)
            for index in range(1, len(coords) - 1):
                a, b = coords[index] - coords[0], coords[index + 1] - coords[0]
                occupancy += abs(a.x * b.y - a.y * b.x) / 2
        bpy.data.objects.remove(part, do_unlink=True); bpy.data.meshes.remove(mesh)
        print(f'[LOD0] Wood UV region {near}: {len(selected)} faces, {(occupancy - region_start)/width:.1%} occupancy before allocation', flush=True)
    activate(low)
    if occupancy < .25:
        if attempt < 2:
            print(f'[LOD0] Repacking thin wood UV islands ({occupancy:.1%} occupancy)', flush=True)
            return unwrap_regions(low, cut, attempt + 1)
        raise RuntimeError(f'Wood UV packing wastes too much area: {occupancy:.1%}')
    low['uvMarginFraction'] = margin
    return occupancy


def build_wood(options):
    for model in options['models']:
        started = time.perf_counter()
        clear_scene()
        scene = configure(options)
        high = load_reference(options, [model + ' / original wood'])[0]
        high.location = (0, 0, 0)
        high.hide_render = False
        species, variant = model.split('/')
        directory = Path(options['output']) / species / variant
        directory.mkdir(parents=True, exist_ok=True)
        core = options.get('placement') == 'core'
        if core:
            with bpy.data.libraries.load(str(Path(options['baseline']) / model / 'wood.blend'), link=False) as (available, loaded):
                loaded.objects = [model + ' / LOD0 wood']
            low = loaded.objects[0]
        else:
            low = high.copy(); low.data = high.data.copy()
        low.name = model + ' / LOD0 wood'
        bpy.context.scene.collection.objects.link(low)
        for key in list(low.keys()): del low[key]
        for attr in list(low.data.attributes):
            if not attr.is_required and not attr.name.startswith('.'):
                low.data.attributes.remove(attr)
        activate(low)
        # Remove microgeometry's bias before error-based collapse; root contact stays fixed.
        points = array(low.data.vertices, 'co', 3)
        group = low.vertex_groups.new(name='Preserve ground contact')
        group_name = group.name
        group.add(np.flatnonzero(points[:, 2] > .08).tolist(), .5 if core else 1.0, 'REPLACE')
        if core:
            distance = np.linalg.norm(points * [1, 1, .7], axis=1)
            neighbors = [set() for _ in points]
            for edge in low.data.edges:
                a, b = edge.vertices; neighbors[a].add(b); neighbors[b].add(a)
            tips = {i for i, adjacent in enumerate(neighbors) if all(distance[i] >= distance[j] for j in adjacent)}
            # The elm's long exposed stem needs its existing curvature to avoid triangular self-shadow steps.
            stem_pins = set(np.flatnonzero(points[:, 2] < 5.0).tolist()) if species == 'american_elm' else set()
            pinned = tips | stem_pins | {j for i in tips for j in neighbors[i]}
            group.add(list(pinned), 0.0, 'REPLACE')
            base_pinned, outlier_pins, protect_neighbors = pinned.copy(), set(), True
        if not core:
            smooth = low.modifiers.new('Relax sub-bark relief', 'SMOOTH')
            smooth.factor = .6; smooth.iterations = 3; smooth.vertex_group = group.name
            bpy.ops.object.modifier_apply(modifier=smooth.name)
        relaxed = low.data.copy()
        attempted = []
        previous_count = json.loads((Path(options['baseline']) / model / 'model.json').read_text())['woodTriangles'] if core else None
        for attempt in range(12 if core else 4):
            if attempt:
                previous = low.data; low.data = relaxed.copy(); bpy.data.meshes.remove(previous)
                if core:
                    low.vertex_groups[group_name].add(np.flatnonzero(points[:, 2] > .08).tolist(), .5, 'REPLACE')
                    low.vertex_groups[group_name].add(list(pinned), 0.0, 'REPLACE')
            budget = (previous_count // 4) * 2 if core else round(BUDGETS[species] * 1.35 ** attempt)
            collapse = low.modifiers.new('Silhouette and branch reduction', 'DECIMATE')
            collapse.ratio = budget / triangles(low.data)
            collapse.use_collapse_triangulate = True
            if core:
                collapse.vertex_group = group_name
                collapse.vertex_group_factor = .02
            bpy.ops.object.modifier_apply(modifier=collapse.name)
            error = geometry_error(high, low, .16 if core else None)
            outliers = error.pop('outliers', [])
            attempted.append({'triangles': triangles(low.data), **error})
            if core: print(f'[LOD0] Wood candidate {model} / {attempt+1}: {triangles(low.data)} triangles, p99 {error["p99Metres"]:.4f}m, maximum {error["maxMetres"]:.4f}m', flush=True)
            if not error['nonManifoldEdges'] and error['p99Metres'] <= (.10 if core else .06) and error['maxMetres'] <= .18 and (not core or triangles(low.data) <= budget):
                break
            if core:
                added = {int(np.argmin(np.sum((points - point) ** 2, axis=1))) for point in outliers}
                outlier_pins |= added
                if triangles(low.data) > budget:
                    protect_neighbors = False; base_pinned = tips | stem_pins
                pinned = base_pinned | outlier_pins
                if protect_neighbors: pinned |= {j for i in outlier_pins for j in neighbors[i]}
        else:
            raise RuntimeError(f'LOD0 wood lost its source form: {model}: {error}')
        bpy.data.meshes.remove(relaxed)
        low.vertex_groups.clear()
        for poly in low.data.polygons: poly.use_smooth = True
        # Reserve most texels for surfaces seen beside a bus: roots, trunk and first forks.
        cut = 1.35 if species == 'arrowwood_viburnum' else 5.0
        uv_occupancy = unwrap_regions(low, cut)
        # Triangulate before baking so exported tangent bases use the same diagonals.
        triangulate = low.modifiers.new('Stable bake triangles', 'TRIANGULATE')
        bpy.ops.object.modifier_apply(modifier=triangulate.name)
        target = bpy.data.materials.new('Temporary UV bake target'); target.use_nodes = True
        low.data.materials.clear(); low.data.materials.append(target)
        active_image = target.node_tree.nodes.new('ShaderNodeTexImage')
        target.node_tree.nodes.active = active_image
        scene.render.bake.use_selected_to_active = True
        scene.render.bake.cage_extrusion = max(.06, error['p99Metres'] * 2.2)
        scene.render.bake.max_ray_distance = max(.16, error['maxMetres'] * 2.2)
        scene.render.bake.margin = 16
        scene.render.bake.margin_type = 'EXTEND'
        scene.cycles.samples = 1
        size = options['wood-size']
        images = {}
        originals = []
        for material in high.data.materials:
            output = material.node_tree.nodes.get('Material Output')
            originals.append((material, output.inputs['Surface'].links[0].from_socket))
        for channel in ['color', 'normal', 'roughness', 'occlusion']:
            image = bpy.data.images.new(model + ' / bark ' + channel, size, size, alpha=True, float_buffer=True)
            image.colorspace_settings.name = 'sRGB' if channel == 'color' else 'Non-Color'
            active_image.image = image
            for material, socket in originals:
                nodes, links = material.node_tree.nodes, material.node_tree.links
                output = nodes.get('Material Output')
                if channel == 'normal':
                    links.new(socket, output.inputs['Surface'])
                elif channel == 'occlusion':
                    ao = nodes.new('ShaderNodeAmbientOcclusion')
                    ao.inputs['Distance'].default_value = .12
                    ao.samples = 16; ao.only_local = True
                    emission = nodes.new('ShaderNodeEmission'); links.new(ao.outputs['AO'], emission.inputs['Color'])
                    links.new(emission.outputs[0], output.inputs['Surface'])
                else:
                    bsdf = nodes.get('Principled BSDF')
                    source = bsdf.inputs['Base Color' if channel == 'color' else 'Roughness']
                    emission = nodes.new('ShaderNodeEmission')
                    if source.is_linked: links.new(source.links[0].from_socket, emission.inputs['Color'])
                    else:
                        value = source.default_value
                        emission.inputs['Color'].default_value = value if channel == 'color' else (value, value, value, 1)
                    links.new(emission.outputs[0], output.inputs['Surface'])
            activate(low, [high])
            bpy.ops.object.bake(type='NORMAL' if channel == 'normal' else 'EMIT', normal_space='TANGENT', use_clear=True)
            images[channel] = image
            print(f'[LOD0] Baked {model} {channel}', flush=True)
        for material, socket in originals:
            material.node_tree.links.new(socket, material.node_tree.nodes.get('Material Output').inputs['Surface'])
        rough = np.array(images['roughness'].pixels[:], dtype=np.float32).reshape((size, size, 4))
        packed = np.ones_like(rough); packed[:, :, 1] = rough[:, :, 0]; packed[:, :, 2] = 0
        packed[:, :, 0] = np.array(images['occlusion'].pixels[:], np.float32).reshape((size, size, 4))[:, :, 0]
        images['orm'] = bpy.data.images.new(model + ' / bark ORM', size, size, alpha=False, float_buffer=True)
        images['orm'].colorspace_settings.name = 'Non-Color'
        images['orm'].pixels.foreach_set(packed.ravel())
        for channel in ['color', 'normal', 'orm']:
            save_image(images[channel], directory / ('bark_' + channel + '.png'))
        low.data.materials.clear(); low.data.materials.append(pbr_material(model + ' / baked bark', images))
        bpy.data.objects.remove(high, do_unlink=True)
        low['lodLevel'] = 0; low['referenceModel'] = model; low['surface'] = 'wood'
        low['variant'] = variant
        activate(low)
        bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(directory / 'wood.blend'), compress=True)
        write_json(directory / 'wood.json', {'id': model, 'triangles': triangles(low.data), 'vertices': len(low.data.vertices),
                   'previousTriangles': previous_count, 'targetReduction': .5 if core else None,
                   'budget': budget, 'budgetCandidates': attempted, 'geometryError': error, 'mapSize': size, 'uvOccupancy': uv_occupancy,
                   'uvMarginFraction': low.get('uvMarginFraction', .003),
                   'maps': ['bark_color.png', 'bark_normal.png', 'bark_orm.png'],
                   'bake': {'type': 'Cycles selected-to-active', 'normalSpace': 'TANGENT / OpenGL +Y', 'marginPixels': 16,
                            'ambientOcclusion': 'Source wood cavity AO, 0.12 m radius; no directional lighting baked into material',
                            'cageExtrusionMetres': scene.render.bake.cage_extrusion, 'maxRayDistanceMetres': scene.render.bake.max_ray_distance},
                   'seconds': time.perf_counter() - started})
        print(f'[LOD0] Wood ready {model}: {triangles(low.data)} triangles; p99 error {error["p99Metres"]:.4f}m', flush=True)
