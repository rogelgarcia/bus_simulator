"""Sequential, resumable Cycles jobs from a saved scene, never starts the game."""
import bpy, json, sys, time, os, hashlib
import OpenImageIO as oiio
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lighting import setup_environments, apply_lighting
from calibration import render_cards

job=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());scene_info=json.loads(Path(job['sceneManifest']).read_text())
bpy.ops.wm.open_mainfile(filepath=scene_info['scene']);scene=bpy.context.scene
source=json.loads(Path(scene_info['sourceManifest']).read_text());lighting=job['lighting'];profiles=job['profiles'];root=Path(job['output']);root.mkdir(parents=True,exist_ok=True)
for image in bpy.data.images:
    if image.source=='FILE' and not image.packed_file and not Path(bpy.path.abspath(image.filepath)).exists():raise RuntimeError('Missing image '+image.filepath)
prefs=bpy.context.preferences.addons['cycles'].preferences
if job['device']=='OPTIX':
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    selected=[device for device in prefs.devices if device.type=='OPTIX']
    if not selected:raise RuntimeError('Configured OPTIX device unavailable')
    for device in prefs.devices:device.use=device in selected
    scene.cycles.device='GPU'
else:scene.cycles.device='CPU';selected=[]
scene.render.threads_mode='FIXED';scene.render.threads=max(1,(os.cpu_count() or 2)//2)
scene.render.engine='CYCLES';scene.cycles.use_denoising=True;scene.cycles.denoiser=profiles['denoiser'];scene.cycles.denoising_prefilter=profiles['denoisingPrefilter']
scene.cycles.use_adaptive_sampling=True;scene.cycles.use_animated_seed=False
for key,value in profiles['transport'].items():setattr(scene.cycles,key,value)
scene.render.image_settings.media_type='MULTI_LAYER_IMAGE';scene.render.image_settings.file_format='OPEN_EXR_MULTILAYER';scene.render.image_settings.color_depth='32';scene.render.image_settings.exr_codec='ZIP';scene.render.image_settings.use_exr_interleave=True;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
calibration=setup_environments(scene,source,lighting,root/'environments')
calibration['cards']=render_cards(scene,source,lighting,calibration,root/'calibration')
(root/'calibration.json').write_text(json.dumps(calibration,indent=2))
# A ready-to-render reference scene supplements the neutral transport export.
apply_lighting(scene,source,lighting,next((p for p in lighting['configurations'] if p['id']=='L01'),lighting['configurations'][0]),calibration)
scene.camera=bpy.data.objects['pose_01']
for reference_layer in scene.view_layers:reference_layer.use=reference_layer.name=='pose_01'
scene.cycles.samples=profiles['pilot']['samples'];scene.cycles.adaptive_threshold=profiles['pilot']['noiseThreshold']
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(root/'lighting_reference.blend'),compress=True,copy=True)
checks=[]
for item in job['jobs']:
    receipt=Path(item['receipt']);target=Path(item['file']);target.parent.mkdir(parents=True,exist_ok=True)
    if receipt.exists() and target.exists():
        old=json.loads(receipt.read_text())
        if old.get('key')==item['key'] and hashlib.sha256(target.read_bytes()).hexdigest()==old['sha256']:
            print('AI560_REUSED='+item['id'],flush=True);continue
    scene.camera=bpy.data.objects[item['pose']]
    for layer in scene.view_layers:layer.use=layer.name==item['pose']
    layer=scene.view_layers[item['pose']]
    associated=scene.camera['bus_id']
    for name in scene_info['build']['busPlacements']:
        if layer.layer_collection.children[name].exclude != (name!=associated):raise RuntimeError('Bus view-layer association was modified')
    preset=next(p for p in lighting['configurations'] if p['id']==item['light']);effective=apply_lighting(scene,source,lighting,preset,calibration)
    for name in ['Sun','Sky']:
        if not layer.lightgroups.get(name):layer.lightgroups.add(name=name)
    scene.world.lightgroup='Sky'
    for obj in scene.objects:
        if obj.type=='LIGHT':obj.lightgroup='Sun'
    profile=item['profile'];scene.render.resolution_x=profile['width'];scene.render.resolution_y=profile['height'];scene.cycles.samples=profile['samples'];scene.cycles.adaptive_min_samples=profile['minimumSamples'];scene.cycles.adaptive_threshold=profile['noiseThreshold'];scene.cycles.seed=item['seed'];scene.cycles.time_limit=item.get('timeLimitSeconds',0)
    for key,value in profiles['transport'].items():setattr(scene.cycles,key,value)
    for key,value in item.get('transportOverrides',{}).items():setattr(scene.cycles,key,value)
    # Blender retains earlier view-layer passes in Render Result until it is removed.
    previous=bpy.data.images.get('Render Result')
    if previous:bpy.data.images.remove(previous)
    scene.render.filepath=str(target.with_suffix('.partial.exr'));start=time.perf_counter()
    print('AI560_RENDER_START='+json.dumps({'id':item['id'],'profile':profile}),flush=True)
    # The layer argument means re-render and retains other cameras' prior passes.
    # A fresh render uses only the one enabled view layer and resets the EXR.
    bpy.ops.render.render(write_still=True);seconds=time.perf_counter()-start
    if scene.cycles.time_limit>0 and seconds>=scene.cycles.time_limit:raise RuntimeError('Render time budget reached; output is not quality validated')
    image=oiio.ImageInput.open(scene.render.filepath)
    if not image:raise RuntimeError('Cannot open completed EXR: '+oiio.geterror())
    try:
        spec=image.spec();names=list(spec.channelnames)
        if any(not name.startswith(item['pose']+'.') for name in names):raise RuntimeError('EXR contains a different camera layer')
        for y in range(0,spec.height,128):
            pixels=image.read_scanlines(0,0,y,min(y+128,spec.height),0,0,spec.nchannels,oiio.FLOAT)
            if pixels is None:raise RuntimeError('Incomplete EXR: '+image.geterror())
        del pixels
    finally:image.close()
    os.replace(scene.render.filepath,target)
    preview=target.with_suffix('.png');scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='8';bpy.data.images['Render Result'].save_render(str(preview),scene=scene);scene.render.image_settings.media_type='MULTI_LAYER_IMAGE';scene.render.image_settings.file_format='OPEN_EXR_MULTILAYER';scene.render.image_settings.color_depth='32'
    bpy.context.window.view_layer=layer;layer.update()
    record={'schemaVersion':1,'status':'validated','key':item['key'],'id':item['id'],'pose':item['pose'],'light':item['light'],'file':str(target),'preview':str(preview),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'seconds':seconds,'profile':profile,'seed':item['seed'],'lighting':effective,'transport':{key:getattr(scene.cycles,key) for key in profiles['transport']},'device':job['device'],'hardware':[d.name for d in selected],'blender':bpy.app.version_string,'ocio':bpy.app.ocio.version_string,'workingSpace':'Linear Rec.709','denoiser':profiles['denoiser'],'denoised':True,'qualityClaim':'Adaptive sample budget completed; inspect independent-seed/high-bounce diagnostic for residual uncertainty','busId':associated,'busWorldMatrix':[list(row) for row in bpy.data.objects[associated].matrix_world]}
    receipt.write_text(json.dumps(record,indent=2));checks.append(record)
    print('AI560_RENDER_DONE='+json.dumps({'id':item['id'],'seconds':seconds}),flush=True)
print('AI560_RENDER_BATCH_COMPLETE='+str(len(checks)),flush=True)
