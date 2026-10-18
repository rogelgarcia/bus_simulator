# Checks branch-owned leaf density and connected, separated placements under rotated crown regions.
import copy
import json
import sys
import unittest
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/bake_vegetation/enhanced_reference'))
from elm_leaf_distribution import ClusterLeafLayout
from spray_foliage import place_leaves
from architecture import point


class ElmBalanceTests(unittest.TestCase):
    def test_branch_dome_faces_all_sides_and_top_without_camera(self):
        policy={'domeMinimumRise':.18,'domeTopWeight':.48}
        region={'id':0,'center':[5.,2.,12.],'basis':np.eye(3).tolist(),'radii':[3.,2.,1.5]}
        layout=ClusterLeafLayout([region],policy)
        for angle in np.linspace(0,2*np.pi,16,endpoint=False):
            side=np.array([np.cos(angle),np.sin(angle),0.])
            point=np.array(region['center'])+side*np.array(region['radii'])
            normal=layout.face(point,0)
            self.assertGreater(np.dot(normal,side),.94);self.assertLess(normal[2],.25)
            self.assertGreaterEqual(layout.face(point-[0,0,1.5],0)[2],0.)
        np.testing.assert_allclose(layout.face(np.array(region['center'])+[0,0,1.5],0),[0,0,1])
        moved={**region,'center':[-8.,-4.,8.]}
        other=ClusterLeafLayout([moved],policy)
        np.testing.assert_allclose(layout.face(np.array(region['center'])+[1,1,.3],0),other.face(np.array(moved['center'])+[1,1,.3],0))

    def test_rotated_region_preserves_density_and_turns_spray_face(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['american_elm']
        region={'id':0,'center':[4.,0.,12.],'basis':np.eye(3).tolist(),'radii':[2.,1.,1.5]}
        layout=ClusterLeafLayout([region],p['foliageBalance']);angle=.71
        rotation=np.array([[np.cos(angle),-np.sin(angle),0],[np.sin(angle),np.cos(angle),0],[0,0,1]])
        rotated={**region,'center':(rotation@region['center']).tolist(),'basis':rotation.tolist()}
        other=ClusterLeafLayout([rotated],p['foliageBalance'])
        sample=np.array([[4.3,.7,12.2],[6.5,.5,13.1],[7.5,1.3,11.9]])
        np.testing.assert_allclose(layout.density(sample,0),other.density(sample@rotation.T,0),atol=1e-10)
        np.testing.assert_allclose(layout.face(sample[0],0)@rotation.T,other.face(sample[0]@rotation.T,0),atol=1e-10)

    def test_fan_direction_uses_sibling_twigs_and_is_order_independent(self):
        layout=ClusterLeafLayout([{'id':0,'center':[4.,0.,12.],'basis':np.eye(3).tolist(),'radii':[2.,2.,2.]}],{'domeMinimumRise':.18,'domeTopWeight':.48})
        paths=[{'points':[[4,1,12],[4,2,12]],'crownCluster':0},{'points':[[5,0,12],[6,0,12]],'crownCluster':0}]
        shoots=[{'id':0,'group':3},{'id':1,'group':3}]
        face=layout.fan_faces(paths,shoots)[3]
        np.testing.assert_allclose(face,layout.fan_faces(paths,shoots[::-1])[3])
        self.assertGreater(face[0],.65);self.assertGreater(face[1],.65)

    def test_fill_stays_attached_and_rejects_overlap(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['american_elm']
        layout=ClusterLeafLayout([{'id':0,'center':[4.,0.,12.],'basis':np.eye(3).tolist(),'radii':[2.,2.,2.]}],p['foliageBalance'])
        paths=[{'points':np.column_stack([np.full(19,4.+i*.03),np.linspace(-.9,.9,19),np.full(19,12.)]),'shootDepth':0,'shootTerminal':True,'crownCluster':0,'sprayNormal':[.7,0,.7]} for i in range(3)]
        shoots=[{'id':i,'group':i} for i in range(3)]
        leaves,proof=place_leaves(p,copy.deepcopy(paths),shoots,np.random.default_rng(91),layout)
        self.assertGreater(proof['candidateLeavesRejected'],0);self.assertGreaterEqual(proof['minimumAcceptedProxyClearance'],.8)
        for leaf in leaves:np.testing.assert_allclose(leaf['origin'],point(paths[leaf['shoot']],leaf['attachment']),atol=1e-10)
        far=copy.deepcopy(paths)
        for path in far:path['points'][:,0]+=6.
        fringe,fringe_proof=place_leaves(p,far,shoots,np.random.default_rng(91),layout)
        self.assertGreater(proof['candidateNodes'],fringe_proof['candidateNodes']*1.5)
        self.assertGreater(len(leaves),len(fringe))


if __name__=='__main__':unittest.main()
