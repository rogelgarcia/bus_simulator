# Checks the repeatable elm vase, shared growth nodes and spaced, sun-facing curved leaves.
import copy
import json
import sys
import unittest
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/bake_vegetation/enhanced_reference'))
from growth import scaffold
from architecture import unit,point
from shoot_growth import spaced_branchlets
from spray_foliage import place_leaves,leaf_shape


class ElmTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['american_elm']

    def test_rounded_crown_and_connected_arches_across_seeds(self):
        for seed in [70439,70440,81017,99377]:
            for variant in [1,2,3]:
                p=copy.deepcopy(self.profile);p['seed']=seed
                paths,lobes,_,dimensions=scaffold(p,variant);growth=dimensions['growth']
                with self.subTest(seed=seed,variant=variant):
                    self.assertGreater(growth['crownSupportProfile']['widthAspect'],.70)
                    self.assertGreater(growth['crownSupportProfile']['widthToHeight'],.65)
                    self.assertLess(growth['maximumConservationResidual'],1e-10)
                    launches=[paths[i] for i in growth['scaffoldLaunchPaths']]
                    heights=[r['points'][0,2] for r in launches]
                    self.assertGreater(np.diff(heights).min(),.35)
                    bearings=np.sort([np.arctan2(*(r['points'][-1]-r['points'][0])[:2][::-1])%(2*np.pi) for r in launches])
                    self.assertLess(np.diff(np.r_[bearings,bearings[0]+2*np.pi]).max(),np.radians(90))
                    for r in paths[1:]:
                        parent=paths[r['parent']];node=r['parentNode']
                        np.testing.assert_allclose(r['points'][0],parent['points'][node],atol=1e-10)
                        incoming=unit(parent['points'][node]-parent['points'][max(0,node-2)])
                        self.assertGreater(incoming@unit(r['points'][1]-r['points'][0]),.94)
                        if r.get('growthRole') in ['leader','arching-axis']:
                            self.assertGreater((r['points'][-1]-r['points'][0])[2],0)
                        self.assertLessEqual(np.max(np.diff(r['radii'])),1e-8)
                        self.assertLessEqual(r['radii'][0],parent['radii'][node]+1e-9)
                    tips=np.array([r['center'] for r in lobes]);low,high=np.quantile(tips[:,2],[.01,.99])
                    level=(tips[:,2]-low)/(high-low)
                    widths=[]
                    for a,b in [(.10,.30),(.40,.65),(.80,.95)]:
                        ring=tips[(level>a)&(level<b)]
                        widths.append(np.ptp(ring[:,:2],axis=0).mean())
                    self.assertLess(widths[2],widths[1]*.90)
                    self.assertGreater(widths[0],widths[1]*.65)
                    volume=growth['crownBudVolume'];upper=tips[level>.65]
                    radial=np.linalg.norm((upper[:,:2]-np.array(volume['center'])[:2])/np.array(volume['radii'])[:2],axis=1)
                    self.assertGreater(np.mean(radial<.5),.20)
                    self.assertGreater(growth['crownSupportProfile']['crownDepth'],p['height']*.38)
                    clusters=growth['crownClusters'];self.assertEqual(len(clusters),15)
                    roots=[paths[c['supportRoot']] for c in clusters]
                    self.assertEqual(len({(r['parent'],r['parentNode']) for r in roots}),len(roots))
                    for lobe in lobes:
                        self.assertEqual(paths[lobe['parent']]['crownCluster'],lobe['cluster'])
                    for c in clusters:
                        root=paths[c['supportRoot']]
                        self.assertGreater((np.array(c['center'])-root['points'][0])@unit(root['points'][-1]-root['points'][0]),0)

    def test_terminal_sprays_have_separate_attachments_and_finite_tips(self):
        paths,lobes,rng,_=scaffold(self.profile,1);structural=len(paths)
        shoots,proof=spaced_branchlets(self.profile,paths,lobes,rng)
        launches=[r for r in paths[structural:] if r['parent']<structural]
        attachments=[(r['parent'],r['parentNode']) for r in launches]
        self.assertEqual(len(attachments),len(set(attachments)))
        self.assertGreater(proof['primarySprays'],250)
        self.assertGreaterEqual(proof['minimumSampleClearance'],proof['requiredSampleClearance'])
        self.assertTrue(proof['withinSprayCompetition'])
        fine=paths[structural:]
        self.assertEqual(len(fine),len({(r['parent'],r['parentNode']) for r in fine}))
        counts={group:sum(r['group']==group for r in fine) for group in {r['group'] for r in fine}}
        self.assertLessEqual(max(counts.values()),6)
        for r in fine:
            projected=np.diff(r['points'],axis=0)@unit(r['points'][-1]-r['points'][0])
            self.assertGreater(np.mean(projected>0),.85)
        for r in paths[structural:]:
            self.assertGreaterEqual(r['radii'][-1],.0015)
            np.testing.assert_allclose(r['points'][0],paths[r['parent']]['points'][r['parentNode']],atol=1e-10)
        tips=[unit(r['points'][-1]-r['points'][0])[2] for r in paths[structural:] if r['shootTerminal']]
        self.assertLess(max(tips),np.sin(.36))
        self.assertLess(np.median(tips),0)
        selected=shoots[:30];leaves,spacing=place_leaves(self.profile,paths,selected+selected,rng)
        self.assertGreater(spacing['candidateLeavesRejected'],0)
        self.assertGreaterEqual(spacing['minimumAcceptedProxyClearance'],.80)
        for leaf in leaves:
            np.testing.assert_allclose(leaf['origin'],point(paths[leaf['shoot']],leaf['attachment']),atol=1e-10)
            self.assertGreater(unit(leaf['matrix'][:,2])[2],.20)
            self.assertGreater(np.linalg.det(leaf['matrix']),0)
        for form in range(8):
            shape=leaf_shape(form,self.profile['bladeShape'])
            self.assertLessEqual(shape['petiole'],.14)
            self.assertLess(shape['fold'],-.04)
            self.assertLess(shape['curl'],-.02)


if __name__=='__main__':unittest.main()
