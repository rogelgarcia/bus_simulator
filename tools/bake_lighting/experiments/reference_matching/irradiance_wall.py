"""Reuse native source geometry and original chart coordinates; keep production assets untouched."""
import sys,json,copy,math
from pathlib import Path
import bpy,numpy as np
root=Path(sys.argv[sys.argv.index('--')+1]);request=json.loads((root/'request.json').read_text())
selection=json.loads((root/'selection.json').read_text());chart=json.loads((root/'chart.json').read_text())
sys.path.insert(0,str(Path(__file__).resolve().parents[4]/'tools/receiver_lightmaps/blender'))
from bake_surface import install_surface_targets,configure_surface_device
from bake import open_verified_package
bpy.ops.wm.open_mainfile(filepath=str(Path(request['input'])/'source_scene/calibrated_city.blend'),load_ui=False)
scene=bpy.context.scene;bpy.context.window.view_layer=scene.view_layers['pose_custom']
configure_surface_device(scene,{'device':request['device']})
scene.cycles.samples=1024;scene.cycles.seed=553;scene.cycles.use_adaptive_sampling=False;scene.cycles.use_denoising=False
scene.cycles.diffuse_bounces=4;scene.cycles.max_bounces=8;scene.cycles.glossy_bounces=0
scene.cycles.transmission_bounces=4;scene.cycles.transparent_max_bounces=16
scene.render.bake.use_pass_color=False;scene.render.bake.margin=2;scene.render.bake.use_clear=True
size=2**math.ceil(math.log2(max(chart['width'],chart['height'])))
image=bpy.data.images.new('wall chart',size,size,float_buffer=True);image.colorspace_settings.name='Non-Color'
chart.update(page=0,x=0,y=0)
with open_verified_package(Path(selection['sourcePackage']['file']),selection['sourcePackage']['sha256']) as package:
    install_surface_targets(package,{'charts':[chart],'profile':{'pageSize':size,'padding':2,'texelSizeMeters':.33}},[image])
sun=next(obj for obj in scene.objects if obj.type=='LIGHT' and obj.data.type=='SUN')
for clamp in [10,0]:
    scene.cycles.sample_clamp_indirect=clamp
    for name,direct,indirect,visible in [('sky',True,False,False),('bounce',False,True,True)]:
        sun.hide_render=not visible;scene.render.bake.use_pass_direct=direct;scene.render.bake.use_pass_indirect=indirect
        bpy.ops.object.bake(type='DIFFUSE',uv_layer='AI533_Bake')
        values=np.empty(size*size*4,np.float32);image.pixels.foreach_get(values)
        np.save(root/('clamp'+str(clamp)+'_'+name+'.npy'),values.reshape(size,size,4))
        print('WALL_PASS '+str(clamp)+' '+name,flush=True)
