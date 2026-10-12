// AI 597 D4 swash sheet vertex program: the native beach samples of the swash band (position x and z are grid columns and rows, y the height
// in millimetres, so the film front, a height contour of the sand, never steps by the quantisation) placed on the sand, lifted by the sheet's clearance plus a little per metre of distance so the far part never fights the
// coarser terrain levels for depth.
uniform vec4 uOceanSwashGrid;   // min x, min z, spacing x, spacing z of the native grid
uniform float uOceanSwashLift;  // clearance above the sand (m)
uniform float uOceanLevel;      // sea level
varying vec3 vOceanWorld;
varying vec2 vOceanPlane;
varying float vOceanHeight;     // height above sea level of the sand

void main() {
    vec2 xz = uOceanSwashGrid.xy + position.xz * uOceanSwashGrid.zw;
    float sand = position.y * 0.001;
    float lift = uOceanSwashLift + 0.002 * distance(cameraPosition, vec3(xz.x, sand, xz.y));
    vOceanWorld = vec3(xz.x, sand + lift, xz.y);
    vOceanPlane = xz;
    vOceanHeight = sand - uOceanLevel;
    gl_Position = projectionMatrix * viewMatrix * vec4(vOceanWorld, 1.0);
}
