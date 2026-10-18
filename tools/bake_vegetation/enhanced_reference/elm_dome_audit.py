# Reconstructs branch-local fan directions and checks saved leaf transforms across the entire crown.
import json
import numpy as np
from mathutils import Euler
from common import array,foliage_data
from elm_leaf_distribution import ClusterLeafLayout


def inspect(foliage,meta,folder):
    graph=json.loads((folder/'architecture.json').read_text());paths=graph['paths']
    layout=ClusterLeafLayout(meta['dimensions']['growth']['crownClusters'],meta['foliageBalance']['policy'])
    expected=layout.fan_faces(paths,graph['shoots']);stored=meta['crowding']['sprayPlanes']
    error=max(np.linalg.norm(normal-stored[str(group)]) for group,normal in expected.items())
    data=foliage_data(foliage);normals=np.array([np.array(Euler(tuple(r)).to_matrix())[:,2] for r in data['rotations']])
    groups=array(foliage.data.attributes['spray_id'].data,'value',dtype=np.int32)
    agreement=np.einsum('ij,ij->i',normals,np.array([expected[int(group)] for group in groups]))
    azimuth=np.linspace(0,2*np.pi,8,endpoint=False);directions=np.column_stack([np.cos(azimuth),np.sin(azimuth),np.zeros(8)])
    projected=np.average(abs(normals@directions.T),weights=data['scales'][:,0]**2,axis=0)
    sectors=[]
    for cluster in layout.regions:
        ids={s['group'] for s in graph['shoots'] if paths[s['id']]['crownCluster']==cluster}
        faces=np.array([expected[i] for i in ids]);side=faces[faces[:,2]<.65]
        bins=np.floor((np.arctan2(side[:,1],side[:,0])+np.pi)*8/(2*np.pi)).astype(int)%8
        sectors.append(len(np.unique(bins)))
    side_fraction=float(np.mean(abs(normals[:,2])<.65))
    return {'role':'branch-local dome directions','maximumFanFieldError':float(error),
            'minimumLeafFanAlignment':float(agreement.min()),'sideFacingLeafFraction':side_fraction,
            'sideSectorsPerCluster':sectors,'projectedLeafAreaFactors8Sides':projected.tolist(),
            'passed':bool(error<1e-6 and agreement.min()>.92 and side_fraction>.60 and min(sectors)==8)}
