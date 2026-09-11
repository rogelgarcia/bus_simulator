"""Native Cycles emission checks for raw sRGB color and linear data textures."""
import sys,json,struct
from pathlib import Path
import bpy,numpy as np,OpenImageIO as oiio
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'illumination_bake_compiler/blender'))
from reconstruct import _MaterialAdapter

output=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
scene.cycles.use_denoising=False;scene.cycles.use_adaptive_sampling=False
scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=16;scene.render.resolution_y=16;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='OPEN_EXR';scene.render.image_settings.color_depth='32'
scene.view_settings.view_transform='Raw';scene.view_settings.exposure=0
bpy.ops.mesh.primitive_plane_add(size=4)
plane=bpy.context.object;material=bpy.data.materials.new('Raw image test');material.use_nodes=True
plane.data.materials.append(material);nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
texture=nodes.new('ShaderNodeTexImage');emission=nodes.new('ShaderNodeEmission');surface=nodes.new('ShaderNodeOutputMaterial')
links.new(texture.outputs['Color'],emission.inputs['Color']);links.new(emission.outputs[0],surface.inputs['Surface'])
camera=bpy.data.cameras.new('Camera');camera.type='ORTHO';camera.ortho_scale=2
obj=bpy.data.objects.new('Camera',camera);scene.collection.objects.link(obj);obj.location=(0,0,3);scene.camera=obj
results=[]
for name,component,data,color_space,expected in [
    ('raw_srgb','uint8',bytes([43,128,188,255]),'sRGB',[.024157632448504756,.21586050011389926,.5028864580325687]),
    ('raw_data','uint8',bytes([43,128,188,255]),'Non-Color',[43/255,128/255,188/255]),
    ('raw_linear_hdr','float32',struct.pack('<4f',.18,1.5,4,1),'Non-Color',[.18,1.5,4]),
    ('raw_coverage','uint8',bytes([64]),'Non-Color',[64/255]*3)]:
    source={'id':name,'kind':'source','width':1,'height':1,'componentType':component,'storage':'raw_typed_pixels'}
    binding={'id':name+'-binding','kind':'binding','sourceId':name,'colorSpace':'srgb' if color_space=='sRGB' else ''}
    adapter=_MaterialAdapter(SimpleNamespace(get_buffer_bytes=lambda _:data),output,{}, {},{name:source,binding['id']:binding})
    image=adapter._image(source,'r' if name=='raw_coverage' else 'source');texture.image=image;image.use_fake_user=True
    file=output/(name+'.exr');scene.render.filepath=str(file);bpy.ops.render.render(write_still=True)
    source=oiio.ImageInput.open(str(file));values=np.asarray(source.read_image(format=oiio.FLOAT));source.close()
    actual=values[4:12,4:12,:3].mean(axis=(0,1));error=float(np.max(np.abs(actual-expected)))
    results.append({'name':name,'image':image.name,'pixels':list(image.pixels[:]),'actual':actual.tolist(),'expected':expected,'maximumError':error,'passed':error<.001})
bpy.ops.wm.save_as_mainfile(filepath=str(output/'textures.blend'))
bpy.ops.wm.open_mainfile(filepath=str(output/'textures.blend'),load_ui=False)
for result in results:
    result['reloadedPixels']=list(bpy.data.images[result['image']].pixels[:])
    result['reloadError']=max(abs(a-b) for a,b in zip(result['reloadedPixels'][:3],result['expected']))
    result['passed'] &= result['reloadError']<.001
(output/'validation.json').write_text(json.dumps({'checks':results},indent=2))
print(json.dumps(results),flush=True)
if not all(row['passed'] for row in results):raise RuntimeError('Raw texture color interpretation failed')
