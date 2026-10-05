# Outdoor Cycles lighting and physically scaled project soil, local to the review scene.
import math

import bpy
import numpy as np
from mathutils import Vector
from soil_sampling import stochastic_soil


def setup_sky(root, scene):
    path = root / 'assets/public/lighting/hdri/kloofendal_43d_clear_puresky_4k.hdr'
    original = bpy.data.images.load(str(path), check_existing=True)
    width, height = original.size
    pixels = np.empty(width * height * 4, np.float32)
    original.pixels.foreach_get(pixels)
    pixels = pixels.reshape(height, width, 4)
    luminance = pixels[:, :, :3] @ np.array([.2126, .7152, .0722], np.float32)
    y, x = np.unravel_index(np.argmax(luminance), luminance.shape)
    azimuth = (.5 - (x + .5) / width) * math.tau
    elevation = ((y + .5) / height - .5) * math.pi
    # Extract the photographed solar core into one aligned directional light.
    yy, xx = np.ogrid[:height, :width]
    dx = np.minimum(abs(xx - x), width - abs(xx - x)) * math.cos(elevation)
    distance = np.sqrt(dx * dx + ((yy - y) * width / (2 * height)) ** 2)
    radius = width * math.radians(1.2) / math.tau
    ring = (distance > radius) & (distance < radius * 1.6)
    background = np.median(pixels[ring, :3], axis=0)
    mask = (distance < radius) & (luminance > float(background @ [.2126, .7152, .0722]) * 1.3)
    excess = np.maximum(pixels[:, :, :3] - background, 0) * mask[:, :, None]
    solid_angle = math.tau / width * math.pi / height * math.cos(elevation)
    irradiance = excess.sum(axis=(0, 1)) * solid_angle
    energy = float(irradiance @ [.2126, .7152, .0722])
    if elevation < .1 or energy <= .01:
        raise RuntimeError('HDRI solar extraction failed')
    pixels[mask, :3] = background
    diffuse_sky = bpy.data.images.new('Sky illumination / solar core removed', width=width, height=height, float_buffer=True)
    diffuse_sky.pixels.foreach_set(pixels.ravel())
    diffuse_sky.pack()
    world = bpy.data.worlds.new('Kloofendal sky / matched photographed sun')
    scene.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    coordinate = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorRotate')
    mapping.rotation_type = 'AXIS_ANGLE'
    mapping.inputs['Axis'].default_value = (0, 0, 1)
    desired_azimuth = math.radians(-135)
    mapping.inputs['Angle'].default_value = azimuth - desired_azimuth
    # World texture coordinates use the untransformed ray direction.
    links.new(coordinate.outputs['Normal'], mapping.inputs['Vector'])
    background_nodes = []
    for image in [diffuse_sky, original]:
        env = nodes.new('ShaderNodeTexEnvironment'); env.image = image
        links.new(mapping.outputs['Vector'], env.inputs['Vector'])
        bg = nodes.new('ShaderNodeBackground')
        links.new(env.outputs['Color'], bg.inputs['Color'])
        background_nodes.append(bg)
    light_path, mix, output = nodes.new('ShaderNodeLightPath'), nodes.new('ShaderNodeMixShader'), nodes.new('ShaderNodeOutputWorld')
    links.new(light_path.outputs['Is Camera Ray'], mix.inputs[0])
    links.new(background_nodes[0].outputs[0], mix.inputs[1])
    links.new(background_nodes[1].outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs['Surface'])
    sun = bpy.data.lights.new('Sun / extracted HDRI direct component', 'SUN')
    sun.energy = energy
    sun.color = tuple(irradiance / energy)
    sun.angle = math.radians(.53)
    obj = bpy.data.objects.new('Sun', sun); scene.collection.objects.link(obj)
    direction = Vector((math.cos(elevation) * math.cos(desired_azimuth), math.cos(elevation) * math.sin(desired_azimuth), math.sin(elevation)))
    obj.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    return {'hdri': str(path), 'solarElevationDegrees': math.degrees(elevation),
            'solarAzimuthDegrees': -135, 'sunEnergy': energy, 'sunColor': list(sun.color),
            'sunAngleDegrees': .53, 'doubleSun': False, 'solarPixelsExtracted': int(mask.sum())}


def ground_material(root):
    material = bpy.data.materials.new('Brown Mud / original CC0 maps / 1.3 metres')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    coordinate = nodes.new('ShaderNodeTexCoord')
    scale = nodes.new('ShaderNodeVectorMath'); scale.operation = 'SCALE'
    scale.inputs['Scale'].default_value = 1 / 1.3
    links.new(coordinate.outputs['Object'], scale.inputs[0])
    images = {}
    for key, filename in [('color', 'basecolor.jpg'), ('normal', 'normal_gl.png'), ('arm', 'arm.png')]:
        image = bpy.data.images.load(str(root / 'assets/public/pbr/brown_mud' / filename), check_existing=True)
        image.colorspace_settings.name = 'sRGB' if key == 'color' else 'Non-Color'
        images[key] = image
    combined = stochastic_soil(nodes, links, scale.outputs['Vector'], images)
    links.new(combined['color'], bsdf.inputs['Base Color'])
    split = nodes.new('ShaderNodeSeparateColor')
    links.new(combined['arm'], split.inputs['Color'])
    links.new(split.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(split.outputs['Blue'], bsdf.inputs['Metallic'])
    normal = nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value = .5
    links.new(combined['normal'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    return material


def add_ground(root, scene):
    material = ground_material(root)
    # A continuous level planting surface seats the existing roots just below grade.
    mesh = bpy.data.meshes.new('Soil terrain')
    axis = [-1800, -1000, -600, -350, -220, -160] + list(range(-120, 121, 3)) + [160, 220, 350, 600, 1000, 1800]
    positions = []
    for y in axis:
        for x in axis:
            fade = min(1, max(0, (math.hypot(x, y) - 85) / 100))
            z = -.015 + fade * (4 + 5 * math.sin(x * .019) * math.cos(y * .023) + 2 * math.sin((x + y) * .032))
            positions.append((x, y, z))
    n = len(axis)
    faces = [(j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i) for j in range(n - 1) for i in range(n - 1)]
    mesh.from_pydata(positions, [], faces)
    uv = mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:
        uv.data[loop.index].uv = positions[loop.vertex_index][:2]
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(material)
    obj = bpy.data.objects.new('Continuous Brown Mud ground', mesh); scene.collection.objects.link(obj)
    return obj
