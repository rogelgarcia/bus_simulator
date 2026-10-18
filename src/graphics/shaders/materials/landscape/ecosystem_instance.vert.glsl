// AI 599 D4 ecosystem instance vertex program (landscape-ecosystem-runtime-v1): one draw per (tile, LOD) over the rank-sorted ecosystem-instance-v1
// records bound as an interleaved instance buffer. The instance frame is a yaw about the up axis mixed between the world up and the ground normal by
// the layer's slope weight, sunk by the alignment, at the record's scale; the LOD band fade follows the camera distance to the anchor (the fragment
// program dithers by it) and a vertex outside its instance's variant, or faded out, collapses behind the far plane. The impostor variant builds the
// camera-facing card of the distant vegetation catalog in the shader: the view is the nearest azimuth tile and elevation row of the camera direction
// in the instance frame, the card hangs from the projected root point of that view, and its atlas rectangle gives the texture coordinates.
attribute vec3 instanceAnchor;
attribute float instanceScale;
attribute vec2 instanceNormal;
attribute float instanceYaw;
attribute float instanceVariant;
attribute float instanceRank;
attribute vec3 instanceTint;
#ifndef LANDSCAPE_ECOSYSTEM_IMPOSTOR
// the merged asset geometry carries every variant; a vertex draws only for instances of its own variant
attribute float variant;
#endif
#ifdef LANDSCAPE_ECOSYSTEM_TEXTURED
attribute vec4 tangent;
#ifndef LANDSCAPE_ECOSYSTEM_IMPOSTOR
attribute float part;
#endif
#else
attribute float rockShade;
#endif
// fade-in start, fade-in end, fade-out start, fade-out end: metres from the camera
uniform vec4 uEcosystemBand;
// asset height (metres), sink metres, whether the sink scales with the instance (1) or not (0), slope weight of the up axis
uniform vec4 uEcosystemAsset;
// direction x, direction z, strength (metres of sway at the top of the asset), time (seconds)
uniform vec4 uEcosystemWind;
#ifdef LANDSCAPE_ECOSYSTEM_IMPOSTOR
// per variant and view: the atlas rectangle (u0, v0, u1, v1) and the card frame (width, height, root offset along the card's right and up)
uniform vec4 uEcosystemImpostorViews[LANDSCAPE_ECOSYSTEM_IMPOSTOR_TABLE];
uniform vec4 uEcosystemImpostorFrames[LANDSCAPE_ECOSYSTEM_IMPOSTOR_TABLE];
// per variant: the bounds centre (y up) the facing direction aims at and the pivot height of the root point
uniform vec4 uEcosystemImpostorVariant[LANDSCAPE_ECOSYSTEM_VARIANTS];
#endif
varying vec3 vEcosystemWorld;
varying vec3 vEcosystemNormal;
varying vec3 vEcosystemTint;
// fade, rank, height above the instance base (metres), instance height (metres)
varying vec4 vEcosystemFrame;
#ifdef LANDSCAPE_ECOSYSTEM_TEXTURED
varying vec2 vEcosystemUv;
varying vec4 vEcosystemTangent;
flat varying int vEcosystemVariant;
flat varying float vEcosystemPart;
#else
varying float vEcosystemShade;
#endif

#ifdef LANDSCAPE_ECOSYSTEM_IMPOSTOR
// the view index of a facing direction in the instance frame: nearest azimuth tile (wrapping) in the nearest elevation row
int ecosystemImpostorView(vec3 facing) {
    float azimuth = degrees(atan(-facing.z, facing.x)), elevation = degrees(asin(clamp(facing.y, -1.0, 1.0)));
    int tile = int(mod(floor((azimuth - LANDSCAPE_ECOSYSTEM_IMPOSTOR_AZIMUTH_START) / LANDSCAPE_ECOSYSTEM_IMPOSTOR_AZIMUTH_STEP + 0.5), 8.0));
    int row = abs(elevation - LANDSCAPE_ECOSYSTEM_IMPOSTOR_ELEVATION_0) <= abs(elevation - LANDSCAPE_ECOSYSTEM_IMPOSTOR_ELEVATION_1) ? 0 : 1;
    return row * 8 + tile;
}
#endif

void main() {
    vec3 groundNormal = vec3(instanceNormal.x, sqrt(max(0.0, 1.0 - dot(instanceNormal, instanceNormal))), instanceNormal.y);
    vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), groundNormal, uEcosystemAsset.w));
    // a right-handed frame (east x up = north = +Z): a mirrored basis would flip the winding and show the rocks inside out
    vec3 east = normalize(vec3(1.0, 0.0, 0.0) - up * up.x);
    vec3 north = cross(east, up);
    float c = cos(instanceYaw), s = sin(instanceYaw);
    vec3 axisX = east * c - north * s, axisZ = east * s + north * c;
    float sink = uEcosystemAsset.y * mix(1.0, instanceScale, uEcosystemAsset.z);
    vec3 origin = instanceAnchor - up * sink;
    float cameraDistance = length(cameraPosition - instanceAnchor);
    float fade = clamp((cameraDistance - uEcosystemBand.x) / max(uEcosystemBand.y - uEcosystemBand.x, 1.0e-6), 0.0, 1.0)
        * clamp((uEcosystemBand.w - cameraDistance) / max(uEcosystemBand.w - uEcosystemBand.z, 1.0e-6), 0.0, 1.0);
    vec3 local = position, localNormal = normal;
    bool drawn = fade > 0.0;
#ifdef LANDSCAPE_ECOSYSTEM_IMPOSTOR
    int variantIndex = int(instanceVariant + 0.5);
    vec4 shape = uEcosystemImpostorVariant[variantIndex];
    vec3 toCamera = cameraPosition - origin;
    vec3 cameraLocal = vec3(dot(toCamera, axisX), dot(toCamera, up), dot(toCamera, axisZ)) / instanceScale;
    vec3 facing = normalize(cameraLocal - shape.xyz);
    if (abs(facing.y) > 0.999) facing = normalize(vec3(facing.x == 0.0 ? 0.001 : facing.x, facing.y, facing.z));
    int view = variantIndex * 16 + ecosystemImpostorView(facing);
    vec4 rect = uEcosystemImpostorViews[view], frame = uEcosystemImpostorFrames[view];
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), facing)), cardUp = normalize(cross(facing, right));
    float cornerX = position.x > 0.0 ? 1.0 : -1.0, cornerY = position.y > 0.5 ? 1.0 : -1.0;
    local = vec3(0.0, shape.w, 0.0) - right * frame.z - cardUp * frame.w + right * (cornerX * frame.x * 0.5) + cardUp * (cornerY * frame.y * 0.5);
    localNormal = facing;
    vec4 localTangent = vec4(right, 1.0);
    vEcosystemUv = vec2(cornerX > 0.0 ? rect.z : rect.x, 1.0 - (cornerY > 0.0 ? rect.w : rect.y));
#else
    drawn = drawn && abs(variant - instanceVariant) < 0.5;
#ifdef LANDSCAPE_ECOSYSTEM_TEXTURED
    vec4 localTangent = tangent;
    vEcosystemUv = uv;
#endif
#endif
    float localHeight = max(local.y, 0.0) * instanceScale, instanceHeight = uEcosystemAsset.x * instanceScale;
    float heightFraction = clamp(localHeight / max(instanceHeight, 1.0e-3), 0.0, 1.0);
    float sway = uEcosystemWind.z * heightFraction * heightFraction * sin(uEcosystemWind.w * LANDSCAPE_ECOSYSTEM_WIND_FREQUENCY + instanceAnchor.x * 0.37 + instanceAnchor.z * 0.23) * instanceScale;
    vec3 world = origin + (axisX * local.x + up * local.y + axisZ * local.z) * instanceScale + vec3(uEcosystemWind.x, 0.0, uEcosystemWind.y) * sway;
    vEcosystemWorld = world;
    vEcosystemNormal = normalize(axisX * localNormal.x + up * localNormal.y + axisZ * localNormal.z);
    vEcosystemTint = instanceTint;
    vEcosystemFrame = vec4(fade, instanceRank, localHeight, instanceHeight);
#ifdef LANDSCAPE_ECOSYSTEM_TEXTURED
    vEcosystemTangent = vec4(normalize(axisX * localTangent.x + up * localTangent.y + axisZ * localTangent.z), localTangent.w);
    vEcosystemVariant = int(instanceVariant + 0.5);
#ifdef LANDSCAPE_ECOSYSTEM_IMPOSTOR
    vEcosystemPart = 0.0;
#else
    vEcosystemPart = part;
#endif
#else
    vEcosystemShade = rockShade;
#endif
    gl_Position = drawn ? projectionMatrix * viewMatrix * vec4(world, 1.0) : vec4(0.0, 0.0, 2.0, 1.0);
}
