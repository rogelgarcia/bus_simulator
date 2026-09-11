"""Physical measurements and separately named aesthetic guards, with no image-target fitting."""
import numpy as np
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import Y,srgb_decode

def region(array,box):
    h,w=array.shape[:2];x0,y0,x1,y1=box;return array[int(y0*h):int(y1*h),int(x0*w):int(x1*w)]

def measures(rgb,encoded,index,regions):
    surface=index>0;sky=(index==0);sky[encoded.shape[0]//2:]=False
    values=encoded[surface];result={'rawFinite':bool(np.isfinite(rgb).all()),'rawMeanY':float((rgb@Y).mean()),'surfaceWhiteClipFraction':float((values.min(axis=-1)>=.99).mean()),'skyPixels':int(sky.sum()),'skyMedianRgb':np.median(encoded[sky],axis=0).tolist() if sky.any() else None,'regions':{}}
    for name,box in regions.items():
        raw=region(rgb,box);display=region(encoded,box);linear=srgb_decode(display)@Y
        result['regions'][name]={'rawMeanY':float((raw@Y).mean()),'displayLinearMeanY':float(linear.mean()),'displayCrushFraction':float((linear<.005).mean()),'displayYPercentiles':np.percentile(linear,[5,50,95]).tolist(),'box':box}
    return result

def violations(m,guards,daylight):
    errors=[]
    if m['surfaceWhiteClipFraction']>guards['surfaceWhiteClipFraction']:errors.append('surface highlight clipping')
    if m['regions']['facade']['displayCrushFraction']>guards['facadeCrushFraction']:errors.append('facade black crush')
    if daylight!='D03' and m['skyMedianRgb'] is not None and m['skyMedianRgb'][2]-m['skyMedianRgb'][0]<guards['skyMedianBlueMinusRedMin']:errors.append('sky blue separation')
    return errors

def ranking(candidate):
    return (len(candidate['trainingViolations']),candidate['daylight']!='D01',abs(candidate['exposureOffset']),candidate['exposureOffset'])
