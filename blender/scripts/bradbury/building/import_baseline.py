"""Recreate the preserved GLB baseline; validate before saving a new candidate."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / 'common/paths.py').is_file())
sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import bpy
from mathutils import Matrix
from baseline_validation import snapshot, differences
from link_game_textures import link_to_game_assets


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--glb', help='Optional fresh export to compare against the same retained baseline contract')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    output, report = Path(args.output).resolve(), Path(args.report).resolve()
    if not output.is_relative_to(BP.FILES) or output.suffix != '.blend' or output.exists():
        raise ValueError('Output must be a NEW .blend under BLENDER_FILES_ROOT; preserve existing files first')
    if not report.is_relative_to(BP.SCREENS.resolve()) or report.exists():
        raise ValueError('Report must be a new file under tests/artifacts/screens/')
    inputs = Path(BP.inputs('bradbury', 'baseline'))
    glb = Path(args.glb).resolve() if args.glb else inputs / 'bradbury_block_before.glb'
    if not glb.is_relative_to(BP.INPUTS.resolve()) or glb.suffix != '.glb' or not glb.is_file():
        raise ValueError('GLB must be an existing export under blender_inputs/')
    provenance = json.loads((inputs / 'source.json').read_text(encoding='utf-8'))
    for entry in provenance['baseline_import']['inputs']:
        file = Path(BP.ROOT) / entry['file']
        if hashlib.sha256(file.read_bytes()).hexdigest() != entry['sha256']:
            raise ValueError(f'Baseline input changed: {entry["file"]}')
    expected = json.loads((inputs / 'expected-baseline.json').read_text(encoding='utf-8'))
    recipe = json.loads(Path(__file__).with_name('baseline_recipe.json').read_text(encoding='utf-8'))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.threads_mode = 'FIXED'
    bpy.context.scene.render.threads = 1
    collection = bpy.data.collections.new('Collection')
    bpy.context.scene.collection.children.link(collection)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[collection.name]
    bpy.ops.import_scene.gltf(filepath=str(glb), merge_vertices=False)
    linked, packed, nodes = link_to_game_assets(BP.ROOT)
    # The unsaved scene's images have absolute paths; remap once against the final destination.
    for image in bpy.data.images:
        if image.filepath and not image.packed_file:
            image.filepath = str(Path(bpy.path.abspath(image.filepath)).resolve())
    scene = bpy.context.scene
    scene.name = recipe['scene']
    rig = bpy.data.collections.new('INSPECTION_RIG')
    scene.collection.children.link(rig)
    for entry in recipe['rig']:
        data = bpy.data.cameras.new(entry['name']) if entry['type'] == 'CAMERA' else bpy.data.lights.new(entry['name'], entry['data']['type'])
        for key, value in entry['data'].items():
            setattr(data, key, value)
        obj = bpy.data.objects.new(entry['name'], data)
        rig.objects.link(obj)
        obj.matrix_world = Matrix(entry['matrix'])
    scene.camera = bpy.data.objects[recipe['camera']]
    scene.world = bpy.data.worlds.new(recipe['world']['name'])
    scene.world.color = recipe['world']['color']
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = recipe['world']['background']['default_value']
    background.inputs['Strength'].default_value = recipe['world']['strength']
    for group, settings in ((scene.render, recipe['render']), (scene.cycles, recipe['cycles']), (scene.view_settings, recipe['view'])):
        for key, value in settings.items():
            setattr(group, key, value)
    bpy.context.view_layer.update()
    actual = snapshot(BP.ASSETS)
    errors = list(differences(expected, actual))
    result = {'passed': not errors, 'differences': errors[:100], 'difference_count': len(errors),
              'objects': len(actual['objects']), 'meshes': sum(o['type'] == 'MESH' for o in actual['objects'].values()),
              'materials': len(actual['materials']), 'linked_images': len(linked), 'packed_images': len(packed),
              'mirrored_texture_nodes': nodes, 'blender': bpy.app.version_string, 'output': str(output),
              'glb': str(glb), 'glb_sha256': hashlib.sha256(glb.read_bytes()).hexdigest()}
    report.parent.mkdir(parents=True, exist_ok=True)
    if errors:
        report.write_text(json.dumps(result, indent=2) + '\n')
        raise RuntimeError(f'Baseline parity failed; no blend saved. First difference: {errors[0]}')
    output.parent.mkdir(parents=True, exist_ok=True)
    for image in bpy.data.images:
        if image.filepath and not image.packed_file:
            image.filepath = bpy.path.relpath(image.filepath, start=str(output.parent))
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True, relative_remap=False)
    bpy.ops.wm.open_mainfile(filepath=str(output))
    reopened = list(differences(expected, snapshot(BP.ASSETS)))
    result.update(passed=not reopened, reopen_differences=reopened[:100], sha256=hashlib.sha256(output.read_bytes()).hexdigest())
    report.write_text(json.dumps(result, indent=2) + '\n')
    if reopened:
        raise RuntimeError('Saved candidate failed reopen parity; do not use it')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
