# Preserves authenticated wood and leaf shells while replacing only reference shoot topology.
import hashlib
import ast
import json
import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Matrix,Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
from common import array,foliage_data,load_reference,write_json
from layout import grow,frame
from render import compare


def fingerprint(mesh):
    h=hashlib.sha256();h.update(array(mesh.vertices,'co',3).tobytes())
    h.update(array(mesh.loops,'vertex_index',dtype=np.int32).tobytes())
    for uv in mesh.uv_layers:h.update(array(uv.data,'uv',2).tobytes())
    return h.hexdigest()


def crowding(data):
    tree=KDTree(len(data['centers']))
    for i,point in enumerate(data['centers']):tree.insert(point,i)
    tree.balance();pairs=0;involved=set();maximum=float(np.max(data['widths']))
    for i,point in enumerate(data['centers']):
        for _,j,distance in tree.find_range(point,.35*(data['widths'][i]+maximum)):
            if j<=i:continue
            if distance<.35*(data['widths'][i]+data['widths'][j]) and abs(data['normals'][i]@data['normals'][j])>.8:
                pairs+=1;involved.add(i);involved.add(j)
    return {'closeParallelPairs':pairs,'affectedLeafFraction':len(involved)/len(data['centers']),'method':'Leaf centers within 0.35 times summed widths and absolute normal dot above 0.8; proxy only'}


def seat_roots(wood,original,data,stride):
    if np.max(np.abs(np.array(wood.matrix_world)-np.array(original.matrix_world)))>1e-5:raise RuntimeError('Reference coordinate frames differ')
    bpy.context.view_layer.update();surface=BVHTree.FromObject(wood,bpy.context.evaluated_depsgraph_get())
    source=ast.literal_eval(wood['wood_paths']);segments=[];radii=[]
    for path in source:
        segments.extend(zip(path['points'][:-1],path['points'][1:]));radii.extend(zip(path['radii'][:-1],path['radii'][1:]))
    segments=np.array(segments);radii=np.array(radii);vectors=segments[:,1]-segments[:,0];lengths=np.sum(vectors*vectors,axis=1)
    shifts=[];depths=[];caps=[];cache={};expected=[];anchors=data['origins'].copy()
    for root_index in range(0,len(data['origins']),stride):
        start=data['origins'][root_index].copy();key=tuple(np.round(start,6))
        if key not in cache:
            fractions=np.clip(np.sum((start-segments[:,0])*vectors,axis=1)/np.maximum(lengths,1e-12),0,1)
            centers=segments[:,0]+vectors*fractions[:,None];radius=radii[:,0]*(1-fractions)+radii[:,1]*fractions
            distances=np.linalg.norm(centers-start,axis=1)
            index=int(np.argmin(distances-radius));seated=centers[index]
            if distances[index]>.75:raise RuntimeError('Shoot root too far from accepted structural path')
            point,normal,_,depth=surface.find_nearest(Vector(seated))
            if point is None or depth>max(.2,float(radius[index])*2):raise RuntimeError('Retained supporting path differs from actual wood')
            cache[key]=(seated,float(distances[index]),float(depth),max(.0008,min(.012,float(radius[index])*.52)))
        point,shift,depth,cap=cache[key];data['origins'][root_index]=point;shifts.append(shift);depths.append(depth);caps.append(cap);expected.append(point)
    untouched=np.arange(len(anchors))%stride!=0
    if not np.array_equal(data['origins'][untouched],anchors[untouched]):raise RuntimeError('Root seating moved non-root leaf anchors')
    if not np.allclose(data['origins'][::stride],expected,atol=1e-6):raise RuntimeError('Root seating failed to update intended attachments')
    data['root_max_radius']=np.array(caps)
    return {'roots':len(shifts),'uniqueRoots':len(cache),'maximumShiftMetres':max(shifts),'medianShiftMetres':float(np.median(shifts)),
            'minimumSurfaceDistanceMetres':min(depths),'onlyRootsChanged':True,'attachmentsVerified':True,'method':'Nearest retained structural centerline; checked against actual wood surface, root buried to parent axis and radius bounded by support'}


def subset(original,ids,name):
    mesh=bpy.data.meshes.new(name);mesh.vertices.add(len(ids));mesh.vertices.foreach_set('co',array(original.data.vertices,'co',3)[ids].ravel())
    fields={'INT':('value',1,np.int32),'FLOAT_VECTOR':('vector',3,np.float32),'FLOAT_COLOR':('color',4,np.float32)}
    for attribute in original.data.attributes:
        if attribute.name.startswith('.') or attribute.name=='position' or attribute.data_type not in fields:continue
        field,columns,dtype=fields[attribute.data_type]
        mesh.attributes.new(attribute.name,attribute.data_type,'POINT').data.foreach_set(field,array(attribute.data,field,columns,dtype)[ids].ravel())
    mesh.update();obj=original.copy();obj.data=mesh;obj.name=name;bpy.context.scene.collection.objects.link(obj);obj.hide_render=True;obj.hide_set(False)
    return obj


def isolated(options,model,original,new,paths):
    species,variant=model.split('/')
    cameras=json.loads(Path(options['cameras']).read_text())
    target=np.array(next(r['camera']['target'] for r in cameras['renders'] if r['species']==species))-np.array(original.location)
    points=array(new.data.vertices,'co',3);groups=array(new.data.attributes['spray_id'].data,'value',dtype=np.int32)
    group=int(groups[np.argmin(np.linalg.norm(points-target,axis=1))]);ids=np.flatnonzero(groups==group)
    recipe=json.loads((Path(options['root'])/'tools/bake_vegetation'/species/'recipe.json').read_text());stride=recipe['texture']['leafCount']+2
    old=subset(original,np.arange(group*stride,(group+1)*stride),'Isolated original branchlet')
    revised=subset(new,ids,'Isolated natural branchlet')
    selected=[{'points':np.array(p['points']),'radii':np.array(p['radii']),'group':p['group']} for p in paths if p['group']==group]
    twig=twig_object('Isolated curved stems',selected,new.location,bpy.data.objects[model+'_form_08'].data.materials[0]);twig.hide_render=True
    centers=np.vstack([points[ids],*[p['points'] for p in selected]])+np.array(new.location)
    old_points=array(original.data.vertices,'co',3)[group*stride:(group+1)*stride]+np.array(original.location)
    centers=np.vstack([centers,old_points])
    low=centers.min(axis=0)-.12;high=centers.max(axis=0)+.12
    return [old,revised,twig],(low+high)/2,float(np.linalg.norm(high-low)*1.1)


def leaf_object(original,leaves):
    mesh=bpy.data.meshes.new('Natural shoot leaf anchors');mesh.vertices.add(len(leaves))
    mesh.vertices.foreach_set('co',np.array([leaf['origin'] for leaf in leaves],np.float32).ravel())
    matrices=np.array([leaf['matrix'] for leaf in leaves]);scales=np.linalg.norm(matrices,axis=1);rotations=matrices/scales[:,None,:]
    if np.max(np.abs(np.linalg.det(rotations)-1))>1e-5:raise RuntimeError('Invalid leaf frame')
    values=[('leaf_form','INT','value',np.array([leaf['form'] for leaf in leaves],np.int32)),
        ('leaf_scale','FLOAT_VECTOR','vector',scales),
        ('leaf_rotation','FLOAT_VECTOR','vector',np.array([tuple(Matrix(r.tolist()).to_euler()) for r in rotations])),
        ('leaf_tint','FLOAT_COLOR','color',np.column_stack([np.array([leaf['tint'] for leaf in leaves]),np.ones(len(leaves))])),
        ('shoot_id','INT','value',np.array([leaf['shoot'] for leaf in leaves],np.int32)),
        ('spray_id','INT','value',np.array([leaf['group'] for leaf in leaves],np.int32)),
        ('node_id','INT','value',np.array([leaf['node'] for leaf in leaves],np.int32))]
    for name,kind,field,data in values:mesh.attributes.new(name,kind,'POINT').data.foreach_set(field,data.ravel())
    mesh.update();obj=original.copy();obj.data=mesh;obj.name=original.name.replace('solid leaves','natural leaves')
    bpy.context.scene.collection.objects.link(obj);obj.hide_render=False;obj.hide_viewport=False;obj.hide_set(False)
    obj['foliageRevision']='natural-shoots-v1';return obj


def twig_object(name,paths,location,material):
    vertices=[];faces=[];uvs=[];sides=8
    for record in paths:
        points,radii=record['points'],record['radii'];offset=len(vertices)
        distance=np.r_[0,np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))]
        for i,point in enumerate(points):
            tangent=points[min(i+1,len(points)-1)]-points[max(0,i-1)];basis=frame(tangent)
            for j in range(sides):
                angle=j*math.tau/sides
                vertices.append(point+radii[i]*(basis[:,0]*math.cos(angle)+basis[:,2]*math.sin(angle)))
        for i in range(len(points)-1):
            for j in range(sides):
                k=(j+1)%sides;a=offset+i*sides;b=a+sides
                faces.append((a+j,b+j,b+k,a+k));uvs.extend([(j/sides,distance[i]*4),(j/sides,distance[i+1]*4),((j+1)/sides,distance[i+1]*4),((j+1)/sides,distance[i]*4)])
        faces.extend([tuple(offset+j for j in reversed(range(sides))),tuple(offset+(len(points)-1)*sides+j for j in range(sides))])
        uvs.extend([(.5,.5)]*sides*2)
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(material)
    mesh.uv_layers.new(name='UVMap').data.foreach_set('uv',np.asarray(uvs,np.float32).ravel())
    mesh.polygons.foreach_set('use_smooth',np.ones(len(faces),bool));mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);obj.location=location
    return obj


def run(options):
    output=Path(options['output']);summary={'revision':'natural-shoots-v1','sourceSha256':options['sourceSha256'],'models':[],'renders':[]}
    for model in options['models']:
        species,variant_id=model.split('/');directory=output/species/variant_id;directory.mkdir(parents=True,exist_ok=True)
        file=directory/'reference.blend';stats_file=directory/'model.json'
        if options['phase']=='render':
            stats=json.loads(stats_file.read_text())
            if hashlib.sha256(file.read_bytes()).hexdigest()!=stats['sha256']:raise RuntimeError('Staged reference changed')
            bpy.ops.wm.open_mainfile(filepath=str(file))
            wood=bpy.data.objects[model+' / original wood'];original=bpy.data.objects[model+' / solid leaves']
            new=bpy.data.objects[model+' / natural leaves'];twigs=bpy.data.objects[model+' / curved branchlets']
        else:
            if file.exists():raise RuntimeError('Preserve existing candidate: use a new output directory')
            bpy.ops.wm.read_factory_settings(use_empty=True)
            wood,original=load_reference({'source':options['source']},[model+' / original wood',model+' / solid leaves'])
            for obj in [wood,original]:obj.hide_render=False;obj.hide_viewport=False;obj.hide_set(False)
            before=fingerprint(wood.data);shells={str(i):fingerprint(bpy.data.objects[f'{model}_form_{i:02}'].data) for i in range(8)}
            recipe=json.loads((Path(options['root'])/'tools/bake_vegetation'/species/'recipe.json').read_text())
            variant=next(row for row in recipe['variants'] if row['id']==variant_id)
            data=foliage_data(original)
            root_stats=seat_roots(wood,original,data,recipe['texture']['leafCount']+2)
            retain=options['retainBySpecies'].get(species,options['retain'])
            leaves,paths,shoots,old,new_data,stats=grow(data,recipe,variant,retain)
            stats['requestedLeafRetention']=retain
            stats['rootSeating']=root_stats
            new=leaf_object(original,leaves)
            twigs=twig_object(model+' / curved branchlets',paths,original.location,bpy.data.objects[model+'_form_08'].data.materials[0])
            if fingerprint(wood.data)!=before or any(fingerprint(bpy.data.objects[f'{model}_form_{i:02}'].data)!=shells[str(i)] for i in range(8)):raise RuntimeError('Protected reference geometry changed')
            if not np.isfinite(new_data['centers']).all():raise RuntimeError('Invalid leaf positions')
            stats.update(id=model,woodFingerprint=before,leafShellFingerprints=shells,woodPreserved=True,leafShellsPreserved=True,
                sourceSha256=options['sourceSha256'],revision='natural-shoots-v1',position=list(original.location),
                limitations=['Local crowding proxy, not an exact triangle collision solver','Local space competition and sky-facing leaf frames, not a physiological light simulation','Variable shoot topology requires a later LOD bake adapter'])
            stats['crowdingBefore']=crowding(old);stats['crowdingAfter']=crowding(new_data)
            original.hide_render=True;original.hide_set(True)
            bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True)
            stats['sha256']=hashlib.sha256(file.read_bytes()).hexdigest();stats['file']=str(file.relative_to(output))
            write_json(stats_file,stats);write_json(directory/'shoots.json',{'shoots':shoots,'paths':[{'points':p['points'].tolist(),'radii':p['radii'].tolist(),'group':p['group']} for p in paths]})
            print(f'[Natural foliage] {model}: {stats["oldLeafCount"]} -> {stats["leafCount"]} leaves',flush=True)
        summary['models'].append(stats)
        if options['phase'] in ['all','render'] and variant_id=='mature_01':
            saved_paths=json.loads((directory/'shoots.json').read_text())['paths']
            hero=isolated(options,model,original,new,saved_paths)
            summary['renders'].extend(compare(options,model,wood,original,new,twigs,stats,hero))
        write_json(output/'summary.json',summary)
