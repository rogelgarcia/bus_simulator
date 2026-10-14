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
