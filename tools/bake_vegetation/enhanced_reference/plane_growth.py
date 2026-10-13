# Extends unequal apical shoots into open space; the crown emerges from their growth.
import math
import numpy as np
from architecture import unit


def forward_heading(direction,guide):
    direction=unit(direction);forward=float(direction@guide)
    if forward<.40:
        direction=guide*.40+unit(direction-guide*forward)*math.sqrt(1-.40**2)
    return direction


def successor(paths,parent,end,rng,order,role='successor',guide=None):
    previous=paths[parent];start=previous['points'][-1].copy();delta=end-start;length=np.linalg.norm(delta)
    incoming=unit(previous['points'][-1]-previous['points'][-3]);outgoing=unit(delta)
    controls=np.array([start,start+incoming*length*.19,end-outgoing*length*.27,end])
    t=np.linspace(0,1,max(12,round(length/.10)));u=t[:,None]
    points=(1-u)**3*controls[0]+3*(1-u)**2*u*controls[1]+3*(1-u)*u*u*controls[2]+u**3*controls[3]
    side=unit(np.cross(outgoing,[0,0,1]));points+=side*rng.uniform(-.025,.025)*length*(np.sin(math.pi*t)**2)[:,None]
    path={'points':points,'radii':np.ones(len(points))*.01,'parent':parent,'parentNode':len(previous['points'])-1,
          'phase':previous['phase'],'basal':False,'growthRole':role,'order':order,
          'demand':np.full(len(points),.00002),'junctionMode':'inherited-tangent'}
    if guide is not None:path['extensionGuide']=guide.tolist()
    paths.append(path);return len(paths)-1


def scaffold(p,variant):
    from growth import extend,demand_radii
    rng=np.random.default_rng(p['seed']+variant*191);g=p['growth'];h=p['height']*[1,.91,1.06][variant-1];r=p['radius']*[1,1.09,.94][variant-1]
    paths=[];lobes=[];first=h*g['firstFork'];tip=np.array([.10,-.10,first])
    bole=extend(paths,-1,-1,tip,[.025,-.025,1],rng,'bole',0,32);paths[bole]['junctionMode']='inherited-tangent'
    phase=rng.uniform(0,math.tau);launches=[]

    def grow(parent,direction,length,depth,order,guide,vigor,roll,role='successor'):
        direction=forward_heading(direction,guide);end=paths[parent]['points'][-1]+direction*length
        child=successor(paths,parent,end,rng,order,role,guide)
        if depth==0:
            path=paths[child];t=np.linspace(0,1,len(path['points']));radius=rng.uniform(.72,1.02)*vigor**.16
            path['demand']+=radius**2*(1-t)**.8/len(t);path['demand'][-1]+=.035*radius**2
            lobes.append({'center':end.copy(),'radius':radius,'parent':child,'parentNode':len(t)-1,
                          'axis':direction,'side':unit(np.cross(direction,[0,0,1])),'spray':True})
            return child
        side=unit(np.cross(direction,[0,0,1]));across=unit(np.cross(side,direction))
        plane=side*math.cos(roll)+across*math.sin(roll)
        major_angle=rng.uniform(.08,.23);minor_angle=rng.uniform(.48,.76)
        major=unit(direction*math.cos(major_angle)+plane*math.sin(major_angle)+guide*.10)
        minor=unit(direction*math.cos(minor_angle)-plane*math.sin(minor_angle)+guide*.08+[0,0,.035])
        grow(child,major,length*rng.uniform(.75,.84),depth-1,order+1,guide,vigor,roll+2.39996+rng.uniform(-.4,.4))
        grow(child,minor,length*rng.uniform(.54,.68),depth-1,order+1,guide,vigor*.74,roll-1.7+rng.uniform(-.5,.5))
        return child

    for half in range(2):
        angle=phase+half*math.pi+rng.uniform(-.22,.22);out=np.array([math.cos(angle),math.sin(angle),0.])
        heading=unit(out*(.20 if half==0 else .56)+[0,0,1])
        leader=successor(paths,bole,tip+heading*h*(.125 if half==0 else .153),rng,1,'codominant')
        for level in range(3):
            a=angle+[-.88,.82,-.22][level]*(1 if half==0 else -1)+rng.uniform(-.22,.22)
            direction=unit(np.array([math.cos(a),math.sin(a),[.18,.58,.91][level]+rng.uniform(-.05,.10)]))
            length=r*[.285,.260,.225][level]*rng.uniform(.86,1.12)
            launch=grow(leader,direction,length,5,level+2,direction,1.,rng.uniform(0,math.tau),'scaffold');launches.append(launch)
            heading=unit(out*rng.uniform(*((.12,.24) if half==0 else (.28,.46)))+np.array([rng.uniform(-.09,.09),rng.uniform(-.09,.09),1.]))
            step=h*rng.uniform(.112,.146)*(1.05 if half==0 else .97)
            if level<2:
                leader=successor(paths,leader,paths[leader]['points'][-1]+heading*step*.5,rng,level+2,'codominant')
                side=np.array([-out[1],out[0],0.]);inner=unit(-out*.40+side*(.22 if half==0 else -.18)+[0,0,1.])
                launch=grow(leader,inner,h*(.098 if level==0 else .112),3+level,level+3,inner,.88,rng.uniform(0,math.tau),'scaffold');launches.append(launch)
                step*=.5
            leader=successor(paths,leader,paths[leader]['points'][-1]+heading*step,rng,level+3,'codominant')
        direction=unit(out*(.15 if half==0 else .34)+np.array([rng.uniform(-.15,.15),rng.uniform(-.15,.15),1.]))
        launch=grow(leader,direction,h*rng.uniform(.073,.092),4,5,direction,1.1,rng.uniform(0,math.tau),'scaffold');launches.append(launch)
    stats=demand_radii(paths,g['basalRadius'],g['pipeExponent']);majors=[path for path in paths if path['growthRole']=='scaffold']
    centers=np.array([l['center'] for l in lobes]);stats.update({'architecture':'distributed-plane','majorScaffolds':len(majors),
        'scaffoldOriginHeights':[float(path['points'][0,2]) for path in majors],
        'crownSupportHeightQuantiles':np.quantile(centers[:,2],[.1,.5,.9]).tolist(),'structuralPaths':len(paths),
        'maximumBranchOrder':max(path['order'] for path in paths),'terminalWoodPaths':len(lobes),'firstFork':tip.tolist(),
        'crownBoundary':'none','scaffoldLaunchPaths':launches,
        'growthMethod':'Unconfined apical extension with unequal successor lengths, forward branching and descendant-demand radii; not a physiological simulation'})
    return paths,lobes,rng,{'heightTarget':h,'radiusTarget':r,'clearBoleTarget':first,'habit':p['habit'],'growth':stats}
