// @section pars
attribute float grassCardVariant;
attribute vec4 grassCardSlot;
uniform vec4 grassViewCardShape;
uniform vec2 grassViewCardSpan;
varying vec2 vGrassCardUv;
varying vec3 vGrassCardRight;
// @section begin
// Bounded offsets preserve the separated roots; world hashes keep placement fixed.
vec4 grassCardCell = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
    grassCardCell = instanceMatrix * grassCardCell;
#endif
grassCardCell = modelMatrix * grassCardCell;
vec2 grassCardRoot = grassCardSlot.xy;
#ifdef GRASS_CARD_RANDOM_LAYOUT
    // Rotate/reflect the root pattern per world cell. Preserve its spacing while
    // breaking repeated rows; billboard orientation and leaf lighting stay separate.
    float grassLayout = floor(fract(sin(dot(grassCardCell.xz, vec2(43.13, 93.71))) * 28473.21) * 8.0);
    if (grassLayout >= 4.0) grassCardRoot = grassCardRoot.yx;
    grassCardRoot.x *= mod(grassLayout, 2.0) < 1.0 ? 1.0 : -1.0;
    grassCardRoot.y *= mod(floor(grassLayout * 0.5), 2.0) < 1.0 ? 1.0 : -1.0;
#endif
vec2 grassCardSlotWorld = grassCardCell.xz + grassCardRoot;
vec2 grassCellPhase = fract(sin(vec2(dot(grassCardSlotWorld, vec2(127.1, 311.7)),
    dot(grassCardSlotWorld, vec2(269.5, 183.3)))) * 43758.5453);
vec3 grassCardLocal = position;
grassCardLocal.xz = grassCardRoot + (grassCellPhase - 0.5) * grassCardSlot.zw;
vec4 grassCardCenter = vec4(grassCardLocal, 1.0);
#ifdef USE_INSTANCING
    grassCardCenter = instanceMatrix * grassCardCenter;
#endif
grassCardCenter = modelMatrix * grassCardCenter;
vec2 grassCardRandom = fract(sin(vec2(dot(grassCardCenter.xz, vec2(12.9898, 78.233)),
    dot(grassCardCenter.xz, vec2(39.3468, 11.135)))) * 43758.5453);
vec2 grassCardJitter = (grassCardRandom - 0.5) * (grassViewCardShape.x * 0.14);
float grassCardRow = mod(grassCardVariant + floor(grassCardRandom.x * 4.0), 4.0);
grassCardCenter.xz += grassCardJitter;
vec2 grassCardRay = cameraPosition.xz - grassCardCenter.xz;
// Vary yaw and footprint while retaining a camera-facing silhouette. The same
// basis is used for lighting, so the variation cannot rotate the captured light.
float grassCardAngle = atan(grassCardRay.x, grassCardRay.y) + (grassCardRandom.x - 0.5) * 1.1;
float grassCardWidthScale = 0.88 + grassCardRandom.y * 0.24;
float grassCardDepthScale = 0.9 + grassCardRandom.x * 0.2;
float grassCardHeightScale = 0.9 + grassCellPhase.x * 0.1;
float grassCardIndex = floor(grassCardRandom.y * 8.0);
vGrassCardRight = vec3(cos(grassCardAngle), 0.0, -sin(grassCardAngle));
vec2 grassCardTileUv = (vec2(4.0) + uv * vec2(504.0, 248.0)) / vec2(4096.0, 1024.0);
vGrassCardUv = grassCardTileUv + vec2(grassCardIndex / 8.0, grassCardRow / 4.0);
// Preserve a shallow volume instead of crushing a strip into a vertical billboard.
// Its projection matches the source capture and expands naturally when seen
// from above. Only bearing changes; the roots and total leaf height stay stable.
grassCardLocal.y *= grassCardHeightScale;
vec3 grassCardUp = vec3(-sin(grassCardAngle) * grassViewCardSpan.x * grassCardDepthScale, grassViewCardSpan.y * grassCardHeightScale, -cos(grassCardAngle) * grassViewCardSpan.x * grassCardDepthScale);
vec3 transformed = grassCardLocal + vec3(grassCardJitter.x, 0.0, grassCardJitter.y) + vGrassCardRight * ((uv.x - 0.5) * grassViewCardShape.x * grassCardWidthScale)
    + grassCardUp * (uv.y - 0.5);
