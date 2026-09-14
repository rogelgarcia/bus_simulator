"""Unoccluded dielectric roughness/view-angle grid under white and calibrated sky."""
import sys,json,math
from pathlib import Path
import bpy
import numpy as np
import OpenImageIO as oiio
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'daylight_calibration'))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from sky import world,sample_scene
from daylight_math import directions
from specular_integral import integrate
from afternoon_render import render
from color_pipeline import read_pass,save_json,Y

root=Path(sys.argv[sys.argv.index('--')+1]);r=json.loads((root/'request.json').read_text());bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=r['samples'];scene.cycles.seed=r['seed'];scene.cycles.use_denoising=False;scene.cycles.use_adaptive_sampling=False
scene.cycles.sample_clamp_direct=0;scene.cycles.sample_clamp_indirect=0;scene.cycles.max_bounces=8
scene.render.threads_mode='FIXED';scene.render.threads=4
if r['device']=='OPTIX':
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    devices=[d for d in prefs.devices if d.type=='OPTIX']
    if not devices:raise RuntimeError('OPTIX unavailable')
    for d in prefs.devices:d.use=d in devices
device='GPU' if r['device']=='OPTIX' else 'CPU';cols=len(r['roughness']);rows=len(r['noV']);size=r['cellSize']
scene.render.resolution_x=cols*size;scene.render.resolution_y=rows*size;scene.render.resolution_percentage=100;scene.render.filter_size=.01
scene.render.image_settings.media_type='MULTI_LAYER_IMAGE';scene.render.image_settings.file_format='OPEN_EXR_MULTILAYER';scene.render.image_settings.color_depth='32';scene.view_layers[0].name='Fixture'
def basis(x,y,z):return (x,-z,y)
for row,n in enumerate(r['noV']):
    for col,roughness in enumerate(r['roughness']):
        x=(col-(cols-1)/2)*2;y=((rows-1)/2-row)*2;s=math.sqrt(1-n*n)
        vertices=[basis(x+u,y+v,-u*s/n) for u,v in [(-.7,-.7),(.7,-.7),(.7,.7),(-.7,.7)]]
        mesh=bpy.data.meshes.new('plane');mesh.from_pydata(vertices,[],[(0,1,2,3)]);mesh.update()
        obj=bpy.data.objects.new(f'{row}_{col}',mesh);scene.collection.objects.link(obj);obj.visible_glossy=False;obj.visible_shadow=False
        mat=bpy.data.materials.new('dielectric');mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value=(0,0,0,1);bsdf.inputs['Roughness'].default_value=roughness;bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['IOR'].default_value=1.5;bsdf.inputs['Specular IOR Level'].default_value=.5
        mesh.materials.append(mat)
cam=bpy.data.objects.new('camera',bpy.data.cameras.new('camera'));scene.collection.objects.link(cam);cam.location=basis(0,0,100);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.sensor_fit='VERTICAL';cam.data.ortho_scale=rows*2;cam.data.clip_end=300;scene.camera=cam
game=json.loads((root/'game.json').read_text());results=[]
bpy.context.view_layer.update()
for index,check in enumerate(game['geometryChecks']):
    row,col=divmod(index,cols)
    if abs(check['noV']-r['noV'][row])>1e-6:raise RuntimeError('Wrong native NoV')
    expected=[(2*col+1-cols)/cols,(rows-2*row-1)/rows]
    if np.max(np.abs(np.array(check['projectedCenter'][:2])-expected))>1e-6:raise RuntimeError('Wrong native cell projection')
    obj=bpy.data.objects[f'{row}_{col}'];normal=obj.data.polygons[0].normal
    if abs(-normal.y-r['noV'][row])>1e-6:raise RuntimeError('Wrong Cycles NoV')
from bpy_extras.object_utils import world_to_camera_view
for row in range(rows):
    for col in range(cols):
        point=world_to_camera_view(scene,cam,Vector(basis((col-(cols-1)/2)*2,((rows-1)/2-row)*2,0)))
        # Blender's float camera matrix has about 1e-6 normalized projection error
        # at this distance; 1e-5 is still below .006 pixel, far inside the sensor.
        if max(abs(point.x-(col+.5)/cols),abs(point.y-(1-(row+.5)/rows)))>1e-5:raise RuntimeError(f'Wrong Cycles cell projection row={row} col={col} actual={tuple(point)}')
for key in r['worlds']:
    if key=='white':
        scene.world=bpy.data.worlds.new('White');scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(1,1,1,1);bg.inputs['Strength'].default_value=1
    else:scene.world=world(r['defaults'],r['defaults']['profiles'][0],'sky')
    raw=render(scene,root/(key+'.exr'),device,'Fixture');data=read_pass(raw['file'],layer='Fixture');cells=[]
    native=next(x for x in game['results'] if x['world']==key)['cells']
    for row,n in enumerate(r['noV']):
        for col,roughness in enumerate(r['roughness']):
            rgb=data[row*size+24:row*size+40,col*size+24:col*size+40].mean(axis=(0,1));g=np.array(native[row*cols+col]['rgb'])
            cells.append({'roughness':roughness,'noV':n,'game':g.tolist(),'cycles':rgb.tolist(),'ratio':float((g@Y)/(rgb@Y))})
    results.append({'world':key,'render':raw,'cells':cells});print(json.dumps({'world':key,'ratios':[round(x['ratio'],4) for x in cells]}),flush=True)
save_json(root/'analysis.json',{'results':results,'policy':r['policy']})
bpy.ops.wm.save_as_mainfile(filepath=str(root/'fixture.blend'),compress=True)
source=oiio.ImageInput.open(r['hdrFile']);hdr=source.read_image(format=oiio.FLOAT)[:,:,:3];source.close()
h,w=hdr.shape[:2]
sample=sample_scene(r['defaults'],r['defaults']['profiles'][0],'sky',directions(w,h))
sample.camera.data.sensor_fit='HORIZONTAL'
raw=render(sample,root/'analytic_sky.exr',device,'Daylight');analytic=read_pass(raw['file'],layer='Daylight')
relative=np.abs(hdr-analytic)/np.maximum(analytic,.01)
source_check={'meanRelative':float(relative.mean()),'p99Relative':float(np.percentile(relative,99)),'meanYRatio':float(np.mean(hdr@Y)/np.mean(analytic@Y))}
if source_check['p99Relative']>.035:raise RuntimeError('Analytic / HDR sky mismatch: '+str(source_check))
integrals=[]
for row,n in enumerate(r['noV']):
    for col,rough in enumerate(r['roughness']):
        fine=integrate(rough,n,hdr);coarse=integrate(rough,n,hdr,16384)
        integrals.append({'roughness':rough,'noV':n,'samples':65536,'fine':fine,'coarse':coarse})
white,sky=results
convergence=[];cycles_angular=[];native_angular=[]
for index,cell in enumerate(integrals):
    fine,coarse=cell['fine']['exact'],cell['coarse']['exact']
    convergence.append(abs((np.array(fine['sky'])@Y)/(np.array(coarse['sky'])@Y)-1))
    def angular(renderer,integral):
        sky_y=np.array(sky['cells'][index][renderer])@Y;white_y=np.array(white['cells'][index][renderer])@Y
        return float((sky_y/white_y)/((np.array(integral['sky'])@Y)/integral['white']))
    cell['cyclesAngularToExact']=angular('cycles',fine)
    key='prototypeAngularToExact' if r.get('referenceWhiteCells') else 'nativeAngularToSchlick'
    cell[key]=angular('game',cell['fine']['exact' if r.get('referenceWhiteCells') else 'schlick'])
    cycles_angular.append(abs(cell['cyclesAngularToExact']-1));native_angular.append(abs(cell[key]-1))
checks={'maxQuadratureRelativeChange':max(convergence),'maxCyclesAngularRelativeError':max(cycles_angular),'maxEvaluatedAngularRelativeError':max(native_angular),
        'evaluatedFresnelReference':'exact' if r.get('referenceWhiteCells') else 'schlick',
        'projectionToleranceNormalized':1e-5,'sourceQuantizationP99Tolerance':.035,'quadratureTolerance':.005,'cyclesAngularTolerance':.04}
# Engineering validation limits, not a photorealism score. The angular budget
# includes RGBE source quantization (.035), finite sky sampling and render noise.
if max(convergence)>.005 or max(cycles_angular)>.04:raise RuntimeError('Independent integral did not validate: '+str(checks))
if abs(integrals[0]['fine']['exact']['white']-.04)>1e-5:raise RuntimeError('Normal-incidence Fresnel anchor failed')
save_json(root/'quadrature.json',{'sourceCheck':source_check,'checks':checks,'cells':integrals,'policy':'Independent single-scatter visible GGX integral. Exact dielectric versus Schlick; normalized sky/white isolates angular filtering. The optional prototype uses fitted white energy, separately held-out sky and exact Fresnel. No production shader change.'})
print(json.dumps({'skySourceCheck':source_check}),flush=True)
