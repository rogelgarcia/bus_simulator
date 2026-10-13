# Matched road-height views and foliage-only masks measure coverage independently of bark and shadows.
import math
import bpy
import numpy as np
from architecture import unit


def add_poses(poses,meta):
    full=poses['full'];target=full['target'];distance=30.
    for i,degrees in enumerate([-78,42,162]):
        angle=math.radians(degrees);offset=[distance*math.cos(angle),distance*math.sin(angle),2.7-target[2]]
        pose={'target':target,'offset':offset,'span':full['span']*1.04,'projection':'PERSP'}
        poses['road_'+str(i)]=pose;poses['coverage_'+str(i)]=pose.copy()
    normal=unit(np.array(meta['sprayStudyPose']['offset']));side=unit(np.cross(normal,[0,0,1]))
    poses['shoot_edge']={**meta['sprayStudyPose'],'offset':(unit(side+.08*normal)*8).tolist()}


def mask_mode(scene,enabled,samples):
    scene.render.film_transparent=enabled;scene.cycles.samples=1 if enabled else samples;scene.cycles.use_denoising=not enabled
    bpy.data.objects['Neutral showroom floor'].hide_render=enabled
    if enabled:
        material=bpy.data.materials.get('Foliage coverage emission')
        if material is None:
            material=bpy.data.materials.new('Foliage coverage emission');material.use_nodes=True;nodes=material.node_tree.nodes;nodes.clear()
            emission=nodes.new('ShaderNodeEmission');output=nodes.new('ShaderNodeOutputMaterial');material.node_tree.links.new(emission.outputs[0],output.inputs[0])
        scene.view_layers[0].material_override=material


def coverage(file):
    image=bpy.data.images.load(str(file));pixels=np.empty(len(image.pixels),np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(-1,4)
    result={'coveredPixels':int(np.count_nonzero(pixels[:,3]>.5)),'pixelCount':len(pixels),'fraction':float(np.mean(pixels[:,3]))}
    bpy.data.images.remove(image);return result
