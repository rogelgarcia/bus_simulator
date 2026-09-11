"""Inspect the frozen scene and independently render finalists without editing original scenes."""
import sys,json,time
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'material_calibration'))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from city_materials import assign
from color_pipeline import save_json,sha

def main():
    args=sys.argv[sys.argv.index('--')+1:];root=Path(args[0]);stage=args[1];r=json.loads((root/'request.json').read_text());d=r['recipe'];start=time.perf_counter()
    if bpy.app.version[:3]!=(5,2,1):raise RuntimeError('Pinned Blender 5.2.1 required')
    bpy.ops.wm.open_mainfile(filepath=str(root/'calibration_city.blend'),load_ui=False);scene=bpy.data.scenes[0]
    poses=r['prepared']['poses'];cameras=[]
    for p in poses:
        c=bpy.data.objects[p['id']]
        if c['bus_id']!=p['busId']:raise RuntimeError('Camera/shared bus mismatch')
        layer=scene.view_layers[p['id']]
        for name in ['bus_shared_01_02','bus_03','bus_04','bus_05']:
            if layer.layer_collection.children[name].exclude!=(name!=p['busId']):raise RuntimeError('Unrelated bus affects reference transport')
        cameras.append({'id':c.name,'bus':c['bus_id'],'world':[list(row) for row in c.matrix_world],'lens':c.data.lens,'sensorWidth':c.data.sensor_width})
    if stage=='prepare':
        save_json(root/'scene.json',{'sourceSha256':sha(root/'calibration_city.blend'),'cameras':cameras,'materials':len(bpy.data.materials),'objects':len(scene.objects),'blender':bpy.app.version_string,'policy':'Frozen AI566 scene copied byte-for-byte. No source geometry/material changes. Shared bus exclusions checked per view.'})
    elif stage=='render':
        if r['device']=='OPTIX':
            prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices();devices=[d for d in prefs.devices if d.type=='OPTIX']
            if not devices:raise RuntimeError('Configured OPTIX device unavailable')
            for dev in prefs.devices:dev.use=dev in devices
        elif r['device']!='CPU':raise RuntimeError('Unsupported configured device')
        scene.cycles.device='GPU' if r['device']=='OPTIX' else 'CPU';scene.render.threads_mode='FIXED';scene.render.threads=d['threads'];scene.cycles.samples=d['samples'];scene.cycles.seed=d['seed'];scene.cycles.max_bounces=8
        scene.cycles.use_denoising=True;scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.01
        scene.render.resolution_x=d['width'];scene.render.resolution_y=d['height'];scene.render.resolution_percentage=100
        search=json.loads((root/'search.json').read_text());records=[];directory=root/'final_renders';directory.mkdir(exist_ok=True)
        signature={'scene':sha(root/'calibration_city.blend'),'search':sha(root/'search.json'),'script':sha(__file__),'samples':d['samples'],'seed':d['seed']}
        for c in search['finalists']:
            assign(scene,c['material']);scene.world=bpy.data.worlds[c['daylight']+'_combined']
            for p in poses:
                ident=c['id']+'_'+p['id'];file=directory/(ident+'.exr');metadata=directory/(ident+'.json');sig={**signature,'id':ident}
                if file.exists() and metadata.exists():
                    record=json.loads(metadata.read_text())
                    if record['signature']!=sig or record['sha256']!=sha(file):raise RuntimeError('Changed finalist cache')
                else:
                    scene.camera=bpy.data.objects[p['id']]
                    for layer in scene.view_layers:layer.use=layer.name==p['id'];layer.material_override=None
                    partial=file.with_suffix('.partial.exr');scene.render.filepath=str(partial);begin=time.perf_counter();bpy.ops.render.render(write_still=True,scene=scene.name);partial.replace(file)
                    record={'id':ident,'candidate':c['id'],'pose':p['id'],'bus':p['busId'],'daylight':c['daylight'],'material':c['material'],'exposureOffset':c['exposureOffset'],'file':str(file),'sha256':sha(file),'seconds':time.perf_counter()-begin,'signature':sig};save_json(metadata,record)
                records.append(record);save_json(root/'final_render_progress.json',records);print('AI567_FINAL='+ident,flush=True)
        save_json(root/'final_renders.json',records)
    else:raise RuntimeError('Unknown stage')
    save_json(root/(stage+'_blender_timing.json'),{'seconds':time.perf_counter()-start,'device':r['device'] if stage=='render' else 'scene inspection','threads':d['threads']})
    if not bpy.app.background:bpy.ops.wm.quit_blender()
if __name__=='__main__':main()
