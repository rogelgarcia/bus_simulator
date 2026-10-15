# Checks that branch collars grow locally in three dimensions without pinching the supporting trunk.
import sys
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/bake_vegetation/enhanced_reference'))
from fork_shoulders import shoulder_fields,shoulder_growth
from fork_charts import blend_weight,chart_neighbours


class ForkShoulderTests(unittest.TestCase):
    def test_chart_blending_is_continuous_when_nearest_surface_changes(self):
        for a,b in [(0.,0.),(.01,.03),(.10,.02)]:
            self.assertAlmostEqual(blend_weight(a,b,.06)+blend_weight(b,a,.06),1)
        self.assertEqual(blend_weight(.01,.2,.06),0)
        self.assertEqual(blend_weight(.2,.01,.06),1)
        paths=self.paths();self.assertEqual(chart_neighbours(paths,paths),[[1],[0]])

    def paths(self):
        t=np.linspace(0,1,25)
        return [{'points':np.c_[t*0,t*0,t*4],'radii':np.ones(25)*.5,'parent':-1,'growthRole':'bole'},
                {'points':np.c_[t*t*3,t*0,4+t*2],'radii':np.linspace(.32,.04,25),'parent':0,'parentNode':24,'growthRole':'scaffold'}]

    def test_parent_shoulder_is_longitudinal_local_and_never_removes_trunk_volume(self):
        fields=shoulder_fields(self.paths())[0]
        self.assertGreater(shoulder_growth(np.array([.5,0,3.3]),np.array([1.,0,0]),fields),.03)
        self.assertLess(shoulder_growth(np.array([-.5,0,3.3]),np.array([-1.,0,0]),fields),1e-12)
        for z in [0,1,2,5,6]:self.assertLess(shoulder_growth(np.array([.5,0,z]),np.array([1.,0,0]),fields),1e-12)
        values=[shoulder_growth(np.array([.5,0,z]),np.array([1.,0,0]),fields) for z in np.linspace(0,6,100)]
        self.assertGreaterEqual(min(values),0);self.assertLessEqual(max(values),.22)

    def test_connection_shape_rotates_with_the_tree_instead_of_using_world_axes(self):
        paths=self.paths();a=.93;b=.44
        rotation=np.array([[np.cos(a),-np.sin(a),0],[np.sin(a),np.cos(a),0],[0,0,1]])@np.array([[1,0,0],[0,np.cos(b),-np.sin(b)],[0,np.sin(b),np.cos(b)]])
        before=shoulder_fields(paths);after=shoulder_fields([{**p,'points':p['points']@rotation.T} for p in paths])
        for i,point in enumerate([np.array([.5,0,3.3]),np.array([.6,0,4.8])]):
            direction=np.array([1.,0,0])
            self.assertAlmostEqual(shoulder_growth(point,direction,before[i]),shoulder_growth(rotation@point,rotation@direction,after[i]),places=12)

    def test_axial_continuation_and_tiny_twigs_do_not_receive_spurious_knuckles(self):
        paths=self.paths();paths[1]['points'][:,0]=0
        self.assertEqual(shoulder_fields(paths),[[],[]])
        paths=self.paths();paths[1]['radii']*=.1
        self.assertEqual(shoulder_fields(paths),[[],[]])
