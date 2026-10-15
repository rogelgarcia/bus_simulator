# Grows guided scaffold successors and accumulates crown demand through shared fork nodes.
import math
import numpy as np
from architecture import unit,curve


def extend(paths,parent,node,end,direction,rng,role,order,steps=22):
    start=paths[parent]['points'][node].copy() if parent>=0 else np.array([0.,0,-.14])
    end=np.asarray(end,float);length=np.linalg.norm(end-start);position=start.copy();heading=unit(direction);drift=np.zeros(3);points=[start.copy()]
    for i in range(1,steps):
        drift=drift*.78+rng.normal(0,.035,3)
        desired=unit(end-position)
        heading=unit(heading*.78+desired*.24+np.array([0,0,.013])+drift*.13)
        position=position+heading*length/(steps-1);points.append(position.copy())
    points=np.asarray(points);t=np.linspace(0,1,steps);points+=(end-points[-1])*t[:,None]**2
    path={'points':points,'radii':np.ones(steps)*.01,'parent':parent,'parentNode':node,'phase':paths[parent]['phase'] if parent>=0 else float(rng.random()),
          'basal':parent<0,'growthRole':role,'order':order,'age':max(1,32-order*6),'demand':np.full(steps,.003),'continuation':role=='leader'}
    paths.append(path);return len(paths)-1


def demand_radii(paths,base,exponent):
    own=[p['demand'].copy() for p in paths];flow=[d.copy() for d in own]
    for i in reversed(range(len(paths))):
        flow[i]=np.cumsum(flow[i][::-1])[::-1]
        if paths[i]['parent']>=0:flow[paths[i]['parent']][paths[i]['parentNode']]+=flow[i][0]
    scale=base/flow[0][0]**(1/exponent);residual=0.
    for i,p in enumerate(paths):
        p['radii']=np.maximum(np.asarray(p.get('historicalRadii',np.zeros(len(flow[i])))),scale*flow[i]**(1/exponent))
        p['supportedDemand']=float(flow[i][0]);p['historicalDemand']=float(flow[i][0]);p.pop('demand')
        if p['parent']>=0:
            support=paths[p['parent']]['radii'][p['parentNode']]
            if p['radii'][0]>support+1e-9:raise RuntimeError('Child wood exceeds its support')
        if not np.isfinite(p['radii']).all() or np.min(p['radii'])<=0:raise RuntimeError('Invalid growth radii')
    children={}
    for i,p in enumerate(paths):
        if p['parent']>=0:children.setdefault((p['parent'],p['parentNode']),[]).append(i)
    for (parent,node),ids in children.items():
        below=flow[parent][node];above=(flow[parent][node+1] if node+1<len(flow[parent]) else 0)+sum(flow[i][0] for i in ids)+own[parent][node]
        residual=max(residual,abs(below-above)/max(below,1e-9))
    return {'pipeExponent':exponent,'rootRadius':base,'rootDemand':float(flow[0][0]),'maximumConservationResidual':residual,'sharedForkCount':sum(len(ids)>1 for ids in children.values())}


def scaffold(p,variant):
    if p['growth'].get('architecture')=='open-oak':
        from oak_growth import scaffold as oak_scaffold
        return oak_scaffold(p,variant)
    if p['growth'].get('architecture')=='conical-linden':
        from linden_growth import scaffold as linden_scaffold
        return linden_scaffold(p,variant)
    if p['growth'].get('architecture')=='distributed-plane':
        from plane_growth import scaffold as plane_scaffold
        return plane_scaffold(p,variant)
    rng=np.random.default_rng(p['seed']+variant*191);g=p['growth'];h=p['height']*[1,.91,1.06][variant-1];r=p['radius']*[1,1.09,.94][variant-1]
    paths=[];arms=[];lobes=[];phase=rng.uniform(0,math.tau);first=h*g['firstFork'];tip=np.array([rng.uniform(-.22,.22),rng.uniform(-.22,.22),first])
    trunk=extend(paths,-1,-1,tip,[.07,-.03,1],rng,'bole',0,26)
    if p['habit']=='pyramidal':
        parent=trunk
        for level in range(9):
            station=level/9;anchor=paths[parent]['points'][-1];angle=phase+level*2.39996+rng.uniform(-.25,.25);out=np.array([math.cos(angle),math.sin(angle),0.])
            reach=r*(1-station)**.65;end=out*reach*.51;end[2]=anchor[2]+h*.075
            limb=extend(paths,parent,len(paths[parent]['points'])-1,end,out*.8+[0,0,.75],rng,'scaffold',1,18)
            arms.append((limb,3,.55))
            for fan in [-1,0,1]:
                a=angle+fan*.45+rng.uniform(-.10,.10);end=np.array([math.cos(a)*reach,math.sin(a)*reach,anchor[2]+h*rng.uniform(.13,.19)])
                child=extend(paths,limb,len(paths[limb]['points'])-1,end,out*.9+[0,0,.6],rng,'secondary',2,18)
                arms.append((child,8,.22))
            end=np.array([math.sin(phase+station*2)*r*.04,math.cos(phase+station*2)*r*.04,h*(g['firstFork']+(level+1)*(.92-g['firstFork'])/9)])
            parent=extend(paths,parent,len(paths[parent]['points'])-1,end,[.04,-.02,1],rng,'leader',0,12)
        arms.append((parent,9,.15))
    else:
        for half in range(2):
            angle=phase+half*math.pi+rng.uniform(-.20,.20);out=np.array([math.cos(angle),math.sin(angle),0.])
            end=out*r*rng.uniform(.20,.28);end[2]=h*(.40+half*.055+rng.uniform(-.015,.015))
            leader=extend(paths,trunk,len(paths[trunk]['points'])-1,end,out*.48+[0,0,1],rng,'leader',1,22)
            for fork in range(2):
                a=angle+(-.67 if fork==0 else .72)+rng.uniform(-.13,.13);direction=np.array([math.cos(a),math.sin(a),0.])
                end=direction*r*rng.uniform(.46,.57);end[2]=h*(.53+fork*.09+half*.025)
                limb=extend(paths,leader,len(paths[leader]['points'])-1,end,direction*.9+[0,0,.70],rng,'scaffold',2,20)
                arms.append((limb,4,.60))
                for fan in range(3):
                    b=a+(fan-1)*.42+rng.uniform(-.1,.1);reach=r*([1.,.66,.91][fan])*rng.uniform(.94,1.04)
                    end=np.array([math.cos(b)*reach,math.sin(b)*reach,h*([.58,.86,.74][fan]+half*.015+rng.uniform(-.025,.025))])
                    child=extend(paths,limb,len(paths[limb]['points'])-1,end,direction*.8+[0,0,.55],rng,'secondary',3,20)
                    arms.append((child,12 if p['habit']=='spreading' else 14,.23))
    for arm_id,count,start in arms:
        arm=paths[arm_id];axis=unit(arm['points'][-1]-arm['points'][0]);side=unit(np.cross(axis,[0,0,1]));side=side if np.linalg.norm(side)>.5 else np.array([1.,0,0])
        for j in range(count):
            node=min(len(arm['points'])-3,max(1,round((start+(.98-start)*(j+rng.uniform(.05,.95))/count)*(len(arm['points'])-1))))
            anchor=arm['points'][node];spread=r*p.get('crownSpread',.19 if p['habit']=='pyramidal' else .16)*rng.uniform(.65,1.12)
            center=anchor+side*(-1 if j%2 else 1)*spread+axis*rng.uniform(.1,.55)*spread+[0,0,spread*rng.uniform(-.40,.60)]
            radius=spread*rng.uniform(.8,1.08);arm['demand'][node]+=radius**2*rng.uniform(.85,1.15)
            lobes.append({'center':center,'radius':radius,'parent':arm_id,'parentNode':node,'axis':axis,'side':side})
    stats=demand_radii(paths,g['basalRadius'],g['pipeExponent']);structural=len(paths)
    if stats['maximumConservationResidual']>1e-10:raise RuntimeError('Growth demand is not conserved')
    for lobe in lobes:
        parent=lobe['parent'];node=lobe['parentNode'];arm=paths[parent];connector=curve(arm['points'][node],lobe['center'],min(arm['radii'][node]*.48,lobe['radius']*.040),rng,parent,steps=10,tip=.008)
        connector['phase']=arm['phase'];paths.append(connector);lobe['parent']=len(paths)-1
    stats.update({'structuralPaths':structural,'firstFork':tip.tolist(),'growthMethod':'Guided successor growth and downstream crown-demand thickening; not a full physiological or strand simulation'})
    return paths,lobes,rng,{'heightTarget':h,'radiusTarget':r,'clearBoleTarget':first,'habit':p['habit'],'growth':stats}
