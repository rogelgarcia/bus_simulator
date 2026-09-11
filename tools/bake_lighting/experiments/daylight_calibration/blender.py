"""Version-pinned atmosphere preparation and resumable raw city/fixture renders."""
import sys,json,time,math,hashlib
from pathlib import Path
import bpy
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import read_pass,save_json,sha
from sky import configure,world,sample_scene,solar_vectors
from daylight_math import directions,irradiance,sun_direction,spectral_sun,chromaticity,Y
from fixtures import fixture,NORMALS,material

def raw_render(scene,file,device):
    file=Path(file);file.parent.mkdir(parents=True,exist_ok=True);scene.cycles.device=device
    receipt=file.with_suffix('.json');signature={'scene':scene.name,'samples':scene.cycles.samples,'seed':scene.cycles.seed,'resolution':[scene.render.resolution_x,scene.render.resolution_y]}
    if file.exists() and receipt.exists():
        old=json.loads(receipt.read_text())
        if old['signature']==signature and old['sha256']==sha(file):return old
        raise RuntimeError('Changed render inputs at immutable output '+str(file))
    started=time.perf_counter();partial=file.with_suffix('.partial.exr');scene.render.filepath=str(partial)
    bpy.ops.render.render(write_still=True,scene=scene.name)
    pixels=read_pass(partial)
    if not np.isfinite(pixels).all():raise RuntimeError('Nonfinite raw transport')
    partial.replace(file)
    record={'file':str(file),'sha256':sha(file),'signature':signature,'seconds':time.perf_counter()-started}
    save_json(receipt,record);print('AI565_RENDER='+scene.name,flush=True);return record

def prepare(job,device):
    output=Path(job['output']);d=job['defaults'];profiles=[]
    for profile in d['profiles']:
        directory=output/'environments'/profile['id'];directory.mkdir(parents=True,exist_ok=True)
        vectors=directions(d['environmentWidth'],d['environmentWidth']//2)
        scene=sample_scene(d,profile,'sky',vectors);record=raw_render(scene,directory/'sky.exr',device);pixels=read_pass(record['file'])
        rgba=np.ones((*pixels.shape[:2],4),np.float32);rgba[:,:,:3]=pixels
        # DataTexture upload is bottom-up; canonical EXR/readback stays top-down.
        np.flipud(rgba).astype('<f4').tofile(directory/'sky.rgba32f')
        values={name:irradiance(pixels,n).tolist() for name,n in NORMALS.items()}
        bpy.data.scenes.remove(scene)
        sun=np.zeros(3);quadrature=None;measured_direction=None
        if profile['model']=='atmosphere':
            vectors,weights=solar_vectors(d);scene=sample_scene(d,profile,'sun',vectors);record=raw_render(scene,directory/'sun_disc.exr',device);disc=read_pass(record['file'])
            sun=np.sum(disc*weights[:,:,None]*(vectors@sun_direction(d))[:,:,None],axis=(0,1))
            if not np.isfinite(sun).all() or min(sun)<=0:raise RuntimeError('Solar disc is missing or invalid; check sky/camera axes')
            centroid=np.sum(vectors*((disc@Y)*weights)[:,:,None],axis=(0,1));centroid/=np.linalg.norm(centroid)
            measured_direction=centroid.tolist();quadrature=spectral_sun(d,profile);bpy.data.scenes.remove(scene)
            error=np.linalg.norm(sun-quadrature['rgb'])/np.linalg.norm(quadrature['rgb'])
            if error>d['tolerances']['sunQuadratureRelative']:raise RuntimeError('Solar spectral integral mismatch '+str(error))
            if math.degrees(math.acos(float(np.clip(centroid@sun_direction(d),-1,1))))>d['tolerances']['sunDirectionDeg']:raise RuntimeError('Solar direction mismatch')
        check_scene=fixture(d,profile,'combined','horizontal');raw_render(check_scene,directory/'horizontal_preflight.exr',device)
        observed=read_pass(directory/'horizontal_preflight.exr')[32:96,32:96].mean(axis=(0,1))
        expected=(np.array(values['horizontal'])+sun*sun_direction(d)[2])*.18/math.pi
        if np.linalg.norm(observed-expected)/np.linalg.norm(expected)>d['tolerances']['cardRelative']:raise RuntimeError('World and exported sky disagree on the horizontal receiver: '+profile['id'])
        bpy.data.scenes.remove(check_scene)
        record={**profile,'skyIrradiance':values,'sunNormalRgb':sun.tolist(),'estimatedSunNormalLux':float(sun@Y*683),'solarQuadrature':quadrature,
            'measuredSunDirectionBlender':measured_direction,'sunDirectionBlender':sun_direction(d).tolist(),'sunDirectionThree':[float(sun_direction(d)[0]),float(sun_direction(d)[2]),float(-sun_direction(d)[1])],
            'angularDiameterDeg':d['sun']['angularDiameterDeg'],'skyWidth':pixels.shape[1],'skyHeight':pixels.shape[0],
            'skyFile':str(directory/'sky.rgba32f'),'zenithXy':chromaticity(np.mean(pixels[:4,:,:],axis=(0,1))),
            'horizonXy':chromaticity(np.mean(pixels[pixels.shape[0]//2-4:pixels.shape[0]//2,:,:],axis=(0,1)))}
        profiles.append(record)
    total=np.array(profiles[0]['skyIrradiance']['horizontal'])+np.array(profiles[0]['sunNormalRgb'])*sun_direction(d)[2]
    multiplier=math.pi/float(total@Y)
    save_json(output/'daylight.json',{'schemaVersion':1,'profiles':profiles,'exposureMultiplier':multiplier,'exposureEv':math.log2(multiplier),'policy':d['exposurePolicy'],'blenderVersion':bpy.app.version_string,'build':bpy.app.build_hash.decode()})
    # Keep analytical scenes in a separate reusable file; city references remain unchanged.
    scenes=[]
    for p in d['profiles']:
        for mode in ['sun','sky','combined']:
            for kind in NORMALS:scenes.append(fixture(d,p,mode,kind))
        scenes.append(fixture(d,p,'combined','spheres'))
        if p['model']=='atmosphere':
            for kind in ['shadow_near','shadow_far']:scenes.append(fixture(d,p,'sun',kind))
    for window in bpy.context.window_manager.windows:window.scene=scenes[0]
    for scene in list(bpy.data.scenes):
        if scene not in scenes:bpy.data.scenes.remove(scene)
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output/'daylight_fixtures.blend'),compress=True)
    bpy.ops.wm.open_mainfile(filepath=job['identity']['scene'],load_ui=False);scene=bpy.data.scenes[0]
    for obj in list(scene.objects):
        if obj.type=='LIGHT':bpy.data.objects.remove(obj,do_unlink=True)
    for p in d['profiles']:world(d,p)
    scene.world=bpy.data.worlds[d['profiles'][0]['id']+'_combined'];scene.camera=bpy.data.objects['pose_03']
    for layer in scene.view_layers:layer.use=layer.name=='pose_03'
    scene['AI565_source_policy']='Atmospheric world is the ONLY sun/sky source. No directional/hemisphere addition. Model ground multiple scattering is not a duplicate local ground plane.'
    scene['AI565_exposure_multiplier']=multiplier
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'daylight_city.blend'),compress=True)

def render(job,device):
    output=Path(job['output']);d=job['defaults'];records=[]
    bpy.ops.wm.open_mainfile(filepath=str(output/'daylight_fixtures.blend'),load_ui=False)
    for scene in sorted(bpy.data.scenes,key=lambda s:s.name):
        record=raw_render(scene,output/'fixtures'/(scene.name+'.exr'),device);records.append({**record,'kind':'fixture','id':scene.name})
        save_json(output/'render_progress.json',records)
    bpy.ops.wm.open_mainfile(filepath=str(output/'daylight_city.blend'),load_ui=False);scene=bpy.data.scenes[0]
    # This diagnostic intentionally replaces all surfaces with opaque neutral Lambertian material.
    # Alpha foliage/glass occlusion changes are reported; it is not scored as a faithful material match.
    neutral=material('AI565_neutral_geometry')
    for profile in d['profiles']:
        scene.world=bpy.data.worlds[profile['id']+'_combined']
        for pose in job['identity']['poses']:
            camera=bpy.data.objects[pose['id']];associated=camera['bus_id'];scene.camera=camera
            for layer in scene.view_layers:layer.use=layer.name==pose['id']
            layer=scene.view_layers[pose['id']]
            for name in ['bus_shared_01_02','bus_03','bus_04','bus_05']:
                if layer.layer_collection.children[name].exclude!=(name!=associated):raise RuntimeError('Shared bus association changed')
            for mode in ['original','neutral']:
                layer.material_override=neutral if mode=='neutral' else None
                scene.cycles.samples=d['samples'];scene.cycles.seed=d['seed'];scene.cycles.max_bounces=8
                scene.cycles.use_denoising=True;scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.015
                scene.render.threads_mode='FIXED';scene.render.threads=d['threads'];scene.render.resolution_x=d['width'];scene.render.resolution_y=d['height'];scene.render.resolution_percentage=100
                scene.render.image_settings.media_type='MULTI_LAYER_IMAGE';scene.render.image_settings.file_format='OPEN_EXR_MULTILAYER';scene.render.image_settings.color_depth='32'
                scene.view_settings.exposure=0;scene.view_settings.look='None';scene.view_settings.view_transform='AgX'
                name=profile['id']+'_'+pose['id']+'_'+mode
                record=raw_render(scene,output/'city'/(name+'.exr'),device)
                records.append({**record,'kind':'city','id':name,'profile':profile['id'],'pose':pose['id'],'bus':associated,'material':mode})
                save_json(output/'render_progress.json',records)
    save_json(output/'renders.json',records)

def fixtures(job,device):
    """New measurement revision, independent of unchanged city transport artifacts."""
    output=Path(job['output']);d=job['defaults'];scenes=[];records=[]
    for p in d['profiles']:
        for mode in ['sun','sky','combined']:
            for kind in NORMALS:scenes.append(fixture(d,p,mode,kind))
        scenes.append(fixture(d,p,'combined','spheres'))
        if p['model']=='atmosphere':
            for kind in ['shadow_near','shadow_far']:scenes.append(fixture(d,p,'sun',kind))
    for window in bpy.context.window_manager.windows:window.scene=scenes[0]
    for scene in list(bpy.data.scenes):
        if scene not in scenes:bpy.data.scenes.remove(scene)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'fixtures.blend'),compress=True)
    for scene in scenes:records.append({**raw_render(scene,output/(scene.name+'.exr'),device),'kind':'fixture','id':scene.name})
    save_json(output/'records.json',records)

def main():
    job=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());start=time.perf_counter()
    if bpy.app.version[:3]!=(5,2,1):raise RuntimeError('Atmosphere requires pinned Blender 5.2.1')
    prefs=bpy.context.preferences.addons['cycles'].preferences;devices=[]
    if job['device']=='OPTIX':
        prefs.compute_device_type='OPTIX';prefs.get_devices();devices=[d for d in prefs.devices if d.type=='OPTIX']
        if not devices:raise RuntimeError('Requested OPTIX is unavailable')
        for d in prefs.devices:d.use=d in devices
    elif job['device']!='CPU':raise RuntimeError('Unsupported device')
    globals()[job['stage']](job,'GPU' if devices else 'CPU')
    timing={'seconds':time.perf_counter()-start,'devices':[d.name for d in devices] or ['CPU'],'threads':job['defaults']['threads']}
    save_json(Path(job['output'])/(job['stage']+'_timing_'+str(time.time_ns())+'.json'),timing)
    save_json(Path(job['output'])/(job['stage']+'_timing.json'),timing)
    if not bpy.app.background:bpy.ops.wm.quit_blender()

if __name__=='__main__':main()
