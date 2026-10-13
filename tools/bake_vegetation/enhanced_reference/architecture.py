# Builds connected species-specific scaffold curves and unequal crown lobes.
import math
import numpy as np


def unit(v):
    return v/max(np.linalg.norm(v),1e-10)


def point(path,t):
    f=np.clip(t,0,1)*(len(path['points'])-1);i=min(int(f),len(path['points'])-2);f-=i
    return path['points'][i]*(1-f)+path['points'][i+1]*f


def curve(start,end,radius,rng,parent=-1,bend=None,steps=12,tip=None):
    delta=end-start;length=np.linalg.norm(delta);side=unit(np.cross(delta,[0,0,1]))
    if np.linalg.norm(side)<.5:side=np.array([1.,0,0])
    bend=np.asarray(bend if bend is not None else [0,0,length*.12]);t=np.linspace(0,1,steps)
    drift=rng.uniform(-.06,.06)*length;knots=rng.normal(0,.009*length,(6,3));knots[0]=knots[-1]=0
    noise=np.column_stack([np.interp(t,np.linspace(0,1,6),knots[:,k]) for k in range(3)])
    points=start[None,:]+t[:,None]*delta+np.sin(math.pi*t)[:,None]*(bend+side*drift)+noise
    endradius=min(tip if tip is not None else max(radius*.055,.0005),radius*.65)
    radii=endradius+(radius-endradius)*(1-t)**1.2
    return {'points':points,'radii':radii,'parent':parent,'phase':float(rng.random()),'basal':False}


def scaffold(p,variant):
    if 'growth' in p:
        from growth import scaffold as grown_scaffold
        return grown_scaffold(p,variant)
    rng=np.random.default_rng(p['seed']+variant*191);h=p['height']*[1,.91,1.06][variant-1];r=p['radius']*[1,1.09,.94][variant-1]
    base=p['trunkRadius'];paths=[];arms=[];habit=p['habit'];clear=h*p['clear'];lobes=[]
    def add(path):paths.append(path);return len(paths)-1
    if habit=='shrub':
        leaders=[]
        for i in range(p['leaders']):
            angle=i*2.39996+rng.uniform(-.35,.35);out=np.array([math.cos(angle),math.sin(angle),0.]);reach=r*rng.uniform(.35,.72)
            start=out*rng.uniform(.07,.28);start[2]=-.07
            end=out*reach;end[2]=h*rng.uniform(.60,.93)
            path=curve(start,end,base*rng.uniform(.7,1.35),rng,bend=-out*.2+np.array([0,0,.17]),steps=20);path['basal']=True;leaders.append(add(path))
        for i in range(p['arms']):
            parent=leaders[i%len(leaders)];t=rng.uniform(.27,.80);start=point(paths[parent],t)
            angle=math.atan2(start[1],start[0])+rng.uniform(-1.2,1.2);out=np.array([math.cos(angle),math.sin(angle),0.])
            end=out*rng.uniform(.65,1.05)*r;end[2]=h*rng.uniform(.38,.88)
            arms.append(add(curve(start,end,base*.48,rng,parent,steps=10)))
        arms+=leaders
    else:
        end=np.array([rng.uniform(-.25,.25),rng.uniform(-.25,.25),h*(.95 if habit=='pyramidal' else .67)])
        trunk=curve(np.array([0.,0,-.13]),end,base,rng,steps=38,bend=[.20,-.17,.0]);trunk['basal']=True;trunk['radii']=base*(1-np.linspace(0,1,38)*.93)**.85
        leader=add(trunk);leaders=[leader]
        if habit!='pyramidal':
            for i in range(p['leaders']):
                angle=i*math.tau/p['leaders']+rng.uniform(-.28,.28);out=np.array([math.cos(angle),math.sin(angle),0.]);t=.32+i*.075+rng.uniform(-.025,.025)
                start=point(trunk,t);reach=r*rng.uniform(*p.get('leaderReach',[.43,.75]));end=out*reach;end[2]=h*rng.uniform(*p.get('leaderHeight',[.80,.98]))
                bend=-out*r*(.16 if habit=='vase' else .07)+np.array([0,0,h*.04])
                leaders.append(add(curve(start,end,base*rng.uniform(.40,.58)*(1-t*.4),rng,leader,bend,steps=25)))
            arms.extend(leaders[1:])
        stations=np.cumsum(rng.uniform(.55,1.5,p['arms']));stations=.13+.75*stations/stations[-1]
        for i in range(p['arms']):
            angle=i*2.399963+rng.uniform(-.3,.3);out=np.array([math.cos(angle),math.sin(angle),0.])
            if habit=='pyramidal':
                t=stations[i];parent=0;start=point(trunk,t)
                crown_t=(start[2]-clear)/(h-clear);reach=r*max(.15,(1-crown_t)**.62)*rng.uniform(.83,1.12)
                end=out*reach;end[2]=start[2]+h*rng.uniform(.09,.17)
            else:
                parent=leaders[1+i%p['leaders']] if i>=4 else 0;t=rng.uniform(.23,.72) if parent else rng.uniform(.29,.61);start=point(paths[parent],t)
                if habit=='vase':
                    end=out*r*rng.uniform(.74,1.05);end[2]=h*rng.uniform(*p.get('upperArmHeight',[.53,.82]))
                else:
                    end=out*r*rng.uniform(.70,1.04);end[2]=h*rng.uniform(.31,.45) if i<5 else h*rng.uniform(*p.get('upperArmHeight',[.48,.79]))
            pr=float(np.interp(t,np.linspace(0,1,len(paths[parent]['radii'])),paths[parent]['radii']))
            bend=np.array([0.,0,h*(.065 if habit=='vase' else .035)])
            arms.append(add(curve(start,end,min(pr*.6,base*.32),rng,parent,bend,steps=18)))
    for arm_id in arms:
        arm=paths[arm_id];axis=unit(arm['points'][-1]-arm['points'][0]);side=unit(np.cross(axis,[0,0,1]));side=side if np.linalg.norm(side)>.5 else np.array([1.,0,0])
        for j in range(p['lobes']):
            start=.14 if habit=='pyramidal' else .27
            t=start+(.98-start)*(j+rng.uniform(.0,.8))/p['lobes'];anchor=point(arm,t);sign=-1 if j%2 else 1
            spread=r*p.get('crownSpread',.26 if habit=='shrub' else .19 if habit=='pyramidal' else .16)*rng.uniform(.60,1.10)
            center=anchor+side*sign*spread+axis*rng.uniform(.15,.75)*spread+np.array([0,0,spread*rng.uniform(-.65,.75)])
            radius=spread*rng.uniform(.75,1.10);parent_radius=float(np.interp(t,np.linspace(0,1,len(arm['radii'])),arm['radii']))
            connector=curve(anchor,center,min(parent_radius*.58,radius*.035),rng,arm_id,steps=9,tip=.008 if habit!='shrub' else .003)
            connector_id=add(connector)
            lobes.append({'center':center,'radius':radius,'parent':connector_id,'axis':axis,'side':side})
    return paths,lobes,rng,{'heightTarget':h,'radiusTarget':r,'clearBoleTarget':clear,'habit':habit}
