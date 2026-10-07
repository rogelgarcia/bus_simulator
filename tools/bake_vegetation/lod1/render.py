# Raytraces only full trees from exported decoded GLBs with matched inherited sky, sun and soil.
import json
import hashlib
import math
import time
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

from common import clear_scene, configure, write_json
from comparison import cutout_for_cycles


def import_model(file, model, position):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(file))
    objects = list(set(bpy.data.objects)-before)
    root = bpy.data.objects.new(model+' / comparison placement', None); bpy.context.scene.collection.objects.link(root)
    root.location = position
    for obj in objects:
        if obj.parent not in objects: obj.parent = root
        if obj.type == 'MESH':
            for material in obj.data.materials:
                if 'spray cards' in material.name and not material.get('cyclesCutoutReady'):
                    cutout_for_cycles(material, .17, True); material['cyclesCutoutReady'] = True
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ vertex.co for obj in objects if obj.type == 'MESH' for vertex in obj.data.vertices]
    return objects+[root], corners


def render(options):
    clear_scene(); scene = configure(options)
    scene.render.threads = options['render-threads']
    with bpy.data.libraries.load(str(Path(options['scene'])/'mature_tree_arboretum.blend'), link=False) as (available, loaded):
        loaded.worlds = [name for name in available.worlds if name.startswith('Kloofendal sky')]
        loaded.objects = ['Sun', 'Continuous Brown Mud ground']
    if not loaded.worlds or any(obj is None for obj in loaded.objects): raise RuntimeError('Missing authenticated review lighting/soil')
    scene.world = loaded.worlds[0]
    for obj in loaded.objects: scene.collection.objects.link(obj)
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'; scene.view_settings.exposure = .3
    scene.cycles.use_denoising = True; scene.cycles.adaptive_threshold = .025
    scene.cycles.transparent_max_bounces = 64
    scene.render.resolution_x = options['width']; scene.render.resolution_y = round(options['width']*.9)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    camera = bpy.data.objects.new('Full-tree LOD comparison camera', bpy.data.cameras.new('Full-tree LOD comparison camera'))
    scene.collection.objects.link(camera); scene.camera = camera
    camera.data.sensor_fit = 'VERTICAL'; camera.data.sensor_height = 24
    camera.data.lens = 24/(2*math.tan(math.radians(55)/2)); camera.data.clip_end = 500
    output = Path(options['output']); directory = output/'comparisons'; directory.mkdir(parents=True, exist_ok=True)
    report_path = directory/'renders.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {'renders': []}
    for previous in report['renders']:
        previous.setdefault('width', report['width']); previous.setdefault('height', report['height'])
    report.update(engine='Cycles', device=options['device'], samples=options['samples'], width=options['width'],
                  height=scene.render.resolution_y, environment='Inherited Kloofendal sky, sun and Brown Mud', closeups=False)
    for model in options['models']:
        variant = model.split('/')[1]; stats = json.loads((output/model/'model.json').read_text())
        if not stats.get('textureCompression'): raise RuntimeError('Compress final LOD1 textures before comparison')
        representations, points, source_hashes = {}, [], {}
        for lod, root_dir in [('lod0', Path(options['source'])), ('lod1', output)]:
            file = root_dir/model/(variant+'_'+lod+'_review.glb')
            source_hashes[lod] = hashlib.sha256(file.read_bytes()).hexdigest()
            objects, corners = import_model(file, model, stats['position'])
            representations[lod] = objects; points.extend(corners)
        coords = np.array([list(point) for point in points]); low, high = coords.min(axis=0), coords.max(axis=0)
        height = high[2]-low[2]; origin = np.array(stats['position'])
        target = Vector(((low[0]+high[0])/2, (low[1]+high[1])/2, low[2]+height*.47))
        view_ids = ['front', 'reverse'] if options['views'] == 'all' else [options['views']]
        for view_id in view_ids:
            angle = math.radians(-72 if view_id == 'front' else 136)
            distance = max(height*.6, np.ptp(coords[:, 0])*.7, 3)
            eye = 2.2
            for _ in range(30):
                camera.location = (target.x+math.cos(angle)*distance, target.y+math.sin(angle)*distance, origin[2]+eye)
                camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
                bpy.context.view_layer.update()
                framed = [world_to_camera_view(scene, camera, point) for point in points]
                if all(.05 < p.x < .95 and .06 < p.y < .94 and p.z > 0 for p in framed): break
                distance *= 1.06
            else: raise RuntimeError('Full-tree framing failed')
            pose = {'position': list(camera.location), 'target': list(target), 'verticalFov': 55, 'eyeHeight': eye,
                    'bounds': [low.tolist(), high.tolist()]}
            for lod in ['lod0', 'lod1']:
                for name, objects in representations.items():
                    for obj in objects: obj.hide_render = name != lod
                file = model.replace('/', '_')+'_'+view_id+'_'+lod+'.png'
                scene.render.filepath = str(directory/file)
                started = time.perf_counter(); bpy.ops.render.render(write_still=True)
                report['renders'] = [row for row in report['renders'] if row['file'] != file]
                report['renders'].append({'model': model, 'view': view_id, 'lod': lod, 'file': file, 'camera': pose,
                                          'seconds': time.perf_counter()-started, 'sourceGlbSha256': source_hashes[lod],
                                          'device': options['device'], 'samples': options['samples'],
                                          'width': scene.render.resolution_x, 'height': scene.render.resolution_y})
                write_json(report_path, report)
                print(f'[LOD1] Full tree {model}/{view_id}/{lod}: {time.perf_counter()-started:.1f}s', flush=True)
        for objects in representations.values():
            for obj in objects: bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
