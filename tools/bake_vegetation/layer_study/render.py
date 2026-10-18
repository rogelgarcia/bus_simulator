# Captures exact saved enhanced references with matching Z-up orthographic calibration.
import hashlib
import json
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector, Euler
from bpy_extras.object_utils import world_to_camera_view

HERE=Path(__file__).parent
for folder in [HERE.parent/'lod0',HERE.parent/'enhanced_reference']:sys.path.insert(0,str(folder))
from render import load,setup
from common import array,foliage_data,write_json

o=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
m=o['model'];directory=Path(o['output'])/m['id'];directory.mkdir(parents=True,exist_ok=True)
record_path=directory/'study.json'
if record_path.exists():
    row=json.loads(record_path.read_text())
    if row['identity']!=o['identity']:raise RuntimeError('Different retained study identity')
    print('[Layer study] Reuse '+m['id'],flush=True);sys.exit(0)
bpy.ops.wm.read_factory_settings(use_empty=True)
objects=load(m['file'],[m['id']+' / enhanced '+role for role in ['leaves','wood','branchlets']])
offset=objects[0].location.copy()
for obj in objects:obj.location-=offset
data=foliage_data(objects[0]);mesh=objects[0].data
if 'blade_center' in mesh.attributes:centers=array(mesh.attributes['blade_center'].data,'vector',3)
else:
    matrices=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in data['rotations']])*data['scales'][:,None,:]
    centers=data['origins']+matrices[:,:,1]*.52
if len(centers)!=m['leafCount'] or not np.isfinite(centers).all():raise RuntimeError('Invalid leaf centers')
low,high=np.quantile(centers,[.005,.995],axis=0);center=(low+high)*.5
radii=np.maximum((high-low)*.5,.05);distance=np.linalg.norm((centers-center)/radii,axis=1)
radii*=np.quantile(distance,.99)*1.025
layers=[{'id':key,'radii':np.round(radii*scale,5).tolist(),'strategy':None} for key,scale in [('inner',.46),('middle',.73),('outer',1.)]]
lower=np.minimum(centers.min(axis=0)-.4,[0,0,-.1]);upper=centers.max(axis=0)+.4
target=(lower+upper)*.5;span=float(max(upper-lower)*1.30)
scene,camera=setup(o);camera.data.ortho_scale=span;camera.data.type='ORTHO'
views=[]
for name,offset,right in [('front',[0,-50,0],[1,0,0]),('right',[50,0,0],[0,1,0]),('back',[0,50,0],[-1,0,0]),('left',[-50,0,0],[0,-1,0])]:
    camera.location=Vector(target)+Vector(offset);camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
    image=directory/(name+'.png')
    if image.exists():raise RuntimeError('Unverified previous image; preserve and choose new staging')
    scene.render.filepath=str(image);bpy.ops.render.render(write_still=True)
    landmarks=[]
    for point in [center,center+np.array([1,0,0]),center+np.array([0,1,0]),center+np.array([0,0,1])]:
        screen=world_to_camera_view(scene,camera,Vector(point));landmarks.append({'world':point.tolist(),'uv':[screen.x,1-screen.y]})
    views.append({'id':name,'file':str(image.relative_to(o['output'])).replace('\\','/'),'sha256':hashlib.sha256(image.read_bytes()).hexdigest(),
        'target':target.tolist(),'right':right,'up':[0,0,1],'span':span,'landmarks':landmarks})
    print('[Layer study] Rendered '+m['id']+'/'+name,flush=True)
points=directory/'leaf-centers.bin';centers.astype('<f4').tofile(points)
write_json(record_path,{'id':m['id'],'name':m['name'],'botanical':m['botanical'],'identity':o['identity'],
    'source':{'summary':m['summary'],'file':str(Path(m['file']).relative_to(o['root'])).replace('\\','/'),'sha256':m['sha256'],'revision':m['revision']},
    'leafCount':len(centers),'bounds':{'min':lower.tolist(),'max':upper.tolist()},'preset':{'center':np.round(center,5).tolist(),'layers':layers},
    'leafCenters':{'file':str(points.relative_to(o['output'])).replace('\\','/'),'sha256':hashlib.sha256(points.read_bytes()).hexdigest(),'encoding':'float32-le-xyz','kind':'blade-center' if 'blade_center' in mesh.attributes else 'estimated-blade-center'},
    'engine':scene.render.engine,'views':views})
