"""Regression renders for complete receivers and fractional, non-receiver alpha transport."""
import json
import runpy
import sys
from pathlib import Path
import bpy
import numpy as np

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / 'blender'))
from bake_surface import install_surface_targets, configure_surface_device
from transport import resolve_transport, EnhancedTransportMaterialAdapter
from reconstruct import reconstruct_resolved_city

# Run the existing source-participant proof first and reuse its tiny resolved-source fixture.
proof = runpy.run_path(str(root / 'validate_transport_participants.py'))
destination = Path(sys.argv[sys.argv.index('--')+1]).resolve()
measurements = []
for opacity in [0, .25, .5, 1]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    configure_surface_device(scene, {'device':'OPTIX' if '--optix' in sys.argv else 'CPU'})
    scene.cycles.samples = 256; scene.cycles.seed = 553; scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False; scene.cycles.diffuse_bounces = 4; scene.cycles.glossy_bounces = 0
    scene.cycles.transparent_max_bounces = 16
    scene.render.threads_mode = 'FIXED'; scene.render.threads = 4
    scene.render.bake.use_pass_color = False; scene.render.bake.use_clear = True
    scene.render.bake.margin = 4; scene.render.bake.use_pass_direct = True; scene.render.bake.use_pass_indirect = False
    scene.world = bpy.data.worlds.new('sky'); scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (1,1,1,1)
    package = proof['source_fixture']()
    floor, wall = package.manifest['materials']
    # A metallic, colored receiver still measures incident diffuse irradiance independently of its BRDF.
    floor.update(metalness=1, colorLinearSrgb=[.02,.2,.8], transmission=0)
    wall.update(transmission=0, alpha={'mode':'blended', 'opacity':opacity, 'alphaTest':0, 'inputs':[]},
        channelSupport={'indirect_irradiance': {'supported':False, 'reasons':['unsupported_alpha_mode:blended']}})
    package.manifest['participantMappings'][1]['channelRelevance']['indirect_irradiance'] = False
    package.manifest['casterMappings'].append({**package.manifest['participantMappings'][1], 'id':'caster/wall',
        'channelRelevance':{'indirect_irradiance':True}, 'coverageMode':'forced_opaque'})
    assert resolve_transport(package) == ['wall']
    reconstruction = reconstruct_resolved_city(package, destination, 'indirect_irradiance', EnhancedTransportMaterialAdapter)
    assert reconstruction['instanceObjectCount'] == 2
    image = bpy.data.images.new('surface',64,64,float_buffer=True); image.colorspace_settings.name='Non-Color'
    chart = {'id':'floor', 'instanceId':'floor', 'page':0, 'x':0, 'y':0, 'min':[-1,-1], 'texelsPerMeter':[27.5,27.5],
        'triangles':[{'offset':0,'uv':[[-1,-1],[1,-1],[1,1]]},{'offset':3,'uv':[[-1,-1],[1,1],[-1,1]]}]}
    atlas = {'charts':[chart], 'profile':{'pageSize':64,'padding':4,'texelSizeMeters':2/55}}
    install_surface_targets(package, atlas, [image])
    assert len(bpy.context.selected_objects) == 1
    bpy.ops.object.bake(type='DIFFUSE', uv_layer='AI533_Bake')
    data = np.array(image.pixels[:]).reshape(64,64,4)[16:48,12:40,:3]
    measurements.append({'opacity':opacity, 'sky':data.mean(axis=(0,1)).tolist()})
clear = np.array(measurements[0]['sky']); opaque = np.array(measurements[-1]['sky'])
assert np.min(clear) > .98 and np.max(clear)-np.min(clear) < .005, measurements
assert np.mean(opaque) < .85, measurements
for result in measurements:
    expected = clear*(1-result['opacity']) + opaque*result['opacity']
    assert np.max(np.abs(np.array(result['sky'])-expected)) < .035, measurements
(destination / 'surface-transport.json').write_text(json.dumps(measurements, indent=2))
print('SURFACE_TRANSPORT_PASS '+json.dumps(measurements), flush=True)
