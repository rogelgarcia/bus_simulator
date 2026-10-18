// AI 596 landscape-geology v1 decode mirror (contract and JavaScript mirror: src/app/landscape/LandscapeGeology.js, decodeLandscapeGeology and
// decodeLandscapeGeologyCategory). No program includes this chunk yet: the geology pages are published offline beside the terrain
// (geology/manifest.json) and a later prompt binds them to samplers; the chunk fixes the decode so GLSL and JavaScript agree before
// anything renders, and a Node test keeps every constant equal to the channel and category catalogs. It declares no uniforms.
// Field pages: two RGBA8 layers on the mask-aligned page grid with the two-sample halo, linear filtering on encoded bytes, decode after
// filtering (value = texel * scale). Categorical pages: one uint8 label per aligned sample without halo, nearest filtering only.
#define LANDSCAPE_GEOLOGY 1

const float LANDSCAPE_GEOLOGY_BEDROCK_OFFSET_SCALE = 32.0;
const float LANDSCAPE_GEOLOGY_REGOLITH_SCALE = 8.0;
const float LANDSCAPE_GEOLOGY_DEPOSIT_THICKNESS_SCALE = 30.0;
const float LANDSCAPE_GEOLOGY_WEAR_SCALE = 1.0;
const float LANDSCAPE_GEOLOGY_DEPOSITION_SCALE = 1.0;
const float LANDSCAPE_GEOLOGY_FLOW_SCALE = 1.0;
const float LANDSCAPE_GEOLOGY_WAVE_EXPOSURE_SCALE = 1.0;
const float LANDSCAPE_GEOLOGY_FACE_MASK_SCALE = 1.0;

// categorical page layers (layer k of the uint8 page)
const int LANDSCAPE_GEOLOGY_LAYER_DEPOSIT_TYPE = 0;
const int LANDSCAPE_GEOLOGY_LAYER_LITHOLOGY = 1;
const int LANDSCAPE_GEOLOGY_LAYER_DRAINAGE = 2;
const int LANDSCAPE_GEOLOGY_LAYER_COASTAL_ZONE = 3;

const int LANDSCAPE_GEOLOGY_DEPOSIT_TYPE_NONE = 0;
const int LANDSCAPE_GEOLOGY_DEPOSIT_TYPE_TALUS = 1;
const int LANDSCAPE_GEOLOGY_DEPOSIT_TYPE_COLLUVIUM = 2;
const int LANDSCAPE_GEOLOGY_DEPOSIT_TYPE_ALLUVIUM = 3;
const int LANDSCAPE_GEOLOGY_DEPOSIT_TYPE_BEACH_SAND = 4;
const int LANDSCAPE_GEOLOGY_DEPOSIT_TYPE_DUNE_SAND = 5;
const int LANDSCAPE_GEOLOGY_DEPOSIT_TYPE_REEF_ROCK = 6;

const int LANDSCAPE_GEOLOGY_DRAINAGE_HILLSLOPE = 0;
const int LANDSCAPE_GEOLOGY_DRAINAGE_RILL = 1;
const int LANDSCAPE_GEOLOGY_DRAINAGE_GULLY = 2;
const int LANDSCAPE_GEOLOGY_DRAINAGE_CHANNEL = 3;
const int LANDSCAPE_GEOLOGY_DRAINAGE_FLAT_POND = 4;
const int LANDSCAPE_GEOLOGY_DRAINAGE_SEA = 5;

const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_INLAND = 0;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_OFFSHORE = 1;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_REEF = 2;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_BAR = 3;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_SURF = 4;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_SWASH = 5;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_BERM = 6;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_BACKSHORE = 7;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_FOREDUNE = 8;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_PLATFORM = 9;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_BLUFF_TOE = 10;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_BLUFF_FACE = 11;
const int LANDSCAPE_GEOLOGY_COASTAL_ZONE_BLUFF_CROWN = 12;

struct LandscapeGeology {
    float bedrockOffset;    // meters of regolith and deposit above the bedrock surface (height - bedrock), saturating at the scale
    float regolith;         // meters of weathered in-place mantle
    float depositThickness; // meters of the dominant loose deposit
    float wear;             // normalized cumulative fluvial and hydraulic erosion depth
    float deposition;       // normalized cumulative sediment deposition
    float flow;             // normalized log specific catchment area of the final surface
    float waveExposure;     // exposure of the shore to the open-sea fetch
    float faceMask;         // share of the slope beyond what the heightfield represents faithfully
};

LandscapeGeology landscapeGeologyNone() {
    return LandscapeGeology(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
}

// decode after filtering, exactly as decodeLandscapeGeology: layer 0 = (bedrockOffset, regolith, depositThickness, wear), layer 1 = (deposition, flow, waveExposure, faceMask)
LandscapeGeology landscapeGeologyDecode(vec4 l0, vec4 l1) {
    return LandscapeGeology(l0.r * LANDSCAPE_GEOLOGY_BEDROCK_OFFSET_SCALE, l0.g * LANDSCAPE_GEOLOGY_REGOLITH_SCALE, l0.b * LANDSCAPE_GEOLOGY_DEPOSIT_THICKNESS_SCALE, l0.a * LANDSCAPE_GEOLOGY_WEAR_SCALE,
        l1.r * LANDSCAPE_GEOLOGY_DEPOSITION_SCALE, l1.g * LANDSCAPE_GEOLOGY_FLOW_SCALE, l1.b * LANDSCAPE_GEOLOGY_WAVE_EXPOSURE_SCALE, l1.a * LANDSCAPE_GEOLOGY_FACE_MASK_SCALE);
}

// label of a nearest-filtered UNORM8 categorical texel (an integer sampler needs no decode), exactly as decodeLandscapeGeologyCategory
int landscapeGeologyCategory(float texel) {
    return int(floor(texel * 255.0 + 0.5));
}
