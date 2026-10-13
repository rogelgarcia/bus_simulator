uniform sampler2D grassRuntimeStaticVisibility;
uniform vec4 grassRuntimeStaticBounds;
float grassRuntimeStaticShadow(vec2 world) {
    vec2 uv = vec2(world.x - grassRuntimeStaticBounds.x, grassRuntimeStaticBounds.y - world.y) * grassRuntimeStaticBounds.zw;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
    return texture2D(grassRuntimeStaticVisibility, uv).r;
}
