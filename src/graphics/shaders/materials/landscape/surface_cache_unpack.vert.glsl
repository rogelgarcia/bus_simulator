// AI577 D6 surface cache unpack: one clip-space triangle per atlas slot viewport. The page camera's projection matrix carries the slot's scratch
// origin (elements 12, 13) and its atlas origin (elements 14, 15) in texels, read as flat values by the fragment stage.
flat out vec4 vSurfaceCacheOrigins;

void main() {
    vSurfaceCacheOrigins = vec4(projectionMatrix[3][0], projectionMatrix[3][1], projectionMatrix[3][2], projectionMatrix[3][3]);
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
