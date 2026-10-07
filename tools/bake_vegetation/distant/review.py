# Raytraces reimported final exports against the accepted LOD0 from matched bus-height cameras.
import hashlib
import json
import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from common import clear_scene, configure, write_json
from comparison import cutout_for_cycles


def imported(file):
    before=set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=str(file)); objects=list(set(bpy.data.objects)-before)
    for obj in objects:
        if obj.type=='MESH':
            for mat in obj.data.materials:
                if ('Distant' in mat.name and 'geometry' not in mat.name) or 'spray cards' in mat.name:
                    cutout_for_cycles(mat,.17 if ('leaves' in mat.name or 'spray cards' in mat.name) else 0,True)
    bpy.context.view_layer.update()
    return objects


def setup(options):
    scene=configure(options); scene.render.threads=2
    with bpy.data.libraries.load(str(Path(options['scene'])/'mature_tree_arboretum.blend'),link=False) as (available,loaded):
        loaded.worlds=[n for n in available.worlds if n.startswith('Kloofendal sky')]; loaded.objects=['Sun','Continuous Brown Mud ground']
    scene.world=loaded.worlds[0]
    for obj in loaded.objects:
        scene.collection.objects.link(obj)
        if obj.name.startswith('Continuous'): obj.location.z=-.025
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.3
    scene.cycles.use_denoising=True;scene.cycles.transparent_max_bounces=64
    scene.render.resolution_x=options['width'];scene.render.resolution_y=options['width'];scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    camera=bpy.data.objects.new('Bus-eye distant comparison',bpy.data.cameras.new('Bus-eye distant comparison'))
    scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='PERSP';camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=24;camera.data.clip_end=1000
    return scene,camera


def billboard(group,row,camera):
    mesh=next(obj for obj in group if obj.type=='MESH');center=np.mean(np.array(row['bounds']),axis=0)
    normal=np.array(camera.location)-center;normal/=np.linalg.norm(normal)
    azimuth=np.degrees(np.arctan2(normal[1],normal[0]));elevation=np.degrees(np.arcsin(normal[2]))
    view=min(row['views'],key=lambda v:(((v['azimuthDegrees']-azimuth+180)%360)-180)**2+(v['elevationDegrees']-elevation)**2)
    right=np.cross([0,0,1],normal);right/=np.linalg.norm(right);up=np.cross(normal,right)
    anchor=np.array(view['center'])
    if row['level']==5:
        pivot=np.array([0.,0.,row['bounds'][0][2]])
        offset=(pivot-anchor)@np.array(view['basis'])
        anchor=pivot-right*offset[0]-up*offset[1]
    uv=mesh.data.uv_layers.active.data;old=row['views'][0]['uv'];vertices={}
    for poly in mesh.data.polygons:
        for loop in poly.loop_indices:
            i=mesh.data.loops[loop].vertex_index;coord=uv[loop].uv
            x=1 if coord.x>(old[0]+old[2])/2 else -1;y=1 if coord.y>(old[1]+old[3])/2 else -1
            position=anchor+right*x*view['size'][0]/2+up*y*view['size'][1]/2
            vertices[i]=mesh.matrix_world.inverted()@Vector(position)
            uv[loop].uv=(view['uv'][2 if x>0 else 0],view['uv'][3 if y>0 else 1])
    for index,value in vertices.items():mesh.data.vertices[index].co=value
    local_normal=mesh.matrix_world.to_3x3().transposed()@Vector(normal)
    mesh.data.normals_split_custom_set([local_normal.normalized()]*len(mesh.data.loops))
    mesh.data.update();bpy.context.view_layer.update()


def render(options):
    output=Path(options['output'])/'comparisons';output.mkdir(parents=True,exist_ok=True)
    report_file=output/'renders.json';report=json.loads(report_file.read_text()) if report_file.exists() else {'renders':[]}
    for species in options['species']:
        manifest=json.loads((Path(options['output'])/species/'index.json').read_text())
        for variant in options['variants']:
            rows=[r for r in manifest['models'] if r['id']==variant and r['level'] in options['levels']]
            if not rows and 6 not in options['levels']:continue
            bounds=np.array((rows[0] if rows else next(r for r in manifest['models'] if r['id']=='cluster_'+variant[-2:]))['bounds']);center=bounds.mean(axis=0);height=bounds[1,2]-bounds[0,2]
            states=[(0,Path(options['source'])/'lod0'/species/variant/f'{variant}_lod0_review.glb',None)] if rows and options['reference']=='include' else []
            states += [(r['level'],Path(options['output'])/species/r['file'].replace('.glb','_review.glb'),r) for r in rows]
            for azimuth in [-72,18]:
                for level,file,row in states:
                    clear_scene();scene,camera=setup(options);group=imported(file)
                    distance=max(60.,height*7);angle=math.radians(azimuth)
                    camera.location=(center[0]+math.cos(angle)*distance,center[1]+math.sin(angle)*distance,2.2)
                    camera.rotation_euler=(Vector(center)-camera.location).to_track_quat('-Z','Y').to_euler()
                    camera.data.ortho_scale=max(height,np.ptp(bounds[:,0]),np.ptp(bounds[:,1]))*1.3
                    camera.data.lens=24*distance/camera.data.ortho_scale
                    if level>=5:billboard(group,row,camera)
                    name=f'{species}_{variant}_{azimuth}_lod{level}.png';scene.render.filepath=str(output/name)
                    bpy.ops.render.render(write_still=True)
                    report['renders']=[r for r in report['renders'] if r['file']!=name]
                    report['renders'].append({'file':name,'species':species,'variant':variant,'level':level,'azimuth':azimuth,
                        'eyeHeight':2.2,'projection':'perspective matched framing / far bus direction','camera':list(camera.location),
                        'scale':camera.data.ortho_scale,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'width':options['width'],'samples':options['samples']})
                    write_json(report_file,report)
            if 6 in options['levels']:
                row=next(r for r in manifest['models'] if r['level']==6 and r['id']=='cluster_'+variant[-2:])
                bounds=np.array(row['bounds']);center=bounds.mean(axis=0);clear_scene();scene,camera=setup(options)
                positions=np.array([item['position'] for item in row['instances']])
                slope=np.linalg.lstsq(np.column_stack([positions[:,:2],np.ones(len(positions))]),positions[:,2],rcond=None)[0]
                ground=next(obj for obj in bpy.data.objects if obj.name.startswith('Continuous Brown Mud'))
                ground.rotation_euler=(math.atan(slope[1]),-math.atan(slope[0]),0);ground.location.z=float(slope[2])-.025
                distance=max(200,float(np.max(bounds[1]-bounds[0]))*5);angle=math.radians(-72)
                camera.location=(center[0]+math.cos(angle)*distance,center[1]+math.sin(angle)*distance,2.2)
                camera.rotation_euler=(Vector(center)-camera.location).to_track_quat('-Z','Y').to_euler()
                camera.data.ortho_scale=float(max(bounds[1]-bounds[0]))*1.25
                camera.data.lens=24*distance/camera.data.ortho_scale
                file=Path(options['output'])/species/row['file'].replace('.glb','_review.glb');group=imported(file);billboard(group,row,camera)
                name=f'{species}_{row["id"]}_lod6.png';scene.render.filepath=str(output/name);bpy.ops.render.render(write_still=True)
                report['renders']=[r for r in report['renders'] if r['file']!=name]
                report['renders'].append({'file':name,'species':species,'variant':row['id'],'level':6,'azimuth':-72,'eyeHeight':2.2,
                    'treeCount':10,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'width':options['width'],'samples':options['samples']})
                write_json(report_file,report)
