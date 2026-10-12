// @section pars
varying vec2 vGrassBoundaryWorld;
uniform sampler2D grassBoundaryMap;
uniform vec4 grassBoundaryBounds;
uniform float grassBoundaryInverse;
uniform float grassBoundaryEnabled;
// @section apply
if (grassBoundaryEnabled > 0.5) {
    vec2 grassBoundaryUv = (vGrassBoundaryWorld - grassBoundaryBounds.xy) * grassBoundaryBounds.zw;
    float grassBoundaryCoverage = 0.0;
    if (all(greaterThanEqual(grassBoundaryUv, vec2(0.0))) && all(lessThan(grassBoundaryUv, vec2(1.0)))) {
        grassBoundaryCoverage = texture2D(grassBoundaryMap, grassBoundaryUv).r;
    }
    if (grassBoundaryInverse > 0.5 ? grassBoundaryCoverage >= 0.5 : grassBoundaryCoverage < 0.5) discard;
}
