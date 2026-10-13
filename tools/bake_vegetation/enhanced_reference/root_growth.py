# Continues the London plane's fluted root crown into tapering structural roots below grade.
import math
import numpy as np
from architecture import curve


def root_crown(paths,rng):
    bole=paths[0];base=float(bole['radii'][0]);origin=bole['points'][0].copy();origin[2]=0
    angles=np.arange(8)*math.tau/8+rng.uniform(-.17,.17,8)+rng.uniform(0,math.tau)
    bole['rootFlares']=[{'angle':float(a),'width':float(rng.uniform(.24,.34)),'strength':float(rng.uniform(.85,1.05))} for a in angles]
    bole['rootFlareHeight']=base*1.85
    for flare in bole['rootFlares']:
        angle=flare['angle'];out=np.array([math.cos(angle),math.sin(angle),0.])
        side=np.array([-out[1],out[0],0.]);node=int(np.argmin(abs(bole['points'][:,2]-base*rng.uniform(2.8,3.3))))
        start=bole['points'][node].copy();reach=base*rng.uniform(5.8,7.6)
        controls=np.array([start,origin+out*base*1.65+[0,0,base*1.85],origin+out*reach*.42+[0,0,-base*.38],origin+out*reach+side*base*rng.uniform(-.55,.55)+[0,0,-base*.23]])
        t=np.linspace(0,1,36);points=(1-t[:,None])**3*controls[0]+3*(1-t[:,None])**2*t[:,None]*controls[1]+3*(1-t[:,None])*t[:,None]**2*controls[2]+t[:,None]**3*controls[3]
        radii=base*(.009+rng.uniform(.46,.55)*(1-t)**1.15)
        distance=np.linalg.norm(points[:,:2]-start[:2],axis=1)
        points[:,2]=start[2]*np.exp(-(distance/(base*.76))**1.5)+radii*.05*(1-np.exp(-distance/base))-base*.23*(distance/distance[-1])**6
        ground=radii*.60+start[2]*np.exp(-(distance/(base*.88))**4)
        blend=np.maximum(0,1-abs(points[:,2]-ground)/(base*.04))
        points[:,2]=np.minimum(points[:,2],ground)-blend*blend*base*.01
        parent=len(paths);paths.append({'points':points,'radii':radii,'parent':0,'parentNode':node,'phase':bole['phase'],'basal':False,'root':True,'rootCrown':True})
        for split,sign in [(21,-1),(27,1)]:
            direction=out*math.cos(.38)+side*math.sin(.38)*sign;end=points[split]+direction*base*rng.uniform(2.0,3.1);end[2]=-.16
            child=curve(points[split],end,float(radii[split])*.64,rng,parent,bend=[0,0,-base*.09],steps=18,tip=.004)
            u=np.linspace(0,1,len(child['points']));child['points'][:,2]=points[split,2]*(1-u)**3+(child['radii']*.15-.006)*(1-(1-u)**3)-.045*u**8
            child.update(root=True,rootBranch=True,parentNode=split,phase=bole['phase']);child_id=len(paths);paths.append(child)
            for station in [9,13]:
                end=child['points'][station]+(direction+side*sign*.55)*base*rng.uniform(.8,1.6);end[2]=-.12
                twig=curve(child['points'][station],end,float(child['radii'][station])*.67,rng,child_id,bend=[0,0,-.035],steps=10,tip=.002)
                u=np.linspace(0,1,len(twig['points']));twig['points'][:,2]=child['points'][station,2]*(1-u)**3-.006*(1-(1-u)**3)-.025*u**8
                twig.update(root=True,rootBranch=True,parentNode=station,phase=bole['phase']);paths.append(twig)


def radial_flare(path,direction,height):
    angle=math.atan2(direction[1],direction[0]);z=max(0,height)
    lobes=sum(f['strength']*math.exp(-(math.atan2(math.sin(angle-f['angle']),math.cos(angle-f['angle']))/f['width'])**2) for f in path['rootFlares'])
    fade=max(0,1-(z/(path['radii'][0]*4.5))**2)**2
    return (.15+lobes)*math.exp(-z/path['rootFlareHeight'])*fade
