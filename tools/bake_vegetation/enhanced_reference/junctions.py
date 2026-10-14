# Builds local longitudinal shoulder volumes at grown scaffold junctions.
import numpy as np
from architecture import unit


def flow_surfaces(paths):
    children={};result=[]
    for i,path in enumerate(paths):
        if ('growthRole' in path or 'shootRole' in path) and path['parent']>=0:children.setdefault(path['parent'],[]).append(i)
    offsets={}
    for parent,ids in children.items():
        axis=unit(paths[parent]['points'][-1]-paths[parent]['points'][-2]);directions=[]
        for i in ids:
            d=unit(paths[i]['points'][2]-paths[i]['points'][0]);directions.append(d-axis*np.dot(d,axis))
        mean=np.average(directions,axis=0,weights=[paths[i]['radii'][0]**2 for i in ids])
        spread=max(np.linalg.norm(d-mean) for d in directions)
        for i,d in zip(ids,directions):
            displacement=(d-mean)/max(spread,1e-10) if paths[parent].get('junctionMode')=='dominant-axis' else unit(d-mean)
            if paths[parent].get('junctionMode')=='inherited-tangent':displacement*=0
            offsets[i]=displacement*paths[parent]['radii'][-1]*.32
    for i,path in enumerate(paths):
        if 'growthRole' not in path and 'shootRole' not in path:result.append(path);continue
        points=path['points'].copy();radii=path['radii'].copy();surface={**path}
        if i in children:
            axis=unit(points[-1]-points[-2]);radius=float(radii[-1]);extra=points[-1]+np.array([.20,.45,.70])[:,None]*radius*axis
            points=np.vstack([points,extra]);radii=np.r_[radii,radius*np.array([.86,.55,.08])]
        if path['parent']>=0:
            parent=paths[path['parent']];node=path['parentNode'];radius=float(parent['radii'][node]);distance=np.r_[0,np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))]
            if path.get('junctionMode')=='inherited-tangent':
                reach=min(radius*3.2,distance[len(path['points'])-1]*.75)
                blend=np.maximum(0,1-distance/reach);blend=blend*blend*(3-2*blend)
                radii+=np.maximum(0,radius-radii)*blend
            points+=offsets[i]*np.maximum(0,1-distance/(radius*2.5))[:,None]
            back=parent['points'][:node+1][::-1]
            available=float(np.sum(np.linalg.norm(np.diff(back,axis=0),axis=1)))
            burial=min(radius*2.8,available*.90)
            prefix=np.array([at_distance(back,d) for d in burial*np.array([1.,2./2.8,1.1/2.8,.45/2.8])])
            prefix+=np.array([0,.12,.40,.76])[:,None]*offsets[i]
            points=np.vstack([prefix,points]);radii=np.r_[path['radii'][0]*np.array([.55,.80,.94,1.]),radii]
            surface['uvOffset']=path.get('uvOffset',0)-burial
        surface.update(points=points,radii=radii);result.append(surface)
    return result


def at_distance(points,distance):
    arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))]
    return np.array([np.interp(distance,arc,points[:,k]) for k in range(3)])


def shoulders(paths):
    result=[]
    for child in paths:
        if 'growthRole' not in child or child['parent']<0 or child['radii'][0]<.12:continue
        if child.get('junctionMode')=='inherited-tangent':continue
        parent=paths[child['parent']];node=child['parentNode'];radius=float(child['radii'][0]);joint=child['points'][0]
        below=at_distance(parent['points'][:node+1][::-1],radius*2.6);above=at_distance(child['points'],radius*3.0)
        t=np.linspace(0,1,17);points=(1-t[:,None])**2*below+2*(1-t[:,None])*t[:,None]*joint+t[:,None]**2*above
        radii=radius*(.32+.34*np.sin(np.pi*t))
        result.append({'points':points,'radii':radii,'phase':parent['phase'],'basal':False,'parent':child['parent'],'junctionSupport':True})
    return result


def uv_offsets(paths):
    for path in paths:
        if 'growthRole' not in path and 'shootRole' not in path:continue
        if path['parent']<0:path['uvOffset']=0.
        else:
            parent=paths[path['parent']];node=path['parentNode'];arc=np.sum(np.linalg.norm(np.diff(parent['points'][:node+1],axis=0),axis=1))
            path['uvOffset']=parent['uvOffset']+float(arc)


def relax_forks(obj,paths,voxel):
    import bpy
    from common import array
    points=array(obj.data.vertices,'co',3);weights=np.zeros(len(points));forks={}
    for path in paths:
        if 'growthRole' in path and path['parent']>=0:forks[path['parent']]=path['parentNode']
    for parent,node in forks.items():
        path=paths[parent];radius=float(path['radii'][node]);distance=np.linalg.norm(points-path['points'][node],axis=1)/radius
        w=np.clip((4-distance)/1.5,0,1);weights=np.maximum(weights,w*w*(3-2*w)*min(1,(radius/.55)**2))
    group=obj.vertex_groups.new(name='Shared fork surface relaxation')
    for band in range(1,65):
        ids=np.flatnonzero(np.round(weights*64)==band)
        if len(ids):group.add(ids.tolist(),band/64,'REPLACE')
    smooth=obj.modifiers.new('Continuous fork shoulders','SMOOTH');smooth.vertex_group=group.name;smooth.factor=.8;smooth.iterations=max(1,round(4*(.20/voxel)**2))
    bpy.ops.object.modifier_apply(modifier=smooth.name)
