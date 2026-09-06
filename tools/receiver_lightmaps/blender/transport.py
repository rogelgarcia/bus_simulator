"""Enhanced source transport for declared alpha coverage and authored PBR inputs."""
from copy import deepcopy
from reconstruct import _MaterialAdapter, accessor_values

POLICY = 'declared-alpha-coverage-v1'


def resolve_transport(package):
    manifest = deepcopy(package.manifest)
    supported = set()
    for material in manifest['materials']:
        support = material['channelSupport']['indirect_irradiance']
        mode = material['alpha']['mode']
        if (not support['supported'] and mode in ('blended', 'cutout_blended')
                and material['transmission'] == 0
                and all(reason == 'unsupported_alpha_mode:' + mode for reason in support['reasons'])):
            supported.add(material['id'])
            support.update(supported=True, reasons=[])
    for mapping in manifest['participantMappings']:
        if mapping['materialId'] in supported:
            mapping['channelRelevance']['indirect_irradiance'] = True
    for mapping in manifest['casterMappings']:
        if mapping['materialId'] in supported and mapping.get('coverageMode') == 'forced_opaque':
            mapping['coverageMode'] = 'opaque'
    package.manifest = manifest
    return sorted(supported)


class EnhancedTransportMaterialAdapter(_MaterialAdapter):
    def prepare_mesh(self, mesh, geometry):
        if 'color' not in geometry['attributes']:
            return
        values = accessor_values(self.package, geometry['attributes']['color'])
        attribute = mesh.color_attributes.new(name='color', type='FLOAT_COLOR', domain='POINT')
        for entry, value in zip(attribute.data, values):
            entry.color = (*value[:3], value[3] if len(value) == 4 else 1)

    def material(self, material_id, coverage_mode, geometry):
        material = super().material(material_id, coverage_mode, geometry)
        if material.get('bus_sim_enhanced_transport'):
            return material
        record = self.materials[material_id]
        nodes, links = material.node_tree.nodes, material.node_tree.links
        principled = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
        bindings = record.get('textureBindings', {})
        if record.get('vertexColors'):
            vertex = nodes.new('ShaderNodeVertexColor'); vertex.layer_name = 'color'
            multiply = nodes.new('ShaderNodeMixRGB'); multiply.blend_type = 'MULTIPLY'
            multiply.inputs[0].default_value = 1
            color = principled.inputs['Base Color']
            if color.is_linked: links.new(color.links[0].from_socket, multiply.inputs[1])
            else: multiply.inputs[1].default_value = color.default_value
            links.new(vertex.outputs['Color'], multiply.inputs[2])
            links.new(multiply.outputs[0], color)
        if bindings.get('map'):
            source = principled.inputs['Base Color'].links[0].from_socket
            multiply = nodes.new('ShaderNodeMixRGB')
            multiply.blend_type = 'MULTIPLY'
            multiply.inputs[0].default_value = 1
            multiply.inputs[2].default_value = (*record['colorLinearSrgb'], 1)
            links.new(source, multiply.inputs[1])
            links.new(multiply.outputs[0], principled.inputs['Base Color'])
        for semantic, channel, socket, factor in [('roughnessMap', 'G', 'Roughness', record.get('roughness', 1)),
                ('metalnessMap', 'B', 'Metallic', record.get('metalness', 0))]:
            if not bindings.get(semantic):
                continue
            texture = self._texture_node(material, bindings[semantic], 'data', geometry)
            separate = nodes.new('ShaderNodeSeparateColor')
            links.new(texture.outputs['Color'], separate.inputs[0])
            multiply = nodes.new('ShaderNodeMath')
            multiply.operation = 'MULTIPLY'
            multiply.inputs[1].default_value = factor
            links.new(separate.outputs['Green' if channel == 'G' else 'Blue'], multiply.inputs[0])
            links.new(multiply.outputs[0], principled.inputs[socket])
        if bindings.get('normalMap'):
            if record.get('normalMapSpace') != 'tangent_space': raise ValueError('Unsupported enhanced transport normal-map space')
            texture = self._texture_node(material, bindings['normalMap'], 'data', geometry)
            scale = record.get('normalScale', [1,1])
            multiply = nodes.new('ShaderNodeVectorMath'); multiply.operation = 'MULTIPLY'
            multiply.inputs[1].default_value = (scale[0],scale[1],1)
            links.new(texture.outputs['Color'], multiply.inputs[0])
            shift = nodes.new('ShaderNodeVectorMath'); shift.operation = 'ADD'
            shift.inputs[1].default_value = (.5*(1-scale[0]),.5*(1-scale[1]),0)
            links.new(multiply.outputs[0], shift.inputs[0])
            normal = nodes.new('ShaderNodeNormalMap'); normal.space = 'TANGENT'
            channel = self.bindings[bindings['normalMap']].get('channel',0)
            normal.uv_map = 'uv' if channel == 0 else 'uv'+str(channel)
            links.new(shift.outputs[0], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], principled.inputs['Normal'])
        elif bindings.get('bumpMap'):
            texture = self._texture_node(material, bindings['bumpMap'], 'data', geometry)
            separate = nodes.new('ShaderNodeSeparateColor'); links.new(texture.outputs['Color'], separate.inputs[0])
            bump = nodes.new('ShaderNodeBump')
            bump.inputs['Distance'].default_value = abs(record.get('bumpScale',1))
            bump.invert = record.get('bumpScale',1) < 0
            links.new(separate.outputs['Red'], bump.inputs['Height']); links.new(bump.outputs['Normal'], principled.inputs['Normal'])
        alpha = record['alpha']
        if alpha['mode'] in ('blended', 'cutout_blended') and coverage_mode != 'forced_opaque':
            weight = nodes.new('ShaderNodeValue').outputs[0]
            weight.default_value = alpha['opacity']
            if record.get('vertexColors') and geometry['attributes'].get('color', {}).get('itemSize') == 4:
                vertex = nodes.new('ShaderNodeVertexColor'); vertex.layer_name = 'color'
                multiply = nodes.new('ShaderNodeMath'); multiply.operation = 'MULTIPLY'
                links.new(weight, multiply.inputs[0]); links.new(vertex.outputs['Alpha'], multiply.inputs[1])
                weight = multiply.outputs[0]
            for entry in alpha.get('inputs', []):
                if entry['operation'] != 'multiply':
                    raise ValueError('Unsupported alpha operation')
                texture = self._texture_node(material, entry['bindingId'], 'coverage:' + entry['channel'], geometry)
                multiply = nodes.new('ShaderNodeMath')
                multiply.operation = 'MULTIPLY'
                links.new(weight, multiply.inputs[0])
                links.new(texture.outputs['Color'], multiply.inputs[1])
                weight = multiply.outputs[0]
            if alpha.get('alphaTest', 0) > 0:
                less = nodes.new('ShaderNodeMath')
                less.operation = 'LESS_THAN'
                less.inputs[1].default_value = alpha['alphaTest']
                links.new(weight, less.inputs[0])
                keep = nodes.new('ShaderNodeMath')
                keep.operation = 'MULTIPLY_ADD'
                links.new(less.outputs[0], keep.inputs[0])
                keep.inputs[1].default_value = -1
                keep.inputs[2].default_value = 1
                multiply = nodes.new('ShaderNodeMath')
                multiply.operation = 'MULTIPLY'
                links.new(weight, multiply.inputs[0])
                links.new(keep.outputs[0], multiply.inputs[1])
                weight = multiply.outputs[0]
            output = next(node for node in nodes if node.type == 'OUTPUT_MATERIAL')
            source = output.inputs['Surface'].links[0].from_socket
            transparent = nodes.new('ShaderNodeBsdfTransparent')
            mix = nodes.new('ShaderNodeMixShader')
            links.new(weight, mix.inputs[0])
            links.new(transparent.outputs[0], mix.inputs[1])
            links.new(source, mix.inputs[2])
            links.new(mix.outputs[0], output.inputs['Surface'])
        material['bus_sim_enhanced_transport'] = POLICY
        return material
