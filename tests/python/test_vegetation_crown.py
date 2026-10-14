# Checks reusable crown breadth and connected growth across independent procedural seeds.
import copy
import json
import sys
import unittest
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/bake_vegetation/enhanced_reference'))
from growth import scaffold
from branchlets import plane_branchlets
from root_growth import root_crown
from crown_spread import broaden_crown,crown_families,crown_metrics


class CrownTests(unittest.TestCase):
    def test_independent_seeds_keep_connected_organic_crowns_with_minimum_breadth(self):
        profile=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text(encoding='utf-8'))['london_plane']
        for seed in [7,89,1709,9011,70121,99017]:
            with self.subTest(seed=seed):
                p={**profile,'seed':seed};paths,lobes,rng,_=scaffold(p,1);plane_branchlets(p,paths,lobes,rng);root_crown(paths,rng)
                before=copy.deepcopy(paths);transforms,proof=broaden_crown(paths,p['crownSpreadRule'])
                _,_,tips=crown_families(paths);metrics=crown_metrics(np.array([paths[i]['points'][-1] for i in tips]),36)
                self.assertGreaterEqual(metrics['minimumWidth'],proof['targetMinimumWidth']-1e-8)
                self.assertLess(metrics['height']/proof['before']['height'],1.03)
                self.assertGreaterEqual(proof['extension']['minimumScaffoldElevation'],30)
                for i,(old,new) in enumerate(zip(before,paths)):
                    np.testing.assert_array_equal(old['radii'],new['radii'])
                    if i==0 or old.get('root'):np.testing.assert_array_equal(old['points'],new['points'])
                    if new['parent']>=0:np.testing.assert_allclose(new['points'][0],paths[new['parent']]['points'][new['parentNode']],atol=1e-9)
                    if i in transforms and 'shootRole' in old:
                        turn,shift=transforms[i];np.testing.assert_allclose(new['points'],old['points']@turn.T+shift,atol=1e-9)
                        np.testing.assert_allclose(turn.T@turn,np.eye(3),atol=1e-10)
                self.assertGreater(np.ptp([paths[i]['points'][-1,2] for i in tips]),5,'Apical extensions must retain unequal heights')

    def test_no_edit_when_the_crown_already_meets_the_policy(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text(encoding='utf-8'))['london_plane']
        paths,lobes,rng,_=scaffold(p,1);plane_branchlets(p,paths,lobes,rng)
        policy={**p['crownSpreadRule'],'minimumLaunchElevationDegrees':0,'minimumWidthAspect':.3,'minimumWidthHeight':.2}
        before=copy.deepcopy(paths);transforms,proof=broaden_crown(paths,policy)
        self.assertEqual(proof['iterations'],0);self.assertEqual(proof['extension']['iterations'],0)
        for old,new in zip(before,paths):np.testing.assert_allclose(old['points'],new['points'],atol=1e-12)


if __name__=='__main__':unittest.main()
