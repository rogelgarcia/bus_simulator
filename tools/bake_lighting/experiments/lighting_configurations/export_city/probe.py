"""Read the installed Blender capabilities without editing an existing project."""
import bpy, json, sys, importlib.util
from pathlib import Path

prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.get_devices()
info = {'blender': bpy.app.version_string, 'build': bpy.app.build_hash.decode(),
        'modules': {name: importlib.util.find_spec(name) is not None for name in ['numpy', 'OpenImageIO', 'PyOpenColorIO', 'PIL']},
        'devices': [{'name': d.name, 'type': d.type} for d in prefs.devices],
        'viewTransforms': [v.identifier for v in bpy.context.scene.view_settings.bl_rna.properties['view_transform'].enum_items],
        'cyclesProperties': list(bpy.context.scene.cycles.bl_rna.properties.keys()),
        'python':sys.executable, 'resource':bpy.utils.resource_path('LOCAL')}
out = Path(sys.argv[sys.argv.index('--')+1])
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(info, indent=2))
print('AI560_CAPABILITIES=' + json.dumps(info))
