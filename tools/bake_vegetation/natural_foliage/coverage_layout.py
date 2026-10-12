# Adds attached leaves in exposed internode gaps while preserving the existing growth.
import math
import numpy as np
from mathutils import Euler
from common import array,foliage_data
from leaf_geometry import LENGTH_RATIO,PETIOLE
from layout import Neighbors,frame,station,unit


def records_from_object(obj):
    data=foliage_data(obj);mesh=obj.data
    rotations=np.array([np.array(Euler(tuple(row)).to_matrix()) for row in data['rotations']])
    matrices=rotations*data['scales'][:,None,:]
    attrs={key:array(mesh.attributes[key+'_id'].data,'value',dtype=np.int32) for key in ['shoot','spray','node']}
    tints=array(mesh.attributes['leaf_tint'].data,'color',4)
    return [{'form':int(data['forms'][i]),'origin':data['origins'][i].copy(),'matrix':matrices[i],
        'center':data['origins'][i]+matrices[i,:,1]*.48,'normal':rotations[i,:,2],
        'width':float(data['scales'][i,0]),'length':float(data['scales'][i,1]),
        'shoot':int(attrs['shoot'][i]),'group':int(attrs['spray'][i]),'node':int(attrs['node'][i]),
        'tint':tints[i,:3].copy()} for i in range(len(data['origins']))]


def leaf_data(records):
    return {key:np.array([r[source] for r in records]) for key,source in
        [('centers','center'),('normals','normal'),('widths','width'),('lengths','length')]}


def path_fraction(path,point):
    delta=np.diff(path,axis=0);lengths=np.linalg.norm(delta,axis=1)
    fractions=np.clip(np.sum((point-path[:-1])*delta,axis=1)/np.maximum(lengths**2,1e-12),0,1)
    distances=np.linalg.norm(path[:-1]+delta*fractions[:,None]-point,axis=1);i=int(np.argmin(distances))
    return float((lengths[:i].sum()+fractions[i]*lengths[i])/lengths.sum())


def additions(records,shoots,recipe,seed,exposure):
    rng=np.random.default_rng(seed);kind=recipe['texture']['leaf'];low,high=recipe['growth']['leafWidthMetres']
    neighbors=Neighbors(high*LENGTH_RATIO[kind]*1.5);members=[[] for _ in shoots]
    for record in records:
        neighbors.add(record['center'],record['width']*.31,record['normal']);members[record['shoot']].append(record)
    pool=[]
    for shoot_id in rng.permutation(len(shoots)):
        path=np.array(shoots[shoot_id]['path']);existing=members[shoot_id]
        if not existing:continue
        anchors=[(path_fraction(path,r['origin']-r['matrix'][:,1]*PETIOLE[kind]),r) for r in existing]
        anchors.sort(key=lambda row:row[0]);ts=np.array([.06]+[row[0] for row in anchors]+[.96])
        length=float(np.linalg.norm(np.diff(path,axis=0),axis=1).sum())
        for gap in np.argsort(np.diff(ts))[-3:]:
            if (ts[gap+1]-ts[gap])*length<low*LENGTH_RATIO[kind]*.30:continue
            t=float(ts[gap]+(ts[gap+1]-ts[gap])*rng.uniform(.38,.62))
            attach,tangent=station(path,t);basis=frame(tangent)
            nearest=min(anchors,key=lambda row:abs(row[0]-t))[1];old_direction=unit(nearest['matrix'][:,1])
            phase=math.atan2(old_direction@basis[:,2],old_direction@basis[:,0])+(math.pi if kind in ['elm','linden'] else 2.399)
            width=float(rng.uniform(low,high));blade_length=width*LENGTH_RATIO[kind]*rng.uniform(.92,1.07)
            best=None
            for attempt in range(4):
                phi=phase+rng.normal(0,.28);side=basis[:,0]*math.cos(phi)+basis[:,2]*math.sin(phi)
                aim=unit(side*.85+tangent*rng.uniform(.25,.70));leaf_basis=frame(aim);roll=rng.normal(0,.34)
                face=leaf_basis[:,2]*math.cos(roll)+leaf_basis[:,0]*math.sin(roll);across=unit(np.cross(aim,face));face=np.cross(across,aim)
                origin=attach+aim*PETIOLE[kind]*blade_length;center=origin+aim*blade_length*.48
                cost=neighbors.cost(center,width*.31,face)
                candidate={'form':int(rng.integers(8)),'origin':origin,'matrix':np.column_stack([across*width,aim*blade_length,face*blade_length]),
                    'center':center,'normal':face,'width':width,'length':blade_length,'shoot':int(shoot_id),
                    'group':int(shoots[shoot_id]['group']),'node':max(r['node'] for r in existing)+1+int(gap),
                    'tint':nearest['tint'].copy(),'fraction':t}
                score=exposure(candidate)/(1+cost*5)
                if cost<.32 and (best is None or score>best[0]):best=(score,candidate)
            if best is not None and best[0]>.02:pool.append(best)
    pool.sort(key=lambda row:row[0],reverse=True);accepted=[]
    for _,candidate in pool:
        if neighbors.cost(candidate['center'],candidate['width']*.31,candidate['normal'])>.32:continue
        neighbors.add(candidate['center'],candidate['width']*.31,candidate['normal']);accepted.append(candidate)
    print(f'[Coverage] {len(accepted)} exposed, uncrowded node candidates from {len(pool)} options',flush=True)
    return accepted
