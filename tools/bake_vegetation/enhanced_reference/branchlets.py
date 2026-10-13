# Builds short, spreading London plane shoot forks before placing leaves on their nodes.
import math
import numpy as np
from architecture import unit


def plane_branchlets(p,paths,lobes,rng):
    shoots=[]
    for group,lobe in enumerate(lobes):
        support=paths[lobe['parent']];axis=lobe['axis'];scale=lobe['radius']
        side=unit(np.cross(axis,[0,0,1]))
        if np.linalg.norm(side)<.5:side=np.array([1.,0,0])
        across=unit(np.cross(axis,side));roll=rng.uniform(-math.pi,math.pi)

        def grow(parent,node,direction,length,radius,depth,plane):
            source=paths[parent];start=source['points'][node]
            incoming=unit(source['points'][node]-source['points'][max(0,node-2)])
            t=np.linspace(0,1,9);u=t[:,None];end=start+direction*length
            transverse=unit(np.cross(direction,plane));bow=transverse*rng.uniform(-.075,.075)*length
            points=(1-u)**3*start+3*(1-u)**2*u*(start+incoming*length*.14)+3*(1-u)*u*u*(end-direction*length*.29+bow)+u**3*end
            bend=unit(plane-direction*np.dot(plane,direction))*rng.uniform(-.055,.055)*length
            points+=np.sin(np.pi*t)[:,None]**2*bend
            # Visible bud-bearing tips retain a finite diameter, never a needle taper.
            tip=radius*rng.uniform(.88,.94) if depth else max(.0018,radius*.62)
            tip=min(tip,radius*.95);radii=radius+(tip-radius)*t
            path={'points':points,'radii':radii,'parent':parent,'parentNode':node,'phase':float(rng.random()),'basal':False,
                  'shootRole':'branched-spray','shootDepth':3-depth,'junctionMode':'inherited-tangent','group':group}
            paths.append(path);child=len(paths)-1
            stations=max(3,round(length/(p['leafLength']*rng.uniform(.24,.34))))
            shoots.append({'id':child,'parent':parent,'group':group,'stations':stations})
            if depth==0:return
            lateral=unit(plane-direction*np.dot(plane,direction))
            continuation=rng.uniform(.16,.32);divergence=rng.uniform(.55,.85)
            directions=[unit(direction*math.cos(continuation)+lateral*math.sin(continuation)),
                        unit(direction*math.cos(divergence)-lateral*math.sin(divergence))]
            # Successive branching planes twist moderately; they do not make parallel combs.
            turn=rng.uniform(-.65,.65)
            nextplane=unit(lateral*math.cos(turn)+unit(np.cross(direction,lateral))*math.sin(turn))
            for index,heading in enumerate(directions):
                grow(child,len(points)-1,heading,length*rng.uniform(.70,.85)*(1 if index==0 else .87),
                     tip*(.86 if index==0 else .73),depth-1,nextplane if index==0 else -nextplane)

        for sprig in range(2):
            node=len(support['points'])-1 if sprig==0 else max(2,round((len(support['points'])-1)*rng.uniform(.42,.64)))
            tangent=unit(support['points'][node]-support['points'][node-2])
            lateral=side*math.cos(roll+sprig*2.15)+across*math.sin(roll+sprig*2.15)
            angle=rng.uniform(.12,.28) if sprig==0 else rng.uniform(.55,.85)
            heading=unit(tangent*math.cos(angle)+lateral*math.sin(angle))
            radius=float(support['radii'][node])*(.97 if sprig==0 else .67)
            grow(lobe['parent'],node,heading,scale*rng.uniform(.70,.98),radius,3,lateral)
    return shoots


def branchlet_pose(paths):
    # The highest structural support is unchanged between revisions, giving matched twig framing.
    supports=[(i,r) for i,r in enumerate(paths) if 'growthRole' in r]
    _,support=max(supports,key=lambda row:row[1]['points'][-1][2])
    points=np.asarray(support['points']);axis=unit(points[-1]-points[-3])
    return {'target':(points[-1]+axis*.65).tolist(),'offset':[.6,-8,.35],'span':3.6}
