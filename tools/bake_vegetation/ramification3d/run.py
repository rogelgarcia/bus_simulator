# Runs only through the registered bake leaf with isolated configuration and outputs.
import hashlib
import json
import sys
from pathlib import Path
HERE=Path(__file__).parent
for folder in [HERE.parent/'authoring',HERE.parent/'lod0',HERE.parent/'enhanced_reference',HERE]:sys.path.insert(0,str(folder))
import bpy
from mesh_adapter import build,inspect_saved
from render import render_views,setup,point_camera,bounds


def write(file,value):file.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')


o=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());folder=Path(o['folder']);graph=json.loads((folder/'graph.json').read_text())
if (folder/'tree.blend').exists():raise RuntimeError('Preserve the existing specimen')
for obj in list(bpy.context.scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1.
result=build(graph)
text=bpy.data.texts.new('Shared branching graph.json');text.write(json.dumps(graph,indent=1))
meta={'wood':result['wood'].name,'fine':result['fine'].name,'root':result['root'].name if result['root'] else None,'levels':[obj.name for obj in result['levels']],
      'subtree':result['subtree'].name,'fork':result['fork'].name,'subtreeId':result['subtreeId'],'threshold':result['threshold'],'voxel':result['voxel']}
meta['majorIds']=result['majorIds'];meta['forkSelection']=result['forkSelection'];meta['stemReview']=True
meta['meshes']=[meta['wood'],meta['fine'],*meta['levels'],meta['subtree'],meta['fork']]+([meta['root']] if meta['root'] else [])
camera=setup(o['width'],o['samples']);center,scale=bounds([result['wood'],result['fine']]);point_camera(camera,center,(1,-1,.16),scale)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=scale*1.5;area.spaces.active.region_3d.view_location=center
file=folder/'tree.blend';bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True)
bpy.ops.wm.open_mainfile(filepath=str(file));audit=inspect_saved(graph,meta);write(folder/'mesh-audit.json',audit)
if not audit['passed']:raise RuntimeError('Saved geometry failed validation: '+json.dumps(audit))
for obj in bpy.context.scene.objects:obj.select_set(obj.name in [meta['wood'],meta['fine'],meta['root']])
bpy.ops.export_scene.gltf(filepath=str(folder/'tree.glb'),export_format='GLB',use_selection=True,export_extras=True)
views=render_views(folder,graph,meta,o['width'],o['samples'])
write(folder/'model.json',{'species':graph['settings']['species'],'seed':graph['settings']['seed'],'sourceSha256':hashlib.sha256(file.read_bytes()).hexdigest(),
                          'graphAudit':graph['audit'],'meshAudit':audit,'metadata':meta,'views':views,'generator':graph['generator']})
print('[Ramification3D] Saved and reviewed '+str(folder),flush=True)
