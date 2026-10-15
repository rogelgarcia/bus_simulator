# Grows an open oak crown through staggered ascending scaffolds and unequal outward successors.
import math
import numpy as np
from architecture import unit
from plane_growth import successor,forward_heading


def ascending_heading(direction,minimum=.20):
    direction=unit(direction);angle=math.asin(float(direction[2]));delta=angle-minimum
    angle=minimum+.5*(delta+math.sqrt(delta*delta+.012*math.cos(angle)**2))
    horizontal=unit(np.r_[direction[:2],0.])
    return horizontal*math.cos(angle)+np.array([0.,0.,math.sin(angle)])


def crown_profile(points):
    angles=np.arange(36)*math.pi/36
    projection=points[:,:2]@np.column_stack([np.cos(angles),np.sin(angles)]).T
    low,high=np.quantile(projection,[.01,.99],axis=0);widths=high-low
    bottom,top=np.quantile(points[:,2],[.01,.99])
    return {'minimumWidth':float(widths.min()),'maximumWidth':float(widths.max()),
            'widthAspect':float(widths.min()/widths.max()),'crownDepth':float(top-bottom),
            'crownBase':float(bottom),'height':float(top),'widthToHeight':float(widths.min()/top)}


def scaffold(p,variant):
    from growth import extend,demand_radii
    rng=np.random.default_rng(p['seed']+variant*191);g=p['growth']
    h=p['height']*[1,.93,1.06][variant-1];r=p['radius']*[1,1.06,.96][variant-1]
    first=h*g['firstFork'];phase=rng.uniform(0,math.tau);paths=[];lobes=[];launches=[]
    tip=np.array([rng.uniform(-.10,.10),rng.uniform(-.10,.10),first])
    bole=extend(paths,-1,-1,tip,[.025,-.015,1],rng,'bole',0,36)
    paths[bole]['junctionMode']='inherited-tangent'

    def ramify(parent,direction,length,depth,order,guide,roll,role='successor',node=None):
        direction=ascending_heading(forward_heading(direction,guide))
        child=successor(paths,parent,paths[parent]['points'][-1 if node is None else node]+direction*length,rng,order,role,guide,node)
        if depth<=2:
            path=paths[child];radius=rng.uniform(.84,1.13)
            path['demand']+=radius**2/len(path['demand']);path['demand'][-1]+=.10*radius**2
            lobes.append({'center':path['points'][-1].copy(),'radius':radius,'parent':child,
                          'parentNode':len(path['points'])-1,'axis':direction,
                          'side':unit(np.cross(direction,[0,0,1])),'spray':True})
        if depth==0:return child
        side=unit(np.cross(direction,[0,0,1]));across=unit(np.cross(side,direction))
        plane=side*math.cos(roll)+across*math.sin(roll)
        if role=='scaffold':
            for bud,station in enumerate([.30,.53,.76]):
                bud_roll=roll+bud*2.39996+rng.uniform(-.12,.12)
                lateral=side*math.cos(bud_roll)+across*math.sin(bud_roll)
                heading=unit(direction*.66+lateral*.82+[0,0,.12])
                node=round((station+rng.uniform(-.025,.025))*(len(paths[child]['points'])-1))
                ramify(child,heading,length*rng.uniform(.48,.62),2,order+1,heading,bud_roll,'interstitial',node)
        for sign,angle,scale in [(1,rng.uniform(.09,.23),rng.uniform(.74,.83)),
                                 (-1,rng.uniform(.46,.74),rng.uniform(.58,.73))]:
            heading=unit(direction*math.cos(angle)+plane*sign*math.sin(angle)+guide*.10+[0,0,.025])
            ramify(child,heading,length*scale,depth-1,order+1,unit(direction*.8+guide*.2),roll+sign*2.39996+rng.uniform(-.4,.4))
        return child

    for leader_index in range(3):
        angle=phase+leader_index*math.tau/3+rng.uniform(-.13,.13)
        radial=np.array([math.cos(angle),math.sin(angle),0.])
        direction=unit(radial*.38+[0,0,1])
        leader=successor(paths,bole,tip+direction*h*rng.uniform(.065,.085),rng,1,'codominant')
        for level in range(3):
            azimuth=angle+(level-1)*math.tau/9+rng.uniform(-.10,.10)
            elevation=[.46,.66,.86][level]+rng.uniform(-.04,.07)
            heading=unit([math.cos(azimuth),math.sin(azimuth),elevation])
            length=r*[.35,.31,.25][level]*rng.uniform(.93,1.08)
            launches.append(ramify(leader,heading,length,5,level+2,heading,rng.uniform(0,math.tau),'scaffold'))
            rise=h*[.125,.115,.105][level]*rng.uniform(.92,1.08)
            direction=unit(radial*rng.uniform(.20,.36)+[0,0,1])
            leader=successor(paths,leader,paths[leader]['points'][-1]+direction*rise,rng,level+2,'codominant')
        heading=unit(radial*.36+[0,0,1])
        launches.append(ramify(leader,heading,h*.065*rng.uniform(.92,1.06),4,5,heading,rng.uniform(0,math.tau),'scaffold'))
    stats=demand_radii(paths,g['basalRadius'],g['pipeExponent'])
    stats.update({'architecture':'open-oak','firstFork':tip.tolist(),'structuralPaths':len(paths),
                  'majorScaffolds':len(launches),'scaffoldLaunchPaths':launches,
                  'intermediateOffshoots':sum(path['growthRole']=='interstitial' for path in paths),
                  'successorGuide':'Locally updated parent direction; rotating intermediate buds around the limb axis; smooth ascending bias preserves horizontal bearing',
                  'maximumBranchOrder':max(path['order'] for path in paths),'terminalWoodPaths':len(lobes),
                  'crownBoundary':'none','crownSupportProfile':crown_profile(np.array([l['center'] for l in lobes])),
                  'growthMethod':'Three unequal ascending axes with staggered spreading scaffolds, all-around intermediate offshoots, five fork orders, inherited tangents and descendant-demand radii; not physiological simulation'})
    return paths,lobes,rng,{'heightTarget':h,'radiusTarget':r,'clearBoleTarget':first,'habit':p['habit'],'growth':stats}
