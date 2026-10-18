# Checks reusable linden proportions and connected, tapering growth across independent seeds.
import copy
import json
import sys
import unittest
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/bake_vegetation/enhanced_reference'))
from growth import scaffold
from architecture import unit
from junctions import flow_surfaces


class LindenTests(unittest.TestCase):
    def test_offset_petioles_remain_connected_to_the_heart_shaped_blade(self):
        from leaf_outline import blade_profile
        mask=np.zeros((160,160))
        for y in range(5,48):
            x=48+round(y*.12);mask[y,x-1:x+2]=1
        yy,xx=np.mgrid[:160,:160]
        mask[((xx-75)/44)**2+((yy-91)/48)**2<1]=1
        _,contour,junction,stem=blade_profile(mask,follow_stem=True)
        self.assertGreater(len(stem),25)
        self.assertTrue(np.isfinite(junction).all())
        self.assertTrue(np.isfinite(contour).all())
        self.assertLess(junction[0],.45)

    def test_spaced_sprays_have_finite_complexity_separate_nodes_and_alternate_leaves(self):
        from linden_shoots import branchlets
        from spray_foliage import place_leaves
        from architecture import point
        profile=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['silver_linden']
        for seed in [70217,84001]:
            p=copy.deepcopy(profile);p['seed']=seed
            paths,lobes,rng,_=scaffold(p,1);structural=len(paths)
            shoots,proof=branchlets(p,paths,lobes[::17],rng)
            self.assertGreater(proof['acceptedSprays'],10)
            self.assertGreaterEqual(proof['minimumSampleClearance'],proof['requiredSampleClearance'])
            fine=paths[structural:]
            self.assertEqual(len(fine),len({(r['parent'],r['parentNode']) for r in fine}))
            for group in {r['group'] for r in fine}:self.assertLessEqual(sum(r['group']==group for r in fine),13)
            for r in fine:
                self.assertGreaterEqual(r['radii'][-1],p['shootGrowth']['minimumTipRadius'])
                self.assertLessEqual(np.max(np.diff(r['radii'])),1e-8)
                np.testing.assert_allclose(r['points'][0],paths[r['parent']]['points'][r['parentNode']],atol=1e-10)
            leaves,spacing=place_leaves(p,paths,shoots[:28],rng)
            self.assertGreaterEqual(spacing['minimumAcceptedProxyClearance'],.80)
            self.assertEqual(len(leaves),len({(r['shoot'],r['node']) for r in leaves}))
            for leaf in leaves:
                np.testing.assert_allclose(leaf['origin'],point(paths[leaf['shoot']],leaf['attachment']),atol=1e-10)
                self.assertGreater(unit(leaf['matrix'][:,2])[2],.2)
                self.assertGreater(np.linalg.det(leaf['matrix']),0)

    def test_seeded_lindens_have_slim_boles_tapering_crowns_and_inherited_forks(self):
        profile=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['silver_linden']
        for seed in [70217,70218,71000,84001,93007,106123]:
            p=copy.deepcopy(profile);p['seed']=seed
            for variant in [1,2,3]:
                with self.subTest(seed=seed,variant=variant):
                    paths,lobes,_,dimensions=scaffold(p,variant)
                    self.assertEqual(dimensions['growth']['architecture'],'conical-linden')
                    self.assertLess(2*paths[0]['radii'][0]/dimensions['heightTarget'],.055)
                    self.assertLess(dimensions['growth']['maximumConservationResidual'],1e-10)
                    self.assertGreaterEqual(dimensions['growth']['majorScaffolds'],16)
                    self.assertGreaterEqual(dimensions['growth']['maximumBranchOrder'],4)
                    from linden_growth import crown_profile
                    proof=crown_profile(np.array([l['center'] for l in lobes]),dimensions)
                    self.assertLess(proof['upperToLowerRadius'],.72)
                    self.assertLess(proof['middleToLowerRadius'],1.08)
                    self.assertTrue(any(l['parentNode']<len(paths[l['parent']]['points'])-1 for l in lobes))
                    for lobe in lobes:
                        np.testing.assert_allclose(lobe['center'],paths[lobe['parent']]['points'][lobe['parentNode']],atol=1e-10)
                    for path in paths[1:]:
                        parent=paths[path['parent']];node=path['parentNode']
                        np.testing.assert_allclose(path['points'][0],parent['points'][node],atol=1e-10)
                        incoming=unit(parent['points'][node]-parent['points'][max(0,node-2)])
                        outgoing=unit(path['points'][1]-path['points'][0])
                        self.assertGreater(incoming@outgoing,.94)
                        self.assertLessEqual(np.max(np.diff(path['radii'])),1e-8)
                    self.assertTrue(all(p.get('junctionMode')=='inherited-tangent' for p in paths))
                    surfaces=flow_surfaces(paths)
                    for surface in surfaces:
                        self.assertGreater(float(np.linalg.norm(np.diff(surface['points'],axis=0),axis=1).min()),1e-7)
                    np.testing.assert_allclose(surfaces[0]['radii'][:len(paths[0]['radii'])],paths[0]['radii'])


if __name__=='__main__':unittest.main()
