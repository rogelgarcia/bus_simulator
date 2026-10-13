# Checks shared fork topology and supporting wood allocation independently of Blender.
import copy
import json
import sys
import unittest
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/bake_vegetation/enhanced_reference'))
from growth import demand_radii,scaffold
from junctions import flow_surfaces,uv_offsets
from bark_flow import junction_weights
from root_growth import root_crown,radial_flare
from bark_projection import affine_uv
from branchlets import plane_branchlets
from plane_foliage import place_leaves,blade_center,form_parameters
from leaf_outline import blade_profile
from plane_posture import lift_scaffold
from spaced_foliage import place_leaves as spaced_leaves,nodes_for_shoot
from leaf_space import clearance
from dome_sprays import arrange_sprays
from fan_foliage import place_fans
from organic_foliage import soften_sprays


class GrowthTests(unittest.TestCase):
    def test_organic_sprays_keep_attachments_and_coherence_without_coplanar_blades(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        paths,lobes,rng,_=scaffold(p,1);shoots=plane_branchlets(p,paths,lobes,rng)[:60]
        accepted,_=spaced_leaves(p,paths,shoots,np.random.default_rng(27))
        for leaf in accepted:leaf['size']=np.linalg.norm(leaf['matrix'][:,0])
        normals,_=arrange_sprays(paths);flat,_=place_fans(paths,normals,accepted,np.random.default_rng(27));before=copy.deepcopy(paths)
        result,proof=soften_sprays(paths,flat,np.random.default_rng(13117))
        self.assertEqual(len(flat),len(result));self.assertGreater(proof['normalAngleDegreesQuantiles'][2],10)
        self.assertLessEqual(proof['normalAngleDegreesQuantiles'][-1],36.0001)
        for old,new in zip(flat,result):
            np.testing.assert_array_equal(old['origin'],new['origin']);np.testing.assert_array_equal(old['tint'],new['tint'])
            self.assertEqual(old['form'],new['form']);self.assertEqual(old['attachment'],new['attachment'])
            frame=new['matrix']/new['size'];np.testing.assert_allclose(frame.T@frame,np.eye(3),atol=1e-10)
            self.assertGreater(np.linalg.det(frame),.999)
            np.testing.assert_allclose(new['bladeCenter'],new['origin']+new['matrix']@blade_center(new['form'],True))
        for old,new in zip(before,paths):np.testing.assert_array_equal(old['points'],new['points'])

    def test_organic_orientation_search_keeps_candidates_at_extreme_source_tilts(self):
        from organic_foliage import local_rotation
        paths=[{'sprayNormal':[0,0,1]}];accepted=[]
        for i in range(200):
            origin=np.array([i*.5,0,0]);frame=local_rotation(np.radians(7.9),0,0)
            accepted.append({'shoot':0,'node':i,'attachment':(i%10)/10,'size':.24,'form':i%8,'tint':[1,1,1],
                             'origin':origin,'matrix':frame*.24})
        result,proof=soften_sprays(paths,accepted,np.random.default_rng(91))
        self.assertEqual(len(result),200);self.assertLessEqual(proof['normalAngleDegreesQuantiles'][-1],36)

    def test_dome_sprays_preserve_scaffolds_and_connected_shallow_forks(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        paths,lobes,rng,_=scaffold(p,1);plane_branchlets(p,paths,lobes,rng);original=copy.deepcopy(paths)
        normals,proof=arrange_sprays(paths)
        self.assertGreater(proof['meanOutwardAlignment'],.55)
        self.assertLess(np.median([r['depth90'] for r in proof['sprays']]),.12)
        for i,(old,new) in enumerate(zip(original,paths)):
            np.testing.assert_array_equal(old['radii'],new['radii'])
            if i not in normals:np.testing.assert_array_equal(old['points'],new['points'])
            if new.get('shootDepth')==0:np.testing.assert_allclose(old['points'][:2],new['points'][:2],atol=1e-10)
            if new.get('shootRole'):np.testing.assert_allclose(new['points'][0],paths[new['parent']]['points'][new['parentNode']],atol=1e-10)

    def test_flat_foliage_retains_leaves_and_faces_the_parent_fan(self):
        from architecture import point
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        paths,lobes,rng,_=scaffold(p,1);shoots=plane_branchlets(p,paths,lobes,rng)[:60]
        accepted,_=spaced_leaves(p,paths,shoots,np.random.default_rng(27))
        for leaf in accepted:leaf['size']=np.linalg.norm(leaf['matrix'][:,0])
        normals,_=arrange_sprays(paths);result,proof=place_fans(paths,normals,accepted,np.random.default_rng(27))
        self.assertEqual(len(result),len(accepted));self.assertGreater(proof['meanNormalAlignment'],.99)
        for old,new in zip(accepted,result):
            self.assertEqual(old['form'],new['form']);np.testing.assert_array_equal(old['tint'],new['tint'])
            self.assertAlmostEqual(old['size'],np.linalg.norm(new['matrix'][:,0]))
            np.testing.assert_allclose(new['origin'],point(paths[new['shoot']],new['attachment']))
            np.testing.assert_allclose(new['bladeCenter'],new['origin']+new['matrix']@blade_center(new['form'],True,True))

    def test_short_twigs_do_not_receive_a_fixed_leaf_quota(self):
        p={'leafLength':.24};path={'points':np.array([[0.,0,0],[0,0,.20]])}
        positions=nodes_for_shoot(p,path,np.random.default_rng(5))
        self.assertLessEqual(len(positions),2)
        self.assertTrue(np.all((positions>0)&(positions<1)))

    def test_spaced_leaves_have_separate_blade_volumes_and_attached_stalks(self):
        from architecture import point
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        paths,lobes,rng,_=scaffold(p,1);shoots=plane_branchlets(p,paths,lobes,rng)[:60]
        old,_=place_leaves(p,paths,shoots,np.random.default_rng(27));new,proof=spaced_leaves(p,paths,shoots,np.random.default_rng(27))
        self.assertLess(len(new),len(old)*.80)
        centers=np.array([leaf['bladeCenter'] for leaf in new]);sizes=np.array([np.linalg.norm(leaf['matrix'][:,0]) for leaf in new]);frames=np.array([leaf['matrix'] for leaf in new])/sizes[:,None,None]
        spacing=clearance(centers,frames,sizes,centers,frames,sizes);np.fill_diagonal(spacing,np.inf)
        self.assertGreaterEqual(spacing.min(),.919999)
        for leaf in new:
            np.testing.assert_allclose(leaf['origin'],point(paths[leaf['shoot']],leaf['attachment']))
            np.testing.assert_allclose(leaf['bladeCenter'],leaf['origin']+leaf['matrix']@blade_center(leaf['form'],True))

    def test_posture_lift_preserves_other_branches_and_connected_forks(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        for variant in [2,3]:
            paths,lobes,rng,dimensions=scaffold(p,variant);plane_branchlets(p,paths,lobes,rng);before=copy.deepcopy(paths)
            root=dimensions['growth']['scaffoldLaunchPaths'][0];proof=lift_scaffold(paths,root)
            direction=paths[root]['points'][-1]-paths[root]['points'][0]
            self.assertAlmostEqual(np.degrees(np.arctan2(direction[2],np.linalg.norm(direction[:2]))),38.)
            np.testing.assert_array_equal(paths[root]['points'][:3],before[root]['points'][:3])
            for i,(old,new) in enumerate(zip(before,paths)):
                np.testing.assert_array_equal(old['radii'],new['radii'])
                if i not in proof['paths']:np.testing.assert_array_equal(old['points'],new['points'])
                elif i!=root:np.testing.assert_allclose(np.linalg.norm(np.diff(old['points'],axis=0),axis=1),np.linalg.norm(np.diff(new['points'],axis=0),axis=1),atol=1e-12)
                if new['parent']>=0:np.testing.assert_allclose(new['points'][0],paths[new['parent']]['points'][new['parentNode']],atol=1e-12)

    def test_blade_outline_preserves_basal_notch_and_follows_stalk_centerline(self):
        mask=np.zeros((256,256));mask[85:235,30:226]=1
        mask[65:90,30:95]=1;mask[65:90,160:226]=1;mask[8:85,126:131]=1
        center,contour,junction,stem=blade_profile(mask)
        self.assertAlmostEqual(junction[1],85/255)
        self.assertLess(contour[:,1].min(),junction[1])
        samples=center+(contour[:,None,:]-center)*np.linspace(0,1,41)[None,:,None]
        ij=np.round(samples*255).astype(int)
        self.assertTrue(np.all(mask[ij[:,:,1],ij[:,:,0]]==1),'Radial triangles must not bridge a transparent notch')
        ij=np.round(stem*255).astype(int)
        self.assertTrue(np.all(mask[ij[:,1],ij[:,0]]==1))

    def test_plane_foliage_attaches_to_preserved_shoots_with_valid_blade_frames(self):
        from architecture import point
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        paths,lobes,rng,_=scaffold(p,1);shoots=plane_branchlets(p,paths,lobes,rng)[:60];before=copy.deepcopy(paths)
        leaves,_=place_leaves(p,paths,shoots,np.random.default_rng(521))
        self.assertGreater(len(leaves),100)
        for leaf in leaves:
            np.testing.assert_allclose(leaf['origin'],point(paths[leaf['shoot']],leaf['attachment']))
            np.testing.assert_allclose(leaf['bladeCenter'],leaf['origin']+leaf['matrix']@blade_center(leaf['form']))
            frame=leaf['matrix']/np.linalg.norm(leaf['matrix'],axis=0)
            np.testing.assert_allclose(frame.T@frame,np.eye(3),atol=1e-12)
            self.assertGreater(np.linalg.det(frame),.999)
            self.assertGreater(np.linalg.norm(leaf['bladeCenter']-leaf['origin']),.07)
        for a,b in zip(before,paths):np.testing.assert_array_equal(a['points'],b['points'])
        young=[np.linalg.norm(l['matrix'][:,1]) for l in leaves if l['young']]
        adult=[np.linalg.norm(l['matrix'][:,1]) for l in leaves if not l['young']]
        self.assertLess(np.mean(young),np.mean(adult)*.75)

    def test_plane_small_shoots_keep_the_scaffold_and_share_parent_nodes(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        for variant in [1,2,3]:
            paths,lobes,rng,_=scaffold(p,variant);original=copy.deepcopy(paths)
            shoots=plane_branchlets(p,paths,lobes,rng)
            for before,after in zip(original,paths):
                np.testing.assert_array_equal(before['points'],after['points'])
                np.testing.assert_array_equal(before['radii'],after['radii'])
            for shoot in shoots:
                path=paths[shoot['id']];parent=paths[path['parent']];node=path['parentNode']
                np.testing.assert_array_equal(path['points'][0],parent['points'][node])
                self.assertLessEqual(path['radii'][0],parent['radii'][node])
            self.assertLess(len(shoots),len(lobes)*35,'Do not restore the six fans plus roughly 52 unbranched hairs per group')

    def test_plane_terminal_shoots_are_short_with_visible_finite_tips(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        for variant in [1,2,3]:
            paths,lobes,rng,_=scaffold(p,variant);shoots=plane_branchlets(p,paths,lobes,rng)
            terminal=[paths[s['id']] for s in shoots if paths[s['id']]['shootDepth']==3]
            slenderness=[]
            for path in terminal:
                self.assertGreaterEqual(path['radii'][-1],.0017)
                self.assertTrue(np.all(np.diff(path['radii'])<0))
                slenderness.append(np.sum(np.linalg.norm(np.diff(path['points'],axis=0),axis=1))/(2*path['radii'][-1]))
            self.assertLess(np.quantile(slenderness,.95),110,'Long fine needles must not return')

    def test_plane_small_sibling_forks_spread_apart_across_several_orders(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        for variant in [1,2,3]:
            paths,lobes,rng,_=scaffold(p,variant);shoots=plane_branchlets(p,paths,lobes,rng);children={}
            for shoot in shoots:children.setdefault(shoot['parent'],[]).append(paths[shoot['id']])
            angles=[]
            for parent,branches in children.items():
                if 'shootRole' not in paths[parent]:continue
                self.assertEqual(len(branches),2)
                a,b=[r['points'][-1]-r['points'][0] for r in branches]
                angles.append(np.degrees(np.arccos(np.clip(np.dot(a,b)/(np.linalg.norm(a)*np.linalg.norm(b)),-1,1))))
            self.assertGreater(min(angles),40)
            self.assertGreater(np.median(angles),50)
            self.assertEqual({paths[s['id']]['shootDepth'] for s in shoots},{0,1,2,3})

    def test_plane_branches_advance_outward_instead_of_turning_back_along_a_shell(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        for variant in [1,2,3]:
            paths,_,_,d=scaffold(p,variant);fork=np.array(d['growth']['firstFork']);advances=[]
            for path in paths[1:]:
                points=path['points'];delta=np.diff(points,axis=0);radial=points[:-1]-fork;distance=np.linalg.norm(radial,axis=1);valid=distance>.1
                advances.extend(np.sum(delta[valid]*radial[valid],axis=1)/(np.linalg.norm(delta[valid],axis=1)*distance[valid]))
            with self.subTest(variant=variant):
                self.assertLess(np.mean(np.array(advances)<0),.01,'Persistent backward growth creates curled shell branches')
                self.assertGreater(np.quantile(advances,.1),.25,'Outer wood must retain forward progress')

    def test_bark_chart_projection_keeps_affine_scale_and_a_face_on_one_uv_island(self):
        triangle=np.array([[0.,0,0],[2,0,0],[0,0,4]])
        points=np.array([[.5,2,1],[2.2,-1,1],[-.1,0,3]])
        uv=np.array([[7.,3],[8,3],[7,5]])
        result=affine_uv(points,np.repeat(triangle[None],3,axis=0),np.repeat(uv[None],3,axis=0))
        np.testing.assert_allclose(result,[[7.25,3.5],[8.1,3.5],[6.95,4.5]])

    def test_plane_has_intermediate_wood_between_scaffolds_and_leaf_shoots(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        for variant in [1,2,3]:
            paths,_,_,d=scaffold(p,variant);wood=paths[:d['growth']['structuralPaths']]
            children={r['parent'] for r in wood if r['parent']>=0}
            terminal=[r for i,r in enumerate(wood) if i not in children]
            with self.subTest(variant=variant):
                self.assertGreaterEqual(max(r['order'] for r in wood),7)
                self.assertLess(max(r['radii'][0] for r in terminal),.065)
                self.assertLess(wood[0]['radii'][0],.65)
                self.assertGreater(sum(.025<r['radii'][0]<.12 for r in wood),160)

    def test_plane_successors_inherit_the_parent_surface_at_the_crotch(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        paths,_,_,_=scaffold(p,1);surfaces=flow_surfaces(paths)
        for i,path in enumerate(paths):
            if path['parent']<0:continue
            with self.subTest(path=i):
                self.assertGreaterEqual(surfaces[i]['radii'][4],paths[path['parent']]['radii'][-1]*.999)
                self.assertLessEqual(np.max(surfaces[i]['radii']),paths[path['parent']]['radii'][-1]*1.001)

    def fork(self,left=1,right=1):
        return [{'parent':-1,'parentNode':-1,'demand':np.array([.2,.1,0.])},
                {'parent':0,'parentNode':2,'demand':np.array([0.,left])},
                {'parent':0,'parentNode':2,'demand':np.array([0.,right])}]

    def test_shared_fork_conserves_support_area(self):
        paths=self.fork(3,1);proof=demand_radii(paths,1,2)
        self.assertAlmostEqual(paths[0]['radii'][-1]**2,paths[1]['radii'][0]**2+paths[2]['radii'][0]**2)
        self.assertAlmostEqual(paths[1]['radii'][0]/paths[2]['radii'][0],np.sqrt(3))
        self.assertLess(proof['maximumConservationResidual'],1e-12)

    def test_crown_demand_changes_branch_proportions(self):
        equal=self.fork();weighted=self.fork(4,1)
        demand_radii(equal,1,2.4);demand_radii(weighted,1,2.4)
        self.assertGreater(weighted[1]['radii'][0],equal[1]['radii'][0])
        self.assertLess(weighted[2]['radii'][0],equal[2]['radii'][0])

    def test_shedding_does_not_shrink_previous_wood(self):
        paths=self.fork(4,1);old=copy.deepcopy(paths);demand_radii(old,1,2.4)
        paths[1]['demand'][-1]=.5
        for path,previous in zip(paths,old):path['historicalRadii']=previous['radii']
        demand_radii(paths,1,2.4)
        for path,previous in zip(paths,old):self.assertTrue(np.all(path['radii']>=previous['radii']))

    def test_nine_mature_scaffolds_have_connected_shared_forks(self):
        profiles=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())
        for species,p in profiles.items():
            if 'growth' not in p:continue
            for variant in [1,2,3]:
                with self.subTest(species=species,variant=variant):
                    paths,lobes,rng,dimensions=scaffold(p,variant);proof=dimensions['growth']
                    self.assertGreater(proof['sharedForkCount'],5)
                    self.assertLess(proof['maximumConservationResidual'],1e-12)
                    for i,path in enumerate(paths[:proof['structuralPaths']]):
                        self.assertTrue(np.all(np.isfinite(path['points'])))
                        self.assertTrue(np.all(np.diff(path['radii'])<=1e-9))
                        self.assertGreater(np.min(path['radii']),0)
                        if path['parent']<0:continue
                        self.assertLess(path['parent'],i)
                        np.testing.assert_allclose(path['points'][0],paths[path['parent']]['points'][path['parentNode']],atol=1e-10)

    def test_parent_end_caps_are_buried_inside_successor_wood(self):
        profiles=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())
        for species,p in profiles.items():
            if 'growth' not in p:continue
            for variant in [1,2,3]:
                paths,_,_,dimensions=scaffold(p,variant);uv_offsets(paths);surfaces=flow_surfaces(paths);children={}
                for i,path in enumerate(paths[:dimensions['growth']['structuralPaths']]):
                    if path['parent']>=0:children.setdefault(path['parent'],[]).append(i)
                for parent,ids in children.items():
                    with self.subTest(species=species,variant=variant,parent=parent):
                        cap=surfaces[parent]['points'][-1];radius=surfaces[parent]['radii'][-1]
                        enclosed=False
                        for i in ids:
                            points=surfaces[i]['points'];radii=surfaces[i]['radii'];segment=np.diff(points,axis=0)
                            lengths=np.sum(segment*segment,axis=1);t=np.clip(np.divide(np.sum((cap-points[:-1])*segment,axis=1),lengths,out=np.zeros_like(lengths),where=lengths>1e-12),0,1)
                            distance=np.linalg.norm(cap-points[:-1]-t[:,None]*segment,axis=1)
                            enclosed|=bool(np.any(distance+radius<radii[:-1]*(1-t)+radii[1:]*t))
                        self.assertTrue(enclosed,'Parent cap must not form an exposed flat ledge')

    def test_bole_keeps_its_width_below_the_fork(self):
        profiles=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())
        for species,p in profiles.items():
            if 'growth' not in p:continue
            for variant in [1,2,3]:
                paths,_,_,_=scaffold(p,variant);surface=flow_surfaces(paths)[0];bole=paths[0]
                distance=np.linalg.norm(bole['points']-bole['points'][-1],axis=1)
                sample=int(np.argmin(abs(distance-bole['radii'][-1])))
                with self.subTest(species=species,variant=variant):self.assertGreaterEqual(surface['radii'][sample],bole['radii'][sample]*.95)

    def test_bark_projection_blend_is_confined_to_junctions(self):
        paths=[{'points':np.array([[0,0,0],[0,0,1]]),'radii':np.array([1,1])},
               {'growthRole':'leader','parent':0,'parentNode':1}]
        weights=junction_weights(np.array([[0,0,1],[0,0,101],[3,0,1]]),paths)
        self.assertEqual(weights[0],1);self.assertEqual(weights[1],0)
        self.assertGreater(weights[2],0);self.assertLess(weights[2],1)

    def test_plane_ramification_spans_the_crown_instead_of_one_y(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        for variant in [1,2,3]:
            paths,lobes,_,dimensions=scaffold(p,variant);h=dimensions['heightTarget']
            limbs=[path for path in paths if path.get('growthRole') in ['scaffold','codominant']]
            origins=np.array([path['points'][0] for path in limbs])
            centers=np.array([lobe['center'] for lobe in lobes])
            with self.subTest(variant=variant):
                self.assertGreaterEqual(len(limbs),6)
                self.assertLess(origins[:,2].min()/h,.23)
                self.assertGreater(np.ptp(origins[:,2])/h,.40)
                self.assertLess(np.quantile(centers[:,2],.1)/h,.43)
                self.assertGreater(np.quantile(centers[:,2],.9)/h,.80)
                demands=sorted([path['supportedDemand'] for path in limbs],reverse=True)
                self.assertLess(sum(demands[:2])/sum(demands),.45)
                for path in paths[:dimensions['growth']['structuralPaths']]:
                    if path['parent']>=0:self.assertEqual(path['parentNode'],len(paths[path['parent']]['points'])-1)

    def test_plane_main_axis_does_not_zigzag_between_every_fork(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        for variant in [1,2,3]:
            paths,_,_,_=scaffold(p,variant)
            for path in paths:
                if path.get('growthRole') not in ['bole','leader','codominant']:continue
                delta=np.diff(path['points'],axis=0);directions=delta/np.linalg.norm(delta,axis=1)[:,None]
                with self.subTest(variant=variant,order=path['order']):
                    self.assertLess(np.max(np.arccos(np.clip(np.sum(directions[1:]*directions[:-1],axis=1),-1,1))),np.radians(25))
                    self.assertLess(np.max(np.linalg.norm(directions[:,:2],axis=1)),.35 if path['growthRole']=='bole' else .65)

    def test_small_lateral_does_not_push_the_dominant_trunk_sideways(self):
        paths=[{'points':np.array([[0.,0,0],[0,0,1]]),'radii':np.array([1.,1.]),'growthRole':'bole','junctionMode':'dominant-axis','parent':-1},
               {'points':np.array([[0.,0,1],[0,0,2],[0,0,3]]),'radii':np.array([.95,.95,.95]),'growthRole':'leader','parent':0,'parentNode':1},
               {'points':np.array([[0.,0,1],[1,0,2],[2,0,3]]),'radii':np.array([.2,.2,.2]),'growthRole':'scaffold','parent':0,'parentNode':1}]
        surfaces=flow_surfaces(paths)
        self.assertLess(np.linalg.norm(surfaces[1]['points'][4]-paths[1]['points'][0]),.03)
        self.assertGreater(np.linalg.norm(surfaces[2]['points'][4]-paths[2]['points'][0]),.25)

    def test_plane_roots_continue_from_a_coordinated_flare_and_finish_below_grade(self):
        p=json.loads((ROOT/'tools/bake_vegetation/enhanced_reference/profiles.json').read_text())['london_plane']
        for variant in [1,2,3]:
            paths,_,rng,_=scaffold(p,variant);root_crown(paths,rng);bole=paths[0]
            for root in [path for path in paths if path.get('rootCrown')]:
                np.testing.assert_allclose(root['points'][0],bole['points'][root['parentNode']])
                self.assertGreater(root['points'][0,2],bole['radii'][0])
                self.assertLess(root['points'][-1,2]+root['radii'][-1],-.1)
                self.assertTrue(np.all(np.diff(root['points'][:,2])<0))
                outer=np.linalg.norm(root['points'][:,:2],axis=1)>bole['radii'][0]*1.5
                self.assertTrue(np.all(root['points'][outer,2]-root['radii'][outer]*.8<0),'Exposed roots must remain seated in the ground')
            for flare in bole['rootFlares']:
                direction=np.array([np.cos(flare['angle']),np.sin(flare['angle']),0.])
                self.assertGreater(radial_flare(bole,direction,0),.5)
                self.assertLess(radial_flare(bole,direction,3),.15)


if __name__=='__main__':unittest.main()
