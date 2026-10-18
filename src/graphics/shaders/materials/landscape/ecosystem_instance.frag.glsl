// AI 599 D4 ecosystem instance fragment program: the LOD cross-fade as a dithered discard (8x8 Bayer threshold shifted by the instance rank, so
// neighbours dither out of step), the alpha-tested cutout of the catalog's leaf and card atlases with their tangent-space normals, the ground-contact
// darkening of the lowest metres, and the landscape lighting of an opaque surface (sun, sky harmonics, natural-ground response, open-ground bounce
// with the neutral visibility hooks of a program without terrain fields) under the aerial perspective, written as linear radiance before the frame
// pipeline's tone mapping. The diagnostic views (compiled in on request) write display-ready colours with alpha 0, the final pass's pass-through sentinel.
#ifndef LANDSCAPE_ECOSYSTEM_DITHER_LIST
#error LANDSCAPE_ECOSYSTEM_DITHER_LIST must be defined by LandscapeEcosystemShaderLoader
#endif
const float ecosystemDitherMatrix[64] = float[64](LANDSCAPE_ECOSYSTEM_DITHER_LIST);
// contact darkening strength and band height (metres, bounded to half the instance height)
uniform vec2 uEcosystemContact;
// 0 shaded, 1 LOD band colour, 2 layer colour, 3 rank, 4 fade
uniform int uEcosystemDiagnostic;
uniform vec3 uEcosystemLodColor;
uniform vec3 uEcosystemLayerColor;
#ifdef LANDSCAPE_ECOSYSTEM_TEXTURED
uniform sampler2D uEcosystemColor0;
uniform sampler2D uEcosystemNormal0;
uniform sampler2D uEcosystemOrm0;
#if LANDSCAPE_ECOSYSTEM_VARIANTS > 1
uniform sampler2D uEcosystemColor1;
uniform sampler2D uEcosystemNormal1;
uniform sampler2D uEcosystemOrm1;
#endif
#if LANDSCAPE_ECOSYSTEM_VARIANTS > 2
uniform sampler2D uEcosystemColor2;
uniform sampler2D uEcosystemNormal2;
uniform sampler2D uEcosystemOrm2;
#endif
#ifndef LANDSCAPE_ECOSYSTEM_IMPOSTOR
// the leaf cards of every variant share one atlas; the per-variant samplers hold the wood
uniform sampler2D uEcosystemLeafColor;
uniform sampler2D uEcosystemLeafNormal;
uniform sampler2D uEcosystemLeafOrm;
#endif
#endif
varying vec3 vEcosystemWorld;
varying vec3 vEcosystemNormal;
varying vec3 vEcosystemTint;
varying vec4 vEcosystemFrame;
#ifdef LANDSCAPE_ECOSYSTEM_TEXTURED
varying vec2 vEcosystemUv;
varying vec4 vEcosystemTangent;
flat varying int vEcosystemVariant;
flat varying float vEcosystemPart;
#else
varying float vEcosystemShade;
#endif

#include <shaderlib:landscape/lighting_visibility>
#include <shaderlib:landscape/lighting>
#include <shaderlib:landscape/atmosphere>

float ecosystemDither(vec2 fragCoord, float phase) {
    int x = int(mod(fragCoord.x, 8.0)), y = int(mod(fragCoord.y, 8.0));
    return fract((ecosystemDitherMatrix[y * 8 + x] + 0.5) / 64.0 + phase);
}

#ifdef LANDSCAPE_ECOSYSTEM_TEXTURED
// the atlas texels of a surface: explicit gradients keep the mip selection defined inside the per-variant branches
void ecosystemTexels(int variant, bool leaf, vec2 uv, vec2 dx, vec2 dy, out vec4 texel, out vec3 normalTexel, out vec4 orm) {
#ifndef LANDSCAPE_ECOSYSTEM_IMPOSTOR
    if (leaf) { texel = textureGrad(uEcosystemLeafColor, uv, dx, dy); normalTexel = textureGrad(uEcosystemLeafNormal, uv, dx, dy).rgb; orm = textureGrad(uEcosystemLeafOrm, uv, dx, dy); }
    else
#endif
    if (variant == 0) { texel = textureGrad(uEcosystemColor0, uv, dx, dy); normalTexel = textureGrad(uEcosystemNormal0, uv, dx, dy).rgb; orm = textureGrad(uEcosystemOrm0, uv, dx, dy); }
#if LANDSCAPE_ECOSYSTEM_VARIANTS > 1
    else if (variant == 1) { texel = textureGrad(uEcosystemColor1, uv, dx, dy); normalTexel = textureGrad(uEcosystemNormal1, uv, dx, dy).rgb; orm = textureGrad(uEcosystemOrm1, uv, dx, dy); }
#endif
#if LANDSCAPE_ECOSYSTEM_VARIANTS > 2
    else if (variant == 2) { texel = textureGrad(uEcosystemColor2, uv, dx, dy); normalTexel = textureGrad(uEcosystemNormal2, uv, dx, dy).rgb; orm = textureGrad(uEcosystemOrm2, uv, dx, dy); }
#endif
    else { texel = vec4(1.0, 0.0, 1.0, 1.0); normalTexel = vec3(0.5, 0.5, 1.0); orm = vec4(1.0, 1.0, 0.0, 1.0); }
}
#endif

void main() {
#ifdef LANDSCAPE_ECOSYSTEM_TEXTURED
    vec2 dx = dFdx(vEcosystemUv), dy = dFdy(vEcosystemUv);
#endif
    float fade = vEcosystemFrame.x;
    if (fade < ecosystemDither(gl_FragCoord.xy, vEcosystemFrame.y)) discard;
    vec3 geometricNormal = normalize(vEcosystemNormal);
    vec3 albedo, n, response;
    float roughness, ao;
#ifdef LANDSCAPE_ECOSYSTEM_TEXTURED
    vec4 texel, orm;
    vec3 normalTexel;
    ecosystemTexels(vEcosystemVariant, vEcosystemPart > 0.5, vEcosystemUv, dx, dy, texel, normalTexel, orm);
    if (texel.a < 0.5) discard;
    if (!gl_FrontFacing) geometricNormal = -geometricNormal;
    vec3 tangent = normalize(vEcosystemTangent.xyz - geometricNormal * dot(geometricNormal, vEcosystemTangent.xyz)), bitangent = cross(geometricNormal, tangent) * vEcosystemTangent.w;
    vec3 mapped = normalTexel * 2.0 - 1.0;
    n = normalize(tangent * mapped.x + bitangent * mapped.y + geometricNormal * max(mapped.z, 0.05));
    albedo = texel.rgb; roughness = clamp(orm.g, 0.05, 1.0); ao = orm.r;
    response = vec3(LANDSCAPE_ECOSYSTEM_FOLIAGE_RESPONSE);
#else
    n = geometricNormal; albedo = vec3(LANDSCAPE_ECOSYSTEM_ROCK_ALBEDO); roughness = LANDSCAPE_ECOSYSTEM_ROCK_ROUGHNESS; ao = vEcosystemShade;
    response = vec3(LANDSCAPE_ECOSYSTEM_ROCK_RESPONSE);
#endif
    albedo *= vEcosystemTint;
    float contactBand = min(uEcosystemContact.y, 0.5 * vEcosystemFrame.w);
    ao *= 1.0 - uEcosystemContact.x * (1.0 - clamp(vEcosystemFrame.z / max(contactBand, 1.0e-3), 0.0, 1.0));
    vec3 origin, v;
    float viewDistance;
    landscapeViewRay(vEcosystemWorld, origin, v, viewDistance);
    vec3 color = landscapeReflectedRadiance(albedo, n, v, roughness, 0.0, ao, 1.0, response * uLandscapeResponse.x,
        landscapeAirLight(vEcosystemWorld, n, v, roughness, geometricNormal, vec3(LANDSCAPE_GROUND_ALBEDO)));
    LandscapeHaze haze = landscapeAerialPerspective(origin, vEcosystemWorld);
    color = color * haze.transmittance + haze.inscatter;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
#ifdef LANDSCAPE_ECOSYSTEM_DIAGNOSTICS
    if (uEcosystemDiagnostic > 0) {
        vec3 view = uEcosystemDiagnostic == 1 ? uEcosystemLodColor : uEcosystemDiagnostic == 2 ? uEcosystemLayerColor : uEcosystemDiagnostic == 3 ? vec3(vEcosystemFrame.y) : vec3(fade);
        gl_FragColor = vec4(view, 0.0);
    }
#endif
}
