"""Three's material UV override, applied after the texture matrix and before wrapping."""
import math

IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1]
FLIP_V = [1, 0, 0, 0, -1, 0, 0, 1, 1]


def multiply(a, b):
    return [sum(a[k * 3 + row] * b[column * 3 + k] for k in range(3))
            for column in range(3) for row in range(3)]


def tiling_matrix(config):
    if not config:
        return IDENTITY[:]
    def pair(value):
        return (value['x'], value['y']) if isinstance(value, dict) else value
    sx, sy = pair(config['tiling']); ox, oy = pair(config['offset']); angle = config['rotation']
    if not all(math.isfinite(v) for v in [sx, sy, ox, oy, angle]) or min(sx, sy) <= 0:
        raise ValueError('Invalid authored material UV override')
    c, s = math.cos(angle), math.sin(angle)
    # GLSL mat2(c,-s,s,c) is column-major: rotation is clockwise in UV space.
    return [c*sx, -s*sx, 0, s*sy, c*sy, 0, ox, oy, 1]


def binding_with_tiling(binding, config):
    return {**binding, 'matrix': multiply(tiling_matrix(config), binding['matrix'])}


def insert_gltf_tiling(material, config):
    """glTF imports UV V flipped; conjugate the post-texture transform accordingly."""
    matrix = multiply(FLIP_V, multiply(tiling_matrix(config), FLIP_V))
    nodes, links = material.node_tree.nodes, material.node_tree.links
    count = 0
    for texture in [node for node in nodes if node.type == 'TEX_IMAGE']:
        vector = texture.inputs['Vector']
        source = vector.links[0].from_socket if vector.is_linked else nodes.new('ShaderNodeTexCoord').outputs['UV']
        combine = nodes.new('ShaderNodeCombineXYZ'); combine.label = 'Authored material UV override'
        for row, component in [(0, 'X'), (1, 'Y')]:
            dot = nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
            dot.inputs[1].default_value = (matrix[row], matrix[3+row], 0)
            links.new(source, dot.inputs[0])
            add = nodes.new('ShaderNodeMath'); add.operation = 'ADD'; add.inputs[1].default_value = matrix[6+row]
            links.new(dot.outputs['Value'], add.inputs[0]); links.new(add.outputs[0], combine.inputs[component])
        links.new(combine.outputs[0], vector); count += 1
    return count
