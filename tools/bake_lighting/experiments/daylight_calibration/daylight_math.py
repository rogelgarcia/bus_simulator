"""Numerical receiver integrals; independent quadrature of the pinned model's solar spectrum.

Atmospheric coefficients and four-wavelength XYZ weights: Blender 5.2.1
intern/sky/source/sky_multiple_scattering.cpp, MIT, Blender Authors (2022),
Fernando Garcia Linan (2022). This validates implementation/units, not the model
against measured weather. Integration uses 1024 steps versus Blender's 64.
"""
import math
import numpy as np

Y = np.array([.2126, .7152, .0722])
XYZ_TO_RGB = np.array([[3.2404542,-1.5371385,-.4985314],[-.969266,1.8760108,.041556],[.0556434,-.2040259,1.0572252]])
RGB_TO_XYZ = np.linalg.inv(XYZ_TO_RGB)
SPECTRAL_XYZ = np.array([[53.38691773856467,22.981337506691025,0],[43.90484446636936,71.3477957000534,.1025068679657413],[1.6137278251608962,18.422960591455485,31.742921188390806],[20.762668673810577,2.361421352331437,110.4800964325214]])

def sun_direction(defaults):
    az,el = [math.radians(defaults['sun'][k]) for k in ('azimuthDeg','elevationDeg')]
    return np.array([math.cos(el)*math.sin(az),-math.cos(el)*math.cos(az),math.sin(el)])

def spectral_sun(defaults, profile, steps=1024):
    """Return modeled direct-normal RGB and lux including Blender's limb darkening."""
    radius=6371.; altitude=defaults['altitudeMeters']/1000
    el=math.radians(defaults['sun']['elevationDeg']); origin=radius+altitude
    length=-origin*math.sin(el)+math.sqrt((radius+100)**2-origin**2*math.cos(el)**2)
    t=(np.arange(steps)+.5)*(length/steps)
    h=np.maximum(np.sqrt(origin**2+t*t+2*origin*t*math.sin(el))-radius,1e-4)
    rayleigh=np.exp(-.07771971*h**1.16364243)[:,None]*np.array([6.605e-3,1.067e-2,1.842e-2,3.156e-2])*defaults['airDensity']
    ozone=(3.78547397e20*np.exp(-(np.log(h)-3.22261)**2*5.55555555-np.log(h)))[:,None]*334.5*np.array([3.472e-25,3.914e-25,1.349e-25,11.03e-27])*defaults['ozoneDensity']
    density=1.3681e20*np.exp(-h/.73)+2e6
    aerosol=density[:,None]*(np.array([2.8722e-24,4.6168e-24,7.9706e-24,1.3578e-23])+np.array([1.5908e-22,1.7711e-22,2.0942e-22,2.4033e-22]))*profile['aerosolDensity']
    transmission=np.exp(-np.sum(rayleigh+ozone+aerosol,axis=0)*(length/steps))
    xyz=(np.array([1.679,1.828,1.986,1.307])*transmission)@SPECTRAL_XYZ
    # Average of 0.4+0.6*sqrt(1-r^2) over the apparent disc is 0.8.
    xyz*=.8
    return {'rgb':(xyz@XYZ_TO_RGB.T).tolist(),'estimatedLux':float(xyz[1]*683),'transmittance':transmission.tolist(),'steps':steps,'limbDarkeningIntegral':.8}

def directions(width,height):
    """Top-down image, Three equirectangular UV; vectors expressed in Blender XYZ."""
    lon=((np.arange(width)+.5)/width)*2*math.pi
    lat=(.5-(np.arange(height)+.5)/height)*math.pi
    c=np.cos(lat)[:,None]
    return np.stack(np.broadcast_arrays(-c*np.cos(lon),c*np.sin(lon),np.sin(lat)[:,None]),axis=-1)

def irradiance(pixels,normal):
    h,w=pixels.shape[:2]; d=directions(w,h)
    latitude=(.5-(np.arange(h)+.5)/h)*math.pi
    weights=np.maximum(d@np.array(normal),0)*np.cos(latitude)[:,None]*(2*math.pi/w)*(math.pi/h)
    return np.sum(pixels[:,:,:3]*weights[:,:,None],axis=(0,1))

def overcast(d, lux):
    # CIE S011/E:2003 / ISO15469:2004 classic overcast: L/Lz=(1+2*sin(elevation))/3.
    # E_h = 7*pi*Lz/9. Equal linear Rec.709 channels impose the declared D65 white.
    lz=(lux/683)*9/(7*math.pi)
    return np.repeat(np.where(d[:,:,2]>0,lz*(1+2*d[:,:,2])/3,0)[:,:,None],3,axis=2)

def chromaticity(rgb):
    xyz=np.asarray(rgb)@RGB_TO_XYZ.T
    return (xyz[:2]/max(float(xyz.sum()),1e-12)).tolist()
