# Scene bark grading preserves the authored color variation, relief and roughness.
REVISION = 'warm-brown-bark-v1'
TINTS = {
    'london_plane': (.58, .37, .23),
    'silver_linden': (.52, .34, .21),
    'northern_red_oak': (.52, .33, .20),
    'american_elm': (.48, .30, .18),
    'arrowwood_viburnum': (.76, .57, .39)
}


def warm_bark(material, species):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    color = bsdf.inputs['Base Color']
    if len(color.links) != 1 or material.get('showcaseBarkRevision'):
        raise RuntimeError('Bark grading requires the original connected source material')
    source = color.links[0].from_socket
    tint = TINTS[species]
    grade = nodes.new('ShaderNodeMixRGB')
    grade.name = 'Warm brown bark'; grade.label = 'Warm brown bark / linear RGB'
    grade.blend_type = 'MULTIPLY'; grade.inputs[0].default_value = 1
    grade.inputs[2].default_value = (*tint, 1)
    links.new(source, grade.inputs[1]); links.new(grade.outputs['Color'], color)
    material['showcaseBarkRevision'] = REVISION
    material['showcaseBarkLinearTint'] = tint
    return {'revision': REVISION, 'linearTint': list(tint), 'scope': 'editable-showcase-material'}
