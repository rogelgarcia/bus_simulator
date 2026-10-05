# Authors one original mature vegetation family in an isolated CPU-limited Blender process.
import hashlib
import json
import sys
import ctypes
import shutil
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from geometry import create_tree, create_shrub
from textures import create_maps
from woody_detail import detail_wood
from leaf_geometry import create_solid_foliage, create_leaf_study


def image_node(material, path, color_space):
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = color_space
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    node.interpolation = 'Linear'
    return node


def create_material(name, directory, profile):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = 0
    albedo = image_node(material, directory / f'{name}_basecolor.png', 'sRGB')
    links.new(albedo.outputs['Color'], bsdf.inputs['Base Color'])
    orm = image_node(material, directory / f'{name}_orm.png', 'Non-Color')
    separate = nodes.new('ShaderNodeSeparateColor')
    links.new(orm.outputs['Color'], separate.inputs['Color'])
    links.new(separate.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(separate.outputs['Blue'], bsdf.inputs['Metallic'])
    normal = image_node(material, directory / f'{name}_normal.png', 'Non-Color')
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = .7 if name == 'foliage' else .45
    links.new(normal.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
    if name in ['bark', 'foliage']:
        material.use_backface_culling = True
        vertex = nodes.new('ShaderNodeVertexColor')
        vertex.layer_name = 'Color'
        multiply = nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        links.new(albedo.outputs['Color'], multiply.inputs[1])
        links.new(vertex.outputs['Color'], multiply.inputs[2])
        links.new(multiply.outputs['Color'], bsdf.inputs['Base Color'])
    return material


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export_glb(filepath):
    bpy.ops.export_scene.gltf(filepath=str(filepath), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True, export_normals=True,
                              export_texcoords=True, export_materials='EXPORT', export_image_format='AUTO',
                              export_extras=False, export_animations=False, export_cameras=False,
                              export_lights=False, export_all_vertex_colors=True)


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    stage, source = Path(args[0]), Path(args[1])
    recipe = json.loads(source.read_text(encoding='utf8'))
    profile = recipe['profile']
    prototype = len(args) > 2
    if prototype:
        recipe['variants'] = [variant for variant in recipe['variants'] if variant['id'] == args[2]]
    if sys.platform == 'win32':
        kernel = ctypes.windll.kernel32
        kernel.GetCurrentProcess.restype = ctypes.c_void_p
        kernel.GetProcessAffinityMask.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_size_t), ctypes.POINTER(ctypes.c_size_t)]
        kernel.SetProcessAffinityMask.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
        process = kernel.GetCurrentProcess()
        available, system = ctypes.c_size_t(), ctypes.c_size_t()
        if not kernel.GetProcessAffinityMask(process, ctypes.byref(available), ctypes.byref(system)):
            raise RuntimeError('Cannot read authoring process CPU affinity')
        selected = [1 << bit for bit in range(64) if available.value & (1 << bit)][:2]
        if not kernel.SetProcessAffinityMask(process, ctypes.c_size_t(sum(selected))):
            raise RuntimeError('Cannot constrain authoring process to two CPUs')
    output = stage / 'publication'
    output.mkdir(parents=True, exist_ok=True)
    textures = output / 'textures'
    bpy.context.scene.render.threads_mode = 'FIXED'
    bpy.context.scene.render.threads = 2
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    create_maps(textures, recipe['textureSize'], recipe['texture'], bark_size=recipe['barkTextureSize'])
    photo_source = recipe['texture'].get('photographicBark')
    sources = []
    if photo_source:
        source_directory = Path(__file__).parents[1] / photo_source
        source_record = json.loads((source_directory / 'source.json').read_text(encoding='utf8'))
        retained = output / 'sources' / 'bark_brown_02'
        shutil.copytree(source_directory, retained)
        for record in source_record['maps'].values():
            shutil.copy2(Path(__file__).parents[3] / source_record['inputDirectory'] / record['file'], retained / record['file'])
        sources.append({**source_record, 'directory': 'sources/bark_brown_02'})
    materials = {name: create_material(name, textures, profile) for name in ['bark', 'foliage']}
    manifest = {'schema': 'bus-sim-original-vegetation-v3', 'assetRevision': f"{recipe['id']}-v{recipe['revision']}", 'prototype': prototype,
                'speciesId': recipe['id'], 'species': recipe['species'], 'commonName': recipe['commonName'],
                'kind': recipe['kind'], 'growthStage': 'mature', 'axis': 'Y-up', 'units': 'metres', 'groundY': 0,
                'authoringRecipe': f"tools/bake_vegetation/{recipe['id'].replace('-', '_')}/recipe.json",
                'provenance': ('Original geometry and foliage; CC0 photographic bark adapted for shrub stems.' if sources else
                               'Original deterministic geometry and procedural texture authoring; no third-party asset inputs.'),
                'thirdPartySources': sources,
                'foliageRepresentation': 'solid-leaves-v1',
                'references': recipe['references'], 'materials': {
                    'bark': {'alphaMode': 'OPAQUE', 'doubleSided': False},
                    'foliage': {'alphaMode': 'OPAQUE', 'doubleSided': False,
                                'closedUpperUnderside': True}}, 'textures': {}, 'variants': []}
    for filename in sorted(textures.glob('*.png')):
        manifest['textures'][filename.name] = {'sha256': sha(filename), 'bytes': filename.stat().st_size,
                                              'width': int.from_bytes(filename.read_bytes()[16:20], 'big'),
                                              'height': int.from_bytes(filename.read_bytes()[20:24], 'big'),
                                              'colorSpace': 'sRGB' if 'basecolor' in filename.name else 'linear'}
    study = create_leaf_study(recipe, materials['foliage'])
    bpy.context.view_layer.objects.active = study
    study.select_set(True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'leaf_study.blend'), compress=True)
    export_glb(output / 'leaf_study.glb')
    manifest['leafStudy'] = {'file': 'leaf_study.glb', 'sourceBlend': {'file': 'leaf_study.blend',
                             'sha256': sha(output / 'leaf_study.blend'), 'bytes': (output / 'leaf_study.blend').stat().st_size},
                             'forms': 8, 'upperRow': 'undersides', 'lowerRow': 'upper surfaces'}
    for variant in recipe['variants']:
        for obj in list(bpy.data.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        # Releasing objects alone retains multi-million-face source meshes between forms.
        for mesh in list(bpy.data.meshes):
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        generator = create_shrub if recipe['kind'] == 'shrub' else create_tree
        objects, detail = generator(variant, profile, materials, {**recipe['growth'], 'leavesPerCard': recipe['texture']['leafCount']})
        detail['woodyDetail'] = detail_wood(objects[0], variant, recipe)
        objects[1], detail['foliageDetail'] = create_solid_foliage(objects[1], variant, recipe)
        detail['sourceCardCount'] = detail['cardCount']
        detail['cardCount'] = detail['flatCardCount'] = detail['foldedCardCount'] = 0
        detail['cardTrianglesRange'] = [0, 0]
        detail['foldedCardFraction'] = 0
        bpy.context.view_layer.objects.active = objects[0]
        for obj in objects:
            obj.select_set(True)
        authoring = output / 'authoring'
        authoring.mkdir(exist_ok=True)
        source_blend = authoring / (variant['id'] + '.blend')
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=str(source_blend), compress=True)
        detail['woodyDetail']['sourceBlend'] = {'file': 'authoring/' + source_blend.name,
                                               'sha256': sha(source_blend), 'bytes': source_blend.stat().st_size}
        filename = variant['id'] + '.glb'
        export_glb(output / filename)
        lower, upper, triangles = np.full(3, np.inf), np.full(3, -np.inf), 0
        for obj in objects:
            positions = np.empty(len(obj.data.vertices) * 3, np.float32)
            obj.data.vertices.foreach_get('co', positions)
            positions = positions.reshape((-1, 3))
            lower = np.minimum(lower, np.min(positions, axis=0)); upper = np.maximum(upper, np.max(positions, axis=0))
            loops = np.empty(len(obj.data.polygons), np.int32); obj.data.polygons.foreach_get('loop_total', loops)
            triangles += int(np.sum(loops - 2))
        bounds = {'min': [float(lower[0]), float(lower[2]), float(-upper[1])],
                  'max': [float(upper[0]), float(upper[2]), float(-lower[1])]}
        manifest['variants'].append({'id': variant['id'], 'growthStage': 'mature', 'morphology': variant['morphology'],
                                     'file': filename, 'triangles': triangles, 'bounds': bounds, 'materialDraws': 2,
                                     'safetyTriangleLimit': recipe['woodyDetail']['safetyTriangleLimit'] + recipe.get('foliageSafetyTriangleLimit', 12000000), 'seed': variant['seed'], **detail})
        print(f"[Vegetation] {recipe['id']}/{filename}: {triangles} triangles, {detail['foliageDetail']['leafCount']} solid leaves", flush=True)
    (output / 'index.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
    underside = ('Leaves are closed thin shells with curved blades, modeled margins, midrib fold and petioles. '
                 'Upper and lower surfaces have separate UV regions; silver linden retains silvery undersides. '
                 'All foliage is opaque and front-face culled. No alpha plates are generated in this pass. '
                 'leaf_study.glb and leaf_study.blend contain eight editable leaf forms for future plate baking.\n\n')
    source_description = ('Original project geometry and foliage. Bark uses Rob Tuytel\'s Bark Brown 02 from Poly Haven, '
        'https://polyhaven.com/a/bark_brown_02, licensed CC0-1.0: https://polyhaven.com/license. '
        'Powered by Poly Haven. Generic photographed bark, not a species-identified Viburnum scan. '
        'The original four 2K maps, URLs and SHA-256 receipts are retained in sources/bark_brown_02. '
        'Macro color is sampled into vertices with blended junctions; residual color, normal and roughness maps '
        'retain photographed detail. Scale, relief strength and subtle basal soil staining are adapted for small stems. '
        if sources else 'Original project geometry and procedural textures. No licensed tree pack, downloaded mesh, '
        'photograph, or third-party texture was used as an asset input. ')
    (output / 'PROVENANCE.md').write_text(f"# {recipe['commonName']} provenance\n\n" + source_description +
        'Botanical references guide morphology only:\n\n'
        + '\n'.join('- ' + reference for reference in recipe['references']) + '\n\n'
        'Reproducible source: `tools/bake_vegetation/authoring/` plus the species recipe. All three forms are mature '
        'structural variants using one detail-first woody geometry implementation. Packed editable Blender sources are in `authoring/`. '
        + ('New woody geometry, bark maps and solid leaves are authored together. ' if recipe.get('woodContract') == 'original-authoring-v1' else
           'Accepted wood geometry and bark maps are preserved; foliage is rebuilt as solid leaves. ')
        + 'No device-quality or age selection is present.\n\n'
        'Output maps are PNGs: bark is 2048px, foliage is 1024px; base color is sRGB, normal is tangent-space OpenGL (+Y), '
        'Bark macro color is stored as linear mesh vertex color, blending sampled branch fields at junctions; its maps contain residual detail. '
        'ORM is R=1 (no baked AO), G=roughness, B=0. Foliage alpha is uniformly opaque; its outline is geometry. '
        'No directional light, canopy AO or emission is baked into base color.\n\n' + underside, encoding='utf8')


main()
