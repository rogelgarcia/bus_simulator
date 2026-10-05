# Photo-driven triplanar wood avoids cylinder seams at fused branch collars.
import bpy
import numpy as np
from maps import read_pixels, sample


def texture(nodes, path, color=False):
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    node = nodes.new('ShaderNodeTexImage'); node.image = image
    node.label = path.stem
    return node


def bark_material(name, paths, recipe, seed):
    material = bpy.data.materials.new(name + ' / scanned bark'); material.use_nodes = True
    material['source'] = recipe['bark']; material['surfaceRevision'] = 'photographic-pbr-v1'
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Specular IOR Level'].default_value = .28
    rng = np.random.default_rng(seed + 586)
    tile = np.array(recipe['tile']) * rng.uniform(.94, 1.06)
    tile[1] *= 4
    scale = np.array([1/tile[0], 1/tile[0], 1/tile[1]])
    offset = rng.uniform(0, 8, 3)
    def math_node(op, a, b=None):
        node = nodes.new('ShaderNodeMath'); node.operation = op
        for index, value in enumerate([a, b]):
            if value is None: continue
            if isinstance(value, (int, float)): node.inputs[index].default_value = value
            else: links.new(value, node.inputs[index])
        return node.outputs[0]
    coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath'); mapping.operation = 'MULTIPLY_ADD'
    links.new(coord.outputs['Object'], mapping.inputs[0]); mapping.inputs[1].default_value = scale
    mapping.inputs[2].default_value = offset
    xyz = nodes.new('ShaderNodeSeparateXYZ'); links.new(mapping.outputs[0], xyz.inputs[0])
    geom = nodes.new('ShaderNodeNewGeometry')
    transform = nodes.new('ShaderNodeVectorTransform'); transform.vector_type = 'NORMAL'
    transform.convert_from = 'WORLD'; transform.convert_to = 'OBJECT'; links.new(geom.outputs['Normal'], transform.inputs[0])
    normal = nodes.new('ShaderNodeSeparateXYZ'); links.new(transform.outputs[0], normal.inputs[0])
    powers = [math_node('POWER', math_node('ABSOLUTE', normal.outputs[i]), 6.0) for i in range(3)]
    total = math_node('ADD', math_node('ADD', powers[0], powers[1]), powers[2])
    weights = [math_node('DIVIDE', power, total) for power in powers]
    coords = []
    for first, second in [(1, 2), (0, 2), (0, 1)]:
        combine = nodes.new('ShaderNodeCombineXYZ')
        links.new(xyz.outputs[first], combine.inputs[0]); links.new(xyz.outputs[second], combine.inputs[1])
        coords.append(combine.outputs[0])
    def triplanar(channel):
        terms = []
        for vector, weight in zip(coords, weights):
            tex = texture(nodes, paths[channel], channel == 'color'); links.new(vector, tex.inputs['Vector'])
            multiply = nodes.new('ShaderNodeVectorMath'); multiply.operation = 'SCALE'
            links.new(tex.outputs['Color'], multiply.inputs[0]); links.new(weight, multiply.inputs['Scale'])
            terms.append(multiply.outputs[0])
        a = nodes.new('ShaderNodeVectorMath'); a.operation = 'ADD'
        links.new(terms[0], a.inputs[0]); links.new(terms[1], a.inputs[1])
        b = nodes.new('ShaderNodeVectorMath'); b.operation = 'ADD'
        links.new(a.outputs[0], b.inputs[0]); links.new(terms[2], b.inputs[1])
        return b.outputs[0]
    links.new(triplanar('color'), bsdf.inputs['Base Color'])
    links.new(triplanar('roughness'), bsdf.inputs['Roughness'])
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .72
    bump.inputs['Distance'].default_value = recipe['relief']
    links.new(triplanar('height'), bump.inputs['Height']); links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    height = read_pixels(paths['height'])[:, :, 0][::-1].copy()
    def surface(points, normals):
        p = points * scale + offset
        weight = np.abs(normals) ** 6; weight /= np.maximum(weight.sum(axis=1, keepdims=True), 1e-10)
        field = sum(sample(height, p[:, axes], True) * weight[:, i] for i, axes in enumerate([[1, 2], [0, 2], [0, 1]]))
        return field, {'barkSource': recipe['bark'], 'mapping': 'Continuous three-axis photographic projection',
                       'tileMetres': tile.tolist(), 'seededScanOffset': offset.tolist(), 'syntheticSurfaceNoise': False}
    return material, surface


def leaf_material(name, paths):
    material = bpy.data.materials.new(name + ' / photographed leaf tissue'); material.use_nodes = True
    material['surfaceRevision'] = 'photographic-pbr-v1'
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF'); bsdf.inputs['Specular IOR Level'].default_value = .30
    color = texture(nodes, paths['color'], True)
    rough = texture(nodes, paths['roughness'])
    normal = texture(nodes, paths['normal'])
    normal_map = nodes.new('ShaderNodeNormalMap'); normal_map.inputs['Strength'].default_value = .55
    links.new(normal.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
    links.new(color.outputs['Color'], bsdf.inputs['Base Color']); links.new(rough.outputs['Color'], bsdf.inputs['Roughness'])
    # Thin closed tissue transmits daylight while its waxy front keeps a restrained specular response.
    transmission = nodes.new('ShaderNodeBsdfTranslucent'); links.new(color.outputs['Color'], transmission.inputs['Color'])
    mix = nodes.new('ShaderNodeMixShader'); mix.inputs[0].default_value = .17
    links.new(bsdf.outputs[0], mix.inputs[1]); links.new(transmission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
    return material
