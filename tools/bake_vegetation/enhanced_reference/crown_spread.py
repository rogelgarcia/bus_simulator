# Distributes connected crown families into underfilled directions without camera-specific edits or leaf scaling.
import math
import numpy as np
from spatial_growth import redirect_family


def crown_metrics(points,samples):
    angles=np.arange(samples)*math.pi/samples;axes=np.column_stack([np.cos(angles),np.sin(angles)])
    low,high=np.quantile(points[:,:2]@axes.T,[.01,.99],axis=0);widths=high-low
    return {'minimumWidth':float(widths.min()),'maximumWidth':float(widths.max()),'height':float(np.quantile(points[:,2],.99)),
            'widthAspect':float(widths.min()/widths.max()),'widths':widths,'azimuthDegrees':np.degrees(angles)}


def crown_families(paths):
    roots=[i for i,p in enumerate(paths) if p.get('growthRole')=='scaffold' and paths[p['parent']].get('growthRole') in ['codominant','leader','bole']]
    owners=np.full(len(paths),-1,dtype=int);lookup={root:i for i,root in enumerate(roots)}
    for i,p in enumerate(paths):
        if i in lookup:owners[i]=lookup[i]
        elif p['parent']>=0:owners[i]=owners[p['parent']]
    parents={p['parent'] for p in paths};tips=np.array([i for i in range(len(paths)) if owners[i]>=0 and i not in parents and not paths[i].get('root')])
    if not roots or not len(tips):raise RuntimeError('Crown spread requires connected scaffold families')
    return roots,owners,tips


def broaden_crown(paths,policy):
    roots,owners,tips=crown_families(paths);initial={};launches=[]
    for root in roots:
        delta=paths[root]['points'][-1]-paths[root]['points'][0];elevation=math.degrees(math.atan2(delta[2],np.linalg.norm(delta[:2])))
        if elevation<policy['minimumLaunchElevationDegrees']:
            change,record=redirect_family(paths,root,policy['minimumLaunchElevationDegrees'],0.);initial.update(change);launches.append(record)
    groups=owners[tips];original=np.array([paths[i]['points'][-1] for i in tips])
    pivots=np.array([paths[i]['points'][0] for i in roots]);local=original-pivots[groups]
    before=crown_metrics(original,policy['azimuthSamples']);target=max(before['maximumWidth']*policy['minimumWidthAspect'],before['height']*policy['minimumWidthHeight'])
    axes=np.radians(np.arange(policy['azimuthSamples'])*180/policy['azimuthSamples']);projection=np.column_stack([np.cos(axes),np.sin(axes)])
    angles=np.zeros(len(roots));maximum=policy['maximumAzimuthChangeDegrees'];iteration=0
    def evaluate(turns):
        a=np.radians(turns[groups]);c,s=np.cos(a),np.sin(a)
        xy=np.column_stack([local[:,0]*c-local[:,1]*s,local[:,0]*s+local[:,1]*c])+pivots[groups,:2]
        low,high=np.quantile(xy@projection.T,[.01,.99],axis=0);widths=high-low
        cost=float(np.mean(np.maximum(0,target-widths)**2)+max(0,before['maximumWidth']*.96-widths.max())**2)
        return cost,widths,np.column_stack([xy,original[:,2]])
    cost,widths,points=evaluate(angles)
    for iteration in range(policy['maxIterations']):
        if widths.min()>=target:break
        best=None
        for i in range(len(roots)):
            for step in [-policy['azimuthStepDegrees'],policy['azimuthStepDegrees']]:
                candidate=angles.copy();candidate[i]+=step
                if abs(candidate[i])>maximum:continue
                score,w,p=evaluate(candidate)
                rank=(score,float(np.sum(candidate**2)))
                if best is None or rank<best[0]:best=(rank,candidate,w,p)
        if best is None or best[0][0]>=cost-1e-10:break
        (cost,_),angles,widths,points=best
    transforms={};records=[]
    for slot,root in enumerate(roots):
        if abs(angles[slot])<1e-9:continue
        d=paths[root]['points'][-1]-paths[root]['points'][0];elevation=math.degrees(math.atan2(d[2],np.linalg.norm(d[:2])))
        change,record=redirect_family(paths,root,elevation,float(angles[slot]));transforms.update(change);records.append(record)
    from crown_extension import extend_crown
    extended,extension=extend_crown(paths,target,policy)
    for i,(turn,shift) in extended.items():
        old_turn,old_shift=transforms.get(i,(np.eye(3),np.zeros(3)));transforms[i]=(turn@old_turn,turn@old_shift+shift)
    for i,(turn,shift) in initial.items():
        later,offset=transforms.get(i,(np.eye(3),np.zeros(3)));transforms[i]=(later@turn,later@shift+offset)
    after=crown_metrics(np.array([paths[i]['points'][-1] for i in tips]),policy['azimuthSamples'])
    def serial(metrics):return {k:(v.tolist() if isinstance(v,np.ndarray) else v) for k,v in metrics.items()}
    return transforms,{'policy':policy,'before':serial(before),'after':serial(after),'targetMinimumWidth':target,
                       'iterations':iteration,'families':records,'launchCorrections':launches,'extension':extension,'method':'All-azimuth crown width; bounded scaffold yaw and distributed centerline growth; rigid leaf shoots and unchanged pipe radii; no crown boundary'}
