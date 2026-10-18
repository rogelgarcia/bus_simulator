attribute float parentHeight;
attribute vec3 parentNormal;
uniform float uMorph;
uniform vec4 uEdges;
uniform vec4 uEdgeMorph;
uniform vec4 uBounds;
uniform vec3 uSoilPalette[6];
uniform vec3 uSoilPaletteResponse[6];
uniform vec2 uSoilPaletteSurface[6];
uniform float uSoilPaletteMode;
varying vec3 vLandscapeColor;
varying vec3 vLandscapeNormal;
varying vec3 vLandscapeWorld;
varying vec3 vLandscapeResponse;
varying vec2 vLandscapeSurface;

// AI 596 D5: a stream in soil-palette mode (the render-only surround) carries each vertex's display soil index in the red byte of its colour and takes
// its fallback surface from the stream's palette cells: the colour (the loaded appearance's mean corrected albedo per soil, or the land-cover
// catalog), the soil's natural-ground response (EON diffuse roughness, specular shadowing weight, opposition amplitude) and its mean roughness and
// ambient occlusion, so the fallback path shades it as the appearance path shades the authoritative tiles. Every other stream carries the catalog
// colour in the attribute itself and keeps the plain fallback (no response, roughness 0.9, no occlusion)
void landscapeFallbackSurface(vec3 vertexColor) {
    if (uSoilPaletteMode > 0.5) {
        int soil = clamp(int(vertexColor.r * 255.0 + 0.5), 0, 5);
        vLandscapeColor = uSoilPalette[soil];
        vLandscapeResponse = uSoilPaletteResponse[soil];
        vLandscapeSurface = uSoilPaletteSurface[soil];
    } else {
        vLandscapeColor = vertexColor;
        vLandscapeResponse = vec3(0.0);
        vLandscapeSurface = vec2(0.9, 1.0);
    }
}

void main() {
#ifdef LANDSCAPE_SURFACE_CACHE_GENERATION
    // AI577 D6 surface cache generation draws each tile's own surface (no LOD morph or coarser-edge heights); pages over a morphing tile wait. Tile
    // positions are world positions, and each draw's model matrix is its page block's world-to-clip mapping (one camera serves every block)
    vec3 transformed = position;
    vLandscapeNormal = normalize(normal);
    landscapeFallbackSurface(color);
    vLandscapeWorld = transformed;
    gl_Position = modelMatrix * vec4(transformed, 1.0);
#else
    float morph = uMorph;
    if (abs(position.x - uBounds.x) < 0.002) morph = uEdges.x > 0.5 ? 0.0 : min(morph, uEdgeMorph.x);
    if (abs(position.x - uBounds.y) < 0.002) morph = uEdges.y > 0.5 ? 0.0 : min(morph, uEdgeMorph.y);
    if (abs(position.z - uBounds.z) < 0.002) morph = uEdges.z > 0.5 ? 0.0 : min(morph, uEdgeMorph.z);
    if (abs(position.z - uBounds.w) < 0.002) morph = uEdges.w > 0.5 ? 0.0 : min(morph, uEdgeMorph.w);
    vec3 transformed = vec3(position.x, mix(parentHeight, position.y, morph), position.z);
    vLandscapeNormal = normalize(mix(parentNormal, normal, morph));
    landscapeFallbackSurface(color);
    vLandscapeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
#endif
}
