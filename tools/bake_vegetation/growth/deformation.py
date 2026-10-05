# Applies invertible, nonperiodic species growth sweeps with a pinned root plane.
import math
import numpy as np


class GrowthField:
    def __init__(self,profile,variant):
        self.height=variant['height'];self.profile=profile
        rng=np.random.default_rng(variant['seed']+588)
        self.knots=np.array([0,.02,.07,.15,.25,.40,.65,1.0])*self.height
        shape=np.array([[0,0],[0,0],[.26,.06],[.90,.10],[.55,-.18],[1.10,.08],[.83,.19],[1.25,0.]])
        shape[2:]*=rng.uniform(.75,1.25,(6,2));shape[2:,1]+=rng.uniform(-.12,.12,6)
        angle=rng.uniform(0,math.tau);rotation=np.array([[math.cos(angle),-math.sin(angle)],[math.sin(angle),math.cos(angle)]])
        self.values=shape@rotation.T*profile['sweepMetres']*rng.uniform(.85,1.15)
        self.slopes=np.gradient(self.values,self.knots,axis=0);self.slopes[0]=0;self.slopes[1]=0
        self.turn=math.radians(profile['turnDegrees'])*rng.choice([-1,1])*rng.uniform(.8,1.2)
        self.fan=profile['crownFan']*rng.uniform(.85,1.15)

    def shift(self,z):
        z=np.maximum(z,0);i=np.searchsorted(self.knots,z,side='right')-1;i=np.clip(i,0,len(self.knots)-2)
        span=self.knots[i+1]-self.knots[i];t=np.clip((z-self.knots[i])/span,0,1)
        a=(2*t**3-3*t**2+1)[:,None];b=(t**3-2*t**2+t)[:,None]
        c=(-2*t**3+3*t**2)[:,None];d=(t**3-t**2)[:,None]
        return a*self.values[i]+b*span[:,None]*self.slopes[i]+c*self.values[i+1]+d*span[:,None]*self.slopes[i+1]

    def __call__(self,points):
        p=np.asarray(points,dtype=np.float64);z=p[:,2];t=np.clip(z/self.height,0,1)
        smooth=t*t*(3-2*t);angle=self.turn*smooth
        scale=1+self.fan*smooth
        c,s=np.cos(angle)*scale,np.sin(angle)*scale
        result=p.copy();result[:,0]=c*p[:,0]-s*p[:,1];result[:,1]=s*p[:,0]+c*p[:,1]
        result[:,:2]+=self.shift(z)
        return result

    def jacobian(self,points):
        p=np.asarray(points,dtype=np.float64);columns=[];step=1e-4
        for axis in range(3):
            delta=np.zeros(3);delta[axis]=step
            columns.append((self(p+delta)-self(p-delta))/(2*step))
        return np.stack(columns,axis=2)

    def describe(self):
        axis=np.column_stack([np.zeros(401),np.zeros(401),np.linspace(0,self.height,401)])
        curve=self(axis);chord=curve[0]+np.linspace(0,1,len(axis))[:,None]*(curve[-1]-curve[0])
        jac=self.jacobian(axis)
        if np.linalg.det(jac).min()<=0:raise RuntimeError('Growth field is not orientation preserving')
        return {'habit':self.profile['habit'],'knotsMetres':self.knots.tolist(),'offsetsMetres':self.values.tolist(),
                'axisSweepMetres':float(np.linalg.norm(curve[:,:2],axis=1).max()),
                'axisDeviationFromChordMetres':float(np.linalg.norm(curve-chord,axis=1).max()),
                'minimumAxisJacobian':float(np.linalg.det(jac).min()),'crownFan':self.fan,'turnRadians':self.turn,
                'rootPlanePinned':True,'interpretation':'Artist-selected growth variation guided by cited habit, not measured species curvature'}
