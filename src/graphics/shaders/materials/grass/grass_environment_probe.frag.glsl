#include <common>
uniform sampler2D envMap;
#include <cube_uv_reflection_fragment>
void main() {
    float face = floor(gl_FragCoord.x);
    vec3 direction = face < 1.0 ? vec3(1,0,0) : face < 2.0 ? vec3(-1,0,0) :
        face < 3.0 ? vec3(0,1,0) : face < 4.0 ? vec3(0,-1,0) :
        face < 5.0 ? vec3(0,0,1) : vec3(0,0,-1);
    gl_FragColor = vec4(textureCubeUV(envMap, direction, 1.0).rgb, 1.0);
}
