"""Independent visible-GGX quadrature; no fitted image values or renderer LUTs.

Visible-normal sampling follows Heitz, JCGT 7(4), 2018, algorithm 3.
https://jcgt.org/published/0007/04/01/
The integral is single scattering. White-normalized directional comparisons
separate the angular environment filter from Fresnel/energy compensation.
"""
import math
import numpy as np


def normalize(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-15)


def samples(count):
    index = np.arange(count, dtype=np.uint32)
    reversed_bits = np.zeros(count, dtype=np.uint32)
    for bit in range(32):
        reversed_bits |= ((index >> bit) & 1) << (31-bit)
    return (index.astype(float)+.5)/count, reversed_bits.astype(float)/(2**32)


def fresnel(cosine, exact):
    if not exact:
        return .04 + .96 * (1-cosine)**5
    transmitted = np.sqrt(1-(1-cosine*cosine)/2.25)
    perpendicular = (cosine-1.5*transmitted)/(cosine+1.5*transmitted)
    parallel = (1.5*cosine-transmitted)/(1.5*cosine+transmitted)
    return .5*(perpendicular**2+parallel**2)


def environment(pixels, directions):
    height, width = pixels.shape[:2]
    x = (np.arctan2(directions[:,2], directions[:,0])/(2*math.pi)+.5)*width-.5
    y = (.5-np.arcsin(np.clip(directions[:,1],-1,1))/math.pi)*height-.5
    ix = np.floor(x).astype(int); iy = np.floor(y).astype(int)
    fx = (x-ix)[:,None]; fy = (y-iy)[:,None]
    top = pixels[np.clip(iy,0,height-1),ix%width,:3]*(1-fx)+pixels[np.clip(iy,0,height-1),(ix+1)%width,:3]*fx
    bottom = pixels[np.clip(iy+1,0,height-1),ix%width,:3]*(1-fx)+pixels[np.clip(iy+1,0,height-1),(ix+1)%width,:3]*fx
    return top*(1-fy)+bottom*fy


def integrate(roughness, no_v, pixels, count=65536):
    alpha = roughness*roughness
    sine = math.sqrt(1-no_v*no_v)
    view = np.array([-sine,0,no_v])
    stretched = normalize(view*np.array([alpha,alpha,1]))
    tangent = normalize(np.array([-stretched[1],stretched[0],0])) if sine>1e-8 else np.array([1.,0,0])
    bitangent = np.cross(stretched,tangent)
    u,v = samples(count)
    t1 = np.sqrt(u)*np.cos(2*math.pi*v); t2 = np.sqrt(u)*np.sin(2*math.pi*v)
    weight = .5*(1+stretched[2])
    t2 = (1-weight)*np.sqrt(np.maximum(0,1-t1*t1))+weight*t2
    half = t1[:,None]*tangent+t2[:,None]*bitangent+np.sqrt(np.maximum(0,1-t1*t1-t2*t2))[:,None]*stretched
    half = normalize(half*np.array([alpha,alpha,1]))
    vo_h = np.clip(half@view,0,1)
    light = 2*vo_h[:,None]*half-view
    no_l = light[:,2]; valid = no_l>1e-12
    sv = math.sqrt(1+alpha*alpha*(1-no_v*no_v)/(no_v*no_v))
    sl = np.sqrt(1+alpha*alpha*(1-no_l[valid]**2)/(no_l[valid]**2))
    visibility = (1+sv)/(sv+sl)
    light = light[valid]
    world = np.column_stack([no_v*light[:,0]+sine*light[:,2],light[:,1],-sine*light[:,0]+no_v*light[:,2]])
    radiance = environment(pixels,world)
    result = {}
    for exact in [False,True]:
        factor = fresnel(vo_h[valid],exact)*visibility
        result['exact' if exact else 'schlick'] = {'white':float(factor.sum()/count),'sky':(np.sum(radiance*factor[:,None],axis=0)/count).tolist()}
    return result
