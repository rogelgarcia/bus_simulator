"""Runs one independently authenticated sky or bounce pass from prepared probes."""
import hashlib
import json
import math
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT/'tools/receiver_lightmaps/blender'))
from bake_surface import configure_surface_device
from scene import assert_blender_runtime
import bpy
import numpy as np


def main():
    stage, prepared, name = map(str, sys.argv[sys.argv.index('--')+1:])
    stage, prepared = Path(stage), Path(prepared)
    if name not in ['sky','bounce']: raise ValueError('Expected sky or bounce')
    job = json.loads((prepared/'job.json').read_text())
    signature = assert_blender_runtime(job['archiveSha256'])
    bpy.ops.wm.open_mainfile(filepath=str(prepared/'probes.blend'))
    layout = json.loads((prepared/'layout.json').read_text()); profile = job['profile']
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'
    devices = configure_surface_device(scene, profile)
    scene.render.threads_mode = 'FIXED'; scene.render.threads = profile['threads']
    scene.cycles.samples = profile['samples']; scene.cycles.seed = 550
    scene.cycles.use_adaptive_sampling = False; scene.cycles.use_denoising = False
    scene.cycles.diffuse_bounces = profile['diffuseBounces']; scene.cycles.max_bounces = 8
    scene.cycles.glossy_bounces = 0; scene.cycles.transmission_bounces = 4; scene.cycles.transparent_max_bounces = 16
    scene.render.bake.use_pass_color = False; scene.render.bake.use_clear = True
    scene.render.bake.margin = 0; scene.render.bake.use_selected_to_active = False
    scene.render.bake.use_pass_direct = name == 'sky'; scene.render.bake.use_pass_indirect = name == 'bounce'
    bpy.data.objects['AI533_Sun'].hide_render = name == 'sky'
    image = bpy.data.images['AI550_Irradiance']
    start = time.monotonic()
    bpy.ops.object.bake(type='DIFFUSE', uv_layer='AI550_Bake')
    data = np.empty(len(image.pixels), dtype=np.float32); image.pixels.foreach_get(data)
    data = data.reshape(image.size[1], image.size[0], 4)
    if not np.all(np.isfinite(data)): raise ValueError('Non-finite probe bake')
    result = np.zeros((layout['count'],6,3), dtype='<f4')
    a = layout['atlas']; tile = a['tile']
    for p in range(layout['count']):
        for face in range(6):
            index = p*6+face; x = (index%a['columns'])*tile; y = (index//a['columns'])*tile
            result[p,face] = np.maximum(0, data[y+1:y+tile-1,x+1:x+tile-1,:3].mean(axis=(0,1))) * math.pi
    output = stage/(name+'.f32'); result.tofile(output)
    if not np.any(result > 0): raise ValueError('Empty irradiance pass; refusing publication')
    receipt = {'schema':'bus-sim-diffuse-probe-pass-v1','pass':name,'signature':signature,'devices':devices,
        'seconds':time.monotonic()-start,'samples':profile['samples'],
        'minimum':float(result.min()),'maximum':float(result.max()),'mean':float(result.mean()),
        'jobSha256':hashlib.sha256((prepared/'job.json').read_bytes()).hexdigest(),
        'sceneSha256':hashlib.sha256((prepared/'probes.blend').read_bytes()).hexdigest(),
        'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size}
    (stage/'receipt.json').write_text(json.dumps(receipt))


if __name__ == '__main__': main()
