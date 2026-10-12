// @section pars
uniform sampler2D grassRuntimeCoverage;
uniform vec4 grassRuntimeCoverageBounds;
uniform vec4 grassRuntimeWindow;
uniform float grassRuntimeFar;
uniform sampler2D grassRuntimeStaticVisibility;
uniform vec4 grassRuntimeStaticBounds;
float grassRuntimeStaticShadow(vec2 world) {
    vec2 uv = vec2(world.x - grassRuntimeStaticBounds.x, grassRuntimeStaticBounds.y - world.y) * grassRuntimeStaticBounds.zw;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
    return texture2D(grassRuntimeStaticVisibility, uv).r;
}
// @section apply
vec2 grassCoverageUv = (vBakedGrassWorld - grassRuntimeCoverageBounds.xy) * grassRuntimeCoverageBounds.zw;
if (any(lessThan(grassCoverageUv, vec2(0.0))) || any(greaterThanEqual(grassCoverageUv, vec2(1.0)))
    || texture2D(grassRuntimeCoverage, grassCoverageUv).r < 0.5) discard;
if (grassRuntimeFar > 0.5 && all(greaterThanEqual(vBakedGrassWorld, grassRuntimeWindow.xy))
    && all(lessThan(vBakedGrassWorld, grassRuntimeWindow.zw))) discard;
