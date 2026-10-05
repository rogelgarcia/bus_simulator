# Compare the actual exported GLBs with the frozen source under identical Cycles conditions.
import json
import math
import struct
import time
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

from common import array, configure, write_json


def cutout_for_cycles(material, transmission_factor, double_sided=False):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    color = next(node for node in nodes if node.type == 'TEX_IMAGE' and node.image and 'color' in node.image.name.lower())
    clip = nodes.new('ShaderNodeMath'); clip.operation = 'GREATER_THAN'; clip.inputs[1].default_value = .5
    links.new(color.outputs['Alpha'], clip.inputs[0])
    geom = nodes.new('ShaderNodeNewGeometry')
    face = nodes.new('ShaderNodeMath'); face.operation = 'SUBTRACT'; face.inputs[0].default_value = 1
    links.new(geom.outputs['Backfacing'], face.inputs[1])
    multiply = nodes.new('ShaderNodeMath'); multiply.operation = 'MULTIPLY'
    links.new(clip.outputs[0], multiply.inputs[0]); links.new(face.outputs[0], multiply.inputs[1])
    if double_sided:
        links.remove(multiply.inputs[1].links[0]); multiply.inputs[1].default_value = 1
    if bsdf.inputs['Alpha'].is_linked: links.remove(bsdf.inputs['Alpha'].links[0])
    bsdf.inputs['Alpha'].default_value = 1
    # Reconstruct the exported glTF diffuse-transmission extension in Cycles.
    # Its factor/color are the same as the immutable solid-leaf reference.
    transmission = nodes.new('ShaderNodeBsdfTranslucent')
    links.new(color.outputs['Color'], transmission.inputs['Color'])
    mix = nodes.new('ShaderNodeMixShader'); mix.inputs[0].default_value = transmission_factor
    links.new(bsdf.outputs[0], mix.inputs[1]); links.new(transmission.outputs[0], mix.inputs[2])
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    coverage = nodes.new('ShaderNodeMixShader')
    links.new(multiply.outputs[0], coverage.inputs[0]); links.new(transparent.outputs[0], coverage.inputs[1]); links.new(mix.outputs[0], coverage.inputs[2])
    links.new(coverage.outputs[0], nodes.get('Material Output').inputs['Surface'])


def views_for(species, manifest, models):
    rows = [row for row in manifest['inventory'] if row['species'] == species and species + '/' + row['variant'] in models]
    positions = [np.array(row['position']) for row in rows]
    primary = rows[0]
    base = positions[0]
    foliage = bpy.data.objects[species + '/' + primary['variant'] + ' / solid leaves']
    points = array(foliage.data.vertices, 'co', 3)
    height = float(points[:, 2].max()) + .3
    radius = float(max(np.ptp(points[:, 0]), np.ptp(points[:, 1]))) / 2
    shrub = species == 'arrowwood_viburnum'
    distance = max(7, height * 1.35, radius * 2.1)
    def pose(id, name, location, target, variant=primary['variant'], lens=40):
        return {'id': species + '_' + id, 'species': species, 'name': name, 'position': list(map(float, location)),
                'target': list(map(float, target)), 'variant': variant, 'lens': lens}
    midpoint = np.mean(positions, axis=0)
    span = max(p[0] for p in positions) - min(p[0] for p in positions) + radius * 2
    family_distance = max(span * 1.15, height * 2.3)
    result = [pose('mature_group', 'All mature forms / elevated chase view', midpoint + [0, -family_distance, 6.6], midpoint + [0, 0, height * .45], None, 35),
              pose('roadside', 'Roadside / 2.2 m eye height', base + [distance * .30, -distance, 2.2], base + [0, 0, height * .47], lens=40),
              pose('driveby', 'Drive-by / opposite azimuth', base + [-distance * .72, distance * .75, 3.2], base + [0, 0, height * .48], lens=40),
              pose('trunk', 'Bark and branch union close-up', base + [2.3 if not shrub else 1.5, -3.5 if not shrub else -2.3, 3.1 if not shrub else 1.3], base + [0, 0, 3.0 if not shrub else 1.1], lens=60),
              pose('roots', 'Root-to-ground close-up', base + [1.9 if not shrub else 1.2, -2.5 if not shrub else -1.8, .85], base + [0, 0, .45], lens=55),
              pose('canopy', 'Upward canopy / leaf underside close-up', base + [radius * .30, -radius * .85, 2.2 if not shrub else .75], base + [radius * .20, -radius * .45, height * .7], lens=58)]
    for view in result:
        if view['id'].endswith(('_roadside', '_driveby')):
            view['verticalFovDegrees'] = 55
            view['lens'] = 24 / (2 * math.tan(math.radians(55) / 2))
        if shrub and view['id'].endswith('_trunk'):
            view.update(position=list(base + [2.0, -3.2, .7]), target=list(base + [0, 0, .55]), lens=55)
        if shrub and view['id'].endswith('_roots'):
            view.update(position=list(base + [1.9, -2.7, .75]), target=list(base + [0, 0, .22]), lens=45)
    return result


def render_comparisons(options):
    source = Path(options['source'])
    manifest = json.loads((source / 'scene.json').read_text())
    bpy.ops.wm.open_mainfile(filepath=str(source / 'mature_tree_arboretum.blend'))
    scene = configure(options)
    scene.timeline_markers.clear()
    scene.cycles.use_denoising = True
    scene.cycles.adaptive_threshold = .015
    scene.cycles.transparent_max_bounces = 64
    scene.render.resolution_x = options['width']
    scene.render.resolution_y = round(options['width'] * 9 / 16)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    species_list = list(dict.fromkeys(model.split('/')[0] for model in options['models']))
    collections = {}
    for species in species_list:
        collection = bpy.data.collections.new('LOD0 / ' + species)
        scene.collection.children.link(collection)
        collections[species] = collection
    for model in options['models']:
        species, variant = model.split('/')
        directory = Path(options['output']) / species / variant
        before = set(bpy.data.objects)
        model_stats = json.loads((directory / 'model.json').read_text())
        file = directory / (variant + ('_lod0_review.glb' if model_stats.get('textureCompression') else '_lod0.glb'))
        raw = file.read_bytes()
        doc = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
        factors = {material['name']: material.get('extensions', {}).get('KHR_materials_diffuse_transmission', {}).get('diffuseTransmissionFactor', 0)
                   for material in doc['materials']}
        double_sided = {material['name']: material.get('doubleSided', False) for material in doc['materials']}
        bpy.ops.import_scene.gltf(filepath=str(file))
        imported = set(bpy.data.objects) - before
        root = bpy.data.objects.new(model + ' / comparison placement', None)
        collections[species].objects.link(root)
        root.location = next(row['position'] for row in manifest['inventory'] if row['species'] == species and row['variant'] == variant)
        root['variant'] = variant
        for obj in imported:
            for owner in list(obj.users_collection): owner.objects.unlink(obj)
            collections[species].objects.link(obj)
            if obj.parent not in imported: obj.parent = root
            obj['variant'] = variant
            if obj.type == 'MESH':
                for material in obj.data.materials:
                    if 'spray cards' in material.name:
                        matching = next(name for name in factors if material.name == name or material.name.startswith(name + '.'))
                        if not material.get('cyclesCutoutReady'):
                            cutout_for_cycles(material, factors[matching], double_sided[matching])
                            material['cyclesCutoutReady'] = True
    views = [view for species in species_list for view in views_for(species, manifest, options['models'])]
    if options['views'] != 'all': views = [view for view in views if view['id'] in options['views'].split(',') or view['id'].removeprefix(view['species'] + '_') in options['views'].split(',')]
    if not views: raise RuntimeError('No matching comparison cameras')
    if options['shading'] == 'albedo':
        for material in bpy.data.materials:
            if not material.use_nodes: continue
            nodes, links = material.node_tree.nodes, material.node_tree.links
            bsdf = next((node for node in nodes if node.type == 'BSDF_PRINCIPLED'), None)
            if bsdf is None or not bsdf.inputs['Base Color'].is_linked: continue
            emission = nodes.new('ShaderNodeEmission')
            links.new(bsdf.inputs['Base Color'].links[0].from_socket, emission.inputs['Color'])
            if 'spray cards' in material.name:
                coverage = next(node for node in nodes if node.type == 'MIX_SHADER' and node.inputs[0].is_linked)
                links.new(emission.outputs[0], coverage.inputs[2])
            else:
                links.new(emission.outputs[0], nodes.get('Material Output').inputs['Surface'])
    directory = Path(options['output']) / ('comparisons' if options['shading'] == 'physical' else 'comparisons-albedo')
    directory.mkdir(parents=True, exist_ok=True)
    report_file = directory / 'renders.json'
    report = json.loads(report_file.read_text()) if report_file.exists() else {'engine': 'CYCLES', 'renders': []}
    report.update({'device': options['device'], 'samples': options['samples'], 'size': [scene.render.resolution_x, scene.render.resolution_y],
                   'lighting': 'Unmodified reference HDRI, sun, ground and exposure', 'lod0Source': 'Reimported GLB; compressed packages use the exact UASTC-decoded review GLB',
                   'leafShading': 'Exported KHR_materials_diffuse_transmission (0.17, base-color tissue) reconstructed in Cycles; MASK and the exported doubleSided setting. Current gameplay integration is separate.'})
    camera_data = bpy.data.cameras.new('Matched LOD0 comparison camera')
    camera = bpy.data.objects.new('Matched LOD0 comparison camera', camera_data)
    scene.collection.objects.link(camera); scene.camera = camera
    camera_data.clip_start = .05; camera_data.clip_end = 500
    for view in views:
        camera.location = view['position']
        camera.rotation_euler = (Vector(view['target']) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera_data.sensor_fit = 'VERTICAL' if 'verticalFovDegrees' in view else 'AUTO'
        camera_data.sensor_height = 24; camera_data.sensor_width = 36; camera_data.lens = view['lens']
        representations = ['reference', 'lod0']
        if view['id'].endswith(('_mature_group', '_roadside', '_driveby')): representations.append('background')
        if options.get('representations') == 'lod0': representations = ['lod0']
        for representation in representations:
            for plot in manifest['plots']:
                collection = bpy.data.collections[plot['species']]
                collection.hide_render = representation != 'reference' or plot['species'] != view['species']
                for obj in collection.objects:
                    obj.hide_render = obj.type == 'FONT' or bool(obj.get('leafStudy')) or (view['variant'] is not None and obj.get('variant') != view['variant'])
            for species, collection in collections.items():
                collection.hide_render = representation != 'lod0' or species != view['species']
                for obj in collection.objects: obj.hide_render = view['variant'] is not None and obj.get('variant') != view['variant']
            bpy.context.view_layer.update()
            file = view['id'] + '_' + representation + '.png'
            scene.render.filepath = str(directory / file)
            started = time.perf_counter()
            bpy.ops.render.render(write_still=True)
            report['renders'] = [row for row in report['renders'] if row['file'] != file]
            report['renders'].append({'file': file, 'representation': representation, 'camera': view,
                                      'seconds': time.perf_counter() - started, 'samples': options['samples'], 'width': options['width']})
            write_json(report_file, report)
            print(f'[LOD0] Compared {view["id"]} / {representation} in {time.perf_counter() - started:.1f}s', flush=True)
