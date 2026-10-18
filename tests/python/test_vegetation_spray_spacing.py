# Reproduces overlapping blades that pass volume spacing because they are separated in depth.
import sys
import unittest
import json
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/bake_vegetation/enhanced_reference'))
from leaf_space import clearance
from spray_space import SpraySpace,measure_sprays
from spray_foliage import place_leaves
from architecture import point


class SpraySpacingTests(unittest.TestCase):
    def test_depth_does_not_hide_stacked_blades(self):
        frame=np.eye(3);normal=np.array([0.,0.,1.]);size=.17
        a=np.array([0.,0.,0.]);b=np.array([0.,0.,.08])
        self.assertGreater(clearance(a[None],frame[None],np.array([size]),b[None],frame[None],np.array([size]),np.array([.34,.49,.12]))[0,0],.8)
        space=SpraySpace([.34,.49]);space.add(7,a,frame,size)
        score=space.score(7,normal,b[None],frame[None],np.array([size]))
        self.assertLess(score[0],.01)
        self.assertGreater(space.score(8,normal,b[None],frame[None],np.array([size]))[0],1.)

    def test_spacing_rotates_with_fan_and_accepts_open_blades(self):
        angle=.61;c,s=np.cos(angle),np.sin(angle)
        rotation=np.array([[c,0,s],[0,1,0],[-s,0,c]])
        frame=np.eye(3);normal=frame[:,2];a=np.array([0.,0.,0.]);b=np.array([[.14,.0,.06],[.02,.01,.08]])
        spaces=[SpraySpace([.34,.49]),SpraySpace([.34,.49])]
        spaces[0].add(0,a,frame,.17);spaces[1].add(0,rotation@a,rotation@frame,.17)
        score=spaces[0].score(0,normal,b,np.array([frame,frame]),np.array([.17,.17]))
        turned=spaces[1].score(0,rotation@normal,b@rotation.T,np.array([rotation,rotation]),np.array([.17,.17]))
        np.testing.assert_allclose(score,turned,atol=1e-12)
        self.assertGreater(score[0],1.);self.assertLess(score[1],.3)

    def test_placement_checks_sibling_twigs_and_retains_attachments(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['american_elm']
        paths=[{'points':np.column_stack([np.linspace(0,1.2,17),np.full(17,y),np.full(17,z)]),'shootDepth':0,'sprayNormal':[0.,0.,1.]} for y,z in [(0,0),(.10,.08),(-.10,-.08)]]
        shoots=[{'id':i,'group':0} for i in range(3)]
        leaves,proof=place_leaves(p,paths,shoots,np.random.default_rng(143))
        measured=measure_sprays([l['bladeCenter'] for l in leaves],[l['matrix'] for l in leaves],[l['group'] for l in leaves],{0:[0.,0.,1.]},p['leafExclusionHalfAxes'][:2],p['sprayMinimumClearance'])
        self.assertGreater(len(leaves),10);self.assertEqual(measured['pairsBelowMinimum'],0)
        self.assertGreater(proof['candidateLeavesRejected'],0)
        for leaf in leaves:np.testing.assert_allclose(leaf['origin'],point(paths[leaf['shoot']],leaf['attachment']),atol=1e-10)


if __name__=='__main__':unittest.main()
