# Checks paired leaf clearance across adjacent shoots and small connected root collars.
import copy
import json
import sys
import unittest
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/bake_vegetation/enhanced_reference'))
from architecture import curve
from shrub_foliage import place_leaves
from shrub_roots import refine_roots
from leaf_space import clearance


class ShrubTests(unittest.TestCase):
    def test_pairs_keep_space_across_neighboring_shoots(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['arrowwood_viburnum']
        for seed in [9,53,714]:
            rng=np.random.default_rng(seed)
            paths=[curve(np.array([i*.06,0,.4]),np.array([i*.06+.08,.8,1.]),.006,rng,steps=9) for i in range(5)]
            shoots=[{'id':i,'group':i,'parent':-1,'stations':7} for i in range(5)]
            leaves,stats=place_leaves(p,paths,shoots,rng)
            self.assertGreater(len(leaves),10);self.assertGreater(stats['candidateLeavesRejected'],0)
            pairs={}
            for l in leaves:pairs.setdefault((l['shoot'],l['node']),[]).append(l)
            for pair in pairs.values():
                self.assertEqual(len(pair),2);np.testing.assert_array_equal(pair[0]['origin'],pair[1]['origin'])
                self.assertLess(pair[0]['matrix'][:,1]@pair[1]['matrix'][:,1],0)
            centers=np.array([l['bladeCenter'] for l in leaves]);sizes=np.array([np.linalg.norm(l['matrix'][:,0]) for l in leaves]);frames=np.array([l['matrix'] for l in leaves])/sizes[:,None,None]
            separations=clearance(centers,frames,sizes,centers,frames,sizes,np.array(stats['exclusionHalfAxes']))
            np.fill_diagonal(separations,np.inf)
            self.assertGreaterEqual(separations.min(),p['pairedFoliage']['minimumClearance']-1e-9)

    def test_roots_flow_from_stem_and_remain_small(self):
        rng=np.random.default_rng(17);stem=curve(np.array([0,0,-.07]),np.array([.15,.1,2.8]),.05,rng,steps=20);stem['basal']=True
        paths=[stem]
        for a in np.arange(4)*2.4:
            r=curve(np.array([0,0,-.03]),np.array([.18*np.cos(a),.18*np.sin(a),-.025]),.018,rng,0,steps=9,tip=.002);r['root']=True;paths.append(r)
        original=copy.deepcopy(stem);refine_roots(paths)
        for r in paths[1:]:
            start=r['points'][0];expected=np.array([np.interp(start[2],original['points'][:,2],original['points'][:,k]) for k in range(3)])
            np.testing.assert_allclose(start,expected,atol=1e-12)
            self.assertGreater(start[2],0);self.assertLess(r['points'][-1,2],0)
            self.assertLess(np.linalg.norm(r['points'][-1,:2]),.25)
            self.assertLess(np.max(np.diff(r['radii'])),0)
            self.assertLess(r['points'][1,2],start[2]);self.assertTrue(r['rootCollar'])
        np.testing.assert_allclose(stem['points'][-1],original['points'][-1])


if __name__=='__main__':unittest.main()
