uniform sampler2D tDepth;
uniform vec2 uCursorUv;
uniform mat4 uProjectionInverse;
uniform vec2 uDepthRange;

void main() {
    float depth = texture2D(tDepth, uCursorUv).r;
    if (depth >= 1.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    vec3 ray = (uProjectionInverse * vec4(uCursorUv * 2.0 - 1.0, 1.0, 1.0)).xyz;
    float viewDepth = uDepthRange.x * uDepthRange.y / (uDepthRange.x + (uDepthRange.y - uDepthRange.x) * (1.0 - depth));
    float millimeters = floor(viewDepth * length(ray) / abs(ray.z) * 1000.0 + 0.5);
    vec3 bytes = vec3(mod(millimeters, 256.0), mod(floor(millimeters / 256.0), 256.0), floor(millimeters / 65536.0));
    gl_FragColor = vec4(bytes / 255.0, 1.0);
}
