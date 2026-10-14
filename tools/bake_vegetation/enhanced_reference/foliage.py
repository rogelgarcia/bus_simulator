# Connected crown fans carry uneven alternate or opposite leaves with local crowding rejection.
import math
import json
from collections import defaultdict
from pathlib import Path
import bpy
import numpy as np
from mathutils import Matrix
from architecture import unit,point,curve
from surface import pixels
from branchlets import plane_branchlets
from plane_foliage import form_parameters
from leaf_outline import blade_profile
from leaf_curvature import blade_height,blade_shape_metrics


def legacy_branchlets(p,paths,lobes,rng):
    for group,lobe in enumerate(lobes):
        support=paths[lobe['parent']];center=lobe['center'];radius=lobe['radius'];fans=[]
        for j in range(6):
            angle=j*2.39996+rng.uniform(-.35,.35);axis=unit(np.array([math.cos(angle),math.sin(angle),rng.uniform(-1.5,1.5)]))
            end=center+axis*radius*rng.uniform(.65,1.25);attachment=rng.uniform(.35,.98);anchor=point(support,attachment)
            if lobe.get('spray'):
                across=unit(np.cross(lobe['axis'],lobe['side']));side=lobe['side']*math.cos(angle)+across*math.sin(angle)
                end=center+lobe['axis']*radius*rng.uniform(.45,1.15)+side*radius*rng.uniform(.24,.65)*p.get('foliageFanSpread',1.)
            parent_radius=float(np.interp(attachment,np.linspace(0,1,len(support['radii'])),support['radii']))
            fan=curve(anchor,end,min(parent_radius*.64,radius*.024),rng,lobe['parent'],steps=7,tip=.0015)
            paths.append(fan);fans.append(len(paths)-1)
        shoot_count=round(p['shoots']*rng.uniform(.85,1.18))
        for j in range(shoot_count):
            parent=fans[j%len(fans)];fan=paths[parent];t=rng.uniform(.25,.96);start=point(fan,t)
            angle=rng.uniform(0,math.tau);out=unit(np.array([math.cos(angle),math.sin(angle),rng.uniform(-.28,.8)]))
            away=unit(start-center);direction=unit(out*.50+away*.42+lobe['axis']*.12+[0,0,.18])
            if lobe.get('spray'):
                direction=unit(unit(fan['points'][-1]-fan['points'][0])*.75+lobe['axis']*.35+out*p.get('foliageShootSpread',.25)+[0,0,.06])
            stations=max(4,round(p['stations']*rng.uniform(.70,1.25)));length=p['leafLength']*stations*rng.uniform(.39,.66)
            length=min(length,radius*1.3);end=start+direction*length;end[2]-=p['droop']*length*.48
            parent_radius=float(np.interp(t,np.linspace(0,1,len(fan['radii'])),fan['radii']))
            path=curve(start,end,min(parent_radius*.68,.006,max(.001,length*.0048)),rng,parent,bend=[0,0,length*.11],steps=9,tip=.00045)
            paths.append(path);shootid=len(paths)-1
            yield {'id':shootid,'group':group,'parent':parent,'stations':stations}


def grow(p,paths,lobes,rng):
    leaves=[];grid=defaultdict(list);cell=p['leafLength']*.46;rejected=0;shoots=[]
    def nearby(center):
        key=np.floor(center/cell).astype(int)
        for x in range(-1,2):
            for y in range(-1,2):
                for z in range(-1,2):
                    yield from grid[tuple(key+[x,y,z])]
    graph=plane_branchlets(p,paths,lobes,rng) if p.get('growth',{}).get('architecture')=='distributed-plane' else legacy_branchlets(p,paths,lobes,rng)
    for shoot in graph:
        shoots.append(shoot)
        shootid=shoot['id'];group=shoot['group'];stations=shoot['stations'];path=paths[shootid]
        internodes=rng.uniform(.65,1.35,stations);fractions=.09+.89*np.cumsum(internodes)/sum(internodes)
        phase=rng.uniform(-.25,.25);two_rank=p['habit'] in ['pyramidal','vase'];shoot_roll=rng.normal(0,p['leafRoll']*.65)
        for node,t in enumerate(fractions):
            anchor=point(path,t);tangent=unit(point(path,min(1,t+.03))-point(path,max(0,t-.03)))
            lateral=unit(np.cross(tangent,[0,0,1]));lateral=lateral if np.linalg.norm(lateral)>.5 else np.array([1.,0,0])
            for paired in range(2 if p['opposite'] else 1):
                sign=(-1 if (node if not p['opposite'] else paired)%2 else 1)
                if not two_rank and not p['opposite']:phase+=rng.uniform(.35,1.0)
                leafdir=unit(lateral*sign*.85+tangent*rng.uniform(.20,.65)+np.array([0,0,rng.uniform(-.18,.28)]))
                if not two_rank:leafdir=unit(leafdir+np.array([math.sin(phase),math.cos(phase),0])*.25)
                size=p['leafLength']*rng.uniform(.76,1.16)*(1-.22*max(0,(t-.80)/.2));centerleaf=anchor+leafdir*size*.52
                if centerleaf[2]<size*.4:continue
                face=unit(np.array([0.,0,1])-leafdir*leafdir[2]);side=unit(np.cross(leafdir,face))
                best=None;neighbors=list(nearby(centerleaf))
                for attempt in range(4):
                    roll=shoot_roll+rng.normal(0,p['leafRoll']*.55);normal=face*math.cos(roll)+side*math.sin(roll)
                    cost=sum(max(0,1-np.linalg.norm(centerleaf-other[0])/(size*.55))*abs(normal@other[1]) for other in neighbors)
                    if best is None or cost<best[0]:best=(cost,normal)
                if best[0]>.95:rejected+=1;continue
                normal=best[1];side=unit(np.cross(leafdir,normal));matrix=np.array([side*size,leafdir*size,normal*size]).T
                tint=rng.uniform(.82,1.08)*np.array([rng.uniform(.94,1.02),1.,rng.uniform(.90,1.02)])*p['leafGreen']
                leaves.append({'origin':anchor,'matrix':matrix,'form':int(rng.integers(8)),'tint':tint,'group':group,'shoot':shootid,'node':node})
                grid[tuple(np.floor(centerleaf/cell).astype(int))].append((centerleaf,normal))
    return leaves,shoots,{'candidateLeavesRejected':rejected,'crowdingMethod':'Center distance and normal agreement; four roll candidates; not exact triangle intersections'}


def templates(o,species,materials,meta,detailed_petioles=False,spread_petioles=False,flat_blades=False,sculpted_blades=False):
    folder=Path(o['root'])/'assets/public/pbr'/f'tree_ai_{species}_leaf_front';mask=pixels(folder/'opacity.png')[:,:,0]
    valid=mask>.5;ys,xs=np.where(valid);base=np.array([np.median(xs[ys<ys.min()+6])/1023,ys.min()/1023]);tip=ys.max()/1023
    center=np.array([np.mean(xs)/1023,np.mean(ys)/1023]);sectors=256;rings=5;angles=np.arange(sectors)*math.tau/sectors
    directions=np.column_stack([np.cos(angles),np.sin(angles)]);steps=np.linspace(.001,.8,1400);samples=center+directions[:,None,:]*steps[None,:,None]
    indices=np.clip(np.round(samples*1023),0,1023).astype(int);values=mask[indices[:,:,1],indices[:,:,0]]
    values[np.any((samples<0)|(samples>1),axis=2)]=0
    edge=len(steps)-1-np.argmax(values[:,::-1]>.5,axis=1);contour=center+directions*steps[np.maximum(0,edge-1),None]
    # Preserve the narrow petiole as an explicit connected strip; a radial blade must not bridge its basal notch.
    rowwidth=np.sum(valid,axis=1);blade_rows=np.flatnonzero(rowwidth>np.max(rowwidth)*.17);bladebase=blade_rows.min()/1023
    contour[:,1]=np.maximum(contour[:,1],bladebase);bottom=int(np.argmin(contour[:,1]));contour[bottom]=[base[0],bladebase]
    if detailed_petioles:
        center,contour,junction,stem_uv=blade_profile(mask,sectors)
        base[0]=junction[0];bladebase=junction[1];bottom=int(np.argmin(contour[:,1]))
    uv=np.vstack([center,*[center+(contour-center)*r/rings for r in range(1,rings+1)]])
    faces=[]
    for i in range(sectors):faces.append((0,1+i,1+(i+1)%sectors))
    for ring in range(rings-1):
        a=1+ring*sectors;b=a+sectors
        for i in range(sectors):j=(i+1)%sectors;faces.extend([(a+i,b+i,b+j),(a+i,b+j,a+j)])
    result=[];length=tip-base[1]
    for form in range(8):
        rng=np.random.default_rng(8181+form*73);xy=(uv-base)/length;xy[:,0]*=rng.uniform(.94,1.05)
        curl=rng.uniform(-.18,.06);twist=rng.uniform(-.15,.15)
        z=curl*xy[:,1]**2+twist*xy[:,0]*xy[:,1]+rng.uniform(.11,.24)*abs(xy[:,0])
        z+=np.interp(np.clip(xy[:,1],0,1),np.linspace(0,1,7),rng.normal(0,.0035,7))
        if detailed_petioles:
            shape=form_parameters(form,spread_petioles,flat_blades);xy=(uv-[base[0],bladebase])/(tip-bladebase);xy[:,0]*=shape['width']
            z=shape['curl']*xy[:,1]**2+shape['twist']*xy[:,0]*xy[:,1]+shape['fold']*abs(xy[:,0])
            if sculpted_blades:z=blade_height(xy,form)
            xy[:,1]+=shape['petiole']
        points=np.column_stack([xy,z]);n=len(points);vertices=np.vstack([points+[0,0,.0007],points-[0,0,.0007]])
        polygons=faces+[tuple(v+n for v in reversed(face)) for face in faces]
        for i in range(sectors):a=1+(rings-1)*sectors+i;b=1+(rings-1)*sectors+(i+1)%sectors;polygons.append((a,a+n,b+n,b))
        puv=np.vstack([uv,uv]);offset=len(vertices);blade=(bladebase-base[1])/length
        stalk=np.array([[-.008,0,0],[.008,0,0],[-.006,blade,0],[.006,blade,0]])
        stalk[:,2]=np.interp(stalk[:,1],[0,blade],[0,float(points[1+(rings-1)*sectors+bottom,2])])
        vertices=np.vstack([vertices,stalk]);stalkuv=base+stalk[:,:2]*length;puv=np.vstack([puv,stalkuv]);polygons.extend([(offset,offset+1,offset+3,offset+2),(offset+2,offset+3,offset+1,offset)])
        if detailed_petioles:
            vertices=vertices[:offset];puv=puv[:offset];polygons=polygons[:-2]
            sides=10;segments=13;t=np.linspace(0,1,segments)
            centers=np.column_stack([np.zeros(segments),t*shape['petiole'],shape['arch']*np.sin(np.pi*t)])
            for j,center in enumerate(centers):
                axis=unit(centers[min(j+1,segments-1)]-centers[max(j-1,0)]);side=np.array([1.,0,0]);across=unit(np.cross(axis,side))
                radius=.0045+.002*(1-t[j])+.0025*np.exp(-t[j]*14)
                for k in range(sides):
                    angle=math.tau*k/sides
                    vertices=np.vstack([vertices,center+radius*(side*math.cos(angle)+across*math.sin(angle))])
                    stalk_sample=stem_uv[round((.12+.76*t[j])*(len(stem_uv)-1))]
                    puv=np.vstack([puv,stalk_sample+[.0005*math.cos(angle),0]])
            for j in range(segments-1):
                for k in range(sides):a=offset+j*sides+k;b=offset+j*sides+(k+1)%sides;polygons.append((a,b,b+sides,a+sides))
            polygons.extend([tuple(offset+k for k in reversed(range(sides))),tuple(offset+(segments-1)*sides+k for k in range(sides))])
        mesh=bpy.data.meshes.new(f'{species} curved tissue {form}');mesh.from_pydata(vertices,[],polygons);mesh.materials.append(materials[0]);mesh.materials.append(materials[1])
        layer=mesh.uv_layers.new(name='UVMap');ids=np.empty(len(mesh.loops),np.int32);mesh.loops.foreach_get('vertex_index',ids);layer.data.foreach_set('uv',puv[ids].astype(np.float32).ravel())
        m=np.zeros(len(polygons),np.int32);m[len(faces):len(faces)*2]=1
        if not detailed_petioles:m[-1]=1
        mesh.polygons.foreach_set('material_index',m);mesh.polygons.foreach_set('use_smooth',np.ones(len(polygons),bool));mesh.update()
        if sculpted_blades:
            proof=blade_shape_metrics(points)
            if proof['bestPlaneRmsRatio']<.02:raise RuntimeError('Sculpted blade is too close to a flat plane')
            mesh['bladeShape']=json.dumps(proof)
        result.append(mesh)
    return result


def instances(model,leaves,forms):
    collection=bpy.data.collections.new(model+' leaf prototypes')
    for i,mesh in enumerate(forms):collection.objects.link(bpy.data.objects.new(f'{model}_form_{i:02}',mesh))
    mesh=bpy.data.meshes.new(model+' leaf origins');mesh.vertices.add(len(leaves));mesh.vertices.foreach_set('co',np.asarray([l['origin'] for l in leaves],np.float32).ravel())
    matrices=np.asarray([l['matrix'] for l in leaves]);scales=np.linalg.norm(matrices,axis=1);rotations=matrices/scales[:,None,:]
    data=[('leaf_form','INT','value',[l['form'] for l in leaves]),('leaf_scale','FLOAT_VECTOR','vector',scales),('leaf_rotation','FLOAT_VECTOR','vector',[tuple(Matrix(m.tolist()).to_euler()) for m in rotations]),('leaf_tint','FLOAT_COLOR','color',[list(l['tint'])+[1] for l in leaves]),('spray_id','INT','value',[l['group'] for l in leaves]),('shoot_id','INT','value',[l['shoot'] for l in leaves]),('node_id','INT','value',[l['node'] for l in leaves])]
    if leaves and 'bladeCenter' in leaves[0]:data.append(('blade_center','FLOAT_VECTOR','vector',[l['bladeCenter'] for l in leaves]))
    for name,kind,field,values in data:mesh.attributes.new(name,kind,'POINT').data.foreach_set(field,np.asarray(values).ravel())
    obj=bpy.data.objects.new(model+' / enhanced leaves',mesh);bpy.context.scene.collection.objects.link(obj)
    tree=bpy.data.node_groups.new(model+' / leaf instances','GeometryNodeTree');tree.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry');tree.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
    nodes,links=tree.nodes,tree.links;entry=nodes.new('NodeGroupInput');output=nodes.new('NodeGroupOutput');info=nodes.new('GeometryNodeCollectionInfo');info.inputs['Collection'].default_value=collection;info.inputs['Separate Children'].default_value=True;info.inputs['Reset Children'].default_value=True
    scatter=nodes.new('GeometryNodeInstanceOnPoints');scatter.inputs['Pick Instance'].default_value=True;links.new(entry.outputs['Geometry'],scatter.inputs['Points']);links.new(info.outputs['Instances'],scatter.inputs['Instance']);links.new(scatter.outputs['Instances'],output.inputs['Geometry'])
    for socket,name,kind in [('Instance Index','leaf_form','INT'),('Rotation','leaf_rotation','FLOAT_VECTOR'),('Scale','leaf_scale','FLOAT_VECTOR')]:
        node=nodes.new('GeometryNodeInputNamedAttribute');node.data_type=kind;node.inputs['Name'].default_value=name;links.new(node.outputs['Attribute'],scatter.inputs[socket])
    obj.modifiers.new('Detailed instanced foliage','NODES').node_group=tree
    return obj
