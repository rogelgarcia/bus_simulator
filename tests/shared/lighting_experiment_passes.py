"""Protect camera identity at the EXR handoff, using distinct synthetic layer colors."""
import sys
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/bake_lighting/experiments/lighting_configurations/postprocess'))
from color_pipeline import read_pass,ExrPasses

output=Path(sys.argv[1]);output.mkdir(parents=True,exist_ok=True)
file=output/'two_cameras.exr';spec=oiio.ImageSpec(2,2,6,oiio.FLOAT)
spec.channelnames=['pose_01.Combined.'+c for c in 'RGB']+['pose_05.Combined.'+c for c in 'RGB']
pixels=np.zeros((2,2,6),np.float32);pixels[:,:,0]=1;pixels[:,:,4]=1
image=oiio.ImageOutput.create(str(file));assert image.open(str(file),spec);assert image.write_image(pixels);image.close()
np.testing.assert_array_equal(read_pass(file,layer='pose_05'),np.broadcast_to([0,1,0],(2,2,3)))
for read in [lambda:read_pass(file),lambda:ExrPasses(file,'pose_05')]:
    try:read()
    except RuntimeError:pass
    else:raise AssertionError('Accepted an ambiguous/stale camera layer')
assert read_pass(file,'Emission',optional=True,layer='pose_05') is None
print('EXR camera identity and missing-pass regression checks passed')
