// AI577 D6 runtime surface cache sampling (landscape-surface-cache-v1), mirroring LandscapeSurfaceCacheLayout.js. Included only by the cached frame
// program (LANDSCAPE_SURFACE_CACHE). The fragment's anisotropic footprint selects the finer trilinear mip of a world-anchored virtual texture,
// raised until that mip's 64-page toroidal window around the clipmap center contains the position; one indirection texel then gives the slot
// and mip of the best resident page (the page itself or its closest resident ancestor), and three filtered fetches with the fragment's own
// gradients read the composited view-independent surface: albedo + AO, the surface normal in the geometric tangent frame + roughness + micro-paired
// coverage, and at half resolution the natural-ground response + coastal reach. Hardware trilinear filtering stays inside a slot (its level 1 is
// the 2x2 box filter of level 0) and the 4-texel gutters keep 2x anisotropic fetches seam-free. Terrain-reflected light reads
// the albedo of the 1 m mip at its 2 m slot level, the coarse ground that stands for the surroundings. Constants come from
// landscapeSurfaceCacheDefines(); values from LandscapeSurfaceCache:
//   uSurfaceCacheFrame  vec4(virtual texture origin X, Z in world meters, clipmap center X, Z in virtual meters on whole mip-0 pages)
//   uSurfaceCacheState  vec4(ready: the root page is resident, sampler anisotropy, root mip, micro-paired soil index or -1)
precision highp usampler2DArray;
uniform usampler2DArray uSurfaceCacheIndirection;
uniform sampler2DArray uSurfaceCacheAlbedo;
uniform sampler2DArray uSurfaceCacheMaterial;
uniform sampler2DArray uSurfaceCacheResponse;
uniform vec4 uSurfaceCacheFrame;
uniform vec4 uSurfaceCacheState;

struct LandscapeCachedSurface {
    vec3 albedo;
    float ao;
    vec3 normal;       // unit normal in the geometric tangent frame (tangent, north, normal)
    float roughness;
    float microWeight; // coverage of micro-paired soils after the height competition
    vec3 response;     // EON roughness, specular shadowing weight, opposition amplitude
    float reach;       // coastal reach in meters
    vec3 groundAlbedo; // coarse albedo of the surroundings for terrain-reflected light
};

// page size of a mip in meters (a power of two: every division by it is exact)
float landscapeSurfaceCachePageMeters(int mip) {
    return LANDSCAPE_SURFACE_CACHE_TEXEL0 * LANDSCAPE_SURFACE_CACHE_PAGE_TEXELS * exp2(float(mip));
}

// the footprint's finer trilinear mip, raised until the mip's toroidal window contains the virtual position
int landscapeSurfaceCacheMip(vec2 p, float lod, int rootMip) {
    int mip = clamp(int(floor(lod)), 0, rootMip);
    for (int i = 0; i < LANDSCAPE_SURFACE_CACHE_MAX_MIPS; i++) {
        if (mip >= rootMip) break;
        float size = landscapeSurfaceCachePageMeters(mip);
        vec2 page = floor(p / size), last = vec2(max(0.0, exp2(float(rootMip - mip)) - LANDSCAPE_SURFACE_CACHE_WINDOW));
        vec2 origin = clamp(floor(uSurfaceCacheFrame.zw / size) - LANDSCAPE_SURFACE_CACHE_WINDOW * 0.5, vec2(0.0), last);
        if (all(greaterThanEqual(page, origin)) && all(lessThan(page, origin + LANDSCAPE_SURFACE_CACHE_WINDOW))) break;
        mip++;
    }
    return mip;
}

// atlas coordinates of a position inside the resident page an indirection entry names; gradient scale converts world derivatives
vec3 landscapeSurfaceCacheCoordinates(uvec4 entry, vec2 p, ivec3 size, out vec2 gradientScale) {
    int slot = int(entry.r | (entry.g << 8u)), perRow = size.x / int(LANDSCAPE_SURFACE_CACHE_SLOT), perLayer = perRow * perRow;
    int layer = slot / perLayer, inLayer = slot - layer * perLayer, row = inLayer / perRow;
    float resident = landscapeSurfaceCachePageMeters(int(entry.b));
    vec2 cell = vec2(float(inLayer - row * perRow), float(row)), inverseSize = 1.0 / vec2(size.xy);
    gradientScale = LANDSCAPE_SURFACE_CACHE_PAGE_TEXELS / resident * inverseSize;
    return vec3((cell * LANDSCAPE_SURFACE_CACHE_SLOT + LANDSCAPE_SURFACE_CACHE_GUTTER + fract(p / resident) * LANDSCAPE_SURFACE_CACHE_PAGE_TEXELS) * inverseSize, float(layer));
}

LandscapeCachedSurface landscapeSurfaceCacheSample(vec2 world, vec2 dx, vec2 dy) {
    int rootMip = int(uSurfaceCacheState.z + 0.5);
    float extent = landscapeSurfaceCachePageMeters(rootMip);
    vec2 p = clamp(world - uSurfaceCacheFrame.xy, vec2(0.0), vec2(extent * 0.99999));
    float major = max(length(dx), length(dy)), minor = min(length(dx), length(dy));
    float footprint = max(major / uSurfaceCacheState.y, minor);
    int mip = landscapeSurfaceCacheMip(p, log2(max(footprint, 1.0e-7) / LANDSCAPE_SURFACE_CACHE_TEXEL0), rootMip);
    ivec2 page = ivec2(floor(p / landscapeSurfaceCachePageMeters(mip)));
    uvec4 entry = texelFetch(uSurfaceCacheIndirection, ivec3(page & ivec2(LANDSCAPE_SURFACE_CACHE_WINDOW_MASK), mip), 0);
    ivec3 size = textureSize(uSurfaceCacheAlbedo, 0);
    vec2 scale;
    vec3 uv = landscapeSurfaceCacheCoordinates(entry, p, size, scale);
    vec4 albedo = textureGrad(uSurfaceCacheAlbedo, uv, dx * scale, dy * scale);
    vec4 material = textureGrad(uSurfaceCacheMaterial, uv, dx * scale, dy * scale);
    vec4 response = textureGrad(uSurfaceCacheResponse, uv, dx * scale, dy * scale);
    // the coarse ground: the 1 m mip (every window from it on covers the landscape), its slot level 1
    int groundMip = max(mip, min(LANDSCAPE_SURFACE_CACHE_GROUND_MIP, rootMip));
    uvec4 groundEntry = texelFetch(uSurfaceCacheIndirection, ivec3(ivec2(floor(p / landscapeSurfaceCachePageMeters(groundMip))) & ivec2(LANDSCAPE_SURFACE_CACHE_WINDOW_MASK), groundMip), 0);
    vec2 groundScale;
    vec3 groundUv = landscapeSurfaceCacheCoordinates(groundEntry, p, size, groundScale);
    LandscapeCachedSurface surface;
    surface.albedo = albedo.rgb;
    surface.ao = albedo.a;
    vec2 e = material.xy * 2.0 - 1.0, t = vec2(e.x + e.y, e.x - e.y) * 0.5;
    surface.normal = normalize(vec3(t, 1.0 - abs(t.x) - abs(t.y)));
    surface.roughness = clamp(material.z, 0.05, 1.0);
    surface.microWeight = material.w;
    surface.response = response.xyz;
    surface.reach = response.w * LANDSCAPE_SURFACE_CACHE_REACH_SCALE;
    surface.groundAlbedo = textureLod(uSurfaceCacheAlbedo, groundUv, 1.0).rgb;
    return surface;
}
