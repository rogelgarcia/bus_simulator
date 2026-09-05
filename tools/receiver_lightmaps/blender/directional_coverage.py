"""Reconstructs authored fading overlays for the enhanced diffuse bake."""

import json


def apply_directional_coverage(materials):
    count = 0
    for material in materials:
        record = json.loads(material.get('bus_sim_semantics', '{}'))
        if record.get('alpha', {}).get('mode') == 'procedural_coverage':
            install_coverage(material, record['alpha'])
            count += 1
    return count


def install_coverage(material, alpha):
    if alpha.get('inputs') or alpha.get('alphaTest', 0) != 0:
        raise ValueError('Unsupported enhanced procedural coverage inputs')
    nodes, links = material.node_tree.nodes, material.node_tree.links

    def math(operation, *values, clamp=False):
        node = nodes.new('ShaderNodeMath'); node.operation = operation; node.use_clamp = clamp
        for socket, value in zip(node.inputs, values):
            if isinstance(value, (int, float)):
                socket.default_value = value
            else:
                links.new(value, socket)
        return node.outputs[0]

    def separate(socket):
        node = nodes.new('ShaderNodeSeparateXYZ'); links.new(socket, node.inputs[0])
        return node.outputs

    def hash12(x, y):
        a, b = math('FRACT', math('MULTIPLY', x, .1031)), math('FRACT', math('MULTIPLY', y, .1031))
        dot = math('ADD', math('ADD', math('MULTIPLY', a, math('ADD', b, 33.33)),
                   math('MULTIPLY', b, math('ADD', a, 33.33))), math('MULTIPLY', a, math('ADD', a, 33.33)))
        a, b = math('ADD', a, dot), math('ADD', b, dot)
        return math('FRACT', math('MULTIPLY', math('ADD', a, b), a))

    def noise(x, y):
        ix, iy = math('FLOOR', x), math('FLOOR', y)
        fx, fy = math('FRACT', x), math('FRACT', y)
        ux = math('MULTIPLY', math('MULTIPLY', fx, fx), math('SUBTRACT', 3, math('MULTIPLY', 2, fx)))
        uy = math('MULTIPLY', math('MULTIPLY', fy, fy), math('SUBTRACT', 3, math('MULTIPLY', 2, fy)))
        a, b = hash12(ix, iy), hash12(math('ADD', ix, 1), iy)
        c, d = hash12(ix, math('ADD', iy, 1)), hash12(math('ADD', ix, 1), math('ADD', iy, 1))
        lower = math('ADD', a, math('MULTIPLY', math('SUBTRACT', b, a), ux))
        upper = math('ADD', c, math('MULTIPLY', math('SUBTRACT', d, c), ux))
        return math('ADD', lower, math('MULTIPLY', math('SUBTRACT', upper, lower), uy))

    uv = nodes.new('ShaderNodeUVMap'); uv.uv_map = 'uv'
    v = separate(uv.outputs['UV'])['Y']
    coverage = float(alpha['opacity'])
    for adapter in alpha['proceduralCoverage']:
        config = adapter['semantics']
        if adapter['adapterId'] == 'sidewalk-edge-dirt-strip-v1':
            mask = math('POWER', math('SUBTRACT', 1, v, clamp=True), max(.01, config['fadePower']))
        elif adapter['adapterId'] == 'asphalt-edge-wear-v1':
            width = min(max(config['width'], 0), config['maxWidth'])
            if width <= 1e-6 or config['strength'] <= 0:
                mask = 0
            else:
                t = math('DIVIDE', math('MULTIPLY', math('ADD', v, 0, clamp=True), max(1e-6, config['maxWidth'])), width, clamp=True)
                edge = math('POWER', math('SUBTRACT', 1, t), 1.35)
                geometry = nodes.new('ShaderNodeNewGeometry')
                world = separate(geometry.outputs['Position'])
                x = math('MULTIPLY', math('ADD', world['X'], config['seed'][0] * 100), config['scale'])
                y = math('MULTIPLY', math('ADD', math('MULTIPLY', world['Y'], -1), config['seed'][1] * 100), config['scale'])
                rx = math('ADD', math('MULTIPLY', .8, x), math('MULTIPLY', .6, y))
                ry = math('ADD', math('MULTIPLY', -.6, x), math('MULTIPLY', .8, y))
                n = math('ADD', math('MULTIPLY', .68, noise(rx, ry)), math('MULTIPLY', .32,
                    noise(math('MULTIPLY_ADD', rx, 2.07, 21.1), math('MULTIPLY_ADD', ry, 2.07, 5.7))))
                mask = math('MULTIPLY', math('MULTIPLY', config['strength'], edge), math('MULTIPLY_ADD', n, .35, .65), clamp=True)
        else:
            raise ValueError('Unsupported enhanced coverage adapter: ' + adapter['adapterId'])
        coverage = math('MULTIPLY', coverage, mask)
    output = next(node for node in nodes if node.type == 'OUTPUT_MATERIAL')
    surface = output.inputs['Surface'].links[0].from_socket
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(coverage, mix.inputs[0]); links.new(transparent.outputs[0], mix.inputs[1]); links.new(surface, mix.inputs[2])
    links.new(mix.outputs[0], output.inputs['Surface'])
