# Gives small basal stems a restrained continuous flare and buried root continuations.
import math
import numpy as np
from architecture import unit


def refine_roots(paths):
    for parent,stem in enumerate(paths):
        if not stem['basal']:continue
        radius=float(stem['radii'][0]);points=stem['points'];radii=stem['radii']
        subdivisions=np.unique(np.r_[np.arange(len(points)),np.linspace(0,1,9)])
        stem['points']=np.column_stack([np.interp(subdivisions,np.arange(len(points)),points[:,k]) for k in range(3)])
        stem['radii']=np.interp(subdivisions,np.arange(len(radii)),radii)
        stem['rootFlares']=[];stem['rootFlareHeight']=radius*2.2
        for root in [r for r in paths if r.get('root') and r['parent']==parent]:
            end=root['points'][-1].copy();end[2]=-.035
            start=np.array([np.interp(radius*2.,points[:,2],points[:,k]) for k in range(3)])
            outward=unit(np.r_[end[:2]-start[:2],0.]);t=np.linspace(0,1,17)[:,None]
            c1=start+[0,0,-radius*1.6];c2=end-outward*radius*1.3+[0,0,.020]
            root['points']=(1-t)**3*start+3*(1-t)**2*t*c1+3*(1-t)*t*t*c2+t**3*end
            root['radii']=.0015+(radius*.38-.0015)*(1-t[:,0])**1.2
            root['rootCollar']=True;root['phase']=stem['phase']
            stem['rootFlares'].append({'angle':math.atan2(outward[1],outward[0]),'strength':.60,'width':.58})
