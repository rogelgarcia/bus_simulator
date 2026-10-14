# Renders actual saved reference leaf topology without changing its mesh or material sources.
import hashlib
import json
import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from common import array,configure,write_json
from render import load
from spatial_poses import leaf_prototypes
from releaf import wood_digest


def emission(name,color):
    mat=bpy.data.materials.new(name);mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear()
    out=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeEmission');shader.inputs['Color'].default_value=(*color,1)
    mat.node_tree.links.new(shader.outputs[0],out.inputs['Surface']);return mat


def wire_material():
    mat=bpy.data.materials.new('Actual triangulation, opaque surfaces');mat.use_nodes=True;nodes,links=mat.node_tree.nodes,mat.node_tree.links
    shader=nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.8
    wire=nodes.new('ShaderNodeWireframe');wire.use_pixel_size=True;wire.inputs['Size'].default_value=.75
    mix=nodes.new('ShaderNodeMixRGB');mix.inputs[1].default_value=(.46,.66,.52,1);mix.inputs[2].default_value=(.008,.022,.016,1)
    links.new(wire.outputs[0],mix.inputs[0]);links.new(mix.outputs[0],shader.inputs['Base Color']);return mat


def label(text,x,y,size,material):
    curve=bpy.data.curves.new(text,'FONT');curve.body=text;curve.align_x='CENTER';curve.size=size
    obj=bpy.data.objects.new(text,curve);bpy.context.scene.collection.objects.link(obj);obj.location=(x,y,1.8);curve.materials.append(material)


def render_leaf_wireframe(o):
    records=[]
    for model in o['models']:
        folder=Path(o['candidate'])/model;file=folder/'enhanced.blend';meta=json.loads((folder/'model.json').read_text())
        identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if identity!=meta['sha256']:raise RuntimeError('Leaf wireframe source identity changed')
        target=Path(o['output'])/model;target.mkdir(parents=True,exist_ok=True);image=target/'leaf_wireframe.png'
        if image.exists():raise RuntimeError('Preserve the existing leaf wireframe; choose a fresh output')
        bpy.ops.wm.read_factory_settings(use_empty=True)
        foliage=load(file,[model+' / enhanced leaves'])[0];foliage.hide_render=True;forms=leaf_prototypes(foliage)
        mesh=forms[0].data;original=wood_digest(mesh);stats=[]
        for form in forms:
            form.data.calc_loop_triangles();alpha=[]
            for mat in form.data.materials:
                for shader in mat.node_tree.nodes:
                    if shader.type=='BSDF_PRINCIPLED':alpha.append({'material':mat.name,'linked':shader.inputs['Alpha'].is_linked,'value':shader.inputs['Alpha'].default_value})
            stats.append({'prototype':form.name,'vertices':len(form.data.vertices),'triangles':len(form.data.loop_triangles),'meshSha256':wood_digest(form.data),'alphaInputs':alpha})
        if any(a['linked'] or a['value']!=1 for s in stats for a in s['alphaInputs']):raise RuntimeError('Expected opaque leaf tissue for this diagnostic')
        scene=configure(o);scene.cycles.max_bounces=3;scene.cycles.use_denoising=False
        scene.render.resolution_x=o['width'];scene.render.resolution_y=o['width']//2;scene.render.resolution_percentage=100
        scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
        scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.3
        world=bpy.data.worlds.new('Leaf inspection background');world.use_nodes=True;scene.world=world
        world.node_tree.nodes['Background'].inputs['Color'].default_value=(.028,.045,.038,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
        for location,power,size in [((-1,-1,4),300,4),((2,2,3),160,3)]:
            light=bpy.data.lights.new('Leaf softbox','AREA');light.energy=power;light.shape='DISK';light.size=size
            obj=bpy.data.objects.new('Leaf softbox',light);scene.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
        points=array(mesh.vertices,'co',3);center=Vector(((points.min(axis=0)+points.max(axis=0))*.5).tolist());wire=wire_material()
        for x,angle,textured in [(-1.48,0,True),(0,-.36,False),(1.48,1.32,False)]:
            copy=mesh.copy();obj=bpy.data.objects.new('Same saved leaf',copy);scene.collection.objects.link(obj);obj.rotation_euler[1]=angle
            obj.location=Vector((x,-.04,.45))-obj.rotation_euler.to_matrix()@center
            if textured:
                for i,source in enumerate(list(copy.materials)):
                    mat=source.copy();copy.materials[i]=mat
                    for node in mat.node_tree.nodes:
                        if node.type=='ATTRIBUTE' and node.attribute_name=='leaf_tint':
                            for link in list(node.outputs['Color'].links):
                                socket=link.to_socket;mat.node_tree.links.remove(link);socket.default_value=(1,1,1,1)
            else:
                copy.materials.clear();copy.materials.append(wire)
                for polygon in copy.polygons:polygon.material_index=0
            if wood_digest(copy)!=original:raise RuntimeError('Diagnostic changed saved leaf geometry or UVs')
        ink=emission('Diagram type',(.83,.91,.85));muted=emission('Diagram secondary type',(.47,.62,.53))
        label('LONDON PLANE  /  ENHANCED REFERENCE',0,1.02,.105,ink)
        for x,title,note in [(-1.48,'TEXTURED FACE','Actual saved leaf, neutral tint'),(0,'TRIANGLE WIREFRAME','Opaque tissue; hidden edges occluded'),(1.48,'GRAZING ANGLE','Same geometry; thickness not exaggerated')]:
            label(title,x,.82,.068,ink);label(note,x,.72,.045,muted)
        count=stats[0];label(f"{count['triangles']:,} triangles  /  {count['vertices']:,} vertices per leaf including stalk",0,-.96,.072,ink)
        label(f"Geometry follows the leaf outline. Separate upper/lower faces. {len(forms)} reusable leaf forms. No alpha cutout.",0,-1.06,.052,muted)
        camera=bpy.data.objects.new('Leaf topology camera',bpy.data.cameras.new('Leaf topology camera'));scene.collection.objects.link(camera)
        camera.location=(0,0,8);camera.rotation_euler=(0,0,0);camera.data.type='ORTHO';camera.data.ortho_scale=4.65;scene.camera=camera
        scene.render.filepath=str(image);bpy.ops.render.render(write_still=True)
        if wood_digest(mesh)!=original or hashlib.sha256(file.read_bytes()).hexdigest()!=identity:raise RuntimeError('Saved source changed during wireframe render')
        records.append({'id':model,'sourceSha256':identity,'sourceRevision':meta['revision'],'prototypes':stats,'file':str(image.relative_to(o['output'])).replace('\\','/'),'sha256':hashlib.sha256(image.read_bytes()).hexdigest(),'width':o['width'],'height':o['width']//2,'engine':'CYCLES','device':'CPU','savedMeshUnchanged':True})
        write_json(Path(o['output'])/'leaf-wireframes.json',{'models':records,'passed':True})
