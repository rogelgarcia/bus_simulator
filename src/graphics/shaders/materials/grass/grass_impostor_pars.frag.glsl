uniform sampler2D grassImpostorAlbedo;
uniform sampler2D grassImpostorNormal;
uniform sampler2D grassImpostorSurface;
uniform sampler2D grassImpostorDepth;
uniform mat4 grassImpostorViewProjection;
uniform mat4 grassImpostorInverseViewProjection;
uniform mat4 projectionMatrix;
uniform vec3 grassImpostorForward;
uniform float grassImpostorResolution;
uniform sampler2D grassCanopyShadowVisibility;
uniform vec4 grassCanopyShadowBounds;
uniform int grassCanopyShadowPass;
varying vec3 vGrassImpostorOrigin;
varying vec3 vGrassImpostorProxy;
float grassCardBlade;
float grassCardTransmission;
#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    uniform mat4 directionalShadowMatrix[NUM_DIR_LIGHT_SHADOWS];
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
    uniform mat4 spotLightMatrix[NUM_SPOT_LIGHT_COORDS];
#endif
#if defined(USE_SHADOWMAP) && NUM_POINT_LIGHT_SHADOWS > 0
    uniform mat4 pointShadowMatrix[NUM_POINT_LIGHT_SHADOWS];
#endif

vec2 grassImpostorProject(vec3 position) {
    vec4 clip = grassImpostorViewProjection * vec4(position, 1.0);
    return clip.xy / clip.w * 0.5 + 0.5;
}

vec3 grassImpostorUnproject(vec2 uv, float depth) {
    vec4 point = grassImpostorInverseViewProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return point.xyz / point.w;
}

bool grassImpostorInside(vec2 uv) {
    return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
}
