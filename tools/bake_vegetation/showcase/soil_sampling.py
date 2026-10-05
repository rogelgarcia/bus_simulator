# Blends randomly offset photographic tiles while retaining their physical texel scale.
import bpy


def stochastic_soil(nodes, links, coordinates, images):
    def input_value(socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            links.new(value, socket)
        else:
            socket.default_value = value

    def vector(operation, a, b=None, scale=None):
        node = nodes.new('ShaderNodeVectorMath'); node.operation = operation
        input_value(node.inputs[0], a)
        if b is not None:
            input_value(node.inputs[1], b)
        if scale is not None:
            input_value(node.inputs['Scale'], scale)
        return node.outputs['Value' if operation == 'DISTANCE' else 'Vector']

    def scalar(operation, a, b):
        node = nodes.new('ShaderNodeMath'); node.operation = operation
        input_value(node.inputs[0], a); input_value(node.inputs[1], b)
        return node.outputs[0]

    uv = vector('MULTIPLY', coordinates, (1, 1, 0))
    cell = vector('FLOOR', uv)
    sums, weight_sum = {}, None
    for y in [-1, 0, 1]:
        for x in [-1, 0, 1]:
            center = vector('ADD', cell, (x + .5, y + .5, 0))
            distance = vector('DISTANCE', center, uv)
            weight = scalar('POWER', scalar('MAXIMUM', scalar('SUBTRACT', 1.5, distance), 0), 4)
            weight_sum = weight if weight_sum is None else scalar('ADD', weight_sum, weight)
            random = nodes.new('ShaderNodeTexWhiteNoise'); random.noise_dimensions = '3D'
            links.new(center, random.inputs['Vector'])
            shifted = vector('ADD', uv, vector('MULTIPLY', random.outputs['Color'], (23, 23, 0)))
            for key, image in images.items():
                texture = nodes.new('ShaderNodeTexImage'); texture.image = image
                links.new(shifted, texture.inputs['Vector'])
                weighted = vector('SCALE', texture.outputs['Color'], scale=weight)
                sums[key] = weighted if key not in sums else vector('ADD', sums[key], weighted)
    inverse = scalar('DIVIDE', 1, weight_sum)
    return {key: vector('SCALE', value, scale=inverse) for key, value in sums.items()}
