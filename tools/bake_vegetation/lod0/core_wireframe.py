# Render triangle edges from the exported GLBs, plus isolated core planes for clear inspection.
import json
import math
import time
from pathlib import Path

import bpy
from mathutils import Vector

from common import clear_scene, configure, write_json


def wire_material(name, color, interior):
    material = bpy.data.materials.new(name); material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    wire = nodes.new('ShaderNodeWireframe'); wire.use_pixel_size = True; wire.inputs['Size'].default_value = .8
    emission = nodes.new('ShaderNodeEmission'); emission.inputs['Color'].default_value = (*color, 1)
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    coverage = nodes.new('ShaderNodeMath'); coverage.operation = 'MAXIMUM'
    coverage.inputs[1].default_value = interior; links.new(wire.outputs[0], coverage.inputs[0])
    mix = nodes.new('ShaderNodeMixShader')
    links.new(coverage.outputs[0], mix.inputs[0]); links.new(transparent.outputs[0], mix.inputs[1]); links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs['Surface'])
    return material


def render(options):
    clear_scene(); scene = configure(options)
    scene.cycles.samples = 32; scene.cycles.transparent_max_bounces = 96
    scene.cycles.use_denoising = True
    scene.render.resolution_x = options['width']; scene.render.resolution_y = round(options['width']*9/16)
    scene.render.resolution_percentage = 100; scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'
    scene.world = bpy.data.worlds.new('Wireframe dark background'); scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.012, .022, .03, 1)
    scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = 1
    materials = {'wood': wire_material('Wood triangle edges', (.7, .57, .32), .05),
                 'core': wire_material('Core plane triangle edges', (1., .24, .025), .045),
                 'outer': wire_material('Outer plane triangle edges', (.12, .59, .65), .005)}
    objects = []
    for model in options['models']:
        variant = model.split('/')[1]; directory = Path(options['output'])/model
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(directory/(variant+'_lod0_review.glb')))
        stats = json.loads((directory/'model.json').read_text())
        imported = set(bpy.data.objects)-before
        root = bpy.data.objects.new(model+' / wireframe placement', None); scene.collection.objects.link(root)
        root.location = stats['position']
        for obj in imported:
            if obj.parent not in imported: obj.parent = root
            obj['model'] = model
            if obj.type != 'MESH': continue
            role = obj.get('canopyRole', 'wood')
            obj.data.materials.clear(); obj.data.materials.append(materials[role])
            objects.append(obj)
    report = json.loads((Path(options['output'])/'comparisons/renders.json').read_text())
    camera = bpy.data.objects.new('Wireframe camera', bpy.data.cameras.new('Wireframe camera'))
    scene.collection.objects.link(camera); scene.camera = camera
    directory = Path(options['output'])/'wireframes'; directory.mkdir(parents=True, exist_ok=True)
    manifest = directory/'renders.json'
    records = json.loads(manifest.read_text())['renders'] if manifest.exists() else []
    species_list = {model.split('/')[0] for model in options['models']}
    for row in report['renders']:
        view = row['camera']
        if row['representation'] != 'lod0' or not view['id'].endswith(('_mature_group', '_roadside', '_trunk')): continue
        if view['species'] not in species_list: continue
        if options.get('views') == 'cores' and not view['id'].endswith('_roadside'): continue
        camera.location = view['position']; camera.rotation_euler = (Vector(view['target'])-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.sensor_fit = 'VERTICAL' if 'verticalFovDegrees' in view else 'AUTO'
        camera.data.sensor_height = 24; camera.data.sensor_width = 36; camera.data.lens = view['lens']
        for mode in (['wireframe', 'cores'] if view['id'].endswith('_roadside') else ['wireframe']):
            if options.get('views') == 'cores' and mode != 'cores': continue
            # Isolated plates extend beyond their alpha silhouettes; give their bounds room in the diagram.
            camera.data.lens = view['lens'] * (.82 if mode == 'cores' else 1)
            for obj in objects:
                model = obj['model']; species, variant = model.split('/')
                obj.hide_render = species != view['species'] or (view['variant'] is not None and variant != view['variant']) or (mode == 'cores' and obj.get('canopyRole') == 'outer')
            file = view['id']+'_'+mode+'.png'; scene.render.filepath = str(directory/file)
            started = time.perf_counter(); bpy.ops.render.render(write_still=True)
            diagram_view = dict(view, lens=camera.data.lens)
            if 'verticalFovDegrees' in diagram_view:
                diagram_view['verticalFovDegrees'] = math.degrees(2 * math.atan(camera.data.sensor_height / (2 * camera.data.lens)))
            records = [record for record in records if record['file'] != file]
            records.append({'file': file, 'camera': diagram_view, 'mode': mode, 'seconds': time.perf_counter()-started})
            write_json(manifest, {'renders': records, 'source': 'Reimported final GLB geometry', 'samples': 32,
                       'size': [scene.render.resolution_x, scene.render.resolution_y], 'legend': {'gold': 'wood', 'orange': '15 interior planes, five centers', 'cyan': 'outer planes'},
                       'method': 'Triangle-edge shader, no leaf alpha mask. Transparent interiors reveal internal card placement; this is a geometry diagram, not the shaded material.'})
