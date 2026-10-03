// Atlas projection must not change the derivatives used for source normal mapping.
#define NORMAL
attribute vec3 grassPlatePosition;
varying vec3 vViewPosition;
#include <common>
#include <uv_pars_vertex>
#include <normal_pars_vertex>
void main() {
    #include <uv_vertex>
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <normal_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    vViewPosition = -(modelViewMatrix * vec4(grassPlatePosition, 1.0)).xyz;
}
