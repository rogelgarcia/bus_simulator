# Checks broad oak growth, continuous forks and crowded-shoot spacing across independent seeds.
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
from branchlets import plane_branchlets
from oak_branchlets import oak_branchlets
from oak_foliage import place_leaves
from junctions import flow_surfaces


class OakTests(unittest.TestCase):
    def test_lower_wood_grows_outward_without_descending_broken_limbs(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['northern_red_oak']
        for variant in [1,2,3]:
            paths,_,_,_=scaffold(p,variant)
            for path in paths[1:]:
                delta=path['points'][-1]-path['points'][0]
                self.assertGreater(delta[2]/np.linalg.norm(delta),.19)
                self.assertGreater(np.diff(path['points'][:,2]).min(),-1e-5)

    def test_twig_families_do_not_duplicate_parent_and_descendant_sprays(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['northern_red_oak']
        paths,lobes,rng,_=scaffold(p,1)
        structural=len(paths);occupied_parents={path['parent'] for path in paths}
        shoots,proof=oak_branchlets(p,paths,lobes,rng)
        launches=[path for path in paths[structural:] if path['parent']<structural]
        supports=[path['parent'] for path in launches]
        end_launches=[r['parent'] for r in launches if r['parentNode']==len(paths[r['parent']]['points'])-1]
        self.assertTrue(set(end_launches).isdisjoint(occupied_parents),'Parent branches and their descendants both carry complete terminal fans')
        attachments=[(path['parent'],path['parentNode']) for path in launches]
        self.assertEqual(len(attachments),len(set(attachments)),'Repeated twig fans at one attachment')
        self.assertLess(len(shoots),len(lobes)*12,'Excess recursion duplicates occupied crown volume')
        self.assertGreater(proof['supplementalSprays'],0,'Empty neighbourhoods should receive short lateral sprays')
        self.assertGreater(proof['interiorSecondarySprays'],0,'Exposed secondary branch sections must support some foliage')
        self.assertGreaterEqual(proof['minimumSupplementClearance'],proof['requiredSupplementClearance'])
        self.assertGreater(proof['crowdedShootSubtreesRejected'],0)
        self.assertGreaterEqual(proof['minimumSampleClearance'],proof['requiredSampleClearance'])
        self.assertGreater(len(supports),300,'Spacing must retain distributed canopy supports')
        for path in paths[structural:]:
            parent=paths[path['parent']]
            np.testing.assert_allclose(path['points'][0],parent['points'][path['parentNode']],atol=1e-10)

    def test_scaffolds_branch_around_the_axis_before_the_outer_tips(self):
        profile=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['northern_red_oak']
        for seed in [70331,70332,71000,84001,93007,106123]:
            for variant in [1,2,3]:
                with self.subTest(seed=seed,variant=variant):
                    p=copy.deepcopy(profile);p['seed']=seed;paths,_,_,dimensions=scaffold(p,variant)
                    bearings=[]
                    for index in dimensions['growth']['scaffoldLaunchPaths']:
                        path=paths[index]
                        if path['order']>=5:continue
                        delta=path['points'][-1]-path['points'][0]
                        bearings.append(np.arctan2(delta[1],delta[0])%(2*np.pi))
                    bearings=np.sort(bearings)
                    self.assertLess(np.diff(np.r_[bearings,bearings[0]+2*np.pi]).max(),np.radians(70))
                    for index in dimensions['growth']['scaffoldLaunchPaths']:
                        parent=paths[index];axis=unit(parent['points'][-1]-parent['points'][0])
                        side=unit(np.cross(axis,[0,0,1]));across=unit(np.cross(axis,side))
                        branches=[r for r in paths if r['parent']==index and r['parentNode']<len(parent['points'])-1]
                        self.assertGreaterEqual(len(branches),3)
                        azimuths=[]
                        for branch in branches:
                            station=branch['parentNode']/(len(parent['points'])-1)
                            self.assertGreater(station,.20);self.assertLess(station,.85)
                            delta=branch['points'][-1]-branch['points'][0]
                            azimuths.append(np.arctan2(delta@across,delta@side)%(2*np.pi))
                        azimuths=np.sort(azimuths)
                        gaps=np.diff(np.r_[azimuths,azimuths[0]+2*np.pi])
                        self.assertLess(gaps.max(),np.radians(210),'Upward bias must not collapse offshoots into a single plane')

    def test_open_crown_forks_and_gradual_taper_across_seeds(self):
        profile=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['northern_red_oak']
        for seed in [70331,70332,71000,84001,93007,106123]:
            for variant in [1,2,3]:
                with self.subTest(seed=seed,variant=variant):
                    p=copy.deepcopy(profile);p['seed']=seed;paths,lobes,_,dimensions=scaffold(p,variant)
                    growth=dimensions['growth'];shape=growth['crownSupportProfile']
                    self.assertGreater(shape['widthAspect'],.70)
                    self.assertGreater(shape['widthToHeight'],.85)
                    self.assertGreater(shape['crownDepth']/shape['height'],.50)
                    self.assertLess(2*paths[0]['radii'][0]/dimensions['heightTarget'],.071)
                    self.assertEqual(growth['majorScaffolds'],12)
                    self.assertGreaterEqual(growth['maximumBranchOrder'],8)
                    self.assertLess(growth['maximumConservationResidual'],1e-10)
                    for path in paths[1:]:
                        parent=paths[path['parent']];node=path['parentNode']
                        np.testing.assert_allclose(path['points'][0],parent['points'][node],atol=1e-10)
                        incoming=unit(parent['points'][node]-parent['points'][max(0,node-2)])
                        self.assertGreater(incoming@unit(path['points'][1]-path['points'][0]),.94)
                        self.assertLessEqual(np.max(np.diff(path['radii'])),1e-8)
                        self.assertLessEqual(path['radii'][0],parent['radii'][node]+1e-9)
                    for path in flow_surfaces(paths):
                        self.assertGreater(np.linalg.norm(np.diff(path['points'],axis=0),axis=1).min(),1e-7)

    def test_overlapping_shoots_reject_crowding_but_keep_connected_organic_leaves(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['northern_red_oak']
        paths,lobes,rng,_=scaffold(p,1)
        shoots=plane_branchlets(p,paths,lobes[:2],rng)
        leaves,proof=place_leaves(p,paths,shoots+shoots,rng)
        self.assertGreater(len(leaves),40)
        self.assertGreater(proof['candidateLeavesRejected'],10)
        self.assertGreaterEqual(proof['minimumAcceptedProxyClearance'],.80)
        normals=[]
        for leaf in leaves:
            np.testing.assert_allclose(leaf['origin'],point(paths[leaf['shoot']],leaf['attachment']),atol=1e-10)
            matrix=leaf['matrix'];normal=unit(matrix[:,2]);normals.append(normal)
            self.assertGreater(np.linalg.det(matrix),0)
            self.assertGreater(normal@np.array(paths[leaf['shoot']]['sprayNormal']),.90)
        self.assertGreater(float(np.std(normals,axis=0).max()),.10)


if __name__=='__main__':unittest.main()
