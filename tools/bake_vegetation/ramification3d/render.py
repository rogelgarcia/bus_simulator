# Fixed world-space EEVEE views of the saved leafless specimens and their diagnostic geometry.
import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from common import array


def point_camera(camera,center,direction,scale):
    center=Vector(center);direction=Vector(direction).normalized();camera.location=center+direction*scale*3
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=scale
    bpy.context.scene.camera=camera


def bounds(objects,directions=((0,-1,.02),(1,0,.02),(1,-1,.16),(-1,1,.16))):
    points=np.vstack([array(o.data.vertices,'co',3) for o in objects]);lo=points.min(axis=0);hi=points.max(axis=0)
    center=(lo+hi)/2;relative=points-center;extent=0.
    for direction in directions:
        rotation=(-Vector(direction)).to_track_quat('-Z','Y')
        right=np.array(rotation @ Vector((1,0,0)));up=np.array(rotation @ Vector((0,1,0)))
        extent=max(extent,float(np.max(np.abs(relative @ right))),float(np.max(np.abs(relative @ up))))
    return center,extent*2*1.12


def setup(width,samples):
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=width;scene.render.resolution_y=width;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.eevee.taa_render_samples=samples;scene.render.threads_mode='FIXED';scene.render.threads=2
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
    world=bpy.data.worlds.new('Neutral review studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.86,.87,.83,1);world.node_tree.nodes['Background'].inputs[1].default_value=.8;scene.world=world
    for name,location,power,size in [('Key',(-12,-16,24),2200,12),('Fill',(12,5,15),1800,10)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((0,0,5))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Review camera');camera=bpy.data.objects.new('Review camera',data);scene.collection.objects.link(camera)
    return camera


def render_views(folder,graph,meta,width,samples,only=None):
    camera=bpy.data.objects['Review camera'];objects={name:bpy.data.objects[name] for name in meta['meshes']}
    wood=objects[meta['wood']];fine=objects[meta['fine']];root=objects.get(meta['root']);levels=[objects[name] for name in meta['levels']];subtree=objects[meta['subtree']];fork=objects[meta['fork']]
    finished=bool(meta.get('surfaceFinish'));soil=None
    if finished:
        bpy.ops.mesh.primitive_plane_add(size=10000,location=(0,0,0));soil=bpy.context.object;soil.name='Review only / soil visibility plane'
        from mesh_adapter import create_material
        soil.data.materials.append(create_material('Soil visibility',(.16,.13,.09)));soil.hide_render=True
    center,scale=bounds([wood,fine]+([root] if finished else []));directions={'front':(0,-1,.02),'side':(1,0,.02),'oblique':(1,-1,.16),'rear_oblique':(-1,1,.16)}
    if finished:directions.update(front=(0,-1,.12),side=(1,0,.12))
    records=[]
    def capture(name,visible,target=center,extent=scale,direction=(1,-1,.16)):
        if only is not None and name not in only:return
        if finished:soil.hide_render=name not in [*directions,'soil_surface','root_collar','bark_detail'] and not name.startswith('collar_')
        for obj in objects.values():obj.hide_render=obj not in visible
        point_camera(camera,target,direction,extent);bpy.context.view_layer.update();file=folder/(name+'.png');bpy.context.scene.render.filepath=str(file)
        points=np.vstack([array(obj.data.vertices,'co',3) for obj in visible]);relative=points-np.asarray(target)
        rotation=camera.rotation_euler.to_quaternion();right=np.array(rotation @ Vector((1,0,0)));up=np.array(rotation @ Vector((0,1,0)))
        fraction=float(max(np.max(np.abs(relative @ right)),np.max(np.abs(relative @ up)))/(extent*.5))
        cropped=name in ['major_fork','soil_surface','root_collar','bark_detail','trunk_front','trunk_side','trunk_oblique'] or name.startswith('collar_')
        if not cropped and fraction>=.99:raise RuntimeError('Review clips geometry: '+name)
        bpy.ops.render.render(write_still=True)
        records.append({'view':name,'file':name+'.png','camera':{'position':list(camera.location),'target':[float(v) for v in target],'orthographicScale':float(extent)},'width':width,'height':width,'engine':'BLENDER_EEVEE','samples':samples,'intentionalCrop':cropped,'maximumFrameFraction':fraction,'neutralStem':name.startswith('trunk_'),'neutralCollar':name.startswith('collar_neutral_')})
    for name,direction in directions.items():capture(name,[wood,fine]+([root] if finished else []),direction=direction)
    capture('levels',levels)
    for tier in [0,1,3]:
        visible=[obj for obj in levels if obj['generationLevel']<=graph['settings']['depth']+tier]
        capture('tier_'+str(tier),visible)
    target,extent=bounds([subtree],((1,-1,.16),(1,0,.05)));capture('subtree',[subtree],target,extent)
    capture('subtree_side',[subtree],target,extent,(1,0,.05))
    selected=meta['forkSelection']
    capture('major_fork',[wood,fine],selected['center'],selected['radius']*2.4,(1,-1,.2))
    target,extent=bounds([fork],((1,-1,.25),));capture('isolated_fork',[fork],target,extent,(1,-1,.25))
    if root and (only is None or 'roots_full' in only or 'soil_surface' in only):
        target,extent=bounds([root],((1,-1,.7),));capture('roots_full',[root],target,extent,(1,-1,.7))
        if not finished:
            bpy.ops.mesh.primitive_plane_add(size=extent*6,location=(0,0,0));soil=bpy.context.object;soil.name='Review only / soil visibility plane'
            from mesh_adapter import create_material
            soil.data.materials.append(create_material('Soil visibility',(.46,.43,.37)))
        target=np.array([0.,0.,max(p['baseRadius'] for p in graph['paths'])]);capture('soil_surface',[wood,fine,root],target,extent*.8,(1,-1,.6));soil.hide_render=True
    if finished:
        target,extent=bounds([root],((1,0,.02),));capture('roots_side',[root],target,extent,(1,0,.02))
        target,extent=bounds([root],((0,0,1),));capture('roots_top',[root],target,extent,(0,0,1))
        base=max(p['baseRadius'] for p in graph['paths']);anchors=np.array([a['point'] for a in graph['base']['anchors']]);spread=max(np.ptp(anchors[:,0]),np.ptp(anchors[:,2]));extent=max(base*8,spread*2.2)
        capture('root_collar',[wood,fine,root],(0,0,base*.8),extent,(1,-1,.45))
        p=graph['paths'][0];height=min(p['span']*.3,base*4);points=np.array(p['points']);point=np.array([np.interp(height,points[:,1],points[:,0]),-np.interp(height,points[:,1],points[:,2]),height])
        capture('bark_detail',[wood,fine,root],point,base*4.4,(1,-1,.12))
        soil.hide_render=True
    if meta.get('stemReview'):
        from mesh_adapter import create_material,coordinates
        p=graph['paths'][0];points=coordinates(p['points']);target=(points[0]+points[-1])*.5;extent=p['span']*1.18
        layer=bpy.context.view_layer;previous=layer.material_override;layer.material_override=create_material('Stem inspection / neutral',(.14,.12,.095))
        try:
            for name,direction in [('trunk_front',(0,-1,.03)),('trunk_side',(1,0,.03)),('trunk_oblique',(1,-1,.08))]:capture(name,[wood,fine],target,extent,direction)
        finally:layer.material_override=previous
    if finished and meta.get('rootIntegrationReview'):
        from mesh_adapter import create_material
        base=max(a['radius'] for a in graph['base']['anchors']);anchors=np.array([a['point'] for a in graph['base']['anchors']]);spread=max(np.ptp(anchors[:,0]),np.ptp(anchors[:,2]));extent=max(base*8,spread*2.2)
        views=[('front',(0,-1,.22)),('side',(1,0,.22)),('oblique',(1,-1,.45))]
        for name,direction in views[:2]:capture('collar_'+name,[wood,fine,root],(0,0,base*.8),extent,direction)
        layer=bpy.context.view_layer;previous=layer.material_override;layer.material_override=create_material('Collar inspection / neutral',(.14,.12,.095))
        try:
            for name,direction in views:capture('collar_neutral_'+name,[wood,fine,root],(0,0,base*.8),extent,direction)
        finally:layer.material_override=previous
        soil.hide_render=True
    for obj in objects.values():obj.hide_render=obj.name not in [meta['wood'],meta['fine'],meta['root']]
    return records
