# Captures both original and revised complete LODs with identical bus-eye framing and inherited lighting.
import hashlib
import json
import math
import time
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

from common import clear_scene, configure, write_json
from render import import_model


def render(options):
    clear_scene(); scene=configure(options); scene.render.threads=4
    with bpy.data.libraries.load(str(Path(options['scene'])/'mature_tree_arboretum.blend'),link=False) as (available,loaded):
        loaded.worlds=[name for name in available.worlds if name.startswith('Kloofendal sky')]
        loaded.objects=['Sun','Continuous Brown Mud ground']
    scene.world=loaded.worlds[0]
    for obj in loaded.objects: scene.collection.objects.link(obj)
    scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'; scene.view_settings.exposure=.3
    scene.cycles.use_denoising=True; scene.cycles.adaptive_threshold=.025; scene.cycles.transparent_max_bounces=64
    scene.render.resolution_x=options['width']; scene.render.resolution_y=round(options['width']*.9); scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
    camera=bpy.data.objects.new('Matched full-tree branchlet comparison',bpy.data.cameras.new('Matched full-tree branchlet comparison'))
    scene.collection.objects.link(camera); scene.camera=camera; camera.data.sensor_fit='VERTICAL'; camera.data.sensor_height=24
    camera.data.lens=24/(2*math.tan(math.radians(55)/2)); camera.data.clip_end=500
    directory=Path(options['output'])/'comparisons'; directory.mkdir(parents=True,exist_ok=True)
    report_file=directory/'renders.json'; report=json.loads(report_file.read_text()) if report_file.exists() else {'renders':[]}
    for model in options['models']:
        variant=model.split('/')[1]; stats=json.loads((Path(options['source0'])/model/'model.json').read_text())
        objects,points,hashes,paths={},{},{},{}
        for level in options['levels']:
            for state,root in [('before',Path(options[f'source{level}'])),('after',Path(options['output'])/f'lod{level}')]:
                key=f'lod{level}_{state}'; file=root/model/(variant+f'_lod{level}_review.glb')
                objects[key],points[key]=import_model(file,model,stats['position'])
                hashes[key]=hashlib.sha256(file.read_bytes()).hexdigest(); paths[key]=str(file)
        all_points=sum(points.values(),[]); coords=np.array([list(p) for p in all_points]); low,high=coords.min(axis=0),coords.max(axis=0)
        height=high[2]-low[2]; target=Vector(((low[0]+high[0])/2,(low[1]+high[1])/2,low[2]+height*.47))
        distance=max(height*.6,np.ptp(coords[:,0])*.7,3); azimuth=math.radians(-72)
        for _ in range(40):
            camera.location=(target.x+math.cos(azimuth)*distance,target.y+math.sin(azimuth)*distance,stats['position'][2]+2.2)
            camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler(); bpy.context.view_layer.update()
            projected=[world_to_camera_view(scene,camera,p) for p in all_points]
            if all(.05<p.x<.95 and .06<p.y<.94 and p.z>0 for p in projected): break
            distance*=1.06
        else: raise RuntimeError('Full-tree camera framing failed')
        pose={'position':list(camera.location),'target':list(target),'verticalFov':55,'eyeHeight':2.2}
        for key in objects:
            file=model.replace('/','_')+'_'+key+'.png'
            previous=next((r for r in report['renders'] if r['file']==file),None)
            if previous and previous['sourceGlbSha256']==hashes[key] and previous['camera']==pose and previous['samples']==options['samples'] and previous['width']==options['width'] and (directory/file).exists(): continue
            for name,group in objects.items():
                for obj in group: obj.hide_render=name!=key
            scene.render.filepath=str(directory/file); started=time.perf_counter(); bpy.ops.render.render(write_still=True)
            report['renders']=[r for r in report['renders'] if r['file']!=file]
            report['renders'].append({'model':model,'representation':key,'file':file,'camera':pose,'sourceGlbSha256':hashes[key],
                'source':paths[key],'seconds':time.perf_counter()-started,'samples':options['samples'],'width':options['width'],
                'height':scene.render.resolution_y,'device':options['device'],'engine':'Cycles','environment':'Kloofendal HDRI / Sun / Brown Mud'})
            write_json(report_file,report); print(f'[Branchlets] {model}/{key}: {time.perf_counter()-started:.1f}s',flush=True)
        for group in objects.values():
            for obj in group: bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.orphans_purge(do_local_ids=True,do_linked_ids=True,do_recursive=True)
