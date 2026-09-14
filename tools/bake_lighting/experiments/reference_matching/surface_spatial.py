"""Small authenticated wall charts: isolate batching and spatial sampling with full city transport."""
import sys,json,math,copy,time,gc
from pathlib import Path
import bpy,numpy as np
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE.parents[3]/'tools/receiver_lightmaps/blender'))
from transport_model import apply_source_world
from bake_surface import install_surface_targets,configure_surface_device,configure_surface_irradiance
from bake import open_verified_package,pixels
from batch_surface import batch_surface_targets
root=Path(sys.argv[sys.argv.index('--')+1]);r=json.loads((root/'request.json').read_text());job=json.loads((Path(r['bake'])/'job.json').read_text())
selection=json.loads((Path(r['processing'])/'analysis.json').read_text());ids={c['id'] for c in selection['charts']};instances={c['instanceId'] for c in selection['charts']}
charts=[]
with (Path(r['bake'])/'charts.ndjson').open() as stream:
    for line in stream:
        c=json.loads(line)
        if c['id'] in ids or (r['phase']=='refined' and c['instanceId'] in instances):charts.append(c)
if not ids.issubset({c['id'] for c in charts}):raise RuntimeError('Selected chart inventory changed')
bpy.ops.wm.open_mainfile(filepath=str(Path(r['nativeReference'])/'calibrated_city.blend'),load_ui=False)
scene=bpy.context.scene;bpy.context.window.view_layer=scene.view_layers['pose_04']
source={'file':str(Path(r['bake'])/'source.bsib'),'sha256':job['packageSha256']}
apply_source_world(source,root,True);bpy.ops.wm.save_as_mainfile(filepath=str(root/'source.blend'),compress=True)
records=[]
variants=[('native_all',.33,True),('adaptive_all',.33,True),('fine_all',.0825,True)] if r['phase']=='refined' else [('native_unjoined',.33,False),('native_joined',.33,True),('fine_joined',.165,True),('finer_joined',.0825,True)]
for variant,density,joined in variants:
    bpy.ops.wm.open_mainfile(filepath=str(root/'source.blend'),load_ui=False);scene=bpy.context.scene;bpy.context.window.view_layer=scene.view_layers['pose_04']
    configure_surface_device(scene,{'device':r['device']});configure_surface_irradiance(scene)
    scene.cycles.samples=512;scene.cycles.seed=553;scene.cycles.use_adaptive_sampling=False;scene.cycles.use_denoising=False;scene.cycles.use_animated_seed=False
    scene.cycles.diffuse_bounces=4;scene.cycles.max_bounces=8;scene.cycles.glossy_bounces=0;scene.cycles.transmission_bounces=4;scene.cycles.transparent_max_bounces=16
    scene.render.bake.use_pass_color=False;scene.render.bake.margin=2;scene.render.bake.margin_type='EXTEND';scene.render.bake.use_clear=True;scene.render.bake.use_selected_to_active=False
    local=copy.deepcopy(charts);x=0
    for c in local:
        span=[c['max'][i]-c['min'][i] for i in range(2)]
        spacing=[.0825 if variant=='adaptive_all' and c['area']>=4 and value<2 else density for value in span]
        c.update(x=x,y=0,page=0,texelsPerMeter=[max(2/span[i],1/spacing[i]) for i in range(2)])
        c['width']=math.ceil(span[0]*c['texelsPerMeter'][0])+5;c['height']=math.ceil(span[1]*c['texelsPerMeter'][1])+5;x+=c['width']
    size=2**math.ceil(math.log2(max(x,max(c['height'] for c in local))))
    if r['phase']=='refined':
        size=2**math.ceil(math.log2(max(max(max(c['width'],c['height']) for c in local),math.sqrt(sum(c['width']*c['height'] for c in local))*1.5)))
        while True:
            x=y=row_h=0
            for c in sorted(local,key=lambda c:-c['height']):
                if x+c['width']>size:y+=row_h;x=row_h=0
                c.update(x=x,y=y);x+=c['width'];row_h=max(row_h,c['height'])
            if y+row_h<=size:break
            size*=2
    image=bpy.data.images.new('AI571 wall '+variant,size,size,float_buffer=True);image.colorspace_settings.name='Non-Color'
    atlas={'charts':local,'profile':{'pageSize':size,'padding':2,'texelSizeMeters':density}}
    with open_verified_package(Path(source['file']),source['sha256']) as package:
        selected=install_surface_targets(package,atlas,[image])
        batch=batch_surface_targets(selected) if joined else {'sourceReceiverObjects':len(selected)}
    directory=root/variant;directory.mkdir();(directory/'atlas.json').write_text(json.dumps(atlas))
    sun=next(o for o in scene.objects if o.type=='LIGHT' and o.data.type=='SUN')
    for name,direct,indirect,visible in [('sky',True,False,False),('bounce',False,True,True)]:
        sun.hide_render=not visible;scene.render.bake.use_pass_direct=direct;scene.render.bake.use_pass_indirect=indirect
        start=time.perf_counter();bpy.ops.object.bake(type='DIFFUSE',uv_layer='AI533_Bake');np.save(directory/(name+'.npy'),pixels([image])[0]);seconds=time.perf_counter()-start
        records.append({'variant':variant,'source':name,'seconds':seconds,'densityMeters':density,'pageSize':size,'chartPixels':sum(c['width']*c['height'] for c in local),'batch':batch})
        (root/'renders.json').write_text(json.dumps(records,indent=2));print(json.dumps(records[-1]),flush=True)
    del selected,image;gc.collect()
