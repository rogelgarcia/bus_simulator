# Regressions for parent-connected growth and gravity deformation independent of presentation cameras.
import copy
import json
import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/bake_vegetation/enhanced_reference'))
from growth_v2.space_growth import limited_heading,colonize,append_skeleton,retained_scaffold,light_owners
from growth_v2.shoots import grow_shoots
from growth_v2.leaves import deform_vertices,gravity_directions,place
from growth_v2.audit import audit_graph
from growth import demand_radii
from growth_v2.support import size_support,supported_reach

POLICY=json.loads((Path(__file__).resolve().parents[2]/'tools/bake_vegetation/enhanced_reference/growth_v2/policy.json').read_text())


def scaffold():
    points=np.column_stack([np.linspace(0,1.4,20),np.zeros(20),np.linspace(0,2,20)])
    return [{'points':points,'radii':np.linspace(.12,.04,20),'demand':np.full(20,.001),'parent':-1,'parentNode':-1,'phase':.2,'basal':True,'growthRole':'arching-axis','order':0,'junctionMode':'inherited-tangent'}]


class GrowthCoreTests(unittest.TestCase):
    def test_unreachable_near_bud_does_not_block_a_valid_light_target(self):
        sites=np.array([[3.,0,0],[0.,0,0]])
        forward=np.array([[1.,0,0],[1.,0,0]])
        owners,distance=light_owners(np.array([[2.,0,0],[3.1,0,0]]),sites,forward,forward,forward,POLICY)
        self.assertEqual(owners[0],1)
        self.assertAlmostEqual(distance[0],2.)
        self.assertLess(distance[1],POLICY['captureMetres'])

    def test_side_limb_does_not_chase_space_back_through_the_trunk(self):
        paths=scaffold();paths[0]['points'][:,0]=np.linspace(2.,3.,20)
        targets=np.random.default_rng(5).uniform([.1,-.5,2.5],[.5,.5,4.],(120,3))
        nodes,_,children,anchors,_=colonize(paths,targets,POLICY,np.random.default_rng(17))
        self.assertEqual(len(nodes),len(anchors))
        self.assertFalse(any(children))

    def test_long_support_is_thickened_through_ancestor_forks(self):
        paths=scaffold();origin=paths[0]['points'][10]
        paths.append({'points':origin+np.column_stack([np.linspace(0,2,20),np.zeros(20),np.zeros(20)]),'radii':np.full(20,.001),'parent':0,'parentNode':10})
        size_support(paths,POLICY);reach=supported_reach(paths)
        for p,r in zip(paths,reach):
            self.assertTrue(np.all(np.diff(p['radii'])<=0))
            self.assertLessEqual(np.max(r/(2*p['radii'])),POLICY['maximumSupportedSlenderness']+1e-8)
        self.assertGreater(paths[1]['radii'][0],.01)
    def test_narrow_light_corridor_does_not_grow_a_long_whip(self):
        paths=scaffold();axis=np.array([1.4,0.,2.]);axis/=np.linalg.norm(axis)
        targets=paths[0]['points'][-1]+np.arange(.3,13.,.15)[:,None]*axis
        rng=np.random.default_rng(21);nodes,_,children,anchors,_=colonize(paths,targets,POLICY,rng)
        append_skeleton(paths,nodes,children,anchors,rng)
        longest=max(np.linalg.norm(np.diff(p['points'],axis=0),axis=1).sum() for p in paths[1:])
        self.assertLessEqual(longest,2.5)

    def test_axillary_buds_do_not_spawn_repeated_four_way_sprays(self):
        paths=scaffold();paths[0]['growthRole']='space-grown'
        shoots,_=grow_shoots(paths,[0],POLICY,np.random.default_rng(67))
        ordinary=[s['id'] for s in shoots if paths[s['id']]['parent']==0 and paths[s['id']]['parentNode']<19]
        self.assertGreater(len(ordinary),0)
        self.assertFalse(any(p['parent'] in ordinary for p in paths))

    def test_retained_limb_thickness_follows_reduced_parent_support(self):
        source=scaffold();source[0]['growthRole']='arching-axis'
        child=copy.deepcopy(source[0]);child.update(parent=0,parentNode=19,growthRole='cluster-axis',radii=np.linspace(.035,.012,20))
        source.append(child);paths,_=retained_scaffold(source)
        self.assertLessEqual(paths[1]['historicalRadii'][0],paths[0]['historicalRadii'][-1])
        np.testing.assert_array_equal(paths[1]['points'],source[1]['points'])
        demand_radii(paths,.12,2.)

    def test_turn_bound_includes_exact_reverse_direction(self):
        incoming=np.array([0.,0,1.])
        for desired in [[0,0,-1],[1,0,0],[.2,.8,1]]:
            result=limited_heading(incoming,desired,40)
            self.assertAlmostEqual(np.linalg.norm(result),1)
            self.assertGreaterEqual(result@incoming,np.cos(np.deg2rad(40))-1e-12)

    def test_gravity_moves_blade_down_but_keeps_attachment(self):
        points=np.array([[0.,0.,0.],[.1,.4,.01],[0.,1.,0.]])
        for gravity in gravity_directions():
            result=deform_vertices(points,gravity,.12);delta=result-points
            np.testing.assert_array_equal(result[0],points[0])
            self.assertTrue(np.all(delta@gravity>=0));self.assertAlmostEqual(np.linalg.norm(delta[-1]),.12)

    def test_smooth_loop_is_rejected_even_when_local_turns_are_small(self):
        paths=scaffold();angle=np.linspace(0,2*np.pi-.08,120);origin=paths[0]['points'][-1]
        points=origin+np.column_stack([np.sin(angle),1-np.cos(angle),np.zeros(len(angle))])
        paths.append({'points':points,'radii':np.linspace(.01,.002,len(points)),'parent':0,'parentNode':19,'growthRole':'space-grown'})
        leaf={'origin':points[5],'shoot':1,'node':0}
        proof=audit_graph(paths,[leaf],POLICY,1)
        self.assertLess(proof['maximumSegmentTurnDegrees'],5);self.assertFalse(proof['passed'])

    def test_growth_is_repeatable_and_retains_connected_branches(self):
        targets=np.random.default_rng(86).uniform([1,-2,2],[4,2,4],(150,3));outputs=[]
        for unused in range(2):
            paths=scaffold();rng=np.random.default_rng(52)
            nodes,parents,children,anchors,proof=colonize(paths,targets,{**POLICY,'iterations':30},rng)
            terminals=append_skeleton(paths,nodes,children,anchors,rng)
            self.assertGreater(len(terminals),4)
            self.assertEqual(proof['postGrowthFanRotations'],0)
            for p in paths[1:]:np.testing.assert_array_equal(p['points'][0],paths[p['parent']]['points'][p['parentNode']])
            outputs.append(nodes)
        np.testing.assert_array_equal(*outputs)

    def test_shoot_leaves_remain_attached_and_radii_taper(self):
        paths=scaffold();paths[0]['growthRole']='space-grown';rng=np.random.default_rng(67);shoots,_=grow_shoots(paths,[0],POLICY,rng)
        profile={'leafLength':.17,'leafGreen':.97};leaves,_=place(paths,shoots,profile,POLICY,rng)
        self.assertGreater(len(leaves),10)
        demand_radii(paths,.12,2.15);size_support(paths,POLICY);proof=audit_graph(paths,leaves,POLICY,1)
        self.assertTrue(proof['passed'],proof)
        for p in paths[1:]:self.assertLess(np.linalg.norm(p['points'][-1]-p['points'][0]),1.1)


if __name__=='__main__':unittest.main()
