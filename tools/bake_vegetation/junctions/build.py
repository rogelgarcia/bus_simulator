# Rebuilds only woody geometry in a saved photographic scene, retaining every leaf instance.
import json
import sys
import hashlib
from pathlib import Path
import bpy
import numpy as np

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'authoring'));sys.path.insert(0,str(HERE.parent/'surfaces'))
sys.path.insert(0,str(HERE.parent/'showcase'));sys.path.insert(0,str(HERE))
from woody_detail import detail_wood
from materials import bark_material
from form import grow_unions, ridge_relief
from cameras import add_union_views
from validation import check_stationary_cap


def foliage_signature():
    digest=hashlib.sha256()
    for obj in sorted(bpy.data.objects,key=lambda x:x.name):
        if obj.type!='MESH' or 'wood_paths' in obj: continue
        if not (obj.get('variant') or '_form_' in obj.name): continue
        digest.update(obj.name.encode());digest.update(np.array(obj.matrix_world,dtype=np.float32).tobytes())
        coordinates=np.empty(len(obj.data.vertices)*3,np.float32)
        obj.data.vertices.foreach_get('co',coordinates);digest.update(coordinates.tobytes())
    return digest.hexdigest()


def main(root,source,output,selection):
    check_stationary_cap()
    manifest=json.loads((source/'scene.json').read_text())
    recipes=json.loads((HERE.parent/'surfaces/recipes.json').read_text())
    known={row['species']+'/'+row['variant'] for row in manifest['inventory']}
    if selection!='all' and not set(selection.split(','))<=known:raise RuntimeError('Unknown specimen selection')
    bpy.ops.wm.open_mainfile(filepath=str(source/manifest['scene']))
    before=foliage_signature();updated=[]
    for record in manifest['inventory']:
        folder,variant_id=record['species'],record['variant']
        key=folder+'/'+variant_id
        if selection!='all' and key not in selection.split(','):continue
        recipe=json.loads((HERE.parent/folder/'recipe.json').read_text())
        variant=next(row for row in recipe['variants'] if row['id']==variant_id)
        settings=recipes[folder]
        maps={channel:source/'pbr'/folder/('bark_'+channel+'.png') for channel in ['color','roughness','height','normal']}
        material,surface=bark_material(key,maps,settings,variant['seed'])
        obj=next(obj for obj in bpy.data.collections[folder].objects if obj.get('variant')==variant_id and 'wood_paths' in obj)
        obj.data.materials.clear();obj.data.materials.append(material)
        recipe['woodyDetail']['reliefMetres']=settings['relief'];recipe['woodyDetail']['scarCount']=0
        detail=detail_wood(obj,variant,recipe,scanned_surface=surface,junction_builder=grow_unions,junction_surface=ridge_relief)
        record['woodyDetail']=detail;record['woodTriangles']=detail['barkTriangles'];updated.append(key)
        obj['junctionRevision']='anatomical-unions-v1'
        if variant_id=='mature_01':
            add_union_views(manifest,record,obj,recipe)
        print('[Branch unions] Rebuilt',key,detail['junctionCount'],'unions;',detail['barkTriangles'],'triangles',flush=True)
    after=foliage_signature()
    if before!=after:raise RuntimeError('Foliage geometry or transforms changed')
    manifest['junctionRevision']='anatomical-unions-v1';manifest['junctionModels']=updated
    manifest['foliageUnchanged']={'before':before,'after':after}
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(output/manifest['scene']),compress=True)
    (output/'scene.json').write_text(json.dumps(manifest,indent=2)+'\n')


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];main(Path(args[0]),Path(args[1]),Path(args[2]),args[3])
