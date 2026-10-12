# Same-camera before/after review and measured projected coverage from several directions.
import json
import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector


def compare(options,model,wood,original,new,twigs,stats,hero):
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=options['samples'];scene.eevee.use_raytracing=False
    scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_percentage=100
    scene.render.resolution_x=options['width'];scene.render.resolution_y=options['width']*3//4
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
    scene.render.use_compositing=False;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.6
    world=bpy.data.worlds.new('Foliage comparison world');world.use_nodes=True;scene.world=world
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.24,.28,.26,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
    for name,energy,color,rotation in [('Key',2.4,(1,.89,.74),(24,-28,-35)),('Fill',1.2,(.77,.86,1),(48,22,120)),('Rim',1.5,(1,.96,.83),(35,-20,205))]:
        data=bpy.data.lights.new(name,'SUN');data.energy=energy;data.color=color;data.angle=math.radians(10)
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.rotation_euler=[math.radians(v) for v in rotation]
    camera=bpy.data.objects.new('Matched reference camera',bpy.data.cameras.new('Matched reference camera'));scene.collection.objects.link(camera);scene.camera=camera
    camera.data.type='ORTHO';camera.data.clip_start=.01;camera.data.clip_end=500
    species=model.split('/')[0];destination=Path(options['output'])/'comparisons';destination.mkdir(exist_ok=True)
    source=json.loads(Path(options['cameras']).read_text())
    poses=[(r['view'],r['camera']) for r in source['renders'] if r['species']==species and r['representation']=='reference']
    low=np.minimum(stats['proxyBoundsBefore'][0],stats['proxyBoundsAfter'][0])+np.array(original.location)-.4
    high=np.maximum(stats['proxyBoundsBefore'][1],stats['proxyBoundsAfter'][1])+np.array(original.location)+.4
    low[2]=original.location.z;target=(low+high)/2;horizontal=max(np.ptp(np.array([low,high]),axis=0)[:2])*1.45
    span=max((high[2]-low[2])*4/3*1.18,horizontal)
    for angle in [-72,18,108,198]:
        theta=math.radians(angle);eye=target+np.array([math.cos(theta)*30,math.sin(theta)*30,2.5])
        poses.append(('full_'+str(angle),{'position':eye.tolist(),'target':target.tolist(),'horizontalSpanMetres':span}))
    hero_objects,hero_target,hero_span=hero
    for name,direction in [('isolated_front',[.31,-.95,.25]),('isolated_side',[.9,.35,.45])]:
        poses.append((name,{'position':(hero_target+np.array(direction)*10).tolist(),'target':hero_target.tolist(),'horizontalSpanMetres':hero_span}))
    renders=[]
    for view,pose in poses:
        if options['views']=='detail' and view.startswith('full'):continue
        camera.location=pose['position'];camera.rotation_euler=(Vector(pose['target'])-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=pose['horizontalSpanMetres']
        for state in ['before','after']:
            isolate=view.startswith('isolated')
            original.hide_render=isolate or state!='before';new.hide_render=isolate or state!='after';twigs.hide_render=isolate or state!='after';wood.hide_render=isolate
            for i,obj in enumerate(hero_objects):obj.hide_render=not isolate or (state=='before')!=(i==0)
            original.hide_set(False);new.hide_set(False)
            filename=f'{species}_{view}_{state}.png';scene.render.filepath=str(destination/filename);bpy.ops.render.render(write_still=True)
            image=bpy.data.images.load(str(destination/filename),check_existing=False)
            pixels=np.empty(options['width']*(options['width']*3//4)*4,np.float32);image.pixels.foreach_get(pixels)
            alpha=pixels.reshape((options['width']*3//4,options['width'],4))[:,:,3];bpy.data.images.remove(image)
            renders.append({'id':model,'view':view,'state':state,'file':'comparisons/'+filename,'camera':pose,'occupiedPixels':int(np.count_nonzero(alpha>.5)),'width':options['width'],'height':options['width']*3//4})
            print(f'[Natural foliage] Rendered {species}/{view}/{state}',flush=True)
    return renders
