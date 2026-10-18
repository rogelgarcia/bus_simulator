# Regressions for redundant shoot competition, attached fan rotation and honest local coverage.
import sys
import copy
import json
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/bake_vegetation/enhanced_reference'))
from shoot_competition import redundant_shoots,compact_graph
from elm_fan_growth import orient_fans
from elm_leaf_distribution import ClusterLeafLayout
from canopy_visibility import compare,crown_envelope
from spray_foliage import place_leaves
from leaf_space import LeafSpace,clearance
from competition_coverage import CoverageGuard,select_removals
from shoot_competition import DEFAULT_POLICY,COVERAGE_POLICY


class FanGrowthTests(unittest.TestCase):
    def test_competition_guard_removes_duplicates_but_protects_unique_leaf_space(self):
        centers=np.array([[0,0,0],[0,0,0],[2,0,1]],float);matrices=np.repeat(np.eye(3)[None]*.2,3,axis=0)
        guard=CoverageGuard(centers,matrices,.2,{**COVERAGE_POLICY,'maximumRemovedAreaFraction':1.})
        self.assertTrue(guard.remove([0]));self.assertFalse(guard.remove([1]));self.assertFalse(guard.remove([2]))
        self.assertEqual(guard.proof()['projectedRetention'],[1.]*5)

    def test_opposite_pairs_are_removed_as_whole_shoots(self):
        centers=np.array([[0,-.1,0],[0,.1,0],[0,-.1,0],[0,.1,0]],float);matrices=np.repeat(np.eye(3)[None]*.2,4,axis=0)
        removed,_,proof=select_removals([{'path':1,'strongerPath':2,'competingFraction':1}], [1,1,2,2],centers,matrices,.2,{**COVERAGE_POLICY,'maximumRemovedAreaFraction':1.})
        self.assertEqual(removed,{1});self.assertEqual(proof['projectedRetention'],[1.]*5)

    def test_leaf_area_budget_limits_pruning_when_occupancy_hides_duplicates(self):
        centers=np.zeros((100,3));matrices=np.repeat(np.eye(3)[None]*.2,100,axis=0)
        guard=CoverageGuard(centers,matrices,.2,COVERAGE_POLICY)
        self.assertTrue(guard.remove([0,1]));self.assertFalse(guard.remove([2]))
        self.assertAlmostEqual(guard.proof()['removedLeafAreaFraction'],.02)
        self.assertEqual(guard.proof()['projectedRetention'],[1.]*5)

    def test_legacy_terminal_shoots_need_no_elm_depth_field(self):
        paths=[{'points':np.linspace([0,0,0],[1,0,0],9),'radii':np.full(9,r),'parent':-1,'sprayNormal':[0,0,1]} for r in [.01,.005]]
        shoots=[{'id':i,'group':0,'parent':-1} for i in range(2)]
        removed,_=redundant_shoots(paths,shoots,.17,DEFAULT_POLICY)
        self.assertEqual(removed,{1})

    def test_bounded_neighbour_search_preserves_collision_decisions_and_costs(self):
        rng=np.random.default_rng(61);space=LeafSpace([.34,.49,.12]);frame=np.eye(3)
        for center,size in zip(rng.uniform(-.9,.9,(500,3)),rng.uniform(.09,.22,500)):space.add(center,frame,size)
        centers=rng.uniform(-.22,.22,(48,3));frames=np.repeat(frame[None],48,axis=0);sizes=rng.uniform(.10,.20,48);anchor=np.zeros(3)
        ids=space.neighbors(anchor)
        exact=clearance(centers,frames,sizes,np.array(space.centers)[ids],np.array(space.frames)[ids],np.array(space.sizes)[ids],space.half_axes)
        cost,distance=space.score(anchor,centers,frames,sizes)
        np.testing.assert_allclose(cost,np.maximum(0,1.4-exact).__pow__(2).sum(axis=1),atol=1e-12)
        np.testing.assert_allclose(distance,np.minimum(1.4,exact.min(axis=1)),atol=1e-12)

    def test_gap_fill_reduces_unused_rank_intervals_without_weakening_clearance(self):
        root=Path(__file__).resolve().parents[2]
        policy=json.loads((root/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['american_elm']
        paths=[{'points':np.column_stack([np.linspace(0,2,19),np.zeros(19),np.zeros(19)]),'shootDepth':0,'sprayNormal':[0,0,1]}]
        shoots=[{'id':0,'group':0}];before_policy=dict(policy);before_policy.pop('sprayGapFill')
        before,_=place_leaves(before_policy,copy.deepcopy(paths),shoots,np.random.default_rng(93))
        after,proof=place_leaves(policy,copy.deepcopy(paths),shoots,np.random.default_rng(93))
        maximum_gap=lambda leaves:max(np.diff(sorted([.06,*[l['attachment'] for l in leaves if l['node']%2==rank],.96])).max() for rank in [0,1])
        self.assertLess(maximum_gap(after),maximum_gap(before));self.assertGreater(len(after),len(before))
        self.assertGreaterEqual(proof['minimumAcceptedSprayClearance'],policy['sprayMinimumClearance'])
        self.assertGreaterEqual(proof['minimumAcceptedProxyClearance'],.8)

    def test_continued_gap_fill_keeps_existing_leaf_transforms(self):
        root=Path(__file__).resolve().parents[2]
        policy=json.loads((root/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['american_elm']
        paths=[{'points':np.column_stack([np.linspace(0,2,19),np.zeros(19),np.zeros(19)]),'shootDepth':0,'sprayNormal':[0,0,1]}]
        shoots=[{'id':0,'group':0}]
        before,_=place_leaves(policy,copy.deepcopy(paths),shoots,np.random.default_rng(93),gap_passes=0)
        expected={(l['shoot'],l['node']):copy.deepcopy(l) for l in before}
        after,proof=place_leaves(policy,copy.deepcopy(paths),shoots,np.random.default_rng(94),existing=before,gap_passes=2)
        self.assertGreater(len(after),len(before))
        for leaf in after:
            original=expected.get((leaf['shoot'],leaf['node']))
            if original:
                for field in ['origin','matrix','bladeCenter','tint']:np.testing.assert_array_equal(original[field],leaf[field])
        self.assertGreaterEqual(proof['minimumAcceptedSprayClearance'],policy['sprayMinimumClearance'])

    def test_prunes_redundant_thin_shoot_but_keeps_diverging_shoot(self):
        paths=[]
        for i,(a,b,r) in enumerate([([0,0,0],[1,0,0],.01),([.4,0,0],[.95,.10,0],.005),([.6,0,0],[.8,.8,0],.005),([.4,0,.5],[.95,.1,.5],.005)]):
            paths.append({'points':np.linspace(a,b,19),'radii':np.full(19,r),'parent':-1 if i==0 else 0,'parentNode':0,'shootDepth':0 if i==0 else 2,'sprayNormal':[0,0,1]})
        shoots=[{'id':i,'group':0,'parent':paths[i]['parent']} for i in range(4)]
        policy={'maximumRadiusRatio':.78,'minimumDirectionAgreement':.65,'corridorLeafWidths':1.15,'maximumDepthLeafLengths':1.6,'minimumCompetingFraction':.8}
        removed,_=redundant_shoots(paths,shoots,.17,policy)
        self.assertEqual(removed,{1})

    def test_pruning_remaps_surviving_attachments_and_keeps_source_graph(self):
        graph={'paths':[{'parent':-1},{'parent':0},{'parent':1},{'parent':1},{'parent':3}],
               'shoots':[{'id':i,'parent':p,'group':7} for i,p in [(1,0),(2,1),(3,1),(4,3)]],
               'studyRoot':1}
        revised=compact_graph(graph,{2,4})
        self.assertEqual([p['parent'] for p in revised['paths']],[-1,0,1])
        self.assertEqual([s['id'] for s in revised['shoots']],[1,2])
        self.assertTrue(revised['paths'][2]['shootTerminal'])
        self.assertTrue(revised['paths'][2]['retainedTipExtension'])
        self.assertEqual(len(graph['paths']),5)
        self.assertNotIn('shootTerminal',graph['paths'][3])

    def test_rotated_fan_stays_connected_and_spreads_in_leaf_plane(self):
        paths=[{'points':np.linspace([0,0,2],[1,0,2],19),'crownCluster':0,'parent':-1},
               {'points':np.linspace([.5,0,2],[1,.6,2],19),'crownCluster':0,'parent':0,'parentNode':9}]
        shoots=[{'id':i,'group':0} for i in range(2)]
        layout=ClusterLeafLayout([{'id':0,'center':[-1,0,2],'basis':np.eye(3).tolist(),'radii':[2,2,2]}],{'domeMinimumRise':.18,'domeTopWeight':.48,'fanWidthScale':1.35})
        center=np.concatenate([p['points'] for p in paths]).mean(axis=0)
        orient_fans(paths,shoots,layout)
        np.testing.assert_allclose(paths[0]['points'][0],[0,0,2])
        np.testing.assert_allclose(paths[1]['points'][0],paths[0]['points'][9])
        axis=paths[0]['points'][-1]-paths[0]['points'][-2];axis/=np.linalg.norm(axis)
        displacement=np.concatenate([p['points'] for p in paths]).mean(axis=0)-center
        np.testing.assert_allclose(displacement-axis*(displacement@axis),0,atol=1e-10)
        self.assertGreater(np.min(np.diff(paths[0]['points'][4:],axis=0)@axis),0)
        # The short basal connector leaves the fan plane to preserve its original attachment.
        distal=np.concatenate([paths[0]['points'][5:],paths[1]['points']])
        _,_,v=np.linalg.svd(distal-distal.mean(axis=0))
        self.assertGreater(abs(v[-1]@layout.fan_faces(paths,shoots)[0]),.85)

    def test_equal_total_leaf_pixels_can_hide_local_gap_and_wood_regression(self):
        a=np.zeros((90,90,4));a[:,:,:]=[0,1,0,1];b=a.copy()
        b[:30,:30]=[1,0,0,1];b[30:60,:30]=[0,0,0,0]
        result=compare(a,b,np.ones((90,90),bool))
        self.assertAlmostEqual(result['enhanced']['wood'],1/9)
        self.assertAlmostEqual(result['enhanced']['gaps'],1/9)
        self.assertEqual(result['worstRegionChangePoints'],-100)
        self.assertLess(result['visibleFoliageRetention'],.8)
        mask=np.zeros((90,90));mask[10:80,10:80]=1
        envelope=crown_envelope(mask);self.assertFalse(envelope[5,5]);self.assertTrue(envelope[40,40])


if __name__=='__main__':unittest.main()
