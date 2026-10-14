# Curves the actual blade tissue around a bowed midrib, cupped lobes and a drooping tip.
import numpy as np


def blade_height(xy,form):
    rng=np.random.default_rng(14173+form*109)
    arch=rng.uniform(.14,.22);droop=rng.uniform(.12,.21);cup=rng.uniform(.55,.85)
    twist=rng.uniform(-.16,.16);lobe=rng.uniform(.022,.050);phase=rng.uniform(-.7,.7)
    x,y=np.asarray(xy).T;progress=np.clip(y,0,1)
    midrib=arch*np.sin(np.pi*progress)-droop*progress**2
    bowl=cup*abs(x)**1.7*(.70+.30*np.sin(np.pi*progress))
    torsion=twist*x*progress
    # Long wavelength lobe curl varies the shoulders without crumpling the surface or moving the stalk.
    curl=lobe*np.sin(np.arctan2(x,y+.08)*3+phase)*abs(x)*3
    return midrib+bowl+torsion+curl


def open_blade_height(xy,form):
    rng=np.random.default_rng(15173+form*109)
    arch=rng.uniform(.035,.055);droop=rng.uniform(.025,.045);cup=rng.uniform(.20,.27)
    twist=rng.uniform(-.025,.025);lobe=rng.uniform(.003,.007);phase=rng.uniform(-.7,.7)
    x,y=np.asarray(xy).T;progress=np.clip(y,0,1)
    midrib=arch*np.sin(np.pi*progress)-droop*progress**2
    margins=-cup*abs(x)**1.7*(.70+.30*np.sin(np.pi*progress))
    return midrib+margins+twist*x*progress+lobe*np.sin(np.arctan2(x,y+.08)*3+phase)*abs(x)*3


def blade_shape_metrics(points):
    centered=points-points.mean(axis=0);_,_,axes=np.linalg.svd(centered,full_matrices=False)
    residual=centered@axes[-1]
    return {'depthRatio':float(np.ptp(points[:,2])),
            'bestPlaneRmsRatio':float(np.sqrt(np.mean(residual**2)))}
