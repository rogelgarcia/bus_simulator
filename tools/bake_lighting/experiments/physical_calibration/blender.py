"""Standalone scene construction and render stages for the shared bake runner."""
import hashlib
import json
import sys
import time
from pathlib import Path
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scene import fixture_scene, cornell_scene, vector_scene


def save(file, value):
    Path(file).write_text(json.dumps(value, indent=2), encoding='utf8')


def main():
    request = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text(encoding='utf8'))
    output = Path(request['output'])
    stage = request['stage']
    started = time.perf_counter()
    if stage == 'prepare':
        defaults = request['defaults']
        fixtures = [fixture_scene(f, defaults) for f in defaults['fixtures']]
        fixtures.append(vector_scene(defaults))
        cornell = json.loads((output/'references/cornell.json').read_text(encoding='utf8'))
        fixtures += [cornell_scene(cornell, defaults, wavelength) for wavelength in (450,550,650)]
        for window in bpy.context.window_manager.windows:
            window.scene = fixtures[0]
        for scene in list(bpy.data.scenes):
            if scene not in fixtures:
                bpy.data.scenes.remove(scene)
        bpy.ops.wm.save_as_mainfile(filepath=str(output/'calibration.blend'), compress=True)
        save(output/'scene.json', {'schemaVersion':1,'scenes':[s.name for s in fixtures],'blenderVersion':bpy.app.version_string,'seconds':time.perf_counter()-started,'geometryContract':'Analytical receivers: XY plane, +Z normal, metres. Cornell retains original Y-up axes converted from mm to m.'})
    elif stage == 'render':
        bpy.ops.wm.open_mainfile(filepath=str(output/'calibration.blend'), load_ui=False)
        preferences = bpy.context.preferences.addons['cycles'].preferences
        if request['device'] == 'OPTIX':
            preferences.compute_device_type = 'OPTIX'
            preferences.get_devices()
            devices = [d for d in preferences.devices if d.type == 'OPTIX']
            if not devices:
                raise RuntimeError('Requested OPTIX device unavailable')
            for device in preferences.devices:
                device.use = device.type == 'OPTIX'
        else:
            devices = []
        records = []
        directory = output/'cycles'
        directory.mkdir(exist_ok=True)
        for scene in sorted(bpy.data.scenes, key=lambda s:s.name):
            scene.cycles.device = 'GPU' if devices else 'CPU'
            seed_base = request['defaults']['seed']
            seeds = [seed_base,seed_base+1] if not scene.name.startswith('cornell') and scene.name != 'display_vectors' else [seed_base]
            for seed in seeds:
                scene.cycles.seed = seed
                file = directory/(scene.name+'_'+str(seed)+'.exr')
                scene.render.filepath = str(file)
                start = time.perf_counter()
                bpy.ops.render.render(write_still=True, scene=scene.name)
                if scene.name == 'display_vectors':
                    scene.render.image_settings.media_type = 'IMAGE'
                    scene.render.image_settings.file_format = 'PNG'
                    scene.render.image_settings.color_depth = '8'
                    bpy.data.images['Render Result'].save_render(str(directory/'display_vectors_agx.png'),scene=scene)
                    scene.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'
                    scene.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
                    scene.render.image_settings.color_depth = '32'
                records.append({'id':scene.name,'seed':seed,'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'seconds':time.perf_counter()-start,'width':scene.render.resolution_x,'samples':scene.cycles.samples})
                save(output/'cycles_progress.json',records)
        config = Path(bpy.utils.resource_path('LOCAL'))/'datafiles/colormanagement/config.ocio'
        ocio_files = [{'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()} for file in sorted(config.parent.rglob('*')) if file.is_file()]
        save(output/'cycles.json',{'schemaVersion':1,'records':records,'seconds':time.perf_counter()-started,'blenderVersion':bpy.app.version_string,'devices':[d.name for d in devices] or ['CPU'],'ocioConfig':str(config),'ocioSha256':hashlib.sha256(config.read_bytes()).hexdigest(),'ocioFiles':ocio_files,'threads':request['defaults']['threads']})
    else:
        raise ValueError('Unknown Blender stage')


if __name__ == '__main__':
    main()
    if not bpy.app.background:
        bpy.ops.wm.quit_blender()
