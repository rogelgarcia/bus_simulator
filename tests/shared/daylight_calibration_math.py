"""Independent integration and geometry checks; includes deliberate physical-input errors."""
import sys,json,math
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'tools/bake_lighting/experiments/daylight_calibration'))
from daylight_math import directions,irradiance,overcast,spectral_sun,sun_direction,chromaticity
d=json.loads((root/'tools/bake_lighting/experiments/daylight_calibration/defaults.json').read_text())
vectors=directions(1024,512)
# Integrate constant radiance over three independent receiver hemispheres.
constant=np.ones((512,1024,3))*2.4
for n in ([0,0,1],[1,0,0],[0,1,0]):assert np.allclose(irradiance(constant,n),math.pi*2.4,rtol=2e-5)
sky=overcast(vectors,10000)
assert abs(irradiance(sky,[0,0,1])[1]*683/10000-1)<.00002
# Closed-form vertical integral: Lz*(pi/6+4/9).
lz=10000/683*9/(7*math.pi)
assert abs(irradiance(sky,[1,0,0])[1]/(lz*(math.pi/6+4/9))-1)<.00002
assert np.allclose(chromaticity([1,1,1]),[.3127,.3290],atol=.0001)
sun=sun_direction(d);assert np.allclose(sun,[.579227965,-.579227965,.573576436],atol=1e-8)
clear=spectral_sun(d,d['profiles'][0]);hazy=spectral_sun(d,d['profiles'][1])
assert clear['estimatedLux']>hazy['estimatedLux']>0
assert np.max(np.abs(np.array(clear['rgb'])/spectral_sun(d,d['profiles'][0],4096)['rgb']-1))<.0001
assert not np.allclose(irradiance(2*sky,[0,0,1]),irradiance(sky,[0,0,1]),rtol=.1)
assert abs(np.dot(sun,[1,0,0])-np.dot(sun,[0,1,0]))>.5
print('Daylight quadrature, absolute overcast normalization, axes, spectral convergence and negative controls passed')
