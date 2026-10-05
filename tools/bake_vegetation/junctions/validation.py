# Reproduces the narrow ground-cap triangle that exposed mixed-precision orientation checks.
import bpy
import numpy as np
from woody_detail import displaced_coordinates


def check_stationary_cap():
    points=np.array([[.08516689389944077,-.05453500524163246,0],
                     [.03068685345351696,-.019652212038636208,0],
                     [.26795151829719543,-.17156937718391418,0]],dtype=np.float32)
    mesh=bpy.data.meshes.new('Stationary ground-cap regression')
    mesh.from_pydata(points.tolist(),[],[(2,0,1)])
    try:
        result,damped=displaced_coordinates(mesh,points,np.tile([0.,0.,-1.],(3,1)).astype(np.float32),np.zeros(3,np.float64))
        if not np.array_equal(result,points) or damped:raise RuntimeError('Stationary cap was changed or rejected')
    finally:bpy.data.meshes.remove(mesh)
    print('[Branch unions] Stationary ground-cap orientation regression passed',flush=True)
