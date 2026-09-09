"""Build isolated analytical fixtures and a measured-geometry Cornell reference scene."""
import math
import bpy
from mathutils import Vector


def diffuse(name, color, emission=None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    shader = nodes.new('ShaderNodeEmission' if emission is not None else 'ShaderNodeBsdfDiffuse')
    shader.inputs['Color'].default_value = (*color, 1)
    shader.inputs['Strength' if emission is not None else 'Roughness'].default_value = emission if emission is not None else 0
    output = nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(shader.outputs[0], output.inputs['Surface'])
    return material


def quad(scene, name, vertices, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    return obj


def base_scene(name, defaults):
    scene = bpy.data.scenes.new(name)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = defaults['samples']
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.cycles.seed = defaults['seed']
    scene.cycles.max_bounces = 12
    scene.cycles.diffuse_bounces = 12
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = defaults['threads']
    scene.render.resolution_x = defaults['width']
    scene.render.resolution_y = defaults['width']
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.filter_size = 0.01
    scene.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'
    scene.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
    scene.render.image_settings.color_depth = '32'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    layer = scene.view_layers[0]
    layer.name = 'Calibration'
    layer.use_pass_diffuse_direct = True
    layer.use_pass_diffuse_indirect = True
    layer.use_pass_diffuse_color = True
    layer.use_pass_glossy_direct = True
    layer.use_pass_glossy_indirect = True
    layer.use_pass_emit = True
    world = bpy.data.worlds.new(name)
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
    scene.world = world
    camera = bpy.data.objects.new(name + '_camera', bpy.data.cameras.new(name + '_camera'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.location = (0, 0, 4)
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = defaults['orthoScale']
    return scene


def fixture_scene(fixture, defaults):
    scene = base_scene(fixture['id'], defaults)
    color = fixture['color']
    material = diffuse(fixture['id'], color)
    if 'textureBytes' in fixture:
        image = bpy.data.images.new('sRGB input', width=1, height=1)
        image.colorspace_settings.name = 'sRGB'
        image.pixels = [v / 255 for v in fixture['textureBytes']] + [1]
        image.pack()
        texture = material.node_tree.nodes.new('ShaderNodeTexImage')
        texture.image = image
        material.node_tree.links.new(texture.outputs['Color'], material.node_tree.nodes.get('Diffuse BSDF').inputs['Color'])
    quad(scene, 'Receiver', [(-2,-2,0),(2,-2,0),(2,2,0),(-2,2,0)], material)
    source = fixture['source']
    if source == 'environment':
        background = scene.world.node_tree.nodes['Background']
        background.inputs['Color'].default_value = (1,1,1,1)
        background.inputs['Strength'].default_value = fixture['radiance']
    else:
        light = bpy.data.lights.new('Source', 'POINT' if source == 'point' else 'SUN')
        obj = bpy.data.objects.new('Source', light)
        scene.collection.objects.link(obj)
        if source == 'point':
            light.energy = fixture['intensity'] * 4 * math.pi
            light.shadow_soft_size = 0
            obj.location = (0,0,fixture['height'])
        else:
            light.energy = fixture['irradiance']
            light.angle = fixture.get('angularDiameter', 0)
            a = math.radians(fixture.get('angleDeg', 0))
            direction = Vector((-0.5,0,1)).normalized() if source == 'shadow' else Vector((math.sin(a),0,math.cos(a)))
            obj.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
        if source == 'shadow':
            z = fixture['occluderHeight']
            quad(scene, 'Opaque blocker', [(-3,-3,z),(0,-3,z),(0,3,z),(-3,3,z)], diffuse('Black blocker',(0,0,0)))
    return scene


def cornell_scene(data, defaults, wavelength):
    scene = base_scene('cornell_' + str(wavelength), defaults)
    scene.render.resolution_x = scene.render.resolution_y = 384
    scene.camera.data.type = 'PERSP'
    scene.camera.data.lens = data['camera']['Focal length'][0] * 1000
    scene.camera.data.sensor_width = data['camera']['Width, height'][0] * 1000
    scene.camera.location = [v / 1000 for v in data['camera']['Position']]
    scene.camera.rotation_euler = Vector(data['camera']['Direction']).to_track_quat('-Z', 'Y').to_euler()
    import numpy as np
    spectra = np.array(data['reflectance'])
    materials = {name:diffuse(name, (float(np.interp(wavelength,spectra[:,0],spectra[:,i])),)*3) for i,name in enumerate(['white','green','red'],1)}
    emission = np.array(data['emission'])
    materials['light'] = diffuse('Published source spectrum', (1,1,1), float(np.interp(wavelength,emission[:,0],emission[:,1])))
    material = materials['light']
    reflection = material.node_tree.nodes.new('ShaderNodeBsdfDiffuse')
    reflection.inputs['Color'].default_value = (data['sourceReflectance'],)*3+(1,)
    reflection.inputs['Roughness'].default_value = 0
    added = material.node_tree.nodes.new('ShaderNodeAddShader')
    material.node_tree.links.new(material.node_tree.nodes.get('Emission').outputs[0],added.inputs[0])
    material.node_tree.links.new(reflection.outputs[0],added.inputs[1])
    material.node_tree.links.new(added.outputs[0],material.node_tree.nodes.get('Material Output').inputs['Surface'])
    for surface in data['surfaces']:
        vertices = surface['vertices']
        faces = [vertices]
        if surface['id'] == 'ceiling':
            inner = data['ceilingAperture']
            faces = [[vertices[i],vertices[(i+1)%4],inner[(i+1)%4],inner[i]] for i in range(4)]
        for index,face in enumerate(faces):
            quad(scene,surface['id']+str(index),[[v/1000 for v in p] for p in face],materials[surface['material']])
    scene['reference_role'] = 'Monochromatic transport reference using published measured geometry/reflectance and relative source; not a camera photograph or RGB colorimetric reconstruction.'
    scene['wavelength_nm'] = wavelength
    return scene


def vector_scene(defaults):
    scene = base_scene('display_vectors', defaults)
    size = defaults['orthoScale']/3
    for index, color in enumerate(defaults['vectors']):
        x, y = (index % 3-1)*size, (1-index//3)*size
        quad(scene, 'Vector '+str(index), [(x-size/2,y-size/2,0),(x+size/2,y-size/2,0),(x+size/2,y+size/2,0),(x-size/2,y+size/2,0)], diffuse('Emission '+str(index),color,1))
    return scene
