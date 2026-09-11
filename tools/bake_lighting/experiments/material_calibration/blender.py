"""Pinned material-scene preparation and authenticated resumable Cycles rendering."""
import sys,json,time,faulthandler
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import save_json,sha,read_pass
from fixtures import make_fixtures
from city_materials import city_candidates,assign

def prepare(job):
    output=Path(job['output']);scenes=make_fixtures(job)
    for window in bpy.context.window_manager.windows:window.scene=scenes[0]
    for scene in list(bpy.data.scenes):
        if scene not in scenes:bpy.data.scenes.remove(scene)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'fixtures.blend'),compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(Path(job['daylightRoot'])/'daylight_city.blend'),load_ui=False)
    print('AI566_CITY_OPEN',flush=True)
    scene=bpy.data.scenes[0]
    for window in bpy.context.window_manager.windows:window.scene=scene
    print('AI566_CITY_CONTEXT',flush=True)
    save_json(output/'city_materials.json',city_candidates(job));print('AI566_CITY_ADAPTERS',flush=True)
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output/'material_city.blend'),compress=True)

def raw(scene,file,signature,device):
    file.parent.mkdir(parents=True,exist_ok=True);receipt=file.with_suffix('.json')
    if file.exists() and receipt.exists():
        old=json.loads(receipt.read_text())
        if old['signature']==signature and old['sha256']==sha(file):return old
        raise RuntimeError('Immutable render input mismatch '+str(file))
    start=time.perf_counter();scene.cycles.device=device;scene.render.filepath=str(file.with_suffix('.partial.exr'));bpy.ops.render.render(write_still=True,scene=scene.name)
    import numpy as np
    if not np.isfinite(read_pass(scene.render.filepath)).all():raise RuntimeError('Nonfinite material transport')
    Path(scene.render.filepath).replace(file);result={'file':str(file),'signature':signature,'sha256':sha(file),'seconds':time.perf_counter()-start};save_json(receipt,result);print('AI566_RENDER='+file.stem,flush=True);return result

def render(job,device):
    output=Path(job['output']);records=[];signature={'experiment':sha(output/'experiment.json'),'fixtureScene':sha(output/'fixtures.blend'),'cityScene':sha(output/'material_city.blend')}
    bpy.ops.wm.open_mainfile(filepath=str(output/'fixtures.blend'),load_ui=False)
    for scene in sorted(bpy.data.scenes,key=lambda s:s.name):
        r=raw(scene,output/'renders/fixtures'/(scene.name+'.exr'),{**signature,'id':scene.name},device);records.append({**r,'kind':'fixture','id':scene.name});save_json(output/'render_progress.json',records)
    bpy.ops.wm.open_mainfile(filepath=str(output/'material_city.blend'),load_ui=False);scene=bpy.data.scenes[0]
    poses=job['inventory'];request=json.loads((output/'request.json').read_text());daylight=json.loads((Path(job['daylightRoot'])/'daylight.json').read_text())
    for variant in job['defaults']['cityVariants']:
        assign(scene,variant)
        for p in daylight['profiles']:
            scene.world=bpy.data.worlds[p['id']+'_combined']
            for pose in request['prepared']['poses']:
                scene.camera=bpy.data.objects[pose['id']]
                for layer in scene.view_layers:layer.use=layer.name==pose['id'];layer.material_override=None
                layer=scene.view_layers[pose['id']]
                for name in ['bus_shared_01_02','bus_03','bus_04','bus_05']:
                    if layer.layer_collection.children[name].exclude!=(name!=scene.camera['bus_id']):raise RuntimeError('Unrelated bus contaminates transport')
                d=job['daylightDefaults'];scene.render.resolution_x=d['width'];scene.render.resolution_y=d['height'];scene.render.resolution_percentage=100
                scene.cycles.samples=job['defaults']['samples'];scene.cycles.seed=d['seed'];scene.cycles.max_bounces=8;scene.cycles.use_denoising=True;scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.015
                scene.render.threads_mode='FIXED';scene.render.threads=job['defaults']['threads'];scene.render.image_settings.use_exr_interleave=True
                ident=p['id']+'_'+pose['id']+'_'+variant;r=raw(scene,output/'renders/city'/(ident+'.exr'),{**signature,'id':ident},device)
                records.append({**r,'kind':'city','id':ident,'profile':p['id'],'pose':pose['id'],'material':variant,'bus':scene.camera['bus_id']});save_json(output/'render_progress.json',records)
    save_json(output/'renders.json',records)

def main():
    job=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());start=time.perf_counter()
    trace=open(Path(job['output'])/(job['stage']+'_python_stack.log'),'w');faulthandler.dump_traceback_later(30,repeat=True,file=trace)
    if bpy.app.version[:3]!=(5,2,1):raise RuntimeError('Requires pinned Blender 5.2.1')
    devices=[]
    if job['device']=='OPTIX':
        p=bpy.context.preferences.addons['cycles'].preferences;p.compute_device_type='OPTIX';p.get_devices();devices=[d for d in p.devices if d.type=='OPTIX']
        if not devices:raise RuntimeError('OPTIX unavailable')
        for d in p.devices:d.use=d in devices
    elif job['device']!='CPU':raise RuntimeError('Unsupported device')
    if job['stage']=='prepare':prepare(job)
    elif job['stage']=='render':render(job,'GPU' if devices else 'CPU')
    else:raise RuntimeError('Unknown stage')
    save_json(Path(job['output'])/(job['stage']+'_blender_timing.json'),{'seconds':time.perf_counter()-start,'devices':[d.name for d in devices] or ['CPU'],'threads':job['defaults']['threads']})
    faulthandler.cancel_dump_traceback_later();trace.close()
    if not bpy.app.background:bpy.ops.wm.quit_blender()
if __name__=='__main__':main()
