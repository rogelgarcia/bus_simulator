# Assemble fixed, independently tilted spray wings and export a self-contained LOD0 specimen.
import json
import struct
from pathlib import Path

import bpy
import numpy as np

from common import activate, clear_scene, load_reference, triangles, write_json
from sprays import spray_data, PATCHES
from wood import pbr_material
from coverage import choose_tiles, prune_cards


def normalize_glb(path, double_sided=False):
    raw = path.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    remainder = bytearray(raw[20 + length:])
    repaired = 0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            def vector_accessor(name):
                accessor = doc['accessors'][primitive['attributes'][name]]
                view = doc['bufferViews'][accessor['bufferView']]
                return accessor, 8 + view.get('byteOffset', 0) + accessor.get('byteOffset', 0), view.get('byteStride', 16 if name == 'TANGENT' else 12)
            tangent, tangent_start, tangent_stride = vector_accessor('TANGENT')
            normal, normal_start, normal_stride = vector_accessor('NORMAL')
            for index in range(tangent['count']):
                offset = tangent_start + index * tangent_stride
                value = np.array(struct.unpack_from('<3f', remainder, offset))
                size = float(np.linalg.norm(value))
                if size < 1e-8:
                    n = np.array(struct.unpack_from('<3f', remainder, normal_start + index * normal_stride))
                    axis = np.eye(3)[int(np.argmin(np.abs(n)))]
                    value = np.cross(n, axis); size = float(np.linalg.norm(value)); repaired += 1
                struct.pack_into('<3f', remainder, offset, *(value / size))
    doc.setdefault('extras', {})['zeroTangentFallbacks'] = repaired
    for material in doc['materials']:
        if 'baked bark' in material['name']:
            material['occlusionTexture'] = {**material['pbrMetallicRoughness']['metallicRoughnessTexture'], 'strength': 1}
        if 'spray cards' in material['name']:
            material['alphaMode'] = 'MASK'; material['alphaCutoff'] = .5
            material['doubleSided'] = double_sided
            texture = material['pbrMetallicRoughness']['baseColorTexture']['index']
            extension = 'KHR_materials_diffuse_transmission'
            material.setdefault('extensions', {})[extension] = {'diffuseTransmissionFactor': .17,
                'diffuseTransmissionColorTexture': {'index': texture}}
            doc['extensionsUsed'] = sorted(set(doc.get('extensionsUsed', []) + [extension]))
            image = doc['images'][doc['textures'][texture]['source']]
            view = doc['bufferViews'][image['bufferView']]
            png = remainder[8 + view.get('byteOffset', 0):8 + view.get('byteOffset', 0) + view['byteLength']]
            if png[:8] != b'\x89PNG\r\n\x1a\n' or png[25] not in [4, 6]:
                raise RuntimeError('Canopy GLB lost its alpha channel')
    encoded = json.dumps(doc, separators=(',', ':')).encode('utf8')
    encoded += b' ' * ((-len(encoded)) % 4)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(remainder)) + struct.pack('<I4s', len(encoded), b'JSON') + encoded + remainder)
    return repaired


def build_cards(options):
    for model in options['models']:
        clear_scene()
        foliage = load_reference(options, [model + ' / solid leaves'])[0]
        species, variant = model.split('/')
        position = list(foliage.location)
        data, prototypes, wings = spray_data(options, model, foliage)
        directory = Path(options['output']) / species / variant
        atlas_dir = directory.parent / 'canopy'
        atlas = json.loads((atlas_dir / 'atlas.json').read_text())
        if atlas.get('placement', 'direction') != options.get('placement', 'direction'):
            raise RuntimeError('Card placement and baked atlas strategy do not match')
        records = {(r['sample'], r['side'], int(r['back'])): r for r in atlas['tiles']}
        images = {}
        for channel in ['color', 'normal', 'orm']:
            image = bpy.data.images.load(str(atlas_dir / ('leaf_' + channel + '.png')), check_existing=True)
            image.colorspace_settings.name = 'sRGB' if channel == 'color' else 'Non-Color'
            images[channel] = image
        material = pbr_material(species + ' / LOD0 spray cards', images, True)
        choose_tiles(wings, atlas, variant, options.get('placement') == 'spatial')
        pruning = None
        if options.get('placement') == 'spatial':
            wings, pruning = prune_cards(wings, atlas, images['color'])
            write_json(directory / 'coverage.json', pruning)
            print(f'[LOD0] Spatial pruning {model}: {pruning["removedCards"]}/{pruning["candidateCards"]} cards removed', flush=True)
        vertices, faces, uvs = [], [], []
        for index, wing in enumerate(wings):
            sample, side = wing['tileSample'], wing['tileSide']
            width, height = wing['size']
            basis, center = wing['basis'], wing['center']
            for back in range(2):
                rect = records[(sample, side, back)]['rect']
                u0, v0, u1, v1 = rect
                sign = -1 if back else 1
                local = np.array([[-width/2 * sign, -height/2, .0002 * sign], [width/2 * sign, -height/2, .0002 * sign],
                                  [width/2 * sign, height/2, .0002 * sign], [-width/2 * sign, height/2, .0002 * sign]])
                points = local @ basis.T + center
                offset = len(vertices)
                vertices.extend(points.tolist())
                faces.extend([(offset, offset + 1, offset + 2), (offset, offset + 2, offset + 3)])
                uvs.extend([(u0, v0), (u1, v0), (u1, v1), (u0, v0), (u1, v1), (u0, v1)])
        mesh = bpy.data.meshes.new(model + ' / LOD0 spray wings')
        mesh.from_pydata(vertices, [], faces)
        mesh.uv_layers.new(name='Baked spray atlas').data.foreach_set('uv', np.asarray(uvs, np.float32).ravel())
        mesh.materials.append(material)
        obj = bpy.data.objects.new(model + ' / LOD0 canopy', mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj['lodLevel'] = 0; obj['referenceModel'] = model; obj['surface'] = 'foliage'; obj['variant'] = variant
        bpy.data.objects.remove(foliage, do_unlink=True)
        source = directory / 'wood.blend'
        with bpy.data.libraries.load(str(source), link=False) as (available, loaded):
            loaded.objects = [model + ' / LOD0 wood']
        wood = loaded.objects[0]
        bpy.context.scene.collection.objects.link(wood)
        activate(wood, [obj])
        glb = directory / (variant + '_lod0.glb')
        bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                                  export_extras=True, export_yup=True, export_texcoords=True,
                                  export_normals=True, export_tangents=True, export_materials='EXPORT',
                                  export_animations=False, export_cameras=False, export_lights=False)
        tangent_repairs = normalize_glb(glb)
        bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=str(directory / (variant + '_lod0.blend')), compress=True)
        wood_stats = json.loads((directory / 'wood.json').read_text())
        inspection = json.loads((Path(options['output']) / 'inspection.json').read_text())
        reference = next(row for row in inspection if row['id'] == model)
        total = triangles(wood.data) + triangles(mesh)
        write_json(directory / 'model.json', {'id': model, 'position': position, 'woodTriangles': triangles(wood.data),
                   'canopyTriangles': triangles(mesh), 'totalTriangles': total, 'referenceWoodTriangles': reference['woodTriangles'],
                   'referenceFoliageTriangles': reference['foliageTriangles'],
                   'triangleReductionPercent': 100 * (1 - total / (reference['woodTriangles'] + reference['foliageTriangles'])),
                   'spraysPreserved': len(set(wing['spray'] for wing in wings)), 'cards': len(wings), 'sides': 'Separate front and underside, backface culled',
                   'placement': options.get('placement', 'direction'), 'meanFlattenedDepthMetres': float(np.mean([wing['depth'] for wing in wings])),
                   'pruning': pruning,
                   'geometryError': wood_stats['geometryError'], 'meanCardCoverage': atlas['meanDrawnRectangleCoverage'],
                   'files': [glb.name, variant + '_lod0.blend'], 'glbBytes': glb.stat().st_size,
                   'materialDrawsPerModel': 2, 'zeroTangentFallbacks': tangent_repairs, 'wind': 'Not yet rigged',
                   'limitations': [('Compact spatial leaf groups are fitted to planes and pruned by multi-view alpha coverage; local parallax and fine spray twigs are lost.' if options.get('placement') == 'spatial' else 'Three direction groups flatten each spray into tilted patches; intra-patch leaf parallax is reduced and fine spray twigs are omitted.'),
                                   'Full leaf lighting requires KHR_materials_diffuse_transmission support; the current gameplay loader needs an integration pass before using these staged assets.',
                                   'Coverage-preserving mip images are packaged by the compress phase; target-device timing and wind require later renderer integration.']})
        print(f'[LOD0] Exported {model}: {total} triangles, {glb.stat().st_size / 1048576:.1f} MiB GLB', flush=True)
