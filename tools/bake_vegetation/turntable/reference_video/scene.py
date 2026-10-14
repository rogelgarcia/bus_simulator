# Frames the unchanged reference and the same saved shoot in context and in isolation.
import math
from pathlib import Path
import bpy
from mathutils import Vector,Matrix
from scene import studio as whole_studio,material,title
from foliage_study import isolate

SHOTS={'full':'Full tree · 360° orbit','trunk':'Trunk · roots and ramification',
       'branch_in':'Branchlet · in the canopy','branch_out':'Branchlet · isolated geometry'}


def prepare(options,model,shot):
    variant=model['id'].split('/')[-1]
    scene,report=whole_studio({**options,'variant':variant},model,labels=False)
    camera=scene.camera;root=bpy.data.objects['Mature specimen']
    objects=[bpy.data.objects[model['id']+' / '+suffix] for suffix in ['enhanced leaves','enhanced wood','enhanced branchlets']]
    pose=None
    if shot!='full':
        camera.animation_data_clear();scene.frame_end=options['fps']*options['detail-seconds']
        if shot=='trunk':
            fork=Vector(model['metadata']['dimensions']['growth']['firstFork'])
            pose={'target':[fork.x,fork.y,fork.z*.85],'offset':[9,-16,3.5],'span':fork.z*2.25}
        else:
            pair,_=isolate(Path(model['file']).parent,objects)
            pose=model['metadata']['sprayStudyPose']
            for obj in pair:
                obj.parent=root
                obj.hide_render=shot!='branch_out'
            if shot=='branch_out':
                for obj in objects:obj.hide_render=True
                bpy.data.objects['Circular specimen stage'].hide_render=True
        target=Vector(pose['target'])+root.location
        offset=Vector(pose['offset'])
        camera.data.type='ORTHO';camera.data.clip_start=.01
        camera.data.ortho_scale=pose['span']*(16/9)/.74
        for frame in range(1,scene.frame_end+1):
            t=(frame-1)/max(1,scene.frame_end-1)
            angle=math.radians((-24+48*t) if shot=='trunk' else (-12+36*t))
            eye=Matrix.Rotation(angle,3,'Z')@offset
            rotation=(-eye).to_track_quat('-Z','Y')
            center=target+(rotation@Vector((0,1,0)))*pose['span']*.07
            camera.location=center+eye;camera.rotation_euler=rotation.to_euler()
            camera.keyframe_insert(data_path='location',frame=frame);camera.keyframe_insert(data_path='rotation_euler',frame=frame)
        if shot.startswith('branch'):
            light=bpy.data.lights.new('Leaf detail softbox','AREA');light.energy=220;light.shape='DISK';light.size=3;light.use_shadow=False
            lamp=bpy.data.objects.new(light.name,light);scene.collection.objects.link(lamp)
            lamp.location=target+offset+Vector((1,0,1));lamp.rotation_euler=(target-lamp.location).to_track_quat('-Z','Y').to_euler()
    horizontal=camera.data.ortho_scale;vertical=horizontal/(16/9)
    panel=material('Presentation backdrop',(.008,.020,.016),emission=True)
    for name,low,high in [('Header',.325,.51),('Footer',-.51,-.412)]:
        mesh=bpy.data.meshes.new(name);mesh.from_pydata([(-horizontal*.51,vertical*low,-.6),(horizontal*.51,vertical*low,-.6),
            (horizontal*.51,vertical*high,-.6),(-horizontal*.51,vertical*high,-.6)],[],[(0,1,2,3)])
        obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);obj.parent=camera;obj.visible_shadow=False;mesh.materials.append(panel)
    ink=material('Presentation ivory',(.70,.78,.65),emission=True)
    muted=material('Presentation sage',(.42,.55,.44),emission=True)
    title(camera,'London plane',(-horizontal*.455,vertical*.442,-.5),vertical*.055,ink)
    title(camera,'Platanus × acerifolia',(-horizontal*.455,vertical*.372,-.5),vertical*.031,muted)
    title(camera,f'MATURE {variant[-2:]} / 03',(horizontal*.275,vertical*.442,-.5),vertical*.030,ink)
    title(camera,SHOTS[shot],(-horizontal*.455,-vertical*.435,-.5),vertical*.025,ink)
    title(camera,'ENHANCED REFERENCE · v13',(horizontal*.21,-vertical*.435,-.5),vertical*.022,muted)
    scene.frame_set(1)
    report.update(variant=variant,shot=shot,frames=scene.frame_end,seconds=scene.frame_end/options['fps'],
                  orbitDegrees=360 if shot=='full' else 48 if shot=='trunk' else 36,sourceId=model['id'],
                  cameraStudy=pose,isolatedOriginalGeometry=shot=='branch_out')
    return scene,report
