// AI577 D6 near field of the runtime surface cache (landscape-surface-cache-near-v1), mirroring LandscapeSurfaceCacheNearField.js. Where a fragment's
// filtered footprint is finer than the cache texels resolve, the coverage and materials are evaluated per pixel: the near pass (LANDSCAPE_SURFACE_CACHE_NEAR,
// the uncached program drawn after the cached frame over the tiles near the camera, depth-tested against it) blends the fragments whose weight is positive
// over the cached frame with alpha = weight (1 where it owns the fragment completely). The weight is a function of the planar derivatives with the
// cache's own footprint metric. Values come from LandscapeSurfaceCacheNearPass:
//   uSurfaceCacheNear      vec4(footprint at and below which the near pass owns a fragment, footprint at and above which the cache does (<= 0 disables),
//                          cache sampler anisotropy, 1 for the inspection view that marks the near pass's fragments magenta)
uniform vec4 uSurfaceCacheNear;

// 1 where the near pass owns the fragment, 0 where the cache does, smooth between
float landscapeSurfaceCacheNearWeight(vec2 dx, vec2 dy) {
    if (uSurfaceCacheNear.y <= 0.0) return 0.0;
    float a = length(dx), b = length(dy);
    return 1.0 - smoothstep(uSurfaceCacheNear.x, uSurfaceCacheNear.y, max(max(a, b) / uSurfaceCacheNear.z, min(a, b)));
}
