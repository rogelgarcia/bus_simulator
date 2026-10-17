# Finishes authenticated saved specimens with continuous roots and embedded species PBR.
import hashlib
import json
import sys
from pathlib import Path
HERE=Path(__file__).parent
for folder in [HERE.parent/'authoring',HERE.parent/'lod0',HERE.parent/'enhanced_reference',HERE]:sys.path.insert(0,str(folder))
import bpy
import numpy as np
from common import array
from mesh_adapter import inspect_saved
from pbr import bark,apply_wood,audit_materials
from root_surfaces import build_roots,audit_roots
from render import render_views,point_camera,bounds


def write(file,value):file.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')


def shoot_identity(meta):
    digest=hashlib.sha256()
    for name in [meta['wood'],meta['fine']]:
        obj=bpy.data.objects[name];mesh=obj.data;digest.update(array(mesh.vertices,'co',3).tobytes());digest.update(array(mesh.loops,'vertex_index',1,dtype=np.int32).tobytes())
        digest.update(json.dumps([list(row) for row in obj.matrix_world]).encode())
    return digest.hexdigest()


o=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());folder=Path(o['folder']);file=folder/'tree.blend'
graph=json.loads((folder/'graph.json').read_text());model=json.loads((folder/'model.json').read_text());meta=model['metadata']
bpy.ops.wm.open_mainfile(filepath=str(file));before=shoot_identity(meta)
material,material_metadata=bark(Path(o['materials']),graph['settings']['species']);tile=material_metadata['physical_size_m']['width']
apply_wood(graph,meta,material,tile)
old=meta['root'];bpy.data.objects.remove(bpy.data.objects[old],do_unlink=True)
root,root_receipt=build_roots(graph,material,tile);meta['root']=root.name;meta['meshes']=[root.name if name==old else name for name in meta['meshes']]
for key in ['generator','species','seed']:root[key]=graph[key] if key=='generator' else graph['settings'][key]
meta['surfaceFinish']={'tileMetres':tile,'roots':root_receipt,'catalogMaterial':material['catalogMaterial']}
scene=bpy.context.scene;scene.render.resolution_x=o['width'];scene.render.resolution_y=o['width'];scene.eevee.taa_render_samples=o['samples']
scene.render.threads_mode='FIXED';scene.render.threads=2
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.3
data=bpy.data.lights.new('Surface review / sun','SUN');data.energy=2.;data.angle=.25
sun=bpy.data.objects.new(data.name,data);scene.collection.objects.link(sun);sun.rotation_euler=(.55,-.45,-.6)
center,scale=bounds([bpy.data.objects[meta['wood']],bpy.data.objects[meta['fine']],root]);point_camera(bpy.data.objects['Review camera'],center,(1,-1,.16),scale)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True);bpy.ops.wm.open_mainfile(filepath=str(file))
after=shoot_identity(meta)
if before!=after:raise RuntimeError('Surface finish changed shoot geometry')
audit=inspect_saved(graph,meta);surface_audit=audit_materials(meta);root_audit=audit_roots(graph,bpy.data.objects[meta['root']],root_receipt)
audit.update(materials=surface_audit,roots=root_audit);audit['passed']=audit['passed'] and surface_audit['passed'] and root_audit['passed']
write(folder/'mesh-audit.json',audit)
if not audit['passed']:raise RuntimeError('Finished saved model failed: '+json.dumps(audit))
for obj in bpy.context.scene.objects:obj.select_set(obj.name in [meta['wood'],meta['fine'],meta['root']])
export_objects=list(bpy.context.selected_objects)
for obj in export_objects:obj.modifiers.new('Export only / tangent triangulation','TRIANGULATE')
bpy.ops.export_scene.gltf(filepath=str(folder/'tree.glb'),export_format='GLB',use_selection=True,export_extras=True,export_tangents=True,export_apply=True)
for obj in export_objects:obj.modifiers.remove(obj.modifiers['Export only / tangent triangulation'])
views=render_views(folder,graph,meta,o['width'],o['samples'])
model.pop('diagnosticRefresh',None)
model.update(sourceSha256=hashlib.sha256(file.read_bytes()).hexdigest(),meshAudit=audit,views=views,
             surfaceFinish={'shootGeometryUnchanged':before==after,'shootGeometrySha256':after,'rootSurfaces':root_receipt,'material':surface_audit})
write(folder/'model.json',model)
print('[Ramification3D] Root and PBR finish complete '+str(folder),flush=True)
