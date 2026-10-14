// AI 597 D5 final pass of the landscape frame (landscape-frame-pipeline-v1): the linear frame target tone-mapped and encoded for the canvas
// (three.js's toneMapping and output transfer, the ones every material used to apply itself when it drew to the canvas), with an edge filter on
// the encoded taps in place of the canvas multisampling the target has no room for (FXAA 3.11 console, Timothy Lottes 2009: the luma of the
// four half-texel diagonals finds the edge direction, two taps along it and two further out are averaged, the far pair rejected when it
// leaves the local luma range). Below the edge threshold the centre tap passes unfiltered. A pixel with alpha 0 is a verification view's
// (the ocean draws its debug views opaque with alpha 0 and display-ready values): it passes through untouched.
uniform sampler2D uFrame;
uniform vec2 uFrameTexel;       // 1 / frame size
uniform float uFrameSharpness;  // console sharpness (8: the far taps stop at 2 texels along the shallower axis)
uniform vec2 uFrameEdge;        // x edge threshold relative to the local maximum luma, y absolute edge threshold minimum
varying vec2 vOceanUv;

vec3 frameDisplay(vec2 uv) {
    vec3 color = texture(uFrame, uv).rgb;
#ifdef TONE_MAPPING
    color = toneMapping(color);
#endif
    return linearToOutputTexel(vec4(color, 1.0)).rgb;
}

float frameLuma(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec2 uv = vOceanUv, texel = uFrameTexel;
    // alpha 0 marks a verification view's pixel (the ocean draws it opaque with its display-ready value): through untouched
    vec4 raw = texture(uFrame, uv);
    if (raw.a < 0.5) { gl_FragColor = vec4(raw.rgb, 1.0); return; }
    vec3 centre = frameDisplay(uv);
    vec3 nw = frameDisplay(uv + vec2(-0.5, -0.5) * texel), ne = frameDisplay(uv + vec2(0.5, -0.5) * texel);
    vec3 sw = frameDisplay(uv + vec2(-0.5, 0.5) * texel), se = frameDisplay(uv + vec2(0.5, 0.5) * texel);
    float lumaM = frameLuma(centre), lumaNw = frameLuma(nw), lumaNe = frameLuma(ne) + 1.0 / 384.0, lumaSw = frameLuma(sw), lumaSe = frameLuma(se);
    float lumaMin = min(min(lumaNw, lumaNe), min(lumaSw, lumaSe)), lumaMax = max(max(lumaNw, lumaNe), max(lumaSw, lumaSe));
    float range = max(lumaMax, lumaM) - min(lumaMin, lumaM);
    if (range < max(uFrameEdge.y, max(lumaMax, lumaM) * uFrameEdge.x)) { gl_FragColor = vec4(centre, 1.0); return; }
    float swMinusNe = lumaSw - lumaNe, seMinusNw = lumaSe - lumaNw;
    vec2 direction = vec2(swMinusNe + seMinusNw, swMinusNe - seMinusNw);
    if (dot(direction, direction) < 1.0e-10) { gl_FragColor = vec4(centre, 1.0); return; }
    vec2 near = normalize(direction);
    vec3 nearA = frameDisplay(uv - near * texel * 0.5), nearB = frameDisplay(uv + near * texel * 0.5);
    float shallow = min(abs(near.x), abs(near.y)) * uFrameSharpness;
    vec2 far = clamp(near / max(shallow, 1.0e-4), -2.0, 2.0);
    vec3 farA = frameDisplay(uv - far * texel * 2.0), farB = frameDisplay(uv + far * texel * 2.0);
    vec3 pair = nearA + nearB, blended = (farA + farB) * 0.25 + pair * 0.25;
    float lumaBlended = frameLuma(blended);
    gl_FragColor = vec4((lumaBlended < lumaMin || lumaBlended > lumaMax) ? pair * 0.5 : blended, 1.0);
}
