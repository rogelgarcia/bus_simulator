# Fuses major limbs and root flares, preserving lengthwise bark UVs by surface transfer.
import math
import bpy
import numpy as np
from mathutils import Vector
from architecture import unit,curve
from common import activate,array
from junctions import shoulders,uv_offsets,flow_surfaces,relax_forks
from bark_flow import blend_junction_uv
from root_growth import radial_flare


def continuous_growth(p):
    return p.get('growth',{}).get('architecture') in ['distributed-plane','conical-linden']


def check_bounds(obj,paths,stage):
    points=np.vstack([p['points'] for p in paths]);margin=max(float(max(p['radii'])) for p in paths)*2+.5
    co=array(obj.data.vertices,'co',3)
    if not np.isfinite(co).all() or (co.min(axis=0)<points.min(axis=0)-margin).any() or (co.max(axis=0)>points.max(axis=0)+margin).any():
        raise RuntimeError(stage+' produced invalid wood bounds: '+str((co.min(axis=0).tolist(),co.max(axis=0).tolist())))
    print('[Enhanced] Bounded wood '+stage,flush=True)


def roots(paths,p,rng):
    if continuous_growth(p):
        from root_growth import root_crown
        root_crown(paths,rng);return
    for parent in [i for i,path in enumerate(paths) if path['basal']]:
        origin=paths[parent]['points'][0].copy();radius=float(paths[parent]['radii'][0]);shrub=p['habit']=='shrub'
        for i in range(4 if shrub else 7):
            angle=i*2.399963+rng.uniform(-.35,.35);out=np.array([math.cos(angle),math.sin(angle),0.])
            start=origin+[0,0,radius*.8];end=origin+out*radius*rng.uniform(2.5,4.4);end[2]=-.06 if not shrub else -.025
            root=curve(start,end,radius*rng.uniform(.24,.45),rng,parent,bend=[0,0,-radius*.25],steps=9,tip=.002);root['root']=True;paths.append(root)


def check_bole_width(obj,paths,voxel,full_bole=False):
    bole=paths[0];co=array(obj.data.vertices,'co',3);base=float(bole['radii'][0]);ratios=[]
    heights=np.linspace(base*1.8,bole['points'][-1,2]-base*.5,14) if full_bole else bole['points'][-1,2]-base*np.array([.5,1.1,1.8])
    sections=[]
    for z in heights:
        center=np.array([np.interp(z,bole['points'][:,2],bole['points'][:,k]) for k in range(2)])
        radius=np.interp(z,bole['points'][:,2],bole['radii']);ring=co[abs(co[:,2]-z)<voxel*1.5]
        if len(ring)<12:raise RuntimeError('Missing bole cross section')
        ratio=float(np.quantile(np.linalg.norm(ring[:,:2]-center,axis=1),.05)/radius);ratios.append(ratio)
        if ratio<.88:raise RuntimeError('Meshing pinched the bole below its first fork: '+str(ratio))
        sections.append({'height':float(z),'center':center.tolist(),'radius':float(radius),'slab':voxel*1.5,'minimumRadiusRatio':ratio})
    if full_bole:
        import json
        obj['boleSections']=json.dumps(sections)
    obj['boleMinimumRadiusRatios']=ratios;print('[Enhanced] Bole width retained '+str(ratios),flush=True)


def mesh_paths(name,paths,material,tile,rng,major=False):
    vertices=[];faces=[];uv=[]
    for path in paths:
        points=path['points'];radii=path['radii'];sides=32 if major else (10 if max(radii)>.01 else 6);offset=len(vertices)
        arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))]+path.get('uvOffset',0);overall=unit(points[-1]-points[0]);reference=np.array([0.,0,1]) if abs(overall[2])<.9 else np.array([1.,0,0]);previous=None
        repeat=max(.025,math.tau*max(radii)/tile);phase=path['phase'];flared=path['basal'];phases=rng.uniform(-math.pi,math.pi,3)
        for j,(pt,radius) in enumerate(zip(points,radii)):
            direction=unit(points[min(j+1,len(points)-1)]-points[max(0,j-1)]);side=unit(np.cross(direction,reference)) if previous is None else unit(previous-direction*np.dot(previous,direction));across=unit(np.cross(direction,side));previous=side
            for k in range(sides):
                a=math.tau*k/sides;growth=1+.022*math.sin(a*3+pt[2]*.8+phases[0])+.014*math.sin(a*7-pt[2]*1.2+phases[1])
                if 'rootFlares' in path:
                    growth+=radial_flare(path,side*math.cos(a)+across*math.sin(a),pt[2])
                elif flared:growth+=(.24+.48*(.5+.5*math.cos(a*5+phases[2])))*math.exp(-max(0,pt[2])*3/max(radii))
                vertices.append(pt+(side*math.cos(a)+across*math.sin(a))*radius*growth)
        for j in range(len(points)-1):
            for k in range(sides):
                a=offset+j*sides+k;b=offset+j*sides+(k+1)%sides
                faces.append((a,b,b+sides,a+sides));uv.extend([(phase+k/sides*repeat,arc[j]/tile),(phase+(k+1)/sides*repeat,arc[j]/tile),(phase+(k+1)/sides*repeat,arc[j+1]/tile),(phase+k/sides*repeat,arc[j+1]/tile)])
        faces.extend([tuple(offset+k for k in reversed(range(sides))),tuple(offset+(len(points)-1)*sides+k for k in range(sides))]);uv.extend([(.5,.5)]*(sides*2))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(material);mesh.uv_layers.new(name='UVMap').data.foreach_set('uv',np.asarray(uv,np.float32).ravel());mesh.polygons.foreach_set('use_smooth',np.ones(len(faces),bool));mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);return obj


def build_wood(model,paths,p,material,meta,rng):
    uv_offsets(paths)
    surfaces=flow_surfaces(paths);major=[r for r in surfaces if ('growthRole' in r or r.get('root',False))] if 'growth' in p else [r for r in surfaces if max(r['radii'])>(.018 if p['habit']=='shrub' else .065)]
    if continuous_growth(p):major=[r for r in major if max(r['radii'])>=.060 or r.get('rootCrown',False)]
    small=[r for r in surfaces if not any(r is m for m in major)]
    tile=p['barkTileMetres'];source=mesh_paths(model+' source major wood',major+shoulders(paths),material,tile,rng,True)
    check_bounds(source,paths,'source')
    print('[Enhanced] Meshing shared fork volumes '+model,flush=True)
    obj=source.copy();obj.data=source.data.copy();obj.name=model+' / enhanced wood';bpy.context.scene.collection.objects.link(obj);activate(obj)
    remesh=obj.modifiers.new('Continuous roots and branch forks','REMESH');remesh.mode='VOXEL';remesh.voxel_size=p.get('woodVoxel',.006 if p['habit']=='shrub' else .022);remesh.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=remesh.name)
    check_bounds(obj,paths,'voxel union')
    print('[Enhanced] Fused wood surfaces '+model,flush=True)
    smooth=obj.modifiers.new('Growth shoulders','SMOOTH');smooth.factor=.65;smooth.iterations=5;bpy.ops.object.modifier_apply(modifier=smooth.name)
    check_bounds(obj,paths,'initial smoothing')
    if 'growth' in p and not continuous_growth(p):relax_forks(obj,paths,p.get('woodVoxel',.022))
    check_bounds(obj,paths,'fork relaxation')
    if not p.get('clayPreview',False):bake_bark(obj,source,paths,p,model,material,meta)
    if continuous_growth(p):check_bole_width(obj,paths,p.get('woodVoxel',.022),p['growth']['architecture']=='conical-linden')
    obj.data.polygons.foreach_set('use_smooth',np.ones(len(obj.data.polygons),bool));bpy.data.objects.remove(source,do_unlink=True)
    young=material.copy();young.name=model+' / younger branch bark';nodes,links=young.node_tree.nodes,young.node_tree.links;bsdf=nodes.get('Principled BSDF');original=bsdf.inputs['Base Color'].links[0].from_socket
    mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.60;mix.inputs[2].default_value=(.42,.31,.17,1);links.new(original,mix.inputs[1]);links.new(mix.outputs[0],bsdf.inputs['Base Color'])
    twigs=mesh_paths(model+' / enhanced branchlets',small,young,tile,rng,False)
    return obj,twigs


def bake_bark(obj,source,paths,p,model,material,meta):
    obj.data.uv_layers.new(name='UVMap')
    if continuous_growth(p):
        from bark_projection import transfer
        transfer(obj,source,p.get('woodVoxel',.022))
    else:
        transfer=obj.modifiers.new('Lengthwise source bark charts','DATA_TRANSFER');transfer.object=source;transfer.use_loop_data=True;transfer.data_types_loops={'UV'};transfer.loop_mapping='POLYINTERP_NEAREST';bpy.ops.object.modifier_apply(modifier=transfer.name)
    check_bounds(obj,paths,'UV transfer')
    print('[Enhanced] Transferred bark charts '+model,flush=True);relief_group=blend_junction_uv(obj,paths) if 'growth' in p else None
    if np.ptp(array(obj.data.uv_layers.active.data,'uv',2),axis=0).min()<.1:raise RuntimeError('Wood UV transfer failed')
    texture=bpy.data.textures.new(model+' bark relief',type='IMAGE');texture.image=next(n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image.filepath.endswith('height_16bit.png'))
    displacement=obj.modifiers.new('Source PBR crevice relief','DISPLACE');displacement.texture=texture;displacement.texture_coords='UV';displacement.uv_layer=obj.data.uv_layers.active.name;displacement.strength=min(meta['displacement']['scale_m'],.008);displacement.mid_level=.5
    if relief_group:displacement.vertex_group=relief_group
    bpy.ops.object.modifier_apply(modifier=displacement.name)
    check_bounds(obj,paths,'bark relief')
