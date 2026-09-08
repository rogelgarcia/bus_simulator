"""Calibrates virtual receiver visibility, irradiance units and packed-image persistence."""
import json
import math
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT/'tools/illumination_bake_compiler/blender'))
from scene import assert_blender_runtime
import bpy
import numpy as np


def main():
    stage = Path(sys.argv[sys.argv.index('--')+1])
    job = json.loads((stage/'job.json').read_text()); assert_blender_runtime(job['archiveSha256'])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 16
    scene.render.threads_mode = 'FIXED'; scene.render.threads = 4
    world = bpy.data.worlds.new('ConstantRadiance'); world.use_nodes = True; scene.world = world
    expected = np.array([.2,.4,.6])
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (*expected,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1
    bpy.ops.mesh.primitive_plane_add(size=2)
    target = bpy.context.object
    material = bpy.data.materials.new('UnitDiffuse'); material.use_nodes = True; nodes=material.node_tree.nodes; nodes.clear()
    diffuse=nodes.new('ShaderNodeBsdfDiffuse'); diffuse.inputs['Color'].default_value=(1,1,1,1)
    output=nodes.new('ShaderNodeOutputMaterial'); material.node_tree.links.new(diffuse.outputs[0],output.inputs['Surface'])
    image=bpy.data.images.new('Calibration',16,16,float_buffer=True); image.colorspace_settings.name='Non-Color'
    texture=nodes.new('ShaderNodeTexImage');texture.image=image;nodes.active=texture;target.data.materials.append(material)
    scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=False
    scene.render.bake.margin=0;scene.render.bake.use_clear=True
    results=[]
    for camera,diffuse_visibility in [(False,False),(True,False),(True,True)]:
        target.visible_camera=camera;target.visible_diffuse=diffuse_visibility;target.visible_shadow=False
        target.visible_glossy=False;target.visible_transmission=False
        bpy.ops.object.bake(type='DIFFUSE')
        pixels=np.array(image.pixels[:],dtype=np.float32).reshape(16,16,4)
        mean=pixels[2:-2,2:-2,:3].mean(axis=(0,1))
        results.append({'camera':camera,'diffuse':diffuse_visibility,'mean':mean.tolist()})
    print('AI550 calibration '+json.dumps(results),flush=True)
    # This is E/pi from the diffuse bake; runtime packaging multiplies by pi.
    if not np.allclose(results[1]['mean'],expected,atol=.02): raise ValueError('Virtual receiver calibration failed')
    image.pack();bpy.ops.wm.save_as_mainfile(filepath=str(stage/'calibration.blend'))
    bpy.ops.wm.open_mainfile(filepath=str(stage/'calibration.blend'))
    restored=np.array(bpy.data.images['Calibration'].pixels[:],dtype=np.float32).reshape(16,16,4)[2:-2,2:-2,:3].mean(axis=(0,1))
    if not np.allclose(restored,expected,atol=.02): raise ValueError('Packed image roundtrip failed')
    (stage/'calibration.json').write_text(json.dumps({'schema':'bus-sim-probe-calibration-v1','samples':results,'expectedIrradiance':(expected*math.pi).tolist(),'packedRoundtrip':True}))


if __name__=='__main__':main()
