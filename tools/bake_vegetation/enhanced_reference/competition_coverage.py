# Keeps useful foliage when considering whole-shoot removal, using fixed model-space projections.
import numpy as np


class CoverageGuard:
    def __init__(self,centers,matrices,leaf_length,policy):
        self.policy=policy;self.views=[]
        matrices=np.asarray(matrices);self.areas=np.linalg.norm(np.cross(matrices[:,:,0],matrices[:,:,1]),axis=1)
        self.total_area=float(self.areas.sum());self.removed_area=0.
        grid=np.array([(x,y) for x in np.linspace(-.42,.42,5) for y in np.linspace(-.46,.46,5) if (x/.46)**2+(y/.50)**2<=1])
        samples=np.asarray(centers)[:,None,:]+np.einsum('nij,kj->nki',np.asarray(matrices)[:,:,:2],grid)
        for angle in [0,np.pi/4,np.pi/2,3*np.pi/4,None]:
            basis=np.array([[1,0,0],[0,1,0]]) if angle is None else np.array([[np.cos(angle),np.sin(angle),0],[0,0,1]])
            projected=samples@basis.T;low=projected.min(axis=(0,1));cell=leaf_length*.32
            xy=np.floor((projected-low)/cell).astype(np.int32);size=xy.max(axis=(0,1))+1
            packed=xy[:,:,0]+xy[:,:,1]*size[0]
            pairs=np.unique(np.column_stack([np.repeat(np.arange(len(centers)),len(grid)),packed.ravel()]),axis=0)
            ids,inverse=np.unique(pairs[:,1],return_inverse=True);counts=np.bincount(inverse);regions=np.minimum(2,(ids%size[0])*3//size[0])+3*np.minimum(2,(ids//size[0])*3//size[1])
            original=np.bincount(regions,minlength=9)
            cells=np.split(inverse,np.cumsum(np.bincount(pairs[:,0],minlength=len(centers)))[:-1])
            self.views.append({'cells':cells,'counts':counts,'regions':regions,'original':original,'lost':np.zeros(9,int),'total':len(ids)})

    def remove(self,indices):
        if not len(indices):return True
        area=float(self.areas[indices].sum())
        if self.removed_area+area>self.total_area*self.policy['maximumRemovedAreaFraction']:return False
        changes=[]
        for view in self.views:
            cells,counts=np.unique(np.concatenate([view['cells'][i] for i in indices]),return_counts=True)
            gone=cells[view['counts'][cells]==counts];loss=np.bincount(view['regions'][gone],minlength=9);total=view['lost']+loss
            if total.sum()>view['total']*(1-self.policy['minimumProjectedRetention']):return False
            relevant=view['original']>view['total']*.015
            if np.any(total[relevant]>view['original'][relevant]*self.policy['maximumLocalLoss']):return False
            changes.append((view,cells,counts,loss))
        for view,cells,counts,loss in changes:view['counts'][cells]-=counts;view['lost']+=loss
        self.removed_area+=area
        return True

    def proof(self):
        return {'method':'Leaf-footprint samples in four fixed horizontal azimuths and top view; model-space proxy, independent of render cameras',
                'policy':self.policy,'removedLeafAreaFraction':self.removed_area/self.total_area,
                'projectedRetention':[1-float(v['lost'].sum()/v['total']) for v in self.views]}


def select_removals(decisions,shoot_ids,centers,matrices,leaf_length,policy):
    guard=CoverageGuard(centers,matrices,leaf_length,policy);shoot_ids=np.asarray(shoot_ids);accepted=[]
    ids={r['path']:np.flatnonzero(shoot_ids==r['path']) for r in decisions}
    for row in sorted(decisions,key=lambda r:(len(ids[r['path']]),-r['competingFraction'],r['path'])):
        if guard.remove(ids[row['path']]):accepted.append(row)
    return {r['path'] for r in accepted},accepted,guard.proof()
