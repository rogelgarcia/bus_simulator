# Renders named scene cameras with Cycles in an isolated headless process.
import json
import sys
import time
from pathlib import Path

import bpy


def main(directory, output, options):
    manifest = json.loads((directory / 'scene.json').read_text())
    bpy.ops.wm.open_mainfile(filepath=str(directory / manifest['scene']))
    scene = bpy.context.scene
    # Timeline camera markers otherwise override explicit camera selection on render.
    scene.timeline_markers.clear()
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = options['samples']
    scene.render.resolution_x = options['width']
    scene.render.resolution_y = round(options['width'] * 9 / 16)
    scene.render.threads_mode = 'FIXED'; scene.render.threads = 4
    device = options['device']
    devices = []
    if device == 'OPTIX':
        preferences = bpy.context.preferences.addons['cycles'].preferences
        preferences.compute_device_type = 'OPTIX'; preferences.refresh_devices()
        for entry in preferences.devices:
            entry.use = entry.type == 'OPTIX'
            if entry.use:
                devices.append(entry.name)
        if not devices:
            raise RuntimeError('OPTIX requested but no compatible device is available')
        scene.cycles.device = 'GPU'
    else:
        scene.cycles.device = 'CPU'; devices = ['CPU / 4 render threads']
    selected = [view for view in manifest['views'] if options['views'] == 'all' or view['id'] in options['views'].split(',')]
    if not selected:
        raise RuntimeError('No requested cameras exist')
    output.mkdir(parents=True, exist_ok=True)
    report = {'engine': 'CYCLES', 'device': device, 'devices': devices, 'samples': options['samples'],
              'size': [scene.render.resolution_x, scene.render.resolution_y], 'source': str(directory), 'renders': []}
    clay = bpy.data.materials.new('Neutral branch geometry review'); clay.use_nodes = True
    clay.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.32, .30, .27, 1)
    clay.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .8
    for view in selected:
        bpy.context.view_layer.material_override = clay if view.get('clay') else None
        for plot in manifest['plots']:
            collection = bpy.data.collections[plot['species']]
            collection.hide_render = view['species'] not in ['all', plot['species']]
            for obj in collection.objects:
                obj.hide_render = (('variant' in view and obj.get('variant') != view['variant'])
                                   or bool(obj.get('leafStudy')) != bool(view.get('study'))
                                   or (view.get('woodOnly', False) and 'wood_paths' not in obj))
        scene.camera = bpy.data.objects[view['id']]
        bpy.context.view_layer.update()
        expected = view['position']
        if any(abs(scene.camera.location[i] - expected[i]) > 1e-4 for i in range(3)):
            raise RuntimeError('Render camera does not match its saved pose')
        scene.render.filepath = str(output / (view['id'] + '.png'))
        start = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        report['renders'].append({'id': view['id'], 'species': view['species'], 'file': view['id'] + '.png',
                                  'seconds': time.perf_counter() - start, 'camera': view})
        (output / 'renders.json').write_text(json.dumps(report, indent=2) + '\n')
        print(f'[Showcase] Rendered {view["id"]} in {report["renders"][-1]["seconds"]:.1f}s', flush=True)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    main(Path(args[0]), Path(args[1]), json.loads(Path(args[2]).read_text()))
