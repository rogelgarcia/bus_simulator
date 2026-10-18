# Grows a tapered linden crown from a dominant leader and staggered, ascending successors.
import math
import numpy as np
from architecture import unit
from plane_growth import successor


def crown_profile(points,dimensions):
    first=dimensions['clearBoleTarget'];height=dimensions['heightTarget'];station=(points[:,2]-first)/(height-first)
    radii=np.linalg.norm(points[:,:2],axis=1);bands=[]
    for lo,hi in [(0,.46),(.46,.72),(.72,1.2)]:
        selected=radii[(station>=lo)&(station<hi)]
        if len(selected)<3:raise RuntimeError('Missing linden crown height band')
        bands.append(float(np.quantile(selected,.90)))
    return {'lowerRadius':bands[0],'middleRadius':bands[1],'upperRadius':bands[2],
            'middleToLowerRadius':bands[1]/bands[0],'upperToLowerRadius':bands[2]/bands[0]}


def scaffold(p,variant):
    from growth import extend,demand_radii
    rng=np.random.default_rng(p['seed']+variant*191);g=p['growth']
    h=p['height']*[1,.91,1.06][variant-1];r=p['radius']*[1,1.09,.94][variant-1]
    first=h*g['firstFork'];paths=[];lobes=[];phase=rng.uniform(0,math.tau)
    tip=np.array([rng.uniform(-.10,.10),rng.uniform(-.10,.10),first])
    leader=extend(paths,-1,-1,tip,[.015,-.01,1],rng,'bole',0,36)
    paths[leader]['junctionMode']='inherited-tangent'

    def foliage(parent,radius,node=None):
        path=paths[parent];node=len(path['points'])-1 if node is None else node
        axis=unit(path['points'][node]-path['points'][max(0,node-2)]);center=path['points'][node].copy()
        path['demand'][node]+=radius**2
        lobes.append({'center':center,'radius':radius,'parent':parent,'parentNode':node,
                      'axis':axis,'side':unit(np.cross(axis,[0,0,1])),'spray':True})

    def ramify(parent,direction,length,depth,order,radius,roll,role='successor'):
        end=paths[parent]['points'][-1]+direction*length
        child=successor(paths,parent,end,rng,order,role)
        foliage(child,radius*rng.uniform(.86,1.08))
        if depth==3:foliage(child,radius*.85,len(paths[child]['points'])//2)
        if depth==0:
            return
        side=unit(np.cross(direction,[0,0,1]));across=unit(np.cross(side,direction))
        plane=side*math.cos(roll)+across*math.sin(roll)
        for sign,angle,scale in [(1,rng.uniform(.12,.28),rng.uniform(.73,.80)),(-1,rng.uniform(.44,.66),rng.uniform(.58,.70))]:
            heading=unit(direction*math.cos(angle)+plane*sign*math.sin(angle)+[0,0,.035])
            ramify(child,heading,length*scale,depth-1,order+1,radius,roll+sign*2.39996+rng.uniform(-.35,.35))

    stations=np.r_[0,np.cumsum(rng.uniform(.85,1.15,17))];stations=stations/stations[-1]*.89
    launches=[]
    for level,station in enumerate(stations):
        angle=phase+level*2.39996+rng.uniform(-.24,.24)
        direction=unit([math.cos(angle),math.sin(angle),.50+.35*station+rng.uniform(-.06,.08)])
        reach=r*(1-station)**.94*rng.uniform(.91,1.07)
        radius=(.65+.55*(1-station)**.70)*rng.uniform(.92,1.06)
        launches.append(len(paths))
        ramify(leader,direction,reach*.40/np.linalg.norm(direction[:2]),3,1,radius,rng.uniform(0,math.tau),'scaffold')
        next_station=stations[level+1] if level+1<len(stations) else .99
        z=first+(h-first)*next_station
        end=np.array([.16*math.sin(phase+next_station*3),.13*math.cos(phase+next_station*2.4),z])
        leader=successor(paths,leader,end,rng,0,'leader')
    foliage(leader,.40)
    stats=demand_radii(paths,g['basalRadius'],g['pipeExponent'])
    stats.update({'architecture':'conical-linden','majorScaffolds':len(launches),'scaffoldLaunchPaths':launches,
                  'maximumBranchOrder':max(path['order'] for path in paths),'structuralPaths':len(paths),
                  'firstFork':tip.tolist(),'crownBoundary':'none',
                  'growthMethod':'Dominant leader with staggered ascending successors, decreasing extension and foliage-group size, and descendant-demand radii; not physiological simulation'})
    dimensions={'heightTarget':h,'radiusTarget':r,'clearBoleTarget':first,'habit':p['habit'],'growth':stats}
    stats['crownSupportProfile']=crown_profile(np.array([l['center'] for l in lobes]),dimensions)
    return paths,lobes,rng,dimensions
