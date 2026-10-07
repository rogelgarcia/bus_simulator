# Measures Cycles bake color encoding with a known linear swatch before changing photographic bark.
from pathlib import Path
import bpy
import numpy as np
from common import clear_scene, configure, write_json
from stem_bake import bake_image
from atlas import write_pixels


def diagnose(options):
    clear_scene();scene=configure(options);scene.cycles.samples=1;scene.render.threads=2
    bpy.ops.mesh.primitive_plane_add();obj=bpy.context.object
    material=bpy.data.materials.new('Known linear bark swatch');material.use_nodes=True;obj.data.materials.append(material)
    nodes,links=material.node_tree.nodes,material.node_tree.links
    emission=nodes.new('ShaderNodeEmission');emission.inputs['Color'].default_value=(.18,.09,.045,1)
    links.new(emission.outputs[0],nodes.get('Material Output').inputs['Surface'])
    target=nodes.new('ShaderNodeTexImage');nodes.active=target
    result={}
    for space in ['sRGB','Non-Color']:
        image=bpy.data.images.new('Encoding diagnostic '+space,32,32,float_buffer=True)
        image.colorspace_settings.name=space;target.image=image
        bpy.ops.object.bake(type='EMIT',use_clear=True)
        pixels=np.array(image.pixels[:]).reshape((32,32,4));result[space]=pixels[16,16,:3].tolist()
    result['expectedLinear']=[.18,.09,.045]
    destination=Path(options['output'])/'bark-encoding-diagnostic.json';destination.parent.mkdir(parents=True,exist_ok=True)
    target.image=bake_image('Production bark encoding',32,32);bpy.ops.object.bake(type='EMIT',use_clear=True)
    pixels=np.array(target.image.pixels[:],np.float32).reshape((32,32,4))
    result['productionLinear']=pixels[16,16,:3].tolist()
    if not np.allclose(result['productionLinear'],result['expectedLinear'],atol=.0001):raise RuntimeError('Bark bake is not linear')
    encoded=write_pixels('Production color swatch',pixels,destination.with_suffix('.png'),True)
    stored=np.array(encoded.pixels[:]).reshape((32,32,4))[16,16,:3]
    decoded=np.where(stored<=.04045,stored/12.92,((stored+.055)/1.055)**2.4)
    result['pngEncoded']=stored.tolist();result['pngRoundTripLinear']=decoded.tolist()
    if not np.allclose(decoded,result['expectedLinear'],atol=.002):raise RuntimeError('Bark PNG has an extra color transform')
    write_json(destination,result);print('[Distant] Color encoding diagnostic: '+str(result),flush=True)
