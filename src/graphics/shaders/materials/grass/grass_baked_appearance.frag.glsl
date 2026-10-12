// @section pars
varying vec2 vBakedGrassWorld;
#ifdef BAKED_GRASS_TILE_VARIATION
varying vec3 vBakedGrassTile;
#endif
#ifdef BAKED_GRASS_CANOPY_VIEW
varying vec3 vBakedGrassCanopyColor;
#endif
uniform sampler2D bakedGrassVisibility;
uniform vec4 bakedGrassShadowBounds;
uniform float bakedGrassShadowStrength;
uniform float bakedGrassBrightness;
#ifdef GRASS_RIBBON_CARD
    varying vec2 vGrassCardUv;
#endif
#ifdef BAKED_GRASS_PAIR
    uniform sampler2D bakedGrassAlternate;
#endif
// @section map
#ifdef USE_MAP
    #ifdef BAKED_GRASS_PAIR
        vec2 bakedGrassUv = vBakedGrassWorld * vec2(0.5, -0.5);
        #ifdef BAKED_GRASS_TILE_VARIATION
        bakedGrassUv = vBakedGrassTile.xy;
        #endif
        vec2 bakedGrassDx = dFdx(bakedGrassUv), bakedGrassDy = dFdy(bakedGrassUv);
        vec2 bakedGrassTile = floor(bakedGrassUv);
        vec4 bakedGrassTexel;
        #ifdef BAKED_GRASS_TILE_VARIATION
        if (vBakedGrassTile.z > 0.5)
        #else
        if (mod(bakedGrassTile.x + bakedGrassTile.y, 2.0) >= 1.0)
        #endif
            bakedGrassTexel = textureGrad(bakedGrassAlternate, bakedGrassUv, bakedGrassDx, bakedGrassDy);
        else bakedGrassTexel = textureGrad(map, bakedGrassUv, bakedGrassDx, bakedGrassDy);
        diffuseColor *= bakedGrassTexel;
    #else
        #include <map_fragment>
    #endif
#endif
// @section shade
#ifdef BAKED_GRASS_CANOPY_VIEW
outgoingLight *= vBakedGrassCanopyColor;
#endif
vec2 bakedGrassShadowUv = vec2(vBakedGrassWorld.x - bakedGrassShadowBounds.x,
    bakedGrassShadowBounds.y - vBakedGrassWorld.y) * bakedGrassShadowBounds.zw;
float bakedGrassInside = step(0.0, bakedGrassShadowUv.x) * step(bakedGrassShadowUv.x, 1.0)
    * step(0.0, bakedGrassShadowUv.y) * step(bakedGrassShadowUv.y, 1.0);
float bakedGrassShadow = texture2D(bakedGrassVisibility, bakedGrassShadowUv).r;
#ifdef BAKED_GRASS_STATIC_SHADOWS
bakedGrassShadow = min(mix(1.0, bakedGrassShadow, bakedGrassInside), grassRuntimeStaticShadow(vBakedGrassWorld));
bakedGrassInside = 1.0;
#endif
outgoingLight *= bakedGrassBrightness * mix(1.0, mix(0.35, 1.0, bakedGrassShadow), bakedGrassShadowStrength * bakedGrassInside);
