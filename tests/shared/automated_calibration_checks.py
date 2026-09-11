"""Independent synthetic-image guards and held-out selection regressions."""
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/bake_lighting/experiments/automated_calibration'))
from metrics import ranking,measures,violations
guards={'surfaceWhiteClipFraction':.04,'facadeCrushFraction':.4,'skyMedianBlueMinusRedMin':.025}
base={'trainingViolations':[],'daylight':'D01','exposureOffset':0,'heldOutViolations':[]}
assert ranking(base)==ranking({**base,'heldOutViolations':['bad']}), 'Held-out leakage'
assert ranking(base)<ranking({**base,'exposureOffset':.5})
index=np.ones((20,20));regions={'facade':[0,0,1,1]}
dark=measures(np.zeros((20,20,3)),np.zeros((20,20,3)),index,regions)
assert 'facade black crush' in violations(dark,guards,'D01')
white=measures(np.ones((20,20,3))*100,np.ones((20,20,3)),index,regions)
assert 'surface highlight clipping' in violations(white,guards,'D01')
bad=measures(np.full((20,20,3),np.nan),np.zeros((20,20,3)),index,regions)
assert not bad['rawFinite']
print('Synthetic display guards and held-out split passed')
