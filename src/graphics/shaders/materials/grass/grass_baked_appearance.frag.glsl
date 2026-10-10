// @section pars
varying vec2 vBakedGrassWorld;
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
        vec2 bakedGrassDx = dFdx(bakedGrassUv), bakedGrassDy = dFdy(bakedGrassUv);
        vec2 bakedGrassTile = floor(bakedGrassUv);
        vec4 bakedGrassTexel;
        if (mod(bakedGrassTile.x + bakedGrassTile.y, 2.0) >= 1.0)
            bakedGrassTexel = textureGrad(bakedGrassAlternate, bakedGrassUv, bakedGrassDx, bakedGrassDy);
        else bakedGrassTexel = textureGrad(map, bakedGrassUv, bakedGrassDx, bakedGrassDy);
        diffuseColor *= bakedGrassTexel;
    #else
        #include <map_fragment>
    #endif
#endif
// @section shade
vec2 bakedGrassShadowUv = vec2(vBakedGrassWorld.x - bakedGrassShadowBounds.x,
    bakedGrassShadowBounds.y - vBakedGrassWorld.y) * bakedGrassShadowBounds.zw;
float bakedGrassInside = step(0.0, bakedGrassShadowUv.x) * step(bakedGrassShadowUv.x, 1.0)
    * step(0.0, bakedGrassShadowUv.y) * step(bakedGrassShadowUv.y, 1.0);
float bakedGrassShadow = texture2D(bakedGrassVisibility, bakedGrassShadowUv).r;
outgoingLight *= bakedGrassBrightness * mix(1.0, mix(0.35, 1.0, bakedGrassShadow), bakedGrassShadowStrength * bakedGrassInside);
