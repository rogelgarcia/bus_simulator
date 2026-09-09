"""Synthetic exposure invariance and fixed-region measurements."""
import json
import sys
from pathlib import Path
import numpy as np
import PyOpenColorIO as ocio

root=Path(__file__).resolve().parents[2]
tool=root/'tools/bake_lighting/experiments/sun_sky_ratios'
sys.path.insert(0,str(tool))
sys.path.insert(0,str(tool.parent/'lighting_configurations/postprocess'))
from measure import exposure_offsets,display_metrics,compare_uniform
from color_pipeline import display

cards=[{'light':name,'measurements':{'gray18':{'meanLuminance':value}}} for name,value in [('base',.5),('control',2)]]
offsets=exposure_offsets(cards,'base')
assert offsets=={'base':0,'control':-2}
for invalid in [0,-1,float('nan')]:
    cards[1]['measurements']['gray18']['meanLuminance']=invalid
    try:exposure_offsets(cards,'base')
    except ValueError:pass
    else:raise AssertionError('Invalid calibration accepted')
rgb=np.random.default_rng(563).uniform(0,8,(16,16,3)).astype(np.float32)
recipe={'type':'three_aces_filmic','exposureMultiplier':1}
color={'workingSpace':'Linear Rec.709','display':'sRGB'}
machine=json.loads((root/'tools/baking/blender.local.json').read_text())
ocio_file=next(Path(machine['executable']).parent.glob('*/datafiles/colormanagement/config.ocio'))
config=ocio.Config.CreateFromFile(str(ocio_file))
for recipe in [recipe,{'type':'ocio','view':'AgX'}]:
    a=display(rgb,recipe,0,color,config)
    b=display(rgb*4,recipe,-2,color,config)
    assert compare_uniform(a,b)['rmseEncodedRgb']==0
metrics=display_metrics(np.ones((10,10,3),np.float32),[{'id':'patch','box':[0,0,.5,.5]}])
assert metrics['nearWhiteFraction']==1 and metrics['regions']['patch']['meanEncodedLuminance']==1
print('Calibration, both display transforms and ROI measurements passed')
