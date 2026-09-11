"""Measure higher sun profiles, then render the frozen city with identical material and display inputs."""
import sys,json,time,math,copy
from pathlib import Path
import bpy
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.append(str(Path(__file__).resolve().parent.parent/'material_calibration'))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from sky import world,sample_scene,solar_vectors
from fixtures import fixture,NORMALS
from daylight_math import directions,irradiance,sun_direction,spectral_sun,Y
from color_pipeline import read_pass,save_json,sha
from city_materials import assign

def render(scene,file,device,layer=None):
    file=Path(file);file.parent.mkdir(parents=True,exist_ok=True)
    if file.exists():raise RuntimeError('Refuse to overwrite previous radiance')
    scene.cycles.device=device;scene.render.filepath=str(file.with_suffix('.partial.exr'));start=time.perf_counter()
    bpy.ops.render.render(write_still=True,scene=scene.name)
    data=read_pass(scene.render.filepath,layer=layer)
    if not np.isfinite(data).all():raise RuntimeError('Nonfinite render')
    Path(scene.render.filepath).replace(file)
    return {'file':str(file),'sha256':sha(file),'seconds':time.perf_counter()-start}

def main():
    root=Path(sys.argv[sys.argv.index('--')+1]);r=json.loads((root/'request.json').read_text());start=time.perf_counter()
    if bpy.app.version[:3]!=(5,2,1):raise RuntimeError('Pinned Blender 5.2.1 required')
    if r['device']=='OPTIX':
        prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices();devices=[d for d in prefs.devices if d.type=='OPTIX']
        if not devices:raise RuntimeError('OPTIX unavailable')
        for d in prefs.devices:d.use=d in devices
    elif r['device']!='CPU':raise RuntimeError('Unsupported device')
    device='GPU' if r['device']=='OPTIX' else 'CPU';profiles=[];checks=[];records=[]
    for elevation in [35,*r['recipe']['elevationsDeg']]:
        d=copy.deepcopy(r['defaults']);d['sun']['elevationDeg']=elevation;p=copy.deepcopy(d['profiles'][0]);p['id']='E'+str(elevation);p['name']=str(elevation)+' degree clear daylight'
        directory=root/'measurements'/p['id'];vectors=directions(d['environmentWidth'],d['environmentWidth']//2)
        scene=sample_scene(d,p,'sky',vectors);raw=render(scene,directory/'sky.exr',device);pixels=read_pass(raw['file']);bpy.data.scenes.remove(scene)
        sky={name:irradiance(pixels,n) for name,n in NORMALS.items()}
        vectors,weights=solar_vectors(d);scene=sample_scene(d,p,'sun',vectors);raw=render(scene,directory/'sun.exr',device);disc=read_pass(raw['file']);bpy.data.scenes.remove(scene)
        direction=sun_direction(d);sun=np.sum(disc*weights[:,:,None]*(vectors@direction)[:,:,None],axis=(0,1));spectral=spectral_sun(d,p)
        error=float(np.linalg.norm(sun-spectral['rgb'])/np.linalg.norm(spectral['rgb']));limit=d['tolerances']['sunQuadratureRelative']
        checks.append({'id':p['id']+'_sun_integral','error':error,'limit':limit,'passed':error<=limit})
        centroid=np.sum(vectors*((disc@Y)*weights)[:,:,None],axis=(0,1));centroid/=np.linalg.norm(centroid)
        error=math.degrees(math.acos(float(np.clip(centroid@direction,-1,1))));limit=d['tolerances']['sunDirectionDeg']
        checks.append({'id':p['id']+'_sun_direction','error':error,'limit':limit,'passed':error<=limit})
        if elevation==35:
            reference=r['referenceDaylight']['profiles'][0]
            for name,observed,expected in [('sun',sun,np.array(reference['sunNormalRgb'])),('sky',sky['horizontal'],np.array(reference['skyIrradiance']['horizontal']))]:
                error=float(np.linalg.norm(observed-expected)/np.linalg.norm(expected));checks.append({'id':'E35_original_'+name,'error':error,'limit':.01,'passed':error<=.01})
        for name,normal in NORMALS.items():
            scene=fixture(d,p,'combined',name);raw=render(scene,directory/(name+'.exr'),device);observed=read_pass(raw['file'])[32:96,32:96].mean(axis=(0,1));bpy.data.scenes.remove(scene)
            expected=(sky[name]+sun*max(float(direction@normal),0))*.18/math.pi;error=float(np.linalg.norm(observed-expected)/np.linalg.norm(expected));limit=d['tolerances']['cardRelative']
            checks.append({'id':p['id']+'_'+name+'_card','error':error,'limit':limit,'passed':error<=limit})
        profiles.append({'id':p['id'],'defaults':d,'profile':p,'elevationDeg':elevation,'sunNormalRgb':sun.tolist(),'estimatedSunNormalLux':spectral['estimatedLux'],'skyIrradiance':{k:v.tolist() for k,v in sky.items()},'neutralCardExposureEv':math.log2(math.pi/float((sky['horizontal']+sun*direction[2])@Y)),'sunDirectionBlender':direction.tolist()})
        save_json(root/'measurements.json',{'profiles':profiles,'checks':checks})
    if not all(c['passed'] for c in checks):raise RuntimeError('Physical checks failed; stop before city comparison')
    bpy.ops.wm.open_mainfile(filepath=str(root/'source_city.blend'),load_ui=False);scene=bpy.data.scenes[0];assign(scene,r['recipe']['material'])
    if any(o.type=='LIGHT' for o in scene.objects):raise RuntimeError('City contains a duplicate light source')
    scene.cycles.samples=r['recipe']['samples'];scene.cycles.seed=r['recipe']['seed'];scene.cycles.max_bounces=8
    scene.cycles.use_denoising=True;scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.01
    scene.render.threads_mode='FIXED';scene.render.threads=r['recipe']['threads'];scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
    for p in profiles:world(p['defaults'],p['profile'])
    scene.world=bpy.data.worlds['E'+str(r['recipe']['preferredElevationDeg'])+'_combined'];bpy.ops.wm.save_as_mainfile(filepath=str(root/'afternoon_city.blend'),compress=True)
    for p in profiles:
        if p['elevationDeg']==35:continue
        scene.world=bpy.data.worlds[p['id']+'_combined']
        for pose in r['poses']:
            scene.camera=bpy.data.objects[pose['id']]
            if scene.camera['bus_id']!=pose['busId']:raise RuntimeError('Bus association changed')
            for layer in scene.view_layers:layer.use=layer.name==pose['id'];layer.material_override=None
            layer=scene.view_layers[pose['id']]
            for name in ['bus_shared_01_02','bus_03','bus_04','bus_05']:
                if layer.layer_collection.children[name].exclude!=(name!=pose['busId']):raise RuntimeError('Unrelated bus affects render')
            raw=render(scene,root/'renders'/(p['id']+'_'+pose['id']+'.exr'),device,pose['id']);records.append({**raw,'pose':pose['id'],'bus':pose['busId'],'elevationDeg':p['elevationDeg']})
            save_json(root/'renders.json',records);print('AFTERNOON_RENDER='+p['id']+' '+pose['id'],flush=True)
    save_json(root/'render_timing.json',{'seconds':time.perf_counter()-start,'device':r['device'],'threads':r['recipe']['threads']})
    if not bpy.app.background:bpy.ops.wm.quit_blender()

if __name__=='__main__':main()
