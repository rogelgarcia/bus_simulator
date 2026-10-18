# Regression for translated sub-voxel cavities whose float32 world-space determinant can have the wrong sign.
import importlib.util
from pathlib import Path
import struct
import unittest

spec=importlib.util.spec_from_file_location('surface_volume',Path(__file__).resolve().parents[2]/'tools/bake_vegetation/ramification3d/surface_volume.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


def cube(origin,size):
    bits=[(0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1)]
    points=[tuple(struct.unpack('f',struct.pack('f',origin[k]+p[k]*size))[0] for k in range(3)) for p in bits]
    indices=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    return [[points[i] for i in face] for face in indices],(points[6][0]-points[0][0])*(points[6][1]-points[0][1])*(points[6][2]-points[0][2])


class SurfaceVolumeTest(unittest.TestCase):
    def test_tiny_solid_stays_positive_after_translation(self):
        for origin in [(0,0,0),(-.1065,.108,-.0225),(15.,-8.,3.)]:
            faces,volume=cube(origin,.00003)
            self.assertAlmostEqual(module.signed_volume(faces)/volume,1.,places=12)

    def test_tiny_cavity_stays_negative_after_translation(self):
        faces,volume=cube((-.1065,.108,-.0225),.00003)
        self.assertAlmostEqual(module.signed_volume([list(reversed(face)) for face in faces])/volume,-1.,places=12)

    def test_face_order_and_triangulation_do_not_change_volume(self):
        faces,volume=cube((-.111,-.0284,-.021),.000002)
        triangles=[[f[0],f[i],f[i+1]] for f in reversed(faces) for i in range(1,len(f)-1)]
        self.assertAlmostEqual(module.signed_volume(triangles)/volume,1.,places=12)

    def test_recorded_arrowwood_quantization_sliver_is_bounded(self):
        self.assertTrue(module.is_remesh_sliver(8,[4]*6,2.191987346952957e-16,.000073615,.0015,.0105))

    def test_actual_root_sized_piece_is_never_classified_as_sliver(self):
        faces,volume=cube((-.111,-.0284,-.021),.0105)
        self.assertFalse(module.is_remesh_sliver(8,[4]*6,volume,.0105,.0015,.0105))
        self.assertFalse(module.is_remesh_sliver(8,[4]*6,2e-16,.0015*.1,.0015,.0105))
        self.assertFalse(module.is_remesh_sliver(16,[4]*6,2e-16,.00007,.0015,.0105))


if __name__=='__main__':unittest.main()
