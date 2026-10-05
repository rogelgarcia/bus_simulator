# Revises detailed trunk curvature and photographic crevice depth in a separate review scene.
import ast
import json
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

HERE=Path(__file__).resolve().parent
for folder in ['authoring','surfaces','showcase','junctions']:sys.path.insert(0,str(HERE.parent/folder))
sys.path.insert(0,str(HERE))
from deformation import GrowthField
from relief import prepare_height,plane_surface,lock_projection
from foliage import transport
from woody_detail import detail_wood
from form import grow_unions,ridge_relief
from cameras import add_union_views
from validation import check_stationary_cap
from review_views import add_growth_views


def mesh_points(mesh,attribute='co'):
    values=np.empty(len(mesh.vertices)*3,np.float32);mesh.vertices.foreach_get(attribute,values);return values.reshape(-1,3)


def validate_bend(mesh,before,after):
    if not np.isfinite(after).all():raise RuntimeError('Non-finite growth geometry')
    mesh.calc_loop_triangles();ids=np.empty(len(mesh.loop_triangles)*3,np.int32);mesh.loop_triangles.foreach_get('vertices',ids);ids=ids.reshape(-1,3)
    for start in range(0,len(ids),64000):
        a=before[ids[start:start+64000]].astype(np.float64);b=after[ids[start:start+64000]].astype(np.float64)
        na=np.cross(a[:,1]-a[:,0],a[:,2]-a[:,0]);nb=np.cross(b[:,1]-b[:,0],b[:,2]-b[:,0])
        if np.any((na*nb).sum(axis=1)<-1e-20):raise RuntimeError('Growth deformation reversed face orientation')
    grounded=np.abs(before[:,2])<1e-7
    if not np.array_equal(before[grounded],after[grounded]):raise RuntimeError('Growth moved the root plane')


def main(root,source,output,selection):
    check_stationary_cap();manifest=json.loads((source/'scene.json').read_text())
    profiles=json.loads((HERE/'profiles.json').read_text());surfaces=json.loads((HERE.parent/'surfaces/recipes.json').read_text())
    known={r['species']+'/'+r['variant'] for r in manifest['inventory']}
    if selection!='all' and not set(selection.split(','))<=known:raise RuntimeError('Unknown model selection')
    bpy.ops.wm.open_mainfile(filepath=str(source/manifest['scene']));prepare_height(root,output);updated=[]
    for record in manifest['inventory']:
        folder,variant_id=record['species'],record['variant'];key=folder+'/'+variant_id
        if selection!='all' and key not in selection.split(','):continue
        recipe=json.loads((HERE.parent/folder/'recipe.json').read_text());variant=next(v for v in recipe['variants'] if v['id']==variant_id)
        collection=bpy.data.collections[folder];wood=next(o for o in collection.objects if o.get('variant')==variant_id and 'wood_paths' in o)
        foliage=next(o for o in collection.objects if o.get('variant')==variant_id and o.type=='MESH' and 'leaf_rotation' in o.data.attributes)
        if folder=='london_plane':
            material,surface=plane_surface(output,surfaces[folder],variant)
            wood.data.materials.clear();wood.data.materials.append(material)
            recipe['woodyDetail'].update({'voxelSizeMetres':.0075,'reliefMetres':.028,'scarCount':0})
            record['woodyDetail']=detail_wood(wood,variant,recipe,scanned_surface=surface,junction_builder=grow_unions,junction_surface=ridge_relief)
            record['woodTriangles']=record['woodyDetail']['barkTriangles']
        field=GrowthField(profiles[folder],variant);before=mesh_points(wood.data);normals=mesh_points(wood.data,'normal')
        lock_projection(wood,before,normals);after=field(before).astype(np.float32);validate_bend(wood.data,before,after)
        wood.data.vertices.foreach_set('co',after.ravel());wood.data.update()
        paths=ast.literal_eval(wood['wood_paths'])
        for path in paths:path['points']=field(np.array(path['points'])).tolist()
        wood['wood_paths']=repr(paths);wood['growthRevision']='species-growth-v1'
        for union in record['woodyDetail']['junctions']:
            origin=np.array(union['origin']);j=field.jacobian(origin[None,:])[0]
            union['origin']=field(origin[None,:])[0].tolist()
            for vector in ['axis','direction']:
                direction=j@np.array(union[vector]);union[vector]=(direction/np.linalg.norm(direction)).tolist()
        record['growth']={**field.describe(),'canopy':transport(foliage,field),'meshVertices':len(after),
                          'closedTopologyRetained':True,'faceOrientationValidated':True,'barkRestCoordinates':True}
        if variant_id=='mature_01':
            location=np.array(wood.location)
            for view in manifest['views']:
                if view.get('species')!=folder or view.get('variant')!=variant_id or view.get('study') or 'junction_' in view['id']:continue
                old_target=np.array(view['target']);new_target=field((old_target-location)[None,:])[0]+location
                delta=new_target-old_target;view['target']=new_target.tolist();view['position']=(np.array(view['position'])+delta).tolist()
                obj=bpy.data.objects[view['id']];obj.location=view['position'];obj.rotation_euler=(Vector(view['target'])-obj.location).to_track_quat('-Z','Y').to_euler()
            add_union_views(manifest,record,wood,recipe)
            add_growth_views(manifest,record,wood,after,field,variant)
        updated.append(key);print('[Trunk growth]',key,record['growth']['axisDeviationFromChordMetres'],'metres sweep; geometry and canopy validated',flush=True)
    manifest['growthRevision']='species-growth-v1';manifest['growthModels']=updated
    manifest['priorFoliageContract']=manifest.pop('foliageUnchanged',None);manifest.pop('cameraGeometryUnchanged',None)
    manifest['canopyContract']='Leaf templates, count, scale and tints retained; anchors and orientations transported with deformed wood'
    bpy.context.scene['sourceContract']='Species growth review: curved wood and transported foliage, calibrated photographic bark relief; detailed authoring source, production assets unchanged.'
    bpy.context.scene['views']=json.dumps(manifest['views']);bpy.context.scene.timeline_markers.clear()
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output/manifest['scene']),compress=True)
    (output/'scene.json').write_text(json.dumps(manifest,indent=2)+'\n')


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];main(Path(args[0]),Path(args[1]),Path(args[2]),args[3])
