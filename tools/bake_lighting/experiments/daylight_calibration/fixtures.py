"""Neutral receiver, sphere and finite-source fixtures in metre-scale Blender axes."""
import bpy
import bmesh
from mathutils import Vector
from sky import configure,world
from daylight_math import sun_direction

NORMALS={'horizontal':(0,0,1),'east':(1,0,0),'north':(0,1,0)}

def material(name,metal=False):
    result=bpy.data.materials.new(name);result.use_nodes=True;tree=result.node_tree;tree.nodes.clear()
    shader=tree.nodes.new('ShaderNodeBsdfGlossy' if metal else 'ShaderNodeBsdfDiffuse')
    shader.inputs['Color'].default_value=(.95,.95,.95,1) if metal else (.18,.18,.18,1);shader.inputs['Roughness'].default_value=.04 if metal else 0
    output=tree.nodes.new('ShaderNodeOutputMaterial');tree.links.new(shader.outputs[0],output.inputs['Surface']);return result

def plane(scene,name,normal=(0,0,1),size=4,location=(0,0,0)):
    mesh=bpy.data.meshes.new(name);s=size/2;mesh.from_pydata([(-s,-s,0),(s,-s,0),(s,s,0),(-s,s,0)],[],[(0,1,2,3)])
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);obj.rotation_euler=Vector(normal).to_track_quat('Z','Y').to_euler();obj.location=location
    mesh.materials.append(material(name));return obj

def fixture(defaults,profile,mode,kind):
    name=profile['id']+'_'+mode+'_'+kind;scene=bpy.data.scenes.new(name)
    size=128 if kind in NORMALS else 512;configure(scene,defaults,size,size,defaults['fixtureSamples']);scene.world=world(defaults,profile,mode)
    camera=bpy.data.objects.new(name+'_camera',bpy.data.cameras.new(name+'_camera'));scene.collection.objects.link(camera);scene.camera=camera
    camera.data.type='ORTHO';camera.data.ortho_scale=2
    if kind in NORMALS:
        n=Vector(NORMALS[kind]);plane(scene,'card',n);camera.location=n*3;camera.rotation_euler=(-n).to_track_quat('-Z','Y').to_euler()
    elif kind=='spheres':
        plane(scene,'floor',size=200)
        for x,metal in [(-1,False),(1,True)]:
            # Avoid context.object: a headed window can retain another scene's active object.
            name='mirror' if metal else 'diffuse';mesh=bpy.data.meshes.new(name);bm=bmesh.new()
            bmesh.ops.create_uvsphere(bm,u_segments=64,v_segments=32,radius=.7);bm.to_mesh(mesh);bm.free()
            obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);obj.location=(x,0,.7)
            mesh.materials.append(material(name,metal))
            for polygon in mesh.polygons:polygon.use_smooth=True
            shader='BSDF_GLOSSY' if metal else 'BSDF_DIFFUSE'
            if len(mesh.materials)!=1 or not any(n.type==shader for n in mesh.materials[0].node_tree.nodes):raise RuntimeError('Sphere material assignment failed')
        scene.view_layers[0].use_pass_glossy_direct=True;scene.view_layers[0].use_pass_glossy_indirect=True
        camera.data.ortho_scale=5;camera.location=(0,-7,3);camera.rotation_euler=(Vector((0,0,.7))-camera.location).to_track_quat('-Z','Y').to_euler()
    else:
        gap=.2 if kind=='shadow_near' else 2
        sun=Vector(sun_direction(defaults));plane(scene,'receiver',size=30)
        blocker=plane(scene,'black_blocker',size=4,location=(2,0,gap));blocker.data.materials[0].node_tree.nodes.get('Diffuse BSDF').inputs['Color'].default_value=(0,0,0,1)
        center=Vector((-gap*sun.x/sun.z,-gap*sun.y/sun.z,0));camera.location=center+Vector((0,0,8));camera.data.ortho_scale=.16
    return scene
