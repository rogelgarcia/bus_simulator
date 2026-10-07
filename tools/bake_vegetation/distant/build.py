# Builds species-fitted crossed panels, normal-mapped view billboards and ten-tree cluster plates.
import hashlib
import json
import math
from pathlib import Path
import bpy
import numpy as np
from common import activate, clear_scene, triangles, write_json
from wood import pbr_material
from source import load_model, subset, transformed, trunk_mesh
from capture import panel, capture_tiles, serial_panel
from stem_bake import bake_stem
from leaf_bank import build_leaf_bank, apply_leaf_bank


def leaf_panels(parts,profile,level):
    leaves=[p for p in parts if p['leaf']];angles=[profile['reviewAzimuthDegrees']+a for a in [0,60,120]]
    if level==4:return [panel(leaves,angle,role='leaves') for angle in angles]
    outer=np.concatenate([p['points'].reshape((-1,3)) for p in leaves if p['outer']])
    low,high=outer.min(axis=0),outer.max(axis=0);seeds=np.array(profile['lod3CanopyClusters'])*(high-low)+low
    groups=[[] for _ in range(5)];panels=[]
    for part in leaves:
        centers=part['points'].mean(axis=1)
        nearest=np.argmin(np.linalg.norm((centers[:,None,:]-seeds[None,:,:])/(high-low)[None,None,:],axis=2),axis=1)
        for group in range(5):
            selected=nearest==group
            if selected.any():groups[group].append(subset(part,selected))
    for group,pieces in enumerate(groups):
        for axis,angle in enumerate(angles):
            tilt=profile['lod3PanelTiltDegrees']*[-1,.35,.8][(axis+group)%3]
            panels.append(panel(pieces,angle+group*7,tilt,role='leaves',cluster=group))
    return panels


def planes_object(name, panels, material, role):
    vertices, faces, uvs = [], [], []
    for item in panels:
        w,h=item['size']; base=len(vertices)
        points=np.array([[-w/2,-h/2,0],[w/2,-h/2,0],[w/2,h/2,0],[-w/2,h/2,0]])@item['basis'].T+item['center']
        vertices.extend(points.tolist()); faces.extend([(base,base+1,base+2),(base,base+2,base+3)])
        u0,v0,u1,v1=item['uv']; uvs.extend([(u0,v0),(u1,v0),(u1,v1),(u0,v0),(u1,v1),(u0,v1)])
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces)
    mesh.uv_layers.new().data.foreach_set('uv',np.array(uvs,np.float32).ravel()); mesh.materials.append(material)
    obj=bpy.data.objects.new(name,mesh); bpy.context.scene.collection.objects.link(obj); obj['surface']=role
    return obj


def material(images, role):
    value=pbr_material('Distant '+role,images,True); value.use_backface_culling=False
    return value


def export_model(options, species, model, level, parts, profile, source_records, records, tree_count=1, instances=None, bank=None):
    directory=Path(options['output'])/species; directory.mkdir(parents=True,exist_ok=True)
    texture_directory=directory/'textures'/f'{model}_lod{level}'
    points=np.concatenate([p['points'].reshape((-1,3)) for p in parts]); low,high=points.min(axis=0),points.max(axis=0)
    leaves=[p for p in parts if p['leaf']]; wood=[p for p in parts if not p['leaf']]
    angles=[profile['reviewAzimuthDegrees']+angle for angle in [0,60,120]]
    panels=[]; trunk=None; wood_panels=[]
    if level==3:
        if profile.get('lod3WoodMode')!='panels':
            trunk=trunk_mesh(parts,{**profile,'trunkSides':4},float(high[2]))
        panels=leaf_panels(parts,profile,3)
        # The coarse stem owns the lower trunk; overlapping trunk projections cast artificial seams.
        branch_parts=wood if trunk is None else [subset(p,p['points'][:,:,2].min(axis=1)>trunk[4]*.45) for p in wood]
        wood_panels=[panel(branch_parts,angle,role='wood') for angle in angles]; panels+=wood_panels
        tile=256
    elif level==4:
        panels=leaf_panels(parts,profile,4)+[panel(wood,angle,role='wood') for angle in angles]
        tile=256
    else:
        panels=[panel(parts,profile['reviewAzimuthDegrees']+a,e,role='mixed') for e in [-8,15] for a in range(0,360,45)]
        tile=options['billboard-tile'] if level==5 else options['cluster-tile']
    if level<=4:
        leaf_images=apply_leaf_bank(options,species,model,level,[p for p in panels if p['role']=='leaves'],bank)
        images=capture_tiles(options,[p for p in panels if p['role']=='wood'],texture_directory,tile,normal_filter=True,prefix='wood')
    else:images=capture_tiles(options,panels,texture_directory,tile,normal_filter=True)
    objects=[]
    for role in ['wood','leaves','mixed']:
        group=[p for p in panels if p['role']==role]
        if group:
            obj=planes_object(f'{model} / LOD{level} '+role,group[:1] if role=='mixed' else group,material(leaf_images if role=='leaves' else images,role),role)
            obj['lodLevel']=level; obj['treeCount']=tree_count
            if role=='mixed': obj['billboard']=True
            objects.append(obj)
    if trunk is not None:
        vertices,faces,uvs,source_material,_=trunk
        mesh=bpy.data.meshes.new('Connected coarse stem'); mesh.from_pydata(vertices.tolist(),[],faces)
        mesh.uv_layers.new().data.foreach_set('uv',uvs.astype(np.float32).ravel())
        mesh.polygons.foreach_set('use_smooth',[True]*len(mesh.polygons))
        obj=bpy.data.objects.new(f'{model} / LOD3 fitted stem',mesh); bpy.context.scene.collection.objects.link(obj)
        obj['surface']='wood'; obj['lodLevel']=3; objects.append(obj)
        bake_stem(options,parts,obj,texture_directory)
    counts={role:sum(triangles(obj.data) for obj in objects if obj.get('surface')==role) for role in ['wood','leaves','mixed']}
    glb=directory/f'{model}_lod{level}.glb'
    activate(objects[0],objects[1:])
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,
        export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',
        export_animations=False,export_cameras=False,export_lights=False)
    bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=str(directory/f'{model}_lod{level}.blend'),compress=True)
    row={'id':model,'level':level,'file':glb.name,'woodTriangles':counts['wood'],'leafTriangles':counts['leaves'],
         'mixedTriangles':counts['mixed'],'treeCount':tree_count,'trianglesPerTree':sum(counts.values())/tree_count,
         'sourceModels':source_records,'bounds':[low.tolist(),high.tolist()], 'views':[serial_panel(p) for p in panels],
         'instances':instances,'lightingBaked':False,'normalSpace':'Per-panel tangent XYZ; view basis stored in Blender Z-up coordinates',
         'billboardMode':'camera-facing with nearest azimuth/elevation tile' if level>=5 else 'fixed geometry',
         'sha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'bytes':glb.stat().st_size}
    if level<=4:row['leafCards']={'resolution':options['tile'],'uniquePerSpecies':bank['uniqueCards'],'placementsPerSpecies':bank['placements'],'sharedAcrossVariantsAndLevels':True}
    records[:]=[r for r in records if not(r['id']==model and r['level']==level)]+[row]
    write_json(directory/'index.json',{'schema':'bus-sim-vegetation-distant-v1','species':species,'models':records})
    for obj in objects: bpy.data.objects.remove(obj,do_unlink=True)
    print(f'[Distant] {species}/{model} LOD{level}: {counts}; {tree_count} represented trees',flush=True)


def build(options):
    root=Path(options['root'])
    for species in options['species']:
        profile=json.loads((root/'tools/bake_vegetation/distant/species'/f'{species}.json').read_text())
        manifest=Path(options['output'])/species/'index.json'
        records=json.loads(manifest.read_text())['models'] if manifest.exists() else []
        bank=build_leaf_bank(options,species,profile,leaf_panels) if any(l<=4 for l in options['levels']) else None
        for variant in options['variants']:
            for level in options['levels']:
                if level==6: continue
                clear_scene(); parts,record=load_model(options,species,variant)
                resolved={**profile,**profile.get('variants',{}).get(variant,{})}
                export_model(options,species,variant,level,parts,resolved,[record],records,bank=bank)
        if 6 not in options['levels']: continue
        for variant in options['variants']:
            cluster_index=int(variant[-2:])-1
            clear_scene(); sources={}; hashes=[]
            for name in ['mature_01','mature_02','mature_03']:
                sources[name],record=load_model(options,species,name,1); hashes.append(record)
            dimensions=np.ptp(np.concatenate([part['points'].reshape((-1,3)) for part in sources['mature_01']]),axis=0)
            spacing=max(dimensions[:2])*.5*profile['clusterSpacingRadiusFactor']
            rng=np.random.default_rng(profile['clusterSeed']+cluster_index*911)
            instances=[]; cluster=[]
            for i in range(10):
                angle=i*2.3999632297+rng.uniform(-.16,.16); radius=spacing*np.sqrt(i)*.72
                x,y=np.cos(angle)*radius,np.sin(angle)*radius
                position=np.array([x,y,.035*x+.045*y]); yaw=rng.uniform(0,np.pi*2); scale=rng.uniform(.92,1.08)
                name=f'mature_0{i%3+1}'; cluster+=transformed(sources[name],position,yaw,scale)
                instances.append({'variant':name,'position':position.tolist(),'yawDegrees':float(np.degrees(yaw)),'scale':float(scale)})
            base=min(p['points'][:,:,2].min() for p in cluster)
            for part in cluster: part['points'][:,:,2]-=base
            for instance in instances: instance['position'][2]-=float(base)
            export_model(options,species,f'cluster_0{cluster_index+1}',6,cluster,profile,hashes,records,10,instances)
