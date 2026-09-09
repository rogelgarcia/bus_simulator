"""Independent invariants and fault sensitivity for the physical calibration harness."""
import json
import math
import sys
import unittest
import tempfile
import struct
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
TOOL=ROOT/'tools/bake_lighting/experiments/physical_calibration'
sys.path.insert(0,str(TOOL))
from expectations import expected_image, shadow_profile, mutation_checks, measure, decode_srgb
from cornell_data import read_mat4


class CalibrationMath(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config=json.loads((TOOL/'defaults.json').read_text())

    def test_lambertian_irradiance_and_cosine(self):
        fixture={'source':'sun','color':[.18,.18,.18],'irradiance':math.pi,'angleDeg':60}
        np.testing.assert_allclose(expected_image(fixture,1,2)[0,0],[.09]*3,atol=1e-12)

    def test_point_source_inverse_square_and_cie_axis(self):
        fixture={'source':'point','color':[1]*3,'intensity':1000,'height':3}
        radiance=expected_image(fixture,1,2)[0,0,0]
        self.assertAlmostEqual(radiance*math.pi,1000/9)
        fixture['height']=6
        self.assertAlmostEqual(expected_image(fixture,1,2)[0,0,0],radiance/4)

    def test_environment_integrates_to_pi_irradiance(self):
        fixture={'source':'environment','color':[.5]*3,'radiance':2}
        np.testing.assert_allclose(expected_image(fixture,4,2),1)

    def test_srgb_is_not_linear_reflectance(self):
        self.assertAlmostEqual(float(decode_srgb(.4613561295)),.18,places=8)
        self.assertLess(float(decode_srgb(.18)),.03)

    def test_shadow_width_grows_with_gap(self):
        fixture={'source':'shadow','irradiance':math.pi,'occluderHeight':.3,'angularDiameter':.12}
        near=shadow_profile(fixture,1024,2)
        fixture['occluderHeight']=1
        far=shadow_profile(fixture,1024,2)
        width=lambda p:np.count_nonzero((p>.1*p.max())&(p<.9*p.max()))
        self.assertGreater(width(far),width(near)*2.5)
        self.assertTrue(np.all(np.diff(far)>=0))

    def test_all_faults_are_detected_and_noise_cannot_hide_anything(self):
        expected=np.full((4,4,3),.18)
        mask=np.ones((4,4),bool)
        tolerance=self.config['tolerances']
        self.assertTrue(all(mutation_checks(expected,mask,tolerance).values()))
        self.assertEqual(measure(expected,expected,mask,tolerance)['status'],'pass')
        self.assertEqual(measure(expected*2,expected,mask,tolerance,np.ones_like(expected))['status'],'fail')

    def test_measured_mat_orientation_and_corruption(self):
        folder=ROOT/'tests/artifacts/screens/ai564_physical_calibration/unit'
        folder.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=folder) as temporary:
            file=Path(temporary)/'test.mat'
            header=struct.pack('>5i',1000,2,2,0,5)+b'test\0'
            data=header+struct.pack('>4d',1,2,3,4)
            file.write_bytes(data)
            np.testing.assert_array_equal(read_mat4(file)['test'],[[1,3],[2,4]])
            for malformed in [data[:-1],data[:10],data+data]:
                file.write_bytes(malformed)
                with self.assertRaises(ValueError):read_mat4(file)


if __name__=='__main__':
    unittest.main()
