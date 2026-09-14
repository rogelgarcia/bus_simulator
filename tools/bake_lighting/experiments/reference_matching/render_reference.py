"""Cycles reference uses revised exported materials and the frozen calibrated atmosphere."""
import sys,json,math
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'daylight_calibration'))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from sky import world
from afternoon_render import render
from color_pipeline import read_pass,three_aces,write_png,save_json

root=Path(sys.argv[sys.argv.index('--')+1]);r=json.loads((root/'request.json').read_text())
if r['device']=='OPTIX':
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    devices=[d for d in prefs.devices if d.type=='OPTIX']
    if not devices:raise RuntimeError('OPTIX unavailable')
    for d in prefs.devices:d.use=d in devices
device='GPU' if r['device']=='OPTIX' else 'CPU'
bpy.ops.wm.open_mainfile(filepath=str(root/'source_city.blend'),load_ui=False);scene=bpy.data.scenes[0]
for light in [o for o in scene.objects if o.type=='LIGHT']:bpy.data.objects.remove(light,do_unlink=True)
scene.world=world(r['defaults'],r['defaults']['profiles'][0]);scene.cycles.samples=r['samples'];scene.cycles.seed=562
scene.cycles.max_bounces=8;scene.cycles.use_denoising=True;scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.005
source_sun=None
if r.get('sourcePackage'):
    from transport_model import apply_source_world
    source_sun,source_background=apply_source_world(r['sourcePackage'],root,r.get('reconstructSource',False))
if r.get('diagnosticTransport')=='primary-geometric-diffuse':
    from transport_model import apply_primary_diffuse_control
    save_json(root/'transport_model.json',apply_primary_diffuse_control(scene))
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=r['width'];scene.render.resolution_y=r['height'];scene.render.resolution_percentage=100
scene.render.image_settings.media_type='MULTI_LAYER_IMAGE';scene.render.image_settings.file_format='OPEN_EXR_MULTILAYER';scene.render.image_settings.color_depth='32'
scene.render.filter_size=1.5
for layer in scene.view_layers:
    layer.use_pass_diffuse_direct=True;layer.use_pass_diffuse_indirect=True;layer.use_pass_diffuse_color=True
    layer.use_pass_glossy_direct=True;layer.use_pass_glossy_indirect=True;layer.use_pass_glossy_color=True
    layer.use_pass_emit=True;layer.use_pass_environment=True
bpy.ops.wm.save_as_mainfile(filepath=str(root/'calibrated_city.blend'),compress=True)
records=[]
for pose in r['poses']:
    scene.camera=bpy.data.objects[pose['id']]
    for layer in scene.view_layers:layer.use=layer.name==pose['id']
    raw=render(scene,root/'renders'/(pose['id']+'.exr'),device,pose['id'])
    image=root/'images'/(pose['id']+'.png');image.parent.mkdir(exist_ok=True)
    write_png(image,three_aces(read_pass(raw['file'],layer=pose['id']),2**r['exposureEv']))
    records.append({**raw,'pose':pose['id'],'bus':pose['busId'],'image':str(image),'exposureEv':r['exposureEv'],'tone':'Three r183 ACESFilmic','grade':'off'})
    save_json(root/'renders.json',records)
if source_sun:source_background.inputs['Strength'].default_value=0
else:scene.world=world(r['defaults'],r['defaults']['profiles'][0],'sun')
contributions=[]
for pose in [p for p in r['poses'] if not r.get('skipContributions') and (r.get('allContributions') or p['id'] in ['pose_02','pose_03'])]:
    scene.camera=bpy.data.objects[pose['id']]
    for layer in scene.view_layers:layer.use=layer.name==pose['id']
    raw=render(scene,root/'contributions'/(pose['id']+'_sun.exr'),device,pose['id'])
    contributions.append({**raw,'pose':pose['id'],'semantics':'Sun-only world; direct diffuse/glossy passes isolate named-sun response. Combined also contains sun bounce and must not be mistaken for direct sun.'})
    save_json(root/'contributions.json',contributions)
if not bpy.app.background:bpy.ops.wm.quit_blender()
