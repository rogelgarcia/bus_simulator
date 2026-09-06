"""Tiny resolved-scene geometry for native transport regression tests only."""
import struct
from types import SimpleNamespace

identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def source_fixture():
    manifest = {name: [] for name in ['objects', 'meshInstances', 'geometries', 'materials', 'alphaInputs',
        'textures', 'participantMappings', 'receiverMappings', 'casterMappings']}
    manifest['hashes'] = {'resolvedSource': 'fixture'}
    buffers = {}
    quads = [('floor', [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [1, 1, 1]),
             ('wall', [(-.8, -1, 0), (-.8, 1, 0), (-.8, 1, 1.4), (-.8, -1, 1.4)], [.8, .025, .01])]
    for name, vertices, color in quads:
        positions = [component for index in [0, 1, 2, 0, 2, 3]
                     for component in (vertices[index][0], vertices[index][2], -vertices[index][1])]
        buffers[name] = struct.pack('<18f', *positions)
        manifest['geometries'].append({'id': name, 'attributes': {'position': {'bufferId': name,
            'componentType': 'f32', 'itemSize': 3, 'count': 6, 'byteStride': 12, 'byteOffset': 0, 'normalized': False}}})
        manifest['objects'].append({'id': name, 'materialSlots': [{'index': 0, 'id': name}]})
        manifest['meshInstances'].append({'id': name, 'objectId': name, 'geometryId': name,
            'rootId': name, 'chunkId': 'lab', 'category': 'fixture', 'matrixBlenderWorld': identity})
        manifest['materials'].append({'id': name, 'alphaInputId': name, 'colorLinearSrgb': color,
            'alpha': {'mode': 'opaque', 'opacity': 1}, 'roughness': 1, 'metalness': 0, 'side': 2,
            'channelSupport': {'indirect_irradiance': {'supported': True}}})
        manifest['alphaInputs'].append({'id': name})
        mapping = {'id': 'participant/' + name, 'meshInstanceId': name, 'objectId': name,
            'materialId': name, 'geometryId': name, 'start': 0, 'count': 6, 'materialIndex': 0,
            'channelRelevance': {'indirect_irradiance': True}}
        manifest['participantMappings'].append(mapping)
        if name == 'floor':
            manifest['receiverMappings'].append({**mapping, 'id': 'receiver/floor'})
    return SimpleNamespace(manifest=manifest, get_buffer_view=lambda key: memoryview(buffers[key]))
