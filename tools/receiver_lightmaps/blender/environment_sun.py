"""Separates the photographed solar disc and halo from diffuse environment transport."""
import math
import numpy as np


def separate_environment_sun(rgba, radius_degrees):
    if not 0 < radius_degrees < 15:
        raise ValueError('Environment solar radius must be between 0 and 15 degrees')
    height, width = rgba.shape[:2]
    latitude = ((np.arange(height) + .5) / height - .5) * math.pi
    longitude = ((np.arange(width) + .5) / width - .5) * 2 * math.pi
    direction = np.stack(np.broadcast_arrays(np.cos(latitude)[:, None] * np.cos(longitude)[None, :],
        np.sin(latitude)[:, None], np.cos(latitude)[:, None] * np.sin(longitude)[None, :]), axis=-1)
    luminance = rgba[:, :, :3] @ [.2126, .7152, .0722]
    peak = np.unravel_index(np.argmax(np.where(direction[:, :, 1] > 0, luminance, -1)), luminance.shape)
    angle = np.arccos(np.clip(direction @ direction[peak], -1, 1))
    radius = math.radians(radius_degrees)
    disc, ring = angle < radius, (angle >= radius) & (angle < radius * 2)
    weights = np.broadcast_to(np.cos(latitude)[:, None], luminance.shape)
    sky = np.average(rgba[:, :, :3][ring], axis=0, weights=weights[ring])
    output = rgba.copy()
    output[disc, :3] = sky
    removed = ((rgba[:, :, :3] - output[:, :, :3]) * weights[:, :, None]).sum(axis=(0, 1)) * math.pi / height * 2 * math.pi / width
    return output, {'policy': 'single-authored-sun-v1', 'radiusDegrees': radius_degrees,
        'directionThree': direction[peak].tolist(), 'replacementSkyRadiance': sky.tolist(),
        'removedRadianceIntegral': removed.tolist(), 'pixels': int(disc.sum())}
