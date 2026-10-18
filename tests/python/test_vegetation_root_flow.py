# Guards continuous bark direction through the trunk-to-root transition.
import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/bake_vegetation/ramification3d'))
from root_flow import growth_coordinates,axis_coordinates,unwrap_faces,collar_weight,stem_owners


class RootFlowTests(unittest.TestCase):
    def setUp(self):
        self.stem=np.column_stack([np.zeros(41),np.zeros(41),np.linspace(0,4,41)])
        self.radii=np.ones(41)

    def test_grain_follows_a_smooth_vertical_to_horizontal_collar(self):
        t=np.linspace(0,1,1001);rho=1+3*t*t;z=2*(1-t)**2
        points=np.column_stack([np.zeros(len(t)),rho,z]);uv=growth_coordinates(points,self.stem,self.radii,1)
        self.assertLess(np.ptp(uv[:,0]),1e-12)
        self.assertTrue(np.all(np.diff(uv[:,1])<0))
        self.assertLess(np.abs(np.diff(uv[:,1],n=2)).max(),.0001)

    def test_trunk_and_root_receive_identical_coordinates_at_shared_points(self):
        points=np.array([[.2,1.2,.7],[-.5,1.3,.5],[.4,-1.2,.3]])
        whole=growth_coordinates(points,self.stem,self.radii,.8)
        split=np.vstack([growth_coordinates(points[:1],self.stem,self.radii,.8),growth_coordinates(points[1:],self.stem,self.radii,.8)])
        np.testing.assert_array_equal(whole,split)

    def test_polar_seam_never_interpolates_across_a_whole_circumference(self):
        values=np.array([3.13,-3.13,-3.12,3.12]);result=unwrap_faces(values,np.array([0]),np.array([4]),2*np.pi)
        self.assertLess(np.ptp(result),.05)

    def test_upper_shoot_transition_has_flat_end_derivatives(self):
        radius=.6;h=np.array([2.15,2.15001,2.99999,3.])*radius;w=collar_weight(h,radius)
        np.testing.assert_allclose(w,[1,1,0,0],atol=1e-12)

    def test_translation_and_scale_preserve_mapping(self):
        points=np.array([[.2,1.4,.5],[.1,1.,1.5]]);shift=np.array([3.,-2.,0.])
        expected=growth_coordinates(points,self.stem,self.radii,.8)
        np.testing.assert_allclose(expected,growth_coordinates(points*2+shift,self.stem*2+shift,self.radii*2,1.6),atol=1e-12)

    def test_outer_root_grain_retains_metric_length_and_cross_section(self):
        roots=[{'points':np.array([[0,0,0],[0,3,0],[0,6,0]]),'radii':[.5,.3,.1]}]
        points=np.array([[0,4,.2],[0,5,.2],[-.2,4,0]])
        uv=axis_coordinates(points,roots,1,1,np.zeros(3))
        self.assertAlmostEqual(uv[1,1]-uv[0,1],-1)
        self.assertAlmostEqual(uv[2,0]-uv[0,0],np.pi*.25)

    def test_axis_blend_is_continuous_and_finite_at_both_ends(self):
        roots=[{'points':np.array([[0,0,0],[0,3,0],[0,6,0]]),'radii':[.5,.3,.1]}]
        t=np.linspace(1,4,3001);points=np.column_stack([np.zeros(len(t)),t,np.full(len(t),.3)])
        uv=growth_coordinates(points,self.stem,self.radii,1,roots)
        self.assertTrue(np.isfinite(uv).all());self.assertLess(np.abs(np.diff(uv[:,1],n=2)).max(),.0001)

    def test_slanted_cane_matches_its_original_longitudinal_chart_frame(self):
        direction=np.array([.5,0,np.sqrt(.75)]);stem=np.linspace(np.zeros(3),direction*4,41)
        side=np.cross(direction,[0.,0.,1.]);side/=np.linalg.norm(side);across=np.cross(direction,side)
        angle=np.array([.2,.6,1.1,2.3]);points=direction*1.5+np.cos(angle)[:,None]*side+np.sin(angle)[:,None]*across
        uv=growth_coordinates(points,stem,self.radii,1)
        np.testing.assert_allclose(uv[:,0],angle,atol=1e-12)
        np.testing.assert_allclose(uv[:,1],np.full(4,1.46),atol=1e-12)

    def test_root_seam_unwrap_uses_root_circumference_not_trunk_circumference(self):
        roots=[{'points':np.array([[0,0,0],[0,3,0],[0,6,0]]),'radii':[.5,.3,.1]}]
        points=np.array([[-.001,4,-.2],[.001,4,-.2],[.001,4.01,-.2],[-.001,4.01,-.2]])
        uv,period=growth_coordinates(points,self.stem,self.radii,1,roots,True)
        result=unwrap_faces(uv[:,0],np.array([0]),np.array([4]),period)
        self.assertLess(np.ptp(result),.01)

    def test_nonseam_faces_keep_absolute_phase_when_root_period_changes(self):
        values=np.array([4.21,4.22,4.225,4.215,4.215,4.225,4.23,4.22])
        periods=np.repeat([1.3,1.31],4)
        result=unwrap_faces(values,np.array([0,4]),np.array([4,4]),periods)
        np.testing.assert_array_equal(result,values)

    def test_unwrapping_preserves_arbitrary_chart_offset(self):
        values=np.array([3.13,-3.13,-3.12,3.12]);starts=np.array([0]);counts=np.array([4]);period=2*np.pi
        expected=unwrap_faces(values,starts,counts,period)+4.7
        np.testing.assert_allclose(unwrap_faces(values+4.7,starts,counts,period),expected,atol=1e-12)

    def test_cane_ownership_follows_curved_stem_not_ground_anchor(self):
        stems=[np.array([[-.1,0,0],[.3,0,1]]),np.array([[.1,0,0],[-.3,0,1]])]
        np.testing.assert_array_equal(stem_owners(np.array([[.03,0,.3],[-.03,0,.3]]),stems,[.02,.02]),[0,1])

    def test_outward_root_keeps_its_host_when_passing_another_cane(self):
        stems=[np.array([[0,0,0],[0,0,1]]),np.array([[1,0,0],[1,0,1]])]
        roots=[[{'points':np.array([[0,0,0],[1,0,-.1],[2,0,-.2]]),'radii':[.2,.1,.01]}],[]]
        np.testing.assert_array_equal(stem_owners(np.array([[1.1,0,-.11]]),stems,[.05,.05],roots),[0])


if __name__=='__main__':unittest.main()
