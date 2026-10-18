# Grows branch-owned elm crown clusters with continuous, outward-progressing forks.
import math
import numpy as np
from architecture import unit
from plane_growth import successor
from oak_growth import crown_profile


def crown_clusters(p,variant,rng,phase):
    g=p['growth'];h=p['height']*[1,.94,1.05][variant-1]
    r=p['radius']*[1,1.06,.97][variant-1];clusters=[]
    for owner in range(g['majorAxes']):
        az=phase+(owner+.5)*math.tau/g['majorAxes']
        for tier,region in enumerate(g['clusterTiers']):
            angle=az+region['azimuth']+rng.uniform(-.16,.16)
            radial=np.array([math.cos(angle),math.sin(angle),0.])
            side=np.array([-radial[1],radial[0],0.])
            center=radial*r*region['reach']*rng.uniform(.92,1.08)
            center[2]=h*(region['height']+rng.uniform(-.025,.025))
            radii=np.array([r*region['radii'][0],r*region['radii'][1],h*region['radii'][2]])*rng.uniform(.92,1.08)
            basis=np.column_stack([radial,side,[0.,0.,1.]])
            count=round(g['crownBuds']/g['majorAxes']*region['weight']);points=[]
            for i in range(count):
                z=1-2*(i+rng.uniform(.15,.85))/count
                a=i*2.399963+rng.uniform(-.23,.23);rr=math.sqrt(1-z*z)
                q=np.array([rr*math.cos(a),rr*math.sin(a),z])*rng.uniform(.08,1)**(1/3)
                points.append(center+basis@(q*radii))
            clusters.append({'id':len(clusters),'owner':owner,'tier':tier,'center':center.tolist(),
                             'radii':radii.tolist(),'basis':basis.tolist(),'points':np.array(points)})
    return clusters,h,r


def scaffold(p,variant):
    from growth import extend,demand_radii
    rng=np.random.default_rng(p['seed']+variant*191);g=p['growth']
    phase=rng.uniform(0,math.tau);clusters,h,r=crown_clusters(p,variant,rng,phase)
    paths=[];lobes=[];launches=[];first=h*g['firstFork']
    tip=np.array([rng.uniform(-.09,.09),rng.uniform(-.09,.09),first])
    bole=extend(paths,-1,-1,tip,[.02,-.01,1],rng,'bole',0,36)
    paths[bole]['junctionMode']='inherited-tangent'

    def branch(parent,targets,order,cluster,guide):
        start=paths[parent]['points'][-1];destination=targets.mean(axis=0)
        terminal=len(targets)<=2
        end=start+(destination-start)*(1. if terminal else rng.uniform(.54,.66))
        child=successor(paths,parent,end,rng,order,'successor',guide,minimum_steps=24)
        paths[child]['crownCluster']=cluster['id']
        if terminal:
            path=paths[child];radius=rng.uniform(.86,1.08)
            path['demand']+=radius**2/len(path['demand']);path['demand'][-1]+=.20*radius**2
            lobes.append({'center':end.copy(),'radius':radius,'parent':child,'parentNode':len(path['points'])-1,
                          'axis':unit(end-start),'side':unit(np.cross(guide,[0,0,1])),
                          'cluster':cluster['id'],'clusterGuide':guide.tolist(),'clusterCenter':cluster['center'],
                          'clusterRegion':{k:cluster[k] for k in ['id','center','radii','basis']},'spray':True})
            return
        cloud=targets-destination
        _,_,basis=np.linalg.svd(cloud,full_matrices=False)
        axis=unit(basis[0]+rng.normal(0,.10,3))
        ranks=np.argsort(cloud@axis);cut=int(np.clip(round(len(targets)*rng.uniform(.44,.56)),1,len(targets)-1))
        for ids in [ranks[:cut],ranks[cut:]]:branch(child,targets[ids],order+1,cluster,guide)

    main=bole
    for owner in range(g['majorAxes']):
        az=phase+(owner+.5)*math.tau/g['majorAxes']
        radial=np.array([math.cos(az),math.sin(az),0.])
        start=paths[main]['points'][-1];elbow=radial*r*rng.uniform(.25,.30)
        elbow[2]=h*rng.uniform(*g['scaffoldElbowHeight'])
        axis=successor(paths,main,elbow,rng,1,'arching-axis',unit(elbow-start));launches.append(axis)
        for cluster in [c for c in clusters if c['owner']==owner]:
            node=round([.55,.78,1.][cluster['tier']]*(len(paths[axis]['points'])-1))
            start=paths[axis]['points'][node];center=np.array(cluster['center']);guide=unit(center-start)
            root=successor(paths,axis,start+(center-start)*.34,rng,2,'cluster-axis',guide,parent_node=node,minimum_steps=24)
            cluster['supportRoot']=root;paths[root]['crownCluster']=cluster['id']
            branch(root,cluster['points'],3,cluster,guide)
        if owner<g['majorAxes']-1:
            rise=h*rng.uniform(.020,.029)
            main=successor(paths,main,paths[main]['points'][-1]+np.array([rng.uniform(-.04,.04),rng.uniform(-.04,.04),rise]),rng,1,'leader',np.array([0.,0.,1.]))
    stats=demand_radii(paths,g['basalRadius'],g['pipeExponent'])
    points=np.array([l['center'] for l in lobes]);low=points.min(axis=0);high=points.max(axis=0)
    stats.update({'architecture':'arching-elm','firstFork':tip.tolist(),'structuralPaths':len(paths),
                  'majorScaffolds':len(launches),'scaffoldLaunchPaths':launches,
                  'maximumBranchOrder':max(path['order'] for path in paths),'terminalWoodPaths':len(lobes),
                  'crownBoundary':'separate branch-owned bud regions; no global shell',
                  'crownClusters':[{k:v for k,v in c.items() if k!='points'} for c in clusters],
                  'crownBudVolume':{'center':((low+high)*.5).tolist(),'radii':((high-low)*.5).tolist(),'count':sum(len(c['points']) for c in clusters)},
                  'crownSupportProfile':crown_profile(points),
                  'growthMethod':'Staggered arching axes carry separate lower, middle and upper foliage regions; forks progress outward within each branch-owned region'})
    return paths,lobes,rng,{'heightTarget':h,'radiusTarget':r,'clearBoleTarget':first,'habit':p['habit'],'growth':stats}
