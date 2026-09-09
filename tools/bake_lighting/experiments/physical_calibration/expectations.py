"""Independent radiometric expectations and predefined error tests, without renderer APIs."""
import math
import numpy as np


def decode_srgb(value):
    value = np.asarray(value,dtype=np.float64)
    return np.where(value <= 0.04045,value/12.92,((value+0.055)/1.055)**2.4)


def receiver_coordinates(width, scale):
    x = (np.arange(width)+0.5)/width*scale-scale/2
    return np.meshgrid(x,-x)


def shadow_profile(fixture, width, scale, rings=64):
    x,_ = receiver_coordinates(width,scale)
    if fixture['angularDiameter'] == 0:
        return (x[0] >= fixture['occluderHeight']*0.5).astype(float)*fixture['irradiance']/math.pi/math.sqrt(1.25)
    cosine = 1-(np.arange(rings)+0.5)/rings*(1-math.cos(fixture['angularDiameter']/2))
    phi = (np.arange(256)+0.5)/256*2*math.pi
    sine = np.sqrt(1-cosine*cosine)
    dx = (-cosine[:,None]*0.5 + sine[:,None]*np.cos(phi))/math.sqrt(1.25)
    dz = (cosine[:,None] + sine[:,None]*np.cos(phi)*0.5)/math.sqrt(1.25)
    dx,dz = np.broadcast_arrays(dx,dz)
    threshold = -fixture['occluderHeight']*dx.ravel()/dz.ravel()
    return np.array([np.mean(dz.ravel()*(position >= threshold)) for position in x[0]])*fixture['irradiance']/math.pi


def expected_image(fixture,width,scale):
    x,y = receiver_coordinates(width,scale)
    color = decode_srgb(np.array(fixture['textureBytes'])/255) if 'textureBytes' in fixture else np.array(fixture['color'])
    if fixture['source'] == 'sun':
        illumination = np.full_like(x,fixture['irradiance']*math.cos(math.radians(fixture['angleDeg']))/math.pi)
    elif fixture['source'] == 'point':
        h = fixture['height']
        illumination = fixture['intensity']*h/(x*x+y*y+h*h)**1.5/math.pi
    elif fixture['source'] == 'environment':
        illumination = np.full_like(x,fixture['radiance'])
    elif fixture['source'] == 'shadow':
        illumination = np.broadcast_to(shadow_profile(fixture,width,scale),x.shape)
    else:
        raise ValueError('Unknown fixture source')
    return illumination[:,:,None]*color


def measure(observed,expected,mask,tolerances,noise=None):
    actual,reference = observed[mask],expected[mask]
    if not np.isfinite(actual).all():
        raise ValueError('Nonfinite native radiance')
    difference = actual-reference
    rmse = float(np.sqrt(np.mean(difference*difference)))
    scale = float(np.sqrt(np.mean(reference*reference)))
    uncertainty = 0 if noise is None else float(np.sqrt(np.mean((noise[mask])**2)))
    limit = tolerances['linearAbsolute']+tolerances['linearRelative']*scale+tolerances['noiseSigmaMultiplier']*uncertainty
    excessive_noise = uncertainty > tolerances['noiseMaximumRelative']*max(scale,0.01)
    return {'status':'pass' if rmse <= limit and not excessive_noise else 'fail','rmse':rmse,'relativeRmse':rmse/max(scale,1e-12),'limit':limit,'noiseRmse':uncertainty,'excessiveNoise':excessive_noise,'meanRgb':actual.mean(axis=0).tolist(),'expectedRgb':reference.mean(axis=0).tolist(),'energyRatio':float(actual.sum()/reference.sum()) if reference.sum()>0 else None,'pixels':int(mask.sum())}


def mutation_checks(expected,mask,tolerances):
    candidates={'incorrect_gamma':np.maximum(expected,0)**(1/2.2),'double_light':expected*2,'wrong_scale':expected*0.5}
    return {name:measure(value,expected,mask,tolerances)['status']=='fail' for name,value in candidates.items()}
