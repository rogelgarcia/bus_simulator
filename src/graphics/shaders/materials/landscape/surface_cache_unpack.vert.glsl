// AI577 D6 surface cache unpack: one quad per page over its destination slot, all pages of an atlas layer and level in one draw. Each vertex carries
// the quad corner in clip space of the target and the page's scratch origin (xy) and slot origin (zw) in texels, read as flat values by the fragment stage.
attribute vec4 aSurfaceCacheOrigins;
flat out vec4 vSurfaceCacheOrigins;

void main() {
    vSurfaceCacheOrigins = aSurfaceCacheOrigins;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
