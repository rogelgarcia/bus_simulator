# Uses branch-owned crown regions to favour leafy cluster bodies over diffuse terminal fringes.
import numpy as np
from architecture import unit


class ClusterLeafLayout:
    def __init__(self,regions,policy):
        self.regions={r['id']:r for r in regions};self.policy=policy

    def distance(self,points,cluster):
        region=self.regions[cluster]
        local=(np.asarray(points)-region['center'])@np.asarray(region['basis'])/region['radii']
        return np.linalg.norm(local,axis=-1)

    def density(self,points,cluster):
        distance=self.distance(points,cluster)
        return np.interp(distance,[0,.50,1.12,1.70,2.5],self.policy['densityWeights'])

    def face(self,point,cluster):
        region=self.regions[cluster];basis=np.asarray(region['basis']);radii=np.asarray(region['radii'])
        gradient=basis@(((np.asarray(point)-region['center'])@basis)/radii**2)
        horizontal=np.linalg.norm(gradient[:2])
        if np.linalg.norm(gradient)<1e-9:gradient=basis[:,0].copy();horizontal=1.
        gradient[2]=horizontal*self.policy['domeMinimumRise']+max(0.,gradient[2])*self.policy['domeTopWeight']
        return unit(gradient)

    def fan_faces(self,paths,shoots):
        groups={}
        for shoot in shoots:
            path=paths[shoot['id']];entry=groups.setdefault(shoot['group'],{'cluster':path['crownCluster'],'points':[]})
            entry['points'].append(np.asarray(path['points']).mean(axis=0))
        return {group:self.face(np.mean(entry['points'],axis=0),entry['cluster']) for group,entry in groups.items()}

    def distribution(self,centers,clusters):
        centers=np.asarray(centers);clusters=np.asarray(clusters);distance=np.empty(len(centers))
        for cluster in np.unique(clusters):
            ids=clusters==cluster;distance[ids]=self.distance(centers[ids],int(cluster))
        return {'clusterBodyLeaves':int(np.count_nonzero(distance<=1.35)),
                'fringeLeaves':int(np.count_nonzero(distance>1.35)),
                'distantFringeLeaves':int(np.count_nonzero(distance>1.70))}
