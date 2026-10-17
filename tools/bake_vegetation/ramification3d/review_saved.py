# Refreshes junction diagnostics in authenticated copies without changing exported geometry.
import hashlib
import json
import sys
from pathlib import Path
HERE=Path(__file__).parent
for folder in [HERE.parent/'authoring',HERE.parent/'lod0',HERE.parent/'enhanced_reference',HERE]:sys.path.insert(0,str(folder))
import bpy
import numpy as np
from common import array
from mesh_adapter import adapt,inspect_saved
from fork_review import make_fork
from render import render_views


def write(file,value):file.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')


def geometry_identity(meta):
    digest=hashlib.sha256()
    for name in [meta['wood'],meta['fine'],meta['root']]:
        obj=bpy.data.objects[name];mesh=obj.data
        digest.update(array(mesh.vertices,'co',3).tobytes());digest.update(array(mesh.loops,'vertex_index',1,dtype=np.int32).tobytes())
        digest.update(json.dumps([list(row) for row in obj.matrix_world]).encode())
    return digest.hexdigest()


o=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());folder=Path(o['folder']);file=folder/'tree.blend'
graph=json.loads((folder/'graph.json').read_text());model=json.loads((folder/'model.json').read_text());meta=model['metadata']
if any(v['width']!=o['width'] or v['samples']!=o['samples'] for v in model['views']):raise RuntimeError('Review refresh must retain source render settings')
bpy.ops.wm.open_mainfile(filepath=str(file));before=geometry_identity(meta)
old_name=meta['fork'];old=bpy.data.objects[old_name];bpy.data.objects.remove(old,do_unlink=True)
fork,selection=make_fork(adapt(graph),bpy.data.objects[meta['wood']],meta['majorIds'])
for key in ['generator','species','seed']:fork[key]=graph[key] if key=='generator' else graph['settings'][key]
meta['fork']=fork.name;meta['meshes']=[fork.name if name==old_name else name for name in meta['meshes']];meta['forkSelection']=selection
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True);bpy.ops.wm.open_mainfile(filepath=str(file))
after=geometry_identity(meta)
if before!=after:raise RuntimeError('Diagnostic refresh changed visible geometry')
audit=inspect_saved(graph,meta)
if not audit['passed']:raise RuntimeError('Refreshed saved geometry failed validation: '+json.dumps(audit))
write(folder/'mesh-audit.json',audit)
views=render_views(folder,graph,meta,o['width'],o['samples'],only=['major_fork','isolated_fork']);by_name={v['view']:v for v in views}
model.update(sourceSha256=hashlib.sha256(file.read_bytes()).hexdigest(),meshAudit=audit,views=[by_name.get(v['view'],v) for v in model['views']],
             diagnosticRefresh={'visibleGeometryUnchanged':before==after,'geometrySha256':after,'rerenderedViews':list(by_name)})
write(folder/'model.json',model)
print('[Ramification3D] Reopened and refreshed diagnostics '+str(folder),flush=True)
